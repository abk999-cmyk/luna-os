# Performance Architecture & Speed Requirements

**Document 5 of 26** | LLM-Native OS Specification
**Status:** Foundational Specification
**Critical:** All latency budgets are hard requirements, not aspirations.

---

## Executive Summary

Speed is the defining characteristic of this OS. Every architectural decision prioritizes latency over other concerns. The system operates under strict latency budgets that cascade through all 26 specification documents. These budgets are not optimization targets—they are architectural constraints that must be met.

The tech stack was selected specifically to achieve these latencies:
- **Rust:** Systems-level performance, zero GC pauses, memory safety without runtime overhead
- **Go:** Fast concurrent orchestration with native binaries
- **TypeScript + WebGPU:** GPU-accelerated dynamic rendering with instant component hydration
- **Tauri:** Near-native execution with web flexibility

This document establishes the latency budgets and architectural patterns that enable them.

---

## Part 1: Hard Latency Budgets

All times are measured wall-clock. All budgets include full stack latency (input → processing → output).

### 1.1 Core Action Pipeline

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **Action Dispatch** | <5ms | From intent received to execution started. This is the heartbeat of the system. 5ms allows 200 actions/sec. No GC, no blocking I/O at this level. |
| **Action Registration** | <2ms | New action into registry. Synchronous operation, in-memory only. Must not block dispatch loop. |
| **Capability Manifest Update Propagation** | <10ms | Capability change broadcast to all agents. Asynchronous, but must complete within one action dispatch cycle to prevent capability de-sync. |

### 1.2 Rendering & UI

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **UI Frame Render** | <16.67ms | 60fps mandate. 1000ms / 60 = 16.67ms per frame. Includes layout, rasterization, GPU upload. Non-negotiable. |
| **Dynamic App/Widget Initial Render** | <33ms | Two frame budget (33.34ms). Longer than steady-state because first render may require hydration. Must not exceed 2 frames or user perceives lag. |
| **Workspace Switch Visual Transition** | <50ms | User perceives workspace switch as instant if <50ms. Includes render of new workspace UI and hide of old. Achievable with GPU blitting and pre-rendered content. |

### 1.3 Working Memory (The Performance Lever)

Working memory is the OS's finite LLM context window. Access patterns determine model quality and latency.

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **Working Memory Read** | <1ms | Retrieve chunk from active context. In-memory, indexed by spatial reference. Synchronous. Agents must not stall on memory reads. |
| **Working Memory Write** | <2ms | Write chunk to active context, update indices. In-memory, but includes dirty-bit marking for async persistence. |
| **Scratchpad Read/Write Between Agents** | <5ms | Cross-agent communication via scratchpad. Includes IPC overhead. Must complete before agent yields. |
| **Spatial Reference Map Update** | <3ms | Update location/scope mappings in working memory. Synchronous, in-memory. Agents reference these on every context decision. |

### 1.4 Agent Lifecycle

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **Agent Spawn** | <20ms | Create new agent process/thread, allocate initial context. Includes state copy from parent or template. Must not exceed one frame. |
| **Escalation to Orchestrator** | <10ms | Leaf agent handoff to orchestrator. Must complete before orchestrator makes routing decision. |
| **Cross-Workspace Communication** | <25ms | Message from one workspace agent to another. Includes routing, state synchronization. Async allowed but must initiate within this budget. |
| **Voice Input to Action Initiation** | <100ms | Spoken intent → action dispatch started. Includes speech recognition, intent classification, dispatch. LLM may not be involved. |

### 1.5 Model Integration

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **Model Inference Routing** | <50ms | Route model call to appropriate tier (local vs cloud, conductor vs orchestrator). Includes decision logic, no model execution. |
| **Agent Response Initiated** | <100ms | Agent issues first token or decision. Streaming may continue beyond this. Used to measure perceived latency. |
| **Agent Response Completion** | <1s | Full agent response available (streaming complete or single response). Sets timeout for agent work. |

### 1.6 Context & Content Ingestion

| Component | Latency Budget | Rationale |
|-----------|-----------------|-----------|
| **Drop-as-Context Ingestion** | <200ms | File/URL dropped on workspace becomes accessible to agents. Includes: fetch, parse, chunk, embed snippet, spatial index. Full indexing may be async. |
| **Capability Manifest Parsing** | <5ms | Parse new manifest (likely from agent). Synchronous. Manifests are small structured data. |

---

## Part 2: Why Each Language Was Chosen for Speed

### 2.1 Rust: Kernel, Compositor, Dispatch, Memory Management

**Why Rust for latency-critical systems:**

1. **Zero GC Pauses**
   - Go and TypeScript both have garbage collectors that can pause execution 10-100ms
   - Rust has ownership-based memory management with deterministic freeing
   - Action dispatch loop must never pause for GC—5ms budget is unreachable with GC
   - Working memory reads can never block for garbage collection

2. **No Runtime Overhead**
   - Rust compiles to machine code with zero-cost abstractions
   - No JIT startup, no bytecode interpretation
   - Thread spawn (agent spawn) is native OS thread creation
   - Memory layout is explicit and cache-optimal

