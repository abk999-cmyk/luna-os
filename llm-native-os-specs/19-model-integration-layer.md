# Document 19: Model Integration Layer

## Overview

The Model Integration Layer abstracts all LLM interactions in the OS, enabling:
- **Multi-model support**: Different models at different hierarchy levels
- **Provider independence**: OpenAI, Anthropic, local models, etc.
- **Cost optimization**: Cheaper models for simpler tasks, capable models for complex orchestration
- **Context efficiency**: Dynamic context window budgeting across the system
- **Latency management**: Streaming, timeouts, and budget-aware invocation
- **State preservation**: Model switching without losing agent state

This layer sits between the Conductor/Orchestrators/Leaf Agents and external LLM providers.

---

## Architecture

### Model Abstraction Layer

All LLM calls funnel through a standardized interface:

```
User Message
    ↓
Agent (Conductor/Orchestrator/Leaf)
    ↓
Model Router (determine which model/provider)
    ↓
Model Abstraction Interface
    ├── Request Normalizer (format-agnostic)
    ├── Context Window Manager
    ├── Streaming Handler
    └── Response Parser
    ↓
Provider-Specific Adapter
    ├── OpenAI Adapter (GPT-4, GPT-4o, o1)
    ├── Anthropic Adapter (Claude 3.5 Sonnet, Opus, Haiku)
    ├── Local Model Adapter (Ollama, LM Studio, vLLM)
    ├── Google Adapter (Gemini)
    └── Custom Provider Adapter
    ↓
External LLM Service
```

### Model Hierarchy

```
Conductor Level
├── Primary: Claude 3.5 Sonnet (reasoning, planning, 200k context)
├── Fallback: GPT-4o (capable reasoning, 128k context)
└── Emergency: Claude 3 Haiku (basic orchestration)

Workspace Orchestrator Level
├── Primary: Claude 3.5 Sonnet (strong reasoning)
├── Alternative: GPT-4o (faster, adequate for most tasks)
└── Fallback: Claude 3 Opus (deep reasoning if needed)

Leaf Agent Level (per domain)
├── Code Synthesis: GPT-4o with code context (good at code)
├── Text Generation: Claude 3.5 Sonnet (strong prose)
├── Research: Claude 3 Opus (deep context window)
├── UI/UX: Gemini 2.0 Flash (multimodal, fast)
├── Data Analysis: Local Llama 3 (privacy, latency)
└── Fast Decisions: Haiku (2-3 token response latency)
```

**Rationale**:
- Conductor needs **broad reasoning and planning** → highest capability model
- Orchestrators need **good reasoning with acceptable latency** → strong but balanced
- Leaf agents can be **specialized and smaller** → domain-specific, cost-optimized

---

## Model Configuration System

### Configuration File Structure

