# Document 18: Runtime and Rendering Engine Specification

## Overview

The LLM-native OS execution model consists of three integrated layers:

1. **Rust Kernel** – Zero-GC hot paths, compositor, renderer, dispatcher
2. **Go Middleware** – Agent orchestration, model routing, lifecycle management
3. **TypeScript Renderer** – Declarative UI hydration, event binding, GPU acceleration

This document specifies how LLM outputs become executable agents with immediately-rendered UIs, under a <5ms action dispatch budget and <16ms render deadline.

---

## Part 1: Rust Kernel Architecture

### 1.1 Core Subsystems

The Rust kernel is organized into four subsystems, each with strict latency budgets:

```
Kernel Core (no_std, no allocations in hot paths)
├── Compositor (window management, z-order, damage tracking)
├── Renderer (rasterization, GPU command buffer construction)
├── Memory Manager (arena allocation, borrowed references, zero-copy)
└── Action Dispatcher (event routing, syscall interface)
```

### 1.2 Compositor (Rust, Tauri/Native)

**Responsibility:** Manage window lifecycle, z-order, damage tracking, frame pacing.

**Architecture:**

```rust
pub struct Compositor {
    // Window tree: stable pointers, no moves
    windows: SlotMap<WindowId, Window>,
    z_order: Vec<WindowId>,
    damage_tracker: DamageRegion,

    // Per-window framebuffer (GPU texture or in-system memory)
    framebuffers: HashMap<WindowId, Framebuffer>,

    // Render commands queued by agents
    render_queue: VecDeque<RenderCommand>,

    // GPU context (WebGPU or native backend)
    gpu: GpuContext,
}

pub struct Window {
    id: WindowId,
    title: Arc<str>,
    bounds: Rect,

    // Component tree root (from TypeScript)
    component_tree: Arc<ComponentNode>,

    // Dirty flag: true if tree changed since last render
    dirty: AtomicBool,

    // Cached layout: stored to avoid re-layout if tree didn't change
    cached_layout: RwLock<Option<LayoutResult>>,

    // Owning agent
    agent_pid: ProcessId,

    // Events not yet consumed by agent
    input_queue: Mutex<VecDeque<InputEvent>>,
}

pub struct RenderCommand {
    window_id: WindowId,
    command_type: RenderCommandType,
    priority: u8,  // For prioritization during frame deadlines
}

pub enum RenderCommandType {
    // TypeScript pushed updated component tree
    UpdateComponentTree(Arc<ComponentNode>),

    // TypeScript pushed immediate rasterization call
    RasterizeRegion(Rect),

    // Text/vector shape that doesn't fit in component tree
    DrawGeometry(DrawCall),
}
```

**Key Operations (Latency Targets):**

| Operation | Budget | Mechanism |
|-----------|--------|-----------|
| Window create | <1ms | Allocate Window struct, add to SlotMap |
| Add to render queue | <0.1ms | VecDeque push_back, atomic dirty flag |
| z-order change | <0.5ms | Vec reorder (at most 100 windows) |
| Damage region update | <0.2ms | Bitmap or spatial tree update |

**Frame Pacing Loop (Target 60fps = 16.66ms per frame):**

```rust
impl Compositor {
    pub fn frame_tick(&mut self) -> Result<(), CompositorError> {
        // T=0: Consume input events from all windows
        // <1ms: Dispatch to respective agent processes
        self.dispatch_input_events()?;

        // T=1-2: Execute render commands from queue
        // Process component tree updates, mark damage
        // <2ms total
        self.process_render_queue()?;

        // T=3-10: Rasterize dirty regions
        // Invoke GPU or software renderer
        // <7ms (GPU-bound; CPU done by T=7)
        self.rasterize()?;

        // T=11-15: GPU blits framebuffer to display
        // CPU waits for GPU fence
        // <5ms (GPU work, CPU idle)
        self.present_to_display()?;

        // T=15-16: Sync with vsync, sleep remaining
        self.vsync_sleep()?;

        Ok(())
    }
}
```

**Memory:** Windows reference their component trees via `Arc<ComponentNode>`. Clones are cheap; tree mutations trigger `dirty = true` without reallocating.

---

### 1.3 Renderer (Rust, WebGPU or Custom)

**Responsibility:** Convert declarative component tree + DrawCalls into GPU commands, target 60fps with <7ms CPU time.

**Architecture:**

```rust
pub struct Renderer {
    // GPU API abstraction (wgpu for WebGPU, or custom Vulkan)
    gpu: Arc<GpuBackend>,

    // Per-window render passes
    render_passes: HashMap<WindowId, RenderPass>,

    // Shader cache (compiled and uploaded)
    shader_cache: ShaderCache,

    // Font rasterizer (must be fast for text)
    font_rasterizer: FontRasterizer,

    // Geometry builder (for vector shapes, canvas, etc.)
    geom_builder: GeometryBuilder,
}

pub struct RenderPass {
    window_id: WindowId,

    // Damage from last frame guides early-exit
    prev_damage: DamageRegion,

    // GPU textures for this window
    color_texture: GpuTexture,
    depth_texture: GpuTexture,

    // For incremental rendering: only re-render dirty subtree
    dirty_rect_stack: Vec<Rect>,
}

// Fast path: Renderer walks component tree, emits GPU commands
impl Renderer {
    pub fn render_window(&mut self, window: &Window, damage: &DamageRegion) -> Result<(), RenderError> {
        let pass = self.render_passes.entry(window.id).or_insert_with(|| RenderPass::new(window));

        // Early exit: if no damage and no tree changes, skip
        if damage.is_empty() && !window.dirty.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Fast path: if tree cached, skip layout
        let layout = if window.dirty.load(Ordering::Relaxed) {
            let new_layout = self.compute_layout(&window.component_tree, window.bounds)?;
            *window.cached_layout.write().unwrap() = Some(new_layout.clone());
            new_layout
        } else {
            window.cached_layout.read().unwrap().clone().unwrap()
        };

        // Walk component tree, emit GPU commands
        self.walk_component_tree(&window.component_tree, &layout, damage, pass)?;

        // Submit GPU command buffer
        self.gpu.submit_render_pass(pass)?;

        window.dirty.store(false, Ordering::Relaxed);
        Ok(())
    }

    fn walk_component_tree(
        &mut self,
        node: &ComponentNode,
        layout: &LayoutResult,
        damage: &DamageRegion,
        pass: &mut RenderPass,
    ) -> Result<(), RenderError> {
        // Recursively visit nodes
        // If node bounds don't intersect damage, skip subtree
        if !damage.intersects(&node.bounds) {
            return Ok(());
        }

        match &node.component {
            Component::Container(props) => {
                self.emit_rect(pass, node.bounds, &props.background_color)?;
                // Recurse on children
                for child in &node.children {
                    self.walk_component_tree(child, layout, damage, pass)?;
                }
            }
            Component::Text(props) => {
                self.font_rasterizer.render_text(pass, &props.text, node.bounds, &props.style)?;
            }
            Component::DataTable(props) => {
                self.render_table(pass, props, node.bounds, damage)?;
            }
            Component::Canvas(props) => {
                // Direct GPU draw calls (e.g., WebGL canvas)
                self.execute_canvas_commands(pass, &props.commands)?;
            }
            // ... other components
        }

        Ok(())
    }
}
```

