# Document 25: Testing Strategy and Quality Assurance

## Overview

This document defines the comprehensive testing approach for the LLM-native operating system. Given the complexity of coordinating multiple agents, LLM interactions, and real-time performance constraints, testing spans from isolated component verification to full-system adversarial scenarios.

The testing strategy assumes some team members are unfamiliar with OS-level testing concerns and provides detailed guidance for each layer.

---

## 1. Unit Testing Strategy

### 1.1 Rust Unit Tests

**Framework**: Built-in `#[test]` macro + `cargo test`

**Location**: Test modules live in the same file as implementation, marked with `#[cfg(test)]`

```rust
// In action_dispatcher.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_validation_rejects_invalid_payloads() {
        let action = Action {
            id: "test_1".to_string(),
            agent_id: "".to_string(), // Invalid: empty
            action_type: "move_cursor".to_string(),
            payload: serde_json::json!({}),
            timestamp: SystemTime::now(),
        };

        let result = validate_action(&action);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("agent_id"));
    }

    #[test]
    fn test_action_dispatcher_queues_in_order() {
        let dispatcher = ActionDispatcher::new();
        let action1 = create_test_action("a1", "agent_1");
        let action2 = create_test_action("a2", "agent_1");

        dispatcher.dispatch(&action1).unwrap();
        dispatcher.dispatch(&action2).unwrap();

        let queue = dispatcher.get_queue();
        assert_eq!(queue[0].id, "a1");
        assert_eq!(queue[1].id, "a2");
    }

    #[test]
    fn test_memory_layer_atomic_write() {
        let mut mem = MemoryLayer::new();
        let handle = mem.allocate(1024);
        let data = vec![42; 512];

        mem.write_atomic(&handle, &data).unwrap();
        let read = mem.read(&handle).unwrap();

        assert_eq!(read, data);
    }

    #[test]
    #[should_panic(expected = "bounds check")]
    fn test_memory_out_of_bounds_panics() {
        let mem = MemoryLayer::new();
        let handle = mem.allocate(100);
        let oversized = vec![0; 500];
        mem.write(&handle, &oversized).unwrap(); // Should panic
    }
}
```

**Coverage Targets**:
- All public functions: 100%
- All error paths: 95%+
- All state transitions: 95%+

**Run via**: `cargo test` (runs all unit tests), `cargo test --lib` (library only)

### 1.2 Go Unit Tests

**Framework**: `testing` package + `testify/assert`

**Location**: `*_test.go` files alongside implementation

```go
// In action_dispatcher_test.go
package dispatcher

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestActionValidation(t *testing.T) {
    action := &Action{
        ID:       "test_1",
        AgentID:  "", // Invalid
        Type:     "move_cursor",
        Payload:  map[string]interface{}{},
    }

    err := ValidateAction(action)
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "agent_id required")
}

func TestDispatcherQueueOrdering(t *testing.T) {
    dispatcher := NewDispatcher()
    action1 := createTestAction("a1", "agent_1")
    action2 := createTestAction("a2", "agent_1")

    dispatcher.Dispatch(action1)
    dispatcher.Dispatch(action2)

    queue := dispatcher.GetQueue()
    assert.Equal(t, "a1", queue[0].ID)
    assert.Equal(t, "a2", queue[1].ID)
}

func TestConcurrentMemoryAccess(t *testing.T) {
    mem := NewMemoryLayer()
    handle := mem.Allocate(4096)

    done := make(chan bool, 10)
    for i := 0; i < 10; i++ {
        go func(idx int) {
            data := []byte{byte(idx)}
            mem.Write(handle, data)
            done <- true
        }(i)
    }

    for i := 0; i < 10; i++ {
        <-done
    }

    // Should not deadlock or corrupt
    assert.NotNil(t, mem.Read(handle))
}
```

**Run via**: `go test ./...` (all tests), `go test -v` (verbose)

### 1.3 TypeScript/Jest Unit Tests

**Framework**: Jest

**Location**: `*.test.ts` or `*.spec.ts` files

```typescript
// In uiRenderer.test.ts
import { UIRenderer } from './uiRenderer';
import { RenderFrame } from './types';

describe('UIRenderer', () => {
    let renderer: UIRenderer;

    beforeEach(() => {
        renderer = new UIRenderer({ width: 1920, height: 1080 });
    });

    test('should render frame within 16ms (60fps)', () => {
        const frame: RenderFrame = {
            elements: generateLargeElementSet(1000),
            timestamp: Date.now(),
        };

        const start = performance.now();
        renderer.render(frame);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(16);
    });

    test('should reject invalid element properties', () => {
        const invalidFrame: RenderFrame = {
            elements: [
                {
                    id: 'elem_1',
                    x: -1, // Invalid: negative coordinate
                    y: 100,
                    width: 100,
                    height: 100,
                }
            ],
            timestamp: Date.now(),
        };

        expect(() => renderer.render(invalidFrame)).toThrow('Invalid coordinates');
    });

    test('should cache rendered textures', () => {
        const frame: RenderFrame = {
            elements: [{ id: 'e1', x: 0, y: 0, width: 100, height: 100 }],
            timestamp: Date.now(),
        };

        renderer.render(frame);
        const cacheSize1 = renderer.getCacheSize();

        renderer.render(frame); // Same frame again
        const cacheSize2 = renderer.getCacheSize();

        expect(cacheSize2).toBeLessThanOrEqual(cacheSize1);
    });
});
```

**Run via**: `jest` or `npm test`

---

## 2. Integration Testing

### 2.1 Cross-Layer Integration Tests

Test how components interact across subsystems without mocking internal behavior.

**Rust Integration Tests** (in `tests/` directory):