```yaml
# ~/.llm-native-os/models.yaml

# Global defaults
defaults:
  timeout_seconds: 30
  max_retries: 2
  streaming: true
  context_window_budget: 0.75  # Use 75% of max context

# Provider credentials
providers:
  openai:
    api_key: ${OPENAI_API_KEY}
    base_url: https://api.openai.com/v1

  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
    base_url: https://api.anthropic.com

  local:
    base_url: http://localhost:11434  # Ollama

  google:
    api_key: ${GOOGLE_API_KEY}

# Model assignments by hierarchy level
hierarchy:
  # Conductor (OS-level orchestration)
  conductor:
    primary:
      provider: anthropic
      model: claude-3-5-sonnet-20241022
      temperature: 0.5
      max_tokens: 4096
      context_budget: 200000  # Use 200k of available context

    fallback:
      provider: openai
      model: gpt-4o
      temperature: 0.5
      max_tokens: 2048
      context_budget: 128000

  # Workspace Orchestrators
  workspace_orchestrator:
    primary:
      provider: anthropic
      model: claude-3-5-sonnet-20241022
      temperature: 0.3
      max_tokens: 2048
      context_budget: 150000

    fallback:
      provider: openai
      model: gpt-4-turbo
      temperature: 0.3
      max_tokens: 1024
      context_budget: 128000

  # Leaf agents by type
  leaf_agents:
    code_synthesis:
      provider: openai
      model: gpt-4o
      temperature: 0.2
      max_tokens: 4096
      context_budget: 100000

    text_generation:
      provider: anthropic
      model: claude-3-5-sonnet-20241022
      temperature: 0.7
      max_tokens: 2048
      context_budget: 80000

    research:
      provider: anthropic
      model: claude-3-opus-20250219
      temperature: 0.3
      max_tokens: 3000
      context_budget: 200000  # Deep context for research

    ui_design:
      provider: google
      model: gemini-2-flash
      temperature: 0.6
      max_tokens: 2048
      context_budget: 100000

    data_analysis:
      provider: local
      model: llama3:13b
      temperature: 0.1
      max_tokens: 1024
      context_budget: 40000

    fast_decisions:
      provider: anthropic
      model: claude-3-haiku-20250307
      temperature: 0.3
      max_tokens: 512
      context_budget: 50000

# Cost and latency constraints
constraints:
  max_cost_per_hour: 50.00
  max_latency_conductor_ms: 5000
  max_latency_orchestrator_ms: 3000
  max_latency_leaf_ms: 2000

  # Batch operations can use slower models
  batch_latency_ms: 30000
  batch_cost_per_hour: 100.00

# Rate limiting
rate_limits:
  conductor:
    requests_per_minute: 60
    tokens_per_minute: 500000

  orchestrator:
    requests_per_minute: 200
    tokens_per_minute: 1000000

  leaf_agents:
    requests_per_minute: 500
    tokens_per_minute: 2000000

# Monitoring and switching
monitoring:
  track_latency: true
  track_cost: true
  track_errors: true
  switch_on_timeout: true
  switch_on_error_rate: 0.05  # Switch if 5%+ errors

# Model switching behavior
switching:
  # When primary model is unavailable
  auto_fallback: true
  fallback_timeout_ms: 2000

  # Preserve state during switching
  preserve_conversation_context: true
  preserve_agent_memory: true

  # Notify user of switches
  notify_on_switch: true

  # Cost-based optimization
  optimize_cost: true
  cost_threshold: 100  # $ per hour
```

### Runtime Model Selection

```python
# Core model selection logic

class ModelRouter:
    def __init__(self, config_path: str):
        self.config = load_config(config_path)
        self.provider_adapters = {}
        self.model_cache = {}
        self.usage_stats = UsageTracker()

    def select_model(
        self,
        agent_level: str,  # "conductor", "orchestrator", "leaf"
        agent_type: str,   # "code_synthesis", "text_generation", etc.
        context_size: int,
        time_budget_ms: int
    ) -> ModelConfig:
        """
        Select the best model given constraints.

        Selection priority:
        1. Agent's configured primary model
        2. Check availability and latency budget
        3. Fall back if needed
        4. Consider cost constraints
        5. Apply dynamic switching based on performance
        """

        # Get base configuration
        if agent_level == "leaf":
            base_config = self.config["hierarchy"]["leaf_agents"][agent_type]
        else:
            base_config = self.config["hierarchy"][agent_level]["primary"]

        # Check if context fits
        if context_size > base_config["context_budget"]:
            # Need to either:
            # - Trim context
            # - Switch to model with larger context
            # - Return context_too_large error
            return self._find_model_for_context(agent_level, context_size)

        # Check latency constraints
        if self._model_too_slow(base_config, time_budget_ms):
            return self._find_faster_model(agent_level, agent_type)

        # Check cost constraints
        if self._exceeds_cost_budget(base_config):
            return self._find_cheaper_model(agent_level, agent_type)

        # Check availability
        if not self._provider_available(base_config["provider"]):
            return self._get_fallback_model(agent_level)

        return base_config

    def _find_model_for_context(self, level: str, context_size: int) -> ModelConfig:
        """Find a model that can handle the context size."""
        candidates = self._get_model_candidates(level)
        return max(
            (c for c in candidates if c["context_budget"] >= context_size),
            key=lambda m: m.get("priority", 0),
            default=self._fallback_model(level)
        )

    def _find_faster_model(self, level: str, agent_type: str) -> ModelConfig:
        """Switch to a faster (smaller) model."""
        candidates = self._get_model_candidates(level)
        # Sort by estimated latency (smaller models are faster)
        return min(candidates, key=lambda m: self._estimate_latency(m))

    def _find_cheaper_model(self, level: str, agent_type: str) -> ModelConfig:
        """Switch to a cheaper model."""
        candidates = self._get_model_candidates(level)
        # Sort by estimated cost per token
        return min(candidates, key=lambda m: self._estimate_cost(m))

    def _provider_available(self, provider: str) -> bool:
        """Check if provider is currently available."""
        return self.usage_stats.provider_health(provider) == "healthy"

    def _get_fallback_model(self, level: str) -> ModelConfig:
        """Get fallback model when primary is unavailable."""
        config_key = f"hierarchy.{level}.fallback"
        if self._has_config(config_key):
            return self._get_config(config_key)
        # Default fallback: Claude Haiku (always available, cheap, fast)
        return {
            "provider": "anthropic",
            "model": "claude-3-haiku-20250307",
            "temperature": 0.3,
            "max_tokens": 1024,
            "context_budget": 50000
        }
```