**Rendering Paths:**

| Path | Latency | Use Case |
|------|---------|----------|
| **Full tree** | <7ms | First frame, major tree change |
| **Dirty subtree** | <2ms | One component updated |
| **Geometry only** | <1ms | Canvas/drawing commands only |
| **No-op (cached)** | <0.1ms | Input event, no render needed |

**GPU Backend Abstraction:**

```rust
pub trait GpuBackend: Send + Sync {
    // Compile shader, return GPU handle
    fn compile_shader(&self, source: &str) -> Result<GpuShader, GpuError>;

    // Queue geometry (vertices, indices) → GPU buffer
    fn upload_geometry(&self, vertices: &[Vertex], indices: &[u16]) -> Result<GpuGeometry, GpuError>;

    // Draw call with current shader + geometry
    fn draw(&self, geometry: &GpuGeometry, uniforms: &UniformBuffer) -> Result<(), GpuError>;

    // Submit all pending draw calls, return fence for sync
    fn submit(&self) -> Result<GpuFence, GpuError>;

    // Block until fence completes
    fn wait(&self, fence: GpuFence) -> Result<(), GpuError>;
}
```

**Font Rasterization (Critical Path):**

Font rasterization is moved off the hot path via SDF (signed distance field) or pre-rasterized atlas:

```rust
pub struct FontRasterizer {
    // Pre-rasterized glyphs at common sizes
    glyph_atlas: GpuTexture,

    // Metadata: glyph positions in atlas
    glyph_metadata: HashMap<(FontId, GlyphId, Size), AtlasEntry>,

    // SDF shader for arbitrary scales
    sdf_shader: GpuShader,
}

impl FontRasterizer {
    // Render text to GPU texture
    // If glyph in atlas: simple blit
    // If new size: use SDF shader (on GPU, not CPU)
    pub fn render_text(
        &mut self,
        pass: &mut RenderPass,
        text: &str,
        bounds: Rect,
        style: &TextStyle,
    ) -> Result<(), RenderError> {
        for (glyph_id, x, y) in self.layout_glyphs(text, bounds, style) {
            let entry = self.glyph_metadata.get(&(style.font_id, glyph_id, style.size))?;
            self.emit_glyph_quad(pass, entry, x, y)?;
        }
        Ok(())
    }
}
```

---

### 1.4 Memory Manager (Rust, Arena Allocation)

**Responsibility:** Allocate, track, and free memory for agent heaps with zero GC pauses.

**Design Principle:** GC happens only during agent lifetime transitions (birth, death), never during hot paths.

```rust
pub struct MemoryManager {
    // Per-agent arenas: allocation context for agent heap
    agent_arenas: HashMap<ProcessId, AgentArena>,

    // Shared data arena (reference-counted)
    shared_arena: SharedArena,
}

pub struct AgentArena {
    agent_pid: ProcessId,

    // Linear allocator: cheap allocation, no fragmentation
    linear_buffer: Vec<u8>,
    offset: AtomicUsize,

    // Tracked allocations (for leak detection, debugging)
    allocations: Vec<(usize, usize)>,  // (offset, size)

    // Max size (agent memory budget)
    max_size: usize,
}

impl AgentArena {
    // Fast path: allocate from linear buffer
    #[inline]
    pub fn allocate(&self, size: usize, align: usize) -> Result<*mut u8, AllocError> {
        let offset = self.offset.load(Ordering::Relaxed);
        let aligned = (offset + align - 1) & !(align - 1);
        let new_offset = aligned + size;

        if new_offset > self.max_size {
            return Err(AllocError::OutOfMemory);
        }

        if self.offset.compare_exchange(offset, new_offset, Ordering::Release, Ordering::Relaxed).is_ok() {
            unsafe { Ok(self.linear_buffer.as_mut_ptr().add(aligned)) }
        } else {
            // Retry or fail (CAS contention rare for single agent)
            Err(AllocError::AllocationFailed)
        }
    }

    // Bulk free on agent death (no per-object overhead)
    pub fn reset(&mut self) {
        self.offset.store(0, Ordering::Release);
        self.allocations.clear();
    }
}

pub struct SharedArena {
    // Reference-counted data (components, strings, etc.)
    allocations: Arc<Mutex<HashMap<AllocationId, Arc<Any>>>>,
}
```

**GC Strategy:**

1. **Allocation phase:** Agent runs, allocates from linear arena (zero cost).
2. **Result phase:** Agent returns result or state update.
3. **Cleanup phase:** On agent death or explicit reset, entire arena freed in O(1).

**Borrowed Data (No Copy):**

```rust
// Agent A holds Arc<String> from shared arena
// Agent B holds Arc<String> to same data
// Drop Arc: ref count decrements, no GC pause

pub struct AgentContext {
    pid: ProcessId,
    arena: &'static AgentArena,
    shared_refs: Vec<Arc<dyn Any>>,  // Borrowed from shared arena
}
```

---

### 1.5 Action Dispatcher (Rust, <5ms Budget)

**Responsibility:** Route events from UI → agent process, enforce latency bounds.

**Architecture:**

```rust
pub struct ActionDispatcher {
    // Agent processes: PID → channel
    agents: Arc<DashMap<ProcessId, AgentChannel>>,

    // Action queue: prioritized by agent
    action_queue: PriorityQueue<DispatchAction>,

    // Latency monitoring
    dispatch_latency_histogram: Histogram,

    // Backpressure: if agent queue full, buffer here temporarily
    backpressure_buffer: RwLock<VecDeque<DispatchAction>>,
}

pub struct DispatchAction {
    agent_pid: ProcessId,
    source_window_id: WindowId,
    event: InputEvent,
    priority: u8,  // High: critical input, Low: background
    enqueued_at: Instant,
}

pub enum InputEvent {
    // Mouse/touch
    PointerDown { x: i32, y: i32, button: u8 },
    PointerMove { x: i32, y: i32 },
    PointerUp { x: i32, y: i32, button: u8 },

    // Keyboard
    KeyDown { key: VirtualKey, mods: ModifierSet },
    KeyUp { key: VirtualKey, mods: ModifierSet },
    Text { text: String },

    // Window
    WindowResize { width: u32, height: u32 },
    WindowFocus,
    WindowBlur,

    // Custom agent actions
    Custom { action: String, payload: serde_json::Value },
}

impl ActionDispatcher {
    // Hot path: dispatch event to agent
    pub fn dispatch(&self, action: DispatchAction) -> Result<(), DispatchError> {
        let start = Instant::now();

        // Find agent, check if responsive
        let agent = self.agents.get(&action.agent_pid)
            .ok_or(DispatchError::AgentNotFound)?;

        // Non-blocking send (agent may be blocked, but channel buffered)
        agent.channel.try_send(action.clone())?;

        let latency = start.elapsed();
        self.dispatch_latency_histogram.record(latency.as_micros() as f64);

        // Alert if latency > 5ms (indicates congestion)
        if latency > Duration::from_millis(5) {
            eprintln!("Dispatch latency: {:?}", latency);
        }

        Ok(())
    }

    // Drain backpressure buffer when agent unblocks
    pub fn drain_backpressure(&self, agent_pid: ProcessId) {
        let mut buffer = self.backpressure_buffer.write().unwrap();
        let mut agent = self.agents.get_mut(&agent_pid).unwrap();

        while let Some(action) = buffer.pop_front() {
            if agent.channel.try_send(action).is_err() {
                // Still blocked, re-queue
                buffer.push_front(action);
                break;
            }
        }
    }
}

pub type AgentChannel = mpsc::Sender<DispatchAction>;
```