```rust
// tests/action_dispatch_to_memory.rs
use llm_os::{ActionDispatcher, MemoryLayer, Agent};

#[test]
fn test_agent_action_stores_state_in_memory() {
    let mut dispatcher = ActionDispatcher::new();
    let mut memory = MemoryLayer::new();
    let agent = Agent::new("reasoning_agent", &mut memory);

    let action = Action {
        id: "state_save_1".to_string(),
        agent_id: "reasoning_agent".to_string(),
        action_type: "save_state".to_string(),
        payload: serde_json::json!({
            "thoughts": "working through problem",
            "var_x": 42
        }),
        timestamp: SystemTime::now(),
    };

    dispatcher.dispatch(&action).unwrap();
    let result = dispatcher.execute_next(&mut memory).unwrap();

    // Verify state was stored in memory
    let state = memory.read_agent_state("reasoning_agent").unwrap();
    assert_eq!(state["var_x"], 42);
}

#[test]
fn test_agent_communication_via_action_queue() {
    let mut dispatcher = ActionDispatcher::new();
    let mut memory = MemoryLayer::new();

    let agent_a = Agent::new("perception_agent", &mut memory);
    let agent_b = Agent::new("action_agent", &mut memory);

    // Agent A processes and creates action for Agent B
    let action = Action {
        id: "perceived_gesture".to_string(),
        agent_id: "perception_agent".to_string(),
        action_type: "detect_gesture".to_string(),
        payload: serde_json::json!({"gesture": "swipe_right"}),
        timestamp: SystemTime::now(),
    };

    dispatcher.dispatch(&action).unwrap();
    dispatcher.execute_next(&mut memory).unwrap();

    // Agent B's action should now be in the queue
    let next = dispatcher.peek_next();
    assert_eq!(next.unwrap().agent_id, "action_agent");
}
```

### 2.2 Agent Communication Tests

```go
// In agent_coordination_test.go
package agent

func TestPerceptionToActionPipeline(t *testing.T) {
    dispatcher := dispatcher.NewDispatcher()
    percAgent := NewAgent("perception", dispatcher)
    actionAgent := NewAgent("action", dispatcher)

    // Simulate perception input
    percAgent.ProcessInput(InputFrame{
        Type:    "gesture",
        Gesture: "swipe",
        X:       100,
        Y:       200,
    })

    // Perception agent should have created action in queue
    assert.Greater(t, dispatcher.QueueSize(), 0)

    // Process the action
    action := dispatcher.DequeueAction()
    assert.Equal(t, "action", action.TargetAgent)

    result := actionAgent.Execute(action)
    assert.NoError(t, result.Error)
}

func TestMultiAgentConflictResolution(t *testing.T) {
    dispatcher := dispatcher.NewDispatcher()
    reasoningAgent := NewAgent("reasoning", dispatcher)
    planningAgent := NewAgent("planning", dispatcher)

    // Both agents try to create conflicting actions
    action1 := &Action{
        ID:     "act_1",
        Type:   "move_cursor",
        Payload: map[string]interface{}{"x": 100, "y": 200},
    }
    action2 := &Action{
        ID:     "act_2",
        Type:   "move_cursor",
        Payload: map[string]interface{}{"x": 300, "y": 400},
    }

    dispatcher.Dispatch(action1)
    dispatcher.Dispatch(action2)

    // Conflict resolver should intervene
    conflicts := dispatcher.DetectConflicts()
    assert.Greater(t, len(conflicts), 0)

    resolved := dispatcher.ResolveConflicts(conflicts)
    assert.True(t, resolved)
}
```

### 2.3 UI-to-Agent Integration

```typescript
// In integration/uiAgentLoop.test.ts
import { UIRenderer } from '../ui/uiRenderer';
import { ActionDispatcher } from '../agent/actionDispatcher';
import { Agent } from '../agent/agent';

describe('UI-Agent Integration Loop', () => {
    let renderer: UIRenderer;
    let dispatcher: ActionDispatcher;
    let uiAgent: Agent;

    beforeEach(() => {
        renderer = new UIRenderer();
        dispatcher = new ActionDispatcher();
        uiAgent = new Agent('ui_agent', dispatcher);
    });

    test('user gesture should trigger agent action and update UI', async () => {
        // User clicks button
        const clickAction = {
            id: 'click_1',
            type: 'user_gesture',
            gesture: 'click',
            x: 500,
            y: 300,
        };

        dispatcher.dispatch(clickAction);

        // UI agent processes click
        const result = await uiAgent.process();
        expect(result.status).toBe('success');

        // Render should include updated state
        const frame = dispatcher.getRenderFrame();
        expect(frame.elements).toContainEqual(
            expect.objectContaining({ highlighted: true })
        );
    });
});
```

---

## 3. LLM Simulator (Mock Model Testing)

Testing without making actual API calls to Claude or other models. Allows deterministic, fast test execution.

### 3.1 Rust Mock LLM

```rust
// In src/llm_simulator.rs
pub struct MockLLMResponse {
    pub input: String,
    pub response: String,
    pub latency_ms: u64,
}

pub struct LLMSimulator {
    script: Vec<MockLLMResponse>,
    index: usize,
}

impl LLMSimulator {
    pub fn new() -> Self {
        Self {
            script: vec![],
            index: 0,
        }
    }

    pub fn add_response(mut self, input: &str, response: &str, latency: u64) -> Self {
        self.script.push(MockLLMResponse {
            input: input.to_string(),
            response: response.to_string(),
            latency_ms: latency,
        });
        self
    }

    pub fn call(&mut self, prompt: &str) -> Result<LLMResponse, String> {
        if self.index >= self.script.len() {
            return Err("No more mock responses".to_string());
        }

        let mock = &self.script[self.index];
        self.index += 1;

        // Verify input matches expected
        if !prompt.contains(&mock.input) {
            eprintln!("Warning: prompt doesn't match expectation");
        }

        // Simulate latency
        std::thread::sleep(std::time::Duration::from_millis(mock.latency_ms));

        Ok(LLMResponse {
            text: mock.response.clone(),
            tokens: count_tokens(&mock.response),
        })
    }
}

// Usage in tests
#[test]
fn test_reasoning_agent_with_mock_llm() {
    let simulator = LLMSimulator::new()
        .add_response(
            "What color is the sky?",
            "The sky appears blue during the day.",
            50
        )
        .add_response(
            "Why is it blue?",
            "Rayleigh scattering of shorter wavelengths.",
            60
        );

    let agent = ReasoningAgent::new(Box::new(simulator));
    let result = agent.think("What color is the sky and why?").unwrap();

    assert!(result.contains("blue"));
    assert!(result.contains("scatter"));
}
```

### 3.2 Go Mock LLM

