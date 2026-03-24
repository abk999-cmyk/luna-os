# Document 24: Technology Stack and Implementation Guide

**LLM-Native Operating System | Specification Document 24 of 26**

**Purpose:** Codify all technology decisions and architecture patterns. This document is THE authoritative reference for what technologies, versions, and configurations Claude Code must use for implementation.

**Status:** Complete Technology Stack Definition | Production-Ready Recommendations

---

## Executive Summary

This document specifies every technology choice for the LLM-native OS prototype and path to production. All decisions are justified by performance requirements, memory constraints, and LLM integration patterns.

**Core Stack:**
- **Kernel/Performance:** Rust (window compositor, memory management, action dispatch)
- **Middleware:** Go (agent orchestration, model integration)
- **UI Layer:** TypeScript (dynamic component hydration via custom React-like renderer)
- **Prototype Shell:** Tauri (Rust backend + web frontend)
- **Rendering:** WebGPU with custom compositor (GPU-accelerated)
- **Memory Systems:** Semantic (graph DB), Working (fast KV), Episodic (event store), Procedural (document store)
- **Coordination:** Message passing + WebSocket for inter-agent communication

---

## Part 1: Language Decisions (with Justifications)

### 1.1 Rust: Kernel and Performance-Critical Components

**Components:**
- Window compositor
- Rendering engine core
- Memory management subsystem
- Action dispatch system
- GPU communication layer

**Justification:**
- **No GC pauses:** LLMs generate UI continuously; pauses break responsiveness
- **Memory safety without runtime:** Systems code cannot afford GC overhead
- **Systems-level speed:** Direct hardware access, zero-cost abstractions
- **Fearless concurrency:** Safe multi-threaded rendering pipelines
- **Static typing:** Catches memory/concurrency bugs at compile time

**Recommended Version:** Rust 1.75+ (latest stable)

**Key Dependencies:**
```toml
# Core rendering
wgpu = "0.19"              # WebGPU abstraction
winit = "0.29"             # Window creation and events
glam = "0.24"              # Linear algebra (GPU transforms)

# Memory and performance
parking_lot = "0.12"       # Better mutex/rwlock than std
crossbeam = "0.8"          # Lock-free concurrent structures
ahash = "0.8"              # Fast hashing for KV lookups

# Serialization
serde = { version = "1.0", features = ["derive"] }
bincode = "1.3"            # Fast binary serialization

# Async runtime
tokio = { version = "1.35", features = ["full"] }
```

**Why NOT C++:** Memory safety issues; every systems program in C++ leaks or crashes. Rust catches these at compile time.

**Why NOT C:** Same safety issues, plus no modern concurrency primitives.

---

### 1.2 Go: Middleware and Agent Orchestration

**Components:**
- Agent orchestration layer
- Model integration (LLM API calls, prompt management)
- Higher-level business logic
- gRPC service definitions
- Message queue workers

**Justification:**
- **Concurrency is default:** Goroutines handle 1000s of concurrent agent instances
- **Fast compilation:** 5-10 second builds vs 30+ seconds for Rust
- **Native binaries:** No runtime, single executable deployment
- **Production proven:** Used in systems where uptime matters (Kubernetes, etcd, Docker)
- **C interop:** Can call Rust libraries via cgo when needed
- **Built-in testing:** `go test` is fast and integrated

**Recommended Version:** Go 1.22+

**Key Dependencies:**
```go
// gRPC for inter-service communication
import "google.golang.org/grpc"
import "google.golang.org/protobuf"

// OpenAI/Claude API integration
// (vendor directly or use lightweight wrapper)

// Structured logging
import "github.com/charmbracelet/log"

// HTTP and protocols
import "net/http"
import "github.com/valyala/fasthttp"  // if ultra-high-throughput needed

// Config management
import "github.com/spf13/viper"

// Testing
import "testing"
```

**Why NOT Python:** Dynamic typing causes runtime errors in production; slow; GIL limits concurrency; deployment complex (virtual envs, dependencies).

**Why Go over Rust for this layer:** Iteration speed. Agents and business logic change frequently. Go recompiles in seconds; Rust takes minutes.

---

### 1.3 TypeScript: Dynamic UI Rendering Layer

**Components:**
- Custom React-like renderer
- Component tree hydration from LLM output
- Event handling and state management
- DOM-to-GPU pipeline coordination
- Real-time collaboration support

**Justification:**
- **Fast DOM diffing:** React is proven; we write a minimal clone
- **Web ecosystem:** 10+ years of battle-tested libraries
- **Type safety:** TypeScript catches UI prop mismatches
- **Easy LLM integration:** Parse LLM component trees as JSON → TypeScript objects
- **Instant reload:** Hot module replacement for rapid iteration
- **Browser DevTools:** Debug UI components in real time

**Recommended Version:** TypeScript 5.3+ (with strict mode)

**Key Dependencies:**
```json
{
  "typescript": "^5.3.0",
  "preact": "^10.18.0",           // Lightweight React alternative (3KB)
  "htm": "^3.1.1",                // JSX-like syntax without build step
  "zustand": "^4.4.0",            // Tiny state management (2KB)
  "immer": "^10.0.0",             // Immutable state updates
  "@tauri-apps/api": "^1.5.0",    // Tauri backend communication
  "vite": "^5.0.0",               // Build tool (100x faster than webpack)
  "vitest": "^1.0.0",             // Fast unit testing
  "eslint": "^8.54.0",
  "prettier": "^3.1.0"
}
```

**Custom Renderer Pattern:**
```typescript
// Not using React directly. Instead:
// 1. Parse LLM JSON output → Component tree
// 2. Diffing: Compare previous tree with new tree
// 3. Render: Only update DOM elements that changed
// 4. GPU coordinates: Pass layout to Rust compositor
```

**Why NOT React directly:** React adds 40KB+ (minified). We need ~5KB renderer that:
- Parses LLM JSON component definitions
- Minimal virtual DOM (just enough for diffing)
- Direct GPU communication for transforms

---

## Part 2: Prototype Architecture (Tauri)

### 2.1 Tauri Framework Overview

**What it is:** Rust backend (Tokio async runtime) + web frontend (Chromium/WebKit renderer).

**Why Tauri for prototype:**
- **Near-native speed:** Rust backend, native window, GPU acceleration
- **Dynamic UI:** Web rendering pipeline supports LLM-generated components
- **Fast iteration:** Change TS/JS frontend without recompiling Rust
- **Desktop delivery:** Single executable, no runtime dependencies
- **Path to OS:** Core Rust components can be extracted and hardened later