**Dispatch Path (Critical, <5ms):**

```
1. User clicks button in window
   ↓ Compositor detects input event <0.5ms

2. Action created, enqueued to dispatcher
   ↓ <0.1ms

3. Dispatcher routes to owning agent process
   ↓ <0.5ms (channel send)

4. Agent wakes up, processes event
   ↓ Agent logic <5ms target (Go runtime handles)

5. Agent may emit render command
   ↓ <0.2ms enqueue

6. Next frame tick, render happens <7ms
   ↓

7. User sees UI change on screen
   Total latency: <13ms (input to pixels)
```

**Backpressure Handling:**

If agent is slow or unresponsive:

1. Dispatcher detects channel full
2. Parks action in backpressure buffer
3. Watchdog timeout: if no progress in 100ms, kill/restart agent
4. On recovery, drain backpressure buffer to agent in batches

---

## Part 2: Go Middleware Layer

### 2.1 Agent Runtime (Go)

**Responsibility:** Spawn agents, manage lifecycle, route to LLM models, orchestrate execution.

```go
type AgentRuntime struct {
    // Process management
    agents       map[types.ProcessID]*AgentProcess
    agentsMutex  sync.RWMutex

    // Model router
    modelRouter  *ModelRouter

    // System resources
    resourceMgr  *ResourceManager

    // Event bus for inter-agent communication
    eventBus     *EventBus
}

type AgentProcess struct {
    PID              types.ProcessID
    Name             string
    CreatedAt        time.Time

    // Execution context
    ctx              context.Context
    cancel           context.CancelFunc

    // Input/output channels
    inputChan        chan DispatchAction
    outputChan       chan AgentOutput

    // State: IDLE, RUNNING, BLOCKED, DEAD
    state            atomic.Value // AgentState

    // Resource limits
    memoryBudget     uint64
    cpuMillis        int64

    // Current task
    currentTask      *AgentTask

    // Metrics
    requestCount     atomic.Int64
    avgLatency       atomic.Uint32  // microseconds
}

type AgentTask struct {
    ID              string
    Description     string
    Status          TaskStatus  // PENDING, RUNNING, DONE, FAILED

    // LLM prompt and result
    Prompt          string
    Result          string

    // Rendered UI (component tree in JSON)
    ComponentTree   json.RawMessage

    // For GUI tasks: expected actions
    ExpectedActions []string

    // Start time for latency tracking
    StartedAt       time.Time
}

type AgentOutput struct {
    AgentPID        types.ProcessID
    ActionType      string  // "render", "http_request", "file_write", etc.
    Payload         json.RawMessage
}
```

**Agent Lifecycle:**

```go
// 1. SPAWN: Create agent from LLM prompt
func (ar *AgentRuntime) SpawnAgent(req *SpawnRequest) (*AgentProcess, error) {
    agent := &AgentProcess{
        PID:          ar.allocateProcessID(),
        Name:         req.Name,
        CreatedAt:    time.Now(),
        inputChan:    make(chan DispatchAction, 100),  // Buffered
        outputChan:   make(chan AgentOutput, 10),
        memoryBudget: req.MemoryLimitBytes,
    }

    ar.agentsMutex.Lock()
    ar.agents[agent.PID] = agent
    ar.agentsMutex.Unlock()

    // Start agent goroutine
    go ar.runAgent(agent)

    return agent, nil
}

// 2. RUN: Agent processes events in loop
func (ar *AgentRuntime) runAgent(agent *AgentProcess) {
    agent.setState(IDLE)

    for {
        select {
        case <-agent.ctx.Done():
            // Killed or cancelled
            agent.setState(DEAD)
            return

        case action := <-agent.inputChan:
            // New event to process
            agent.setState(RUNNING)
            ar.handleAgentEvent(agent, action)

            if shouldYield(agent) {
                agent.setState(IDLE)
                runtime.Gosched()
            }

        case <-time.After(100 * time.Millisecond):
            // Idle timeout: check if should be killed
            if agent.isOrphan() {
                agent.setState(DEAD)
                ar.killAgent(agent.PID)
                return
            }
        }
    }
}

// 3. KILL: Cleanup on shutdown
func (ar *AgentRuntime) killAgent(pid types.ProcessID) error {
    ar.agentsMutex.Lock()
    defer ar.agentsMutex.Unlock()

    agent, ok := ar.agents[pid]
    if !ok {
        return fmt.Errorf("agent not found")
    }

    // Cancel context
    agent.cancel()

    // Cleanup resources (delegated to Rust kernel)
    ar.resourceMgr.FreeAgentResources(pid)

    delete(ar.agents, pid)
    return nil
}
```

**Event Handling (Fast Path):**

```go
func (ar *AgentRuntime) handleAgentEvent(agent *AgentProcess, action DispatchAction) {
    // Deserialize input event
    event := action.Event

    // Fast path: if agent has a callback for this event, invoke it
    if callback, ok := agent.eventHandlers[event.Type]; ok {
        result := callback(event.Payload)

        // If result is component tree, render immediately
        if result.ComponentTree != nil {
            ar.emitRenderCommand(agent.PID, result.ComponentTree)
        }
        return
    }

    // Slow path: invoke LLM to decide what to do
    // (happens only on first unknown event type, or on explicit request)
    ar.queryLLMForAction(agent, event)
}

func (ar *AgentRuntime) emitRenderCommand(pid types.ProcessID, tree *ComponentTree) {
    // Non-blocking send to Rust compositor
    renderCmd := RenderCommand{
        WindowID: ar.windowForAgent(pid),
        Type:     UpdateComponentTree,
        Payload:  tree,
    }
    ar.compositorChan <- renderCmd
}
```

---

### 2.2 Model Router (Go)

**Responsibility:** Route agent queries to appropriate LLM (Claude, local model, etc.), batch requests.