```go
// In llm/simulator.go
type MockResponse struct {
    Input      string
    Response   string
    LatencyMs  int
    ShouldFail bool
}

type LLMSimulator struct {
    script []MockResponse
    index  int
}

func NewLLMSimulator() *LLMSimulator {
    return &LLMSimulator{
        script: make([]MockResponse, 0),
        index:  0,
    }
}

func (s *LLMSimulator) AddResponse(input, response string, latencyMs int) *LLMSimulator {
    s.script = append(s.script, MockResponse{
        Input:     input,
        Response:  response,
        LatencyMs: latencyMs,
    })
    return s
}

func (s *LLMSimulator) AddFailure(input string) *LLMSimulator {
    s.script = append(s.script, MockResponse{
        Input:      input,
        ShouldFail: true,
    })
    return s
}

func (s *LLMSimulator) Call(ctx context.Context, prompt string) (string, error) {
    if s.index >= len(s.script) {
        return "", fmt.Errorf("no more mock responses")
    }

    mock := s.script[s.index]
    s.index++

    if mock.ShouldFail {
        return "", fmt.Errorf("simulated LLM failure")
    }

    time.Sleep(time.Duration(mock.LatencyMs) * time.Millisecond)
    return mock.Response, nil
}

// Usage in tests
func TestAgentDecisionMaking(t *testing.T) {
    simulator := NewLLMSimulator().
        AddResponse("Analyze this situation", "The best action is X", 100).
        AddResponse("Why is X better?", "Because X satisfies constraints", 80)

    agent := NewAgent(simulator)
    decision := agent.Decide(context.Background(), "Analyze this situation")

    assert.NoError(t, decision.Error)
    assert.Contains(t, decision.Action, "X")
}
```

### 3.3 TypeScript Mock LLM

```typescript
// In llm/simulator.ts
interface MockResponse {
    input: string;
    response: string;
    latencyMs: number;
    shouldFail?: boolean;
}

export class LLMSimulator {
    private script: MockResponse[] = [];
    private index = 0;

    addResponse(input: string, response: string, latencyMs: number): this {
        this.script.push({ input, response, latencyMs });
        return this;
    }

    addFailure(input: string, error: string = 'Simulated LLM failure'): this {
        this.script.push({ input, response: error, latencyMs: 0, shouldFail: true });
        return this;
    }

    async call(prompt: string): Promise<string> {
        if (this.index >= this.script.length) {
            throw new Error('No more mock responses');
        }

        const mock = this.script[this.index++];

        if (mock.shouldFail) {
            throw new Error(mock.response);
        }

        await new Promise(resolve => setTimeout(resolve, mock.latencyMs));
        return mock.response;
    }

    reset(): void {
        this.index = 0;
    }
}

// Usage in tests
describe('Agent with Mock LLM', () => {
    test('should process multi-turn conversation', async () => {
        const simulator = new LLMSimulator()
            .addResponse('Hello', 'Hello! How can I help?', 50)
            .addResponse('What time is it?', 'I don\'t have access to real time', 40);

        const agent = new ReasoningAgent(simulator);
        const r1 = await agent.process('Hello');
        const r2 = await agent.process('What time is it?');

        expect(r1).toContain('Hello');
        expect(r2).toContain('don\'t have');
    });

    test('should handle LLM failures gracefully', async () => {
        const simulator = new LLMSimulator()
            .addFailure('Intentional failure', 'API timeout');

        const agent = new ReasoningAgent(simulator);

        await expect(agent.process('Test')).rejects.toThrow('API timeout');
    });
});
```

---

## 4. Performance Benchmark Suite

Automated verification against hard latency budgets.

### 4.1 Latency Budgets

| Component | Budget | Margin | Verification Tool |
|-----------|--------|--------|-------------------|
| Action dispatch | 5 ms | 1 ms | `criterion` (Rust) |
| Action routing | 2 ms | 0.5 ms | Custom Rust benchmark |
| UI render frame | 16 ms | 2 ms | Jest performance tests |
| 60 fps verification | 16 ms avg | 1 ms | Frame time tracker |
| Agent response initiation | 100 ms | 20 ms | Go benchmarks |
| Memory read | 1 μs | 0.1 μs | Criterion |
| Memory write (atomic) | 10 μs | 2 μs | Criterion |
| State serialization | 50 ms | 10 ms | Benchmarks |

### 4.2 Rust Benchmarks (Criterion)

```rust
// In benches/action_dispatch.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use llm_os::ActionDispatcher;

fn benchmark_action_dispatch(c: &mut Criterion) {
    c.bench_function("dispatch_single_action", |b| {
        let mut dispatcher = ActionDispatcher::new();
        let action = create_test_action();

        b.iter(|| {
            dispatcher.dispatch(black_box(&action))
        });
    });

    c.bench_function("dispatch_10_actions", |b| {
        let mut dispatcher = ActionDispatcher::new();
        let actions: Vec<_> = (0..10).map(|i| create_test_action()).collect();

        b.iter(|| {
            for action in black_box(&actions) {
                dispatcher.dispatch(action).ok();
            }
        });
    });

    c.bench_function("route_action_to_agent", |b| {
        let dispatcher = ActionDispatcher::new();
        let action = create_test_action();

        b.iter(|| {
            dispatcher.route_to_agent(black_box(&action))
        });
    });
}

fn benchmark_memory_operations(c: &mut Criterion) {
    c.bench_function("memory_allocate_1kb", |b| {
        let mut memory = MemoryLayer::new();
        b.iter(|| {
            memory.allocate(black_box(1024))
        });
    });

    c.bench_function("memory_write_atomic_512b", |b| {
        let mut memory = MemoryLayer::new();
        let handle = memory.allocate(1024);
        let data = vec![42; 512];

        b.iter(|| {
            memory.write_atomic(black_box(&handle), black_box(&data)).ok()
        });
    });

    c.bench_function("memory_read_512b", |b| {
        let mut memory = MemoryLayer::new();
        let handle = memory.allocate(1024);
        memory.write(&handle, &vec![42; 512]).ok();

        b.iter(|| {
            memory.read(black_box(&handle)).ok()
        });
    });
}

criterion_group!(benches, benchmark_action_dispatch, benchmark_memory_operations);
criterion_main!(benches);
```

**Run via**: `cargo bench`

**Output Verification**:
```
action_dispatch/dispatch_single_action
                        time:   [2.45 ms 2.52 ms 2.61 ms]
                        ✓ Within 5ms budget
```

### 4.3 Go Benchmarks