---

## Context Window Budgeting

Context windows are the **primary performance lever** in the system.

### Context Budget Algorithm

```python
class ContextWindowManager:
    def __init__(self, model_config: ModelConfig):
        self.max_context = self._get_model_max_context(model_config)
        self.budget = int(self.max_context * model_config.get("context_budget_ratio", 0.75))
        self.reserved_for_output = int(self.max_context * 0.2)  # 20% for output tokens
        self.available = self.budget - self.reserved_for_output

    def allocate(self, conversation: List[Message]) -> AllocatedContext:
        """
        Allocate context window among:
        1. System prompt (required)
        2. Conversation history (trimmed if needed)
        3. Current user message
        4. Tool context (environment state)
        5. Working memory (agent state)
        """

        allocation = {
            "system_prompt": self._encode(self.system_prompt),
            "conversation_history": 0,
            "user_message": 0,
            "tool_context": 0,
            "working_memory": 0
        }

        remaining = self.available

        # 1. System prompt is mandatory
        allocation["system_prompt"] = self._encode(self.system_prompt)
        remaining -= allocation["system_prompt"]

        # 2. Current message gets priority
        allocation["user_message"] = self._encode(conversation[-1])
        remaining -= allocation["user_message"]

        if remaining <= 0:
            raise ContextWindowExceededError("Even user message won't fit")

        # 3. Working memory (agent state, decisions)
        # Critical for maintaining agent coherence
        working_mem_needed = self._estimate_working_memory_size()
        allocation["working_memory"] = min(working_mem_needed, int(remaining * 0.3))
        remaining -= allocation["working_memory"]

        # 4. Tool context (current file, environment state)
        tool_context_needed = self._estimate_tool_context_size()
        allocation["tool_context"] = min(tool_context_needed, int(remaining * 0.3))
        remaining -= allocation["tool_context"]

        # 5. Conversation history (keep recent context)
        # Trim older messages if needed
        for msg in reversed(conversation[:-1]):
            msg_tokens = self._encode(msg)
            if msg_tokens <= remaining:
                allocation["conversation_history"] += msg_tokens
                remaining -= msg_tokens
            else:
                break  # Stop adding older messages

        return AllocatedContext(allocation, remaining)

    def trim_conversation(self, messages: List[Message], target_tokens: int) -> List[Message]:
        """
        Intelligently trim conversation history while preserving semantic coherence.

        Strategy:
        1. Always keep system prompt
        2. Always keep last user message
        3. Keep most recent assistant message
        4. Remove oldest messages first (FIFO trimming)
        5. Look for semantic breaks (topic changes) to trim at
        6. Fallback: summarize middle section if needed
        """

        if self._encode_messages(messages) <= target_tokens:
            return messages

        # Keep first (system), last two (user + assistant)
        keep = messages[:1] + messages[-2:]
        middle = messages[1:-2]

        # Try FIFO trim from middle
        for i in range(len(middle)):
            candidate = keep + middle[i:]
            if self._encode_messages(candidate) <= target_tokens:
                return candidate

        # If still too large, summarize middle section
        summary = self._summarize_messages(middle[:len(middle)//2])
        remaining_middle = middle[len(middle)//2:]

        return keep[:1] + [summary] + remaining_middle + keep[1:]

    def estimate_tokens(self, text: str) -> int:
        """Estimate tokens (actual tokenizer is provider-specific)."""
        # Claude: ~4 chars per token
        # GPT: ~4 chars per token
        # Varies by model, but 4:1 is reasonable baseline
        return len(text) // 4

    def _encode(self, obj) -> int:
        """Encode object to token count."""
        if isinstance(obj, Message):
            return self.estimate_tokens(obj.content) + 20  # ~20 tokens overhead
        return self.estimate_tokens(str(obj))

    def _encode_messages(self, messages: List[Message]) -> int:
        return sum(self._encode(m) for m in messages)
```

### Context Optimization Strategies