3. **Systems-Level Performance**
   - Direct kernel calls without abstraction layers
   - Mutable borrowing prevents data races at compile time
   - Stack allocation preferred over heap for small, bounded structures
   - SIMD vectorization is idiomatic

**Rust subsystems:**

- **Action Dispatch Engine:** Central event loop, no allocations in hot path
- **Window Compositor:** GPU command generation, pixel blitting, frame sync
- **Rendering Engine:** Layout calculation, rasterization, texture atlas management
- **Memory Manager:** Working memory arena allocator, spatial index, eviction policy
- **IPC Layer:** Cross-agent communication, scratchpad synchronization

**Rust performance guarantees:**

- Action dispatch loop: single-threaded, lock-free event queue, <100µs per dispatch cycle
- Compositor: frame lock (16.67ms hard deadline), pre-allocated GPU command buffers
- Memory access: zero-copy where possible, copy only when moving between address spaces

### 2.2 Go: Agent Orchestration, Model Integration, Middleware

**Why Go for agent-scale concurrency:**

1. **Goroutines: Lightweight Concurrency**
   - Goroutines cost ~2KB memory, ~1µs spawn time
   - Go scheduler is work-stealing, optimal CPU utilization
   - Agent spawn (<20ms) is realistic: allocate context, start goroutine, initialize state
   - Thousands of agents can be alive without performance cliff

2. **Fast Binaries**
   - Go compiles to native code
   - No JIT startup or warmup
   - Static linking possible
   - Startup latency: <10ms for orchestrator instance

3. **Concurrency Primitives**
   - Channels, mutexes, atomics designed for systems programming
   - Cross-workspace communication uses buffered channels
   - Escalation to orchestrator is goroutine handoff + message send
   - Model inference routing can parallelize across worker pool

4. **Model Integration**
   - Go HTTP client, efficient JSON marshaling
   - Easy wrapper around Rust via cgo where needed
   - Streaming responses (for agent response initiation <100ms)

**Go subsystems:**

- **Agent Orchestration:** Manage agent pool, spawn/tear down, resource limits
- **Model Integration:** LLM API calls, token streaming, inference queue management
- **Middleware:** Cross-workspace routing, state sync, capability manifest distribution
- **Scratchpad Manager:** Coordinate agent access to shared working memory

**Go performance guarantees:**

- Goroutine spawn: <1µs, fits within <20ms agent spawn budget
- Channel send: <1µs latency (uncontended), scales to thousands of senders
- JSON marshal: <100µs for typical agent state (fits into model routing budget)

### 2.3 TypeScript + WebGPU: Dynamic UI, Custom Renderer

**Why TypeScript for UI rendering:**

1. **GPU-Accelerated Rendering**
   - WebGPU provides direct GPU access
   - Rasterization happens on GPU, not CPU
   - Can render to texture and reuse across frames (pre-rendered workspace views)
   - 16.67ms frame budget includes GPU upload and sync

2. **Instant Component Hydration**
   - LLM-generated component trees (React-like) can be instantiated from JSON
   - No build step, no server-side rendering roundtrip
   - Custom renderer directly executes component tree → GPU commands
   - Dynamic widgets can be swapped in <33ms (2 frame budget)

3. **Web Flexibility**
   - CSS-like styling is fast and familiar
   - Web workers for async tasks (not on render thread)
   - Service workers for offline capability caching

4. **Vector Graphics & SVG**
   - Smooth zoom, pan, spatial navigation
   - GPU rasterization of arbitrary SVG
   - Visual feedback (<50ms workspace switch) uses pre-rasterized content

**TypeScript subsystems:**

- **Custom React-Like Renderer:** Props → GPU commands, no vDOM diffing overhead
- **Frame Scheduler:** Request animation frame, frame budget tracking, deadline enforcement
- **Component Hydration:** Parse LLM-generated component JSON, instantiate Wasm or native code
- **Gesture Recognition:** Input event loop, intent classification, action dispatch to Rust

**WebGPU performance guarantees:**

- Frame render: GPU workload can be batched into single command buffer
- Component hydration: JSON parse (<1ms) + instantiation (<5ms) for typical dynamic widget
- GPU sync: Synchronization happens at frame boundary, not inline

### 2.4 Tauri: Runtime Container & IPC

**Why Tauri:**

1. **Near-Native Speed**
   - Thin wrapper around native WebView
   - Rust <→ JavaScript bridge with minimal overhead
   - No Electron overhead (no full Chromium process per window)

2. **Efficient IPC**
   - Tauri commands use fast serialization
   - Async by default, but synchronous calls supported for critical paths
   - Command latency: <500µs for simple calls

3. **Desktop Integration**
   - Native file drag-and-drop (for drop-as-context)
   - Clipboard integration
   - Window management and compositor integration

---

## Part 3: Performance Architecture

### 3.1 Action Dispatch Pipeline (<5ms)

The action dispatch pipeline is the OS heartbeat. Every action flows through this path.