```go
// In benchmarks_test.go
package dispatcher

import (
    "testing"
)

func BenchmarkActionDispatch(b *testing.B) {
    dispatcher := NewDispatcher()
    action := createTestAction()

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        dispatcher.Dispatch(action)
    }
}

func BenchmarkActionRoute(b *testing.B) {
    dispatcher := NewDispatcher()

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        action := &Action{
            ID:      fmt.Sprintf("act_%d", i),
            Type:    "test",
            AgentID: "test_agent",
        }
        dispatcher.Route(action)
    }
}

func BenchmarkMemoryWrite(b *testing.B) {
    mem := NewMemoryLayer()
    handle := mem.Allocate(4096)
    data := []byte{42}

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        mem.Write(handle, data)
    }
}
```

**Run via**: `go test -bench=. -benchmem`

### 4.4 TypeScript Performance Tests

```typescript
// In performance/rendering.perf.test.ts
describe('UI Rendering Performance', () => {
    let renderer: UIRenderer;

    beforeEach(() => {
        renderer = new UIRenderer({ width: 1920, height: 1080 });
    });

    test('render frame under 16ms (60fps target)', () => {
        const frame = generateComplexFrame(500); // 500 elements

        const start = performance.now();
        renderer.render(frame);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(16);
        console.log(`Frame render: ${elapsed.toFixed(2)}ms`);
    });

    test('60fps sustained over 100 frames', () => {
        const frames = Array.from({ length: 100 }, (_, i) =>
            generateComplexFrame(500, i)
        );

        const times: number[] = [];
        const start = performance.now();

        for (const frame of frames) {
            const frameStart = performance.now();
            renderer.render(frame);
            const frameEnd = performance.now();
            times.push(frameEnd - frameStart);
        }

        const totalTime = performance.now() - start;
        const avgFrameTime = totalTime / 100;
        const maxFrameTime = Math.max(...times);

        expect(avgFrameTime).toBeLessThan(16);
        expect(maxFrameTime).toBeLessThan(20); // Allow 1 frame jank

        console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
        console.log(`Max frame time: ${maxFrameTime.toFixed(2)}ms`);
        console.log(`Sustained FPS: ${(1000 / avgFrameTime).toFixed(1)}`);
    });

    test('agent response initiation under 100ms', async () => {
        const agent = new Agent('test_agent');
        const input = 'Complex reasoning task';

        const start = performance.now();
        const promise = agent.process(input);
        const elapsed = performance.now() - start;

        // Just initiating should be sub-100ms
        expect(elapsed).toBeLessThan(100);

        await promise; // Wait for completion
    });
});
```

**Run via**: `jest --testPathPattern=perf`

---

## 5. Adversarial Testing

Testing failure modes and edge cases that could break the system.

### 5.1 Broken Action Scenarios

```rust
// In tests/adversarial.rs
#[test]
fn test_malformed_action_payload() {
    let dispatcher = ActionDispatcher::new();

    let malformed = Action {
        id: "bad_1".to_string(),
        agent_id: "agent_1".to_string(),
        action_type: "move_cursor".to_string(),
        payload: serde_json::json!(null), // Invalid: null payload
        timestamp: SystemTime::now(),
    };

    // Should not crash, should queue error action
    let result = dispatcher.dispatch(&malformed);
    assert!(result.is_err() || dispatcher.has_error_action());
}

#[test]
fn test_action_with_missing_required_fields() {
    let dispatcher = ActionDispatcher::new();

    // Try to create action with missing fields
    let result = Action::builder()
        .id("act_1")
        // Missing agent_id
        .action_type("test")
        .build();

    assert!(result.is_err());
}

#[test]
fn test_recursive_action_creation() {
    let dispatcher = ActionDispatcher::new();
    let memory = MemoryLayer::new();

    // Agent creates action that creates action that creates...
    let action = Action {
        id: "recursive".to_string(),
        agent_id: "agent_1".to_string(),
        action_type: "create_action".to_string(),
        payload: serde_json::json!({
            "creates_new_action": true,
            "depth": 1000 // Would create 1000 nested actions
        }),
        timestamp: SystemTime::now(),
    };

    // Should have recursion limit
    let result = dispatcher.execute(&action, &memory);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("recursion") ||
            result.unwrap_err().contains("depth"));
}

#[test]
fn test_action_id_collision() {
    let dispatcher = ActionDispatcher::new();

    let action1 = Action {
        id: "duplicate_id".to_string(),
        agent_id: "agent_1".to_string(),
        action_type: "test".to_string(),
        payload: serde_json::json!({}),
        timestamp: SystemTime::now(),
    };

    let action2 = action1.clone();

    dispatcher.dispatch(&action1).unwrap();
    let result = dispatcher.dispatch(&action2);

    // Should reject duplicate or handle gracefully
    assert!(result.is_err() || dispatcher.get_dedup_key(&action2).is_some());
}
```

### 5.2 Agent Conflict Scenarios

```go
// In agent_conflict_test.go
func TestConflictingAgentActions(t *testing.T) {
    dispatcher := dispatcher.NewDispatcher()
    agent1 := NewAgent("planning_1", dispatcher)
    agent2 := NewAgent("planning_2", dispatcher)

    // Both agents decide to control the same resource
    action1 := &Action{
        ID:       "act_1",
        Type:     "move_cursor",
        AgentID:  "planning_1",
        Payload:  map[string]interface{}{"x": 100, "y": 100},
    }

    action2 := &Action{
        ID:       "act_2",
        Type:     "move_cursor",
        AgentID:  "planning_2",
        Payload:  map[string]interface{}{"x": 500, "y": 500},
    }

    dispatcher.Dispatch(action1)
    dispatcher.Dispatch(action2)

    // System should detect conflict
    conflicts := dispatcher.DetectConflicts()
    assert.Greater(t, len(conflicts), 0, "Should detect cursor movement conflict")

    // Should resolve deterministically
    winner := dispatcher.ResolveConflicts(conflicts)
    assert.NotNil(t, winner)

    // Losing agent should be notified
    feedback := dispatcher.GetConflictFeedback("planning_2")
    assert.NotEmpty(t, feedback)
}

func TestAgentResourceDeadlock(t *testing.T) {
    dispatcher := dispatcher.NewDispatcher()
    agent1 := NewAgent("agent_1", dispatcher)
    agent2 := NewAgent("agent_2", dispatcher)

    // Agent 1 locks resource A, waits for B
    // Agent 2 locks resource B, waits for A
    // Classic deadlock scenario

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    go agent1.AcquireResources(ctx, []string{"A"})
    go agent2.AcquireResources(ctx, []string{"B"})

    // Wait for potential deadlock
    <-ctx.Done()

    // Should have deadlock detector
    if ctx.Err() == context.DeadlineExceeded {
        deadlocks := dispatcher.DetectDeadlocks()
        assert.Greater(t, len(deadlocks), 0, "Should detect deadlock")

        resolved := dispatcher.ResolveDeadlock(deadlocks[0])
        assert.True(t, resolved)
    }
}
```