```go
type ModelRouter struct {
    // Registered models
    models map[string]LLMBackend

    // Batching queue: aggregate requests for efficiency
    batchQueue    chan *RouterRequest
    batchSize     int
    batchTimeout  time.Duration

    // Rate limiter per model
    rateLimiters  map[string]*rate.Limiter
}

type RouterRequest struct {
    AgentPID     types.ProcessID
    Prompt       string
    SystemPrompt string
    Temperature  float32
    MaxTokens    int

    // Response channels
    ResultChan   chan *RouterResponse
    ErrorChan    chan error
}

type RouterResponse struct {
    AgentPID      types.ProcessID
    OutputText    string
    ComponentTree json.RawMessage  // If LLM returned component spec
    Actions       []AgentAction    // If LLM returned actions
    Tokens        TokenUsage
}

type LLMBackend interface {
    // Synchronous: wait for result
    Query(ctx context.Context, req *QueryRequest) (*QueryResponse, error)

    // Batched: submit multiple queries, get results asynchronously
    BatchQuery(ctx context.Context, reqs []*QueryRequest) ([]*QueryResponse, error)
}
```

**Batching Logic:**

```go
func (mr *ModelRouter) routeRequest(req *RouterRequest) {
    // Non-blocking send to batcher
    select {
    case mr.batchQueue <- req:
    default:
        // Queue full: reject (agent must retry)
        req.ErrorChan <- ErrRouterCongested
        return
    }
}

// Batcher collects requests, sends in batch
func (mr *ModelRouter) batcherLoop(modelName string, backend LLMBackend) {
    ticker := time.NewTicker(mr.batchTimeout)
    defer ticker.Stop()

    var batch []*RouterRequest

    for {
        select {
        case req := <-mr.batchQueue:
            batch = append(batch, req)

            if len(batch) >= mr.batchSize {
                mr.submitBatch(backend, batch)
                batch = nil
            }

        case <-ticker.C:
            if len(batch) > 0 {
                mr.submitBatch(backend, batch)
                batch = nil
            }
        }
    }
}

func (mr *ModelRouter) submitBatch(backend LLMBackend, reqs []*RouterRequest) {
    // Convert to backend format
    queries := make([]*QueryRequest, len(reqs))
    for i, req := range reqs {
        queries[i] = &QueryRequest{
            Prompt:       req.Prompt,
            SystemPrompt: req.SystemPrompt,
            Temperature:  req.Temperature,
            MaxTokens:    req.MaxTokens,
        }
    }

    // Submit to model
    responses, err := backend.BatchQuery(context.Background(), queries)
    if err != nil {
        for _, req := range reqs {
            req.ErrorChan <- err
        }
        return
    }

    // Route responses back to agents
    for i, resp := range responses {
        reqs[i].ResultChan <- &RouterResponse{
            AgentPID:      reqs[i].AgentPID,
            OutputText:    resp.Text,
            ComponentTree: resp.ComponentTree,
            Tokens:        resp.Tokens,
        }
    }
}
```

---

### 2.3 Orchestration Engine (Go)

**Responsibility:** Coordinate multi-agent workflows, manage inter-agent communication.

```go
type OrchestrationEngine struct {
    agentRuntime  *AgentRuntime

    // Workflows: named sequences of agents
    workflows     map[string]*Workflow

    // Active workflow instances
    instances     map[string]*WorkflowInstance
}

type Workflow struct {
    Name        string
    Description string

    // DAG of agents to spawn
    Stages      []*WorkflowStage

    // Success criteria
    SuccessCond string  // e.g., "all stages complete"
}

type WorkflowStage struct {
    AgentName   string
    Description string

    // Dependencies: which prior stages must complete
    Depends     []string

    // Input passed from prior stage
    InputMapping map[string]string
}

type WorkflowInstance struct {
    WorkflowName string
    InstanceID   string

    Status       WorkflowStatus  // RUNNING, DONE, FAILED

    // Per-stage results
    StageResults map[string]*StageResult

    // Agents spawned for this instance
    Agents       map[string]types.ProcessID
}

func (oe *OrchestrationEngine) ExecuteWorkflow(req *ExecuteWorkflowRequest) (*WorkflowInstance, error) {
    workflow, ok := oe.workflows[req.WorkflowName]
    if !ok {
        return nil, fmt.Errorf("workflow not found")
    }

    instance := &WorkflowInstance{
        WorkflowName: req.WorkflowName,
        InstanceID:   generateID(),
        Status:       RUNNING,
        StageResults: make(map[string]*StageResult),
        Agents:       make(map[string]types.ProcessID),
    }

    oe.instances[instance.InstanceID] = instance

    // Execute stages in order (or parallelize if no deps)
    go oe.runWorkflowInstance(instance, workflow)

    return instance, nil
}
```

---

## Part 3: TypeScript Rendering Engine

### 3.1 Component System (TypeScript)

**Responsibility:** Define UI components, handle hydration from LLM output, emit events.

**Component Definition:**

```typescript
// Core component interface
interface ComponentNode {
  id: string;
  type: ComponentType;
  props: Record<string, any>;
  children?: ComponentNode[];

  // Layout information (computed)
  layout?: LayoutInfo;

  // Event handlers bound to this component
  handlers?: Record<string, EventHandler>;
}

type ComponentType =
  | 'Container'
  | 'Text'
  | 'Button'
  | 'Input'
  | 'DataTable'
  | 'InteractiveMap'
  | 'Timeline'
  | 'Canvas'
  | 'CodeEditor'
  | 'Chat';

// Primitive components: builtin to OS
interface Container {
  display?: 'flex' | 'grid' | 'block';
  flexDirection?: 'row' | 'column';
  justifyContent?: 'flex-start' | 'center' | 'space-between';
  alignItems?: 'flex-start' | 'center' | 'stretch';
  gap?: number;
  padding?: number | [top: number, right: number, bottom: number, left: number];
  backgroundColor?: string;
  borderRadius?: number;
  width?: number | 'fit-content' | 'fill';
  height?: number | 'fit-content' | 'fill';
}

interface Text {
  content: string;
  fontSize?: number;  // 12-72
  fontWeight?: 'normal' | 'bold';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  maxLines?: number;
}

interface Button {
  label: string;
  onPress?: string;  // Action name to emit
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

interface DataTable {
  rows: Record<string, any>[];
  columns: Column[];
  onRowClick?: string;  // Action name
  maxHeight?: number;  // Scrollable if exceeded
}

interface Canvas {
  width: number;
  height: number;
  commands: CanvasCommand[];  // GPU draw calls
}

// Full example tree from LLM
const exampleTree: ComponentNode = {
  id: 'root',
  type: 'Container',
  props: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 24,
  },
  children: [
    {
      id: 'title',
      type: 'Text',
      props: {
        content: 'Welcome to Agent',
        fontSize: 24,
        fontWeight: 'bold',
      },
    },
    {
      id: 'table',
      type: 'DataTable',
      props: {
        rows: [
          { name: 'Alice', status: 'active' },
          { name: 'Bob', status: 'inactive' },
        ],
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'status', label: 'Status' },
        ],
        onRowClick: 'selectUser',
      },
    },
  ],
};
```

---

### 3.2 Hydration Engine (TypeScript)