```yaml
# Context optimization per level

context_optimization:
  conductor:
    # Conductor needs broad context for planning
    strategy: "full_conversation_with_summaries"
    max_conversation_depth: 10
    summarize_older_than: 5_messages
    preserve_semantic_breakpoints: true

  orchestrator:
    # Orchestrators focus on current task
    strategy: "recent_context_with_working_memory"
    max_conversation_depth: 5
    working_memory_allocation: 0.4

  leaf_agents:
    # Leaf agents are task-focused
    strategy: "minimal_context"
    max_conversation_depth: 3
    trim_aggressively: true

# Summarization strategies
summarization:
  enabled: true
  trigger: "when_conversation_exceeds_15_messages"

  # Conductor: High-level decision summaries
  conductor_style: |
    **Context Snapshot**
    - User's Goal: [brief goal statement]
    - Key Decisions Made: [bulleted list]
    - Current Blocker: [if any]
    - Next Steps: [planned actions]

  # Orchestrator: Task and state summaries
  orchestrator_style: |
    **Task State**
    - Objective: [current objective]
    - Completed: [what's done]
    - In Progress: [current work]
    - Blockers: [known issues]

  # Leaf agents: Action summaries
  leaf_style: |
    **Progress Summary**
    - Completed: [results]
    - Current: [current action]
    - Next: [next steps]
```

---

## Request Flow and Streaming

### Request Normalization

```python
class ModelRequest:
    """Normalized request that works with any provider."""

    def __init__(
        self,
        model_config: ModelConfig,
        messages: List[Message],
        system_prompt: str,
        tools: Optional[List[Tool]] = None,
        streaming: bool = True,
        timeout_ms: int = 30000
    ):
        self.model_config = model_config
        self.messages = messages
        self.system_prompt = system_prompt
        self.tools = tools or []
        self.streaming = streaming
        self.timeout_ms = timeout_ms

    def to_provider_format(self, provider: str) -> dict:
        """Convert to provider-specific format."""

        if provider == "openai":
            return self._to_openai_format()
        elif provider == "anthropic":
            return self._to_anthropic_format()
        elif provider == "google":
            return self._to_google_format()
        elif provider == "local":
            return self._to_local_format()
        else:
            raise UnsupportedProviderError(provider)

    def _to_openai_format(self) -> dict:
        return {
            "model": self.model_config["model"],
            "messages": [
                {"role": "system", "content": self.system_prompt},
                *[m.to_dict() for m in self.messages]
            ],
            "temperature": self.model_config.get("temperature", 0.7),
            "max_tokens": self.model_config.get("max_tokens", 2048),
            "tools": [t.to_openai_format() for t in self.tools] if self.tools else None,
            "stream": self.streaming,
        }

    def _to_anthropic_format(self) -> dict:
        return {
            "model": self.model_config["model"],
            "max_tokens": self.model_config.get("max_tokens", 2048),
            "system": self.system_prompt,
            "messages": [m.to_dict() for m in self.messages],
            "tools": [t.to_anthropic_format() for t in self.tools] if self.tools else None,
            "temperature": self.model_config.get("temperature", 0.7),
        }

    def _to_google_format(self) -> dict:
        return {
            "model": f"projects/*/locations/*/endpoints/{self.model_config['model']}",
            "contents": [
                {"role": "user", "parts": [{"text": self.system_prompt}]},
                *[{"role": m.role, "parts": [{"text": m.content}]} for m in self.messages]
            ],
            "generationConfig": {
                "temperature": self.model_config.get("temperature", 0.7),
                "maxOutputTokens": self.model_config.get("max_tokens", 2048),
            },
        }
```

### Streaming Handler