### 5.3 Memory Pressure Scenarios

```typescript
// In adversarial/memory-pressure.test.ts
describe('Adversarial Memory Scenarios', () => {
    test('should handle memory exhaustion gracefully', () => {
        const memory = new MemoryLayer(100); // 100 byte limit

        // Try to allocate beyond limit
        const handles: MemoryHandle[] = [];

        // Allocate 80 bytes (should succeed)
        handles.push(memory.allocate(80));
        expect(memory.getFreeSpace()).toBeLessThan(20);

        // Try to allocate 50 more bytes (should fail)
        expect(() => memory.allocate(50)).toThrow('Insufficient memory');

        // Cleanup should work
        memory.free(handles[0]);
        expect(memory.getFreeSpace()).toBe(100);
    });

    test('should prevent memory corruption from bad writes', () => {
        const memory = new MemoryLayer(1000);
        const handle1 = memory.allocate(100);
        const handle2 = memory.allocate(100);

        // Write to handle1
        const data1 = new Uint8Array(100);
        data1.fill(42);
        memory.write(handle1, data1);

        // Attempt buffer overflow write from handle1
        const overflowData = new Uint8Array(200);
        overflowData.fill(99);

        expect(() => memory.write(handle1, overflowData)).toThrow('Bounds violation');

        // Verify handle2 wasn't corrupted
        const read2 = memory.read(handle2);
        expect(read2).not.toContain(99);
    });

    test('should handle memory fragmentation', () => {
        const memory = new MemoryLayer(1000);

        // Allocate, free, allocate pattern causing fragmentation
        const handles: MemoryHandle[] = [];
        for (let i = 0; i < 10; i++) {
            handles.push(memory.allocate(50));
        }

        // Free every other allocation
        for (let i = 0; i < 10; i += 2) {
            memory.free(handles[i]);
        }

        // System should still handle allocation
        const newHandle = memory.allocate(80);
        expect(newHandle).toBeDefined();

        // Should have defragmented
        const fragmentation = memory.getFragmentationRatio();
        expect(fragmentation).toBeLessThan(0.3); // Less than 30% waste
    });
});
```

### 5.4 Unexpected User Input

```rust
// In tests/adversarial_user_input.rs
#[test]
fn test_extreme_gesture_coordinates() {
    let gesture = UserGesture {
        gesture_type: GestureType::Swipe,
        start_x: i32::MIN,
        start_y: i32::MAX,
        end_x: i32::MAX,
        end_y: i32::MIN,
        duration_ms: 1,
    };

    // Should clamp or reject safely
    let result = validate_gesture(&gesture);
    assert!(result.is_ok() || result.is_err());
    // But should NOT crash
}

#[test]
fn test_rapid_repeated_input() {
    let input_stream: Vec<_> = (0..10000)
        .map(|i| UserGesture {
            gesture_type: GestureType::Click,
            start_x: 100 + (i % 1920),
            start_y: 100,
            end_x: 100,
            end_y: 100,
            duration_ms: 1,
        })
        .collect();

    let dispatcher = ActionDispatcher::new();

    for gesture in input_stream {
        let result = dispatcher.dispatch_gesture(&gesture);
        // Should queue or drop gracefully, not crash
        assert!(result.is_ok() || result.is_err());
    }
}

#[test]
fn test_invalid_utf8_in_text_input() {
    let invalid_utf8 = vec![0xFF, 0xFE, 0xFD];

    let result = process_text_input(&invalid_utf8);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("UTF-8") ||
            result.unwrap_err().contains("encoding"));
}

#[test]
fn test_zero_size_gesture() {
    let gesture = UserGesture {
        gesture_type: GestureType::Swipe,
        start_x: 100,
        start_y: 100,
        end_x: 100, // Same as start
        end_y: 100,
        duration_ms: 0, // Zero duration
    };

    // Should reject or treat as no-op
    let result = validate_gesture(&gesture);
    assert!(result.is_err() || !gesture.is_meaningful());
}
```

---

## 6. End-to-End Testing

Full user flow simulation from input to rendered output.

### 6.1 Rust E2E Test

```rust
// In tests/e2e_user_flow.rs
#[test]
fn test_user_gesture_to_screen_update() {
    // Setup entire system
    let mut dispatcher = ActionDispatcher::new();
    let mut memory = MemoryLayer::new();
    let mut renderer = UIRenderer::new(1920, 1080);

    let perception_agent = Agent::new("perception", &mut memory);
    let reasoning_agent = Agent::new("reasoning", &mut memory);
    let action_agent = Agent::new("action", &mut memory);

    // User performs gesture
    let gesture = UserGesture {
        gesture_type: GestureType::Click,
        start_x: 500,
        start_y: 300,
        end_x: 500,
        end_y: 300,
        duration_ms: 50,
    };

    // Step 1: Perception agent processes gesture
    let action1 = perception_agent.process_gesture(&gesture).unwrap();
    dispatcher.dispatch(&action1).unwrap();

    // Step 2: Reasoning agent makes decision
    dispatcher.execute_next(&mut memory).unwrap();
    let action2 = reasoning_agent.get_pending_action().unwrap();
    dispatcher.dispatch(&action2).unwrap();

    // Step 3: Action agent executes
    dispatcher.execute_next(&mut memory).unwrap();
    let action3 = action_agent.get_pending_action().unwrap();
    dispatcher.dispatch(&action3).unwrap();

    // Step 4: Get render frame and verify screen updated
    let frame = dispatcher.get_render_frame().unwrap();
    assert!(!frame.elements.is_empty());

    let rendered = renderer.render(&frame).unwrap();
    assert!(rendered.changed); // Screen should update
}
```

### 6.2 Go E2E Test