**Responsibility:** Convert LLM-emitted JSON component tree into live, event-responsive UI.

```typescript
interface Hydrator {
  // Parse JSON from LLM, validate, construct component tree
  hydrate(json: string, agentPID: number): Promise<ComponentNode>;

  // Mount component tree to DOM (or Rust compositor)
  mount(node: ComponentNode, windowID: number): void;

  // Update component tree in-place (diffing)
  update(node: ComponentNode, newNode: ComponentNode, windowID: number): void;

  // Unmount and cleanup
  unmount(windowID: number): void;
}

class HydratorImpl implements Hydrator {
  private schemaValidator: SchemaValidator;
  private eventBinder: EventBinder;
  private renderer: Renderer;

  async hydrate(json: string, agentPID: number): Promise<ComponentNode> {
    // 1. Parse JSON (will throw if invalid)
    let raw: any;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      throw new Error(`Invalid JSON from agent ${agentPID}: ${e.message}`);
    }

    // 2. Validate against component schema
    if (!this.schemaValidator.validate(raw)) {
      throw new Error(`Component tree doesn't match schema`);
    }

    // 3. Reconstruct component tree with type-safe accessors
    const tree = this.reconstructTree(raw, agentPID);

    // 4. Bind event handlers
    this.eventBinder.bindEvents(tree, agentPID);

    return tree;
  }

  private reconstructTree(raw: any, agentPID: number): ComponentNode {
    return {
      id: raw.id || generateID(),
      type: raw.type as ComponentType,
      props: raw.props || {},
      children: raw.children?.map(c => this.reconstructTree(c, agentPID)) || [],
    };
  }

  mount(node: ComponentNode, windowID: number): void {
    // Send component tree to Rust compositor
    const command: RenderCommand = {
      windowID,
      type: 'UpdateComponentTree',
      payload: JSON.stringify(node),
    };

    // IPC to Rust: invoke compositor.update_component_tree()
    sendToCompositor(command);
  }

  update(node: ComponentNode, newNode: ComponentNode, windowID: number): void {
    // Diff algorithm (minimal): only re-render changed subtree
    const diff = this.diffTree(node, newNode);

    // Send patch to Rust (more efficient than full tree)
    const patchCmd: RenderCommand = {
      windowID,
      type: 'PatchComponentTree',
      payload: JSON.stringify(diff),
    };

    sendToCompositor(patchCmd);
  }

  unmount(windowID: number): void {
    // Cleanup: signal Rust to release window resources
    const cmd: RenderCommand = {
      windowID,
      type: 'DestroyWindow',
      payload: '{}',
    };

    sendToCompositor(cmd);
  }
}
```

---

### 3.3 Event System (TypeScript)

**Responsibility:** Bind UI events to actions, emit events back to controlling agent.

```typescript
interface EventHandler {
  actionName: string;
  payload?: Record<string, any>;
}

interface UIEvent {
  type: 'click' | 'change' | 'submit' | 'custom';
  sourceComponentID: string;
  sourceWindowID: number;
  targetAgentPID: number;

  // Event-specific data
  pointerX?: number;
  pointerY?: number;
  value?: string;
  selectedRows?: number[];
}

class EventBinder {
  private agentPIDMap: Map<number, string> = new Map();  // windowID -> agent PID
  private dispatchChannel: MessageChannel;

  constructor(dispatchChannel: MessageChannel) {
    this.dispatchChannel = dispatchChannel;
  }

  bindEvents(tree: ComponentNode, agentPID: number): void {
    this.walkAndBind(tree, agentPID);
  }

  private walkAndBind(node: ComponentNode, agentPID: number): void {
    // Attach event listener
    if (node.props.onPress) {
      node.handlers = node.handlers || {};
      node.handlers['press'] = {
        actionName: node.props.onPress,
        payload: { componentID: node.id },
      };
    }

    if (node.props.onChange) {
      node.handlers = node.handlers || {};
      node.handlers['change'] = {
        actionName: node.props.onChange,
        payload: { componentID: node.id },
      };
    }

    // Recurse
    for (const child of node.children || []) {
      this.walkAndBind(child, agentPID);
    }
  }

  // Called by Rust compositor when user clicks a button
  handleUIEvent(event: UIEvent): void {
    // Find handler in component tree
    const handler = this.findHandler(event.sourceComponentID, event.type);
    if (!handler) {
      console.warn(`No handler for ${event.type} on ${event.sourceComponentID}`);
      return;
    }

    // Emit action to controlling agent
    const dispatchAction = {
      agentPID: event.targetAgentPID,
      action: handler.actionName,
      payload: {
        ...handler.payload,
        ...event,
      },
    };

    // Send to Rust dispatcher via IPC
    this.dispatchChannel.postMessage({
      type: 'DispatchAction',
      data: dispatchAction,
    });
  }
}
```

---

### 3.4 GPU Acceleration (TypeScript/WebGPU)

**Responsibility:** Compile component tree to GPU commands, handle complex geometry.

```typescript
interface GPURenderer {
  // Initialize GPU context
  init(canvas: HTMLCanvasElement): Promise<void>;

  // Compile component tree to GPU command buffer
  render(tree: ComponentNode, bounds: Rect): Promise<GPUCommandBuffer>;
}

class WebGPURenderer implements GPURenderer {
  private device!: GPUDevice;
  private queue!: GPUQueue;
  private context!: GPUCanvasContext;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const adapter = await navigator.gpu!.requestAdapter();
    this.device = await adapter!.requestDevice();
    this.queue = this.device.queue;

    this.context = canvas.getContext('webgpu')!;
    this.context.configure({
      device: this.device,
      format: navigator.gpu!.getPreferredCanvasFormat(),
    });
  }

  async render(tree: ComponentNode, bounds: Rect): Promise<GPUCommandBuffer> {
    const encoder = this.device.createCommandEncoder();

    // Walk tree, emit GPU render passes
    this.walkAndRender(tree, encoder, bounds);

    return encoder.finish();
  }

  private walkAndRender(
    node: ComponentNode,
    encoder: GPUCommandEncoder,
    bounds: Rect,
  ): void {
    const nodeProps = node.props as any;

    switch (node.type) {
      case 'Container':
        // Draw background rect
        if (nodeProps.backgroundColor) {
          this.drawRect(encoder, bounds, nodeProps.backgroundColor);
        }

        // Recurse on children
        const layout = this.computeLayout(node, bounds);
        for (const child of node.children || []) {
          const childBounds = layout.childBounds[child.id]!;
          this.walkAndRender(child, encoder, childBounds);
        }
        break;

      case 'Text':
        // Render text using SDF texture
        this.drawText(encoder, nodeProps.content, bounds, nodeProps);
        break;

      case 'Canvas':
        // Raw GPU commands
        this.executeCanvasCommands(encoder, nodeProps.commands);
        break;
    }
  }

  private drawRect(encoder: GPUCommandEncoder, bounds: Rect, color: string): void {
    // Create render pass, bind rect shader, draw
    // (simplified; real implementation handles texture targets)
  }

  private drawText(
    encoder: GPUCommandEncoder,
    text: string,
    bounds: Rect,
    style: any,
  ): void {
    // Use pre-rasterized glyph atlas
    // Or SDF shader for dynamic sizes
  }
}
```

---

## Part 4: Tauri Prototype Architecture

### 4.1 Tauri Bootstrap (Rust Backend + Web Frontend)

**Responsibility:** Provide first working prototype before full OS extraction.

```rust
// Tauri app structure
#[tauri::command]
fn spawn_agent(name: String, prompt: String) -> Result<ProcessId, String> {
    // Invoke Go runtime via RPC
    let runtime = GO_RUNTIME.lock().unwrap();
    let agent = runtime.spawn_agent(&name, &prompt)?;
    Ok(agent.pid)
}

