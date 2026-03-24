# Sprint 2: Core Intelligence

**Project:** Luna — LLM-Native Operating System
**Duration:** Phase 2 (Weeks 5–10)
**Status:** In Progress
**Date:** 2026-03-24
**Builds On:** Sprint 1 (Foundation)

---

## Objective

Implement the cognitive layer that transforms the Sprint 1 skeleton into an intelligent system. Sprint 2 adds: multi-layer memory, agent hierarchy (Conductor → Workspace Orchestrator → Leaf Agents), inter-agent scratchpad, full JSON Schema action validation, and a permission system with user approval dialogs. **This is where the system becomes "intelligent."**

---

## Sprint 1 Gaps Being Addressed

| Gap | Sprint 1 State | Sprint 2 Fix |
|-----|----------------|--------------|
| Action queue processor | Receives actions but only logs — never executes | Handler registry + processing loop |
| Memory system | SQLite session table + 10k ring buffer | 4-layer: working, episodic, semantic, agent state |
| Agent hierarchy | Single Conductor only | Conductor → Orchestrator → Leaf stubs |
| Inter-agent communication | None | MessageBus + Scratchpad/Blackboard |
| Action validation | Type-string existence check only | Full JSON Schema per action type |
| Permission system | No checks — every action auto-succeeds | Permission matrix + user approval dialog |
| LLM system prompt | Hardcoded 2-action system prompt | Dynamically generated from action registry |
| LLM responses | Blocking request-response | Streaming SSE with incremental token delivery |

---

## Components Built

### 1. Action Queue Processor (Prerequisite)
*Files: `action/queue.rs`, `lib.rs`, `commands.rs`*

The Sprint 1 queue worker only logged received actions. Sprint 2 implements a full `HandlerRegistry` — a map of `action_type → async handler fn`. The processing loop pulls from the `tokio::mpsc` channel, dispatches to the registered handler, and updates action status on completion.

**Core handlers registered at startup:**
- `window.create` → WindowManager::create_window + emit `agent-window-create` to frontend
- `window.close` → WindowManager::close_window + emit `agent-window-close`
- `window.focus` → WindowManager::focus_window + emit `agent-window-focus`
- `window.update_content` → emit `window-content-update` with window_id + content
- `agent.response` → emit `agent-response` to frontend (moved from inline `send_message`)
- `system.notify` → emit `system-notification` with message + level
- `agent.delegate` → route to WorkspaceOrchestrator via MessageBus
- `memory.store` → MemorySystem::semantic_store
- `memory.retrieve` → MemorySystem::semantic_retrieve + return via event

Inline action handling removed from `commands.rs::send_message`. All action execution flows through the queue.

**Handler signature:**
```rust
type ActionHandler = Arc<dyn Fn(Action, AppHandle, Arc<AppState>) -> BoxFuture<'static, Result<(), LunaError>> + Send + Sync>;
```

---

### 2. Multi-Layer Memory System
*Files: `memory/mod.rs`, `memory/working.rs`, `memory/episodic.rs`, `memory/semantic.rs`, `persistence/db.rs`, `state.rs`*

Four memory layers per the architecture spec (Doc 08):

#### 2a. Working Memory
- In-memory `HashMap<AgentId, WorkingMemorySlot>` behind `Arc<tokio::sync::RwLock<>>`
- Slot: `{ recent_actions: Vec<Action>, observations: Vec<String>, last_updated: Instant }`
- Max 256 slots, auto-expire after 5 minutes of inactivity
- Background tokio task runs eviction every 60 seconds
- `read(agent_id)`, `write(agent_id, entry)`, `expire_stale()`
- Latency target: <10ms read/write

#### 2b. Episodic Memory
- SQLite table: `episodic_memory (id TEXT PK, session_id TEXT, agent_id TEXT, timestamp INTEGER, action_type TEXT, payload TEXT, result TEXT, context_tags TEXT)`
- Indexed: `(agent_id, timestamp)`, `(session_id, timestamp)`
- `record(agent_id, action_type, payload, result, tags)` — INSERT
- `query_session(session_id)` → ordered timeline
- `query_agent(agent_id, limit)` → recent N events
- Background task: 30-day auto-purge (runs once per session start)
- Latency target: 1000-event query <50ms