```
User Intent (keyboard, voice, spatial, API)
    ↓ (input marshaling: <100µs)
Rust Input Handler
    ↓ (lookup + validation: <200µs)
Action Registry (lock-free hashmap)
    ↓ (dispatch: <1µs)
Action Executor (specific handler)
    ↓ (execution: <3ms - see budget breakdown)
State Updated / Side Effect Initiated
```

**Budget Breakdown:**
- Input marshaling: <100µs (parse, validate, normalize)
- Registry lookup: <200µs (lock-free concurrent hashmap, CPU cache optimal)
- Dispatch invocation: <1µs (function pointer call)
- Execution: <3ms (varies by action, but must fit budget)
- Overhead margin: <400µs (GC, scheduling, measurement)

**Implementation:**

1. **Input Handler (Rust)**
   - Single event loop thread
   - Mio or smol for I/O multiplexing (never blocks)
   - Priority queue for user-intent events (preempt background work)

2. **Action Registry (Rust)**
   - Atomic load during dispatch (no locks)
   - Copy-on-write for updates (registration <2ms happens asynchronously, but readers never block)
   - Index by action name (u32 hash)

3. **Action Executor (Language-Specific)**
   - Rust actions: Direct function call, bounded execution time
   - Go actions: Enqueue to orchestrator's worker pool, return immediately (async)
   - TypeScript actions: Cross-process (Tauri), bounded by IPC latency

4. **State Update (Rust)**
   - Working memory write (touch dirty bit, queue flush)
   - Compositor notification (if visual change)
   - Agent notification (via scratchpad or channel)

**Critical: No Blocking I/O in Dispatch Loop**

- Network calls are async (Go orchestrator handles them)
- Database reads go through working memory (cached, or async fetch to background)
- Locks must not be held >1µs
- Allocations must not exceed 10KB (stack-preferred, arena-allocated)

### 3.2 Rendering Engine: 60fps with Dynamic Content (<16.67ms/frame)

The rendering engine maintains 60fps even when serving dynamically generated component trees from LLM agents.

```
Request Animation Frame (16.67ms budget starts)
    ↓ (browser event: <100µs)
TypeScript Frame Scheduler
    ↓ (check frame time budget: <1µs)
Component Tree Traversal
    ↓ (walk component tree: <5ms)
GPU Command Generation
    ↓ (generate draws, set uniforms: <8ms)
GPU Submission
    ↓ (submit command buffer: <500µs)
Sync to Display (VSYNC)
    ↓ (wait for GPU: <1ms)
Frame Complete
```

**Budget Breakdown (16.67ms):**
- Component state update: <2ms (props change, re-render flag)
- Layout calculation: <4ms (geometry, flex layout for dynamic widgets)
- GPU command generation: <8ms (texture binds, draw calls, compute shaders)
- GPU submission & sync: <1ms (buffer upload, fence sync)
- Overhead & slack: <1.67ms (measurement, scheduling)

**Implementation:**

1. **Component Tree Format**
   - JSON-serializable (from LLM)
   - Typed component registry (name → implementation)
   - Incremental updates (only diff props)

2. **Custom React-Like Renderer (TypeScript)**
   ```typescript
   class FrameScheduler {
     frameDeadline: number = 16.67; // ms
     componentTree: Component;
     gpuCommandBuffer: GPUCommandBuffer;

     requestFrame() {
       requestAnimationFrame(() => this.render());
     }

     render() {
       const startTime = performance.now();
       this.traverseComponents(this.componentTree);
       const gpuWorkTime = performance.now() - startTime;

       if (gpuWorkTime > this.frameDeadline) {
         console.error(`Frame budget overrun: ${gpuWorkTime}ms`);
         // Degradation: defer non-critical updates
       }
     }

     private traverseComponents(component: Component): GPUDrawOp[] {
       // Depth-first traversal, generate GPU ops, <5ms for typical tree
     }
   }
   ```

3. **GPU Batching**
   - Single command buffer per frame
   - Pre-allocated GPU buffers (no allocations in frame path)
   - Instanced rendering for repeated elements
   - Compute shaders for complex layouts

4. **Dynamic Widget Injection**
   - Newly generated component tree can be swapped in between frames
   - Pre-hydrated components take <5ms to initialize
   - Old component tree is GC'd asynchronously (not on render thread)

**Critical: Never Block Render Thread**

- All async work (network, model calls) happens on worker thread
- Render thread only reads from immutable data structures
- State updates use compare-and-swap (CAS) to minimize locking
- Frame scheduler preempts work that would overrun budget

### 3.3 Working Memory: The Performance Lever

Working memory is the OS's representation of the LLM's context window. This is the single biggest performance lever because:

1. **Context window is finite** (typically 4K-100K tokens)
2. **LLM quality degrades** if working memory is too small
3. **Context latency determines model latency** (larger context → longer inference)
4. **Working memory access is the single most common operation** (every agent decision reads it)

Working memory architecture:

```
┌─ Active Context (in-memory LLM context)
│  ├─ Spatial Index (agent location → chunks)
│  ├─ Recency Index (age → chunks)
│  ├─ Importance Index (relevance score → chunks)
│  └─ Content Chunks (actual data, sized for token count)
│
├─ Warm Cache (recent history, not in active context)
│  └─ Compressed if needed to save space
│
└─ Cold Store (disk/database)
   └─ Full history, indexed for replay
```

**Working Memory Budgets:**

| Operation | Latency | Mechanism |
|-----------|---------|-----------|
| Read (active) | <1ms | Index lookup (HashMap<SpatialRef, ChunkId>), memory read |
| Read (warm cache) | <5ms | LRU decompression + memory read, acceptable because infrequent |
| Write (active) | <2ms | Update chunk, mark dirty, index update |
| Evict (active → warm) | <10ms | Compress chunk (async after initiation), update indices |
| Spatial Index Update | <3ms | Update SpatialRef→ChunkId mapping, cascaded to all agents |

**Implementation (Rust Arena Allocator):**

```rust
struct WorkingMemory {
    // Fixed-size arena, no heap fragmentation
    arena: [u8; ARENA_SIZE], // e.g., 50MB
    chunks: Vec<ChunkRef>,   // Chunk offsets into arena

    // Indices
    spatial_index: HashMap<SpatialRef, ChunkId>,    // <1µs lookup
    recency_index: BTreeMap<Age, ChunkId>,          // <10µs range query
    importance_index: HashMap<ChunkId, ImportanceScore>,

    // Dirty tracking
    dirty_bits: BitSet,

    // Eviction watermark
    evict_threshold: usize,
}

impl WorkingMemory {
    fn read(&self, spatial_ref: SpatialRef) -> &[u8] {
        let chunk_id = self.spatial_index[&spatial_ref]; // <100ns
        let chunk_ref = self.chunks[chunk_id];
        &self.arena[chunk_ref.offset..chunk_ref.offset + chunk_ref.size] // <500ns
    }

    fn write(&mut self, spatial_ref: SpatialRef, data: &[u8]) {
        // Copy data into arena, update indices
        // Total: <2ms for typical chunk (4KB)
        let chunk_id = self.spatial_index[&spatial_ref];
        let chunk_ref = &mut self.chunks[chunk_id];
        self.arena[chunk_ref.offset..].copy_from_slice(data);
        self.dirty_bits.set(chunk_id);
    }

    fn evict_lru(&mut self) {
        // Runs asynchronously when threshold crossed
        // Does not block reads/writes
        let victim = self.recency_index.iter().next(); // Oldest
        self.warm_cache.push(compress(*victim));
        self.spatial_index.remove(&victim.spatial_ref);
    }
}
```

**Context Window Budget Management:**

The OS manages what goes into active context based on:

1. **Spatial Locality** (where is the agent working?)
   - Agent workspace → load workspace context
   - Agent tool → load tool manifest
   - Agent goal → load goal description

2. **Recency** (what was accessed recently?)
   - LRU eviction when arena fills
   - Accessed chunks move to head of recency list

3. **Importance** (what does the model need to perform well?)
   - User-set importance scores (e.g., "always include project charter")
   - Model-inferred importance (chunk cited by previous agent response)
   - Capability importance (manifest more important than debug log)

**Example: Context Eviction Decision**

```rust
// Active context is 50KB, can hold ~5K tokens for 8-token average
// New agent needs to load 10KB goal context
// Arena is 90% full

// Eviction algorithm:
// 1. Score all chunks: (recency_weight * recent_age) + (importance_weight * importance)
// 2. Sort ascending
// 3. Evict lowest-scored chunks until space available
// 4. Move evicted chunks to warm cache (compressed)
// 5. All done in <10ms

evict_until_available(target_space: 10KB);
```

### 3.4 Model Call Latency Management

Not every agent layer needs to call the LLM. The OS stratifies agents by inference cost:

```
┌─ Leaf Agents (local, fast, no model calls)
│  └─ Example: "open workspace", "increment counter"
│  └─ Latency: action dispatch only (<5ms)
│
├─ Conductor Agents (small model, local inference)
│  └─ Example: "route to right tool", "classify intent"
│  └─ Latency: forward pass only (<50ms)
│  └─ Model: Small (1B-3B param) ONNX runtime
│
├─ Orchestrator Agents (medium model, cached)
│  └─ Example: "coordinate workspace actions", "summarize state"
│  └─ Latency: forward pass + small context (<100ms)
│  └─ Model: Medium (7B-13B param) or API call with caching
│
└─ Reasoning Agents (full LLM, external)
   └─ Example: "solve problem", "write code"
   └─ Latency: <1s timeout, but streaming allowed
   └─ Model: Full model or expensive API (GPT-4, Claude, etc.)
```

**Model Integration (Go):**