**Recommended Version:** Tauri v2.0+ (major v2 released late 2024)

**Architecture Diagram:**
```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Application                      │
├─────────────────────────────────────────────────────────┤
│  Frontend (TypeScript/Preact)                             │
│  ├─ Custom React-like renderer                           │
│  ├─ Component tree hydration                             │
│  └─ Event handling + state (Zustand)                     │
├─────────────────────────────────────────────────────────┤
│  Tauri IPC Bridge                                        │
│  └─ message passing, invoke RPC calls                    │
├─────────────────────────────────────────────────────────┤
│  Backend (Rust + Tokio)                                  │
│  ├─ Window compositor + renderer (wgpu/WebGPU)          │
│  ├─ Memory management                                    │
│  ├─ Action dispatch                                      │
│  └─ Go middleware bridge (gRPC)                          │
├─────────────────────────────────────────────────────────┤
│  Go Middleware (separate process)                        │
│  ├─ Agent orchestration                                  │
│  ├─ LLM API integration                                  │
│  └─ Memory systems (graph DB, KV store, etc)            │
└─────────────────────────────────────────────────────────┘
```

**Tauri Key Configuration:**
```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2.0", features = ["shell-open", "window-all"] }
tauri-build = "2.0"
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
wgpu = "0.19"
winit = "0.29"

[tauri.build]
devPath = "../frontend/dist"
frontendDist = "../frontend/dist"
```

---

## Part 3: GPU Rendering (WebGPU + Custom Compositor)

### 3.1 WebGPU

**What it is:** Modern GPU API (successor to WebGL). Cross-platform: Windows (DirectX 12), macOS (Metal), Linux (Vulkan).

**Recommended Version:** wgpu 0.19+

**Why WebGPU:**
- **Modern API:** No legacy WebGL cruft
- **Better performance:** Closer to hardware; lower-level control
- **Cross-platform:** Single codebase runs on all OSes
- **Compute shaders:** Essential for physics, AI inference optimization
- **Real-time:** 60+ FPS rendering pipeline

**Architecture:**
```
Component Tree (TypeScript)
    ↓
Layout Engine (Rust/wgpu)
    - Calculate positions, sizes
    - Apply transforms
    ↓
Render Queue (GPU commands)
    - Bind textures, buffers
    - Submit draw calls
    ↓
WebGPU Adapter (platform-specific)
    - DirectX 12 (Windows)
    - Metal (macOS)
    - Vulkan (Linux)
    ↓
GPU Output (framebuffer → display)
```

**Sample Rust Rendering Pipeline:**
```rust
use wgpu::*;

pub struct Compositor {
    device: Device,
    queue: Queue,
    render_pipeline: RenderPipeline,
    bind_group_layout: BindGroupLayout,
}

impl Compositor {
    pub async fn new(surface: &Surface<'_>) -> Self {
        let instance = Instance::new(InstanceDescriptor::default());
        let adapter = instance.request_adapter(&RequestAdapterOptions::default()).await.unwrap();
        let (device, queue) = adapter.request_device(&Default::default(), None).await.unwrap();

        // Compile shaders
        let shader_module = device.create_shader_module(ShaderModuleDescriptor {
            label: Some("main_shader"),
            source: ShaderSource::Wgsl(include_str!("shaders/main.wgsl").into()),
        });

        // Create pipeline
        let render_pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("main_pipeline"),
            layout: Some(&device.create_pipeline_layout(&PipelineLayoutDescriptor {
                label: Some("main_layout"),
                bind_group_layouts: &[],
                push_constant_ranges: &[],
            })),
            vertex: VertexState {
                module: &shader_module,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(FragmentState {
                module: &shader_module,
                entry_point: "fs_main",
                targets: &[Some(ColorTargetState {
                    format: surface.get_capabilities(&adapter).formats[0],
                    blend: Some(BlendState::ALPHA_BLENDING),
                    write_mask: ColorWrites::ALL,
                })],
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
        });

        Self {
            device,
            queue,
            render_pipeline,
            bind_group_layout: device.create_bind_group_layout(&BindGroupLayoutDescriptor {
                label: Some("bind_group_layout"),
                entries: &[],
            }),
        }
    }

    pub fn render(&self, component_tree: &ComponentTree) {
        // 1. Layout pass: Calculate positions
        let layout = component_tree.calculate_layout();

        // 2. Upload to GPU
        let vertex_buffer = self.device.create_buffer_init(&BufferInitDescriptor {
            label: Some("vertex_buffer"),
            contents: &layout.vertices_as_bytes(),
            usage: BufferUsages::VERTEX,
        });

        // 3. Submit render commands
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("main_render_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &self.target_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(Color::BLACK),
                        store: StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_vertex_buffer(0, vertex_buffer.slice(..));
            render_pass.draw(0..layout.vertex_count as u32, 0..1);
        }

        self.queue.submit(std::iter::once(encoder.finish()));
    }
}
```

**Why NOT OpenGL:** Deprecated (Khronos no longer develops it for modern systems). WebGPU is the future.

---

## Part 4: Memory Systems Architecture

### 4.1 Semantic Memory (Graph Database)

**Purpose:** Relationship knowledge: "Claude knows X is a type of Y", "X relates to Z", ontologies, entity graphs.

**Recommended Technology:** Neo4j Community Edition or TigerGraph (graph-native), with fallback to DuckDB (embedded graph queries).

**Top Choice: Neo4j Community Edition**

**Why Neo4j:**
- **ACID transactions:** Consistent state even during concurrent agent queries
- **Cypher query language:** Expressive graph queries (find related concepts in 1 query)
- **Scalable:** Supports billions of nodes/relationships
- **Embedded option:** Neo4j Embedded (JVM) or use standalone server
- **Proven:** Used in recommendation engines, fraud detection, knowledge graphs

**Recommended Version:** Neo4j 5.14+

**Schema Example:**
```cypher
// Concepts and relationships
CREATE (concept:Concept {name: "Window", type: "UI_Element"})
CREATE (parent:Concept {name: "Component", type: "UI_Abstract"})
CREATE (concept)-[:IS_A]->(parent)

// Capability relationships
CREATE (agent:Agent {id: "agent_001", role: "Renderer"})
CREATE (action:Action {name: "Render_Component"})
CREATE (agent)-[:CAN_DO]->(action)

// Temporal relationships
CREATE (event:Event {name: "ComponentRendered", timestamp: 1234567890})
CREATE (component)-[:GENERATED_EVENT]->(event)
```