#### 2c. Semantic Memory (KV stub for Phase 5 vector upgrade)
- SQLite table: `semantic_memory (id TEXT PK, key TEXT UNIQUE, value TEXT, tags TEXT, created_at INTEGER)`
- `store(key, value, tags)`, `retrieve_by_key(key)`, `search_by_tag(tag)` → Vec<SemanticEntry>
- Latency target: <20ms lookup

#### 2d. Persistent Agent State
- SQLite table: `agent_state (agent_id TEXT PK, state_json TEXT, updated_at INTEGER)`
- JSON blob per agent: `{ beliefs, preferences, capability_registry, token_counts }`
- Loaded on agent init, updated on permission grants, preference changes, token tracking

**MemorySystem aggregator** (`memory/mod.rs`):
```rust
pub struct MemorySystem {
    pub working: Arc<WorkingMemory>,
    pub episodic: Arc<EpisodicMemory>,
    pub semantic: Arc<SemanticMemory>,
    pub agent_state: Arc<AgentStateStore>,
}
```

Added to `AppState` as `memory: Arc<MemorySystem>`, initialized before any agents start.

---

### 3. Agent Hierarchy
*Files: `agent/registry.rs`, `agent/messaging.rs`, `agent/orchestrator.rs`, `agent/leaf.rs`, `agent/conductor.rs`, `action/types.rs`*

Three-tier hierarchy per Doc 06:

#### 3a. Agent Registry
- `AgentRegistry`: `HashMap<AgentId, AgentMetadata>` behind `Arc<RwLock<>>`
- `AgentMetadata`: `{ agent_type: AgentType, capabilities: Vec<ActionType>, workspace_id: Option<WorkspaceId>, status: AgentStatus }`
- `AgentStatus`: `Idle | Busy | Error(String) | Offline`
- `register()`, `deregister()`, `get_capabilities()`, `set_status()`
- Added to `AppState` as `agent_registry: Arc<AgentRegistry>`

#### 3b. Inter-Agent MessageBus
- `MessageBus`: `HashMap<AgentId, tokio::mpsc::UnboundedSender<AgentMessage>>`
- Message types:
  ```rust
  pub enum AgentMessage {
      Delegate { task_id: TaskId, task: String, context: serde_json::Value },
      Assign   { task_id: TaskId, action_type: String, payload: serde_json::Value, timeout_ms: u64 },
      Report   { task_id: TaskId, result: serde_json::Value, status: TaskStatus },
      Complete { task_id: TaskId, result: serde_json::Value },
      Escalate { task_id: TaskId, reason: String },
  }
  ```
- `send(to: &AgentId, msg: AgentMessage)`, `register_receiver(agent_id)` → Receiver

#### 3c. Workspace Orchestrator
- `WorkspaceOrchestrator` struct: workspace_id, LLM client reference, memory reference, scratchpad reference, message_bus receiver
- Task loop: receives `Delegate` → calls LLM with orchestrator system prompt → parses response → emits `agent.assign` actions to leaf agents via MessageBus
- Aggregates leaf `Report` messages → sends `Complete` to Conductor
- Timeout: if leaf doesn't report in 5s → sends `Escalate` to Conductor
- One Orchestrator spawned per workspace; currently one default workspace (`workspace_default`)

#### 3d. Leaf Agent Stubs
- `LeafAgent` trait:
  ```rust
  #[async_trait]
  pub trait LeafAgent: Send + Sync {
      fn agent_id(&self) -> &AgentId;
      fn capabilities(&self) -> Vec<ActionType>;
      async fn handle(&self, task_id: TaskId, action_type: &str, payload: serde_json::Value) -> Result<serde_json::Value, LunaError>;
  }
  ```
- `StubLeafAgent` — logs action, returns `{ "status": "ok", "note": "stub" }` (placeholder for Phase 4 specialized agents: FileLeaf, ShellLeaf, SearchLeaf)

#### 3e. Conductor Updates
- Added `agent_registry`, `message_bus`, `memory` references
- On user input: classify task complexity
  - **Simple** (direct answer/window): handle inline as before
  - **Complex** (multi-step): emit `agent.delegate` to Orchestrator via MessageBus
- Timeout: Orchestrator non-response in 5s → Conductor handles directly + logs escalation
- `target_agent_id: Option<AgentId>` added to `Action` struct in `action/types.rs`

---