```go
type ModelInferenceRouter struct {
    leafExecutor LookupTable       // Maps to Rust actions
    conductorModel *ort.Session    // ONNX runtime, local
    orchestratorPool *llm.Pool     // Batch inference or local
    reasoningAPIClient *http.Client
}

func (r *ModelInferenceRouter) Route(context LLMContext) (*Response, error) {
    // <50ms total, no model inference

    // 1. Classify which tier based on context size, agent scope
    tier := r.classifyTier(context) // <5ms

    // 2. Check cache for identical context
    if cached := r.cache.Get(context.Hash()); cached != nil {
        return cached, nil // <1ms
    }

    // 3. Call appropriate model
    var resp *Response
    switch tier {
    case TierLeaf:
        resp = r.leafExecutor.Lookup(context.Intent)
    case TierConductor:
        resp = r.conductorModel.Forward(context.ToTokens()) // <30ms
    case TierOrchestrator:
        resp = r.orchestratorPool.Forward(context.ToTokens()) // <80ms
    case TierReasoning:
        resp = r.reasoningAPIClient.Call(context) // Async, stream, <100ms to first token
    }

    // 4. Cache result
    r.cache.Set(context.Hash(), resp)

    return resp, nil
}
```

**Streaming for Agent Response Initiation (<100ms):**

- Reasoning agents return immediately with first token (or decision)
- Streaming continues in background
- Agent can start acting on partial response
- Full response available by <1s timeout

### 3.5 Async vs Sync Decision Points

**Synchronous (must complete in hot path):**

- Action dispatch (<5ms)
- UI render frame (<16.67ms)
- Working memory read (<1ms)
- Action registration (<2ms)
- Capability manifest update propagation (<10ms) — broadcast initiated sync, completion async

**Asynchronous (initiated sync, completed async):**

- Model inference (initiated <50ms, completed <1s)
- Cross-workspace communication (initiated <25ms)
- Agent spawn (initiated <20ms, ready to receive messages)
- Drop-as-context ingestion (initiated <200ms, full indexing async)
- Scratchpad persistence (initiated <2ms, disk write async)

**Pattern: "Initiated Sync, Completed Async"**

```rust
// User drops a file onto workspace
pub fn drop_as_context(workspace_id: WorkspaceId, file: File) -> DropHandle {
    // SYNC: <200ms
    // 1. Parse file type
    // 2. Extract snippets
    // 3. Create embedding sketch (approximate)
    // 4. Add to spatial index
    // 5. Return handle

    let handle = DropHandle::new();

    // ASYNC: background task
    // 1. Full embed with model
    // 2. Recursive parse (for code)
    // 3. Full index update
    // 4. Notify agents when done

    spawn_async_task(move || {
        index_fully(file, workspace_id, &handle);
    });

    handle // Immediate return, <200ms
}
```

### 3.6 Pre-loading and Speculation Strategies

**Workspace Pre-rendering:**

When user hovers over workspace icon:
- Pre-render workspace UI to offscreen GPU texture
- Load workspace context into warm cache
- By time user clicks, workspace is ready to display (<16ms)

**Agent Spawn Speculation:**

When action is in agent queue waiting for response:
- Speculatively spawn next likely agent
- Pre-allocate memory, start context load
- If speculative agent is correct, save 10-15ms

**Working Memory Pre-fetch:**

Based on agent location and recent queries:
- Load next likely chunks into warm cache
- Update spatial index to fast-path next read
- If correct, save cold-store round-trip

---

## Part 4: Performance Testing

### 4.1 Latency Budget Benchmarks

Each subsystem must have automated tests for its latency budget:

```rust
// Example: Action Dispatch Benchmark
#[bench]
fn bench_action_dispatch(b: &mut Bencher) {
    let mut dispatcher = ActionDispatcher::new();
    dispatcher.register("test_action", |ctx| {
        // Minimal action, <1ms
        ctx.state.increment_counter();
    });

    b.iter(|| {
        dispatcher.dispatch("test_action", &ActionContext::default());
    });

    // Assertions:
    // - Median latency: <2ms
    // - P99 latency: <4ms
    // - P99.9 latency: <5ms (hard limit)
    // - No allocation in hot path
}

#[bench]
fn bench_action_dispatch_with_state_write(b: &mut Bencher) {
    // Action that updates working memory
    // Budget: <5ms total
}

#[bench]
fn bench_action_dispatch_with_compositor_notify(b: &mut Bencher) {
    // Action that invalidates UI
    // Budget: <5ms total (compositor notification async)
}
```

**Benchmark Suite:**

| Subsystem | Test | Budget | Acceptance |
|-----------|------|--------|-----------|
| Action Dispatch | Simple action | <5ms | P99 < 4ms |
| Action Dispatch | With state write | <5ms | P99 < 5ms |
| Action Dispatch | With signal | <5ms | P99 < 5ms |
| UI Render | Static frame | <16.67ms | P99 < 14ms |
| UI Render | Dynamic widget swap | <33ms | P99 < 30ms |
| UI Render | Complex layout | <16.67ms | P99 < 16ms |
| Working Memory | Read (hot) | <1ms | P99 < 0.5ms |
| Working Memory | Write | <2ms | P99 < 1.5ms |
| Working Memory | Eviction | <10ms | P99 < 8ms |
| Agent Spawn | Minimal | <20ms | P99 < 18ms |
| Agent Spawn | With context | <20ms | P99 < 19ms |
| Model Routing | Classify tier | <50ms | P99 < 45ms |
| Voice Input | Intent to dispatch | <100ms | P99 < 90ms |