**Go Integration:**
```go
import (
    "github.com/neo4j/neo4j-go-driver/v5"
)

func querySemanticMemory(ctx context.Context, driver neo4j.DriverWithContext, query string) ([]map[string]interface{}, error) {
    session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
    defer session.Close(ctx)

    result, err := session.Run(ctx, query, nil)
    if err != nil {
        return nil, err
    }

    var records []map[string]interface{}
    for result.Next(ctx) {
        records = append(records, result.Record().AsMap())
    }
    return records, result.Err()
}
```

**Setup (Docker):**
```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=none \
  neo4j:5.14
```

**Fallback Option:** DuckDB (embedded, SQL + JSON path queries, zero-maintenance):
```sql
SELECT * FROM concepts WHERE type = 'UI_Element'
UNION ALL
SELECT * FROM relationships WHERE concept_id IN (...)
```

---

### 4.2 Working Memory (Fast Key-Value Store)

**Purpose:** Real-time state: current component rendering, active agents, in-flight LLM requests. High read/write velocity.

**Recommended Technology:** Redis or Valkey (Redis fork), with fallback to DuckDB or etcd.

**Top Choice: Valkey (community fork of Redis)**

**Why Valkey:**
- **Blazing fast:** Sub-millisecond latency (in-memory)
- **Atomic operations:** SET, GET, INCR, LPUSH are atomic
- **Pub/Sub:** Agents subscribe to state changes
- **Persistence:** RDB snapshots + AOF (append-only file) for crash recovery
- **Community-driven:** SSPL license concerns with Redis → Valkey is open-source alternative

**Recommended Version:** Valkey 7.2+

**Key Patterns:**
```go
type WorkingMemory struct {
    client *redis.Client
}

func (wm *WorkingMemory) SetComponentState(ctx context.Context, componentID string, state interface{}) error {
    data, err := json.Marshal(state)
    if err != nil {
        return err
    }
    return wm.client.Set(ctx, fmt.Sprintf("component:%s", componentID), data, 5*time.Minute).Err()
}

func (wm *WorkingMemory) GetComponentState(ctx context.Context, componentID string) (interface{}, error) {
    val, err := wm.client.Get(ctx, fmt.Sprintf("component:%s", componentID)).Result()
    if err != nil {
        return nil, err
    }
    var state interface{}
    json.Unmarshal([]byte(val), &state)
    return state, nil
}

// Pub/Sub for agent coordination
func (wm *WorkingMemory) SubscribeToComponentUpdates(ctx context.Context, componentID string, callback func(interface{})) {
    pubsub := wm.client.Subscribe(ctx, fmt.Sprintf("component:%s:updates", componentID))
    for msg := range pubsub.Channel() {
        var state interface{}
        json.Unmarshal([]byte(msg.Payload), &state)
        callback(state)
    }
}
```

**Setup (Docker):**
```bash
docker run -d \
  --name valkey \
  -p 6379:6379 \
  valkey/valkey:7.2
```

**Fallback Option:** DuckDB in-memory with `memory_limit = '4GB'` (simpler, embedded).

---

### 4.3 Episodic Memory (Event Store)

**Purpose:** Timeline of what happened: "Agent X called API at T1", "Rendered component Y at T2", "User clicked Z at T3".

**Recommended Technology:** EventStoreDB or TimescaleDB.

**Top Choice: TimescaleDB (PostgreSQL extension)**

**Why TimescaleDB:**
- **Time-series optimized:** Orders of magnitude faster than vanilla PostgreSQL for time-based queries
- **Compression:** Stores 10-100x more data in same space
- **Familiar SQL:** Standard PostgreSQL syntax (no new DSL)
- **Hypertables:** Automatic partitioning by time
- **Analytics:** Can query recent events AND run historical analysis

**Recommended Version:** TimescaleDB 2.13+ (on PostgreSQL 15+)

**Schema:**
```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create events table
CREATE TABLE events (
    time TIMESTAMPTZ NOT NULL,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    component_id TEXT,
    action TEXT,
    metadata JSONB,
    duration_ms INT
);

-- Convert to hypertable (auto-partition by time)
SELECT create_hypertable('events', 'time', if_not_exists => TRUE);

-- Create compression policy (compress chunks older than 7 days)
ALTER TABLE events SET (timescaledb.compress, timescaledb.compress_orderby = 'time DESC, agent_id');
SELECT add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

-- Indexes for fast queries
CREATE INDEX idx_agent_time ON events (agent_id, time DESC);
CREATE INDEX idx_event_type_time ON events (event_type, time DESC);
```

**Go Integration:**
```go
import (
    "database/sql"
    _ "github.com/lib/pq"
)

func logEvent(ctx context.Context, db *sql.DB, agentID, eventType, componentID, action string, metadata map[string]interface{}) error {
    query := `INSERT INTO events (time, agent_id, event_type, component_id, action, metadata) VALUES (now(), $1, $2, $3, $4, $5)`

    metadataJSON, _ := json.Marshal(metadata)
    _, err := db.ExecContext(ctx, query, agentID, eventType, componentID, action, metadataJSON)
    return err
}

func queryEvents(ctx context.Context, db *sql.DB, agentID string, since time.Duration) ([]map[string]interface{}, error) {
    query := `SELECT time, event_type, component_id, action, metadata FROM events WHERE agent_id = $1 AND time > now() - $2 ORDER BY time DESC`

    rows, err := db.QueryContext(ctx, query, agentID, since.String())
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var results []map[string]interface{}
    for rows.Next() {
        var t time.Time
        var eventType, componentID, action string
        var metadata json.RawMessage
        rows.Scan(&t, &eventType, &componentID, &action, &metadata)

        results = append(results, map[string]interface{}{
            "time": t,
            "event_type": eventType,
            "component_id": componentID,
            "action": action,
            "metadata": metadata,
        })
    }
    return results, rows.Err()
}
```

**Setup (Docker):**
```bash
docker run -d \
  --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  timescale/timescaledb:latest-pg15
```

**Alternative:** EventStoreDB (event-sourcing database, if full event-sourcing pattern preferred).

---

### 4.4 Procedural Memory (Document Store)

**Purpose:** How-tos, patterns, prompts, templates: "How to render a button", "Prompt template for code generation".

**Recommended Technology:** MongoDB or CouchDB, with fallback to SQLite.