```python
class StreamingHandler:
    """Manage streaming responses with real-time UI updates."""

    def __init__(self, response_callback: Callable[[str], None]):
        self.response_callback = response_callback
        self.buffer = []
        self.thinking_buffer = []
        self.is_thinking = False

    def handle_stream(self, stream):
        """Process streaming chunks from LLM."""

        for chunk in stream:
            if chunk.type == "content_block_start":
                if chunk.content_block.type == "thinking":
                    self.is_thinking = True
                    self.response_callback({"type": "thinking_start"})

            elif chunk.type == "content_block_delta":
                if self.is_thinking:
                    text = chunk.delta.thinking
                    self.thinking_buffer.append(text)
                    # Don't stream thinking to user, just accumulate
                else:
                    text = chunk.delta.text
                    self.buffer.append(text)
                    # Stream to UI in real-time
                    self.response_callback({"type": "text_delta", "text": text})

            elif chunk.type == "content_block_stop":
                if self.is_thinking:
                    self.is_thinking = False
                    self.response_callback({
                        "type": "thinking_stop",
                        "thinking": "".join(self.thinking_buffer)
                    })
                    self.thinking_buffer.clear()

        return {
            "text": "".join(self.buffer),
            "thinking": "".join(self.thinking_buffer),
            "complete": True
        }

    def buffer_response_until_ready(self, stream, wait_for_complete_token: bool = False):
        """Buffer entire response before returning (for non-streaming mode)."""

        full_response = {
            "text": "",
            "thinking": "",
            "metadata": {}
        }

        for chunk in stream:
            if chunk.type == "content_block_delta":
                if self.is_thinking:
                    full_response["thinking"] += chunk.delta.thinking
                else:
                    full_response["text"] += chunk.delta.text

            elif chunk.type == "message_stop":
                full_response["metadata"] = {
                    "stop_reason": chunk.message.stop_reason,
                    "usage": chunk.message.usage
                }

        return full_response
```

---

## Fallback and Error Handling

### Fault Tolerance

```python
class ResilientModelCaller:
    """Handle model failures gracefully."""

    def __init__(self, model_router: ModelRouter):
        self.router = model_router
        self.error_tracker = ErrorTracker()
        self.circuit_breaker = CircuitBreaker()

    async def call_model(
        self,
        agent_level: str,
        agent_type: str,
        messages: List[Message],
        system_prompt: str,
        context_size: int,
        time_budget_ms: int = 5000
    ) -> ModelResponse:
        """
        Call model with automatic fallback handling.

        Fallback sequence:
        1. Try primary model
        2. If timeout or error: try fallback model
        3. If fallback fails: try emergency fallback (Haiku)
        4. If all fail: return graceful degradation
        """

        # Select initial model
        model_config = self.router.select_model(
            agent_level, agent_type, context_size, time_budget_ms
        )

        # Try with deadline
        start_time = time.time()
        deadline = start_time + (time_budget_ms / 1000)

        while True:
            elapsed = time.time() - start_time
            remaining_budget = time_budget_ms - (elapsed * 1000)

            # Check if we're out of time
            if remaining_budget < 500:
                return self._graceful_degradation(agent_level, messages)

            # Check circuit breaker
            if self.circuit_breaker.is_open(model_config["provider"]):
                model_config = self._get_alternate_model(agent_level, agent_type)

            try:
                response = await self._call_provider(
                    model_config,
                    messages,
                    system_prompt,
                    timeout_ms=remaining_budget
                )

                # Success: reset error tracking
                self.error_tracker.record_success(model_config["provider"])
                return response

            except TimeoutError:
                self.error_tracker.record_timeout(model_config)
                model_config = self._get_fallback_model(agent_level)
                continue

            except RateLimitError:
                self.error_tracker.record_rate_limit(model_config)
                # Wait a bit and retry with same model
                await asyncio.sleep(0.5)
                continue

            except ProviderError as e:
                self.error_tracker.record_error(model_config, e)

                # If primary failed, try fallback
                if model_config == self.router.select_model(agent_level, agent_type, context_size, time_budget_ms):
                    model_config = self._get_fallback_model(agent_level)
                    continue
                else:
                    # Fallback already tried, give up
                    return self._graceful_degradation(agent_level, messages)

    def _graceful_degradation(self, agent_level: str, messages: List[Message]) -> ModelResponse:
        """
        Return reasonable response when all models fail.

        For conductor: return structured error
        For orchestrator: return "Unable to process, retry"
        For leaf: return null/empty result and mark for retry
        """

        if agent_level == "conductor":
            return ModelResponse(
                text="",
                error=True,
                error_message="All model providers unavailable. Please check network and try again.",
                recovery_suggestion="Retry in a few moments, or check provider status."
            )
        else:
            return ModelResponse(
                text="",
                error=True,
                error_message=f"Cannot reach model for {agent_level}",
                recovery_suggestion="Marked for retry"
            )
```

### Health Monitoring