#[tauri::command]
fn dispatch_action(agent_pid: ProcessId, action: String, payload: serde_json::Value) -> Result<(), String> {
    // Route to action dispatcher
    DISPATCHER.dispatch_action(agent_pid, action, payload)?;
    Ok(())
}

#[tauri::command]
fn render_component_tree(window_label: String, tree: serde_json::Value) -> Result<(), String> {
    // Convert component tree to Rust structure, queue render command
    let tree = serde_json::from_value(tree)?;
    COMPOSITOR.enqueue_render(window_label, tree)?;
    Ok(())
}

// Tauri init
#[cfg_attr(
    all(not(debug_assertions), target_os = "macos"),
    windows_subsystem = "windows"
)]
fn main() {
    // Initialize subsystems
    let rt = Arc::new(Mutex::new(GO_RUNTIME_INSTANCE));
    let dispatcher = Arc::new(ActionDispatcher::new());
    let compositor = Arc::new(Compositor::new());

    // Start frame loop in background thread
    let comp_clone = Arc::clone(&compositor);
    std::thread::spawn(move || {
        loop {
            let _ = comp_clone.frame_tick();
            std::thread::sleep(Duration::from_millis(16));  // 60fps
        }
    });

    // Build Tauri app
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            spawn_agent,
            dispatch_action,
            render_component_tree,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            // Handle window events, etc.
        });
}
```

**Web Frontend (TypeScript/React-like):**

```typescript
// React-like interface for agent UI
interface AgentUI {
  // Hook-style state management
  useState(initialValue: any): [any, (newValue: any) => void];

  // Hook-style effects
  useEffect(fn: () => void, deps: any[]): void;

  // Emit component tree to Rust backend
  render(tree: ComponentNode): void;

  // Dispatch action to agent
  dispatch(action: string, payload?: any): void;
}

class AgentUIContext implements AgentUI {
  private state: Map<string, any> = new Map();
  private stateSetters: Map<string, (v: any) => void> = new Map();
  private agentPID: number;

  constructor(agentPID: number) {
    this.agentPID = agentPID;
  }

  useState(initialValue: any): [any, (newValue: any) => void] {
    const key = `state_${Date.now()}_${Math.random()}`;

    if (!this.state.has(key)) {
      this.state.set(key, initialValue);
    }

    const setter = (newValue: any) => {
      this.state.set(key, newValue);
      this.triggerRender();
    };

    this.stateSetters.set(key, setter);

    return [this.state.get(key), setter];
  }

  useEffect(fn: () => void, deps: any[]): void {
    // Simplified: call on every render
    fn();
  }

  render(tree: ComponentNode): void {
    // Send to Rust backend
    window.__TAURI__.invoke('render_component_tree', {
      window_label: `agent_${this.agentPID}`,
      tree: tree,
    });
  }

  dispatch(action: string, payload?: any): void {
    // Send to Rust dispatcher, which routes to agent
    window.__TAURI__.invoke('dispatch_action', {
      agent_pid: this.agentPID,
      action,
      payload: payload || {},
    });
  }

  private triggerRender(): void {
    // Re-execute agent's render function
    // (requires agent to have idempotent render)
  }
}
```

---

### 4.2 IPC Bridge (Tauri ↔ Rust ↔ Go)

**Responsibility:** Enable communication between Tauri web frontend, Rust kernel, Go middleware.

```rust
// Tauri plugin: bridge between frontend and kernel
pub struct BridgePlugin;

impl BridgePlugin {
    // Route messages from web frontend
    pub fn route_message(msg: BridgeMessage) -> Result<BridgeResponse, BridgeError> {
        match msg.target {
            "compositor" => {
                // Compositor commands
                COMPOSITOR.handle_message(&msg.payload)?;
                Ok(BridgeResponse::Ok(json!({})))
            }
            "dispatcher" => {
                // Action dispatch
                DISPATCHER.dispatch(&msg.payload)?;
                Ok(BridgeResponse::Ok(json!({})))
            }
            "runtime" => {
                // Go runtime commands
                GO_RPC_CLIENT.call(&msg.payload)?;
                Ok(BridgeResponse::Ok(json!({})))
            }
            _ => Err(BridgeError::UnknownTarget),
        }
    }
}

pub enum BridgeMessage {
    // Compositor: update component tree
    UpdateComponentTree {
        window_id: WindowId,
        tree: Arc<ComponentNode>,
    },

    // Dispatcher: emit action
    DispatchAction {
        agent_pid: ProcessId,
        action: String,
        payload: serde_json::Value,
    },

    // Runtime: spawn agent
    SpawnAgent {
        name: String,
        prompt: String,
    },
}

pub enum BridgeResponse {
    Ok(serde_json::Value),
    Error(String),
}
```

**Go RPC Server:**

```go
// Exposed via HTTP/gRPC from Go runtime
type BridgeServer struct {
    runtime *AgentRuntime
}

func (bs *BridgeServer) SpawnAgent(ctx context.Context, req *SpawnAgentRequest) (*SpawnAgentResponse, error) {
    agent, err := bs.runtime.SpawnAgent(req)
    if err != nil {
        return nil, err
    }
    return &SpawnAgentResponse{PID: agent.PID}, nil
}

func (bs *BridgeServer) DispatchAction(ctx context.Context, req *DispatchActionRequest) (*Empty, error) {
    action := &DispatchAction{
        AgentPID: req.AgentPID,
        Action:   req.Action,
        Payload:  req.Payload,
    }

    agent, ok := bs.runtime.agents[action.AgentPID]
    if !ok {
        return nil, fmt.Errorf("agent not found")
    }

    agent.inputChan <- action
    return &Empty{}, nil
}

// Start server
func (bs *BridgeServer) Listen(addr string) error {
    listener, err := net.Listen("tcp", addr)
    if err != nil {
        return err
    }

    grpcServer := grpc.NewServer()
    RegisterBridgeServer(grpcServer, bs)

    return grpcServer.Serve(listener)
}
```

---

## Part 5: Process Isolation Model

### 5.1 Agent Processes and Sandboxing

**Responsibility:** Isolate agents, prevent resource hogging, enforce quotas.

```rust
pub struct ProcessIsolationManager {
    // Per-agent resource quotas
    quotas: HashMap<ProcessId, ResourceQuota>,