```go
// In e2e_test.go
func TestCompleteUserInteractionFlow(t *testing.T) {
    // Initialize system components
    dispatcher := dispatcher.NewDispatcher()
    percAgent := NewAgent("perception", dispatcher)
    reasonAgent := NewAgent("reasoning", dispatcher)
    actionAgent := NewAgent("action", dispatcher)
    renderer := NewUIRenderer(1920, 1080)

    // Simulate user clicking on a button
    gesture := UserGesture{
        Type:     "click",
        X:        600,
        Y:        400,
        Duration: 50 * time.Millisecond,
    }

    // Process through system
    percAgent.ProcessInput(gesture)

    // Reasoning should create next action
    reasonAgent.Process()
    action := dispatcher.DequeueAction()
    assert.NotNil(t, action)

    // Action agent executes
    result := actionAgent.Execute(action)
    assert.NoError(t, result.Error)

    // Verify UI updated
    frame := dispatcher.GetRenderFrame()
    assert.NotEmpty(t, frame.Elements)

    // Render should complete in time
    start := time.Now()
    rendered := renderer.Render(frame)
    elapsed := time.Since(start)

    assert.True(t, rendered.Changed)
    assert.Less(t, elapsed, 20*time.Millisecond)
}
```

---

## 7. UI Testing

Rendering correctness, frame timing, and visual accuracy.

### 7.1 Frame Rate Verification

```typescript
// In ui/rendering.test.ts
describe('Frame Rate Verification', () => {
    test('maintains 60fps over sustained session', async () => {
        const renderer = new UIRenderer();
        const frameTimings: number[] = [];
        const totalFrames = 300; // 5 seconds at 60fps

        const startTime = performance.now();

        for (let i = 0; i < totalFrames; i++) {
            const frameStart = performance.now();

            const frame = generateFrame(i);
            renderer.render(frame);

            const frameEnd = performance.now();
            frameTimings.push(frameEnd - frameStart);

            // Simulate 16.67ms frame target
            const remainingTime = 16.67 - (frameEnd - frameStart);
            if (remainingTime > 0) {
                await sleep(remainingTime);
            }
        }

        const totalTime = performance.now() - startTime;
        const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / totalFrames;
        const droppedFrames = frameTimings.filter(t => t > 20).length;
        const consistency = calculateVariance(frameTimings);

        console.log({
            avgFrameTime: avgFrameTime.toFixed(2),
            droppedFrames,
            consistency: consistency.toFixed(3),
            actualFps: (1000 / avgFrameTime).toFixed(1),
        });

        expect(avgFrameTime).toBeLessThan(16.67);
        expect(droppedFrames).toBeLessThan(3); // Allow <1% jank
        expect(consistency).toBeLessThan(0.2); // Low variance
    });
});
```

### 7.2 Rendering Correctness

```typescript
// In ui/rendering-correctness.test.ts
describe('UI Rendering Correctness', () => {
    test('renders all UI elements in correct positions', () => {
        const renderer = new UIRenderer();
        const frame: RenderFrame = {
            elements: [
                { id: 'btn_1', x: 100, y: 100, width: 50, height: 50, type: 'button' },
                { id: 'txt_1', x: 200, y: 100, width: 200, height: 20, type: 'text' },
                { id: 'img_1', x: 100, y: 200, width: 100, height: 100, type: 'image' },
            ],
            timestamp: Date.now(),
        };

        const canvas = renderer.render(frame);

        // Verify button position
        const button = canvas.getElementAt(125, 125);
        expect(button.id).toBe('btn_1');

        // Verify text position
        const text = canvas.getElementAt(250, 110);
        expect(text.id).toBe('txt_1');

        // Verify image position
        const image = canvas.getElementAt(150, 250);
        expect(image.id).toBe('img_1');
    });

    test('applies styles correctly', () => {
        const renderer = new UIRenderer();
        const frame: RenderFrame = {
            elements: [
                {
                    id: 'styled_btn',
                    x: 100,
                    y: 100,
                    width: 100,
                    height: 50,
                    backgroundColor: '#FF0000',
                    borderRadius: 5,
                    opacity: 0.8,
                }
            ],
            timestamp: Date.now(),
        };

        const canvas = renderer.render(frame);
        const button = canvas.getElement('styled_btn');

        expect(button.computedStyle.backgroundColor).toBe('#FF0000');
        expect(button.computedStyle.borderRadius).toBe(5);
        expect(button.computedStyle.opacity).toBe(0.8);
    });
});
```

---

## 8. Memory System Testing

All four layers: registers, call stack, heap, and virtual memory.

### 8.1 Register Layer Tests

```rust
// In tests/memory_registers.rs
#[test]
fn test_register_allocation() {
    let mut registers = RegisterLayer::new();

    let r1 = registers.allocate_register("var_x", VariableType::Integer).unwrap();
    let r2 = registers.allocate_register("var_y", VariableType::Float).unwrap();

    assert_eq!(r1.id, 0);
    assert_eq!(r2.id, 1);
}

#[test]
fn test_register_overflow() {
    let mut registers = RegisterLayer::new();

    // Allocate all available registers
    for i in 0..64 {
        let result = registers.allocate_register(
            &format!("var_{}", i),
            VariableType::Integer
        );

        if i < 64 {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err());
        }
    }
}

#[test]
fn test_register_context_switch() {
    let mut registers = RegisterLayer::new();

    // Save context
    registers.allocate_register("var_1", VariableType::Integer).ok();
    let context1 = registers.save_context();

    // New context
    registers.clear();
    registers.allocate_register("var_2", VariableType::Float).ok();

    // Restore context
    registers.restore_context(&context1);

    let var1 = registers.get_register("var_1");
    assert!(var1.is_some());
}
```

### 8.2 Stack Tests

```rust
// In tests/memory_stack.rs
#[test]
fn test_function_call_stack() {
    let mut stack = CallStack::new();

    // Push function frame
    stack.push_frame(StackFrame {
        function_name: "main".to_string(),
        return_address: 0x1000,
        local_vars: vec![
            ("x".to_string(), Value::Integer(10)),
            ("y".to_string(), Value::Integer(20)),
        ],
    }).unwrap();

    // Nested function call
    stack.push_frame(StackFrame {
        function_name: "helper".to_string(),
        return_address: 0x2000,
        local_vars: vec![
            ("result".to_string(), Value::Integer(0)),
        ],
    }).unwrap();

    assert_eq!(stack.depth(), 2);

    // Pop back to main
    let frame = stack.pop().unwrap();
    assert_eq!(frame.function_name, "helper");
    assert_eq!(stack.depth(), 1);
}

#[test]
fn test_stack_overflow() {
    let mut stack = CallStack::new();
    let max_depth = 10000;

    for i in 0..max_depth {
        let result = stack.push_frame(StackFrame {
            function_name: format!("func_{}", i),
            return_address: i as u64,
            local_vars: vec![],
        });

        if i < max_depth - 1 {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err());
        }
    }
}
```

