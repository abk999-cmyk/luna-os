# Luna OS Spec Compliance Report: Phases 1-4

## 1. Features Completely Missing

### Phase 1 Missing

**1a. Core OS Action Types from Spec 09 not registered:**

The spec (Document 09, lines 164-189) defines core Tier 1 actions including
`window.stack`, `window.maximize`, `workspace.switch`, `workspace.create`,
`agent.spawn`, `agent.kill`, `agent.signal`, `fs.read`, `fs.write`,
`fs.delete`, `fs.move`, `fs.mkdir`, `config.set`, `config.get`.

None of these are registered in the `ActionTypeRegistry` at
`/Users/abhinav/Desktop/OS/luna/src-tauri/src/action/registry.rs`. The
implementation (line 114-244) only registers window CRUD, agent
response/delegate, memory store/retrieve, system notify, and app actions.
File system, workspace, agent lifecycle, and config actions are entirely
absent.

**1b. Workspace concept not implemented:**

The spec (Document 06, section 2.2) describes workspaces as distinct domain
contexts. There is no workspace management or workspace switching in the
implementation. The orchestrator hardcodes `"workspace_default"`
(`conductor.rs` line 66), but there is no ability to create, switch, or
manage multiple workspaces.

### Phase 2 Missing

**2a. Procedural Memory (Spec 08, section 1.3):**

The spec defines `WorkflowPattern` and `WorkflowStep` data models for
procedural memory (learned workflows). This entire memory layer is missing.
There is no `procedural.rs` file and no corresponding DB table. The spec's
four-layer memory (episodic, semantic, procedural, working) is only three
layers in the implementation.

**2b. Episodic-to-Semantic sync (Spec 08, lines 308-311):**

The spec mandates automatic triggers where episodic events that have
`user_model_updates` or `semantic_refs` create/update semantic graph nodes.
This is not implemented. The episodic and semantic memories are entirely
decoupled.

**2c. Semantic Memory as a Knowledge Graph (Spec 08, section 1.2):**

The spec describes semantic memory as a property graph with `Node` and `Edge`
types, relationship types, confidence scores, neighbor queries, graph
traversal, shortest path, and connected component algorithms.

The implementation at
`/Users/abhinav/Desktop/OS/luna/src-tauri/src/memory/semantic.rs` is a flat
key-value store (lines 17-41). There are no nodes, edges, relationships,
graph traversal, or any graph structure.

**2d. Episodic Memory data model gaps (Spec 08, section 1.1):**

The spec defines `EpisodeEntry` with fields: `category` (enum), `actor`,
`related_objects` (`file_paths`, `project_ids`, `semantic_refs`), `outcome`
(`success`, `result_summary`, `errors`, `metrics`), `parent_episode`,
`duration_ms`, `cost_tokens`.

The implementation's `episodic_memory` DB table (`db.rs` lines 81-92) only
stores `id, session_id, agent_id, timestamp, action_type, payload, result,
context_tags`. Missing: `category`, `related_objects`, `parent_episode`,
`duration_ms`, `cost_tokens`, and `outcome` structure.

**2e. Episodic query interface (Spec 08, lines 89-96):**

The spec requires:

- `GetEpisodesByTimeRange`
- `GetEpisodesByActor`
- `GetEpisodesByTag`
- `GetEpisodeSequence`
- `SearchEpisodes` (full-text)
- `GetRecentOutcomes`

The implementation only has `query_session` (by `session_id`) and `purge_old`.
The by-actor, by-tag, full-text search, and episode-sequence queries are all
missing.

### Phase 3 Missing

**3a. Action Promotion Mechanism (Spec 09, lines 347-372):**

The spec defines that LLM-created actions used >= `promotionThreshold` times
should trigger an `action.promotion_candidate` event, and an `action.promote`
action should move them to the persistent user library.

The registry tracks `usage_count` (`registry.rs` line 44) but never checks for
promotion threshold or emits promotion events.

**3b. Capability Manifest in Working Memory (Spec 09, section 3.1):**

The spec says the live capability manifest must always exist in working memory
(Layer 2) and be updated within <10ms of any change. There is no capability
manifest object in working memory. The action space prompt is generated
on-demand (`registry.rs` line 325) rather than being maintained as a
persistent working-memory entry.

### Phase 4 Missing