**Top Choice: MongoDB Atlas (managed) or local MongoDB Community**

**Why MongoDB:**
- **Flexible schema:** Store anything from simple strings to nested objects
- **Full-text search:** Find templates by keyword
- **Versioning:** Store multiple versions of prompts
- **Replication:** Easy backup to Atlas Cloud
- **Query language:** MQL is SQL-like enough for procedural lookups

**Recommended Version:** MongoDB 7.0+

**Schema Example:**
```javascript
// Prompt templates collection
db.prompts.insertOne({
    _id: ObjectId(),
    key: "generate_component_code",
    version: 1,
    category: "ui_generation",
    template: "Generate a React component that...",
    variables: ["component_type", "props", "state"],
    examples: [
        { input: {...}, output: "..." }
    ],
    created_at: ISODate(),
    updated_at: ISODate()
});

// Rendering patterns collection
db.patterns.insertOne({
    _id: ObjectId(),
    name: "Button with Hover Effect",
    tags: ["button", "interaction"],
    pattern: {
        baseStyle: {...},
        hoverStyle: {...},
        implementation: "CSS + GPU transform"
    }
});

// Agent capabilities collection
db.capabilities.insertOne({
    _id: ObjectId(),
    agent_id: "renderer_001",
    capability: "RenderComponent",
    algorithm: "wgpu compute shader pipeline",
    performance_expectations: {
        avg_latency_ms: 16,
        max_latency_ms: 33
    }
});
```

**Go Integration:**
```go
import "go.mongodb.org/mongo-driver/mongo"

func getPromptTemplate(ctx context.Context, client *mongo.Client, key string) (string, error) {
    coll := client.Database("llm_os").Collection("prompts")

    var result bson.M
    err := coll.FindOne(ctx, bson.M{"key": key, "version": -1}).Decode(&result)
    if err != nil {
        return "", err
    }

    return result["template"].(string), nil
}

func storePattern(ctx context.Context, client *mongo.Client, pattern map[string]interface{}) error {
    coll := client.Database("llm_os").Collection("patterns")
    _, err := coll.InsertOne(ctx, pattern)
    return err
}
```

**Setup (Docker):**
```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7.0
```

**Alternative:** SQLite (single-file, zero maintenance):
```sql
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    version INTEGER,
    template TEXT,
    variables JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Part 5: Inter-Agent Communication (Message Passing)

### 5.1 Message Queue Architecture

**Purpose:** Agents don't call each other directly (tight coupling). Instead, they publish messages to a bus; other agents subscribe.

**Recommended Technology:** Nats (gnatsd) or RabbitMQ.

**Top Choice: NATS (simple, fast)**

**Why NATS:**
- **Lightweight:** Single binary, no dependencies
- **Multi-protocol:** TCP, WebSocket (for browser agents)
- **Subject-based routing:** Agents subscribe to "render.component", "input.keyboard", etc.
- **At-most-once delivery:** Fast pub/sub (not guaranteed delivery, but perfect for state updates)
- **NATS Jetstream:** Optional persistence (message replay)
- **Latency:** Sub-millisecond

**Recommended Version:** NATS 2.10+

**Architecture:**
```
Agent A (Renderer)
    ↓ publishes to "render.component.list"
    ↓
NATS Broker
    ├─→ subscribed by Agent B (Input Handler)
    ├─→ subscribed by Agent C (Logger)
    └─→ subscribed by Agent D (Analytics)
```

**Go Implementation:**
```go
import "github.com/nats-io/nats.go"

type MessageBus struct {
    nc *nats.Conn
}

func NewMessageBus() (*MessageBus, error) {
    nc, err := nats.Connect(nats.DefaultURL)
    if err != nil {
        return nil, err
    }
    return &MessageBus{nc: nc}, nil
}

// Publish event from agent
func (mb *MessageBus) PublishEvent(subject string, event interface{}) error {
    data, _ := json.Marshal(event)
    return mb.nc.Publish(subject, data)
}

// Subscribe to events
func (mb *MessageBus) SubscribeToEvents(subject string, callback func(interface{})) (*nats.Subscription, error) {
    sub, err := mb.nc.Subscribe(subject, func(m *nats.Msg) {
        var event interface{}
        json.Unmarshal(m.Data, &event)
        callback(event)
    })
    return sub, err
}

// RPC pattern (request-reply)
func (mb *MessageBus) RequestResponse(subject string, request interface{}, timeout time.Duration) (interface{}, error) {
    data, _ := json.Marshal(request)
    reply, err := mb.nc.Request(subject, data, timeout)
    if err != nil {
        return nil, err
    }
    var response interface{}
    json.Unmarshal(reply.Data, &response)
    return response, nil
}
```

**Event Types:**
```go
// TypeScript/Go message contracts (shared via protobuf or JSON schema)

// Input event
type InputEvent struct {
    Type        string    // "mouse_click", "key_press", "touch"
    Timestamp   time.Time
    Coordinates [2]float32 // x, y
    Payload     interface{}
}

// Render event
type RenderEvent struct {
    ComponentID string
    TreeJSON    json.RawMessage
    Priority    int // 0 = async, 1 = interactive, 2 = blocking
}

// Memory event
type MemoryEvent struct {
    AgentID   string
    Operation string // "read", "write", "subscribe"
    Memory    string // "semantic", "working", "episodic", "procedural"
    Key       string
    Value     interface{}
}

// Agent event
type AgentEvent struct {
    AgentID string
    Status  string // "idle", "busy", "error"
    Task    string
    Progress float32 // 0.0 to 1.0
}
```

**Setup (Docker):**
```bash
docker run -d \
  --name nats \
  -p 4222:4222 \
  nats:2.10
```

---

### 5.2 gRPC for Service-to-Service Communication

**Purpose:** Go services need synchronous RPC (not just pub/sub). gRPC provides:
- Type-safe contracts (Protobuf)
- Binary protocol (fast)
- HTTP/2 multiplexing
- Streaming support

**Service Definitions (protobuf):**
```protobuf
// agent_orchestration.proto
syntax = "proto3";
package agent;

service AgentOrchestrator {
    rpc DispatchAction(Action) returns (ActionResult);
    rpc GetAgentStatus(AgentID) returns (AgentStatus);
    rpc StreamAgentEvents(AgentFilter) returns (stream AgentEvent);
}

message Action {
    string id = 1;
    string type = 2;
    bytes payload = 3;
    int32 priority = 4;
}