```python
class ProviderHealthMonitor:
    """Track provider health and availability."""

    def __init__(self):
        self.health_history = {}
        self.circuit_breakers = {}

    def record_call(
        self,
        provider: str,
        model: str,
        success: bool,
        latency_ms: float,
        tokens_used: int = 0
    ):
        """Record model call result."""

        if provider not in self.health_history:
            self.health_history[provider] = {
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0,
                "avg_latency_ms": 0,
                "last_error": None,
                "last_error_time": None,
            }

        stats = self.health_history[provider]
        stats["total_calls"] += 1

        if success:
            stats["successful_calls"] += 1
            # Update rolling average latency
            stats["avg_latency_ms"] = (
                stats["avg_latency_ms"] * 0.8 + latency_ms * 0.2
            )
        else:
            stats["failed_calls"] += 1
            stats["last_error"] = f"Model error on {model}"
            stats["last_error_time"] = time.time()

        # Update circuit breaker
        error_rate = stats["failed_calls"] / max(stats["total_calls"], 1)
        if error_rate > 0.1:  # > 10% errors
            self.circuit_breakers[provider] = True
        elif stats["total_calls"] > 50 and error_rate < 0.02:
            self.circuit_breakers[provider] = False

    def get_provider_status(self, provider: str) -> str:
        """Get provider status: healthy, degraded, unhealthy."""

        if provider not in self.health_history:
            return "unknown"

        stats = self.health_history[provider]
        error_rate = stats["failed_calls"] / max(stats["total_calls"], 1)

        if error_rate > 0.2:
            return "unhealthy"
        elif error_rate > 0.1:
            return "degraded"
        else:
            return "healthy"
```

---

## Cost Optimization

### Cost Tracking and Budgeting

```python
class CostTracker:
    """Track and optimize LLM costs."""

    # Approximate costs (prices fluctuate, these are 2025 estimates)
    COST_PER_TOKEN = {
        "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
        "claude-3-opus-20250219": {"input": 0.015, "output": 0.075},
        "claude-3-haiku-20250307": {"input": 0.00080, "output": 0.004},
        "gpt-4o": {"input": 0.005, "output": 0.015},
        "gpt-4-turbo": {"input": 0.01, "output": 0.03},
        "gpt-4": {"input": 0.03, "output": 0.06},
        "gemini-2-flash": {"input": 0.075/1000000, "output": 0.3/1000000},  # Per-token
        "llama3:13b": {"input": 0.0, "output": 0.0},  # Local, free
    }

    def __init__(self):
        self.session_cost = 0.0
        self.hourly_cost = 0.0
        self.daily_cost = 0.0
        self.call_history = []

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost of a model call."""

        if model not in self.COST_PER_TOKEN:
            # Unknown model, use reasonable default (Claude 3.5 Sonnet)
            costs = self.COST_PER_TOKEN["claude-3-5-sonnet-20241022"]
        else:
            costs = self.COST_PER_TOKEN[model]

        input_cost = (input_tokens / 1000) * costs["input"]
        output_cost = (output_tokens / 1000) * costs["output"]

        return input_cost + output_cost

    def should_switch_to_cheaper_model(self, current_cost: float, threshold: float = 0.1) -> bool:
        """Determine if should switch to cheaper model."""

        hourly_rate = self.session_cost * 3600 / (time.time() - self.session_start)

        if hourly_rate > 10.0:  # More than $10/hour is expensive
            return True

        return False

    def recommend_model_for_cost(self, task_type: str, accuracy_requirement: str):
        """
        Recommend model based on accuracy needs and cost.

        Task types: "analysis", "generation", "planning", "synthesis"
        Accuracy: "high", "medium", "low"
        """

        recommendations = {
            ("analysis", "high"): "claude-3-opus-20250219",
            ("analysis", "medium"): "claude-3-5-sonnet-20241022",
            ("analysis", "low"): "claude-3-haiku-20250307",

            ("generation", "high"): "claude-3-5-sonnet-20241022",
            ("generation", "medium"): "gpt-4o",
            ("generation", "low"): "claude-3-haiku-20250307",

            ("planning", "high"): "claude-3-opus-20250219",
            ("planning", "medium"): "claude-3-5-sonnet-20241022",
            ("planning", "low"): "gpt-4o",

            ("synthesis", "high"): "gpt-4o",
            ("synthesis", "medium"): "gpt-4o",
            ("synthesis", "low"): "claude-3-haiku-20250307",
        }

        return recommendations.get((task_type, accuracy_requirement), "claude-3-5-sonnet-20241022")
```

### Cost-Based Routing Example