### 4. Scratchpad / Blackboard System
*Files: `agent/scratchpad.rs`, `commands.rs`, `state.rs`, `src/components/ScratchpadPanel.tsx`, `src/App.tsx`*

Shared workspace for agents to post intermediate results:

**Data structure:**
```rust
pub struct Scratchpad {
    entries: Arc<RwLock<HashMap<WorkspaceId, Vec<ScratchpadEntry>>>>,
}

pub struct ScratchpadEntry {
    pub task_id: TaskId,
    pub agent_id: AgentId,
    pub step: u32,
    pub content: String,
    pub timestamp: u64,
}
```

- `write(workspace_id, task_id, agent_id, step, content)` → appends entry + emits `scratchpad-update` Tauri event
- `read(workspace_id)` → all entries sorted by timestamp
- `clear_task(workspace_id, task_id)` — called on task completion
- Background task: auto-clear entries older than 1 hour
- `get_scratchpad(workspace_id)` IPC command added to `commands.rs`

**ScratchpadPanel.tsx:**
- Subscribes to `scratchpad-update` Tauri event
- Lists entries with agent name, step, content, timestamp
- Auto-scrolls to newest entry
- Can be opened as a window type `content_type: "scratchpad"`

---

### 5. Full JSON Schema Action Validation
*Files: `action/registry.rs`, `action/dispatcher.rs`, `Cargo.toml`*

Added `jsonschema` crate. Each action type in the registry now carries a JSON Schema:

**Example schemas:**
```rust
// window.create
json!({
  "type": "object",
  "required": ["title"],
  "properties": {
    "title":        { "type": "string" },
    "x":            { "type": "number" },
    "y":            { "type": "number" },
    "width":        { "type": "number", "minimum": 320 },
    "height":       { "type": "number", "minimum": 240 },
    "content_type": { "type": "string", "enum": ["response","editor","panel","terminal","canvas","scratchpad"] }
  }
})
```

**Full action set registered:**
```
window.create, window.close, window.focus, window.update_content,
window.minimize, window.restore,
agent.response, agent.think, agent.delegate, agent.assign, agent.report, agent.complete, agent.task.create,
memory.store, memory.retrieve,
llm.invoke,
ui.update,
system.notify
```

**Dispatcher validation flow:**
1. Check action_type exists in registry
2. Validate payload against JSON Schema
3. On failure → return `ActionError::SchemaInvalid { action_id, field, reason }`
4. On success → proceed to permission check (Step 6) → enqueue

Validation latency target: <5ms.

---

### 6. Permission & Capability System
*Files: `security/mod.rs`, `security/permissions.rs`, `security/audit.rs`, `action/dispatcher.rs`, `commands.rs`, `src/components/PermissionDialog.tsx`, `src/App.tsx`*

**Permission matrix:**
```rust
pub struct PermissionMatrix {
    entries: HashMap<(AgentId, ActionType), PermissionState>,
    db: Arc<Database>,
}

pub enum PermissionState { Allowed, Denied, PendingApproval }
```

**Default policy:**
- Conductor: all `window.*`, `agent.response`, `agent.think`, `agent.delegate`, `system.notify` → Allowed
- Orchestrators: `agent.assign`, `agent.report`, `agent.complete`, `memory.store`, `system.notify` → Allowed; everything else → PendingApproval
- Leaf agents: only their declared capability actions → Allowed; everything else → Denied

**Dispatcher integration (before schema validation):**
1. Look up `(agent_id, action_type)` in matrix
2. `Allowed` → proceed to schema validation
3. `Denied` → return `ActionError::PermissionDenied`
4. `PendingApproval` → emit `permission-request` Tauri event, suspend action

**User approval flow:**
- `permission-request` event payload: `{ action_id, agent_id, agent_type, action_type, payload_preview }`
- `PermissionDialog.tsx` — modal overlay with:
  - Agent name + action description
  - Payload preview (truncated)
  - Buttons: **Allow Once** / **Always Allow** / **Deny**
- User choice → `grant_permission(agent_id, action_type, permanent: bool)` or `deny_permission(agent_id, action_type)` IPC
- `Always Allow` → persists to `agent_state` table; survives restart
- Suspended action resumes or fails based on decision