message ActionResult {
    string action_id = 1;
    bool success = 2;
    string error = 3;
    bytes result = 4;
}

message AgentStatus {
    string agent_id = 1;
    string state = 2;
    float cpu_usage = 3;
    float memory_usage = 4;
}
```

**Go Server:**
```go
import "google.golang.org/grpc"

type AgentOrchestrator struct {
    messageBus *MessageBus
    // ...
}

func (ao *AgentOrchestrator) DispatchAction(ctx context.Context, action *agent.Action) (*agent.ActionResult, error) {
    // Validate, log, dispatch to message bus
    err := ao.messageBus.PublishEvent(fmt.Sprintf("action.%s", action.Type), action)
    return &agent.ActionResult{
        ActionId: action.Id,
        Success: err == nil,
        Error: errToString(err),
    }, nil
}

func main() {
    lis, _ := net.Listen("tcp", ":50051")
    s := grpc.NewServer()

    orchestrator := &AgentOrchestrator{messageBus: mb}
    agent.RegisterAgentOrchestratorServer(s, orchestrator)

    s.Serve(lis)
}
```

**gRPC Version:** Protobuf 3.24+

---

## Part 6: Audio Processing (Voice Input)

### 6.1 Audio Input Pipeline

**Purpose:** Capture voice, stream to speech-to-text service, emit text events to agents.

**Recommended Technology:** Cpal (Rust audio) + Vosk (local STT) or OpenAI Whisper API.

**Top Choice: Cpal (cross-platform audio) + Whisper API**

**Why Cpal:**
- **Cross-platform:** Windows, macOS, Linux same code
- **Low-latency:** Direct hardware access
- **Streaming:** Capture audio in chunks (not entire file)

**Why Whisper API (not local):**
- **Accuracy:** 99%+ accuracy on diverse accents/languages
- **No local GPU required:** Send audio, get text back
- **Fallback to Vosk:** For offline/privacy scenarios

**Rust Audio Capture:**
```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

pub struct AudioCapture {
    stream: cpal::Stream,
    tx: crossbeam::channel::Sender<Vec<f32>>,
}

impl AudioCapture {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        let device = host.default_input_device()?;

        let config = device.default_input_config()?;
        let sample_rate = config.sample_rate().0;

        let (tx, rx) = crossbeam::channel::bounded(10);

        let stream = device.build_input_stream(
            &config.into(),
            move |data: &cpal::Data, _: &cpal::InputCallbackInfo| {
                let samples: Vec<f32> = data.as_slice().iter().map(|&s| s as f32).collect();
                let _ = tx.try_send(samples);
            },
            |err| eprintln!("Stream error: {}", err),
        )?;

        stream.play()?;

        Ok(Self { stream, tx })
    }
}
```

**Go Speech-to-Text Handler:**
```go
import (
    "context"
    openai "github.com/sashabaranov/go-openai"
)

func transcribeAudio(ctx context.Context, audioPath string) (string, error) {
    client := openai.NewClient(os.Getenv("OPENAI_API_KEY"))

    audioFile, _ := os.Open(audioPath)
    defer audioFile.Close()

    req := openai.AudioRequest{
        Model: openai.Whisper1,
        FilePath: audioPath,
    }

    resp, err := client.CreateTranscription(ctx, req)
    if err != nil {
        return "", err
    }

    // Emit text event to agents
    mb.PublishEvent("input.text", map[string]interface{}{
        "source": "voice",
        "text": resp.Text,
        "timestamp": time.Now(),
    })

    return resp.Text, nil
}
```

**Fallback (Vosk for offline):**
```toml
# Cargo.toml
vosk = "0.1"  # Local speech recognition
```

**Audio Setup:**
```bash
# Install cpal dependencies
# macOS
brew install portaudio

# Linux
apt-get install libportaudio2 portaudio19-dev

# Windows
# Comes with wasapi
```

---

## Part 7: Real-Time Collaboration (WebSocket)

### 7.1 WebSocket Server

**Purpose:** Multiple clients (browsers, remote agents) connect to single Tauri app. Share state, coordinate renders.

**Rust WebSocket Library:** tokio-tungstenite

**Architecture:**
```
Client A (Browser)  ───┐
Client B (Phone)    ───┤
Client C (Remote Sync) ┤
                       └─→ WebSocket Server (Rust/Tokio)
                           │
                           └─→ Message Bus (NATS/Broadcast)
                               └─→ State Sync + Render Updates
```

**Rust Implementation:**
```rust
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::accept_async;
use futures::{StreamExt, SinkExt};
use tokio::sync::broadcast;

pub struct CollaborativeServer {
    broadcast_tx: broadcast::Sender<String>,
}

impl CollaborativeServer {
    pub async fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        Self { broadcast_tx }
    }

    pub async fn start(&self, addr: &str) -> Result<()> {
        let listener = TcpListener::bind(addr).await?;
        println!("WebSocket server listening on {}", addr);

        while let Ok((stream, peer_addr)) = listener.accept().await {
            let tx = self.broadcast_tx.clone();
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(stream, tx).await {
                    eprintln!("Error handling {}: {}", peer_addr, e);
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(
        stream: TcpStream,
        broadcast_tx: broadcast::Sender<String>,
    ) -> Result<()> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let mut rx = broadcast_tx.subscribe();

        loop {
            tokio::select! {
                // Receive from WebSocket client
                Some(msg) = ws_receiver.next() => {
                    match msg? {
                        tokio_tungstenite::tungstenite::Message::Text(text) => {
                            // Broadcast to all other clients
                            let _ = broadcast_tx.send(text);
                        }
                        tokio_tungstenite::tungstenite::Message::Close(_) => {
                            break;
                        }
                        _ => {}
                    }
                }

                // Broadcast from other clients
                Ok(msg) = rx.recv() => {
                    ws_sender.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await?;
                }
            }
        }

        Ok(())
    }
}
```

**TypeScript Client:**
```typescript
class CollaborativeClient {
    ws: WebSocket;
    listeners: Map<string, Function[]> = new Map();

    constructor(url: string) {
        this.ws = new WebSocket(url);

        this.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const type = message.type;

            if (this.listeners.has(type)) {
                this.listeners.get(type)?.forEach(fn => fn(message));
            }
        });
    }

    send(message: any) {
        this.ws.send(JSON.stringify(message));
    }

    on(type: string, callback: Function) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type)?.push(callback);
    }
}

// Usage
const collab = new CollaborativeClient('ws://localhost:8080');