### 8.3 Heap Tests

```go
// In memory/heap_test.go
func TestHeapAllocation(t *testing.T) {
    heap := NewHeap(1024 * 1024) // 1MB

    h1 := heap.Allocate(1024)
    assert.NotNil(t, h1)

    h2 := heap.Allocate(2048)
    assert.NotNil(t, h2)

    data := []byte{42, 43, 44}
    heap.Write(h1, data)

    read := heap.Read(h1)
    assert.Equal(t, data, read)
}

func TestHeapFragmentation(t *testing.T) {
    heap := NewHeap(10240)

    handles := make([]HeapHandle, 10)
    for i := 0; i < 10; i++ {
        handles[i] = heap.Allocate(512)
    }

    // Free alternating blocks
    for i := 0; i < 10; i += 2 {
        heap.Free(handles[i])
    }

    // Should still allocate
    h := heap.Allocate(1024)
    assert.NotNil(t, h)

    frag := heap.Fragmentation()
    assert.Less(t, frag, 0.5)
}
```

### 8.4 Virtual Memory Tests

```typescript
// In memory/virtual.test.ts
describe('Virtual Memory', () => {
    test('maps virtual to physical addresses', () => {
        const vmem = new VirtualMemory(4096); // 4KB pages

        const vaddr = vmem.allocate(512);
        expect(vaddr).toBeDefined();

        const paddr = vmem.resolvePage(vaddr);
        expect(paddr).toBeGreaterThanOrEqual(0);
    });

    test('handles page faults', () => {
        const vmem = new VirtualMemory(4096);
        const vaddr = vmem.allocate(512);

        // Access before loading triggers fault
        expect(vmem.getPageFaultCount()).toBe(0);

        vmem.read(vaddr, 256);
        // Should load page on demand

        expect(vmem.getPageFaultCount()).toBeGreaterThan(0);
    });

    test('pages out to swap correctly', () => {
        const vmem = new VirtualMemory(4096, 8192); // 4KB physical, 8KB virtual

        const v1 = vmem.allocate(3000);
        const v2 = vmem.allocate(3000);

        // Second allocation should spill to swap
        expect(vmem.getSwapUsage()).toBeGreaterThan(0);

        // Reading from swapped page should restore
        const data = vmem.read(v1, 512);
        expect(data).toBeDefined();
    });
});
```

---

## 9. Security Testing

Sandbox escape attempts, permission violations, resource abuse.

### 9.1 Sandbox Escape Tests

```rust
// In tests/security_sandbox.rs
#[test]
fn test_agent_cannot_access_sibling_state() {
    let mut memory = MemoryLayer::new();

    let agent_a_state = memory.allocate_agent_state("agent_a", 1024);
    let agent_b_state = memory.allocate_agent_state("agent_b", 1024);

    // Write secret to agent_a
    let secret = serde_json::json!({"secret": "top_secret_key"});
    memory.write_agent_state("agent_a", &secret).unwrap();

    // Try to read agent_a state as agent_b
    let result = memory.read_agent_state_as("agent_b", "agent_a");

    // Should fail
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("permission") ||
            result.unwrap_err().contains("denied"));
}

#[test]
fn test_agent_cannot_modify_action_queue() {
    let mut dispatcher = ActionDispatcher::new();

    // Only dispatcher should modify queue
    let result = dispatcher.direct_write_to_queue("agent_1", Action::default());

    assert!(result.is_err());
}

#[test]
fn test_agent_memory_isolation() {
    let mut memory = MemoryLayer::new();

    let a_handle = memory.allocate_to_agent("agent_a", 512);
    let b_handle = memory.allocate_to_agent("agent_b", 512);

    // Write from agent_a
    memory.write_as(&a_handle, &vec![99; 512], "agent_a").unwrap();

    // Try to read from agent_b
    let result = memory.read_as(&a_handle, "agent_b");

    assert!(result.is_err());
}

#[test]
fn test_buffer_overflow_prevented() {
    let mut memory = MemoryLayer::new();
    let handle = memory.allocate(256);

    // Try to write beyond bounds
    let oversized = vec![0xFF; 512];
    let result = memory.write(&handle, &oversized);

    assert!(result.is_err());
}
```

### 9.2 Permission Violation Tests

```go
// In security/permissions_test.go
func TestAgentPermissionCheck(t *testing.T) {
    dispatcher := dispatcher.NewDispatcher()
    agent := NewAgent("untrusted", dispatcher)

    // Agent tries action it doesn't have permission for
    action := &Action{
        Type:       "delete_file",
        Permission: "system.delete_file",
    }

    result := agent.Execute(action)
    assert.Error(t, result.Error)
    assert.Contains(t, result.Error.Error(), "permission denied")
}

func TestCapabilityIsolation(t *testing.T) {
    // Agent with minimal capability set
    limited := NewAgent("limited").WithCapabilities([]string{
        "input.gesture_handler",
        "ui.render",
    })

    // Try to use unauthorized capability
    action := &Action{Type: "access_filesystem"}
    result := limited.Execute(action)

    assert.Error(t, result.Error)
    assert.Contains(t, result.Error.Error(), "capability")
}
```

### 9.3 Resource Abuse Prevention

```typescript
// in security/resource-limits.test.ts
describe('Resource Abuse Prevention', () => {
    test('should enforce action rate limit', () => {
        const agent = new Agent('test');
        const limiter = new RateLimiter(agent, 100); // 100 actions/sec

        let successCount = 0;
        for (let i = 0; i < 200; i++) {
            const result = limiter.checkAction();
            if (result.allowed) successCount++;
        }

        // Should be less than 110 (allowing burst)
        expect(successCount).toBeLessThan(120);
    });

    test('should prevent memory exhaustion attacks', () => {
        const agent = new Agent('test', { memoryQuota: 10 * 1024 * 1024 });

        let allocations = 0;
        try {
            while (true) {
                agent.allocateMemory(1 * 1024 * 1024); // 1MB chunks
                allocations++;
            }
        } catch (e) {
            // Expected: quota exceeded
            expect(e.message).toContain('quota');
        }

        expect(allocations).toBeLessThanOrEqual(10);
    });

    test('should timeout runaway agent processes', async () => {
        const agent = new Agent('runaway', { timeout: 1000 });

        const promise = agent.run(async () => {
            while (true) {
                // Infinite loop
            }
        });

        await expect(promise).rejects.toThrow('timeout');
    });
});
```