**4a. Spatial Reference Map (Roadmap section 4.4):**

The spec calls for a panel showing spatial layout of all windows as
interactive rectangles. No spatial map component exists in the frontend. The
grep search for `"spatial"` returned no matches.

**4b. Battery/resource-aware ambient mode (Roadmap section 4.2):**

The spec says ambient voice should "disable on low battery" and target
"<5% CPU, <50MB RAM increase". The ambient voice implementation
(`useAmbientVoice.ts`) has no battery detection or resource monitoring.

---

## 2. Features Partially Implemented (Stubs/Placeholders)

**2a. Leaf Agents are entirely stubbed:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/agent/leaf.rs`:
`StubLeafAgent` (line 22) returns hardcoded success with a note:
`"stub leaf agent -- Phase 4 will implement real capabilities"` (line 66).

The spec (Document 06, section 2.3) requires specialized leaf agents
(editor, terminal, file, search agents). None exist.

**2b. Orchestrator task decomposition is stubbed:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/agent/orchestrator.rs` lines
88-90: `decompose_task_stub` does not call the LLM. It directly routes to the
stub leaf agent. The comment on line 82 says "In Phase 4, this will call the
LLM with the orchestrator system prompt". The `ORCHESTRATOR_SYSTEM_PROMPT`
(line 14) exists but is `#[allow(dead_code)]`, so it is unused.

**2c. Conductor delegation logic is simplistic:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/agent/conductor.rs` lines
327-332: `should_delegate` uses keyword matching against a hardcoded list:

- `"and then"`
- `"after that"`
- `"first"`
- ...

The spec (Document 06) envisions intelligent task decomposition and strategic
routing based on user model and context.

**2d. Permission persistence is incomplete:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/security/permissions.rs` lines
91-93: the `grant` method with `permanent: bool` has a comment saying
"actual persistence handled at higher level via commands.rs" but only logs.

Permissions are not truly persisted to the `agent_state` table on restart.
The `serialize_grants` and `load_from_agent_state` methods exist but are not
wired to session lifecycle.