```python
# In model router: if cost budget exceeded, downgrade models

def select_model_cost_aware(self, agent_level: str, agent_type: str) -> ModelConfig:
    """Select model considering current cost spend."""

    hourly_rate = self.usage_stats.estimate_hourly_cost()

    # Budget: $50/hour default
    max_hourly = self.config.get("constraints", {}).get("max_cost_per_hour", 50.0)

    if hourly_rate > max_hourly * 0.8:  # 80% of budget
        # Switch to cheaper models
        if agent_level == "conductor":
            return self._get_config("hierarchy.conductor.fallback")  # GPT-4o instead of Sonnet
        elif agent_level == "orchestrator":
            return self._get_config("hierarchy.orchestrator.fallback")
        else:
            # Use smaller model for leaf agents
            return self._get_config("hierarchy.leaf_agents.fast_decisions")

    # Normal case: use configured model
    return self._get_configured_model(agent_level, agent_type)
```

---

## Model Switching Without State Loss

### State Preservation During Switch

```python
class AgentState:
    """Preserve agent state across model switches."""

    def __init__(self, agent_id: str, agent_level: str):
        self.agent_id = agent_id
        self.agent_level = agent_level

        # Conversation history (model-agnostic)
        self.messages: List[Message] = []

        # Agent's working memory (decisions, plans, context)
        self.working_memory: dict = {
            "goals": [],
            "completed_actions": [],
            "current_action": None,
            "blockers": [],
            "decisions_made": [],
            "context_notes": "",
        }

        # Current model assignment
        self.current_model: Optional[ModelConfig] = None
        self.previous_models: List[ModelConfig] = []

    def serialize_for_model_switch(self) -> dict:
        """Prepare state for transition to new model."""

        return {
            "conversation_history": [m.to_dict() for m in self.messages],
            "working_memory": self.working_memory,
            "timestamp": time.time(),
            "previous_model": self.current_model,
        }

    def restore_from_switch(self, serialized_state: dict):
        """Restore state after switching models."""

        self.messages = [Message.from_dict(m) for m in serialized_state["conversation_history"]]
        self.working_memory = serialized_state["working_memory"]
        self.previous_models.append(serialized_state["previous_model"])

    def notify_user_of_switch(self, old_model: str, new_model: str, reason: str) -> str:
        """Generate notification message."""

        return f"""
        [Model switched: {old_model} → {new_model}]
        Reason: {reason}
        [State preserved: conversation history, working memory intact]
        """

class ModelSwitcher:
    """Handle model switching with full state preservation."""

    def switch_model(
        self,
        agent: Agent,
        old_model: ModelConfig,
        new_model: ModelConfig,
        reason: str
    ) -> bool:
        """
        Switch agent's model while preserving state.

        Reasons: "timeout", "error_rate", "cost_optimization", "manual_override", "context_size"
        """

        # Save state
        serialized = agent.state.serialize_for_model_switch()

        # Update model
        agent.state.current_model = new_model

        # Restore state in new model context
        agent.state.restore_from_switch(serialized)

        # Notify user if configured
        if self.config.get("switching", {}).get("notify_on_switch", True):
            notification = agent.state.notify_user_of_switch(
                old_model["model"],
                new_model["model"],
                reason
            )
            agent.emit_notification(notification)

        return True
```

---

## Provider Abstraction

### Example: OpenAI Adapter

```python
class OpenAIAdapter(ModelAdapter):
    """Adapter for OpenAI API."""

    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def call_model(self, request: ModelRequest) -> ModelResponse:
        """Call OpenAI model."""

        formatted = request.to_provider_format("openai")

        if request.streaming:
            return self._stream_response(formatted)
        else:
            return self._buffered_response(formatted)

    def _stream_response(self, formatted_request: dict) -> ModelResponse:
        """Stream response from OpenAI."""

        stream = self.client.chat.completions.create(
            **formatted_request,
            stream=True
        )

        full_text = ""
        finish_reason = None

        for chunk in stream:
            if chunk.choices[0].delta.content:
                full_text += chunk.choices[0].delta.content
                yield StreamChunk(content=chunk.choices[0].delta.content)

            if chunk.choices[0].finish_reason:
                finish_reason = chunk.choices[0].finish_reason

        return ModelResponse(
            text=full_text,
            finish_reason=finish_reason,
            provider="openai"
        )

    def _buffered_response(self, formatted_request: dict) -> ModelResponse:
        """Get full response from OpenAI."""

        response = self.client.chat.completions.create(**formatted_request)

        return ModelResponse(
            text=response.choices[0].message.content,
            finish_reason=response.choices[0].finish_reason,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            },
            provider="openai"
        )
```

### Example: Anthropic Adapter