collab.on('render:update', (msg) => {
    // Another client triggered a render
    console.log('Render update:', msg);
    // Sync local state
});

collab.on('state:change', (msg) => {
    // Another client changed shared state
    updateLocalState(msg.state);
});
```

**Protocol (JSON over WebSocket):**
```json
{
    "type": "render:update",
    "client_id": "browser_001",
    "component_id": "list_123",
    "tree": {...},
    "timestamp": 1234567890
}
```

---

## Part 8: Project Structure and Directory Layout

### 8.1 Monorepo Structure

```
llm-native-os/
├── backend/                      # Rust backend (Tauri)
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs          # Tauri entry point
│   │   │   ├── compositor/      # Window rendering (wgpu)
│   │   │   │   ├── lib.rs
│   │   │   │   ├── renderer.rs  # WebGPU render pipeline
│   │   │   │   ├── layout.rs    # CSS-like layout engine
│   │   │   │   └── shader/
│   │   │   │       ├── main.wgsl
│   │   │   │       └── compute.wgsl
│   │   │   ├── memory/          # Memory management
│   │   │   │   ├── lib.rs
│   │   │   │   └── allocator.rs
│   │   │   ├── action_dispatch/ # Action routing
│   │   │   │   └── lib.rs
│   │   │   ├── ipc/             # Tauri IPC handlers
│   │   │   │   ├── lib.rs
│   │   │   │   ├── render.rs    # render() command
│   │   │   │   └── state.rs     # state_update() command
│   │   │   └── error.rs         # Error types
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json      # Tauri config
│   └── Cargo.lock
│
├── frontend/                     # TypeScript UI layer
│   ├── src/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── renderer/            # Custom React-like renderer
│   │   │   ├── vdom.ts          # Virtual DOM types
│   │   │   ├── render.ts        # Diffing + DOM updates
│   │   │   └── hydrate.ts       # Parse LLM JSON → VDOM
│   │   ├── state/               # Zustand store
│   │   │   ├── store.ts
│   │   │   └── actions.ts
│   │   ├── components/          # Built-in UI components
│   │   │   ├── Button.ts
│   │   │   ├── Input.ts
│   │   │   ├── List.ts
│   │   │   └── Container.ts
│   │   ├── gpu/                 # GPU communication
│   │   │   ├── compositor.ts    # Invoke Rust compositor
│   │   │   └── shaders.wgsl     # Shader sources
│   │   └── utils/
│   │       ├── tauri-bridge.ts  # Tauri IPC wrapper
│   │       └── performance.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
│
├── middleware/                   # Go services
│   ├── cmd/
│   │   ├── orchestrator/        # Agent orchestration server
│   │   │   └── main.go
│   │   ├── memory-service/      # Memory systems manager
│   │   │   └── main.go
│   │   └── llm-gateway/         # LLM API integration
│   │       └── main.go
│   ├── internal/
│   │   ├── agent/
│   │   │   ├── orchestrator.go
│   │   │   └── registry.go
│   │   ├── memory/
│   │   │   ├── semantic.go      # Neo4j wrapper
│   │   │   ├── working.go       # Valkey wrapper
│   │   │   ├── episodic.go      # TimescaleDB wrapper
│   │   │   └── procedural.go    # MongoDB wrapper
│   │   ├── llm/
│   │   │   ├── claude.go
│   │   │   ├── openai.go
│   │   │   └── prompt.go
│   │   └── protocol/
│   │       ├── messages.pb.go   # Generated from .proto
│   │       └── events.go
│   ├── api/
│   │   └── proto/
│   │       ├── agent.proto
│   │       ├── memory.proto
│   │       └── llm.proto
│   ├── go.mod
│   ├── go.sum
│   └── Makefile
│
├── docker-compose.yml           # All services (Tauri skipped, runs locally)
├── Makefile                     # Top-level build commands
├── README.md
└── docs/
    └── architecture.md
```

---

### 8.2 Build and Dependency Structure

**Tauri Build (Rust + TypeScript):**
```bash
# Automatic during cargo build
cargo build --release
# ^ Runs npm build in frontend/, bundles into Tauri app
```

**Go Module Dependencies:**
```go
module github.com/anthropic/llm-native-os

go 1.22

require (
    github.com/nats-io/nats.go v1.31.0
    github.com/neo4j/neo4j-go-driver/v5 v5.14.0
    google.golang.org/grpc v1.59.0
    google.golang.org/protobuf v1.31.0
    go.mongodb.org/mongo-driver v1.13.0
)
```

---

## Part 9: Build System Configuration

### 9.1 Cargo Configuration (Rust)

**Cargo.toml (src-tauri/):**
```toml
[package]
name = "llm-native-os"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["shell-open", "window-all", "path-all", "fs-all"] }
tauri-build = "2.0"
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
wgpu = { version = "0.19", features = ["webgpu"] }
winit = "0.29"
glam = "0.24"
parking_lot = "0.12"
crossbeam = "0.8"
ahash = "0.8"
bincode = "1.3"

[build-dependencies]
tauri-build = "2.0"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1

[profile.dev]
opt-level = 0
```

**build.rs (Tauri build script):**
```rust
// src-tauri/build.rs
fn main() {
    tauri_build::build();
}
```

---

### 9.2 Vite Configuration (TypeScript Frontend)

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
    plugins: [preact()],
    build: {
        outDir: '../backend/src-tauri/dist',
        minify: 'terser',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    renderer: ['./src/renderer/render.ts'],
                    store: ['./src/state/store.ts'],
                }
            }
        }
    },
    server: {
        port: 5173,
    }
});
```

**tsconfig.json:**
```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "lib": ["ES2020", "DOM", "DOM.Iterable"],
        "jsx": "react-jsx",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "moduleResolution": "node",
        "resolveJsonModule": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist"]
}
```

---

### 9.3 Go Build Configuration

**Makefile:**
```makefile
.PHONY: build test run clean

# Build all services
build:
	cd middleware && go build -o bin/orchestrator ./cmd/orchestrator
	cd middleware && go build -o bin/memory-service ./cmd/memory-service
	cd middleware && go build -o bin/llm-gateway ./cmd/llm-gateway

# Test
test:
	cd middleware && go test -v ./...

# Run locally (requires services running: nats, neo4j, valkey, timescaledb, mongodb)
run:
	docker-compose up -d
	sleep 5
	cd middleware && go run ./cmd/orchestrator &
	cd middleware && go run ./cmd/memory-service &
	cd middleware && go run ./cmd/llm-gateway &
	cd backend && npm run dev

# Clean
clean:
	rm -rf middleware/bin
	cd backend && cargo clean
	cd frontend && rm -rf dist node_modules
```