**Audit log:**
- SQLite table: `permission_log (id TEXT PK, agent_id TEXT, action_type TEXT, decision TEXT, timestamp INTEGER)`
- Queryable via `query_permission_log(agent_id)` IPC command

---

### 7. LLM Prompt Engineering & Streaming
*Files: `agent/conductor.rs`, `agent/orchestrator.rs`, `agent/response_parser.rs`, `agent/llm_client.rs`, `src/App.tsx`*

#### Dynamic System Prompt
Conductor system prompt is now built at runtime from live state:

```
You are the Conductor for Luna OS — an LLM-native operating system.

## Your Role
Receive user input, decompose into tasks, emit structured JSON actions.
For simple tasks: emit actions directly.
For complex multi-step tasks: emit agent.delegate to the workspace orchestrator.

## Available Actions
[Generated from ActionTypeRegistry — all registered types with schemas]

## Current Context
- Open windows: [list of current windows with ids + content_types]
- Active workspace: workspace_default
- Recent memory: [last 5 episodic entries for this session]

## Response Format
Respond ONLY with a JSON array of actions. Always include agent.response if communicating with the user.
Example: [{"action_type": "agent.response", "payload": {"content": "Hello"}}]
```

#### Orchestrator System Prompt
Separate focused prompt for task decomposition:
```
You are a Workspace Orchestrator for Luna OS.
You receive a task from the Conductor and decompose it into leaf agent assignments.
Emit agent.assign actions for each sub-task. Report completion via agent.complete.
```

#### Streaming LLM Responses
`llm_client.rs` now has `stream_chat()` alongside the existing `chat()`:
- Anthropic: `POST /v1/messages` with `"stream": true` → parse `data: ` SSE lines
- OpenAI: `POST /v1/chat/completions` with `"stream": true` → parse `data: ` SSE lines
- Emits Tauri events per token:
  - `agent-stream-start { window_id }`
  - `agent-stream-token { window_id, token }`
  - `agent-stream-end { window_id, full_response, actions[] }`
- Frontend `App.tsx` listens for these events, appends tokens to the active response window
- On `agent-stream-end`: parse and dispatch the final action array

#### Response Parser Improvements
- Fallback rephrasing: on JSON parse failure → re-call LLM:
  ```
  "Your previous response could not be parsed. Please respond with ONLY a valid JSON array of actions."
  ```
- Max 2 rephrase retries before returning `agent.response` with an error message

#### Token Tracking
- Token counts (input + output) written to `agent_state` after each LLM call
- Accumulated per-session totals logged to episodic memory as `llm.token_usage` events

---

## New File Structure

```
luna/
├── src-tauri/src/
│   ├── memory/
│   │   ├── mod.rs           # MemorySystem aggregator
│   │   ├── working.rs       # WorkingMemory (in-memory, auto-expire)
│   │   ├── episodic.rs      # EpisodicMemory (SQLite, 30-day purge)
│   │   └── semantic.rs      # SemanticMemory (SQLite KV store)
│   ├── security/
│   │   ├── mod.rs
│   │   ├── permissions.rs   # PermissionMatrix
│   │   └── audit.rs         # AuditLog
│   ├── agent/
│   │   ├── conductor.rs     # Updated: dynamic prompt, delegation, streaming
│   │   ├── orchestrator.rs  # NEW: WorkspaceOrchestrator
│   │   ├── leaf.rs          # NEW: LeafAgent trait + StubLeafAgent
│   │   ├── registry.rs      # NEW: AgentRegistry
│   │   ├── messaging.rs     # NEW: MessageBus + AgentMessage enum
│   │   ├── scratchpad.rs    # NEW: Scratchpad/Blackboard
│   │   ├── llm_client.rs    # Updated: stream_chat() via SSE
│   │   └── response_parser.rs # Updated: rephrase fallback
│   ├── action/
│   │   ├── queue.rs         # Updated: HandlerRegistry + processing loop
│   │   ├── registry.rs      # Updated: JSON Schema per action type
│   │   ├── dispatcher.rs    # Updated: schema validation + permission check
│   │   └── types.rs         # Updated: target_agent_id field on Action
│   └── persistence/
│       └── db.rs            # Updated: 4 new tables + migrations
├── src/
│   ├── App.tsx              # Updated: stream events, scratchpad, permission dialog
│   └── components/
│       ├── ScratchpadPanel.tsx  # NEW: live blackboard viewer
│       └── PermissionDialog.tsx # NEW: user approval modal
```