```python
class AnthropicAdapter(ModelAdapter):
    """Adapter for Anthropic API."""

    def __init__(self, api_key: str):
        self.client = Anthropic(api_key=api_key)

    def call_model(self, request: ModelRequest) -> ModelResponse:
        """Call Anthropic model."""

        formatted = request.to_provider_format("anthropic")

        if request.streaming:
            return self._stream_response(formatted)
        else:
            return self._buffered_response(formatted)

    def _stream_response(self, formatted_request: dict) -> ModelResponse:
        """Stream response from Anthropic."""

        with self.client.messages.stream(**formatted_request) as stream:
            full_text = ""
            thinking = ""

            for text in stream.text_stream:
                full_text += text
                yield StreamChunk(content=text)

            message = stream.get_final_message()

        return ModelResponse(
            text=full_text,
            thinking=thinking,
            stop_reason=message.stop_reason,
            usage={
                "input_tokens": message.usage.input_tokens,
                "output_tokens": message.usage.output_tokens,
            },
            provider="anthropic"
        )
```

---

## Configuration Examples

### Example 1: Cost-Optimized Setup

For organizations prioritizing low cost:

```yaml
hierarchy:
  conductor:
    primary:
      provider: anthropic
      model: claude-3-haiku-20250307  # Fast, cheap ($1 per million tokens)

  workspace_orchestrator:
    primary:
      provider: openai
      model: gpt-4o-mini  # Cheap, capable

  leaf_agents:
    code_synthesis:
      provider: openai
      model: gpt-4o-mini
    text_generation:
      provider: local
      model: llama3:8b
    data_analysis:
      provider: local
      model: llama3:13b

constraints:
  max_cost_per_hour: 5.00  # Keep it cheap
```

### Example 2: Quality-First Setup

For maximum reasoning quality:

```yaml
hierarchy:
  conductor:
    primary:
      provider: anthropic
      model: claude-3-opus-20250219  # Most capable
      context_budget: 200000

  workspace_orchestrator:
    primary:
      provider: anthropic
      model: claude-3-5-sonnet-20241022

  leaf_agents:
    code_synthesis:
      provider: openai
      model: gpt-4o  # Known for code
    research:
      provider: anthropic
      model: claude-3-opus-20250219  # Deepest reasoning

constraints:
  max_cost_per_hour: 500.00  # Quality over cost
```

### Example 3: Hybrid Setup

Balanced cost and quality:

```yaml
hierarchy:
  conductor:
    primary:
      provider: anthropic
      model: claude-3-5-sonnet-20241022  # Good balance

    fallback:
      provider: openai
      model: gpt-4o

  leaf_agents:
    code_synthesis:
      primary:
        provider: openai
        model: gpt-4o
      fallback:
        provider: anthropic
        model: claude-3-5-sonnet-20241022

    fast_decisions:
      provider: anthropic
      model: claude-3-haiku-20250307  # Fast responses

    research:
      provider: anthropic
      model: claude-3-opus-20250219  # Deep context when needed

constraints:
  max_cost_per_hour: 50.00
  optimize_cost: true
```

---

## Integration Checklist

- [ ] **Model abstraction layer**: Unified interface for all LLM calls
- [ ] **Provider adapters**: OpenAI, Anthropic, Google, Local models
- [ ] **Configuration system**: YAML-based, environment variable support
- [ ] **Model router**: Intelligent model selection based on constraints
- [ ] **Context window manager**: Dynamic budgeting and trimming
- [ ] **Streaming handler**: Real-time UI updates during generation
- [ ] **Fallback logic**: Automatic degradation and retry
- [ ] **Cost tracking**: Monitor and optimize spending
- [ ] **Health monitoring**: Provider availability and circuit breakers
- [ ] **State preservation**: Model switching without data loss
- [ ] **Error handling**: Graceful degradation when models unavailable
- [ ] **Testing**: Mock providers for development and testing
- [ ] **Monitoring**: Track latency, cost, errors, success rates
- [ ] **Documentation**: Clear configuration and extension guide

---

## Key Design Principles

1. **Model-agnostic**: Work with any LLM provider through adapters
2. **Hierarchical optimization**: Different models for different levels
3. **Context efficiency**: Manage token budgets as the primary lever
4. **Cost awareness**: Route to cheaper models when appropriate
5. **Resilience**: Fall back gracefully when models fail
6. **Transparency**: Track and report costs, latency, errors
7. **User control**: Flexible configuration without code changes
8. **State preservation**: Model switches don't lose progress
9. **Real-time feedback**: Streaming and progress updates
10. **Testability**: Easy to mock and test with fake providers