### 4.2 Profiling Approach

**Continuous Profiling (low overhead):**

```rust
// Sampled profiling, <1% overhead
struct LatencyProfiler {
    sample_rate: f32, // 0.01 = 1%
    buckets: [AtomicU64; 100], // Histogram: 0-1ms, 1-2ms, ..., 100ms+
}

impl LatencyProfiler {
    fn sample(&self, operation: &str, latency_ms: f32) {
        if random() < self.sample_rate {
            let bucket = (latency_ms as usize).min(99);
            self.buckets[bucket].fetch_add(1, Ordering::Relaxed);
        }
    }
}
```

**Targeted Profiling (when budget is approached):**

```rust
// If P99 > 80% of budget, enable detailed profiling
if latency_profiler.p99() > threshold {
    detailed_profiler.enable();

    // Now collecting:
    // - Call stacks
    // - Memory allocations
    // - Lock contention
    // - CPU cache misses
}
```

**Perf Linux Integration (kernel-level):**

```bash
# Capture all action dispatch events
perf record -e cycles,cache-misses,branch-misses -p <pid> -- duration 10s

# Flame graph
perf script > out.perf
stackcollapse-perf.pl out.perf > out.folded
flamegraph.pl out.folded > out.svg
```

### 4.3 Performance Regression Detection

**Automated Regression Tests:**

Every PR runs latency benchmarks. If any latency budget regresses >5%, CI fails.

```yaml
# ci/latency-regression.yaml
tests:
  - name: "Action Dispatch P99"
    baseline: 4.0ms
    tolerance: 5% # Regression if > 4.2ms

  - name: "UI Frame Render P99"
    baseline: 14.0ms
    tolerance: 5% # Regression if > 14.7ms

  - name: "Working Memory Read P99"
    baseline: 0.5ms
    tolerance: 5%
```

**Trend Monitoring:**

Track latency over time. If median latency increases 10% month-over-month, investigate root cause.

### 4.4 Load Testing: Multi-Agent Scenarios

**Test Scenario: 100 Agents Running Simultaneously**

```
1. Spawn 100 agents
2. Each agent sends 10 actions/sec
3. Measure: total latency, tail latency, GC pauses
4. Budget: dispatch latency must stay <5ms P99 (total throughput <5000 actions/sec)
```

```go
// Load test
func TestMultiAgentLoad(t *testing.T) {
    orch := NewOrchestrator()

    // Spawn 100 agents
    for i := 0; i < 100; i++ {
        orch.SpawnAgent(AgentSpec{
            // ...
        })
    }

    // Each agent sends 10 actions/sec for 60 seconds
    latencies := make([]time.Duration, 0)
    for i := 0; i < 100; i++ {
        go func(agent_id int) {
            for j := 0; j < 600; j++ {
                start := time.Now()
                orch.DispatchAction("test_action", agent_id)
                latencies = append(latencies, time.Since(start))
                time.Sleep(100 * time.Millisecond)
            }
        }(i)
    }

    // Measure percentiles
    sort.Slice(latencies, ...)
    p50 := latencies[len(latencies)/2]
    p99 := latencies[int(float64(len(latencies))*0.99)]

    assert(p99 < 5*time.Millisecond, "P99 latency exceeded")
}
```

### 4.5 Adversarial Performance Testing: Stress & Edge Cases

**Test: Worst-Case Action Dispatch**

```rust
#[test]
fn stress_action_dispatch_contention() {
    // 16 threads (one per CPU core) all dispatching simultaneously
    // Each thread: 100K dispatch calls
    // Total: 1.6M dispatch calls, measure tail latency

    let barrier = Arc::new(Barrier::new(16));
    let latencies = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = (0..16).map(|_| {
        let latencies = latencies.clone();
        let barrier = barrier.clone();

        thread::spawn(move || {
            barrier.wait(); // Synchronized start
            for _ in 0..100_000 {
                let start = Instant::now();
                dispatcher.dispatch("action", &ctx);
                latencies.lock().push(start.elapsed());
            }
        })
    }).collect();

    // Assert: P99.9 < 5ms even under contention
}
```

**Test: Memory Pressure**

```rust
#[test]
fn stress_working_memory_under_pressure() {
    // Fill working memory to 95% capacity
    // Then do rapid read/write cycles
    // Measure: does eviction kick in? Is it fast enough?
    // Assert: writes stay <2ms even with active eviction
}
```

**Test: Render Frame Overrun**

```typescript
test('Frame render with expensive layout', () => {
    // Create deeply nested component tree (10 levels deep)
    // Force relayout every frame (worst case)
    // Measure: how much do we overrun budget?
    // Assert: P99 < 20ms (120% of budget)
    // Acceptable because rare, but must degrade gracefully
});
```

**Test: Model Inference Timeout**