---

## 10. Regression Testing

Preventing reintroduction of fixed bugs.

### 10.1 Regression Test Suite

```rust
// In tests/regressions.rs
// Issue #42: Action dispatcher loses actions under load
#[test]
fn test_regression_issue_42_action_loss() {
    let dispatcher = ActionDispatcher::new();
    let mut actions_sent = 0;

    // Send 10000 actions rapidly
    for i in 0..10000 {
        let action = Action {
            id: format!("act_{}", i),
            agent_id: "test".to_string(),
            action_type: "test".to_string(),
            payload: serde_json::json!({}),
            timestamp: SystemTime::now(),
        };

        if dispatcher.dispatch(&action).is_ok() {
            actions_sent += 1;
        }
    }

    // All actions should be queued
    let queued = dispatcher.queue_size();
    assert_eq!(actions_sent, queued, "Issue #42: Actions lost in dispatch");
}

// Issue #156: Memory corruption on concurrent writes
#[test]
fn test_regression_issue_156_memory_corruption() {
    let memory = Arc::new(Mutex::new(MemoryLayer::new()));
    let handle = memory.lock().unwrap().allocate(1024);

    let mut handles = vec![];

    for _ in 0..100 {
        let mem_clone = Arc::clone(&memory);
        let h = handle.clone();

        handles.push(std::thread::spawn(move || {
            let data = vec![42; 512];
            mem_clone.lock().unwrap().write(&h, &data).ok();
        }));
    }

    for handle in handles {
        handle.join().ok();
    }

    // Verify no corruption
    let final_read = memory.lock().unwrap().read(&handle).unwrap();
    assert!(final_read.iter().all(|&b| b == 42));
}
```

---

## 11. CI/CD Integration

### 11.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --lib
      - run: cargo test --test '*'
      - run: cargo bench --no-run
      - run: cargo clippy -- -D warnings

  go-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - run: go test -v -race ./...
      - run: go test -bench=. -benchmem ./...
      - run: go vet ./...

  typescript-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:perf
      - run: npm run lint

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: cargo tarpaulin --out Xml
      - uses: codecov/codecov-action@v3
```

---

## 12. Test Coverage Targets

| Component | Target | Current | Tool |
|-----------|--------|---------|------|
| Action Dispatcher | 95% | - | cargo-tarpaulin |
| Memory Layer | 98% | - | cargo-tarpaulin |
| Agent Coordination | 90% | - | gocover |
| UI Renderer | 85% | - | Istanbul |
| LLM Integration | 75% | - | cargo-tarpaulin + gocover |
| Overall | 90%+ | - | Combined |

---

## 13. Testing Tools and Frameworks

### Rust Ecosystem
- **Unit Testing**: `#[test]` macro, `cargo test`
- **Integration Tests**: `tests/` directory
- **Benchmarking**: `criterion` crate
- **Coverage**: `cargo tarpaulin`, `cargo llvm-cov`
- **Mocking**: `mockito`, `faux`
- **Performance**: `cargo flamegraph`, `perf`

### Go Ecosystem
- **Testing**: `testing` package, `go test`
- **Assertions**: `testify/assert`, `testify/require`
- **Benchmarking**: `testing.B`, `go test -bench`
- **Coverage**: `go test -cover`, `gocover`
- **Race Detection**: `go test -race`
- **Mocking**: `gomock`, `testify/mock`

### TypeScript/JavaScript Ecosystem
- **Testing**: Jest, Mocha, Jasmine
- **Assertions**: Jest matchers, Chai
- **Performance**: `performance.now()`, custom timers
- **Coverage**: Istanbul, nyc
- **E2E**: Cypress, Playwright
- **Mocking**: `jest.mock()`, `sinon`

---

## 14. Test Execution Checklist

Before committing code:

- [ ] Run all unit tests: `cargo test && go test ./... && npm test`
- [ ] Check coverage above thresholds: `cargo tarpaulin --minimum 90`
- [ ] Run performance tests: `cargo bench`, `npm run test:perf`
- [ ] No clippy/lint warnings: `cargo clippy`, `golangci-lint`
- [ ] Adversarial tests pass: `cargo test --test adversarial`
- [ ] Memory tests pass: `cargo test memory`
- [ ] Security tests pass: `cargo test security`
- [ ] E2E tests pass in simulator (no real LLM calls)

Before release:

- [ ] Full test suite passes on target platforms
- [ ] Benchmark results within budget (action <5ms, render <16ms, agent <100ms)
- [ ] No regressions in past issue fixes
- [ ] Coverage report generated and reviewed
- [ ] Performance profiling shows no memory leaks
- [ ] Security audit completed

---

## 15. Debugging and Test Diagnostics

### Capturing Test Failures

```rust
// Use RUST_BACKTRACE for detailed stack traces
// $ RUST_BACKTRACE=1 cargo test test_name -- --nocapture

// Capture output
#[test]
fn test_with_debug_output() {
    println!("Debug info: {:?}", variable);
    eprintln!("Error info: {:?}", error);
}
```

### Profiling Slow Tests

```bash
# Find slowest tests
cargo test -- --nocapture --test-threads=1

# Profile with flamegraph
cargo flamegraph --bench action_dispatch
```

### Monitoring Test Flakiness

Track which tests fail intermittently:

```yaml
# Add to CI: record flaky test patterns
- name: Parse test results
  run: |
    grep -E "FAILED|flaky" test-results.xml | tee flaky-tests.log
```

---

## Summary

This testing strategy provides:
- **Comprehensive coverage** across all layers (unit, integration, E2E)
- **Performance guarantees** verified with automated benchmarks
- **Reliability** through adversarial and regression testing
- **Security** with sandbox and permission tests
- **Determinism** via LLM simulator for reproducible testing
- **Tooling** appropriate to each language (Rust, Go, TypeScript)

The strategy assumes team members unfamiliar with OS testing and provides detailed examples for each testing layer. No real LLM API calls are required during testing—the simulator handles all scenarios deterministically.