**2e. Semantic memory search is rudimentary:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/persistence/db.rs` lines
312-322: `semantic_search_by_tag` uses `LIKE %tag%` on a JSON string column.
This is a text substring match, not structured tag querying. It will produce
false positives. For example, searching for `"auth"` would match
`"authentication"` inside JSON.

---

## 3. Implementation Contradicts Spec

**3a. Tech stack divergence:**

The spec (Document 05, section 2.2) prescribes Go for agent orchestration,
model integration, and middleware. The entire implementation is in Rust
(backend) and TypeScript/React (frontend). There is no Go code.

This is a significant architectural deviation. The spec chose Go specifically
for goroutine-based lightweight concurrency for agents.

**3b. Action dispatch uses `Mutex<Option<Database>>` blocking in async context:**

`/Users/abhinav/Desktop/OS/luna/src-tauri/src/action/dispatcher.rs` line 137:
`self.db.lock().unwrap()` is a blocking `std::sync::Mutex` lock called inside
an async function.

The spec (Document 05, line 106) says:
"Action dispatch loop: single-threaded, lock-free event queue, <100us per
dispatch cycle."

The current implementation uses `tokio::sync::RwLock` for the registry
(async, correct) but `std::sync::Mutex` for the database (blocking, incorrect
for async). This can block the Tokio runtime.

**3c. Action struct misses spec fields:**

The spec (Document 09, section 1.2) requires actions to have:

- `tier`
- `preconditions`
- `postconditions`
- `sideEffects`
- `latencyBudget`
- `returns` schema
- `examples`
- `deprecated`
- `replacedBy`

The `ActionTypeDefinition` in `registry.rs` only has:

- `action_type`
- `tier`
- `description`
- `fields`
- `app_id`
- `usage_count`

Missing: `preconditions`, `postconditions`, `sideEffects`, `latencyBudget`,
`returns` schema, `examples`, and deprecation metadata.

**3d. Action dispatch is synchronous per-step, not pipelined:**

The spec (Document 05, line 30) mandates Action Dispatch < 5ms. The current
dispatch flow in `dispatcher.rs` (lines 51-163) does the following:

1. Permission check (async RwLock read)
2. Registry validation (async RwLock read)
3. Payload validation
4. Status update
5. History push (async RwLock write)
6. DB persist (blocking Mutex)
7. Enqueue
8. Usage increment (async RwLock write)

This is 8 sequential steps including a blocking database write. The DB write
alone likely exceeds 5ms.

**3e. Semantic memory contradicts graph database requirement:**

The spec (Document 08, lines 265-267) explicitly recommends "Neo4j,
TigerGraph, or Apache JanusGraph" for the semantic knowledge graph.

The implementation uses a flat key-value table in SQLite. The spec says this
is acceptable as a "stub" for Phase 2 (roadmap line 231: "Simple vector DB
stub (for Phase 5 upgrade)"), but calls it a key-value-store placeholder.
However, by Phase 4 the semantic layer should have graph query capabilities,
which are entirely absent.

**3f. Scratchpad `write` signature differs from spec:**

The spec (roadmap line 305) defines scratchpad as:
`{workspace_id: {task_id: {step, result, timestamp}}}`.

Implementation in `scratchpad.rs` uses
`write(workspace_id, task_id, agent_id, step, content, app_handle)` with a
`Vec<ScratchpadEntry>` per workspace rather than nested maps. This means
querying by `task_id` requires scanning the entire workspace vector.

**3g. Working memory <1ms read budget likely violated:**

The spec (Document 05, line 49) requires Working Memory Read < 1ms.
Implementation at `working.rs` lines 89-91 uses `tokio::sync::RwLock`, which
involves async scheduling overhead. For a simple read, the RwLock
acquire-read-release cycle in Tokio may intermittently exceed 1ms under
contention.

---

## 4. Performance Targets the Architecture Cannot Meet

**4a. Action Dispatch < 5ms (Spec 05, line 30):**

The dispatcher performs a synchronous SQLite write on every dispatch
(`dispatcher.rs` lines 136-144). SQLite WAL writes typically take 1-10ms.
Combined with two async RwLock acquisitions and the enqueue, the 5ms budget
is likely violated on the majority of dispatches. The spec mandates
"no blocking I/O at this level."

**4b. Working Memory Write < 2ms (Spec 05, line 50):**

Working memory writes (`working.rs` lines 66-76) acquire a Tokio `RwLock`
write lock, which may queue behind concurrent reads. Under contention
(multiple agents pushing actions simultaneously), the write-lock acquisition
alone could exceed 2ms.

**4c. Agent Spawn < 20ms (Spec 05, line 57):**

There is no real agent spawning. The orchestrator is pre-created, and leaf
agents are pre-instantiated stubs. When real agents are added, spawning an
agent will require context allocation, memory initialization, LLM state setup,
and registry insertion. There is no architecture to achieve this in 20ms.

**4d. Agent Response Completion < 1s (Spec 05, line 69):**

The conductor calls the Anthropic API with `max_tokens: 4096`
(`conductor.rs` line 113). A full 4096-token response from Claude typically
takes 5-15 seconds. Even with streaming (first token < 100ms target), total
completion far exceeds 1 second.

**4e. Dynamic App Initial Render < 33ms (Spec 05, line 40):**

The spec says two-frame budget (33.34ms). The dynamic app render path is:

- Tauri IPC event
- React state update
- `DynamicRenderer` recursion
- `ComponentNode` resolution per component
- data binding resolution
- event handler creation

For a 50-component app (spec success criteria, roadmap line 514), this chain
of React reconciliation and DOM updates will likely exceed 33ms.

**4f. Capability Manifest Update Propagation < 10ms (Spec 05, line 33):**

There is no capability manifest propagation mechanism. When actions are
registered/deregistered, there is no broadcast to agents. The registry is
read on-demand when building the system prompt, so agents may operate with
stale capability information.

**4g. Cross-Workspace Communication < 25ms (Spec 05, line 60):**

Workspaces do not exist in the implementation, so cross-workspace messaging is
impossible. Even the single-workspace `MessageBus` uses `tokio::mpsc`
channels, which add scheduling overhead on top of any serialization.

**4h. Episodic query 1000 events < 50ms (Roadmap line 247):**

The `episodic_query_session` in `db.rs` uses a blocking `std::sync::Mutex` to
access SQLite. Under concurrent access (multiple agents recording events), the
mutex contention alone could push queries well past 50ms. Additionally, the
query returns fully deserialized `serde_json::Value` objects, adding
serialization overhead.