```go
func TestReasoningAgentTimeout(t *testing.T) {
    // Reasoning agent call takes >1s
    // Orchestrator must timeout and escalate
    // Assert: escalation initiated in <100ms
    // Assert: user sees response from fallback agent
}
```

---

## Part 5: Performance Anti-Patterns

These patterns must never happen:

### 5.1 Garbage Collection Pauses in Hot Paths

**Anti-Pattern:**

```go
// WRONG: Go GC can pause 50ms+ on large heaps
func dispatchAction(action Action) {
    // GC pause happens here unpredictably
    result := expensiveComputation() // Allocates heavily
    updateState(result)
}
```

**Correct Pattern:**

```rust
// Rust: No GC. Use arena allocator for bounded allocation.
fn dispatch_action(action: &Action) {
    // Fixed allocation in scratch buffer
    let result = expensive_computation(&mut arena);
    update_state(result);
    // Freed deterministically
}
```

### 5.2 Synchronous Model Calls Blocking UI

**Anti-Pattern:**

```typescript
// WRONG: Blocks render thread for 100ms+
button.onclick = () => {
    const response = await model.infer(context); // Blocks!
    renderResult(response);
};
```

**Correct Pattern:**

```typescript
// RIGHT: Model call on worker thread, streamed results
button.onclick = () => {
    modelWorker.postMessage({ context }); // Async
    showLoadingSpinner(); // Render immediately
};

modelWorker.onmessage = (event) => {
    const token = event.data;
    appendToResult(token);
    requestAnimationFrame(renderNextFrame); // Batched renders
};
```

### 5.3 Lock Contention in Dispatch Loop

**Anti-Pattern:**

```rust
// WRONG: Every dispatch acquires mutex
fn dispatch(action: &Action) {
    let mut registry = REGISTRY.lock(); // <1ms contention?
    let handler = registry.get(action.name);
    drop(registry); // Still contention
    handler(action);
}
```

**Correct Pattern:**

```rust
// RIGHT: Lock-free read in dispatch loop
fn dispatch(action: &Action) {
    let handler = REGISTRY.load(Ordering::Acquire); // Atomic load, <100ns
    handler(action);
}

// Updates (action registration) use copy-on-write
fn register(name: &str, handler: ActionFn) {
    let mut new_registry = REGISTRY.load().clone(); // Full copy, <10ms
    new_registry.insert(name, handler);
    REGISTRY.store(new_registry, Ordering::Release); // CAS

    // Readers at old pointer continue, new readers see new registry
}
```

### 5.4 Unbounded Allocations in Working Memory

**Anti-Pattern:**

```rust
// WRONG: Context can grow unbounded, heap fragmentation
struct WorkingMemory {
    chunks: Vec<Vec<u8>>, // Heap allocation per chunk
}

// Fragment grows, cold-store operations slow down
```

**Correct Pattern:**

```rust
// RIGHT: Fixed arena, no fragmentation
struct WorkingMemory {
    arena: [u8; 50MB],
    chunks: Vec<ChunkRef>, // Just offsets
}

// Eviction replaces old chunks in-place
```

### 5.5 Synchronous Disk I/O in Agent Spawn

**Anti-Pattern:**

```go
// WRONG: Agent spawn blocks on disk read
func (orch *Orchestrator) SpawnAgent(spec AgentSpec) {
    // Load agent template from disk—blocks <20ms budget
    template := loadTemplate(spec.TemplateFile) // BLOCKS!
    agent := NewAgent(template)
}
```

**Correct Pattern:**

```go
// RIGHT: Pre-cache template or pre-allocate
var templateCache = sync.Map{}

func (orch *Orchestrator) SpawnAgent(spec AgentSpec) {
    // Already in memory
    template := templateCache[spec.TemplateFile]
    agent := NewAgent(template) // <20ms, no disk I/O

    // Prefetch next likely template in background
    go func() {
        if nextTemplate, ok := predictNextTemplate(spec); ok {
            loadTemplate(nextTemplate) // Async
        }
    }()
}
```

### 5.6 Rendering with Synchronous Network I/O

**Anti-Pattern:**

```typescript
// WRONG: Network call blocks render
render() {
    const data = await fetch('/api/data'); // BLOCKS render!
    return <Component data={data} />;
}
```

**Correct Pattern:**

```typescript
// RIGHT: Fetch in background, stream updates
useEffect(() => {
    fetch('/api/data').then(data => {
        setData(data); // Triggers re-render asynchronously
    });
}, []);

return <Component data={data} isLoading={data === null} />;
```

### 5.7 Cascading Model Inference

**Anti-Pattern:**

```go
// WRONG: Reasoning agent calls another reasoning agent
// Total latency: 1s + 1s + overhead = >2s
orchestrator.RouteToAgent(context)
    // → reasoning_agent_1.Infer(context) // 1s
    //   → reasoning_agent_2.Infer(context) // 1s (serial!)
    //     → response
```

**Correct Pattern:**

```go
// RIGHT: Parallelize or defer
orchestrator.RouteToAgent(context)
    // → conductor_agent.Classify(context) // 50ms (fast)
    //   → [parallel] reasoning_agent_1, reasoning_agent_2 // Both ~500ms
    //   → merge results // 50ms
    // Total: ~550ms
```