    // Watchdog: monitor for violations
    watchdog: ResourceWatchdog,
}

pub struct ResourceQuota {
    agent_pid: ProcessId,

    // Memory: hard limit
    memory_limit_bytes: u64,
    memory_used_bytes: AtomicU64,

    // CPU: milliseconds per second
    cpu_quota_millis: u32,
    cpu_used_millis: AtomicU32,

    // Time budget for single action
    action_timeout_ms: u32,

    // Allowed syscalls (whitelist)
    allowed_syscalls: Vec<SyscallId>,
}

impl ProcessIsolationManager {
    // Create new agent with quotas
    pub fn create_agent_sandbox(
        &mut self,
        agent_pid: ProcessId,
        quota: ResourceQuota,
    ) -> Result<AgentSandbox, IsolationError> {
        self.quotas.insert(agent_pid, quota.clone());

        // Spawn sandboxed process (Go runtime in isolated goroutine)
        let sandbox = AgentSandbox {
            pid: agent_pid,
            quota,
            created_at: Instant::now(),
        };

        Ok(sandbox)
    }

    // Monitor and enforce quotas
    pub fn check_quotas(&mut self, agent_pid: ProcessId) -> Result<(), IsolationError> {
        let quota = self.quotas.get(&agent_pid).ok_or(IsolationError::AgentNotFound)?;

        // Memory check
        if quota.memory_used_bytes.load(Ordering::Relaxed) > quota.memory_limit_bytes {
            return Err(IsolationError::MemoryExceeded);
        }

        // CPU check
        if quota.cpu_used_millis.load(Ordering::Relaxed) > quota.cpu_quota_millis {
            return Err(IsolationError::CPUExceeded);
        }

        Ok(())
    }

    // Kill violating agent
    pub fn kill_agent_for_violation(
        &mut self,
        agent_pid: ProcessId,
        reason: ViolationReason,
    ) -> Result<(), IsolationError> {
        let _quota = self.quotas.remove(&agent_pid)
            .ok_or(IsolationError::AgentNotFound)?;

        eprintln!("Killing agent {} for violation: {:?}", agent_pid, reason);

        // Notify Go runtime to cleanup
        self.watchdog.kill_agent(agent_pid)?;

        Ok(())
    }
}

pub struct ResourceWatchdog {
    // Sample agent resource usage periodically
    sample_interval: Duration,
}

impl ResourceWatchdog {
    pub fn monitor_loop(&self, manager: Arc<Mutex<ProcessIsolationManager>>) {
        let mut interval = tokio::time::interval(self.sample_interval);

        loop {
            interval.tick().await;

            let mut mgr = manager.lock().unwrap();

            for agent_pid in mgr.quotas.keys().copied().collect::<Vec<_>>() {
                if let Err(e) = mgr.check_quotas(agent_pid) {
                    let _ = mgr.kill_agent_for_violation(agent_pid, ViolationReason::from(e));
                }
            }
        }
    }
}
```

---

### 5.2 Syscall Whitelisting

```rust
pub enum SyscallId {
    // Allowed
    Read,
    Write,
    Seek,

    // Disallowed
    Open,
    Delete,
    Chmod,

    // Custom: agent actions
    EmitRenderCommand,
    DispatchChildAction,
}

pub struct SyscallFilter {
    allowed: HashSet<SyscallId>,
}

impl SyscallFilter {
    pub fn check_syscall(&self, syscall: SyscallId) -> Result<(), SyscallError> {
        if self.allowed.contains(&syscall) {
            Ok(())
        } else {
            Err(SyscallError::NotAllowed)
        }
    }
}
```

---

## Part 6: Rendering Pipeline

### 6.1 From LLM Output to Pixels

**Full Pipeline:**

```
1. LLM OUTPUT (100ms)
   └─ JSON: { "type": "Container", "props": {...}, "children": [...] }

2. HYDRATION (TypeScript, <1ms)
   └─ Parse JSON → Reconstruct ComponentNode tree
   └─ Validate against schema
   └─ Bind event handlers

3. COMPONENT TREE → RUST COMPOSITOR (<0.2ms)
   └─ IPC: send Arc<ComponentNode> to compositor
   └─ Enqueue RenderCommand with priority
   └─ Mark window dirty

4. COMPOSITOR NEXT FRAME TICK (<16ms total)
   ├─ T=0-1ms: Dispatch input events (user actions)
   ├─ T=1-2ms: Process render queue (consume commands)
   │  └─ If new component tree: check layout cache
   │  └─ If dirty: compute layout
   │  └─ Mark damage region
   ├─ T=3-10ms: Rasterize (Renderer walks tree → GPU)
   │  └─ Walk ComponentNode tree
   │  └─ For each node: emit GPU draw calls
   │  └─ Use cached layout, cull non-damaged regions
   │  └─ GPU: compile shaders, upload geometry, draw
   ├─ T=11-15ms: GPU presents (render pass completes)
   │  └─ GPU executes command buffer
   │  └─ Framebuffer → display
   └─ T=15-16ms: vsync sleep

5. PIXELS ON SCREEN (16ms)
   └─ Frame appears to user

Total latency (LLM emit to pixels): ~100ms + 16ms = ~116ms
Input latency (button click to pixels): ~13ms
```

### 6.2 Layout Engine (Flexbox-inspired)

```rust
pub struct LayoutEngine;

impl LayoutEngine {
    pub fn compute_layout(
        tree: &ComponentNode,
        available_size: Size,
    ) -> Result<LayoutResult, LayoutError> {
        let mut result = LayoutResult::new();
        self.layout_node(tree, available_size, &mut result)?;
        Ok(result)
    }

    fn layout_node(
        &self,
        node: &ComponentNode,
        available_size: Size,
        result: &mut LayoutResult,
    ) -> Result<(), LayoutError> {
        let props = &node.props;

        // Determine node's own size
        let width = props.get("width").and_then(|w| parse_dimension(w, available_size.width));
        let height = props.get("height").and_then(|h| parse_dimension(h, available_size.height));

        let node_size = Size {
            width: width.unwrap_or(available_size.width),
            height: height.unwrap_or(available_size.height),
        };

        // Layout children (if flex container)
        if let Some("flex") = props.get("display").and_then(|d| d.as_str()) {
            self.layout_flex_children(node, node_size, result)?;
        }

        // Store layout info
        result.layouts.insert(node.id.clone(), LayoutInfo {
            size: node_size,
            position: Point { x: 0, y: 0 },  // Relative to parent
        });

        Ok(())
    }