---

## New SQLite Tables

```sql
-- Working memory overflow (rarely used — primary is in-memory)
CREATE TABLE IF NOT EXISTS episodic_memory (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '{}',
    context_tags TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_episodic_agent_time ON episodic_memory(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_memory(session_id, timestamp);

-- Semantic key-value store
CREATE TABLE IF NOT EXISTS semantic_memory (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
);

-- Per-agent persistent state (beliefs, preferences, token counts)
CREATE TABLE IF NOT EXISTS agent_state (
    agent_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

-- Permission audit log
CREATE TABLE IF NOT EXISTS permission_log (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
```

---

## New Cargo Dependencies

```toml
jsonschema = "0.18"
async-trait = "0.1"
futures = "0.3"
bytes = "1.0"
eventsource-stream = "0.2"
```

---

## Technology Stack (additions)

| Addition | Purpose |
|----------|---------|
| jsonschema 0.18 | JSON Schema validation for action payloads |
| async-trait 0.1 | Async trait support for LeafAgent |
| futures 0.3 | BoxFuture for handler registry |
| eventsource-stream 0.2 | SSE parsing for streaming LLM responses |

---

## Sprint 2 Simplifications (deferred to Phase 3+)

| Full Spec | Sprint 2 Decision | Returns In |
|-----------|-------------------|------------|
| Leaf agents with real capabilities (file, shell, search) | StubLeafAgent only | Phase 4 |
| Vector embeddings in semantic memory | Key-value store (text only) | Phase 5 |
| Multiple workspaces | Single default workspace | Phase 3 |
| Full content type rendering (editor, canvas) | Sprint 2.5 / Phase 3 |
| Voice input (ambient + swipe-to-voice) | Text input only | Phase 4 |
| Task graph DAG visualization | Scratchpad panel only | Phase 3 |
| Magnetic window snapping | Free-form drag | Phase 3 |
| Permission learning (auto-approve patterns) | Static matrix only | Phase 5 |

---

## How to Run

```bash
# Sprint 1 setup still applies
export ANTHROPIC_API_KEY="your-key-here"
# or
export OPENAI_API_KEY="your-key-here"

cd luna
npm install
cargo tauri dev
```

New debug commands available in dev mode:
```bash
# View episodic memory log
sqlite3 ~/.luna/data/luna.db "SELECT agent_id, action_type, result FROM episodic_memory ORDER BY timestamp DESC LIMIT 20;"

# View permission log
sqlite3 ~/.luna/data/luna.db "SELECT agent_id, action_type, decision FROM permission_log ORDER BY timestamp DESC;"

# View agent states
sqlite3 ~/.luna/data/luna.db "SELECT agent_id, state_json FROM agent_state;"
```

---

## Success Criteria

- [ ] Action queue processor routes all dispatched actions to registered handlers
- [ ] Working memory read/write: <10ms
- [ ] Episodic memory query (1000 events): <50ms
- [ ] Semantic memory key-value lookup: <20ms
- [ ] Agent hierarchy: Conductor → Orchestrator → Leaf stub processes a delegated task end-to-end
- [ ] Scratchpad panel updates in real-time as agents write entries
- [ ] Invalid action payloads rejected with structured error (field + reason)
- [ ] Schema validation latency: <5ms
- [ ] Permission dialog appears when Orchestrator attempts unpermitted action
- [ ] Always-Allow grants persist across app restart
- [ ] Audit log records all permission decisions
- [ ] Conductor system prompt dynamically lists all registered action types
- [ ] LLM responses stream token-by-token to the response window
- [ ] Token counts tracked per session in agent_state
- [ ] Response parser retries with rephrase on JSON parse failure
- [ ] End-to-end task latency (simple user query): <5 seconds
- [ ] Zero memory race conditions under concurrent agent activity

---

## Phase 3 Preview (Dynamic UI & Workspaces)

Next sprint adds:
- **Content type rendering:** Functional editor, canvas, panel, terminal window types
- **Multiple workspaces:** Workspace creation/switching with per-workspace orchestrators
- **Task graph visualization:** Live DAG of tasks, agents, and dependencies
- **Dynamic app generation:** LLM-defined component trees rendered as window content
- **Magnetic window snapping:** Cards attach to each other spatially