---

## Part 6: Degradation Strategies When Budgets Can't Be Met

What happens when performance targets are impossible? Graceful degradation.

### 6.1 Action Dispatch Overrun

If dispatch latency approaches 5ms, queue new actions instead of executing inline:

```rust
fn dispatch(action: &Action) {
    let start = Instant::now();

    // Try to execute
    match execute(action) {
        Ok(result) => {
            let elapsed = start.elapsed();
            if elapsed > Duration::from_millis(3) {
                // Getting close to budget, defer next action
                DEFER_NEXT_ACTION = true;
            }
            result
        }
        _ => {
            // Enqueue for batch processing
            DISPATCH_QUEUE.push(action);
        }
    }
}
```

### 6.2 Frame Render Overrun

If frame render exceeds 16.67ms, drop non-critical updates:

```typescript
render() {
    const startTime = performance.now();

    // Critical updates (always render)
    renderCriticalComponents();

    // Non-critical updates (skip if overrun)
    const elapsed = performance.now() - startTime;
    if (elapsed < 10) {
        renderOptionalAnimations();
        renderDebugInfo();
    }

    if (elapsed > 16) {
        console.warn(`Frame overrun: ${elapsed}ms`);
        stats.frameOverruns++;
    }
}
```

### 6.3 Working Memory Pressure

If active context is full and eviction can't keep up:

```rust
fn write(&mut self, spatial_ref: SpatialRef, data: &[u8]) {
    if self.arena_free() < data.len() {
        // Emergency eviction: dump old chunks without compression
        self.emergency_evict(data.len());

        // Fallback: write to warm cache instead of active context
        if self.arena_free() < data.len() {
            self.warm_cache.push((spatial_ref, data.to_vec()));
            return;
        }
    }

    // Normal path
    self.arena.write(spatial_ref, data);
}
```

### 6.4 Model Inference Timeout

If reasoning agent exceeds 1s timeout:

```go
// Timeout with streaming
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
defer cancel()

stream, err := model.InferStream(ctx, prompt)
if err == context.DeadlineExceeded {
    // Return best-effort response from partial tokens received
    partialResponse := model.CompilePartialResponse(tokensReceived)
    return partialResponse, ErrPartialResponse
}
```

### 6.5 Agent Spawn Overrun

If agent spawn exceeds 20ms:

```go
func (orch *Orchestrator) SpawnAgent(spec AgentSpec) Agent {
    start := time.Now()

    agent := &Agent{
        id: nextID(),
        context: spec.Context, // Already allocated
    }

    // Asynchronous initialization
    go agent.initialize()

    if time.Since(start) < 20*time.Millisecond {
        return agent // Ready now
    } else {
        // Spawn succeeded, but not yet ready
        return &FutureAgent{
            agent: agent,
            ready: agent.readyCh,
        }
    }
}
```

---

## Part 7: Performance Monitoring & Alerts

### 7.1 Real-Time Latency Dashboard

```rust
pub struct PerformanceMonitor {
    // Histogram of latencies for each operation
    histograms: HashMap<&'static str, LatencyHistogram>,

    // Real-time stats
    stats: Arc<Mutex<Stats>>,

    // Alerts
    alert_thresholds: HashMap<&'static str, Duration>,
}

impl PerformanceMonitor {
    pub fn record(&self, op: &str, latency: Duration) {
        let histogram = &self.histograms[op];
        histogram.record(latency);

        // Alert if threshold exceeded
        if latency > self.alert_thresholds[op] {
            self.alert(op, latency);
        }
    }

    pub fn p99(&self, op: &str) -> Duration {
        self.histograms[op].percentile(0.99)
    }
}
```

### 7.2 Performance Logs

Log anomalies:

```
[2024-03-23 10:15:30] PERF_ALERT: action_dispatch P99=4.8ms (threshold=4.0ms)
[2024-03-23 10:15:35] PERF_ALERT: ui_render P99=16.1ms (threshold=16.0ms)
[2024-03-23 10:15:40] PERF_ANOMALY: working_memory eviction took 12ms (threshold=10ms)
```

---

## Summary: Performance Specification

| Layer | Component | Latency | Mechanism |
|-------|-----------|---------|-----------|
| **Kernel** | Action dispatch | <5ms | Lock-free registry, Rust |
| **Rendering** | Frame render | <16.67ms | WebGPU, single command buffer |
| **Memory** | Context read | <1ms | Arena allocator, spatial index |
| **Agent** | Spawn | <20ms | Pre-allocated templates, goroutines |
| **Model** | Inference routing | <50ms | Classification + lookup |
| **Voice** | Intent to action | <100ms | Local speech + routing |
| **UI** | Widget swap | <33ms | Pre-hydrated components |
| **Workspace** | Switch transition | <50ms | GPU blitting |

Every subsystem must achieve its latency target, non-negotiably. Performance is architecture. Speed enables the entire vision of an LLM-native OS.