---

### 9.4 Docker Compose (Local Development)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  # Message bus
  nats:
    image: nats:2.10
    ports:
      - "4222:4222"
    command: -js
    healthcheck:
      test: ["CMD", "nats", "server", "info"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Semantic memory
  neo4j:
    image: neo4j:5.14
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: none
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "neo4j", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Working memory
  valkey:
    image: valkey/valkey:7.2
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "PING"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Episodic memory
  timescaledb:
    image: timescale/timescaledb:latest-pg15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: postgres
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Procedural memory
  mongodb:
    image: mongo:7.0
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  default:
    name: llm-os-net
```

---

## Part 10: Development Environment Setup

### 10.1 Prerequisites

```bash
# Rust (latest stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
rustup update

# Node.js 20+ (for TypeScript frontend)
curl https://fnm.io/install | bash
fnm use 20

# Go 1.22+
wget https://go.dev/dl/go1.22.linux-amd64.tar.gz
tar -xzf go1.22.linux-amd64.tar.gz -C /usr/local

# Docker + Docker Compose
sudo apt-get install docker.io docker-compose

# Protobuf compiler (for gRPC)
sudo apt-get install protobuf-compiler
```

### 10.2 Local Setup Script

**setup.sh:**
```bash
#!/bin/bash

set -e

echo "=== LLM Native OS Development Setup ==="

# Clone repo (or start with existing)
# git clone https://github.com/anthropic/llm-native-os

cd "$(dirname "$0")"

# Install Rust dependencies
echo "Setting up Rust..."
rustup update

# Install Node dependencies (frontend)
echo "Setting up frontend..."
cd frontend
npm install
cd ..

# Install Go dependencies (middleware)
echo "Setting up middleware..."
cd middleware
go mod download
cd ..

# Start Docker services
echo "Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 10

# Run migrations / initialization
echo "Initializing databases..."
# TimescaleDB schema
docker-compose exec -T timescaledb psql -U postgres -f /dev/stdin << 'SQL'
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE TABLE IF NOT EXISTS events (
    time TIMESTAMPTZ NOT NULL,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    component_id TEXT,
    action TEXT,
    metadata JSONB,
    duration_ms INT
);
SELECT create_hypertable('events', 'time', if_not_exists => TRUE);
SQL

# Neo4j schema (basic init)
docker-compose exec -T neo4j cypher-shell -u neo4j -p neo4j "RETURN 1"

echo "✓ Setup complete!"
echo "Run: make run"
```

---

## Part 11: CI/CD Pipeline

### 11.1 GitHub Actions Workflow

**.github/workflows/build-test-deploy.yml:**
```yaml
name: Build, Test, Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cd backend && cargo test --all
      - run: cd backend && cargo clippy -- -D warnings

  test-go:
    runs-on: ubuntu-latest
    services:
      nats:
        image: nats:2.10
        options: --health-cmd "nats server info" --health-interval 10s --health-timeout 5s --health-retries 5
      neo4j:
        image: neo4j:5.14
        env:
          NEO4J_AUTH: none
        options: --health-cmd "cypher-shell RETURN 1" --health-interval 10s
      valkey:
        image: valkey/valkey:7.2
        options: --health-cmd "redis-cli PING" --health-interval 10s
      postgres:
        image: timescale/timescaledb:latest-pg15
        env:
          POSTGRES_PASSWORD: postgres
        options: --health-cmd "pg_isready -U postgres"
      mongodb:
        image: mongo:7.0
        options: --health-cmd "mongosh --eval db.adminCommand('ping')"
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.22'
      - run: cd middleware && go test -v ./...

  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm install
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run type-check
      - run: cd frontend && npm run test

  build-app:
    needs: [test-rust, test-go, test-typescript]
    runs-on: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd backend && cargo build --release
      - uses: actions/upload-artifact@v3
        with:
          name: llm-native-os-${{ runner.os }}
          path: backend/src-tauri/target/release/llm-native-os
```

---

## Part 12: How All Pieces Connect

### 12.1 Data Flow Diagram

```
User Input (Mouse/Keyboard/Voice)
    ↓
Tauri Event Handler (Rust/winit)
    ↓
Action Dispatch → message: InputEvent
    ↓ Publish to NATS
┌─────────────────────────────────────────────────┐
│ Agent A: Input Handler                          │
│ - Subscribes to "input.*"                       │
│ - Parses input, creates command                 │
│ - Publishes: CommandEvent → NATS                │
└─────────────────────────────────────────────────┘
    ↓ Publish to NATS
┌─────────────────────────────────────────────────┐
│ Agent B: LLM Gateway (Go)                       │
│ - Subscribes to "command.*"                     │
│ - Calls Claude API with context from memory    │
│ - Receives component tree (JSON)                │
│ - Publishes: RenderEvent → NATS                 │
└─────────────────────────────────────────────────┘
    ↓ Publish to NATS
┌─────────────────────────────────────────────────┐
│ Memory Service (Go)                             │
│ - Log to episodic (TimescaleDB)                 │
│ - Update working memory (Valkey)                │
│ - Query semantic memory (Neo4j)                 │
│ - Store patterns (MongoDB)                      │
└─────────────────────────────────────────────────┘
    ↓ Publish to NATS
┌─────────────────────────────────────────────────┐
│ Tauri Frontend (TypeScript)                     │
│ - Listen to RenderEvent via Tauri IPC          │
│ - Parse component tree JSON                     │
│ - Custom renderer diffs against current VDOM    │
│ - DOM updates                                   │
│ - Signals GPU compositor (Rust)                 │
└─────────────────────────────────────────────────┘
    ↓ WebGPU
┌─────────────────────────────────────────────────┐
│ Rust GPU Compositor (wgpu)                      │
│ - Receive layout from layout engine             │
│ - Render to framebuffer (compute shaders)       │
│ - Display on screen (60+ FPS)                   │
└─────────────────────────────────────────────────┘
```

### 12.2 Communication Paths

**Synchronous RPC (when immediate response needed):**
```
Tauri Frontend
    ↓ Invoke Tauri command
Tauri Backend (Rust)
    ↓ gRPC call
Go Middleware
    ↓ return result
```

**Asynchronous Pub/Sub (default for agents):**
```
Agent A (publishes)
    ↓ NATS subject
Message Bus
    ├→ Agent B (subscribes)
    ├→ Agent C (subscribes)
    └→ Agent D (subscribes)
```

---

## Part 13: Version Pinning and Compatibility

### 13.1 Locked Versions (Production)

```toml
# Rust (Cargo.lock maintained by cargo)
tauri = "2.0.0"
wgpu = "0.19.0"
tokio = "1.35.0"

# Go (go.mod)
google.golang.org/grpc v1.59.0
google.golang.org/protobuf v1.31.0

# TypeScript (package-lock.json)
"typescript": "5.3.3"
"preact": "10.18.1"
"zustand": "4.4.1"
"vite": "5.0.0"

# Services (Docker)
nats:2.10
neo4j:5.14
valkey:7.2
timescaledb:2.13-pg15
mongodb:7.0
```

### 13.2 Compatibility Matrix

| Component | Min Version | Recommended | Max Version | Notes |
|-----------|------------|------------|------------|-------|
| Rust | 1.70 | 1.75+ | N/A | Edition 2021+ |
| Go | 1.20 | 1.22+ | N/A | Generics, ranges |
| Node | 18 | 20+ | N/A | ES modules |
| Tauri | 2.0 | 2.0+ | N/A | v1 deprecated |
| wgpu | 0.18 | 0.19 | N/A | Breaking changes frequent |
| Neo4j | 5.0 | 5.14 | N/A | Community edition fine |
| PostgreSQL | 14 | 15+ | N/A | TimescaleDB requires 14+ |

---

## Part 14: Performance Targets and Benchmarks

### 14.1 Required Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Component render latency | <16ms | Time from LLM response to GPU |
| Input to response latency | <100ms | Keyboard input to on-screen change |
| Memory footprint | <500MB | Resident set size (RSS) |
| Agent message latency | <5ms | NATS pub → sub delivery |
| GPU frame rate | 60+ FPS | Sustained, no drops |
| LLM API call | <1s average | Including network |

### 14.2 Profiling Tools

**Rust:**
```bash
# Profile with Flamegraph
cargo install flamegraph
cargo flamegraph --bin llm-native-os -- --profile

# Memory profiling
cargo build --release && valgrind --tool=massif ./target/release/llm-native-os
```

**Go:**
```bash
# CPU profiling
go test -cpuprofile=cpu.prof -memprofile=mem.prof ./...
go tool pprof cpu.prof

# Memory leaks
go test -memprofile=mem.prof -run TestAgentLoop
go tool pprof -alloc_space mem.prof
```

**TypeScript:**
```bash
# DevTools profiling
npm run build -- --sourcemap
# Open DevTools → Performance tab
```

---

## Part 15: Deployment and Distribution

### 15.1 Prototype Distribution (Tauri)

```bash
# Build release bundles
cargo build --release

# Output:
# macOS: target/release/bundle/macos/LLM\ Native\ OS.app
# Windows: target/release/bundle/msi/LLM_Native_OS_*.msi
# Linux: target/release/bundle/deb/llm-native-os_*.deb
```

### 15.2 Production OS Distribution (Future)

Once hardened into true OS:
- **Bootable ISO:** Extract Rust kernel + compositor, bundle with minimal init
- **Container image:** LLM Native OS as OCI container (for cloud)
- **Embedded:** Compile for ARM (Raspberry Pi, mobile)

---

## Part 16: Security Considerations

### 16.1 Memory Safety

- **Rust:** Eliminates entire classes of bugs (buffer overflows, UAF)
- **Go:** GC prevents memory leaks; bounds checking on arrays
- **TypeScript:** Runtime bounds checking; type safety

### 16.2 API Authentication

```go
// Middleware: validate API keys for all LLM calls
func validateAPIKey(key string) bool {
    // Check against environment variable, HashiCorp Vault, or encrypted store
    return key == os.Getenv("OPENAI_API_KEY") || key == os.Getenv("ANTHROPIC_API_KEY")
}
```

### 16.3 Secure Message Passing

- **NATS:** Supports mTLS, per-subject authorization rules
- **gRPC:** Enable TLS; use client certificates for inter-service auth
- **WebSocket:** Use WSS (TLS) in production

---

## Part 17: Documentation and Reference

### 17.1 Key Documentation Files

- **Architecture:** `/docs/architecture.md` (overview of all systems)
- **API Contract:** `/middleware/api/proto/` (Protobuf definitions = source of truth)
- **Component Library:** `/frontend/src/components/README.md` (built-in UI components)
- **Memory Systems:** `/docs/memory-systems.md` (detailed memory access patterns)
- **Shader Handbook:** `/backend/src-tauri/src/compositor/shader/README.md` (GPU pipeline)

### 17.2 API Documentation Generation

```bash
# Protobuf → OpenAPI
protoc --openapiv3_out=. middleware/api/proto/*.proto

# TypeScript → TypeDoc
cd frontend && npx typedoc --out ../docs/typescript src/

# Go → GoDoc
cd middleware && go generate ./...
```

---

## Summary: What Claude Code Must Know

**When implementing this stack, Claude Code must:**

1. **Use Rust** for: compositor, rendering engine, action dispatch, GPU communication
2. **Use Go** for: agent orchestration, LLM integration, higher-level business logic
3. **Use TypeScript** for: UI layer, component trees, dynamic hydration
4. **Use Tauri** for: prototype shell (Rust backend + web frontend)
5. **Use WebGPU** for: GPU-accelerated rendering (wgpu crate)
6. **Use custom renderer** (not React): lightweight diffing for LLM-generated components
7. **Use Neo4j** for: semantic memory (relationships, ontologies)
8. **Use Valkey** for: working memory (fast KV, in-memory state)
9. **Use TimescaleDB** for: episodic memory (event timeline, query by time)
10. **Use MongoDB** for: procedural memory (prompts, patterns, templates)
11. **Use NATS** for: inter-agent communication (pub/sub message bus)
12. **Use gRPC** for: synchronous service calls (Go services)
13. **Use WebSocket** for: real-time collaboration (browser clients)
14. **Use Cpal + Whisper** for: voice input transcription
15. **Follow directory structure** in Section 8.1 exactly
16. **Use build system** (Makefile + Docker Compose) for reproducible development
17. **Target performance metrics** in Section 14.1
18. **Run CI/CD** workflow on every commit (test Rust, Go, TS separately)

**This is THE reference. All technology decisions are locked in.**

---

**Document Status:** Complete and Production-Ready | Last Updated: 2026-03-23