    fn layout_flex_children(
        &self,
        node: &ComponentNode,
        available_size: Size,
        result: &mut LayoutResult,
    ) -> Result<(), LayoutError> {
        let flex_direction = node.props.get("flexDirection")
            .and_then(|d| d.as_str())
            .unwrap_or("row");

        let gap = node.props.get("gap")
            .and_then(|g| g.as_u64())
            .unwrap_or(0) as i32;

        let mut position = Point { x: 0, y: 0 };

        for child in &node.children {
            // Recurse
            let child_available = match flex_direction {
                "row" => Size { width: available_size.width, height: available_size.height },
                "column" => Size { width: available_size.width, height: i32::MAX },
                _ => available_size,
            };

            self.layout_node(child, child_available, result)?;

            let child_layout = &result.layouts[&child.id];

            // Update position
            match flex_direction {
                "row" => {
                    position.x += child_layout.size.width + gap;
                }
                "column" => {
                    position.y += child_layout.size.height + gap;
                }
                _ => {}
            }
        }

        Ok(())
    }
}
```

---

## Part 7: Path from Tauri Prototype to Full OS

### 7.1 Extraction Strategy

**Phase 1: Tauri Prototype (Current)**
- Rust kernel + Go middleware integrated in Tauri app
- Web frontend for initial UI testing
- Goal: Prove architecture works end-to-end

**Phase 2: Extract Kernel**
- Kernel subsystems (compositor, renderer, dispatcher, memory manager) run standalone
- No Tauri dependency
- Custom event loop (not browser event loop)
- GPU initialization: direct to GPU API (WebGPU shim or Vulkan)

```rust
// Standalone kernel entry point
pub struct OSKernel {
    compositor: Compositor,
    renderer: Renderer,
    dispatcher: ActionDispatcher,
    memory_manager: MemoryManager,
    process_isolation: ProcessIsolationManager,

    // IPC channels to Go middleware (on different process)
    go_bridge: GoBridge,
}

impl OSKernel {
    pub fn main_loop(&mut self) -> Result<(), KernelError> {
        loop {
            // Frame tick loop
            self.compositor.frame_tick()?;
            self.memory_manager.gc_idle_agents()?;
            self.process_isolation.monitor_loop()?;
        }
    }
}
```

**Phase 3: Replace TypeScript Renderer**
- TypeScript → Rust-native rendering
- Still uses Component primitives, but compiled to Rust
- Eliminates WebGPU shim, direct GPU API

**Phase 4: Native Display Integration**
- Tauri windowing → native X11, Wayland, macOS, Windows APIs
- Custom display server (optional: replace X11)
- Direct framebuffer access

### 7.2 Decoupling Strategy

**Current (Tauri Monolith):**
```
[Rust Kernel] ← IPC → [Go Middleware]
        ↑                      ↑
        └────── Tauri ────────┘
               (web frontend)
```

**Future (Modular):**
```
[Rust Kernel] ←IPC→ [Go Middleware]
        ↑                    ↑
    [GPU Driver]        [LLM Router]
        ↑
    [Display Server]
```

**Transition Milestones:**

| Milestone | Kernel | Middleware | Renderer | Status |
|-----------|--------|------------|----------|--------|
| Proto v1 | Tauri-embedded | Go goroutines | TypeScript/WebGPU | 🚀 Current |
| Proto v2 | Standalone binary | Go process, gRPC bridge | TypeScript/WebGPU | 🔄 Q2 2026 |
| Proto v3 | Standalone | Go process | Rust-native | 🔄 Q3 2026 |
| Full OS | Native kernel | Native service | Rust | 🔄 Q4 2026+ |

---

## Part 8: Performance Budgets Summary

| Phase | Operation | Budget | Achieved (Target) |
|-------|-----------|--------|-------------------|
| **Input** | Event enqueue | <0.5ms | Compositor |
| **Dispatch** | Action to agent | <5ms | ActionDispatcher |
| **Agent** | LLM query + response | ~100ms | Go runtime + router |
| **Render** | Component tree update | <0.2ms | Compositor |
| **Layout** | Compute flexbox | <2ms | LayoutEngine |
| **Rasterize** | GPU render pass | <7ms (CPU), <5ms (GPU) | Renderer + GPU |
| **Present** | vsync + blit | <1ms | GPU driver |
| **Total/Frame** | Input to pixels | <16ms | 60fps target |
| **Total/Agent** | UI change to pixels | <120ms (100ms LLM + 20ms render) | End-to-end |

---

## Part 9: Critical Hot Paths (GC-Free)

### Path 1: Button Click → Agent Receives Event (4.5ms)

```rust
// Compositor detects pointer_up event
// Marks button component with pointer events
// Routes to dispatcher: <0.5ms

dispatcher.dispatch(DispatchAction {
    agent_pid,
    event: InputEvent::PointerUp { button: 1 },
})?;  // Non-blocking mpsc send: <0.1ms

// Agent goroutine wakes up, reads from channel: <1ms
// Checks event handler table: <0.1ms
// Invokes callback or emits query to LLM: <3ms

// Total: ~4.5ms (zero allocations in hot path)
```

### Path 2: LLM Emits Component Tree → Pixels (16ms)

```typescript
// LLM result: { type: "Button", props: { label: "Click" } }

// Hydrator.hydrate(): parse JSON + validate
// <1ms, one allocation per top-level node

// Send to Rust compositor
// <0.2ms, Arc clone (cheap)

// Compositor queues render command
// <0.1ms, VecDeque push

// Next frame tick (T=3-10ms):
// Renderer.walk_component_tree()
// Zero allocations (uses borrowed references)
// <7ms total (CPU bound)

// GPU render + present
// <5ms (GPU work, CPU idle)

// Total: <16ms (bounded by frame deadline)
```

### Path 3: Text Rendering (Avoid Rasterization)

```rust
// Instead of rasterizing glyph pixels on CPU (expensive):

// 1. Use SDF (signed distance field) texture
//    Pre-rasterized at design time
//    GPU upscales to any size (smooth)

// 2. Bind glyph_atlas texture
// 3. Emit quads for glyphs
// 4. GPU shader renders SDF → pixels

// Result: text rendering <1ms (GPU, not CPU)
```

---

## Glossary

- **Compositor:** Window manager, z-order, damage tracking, frame pacing.
- **Renderer:** Tree → GPU commands, layout, culling, shader management.
- **Dispatcher:** Route input events to agent processes, enforce latency.
- **Memory Manager:** Arena allocation, per-agent heaps, zero-GC hot paths.
- **Hydrator:** JSON → ComponentNode tree, event binding.
- **Component Primitives:** Container, Text, Button, DataTable, Canvas, etc.
- **RenderCommand:** Instruction to compositor (update tree, rasterize region).
- **DispatchAction:** Input event routed to agent (pointer, keyboard, custom).
- **AgentArena:** Linear memory allocator for single agent, bulk reset on death.
- **GC-Free Hot Path:** No allocations or deallocations during render frame or action dispatch.

---

## References & Related Specs

- Document 15: Memory Model (arena allocation, borrowing)
- Document 16: Agent Communication (IPC, event bus)
- Document 17: Security & Sandboxing (resource quotas, syscall whitelist)
- Document 19: Network & API Layer (HTTP, WebSocket, gRPC)
- Document 20: Storage & Persistence (file system, databases)
