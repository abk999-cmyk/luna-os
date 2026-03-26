# Sprint 4: Interaction Richness

**Project:** Luna — LLM-Native Operating System
**Duration:** Phase 4 (Weeks 16–20)
**Status:** Planned
**Date:** 2026-03-25
**Builds On:** Sprint 3 (Dynamic UI & Rendering)

---

## Objective

Transform Luna from type-and-wait into a responsive, multi-modal environment. Sprint 4 adds streaming LLM responses (token-by-token delivery), voice input (push-to-talk and ambient), drag-and-drop context injection, and a visual task graph. Before building new features, all 16 Sprint 3 bugs are fixed.

---

## Sprint 3 Bugs Fixed (Phase 4.0)

### Backend (7 bugs)

| # | Severity | Bug | File | Fix |
|---|----------|-----|------|-----|
| 1 | CRITICAL | PendingApproval has no approval mechanism — agent actions rejected permanently | `action/dispatcher.rs` | Add `pending_actions` map, park action, emit `permission-request` event, add `approve_pending_action` / `deny_pending_action` commands |
| 2 | HIGH | Duplicate app_id silently overwrites | `app/lifecycle.rs` | Check `contains_key` before insert |
| 3 | HIGH | Invalid JSON in dispatch_app_event silently becomes `{}` | `app/commands.rs` | Return error instead of `unwrap_or_default()` |
| 4 | MEDIUM | `usage_count` never incremented (dead code) | `action/dispatcher.rs` | Call `increment_usage` after successful enqueue |
| 5 | MEDIUM | Silent event drop when no controlling agent | `action/handler_registry.rs` | Add `warn!` in else branch |
| 6 | MEDIUM | Batcher flush loop has no shutdown mechanism | `sync/batcher.rs` | Add `AtomicBool` shutdown flag |
| 7 | LOW | Silent emit failures in core handlers | `action/handler_registry.rs` | Log at debug level on failure |

### Frontend (9 bugs)

| # | Severity | Bug | File | Fix |
|---|----------|-----|------|-----|
| 8 | CRITICAL | DynamicRenderer children never rendered — passes raw spec array instead of rendered elements | `renderer/DynamicRenderer.tsx` | Pass rendered children as React children |
| 9 | CRITICAL | useMagneticDrag null pointer — `getWindowGroup` returns null, `.has()` called on null | `hooks/useMagneticDrag.ts` | Use optional chaining `currentGroup?.has(...)` |
| 10 | CRITICAL | useMagneticDrag detach logic inverted — unreachable condition | `hooks/useMagneticDrag.ts` | Check if not snapped AND previously grouped → detach |
| 11 | CRITICAL | Duplicate window creation — backend + frontend both create WindowState | `App.tsx` | Check window existence before `addWindowLocal` |
| 12 | HIGH | DataTable sort event reports old direction | `primitives/DataTable.tsx` | Compute new direction first, report that |
| 13 | HIGH | useSubscription re-subscribes every render | `sync/useSubscription.ts` | Remove `stableCallback` from deps |
| 14 | MEDIUM | Nested bindings in arrays not resolved | `renderer/dataBinding.ts` | Recurse into objects within arrays |
| 15 | LOW | Chat.tsx wrong CSS import path | `primitives/Chat.tsx` | Fix import |
| 16 | LOW | Modal.tsx stale closure in useEffect | `primitives/Modal.tsx` | Use ref for `onEvent`, remove from deps |

---

## Phase 4.1: Streaming LLM Responses (Days 4–7)

Replace blocking request-response with SSE streaming. Foundation for voice and task graph features.

### New files

| File | Purpose |
|------|---------|
| `src-tauri/src/agent/llm_stream.rs` | SSE streaming client for Anthropic + OpenAI (token-by-token channel) |
| `src-tauri/src/agent/stream_parser.rs` | Incremental JSON action parser (bracket depth tracking, detects complete actions mid-stream) |
| `src/components/StreamingResponse.tsx` | Token-by-token response display with blinking cursor |

### Key types (llm_stream.rs)

```rust
pub enum StreamEvent {
    Token(String),
    ActionComplete(Action),
    Usage { input: u32, output: u32 },
    Done,
    Error(String),
}
pub type StreamReceiver = tokio::sync::mpsc::Receiver<StreamEvent>;
```

### Modified files

| File | Changes |
|------|---------|
| `src-tauri/src/agent/llm_client.rs` | Add `send_streaming()` returning `StreamReceiver` |
| `src-tauri/src/agent/conductor.rs` | Add `handle_user_input_streaming()` — reads stream, emits `agent-stream-token` events, dispatches actions mid-stream |
| `src-tauri/src/commands.rs` | Add `send_message_streaming` command |
| `src-tauri/src/lib.rs` | Register new command |
| `src/App.tsx` | Listen for `agent-stream-token` / `agent-stream-done`, create streaming window |
| `src/components/TextInputBar.tsx` | Switch to streaming send |
| `src/stores/agentStore.ts` | Add `'streaming'` status |
| `src/ipc/agent.ts` | Add `sendMessageStreaming()` |

### New Cargo dependencies

- `tokio-stream = "0.1"` — SSE stream processing
- `base64 = "0.22"` — Audio encoding for Phase 4.2

---

## Phase 4.2: Voice Input — Push to Talk (Days 8–9)

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useVoiceInput.ts` | Mic capture, transcription (Web Speech API primary, Whisper fallback) |
| `src/components/VoiceWaveform.tsx` | Animated waveform during recording |
| `src/styles/voice.css` | Voice mode styles |
| `src-tauri/src/agent/transcription.rs` | Whisper API integration (POST audio → text) |

### Modified files

| File | Changes |
|------|---------|
| `src/components/TextInputBar.tsx` | Mic icon button, voice mode UI (waveform + live transcript), 2s silence → auto-submit |
| `src-tauri/src/commands.rs` | Add `transcribe_audio` command |

### Transcription strategy

1. **Web Speech API** (`SpeechRecognition`) — browser-native, zero-latency, preferred
2. **Whisper API fallback** — for webviews that lack SpeechRecognition

---

## Phase 4.3: Ambient Voice Mode (Days 10–11)

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useAmbientVoice.ts` | Continuous listening with volume-based VAD, state machine (idle → listening → speech → transcribing → idle) |
| `src/components/AmbientBadge.tsx` | Floating transcript badge (bottom-right), tap to submit, auto-dismiss after 10s silence |
| `src/styles/ambient.css` | Badge styles, animations |

### Modified files

| File | Changes |
|------|---------|
| `src/components/TextInputBar.tsx` | Ambient toggle icon, indicator dot |
| `src/App.tsx` | Render `<AmbientBadge />` when active |

### Simplifications (vs full spec)

- Volume-threshold VAD instead of ML-based (Silero WASM deferred to Sprint 5)
- Battery awareness via `navigator.getBattery()` only if available

---

## Phase 4.4: Drop-as-Context (Days 12–13)

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useDropContext.ts` | Drag/drop event listeners, FileReader, type detection |
| `src/services/contextParser.ts` | Parse text/JSON/CSV/image files, generate context summaries |
| `src/styles/drop-zone.css` | Drop zone highlight and overlay |

### Modified files

| File | Changes |
|------|---------|
| `src/components/Window.tsx` | Drop zone listeners, visual highlight overlay |
| `src-tauri/src/commands.rs` | Add `inject_context` command (stores in episodic + semantic + working memory) |
| `src-tauri/src/agent/conductor.rs` | Add `context_injections: Vec<String>`, append to system prompt |

### File type support

| Type | Parsing | Summary |
|------|---------|---------|
| `.txt`, `.md` | Read as text | First 200 chars, line count |
| `.json` | Parse structure | Top-level keys, item count |
| `.csv`, `.tsv` | Parse headers + rows | Column names, row count |
| Images | Read as base64 | Dimensions, file size (vision analysis deferred to Sprint 5) |

---

## Phase 4.5: Task Graph Panel (Days 14–15)

### New files

| File | Purpose |
|------|---------|
| `src-tauri/src/agent/task_graph.rs` | `TaskGraph` with `TaskNode` (id, parent_id, label, status, agent_id), methods: add/update/complete/fail/get_tree |
| `src/components/TaskGraphPanel.tsx` | Visual tree with color-coded status icons, click-to-expand details, real-time updates via `useSubscription("task.*")` |
| `src/stores/taskStore.ts` | Zustand store for task nodes |
| `src/styles/task-graph.css` | Tree layout, status colors |
| `src/ipc/tasks.ts` | `getTaskGraph()` IPC wrapper |

### Key types (task_graph.rs)

```rust
pub struct TaskNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub label: String,
    pub status: TaskStatus, // Pending, Running, Completed, Failed
    pub agent_id: String,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}
```

### Modified files

| File | Changes |
|------|---------|
| `src-tauri/src/state.rs` | Add `task_graph: Arc<TaskGraph>` |
| `src-tauri/src/lib.rs` | Create + wire TaskGraph |
| `src-tauri/src/commands.rs` | Add `get_task_graph` command |
| `src-tauri/src/agent/orchestrator.rs` | Task graph integration (add/update/complete tasks during decomposition) |
| `src-tauri/src/agent/conductor.rs` | Create root task node on user input |
| `src/components/Desktop.tsx` | Toggle button for TaskGraphPanel sidebar |

---

## Deferred to Sprint 5

| Feature | Reason |
|---------|--------|
| Spatial Reference Map (minimap) | Lower priority than streaming/voice |
| Layout templates (named group presets) | Needs more mature magnetic layout |
| Canvas freeform drawing primitive | Low priority for interaction richness |
| Full PDF parsing in drop-as-context | Needs Rust PDF library |
| ML-based VAD (Silero WASM) | Volume-threshold sufficient for now |
| Vision analysis for dropped images | Needs Claude Vision API integration |

---

## New Files Summary (18)

**Backend (4):** `llm_stream.rs`, `stream_parser.rs`, `transcription.rs`, `task_graph.rs`
**Frontend (14):** `StreamingResponse.tsx`, `VoiceWaveform.tsx`, `AmbientBadge.tsx`, `TaskGraphPanel.tsx`, `useVoiceInput.ts`, `useAmbientVoice.ts`, `useDropContext.ts`, `contextParser.ts`, `taskStore.ts`, `tasks.ts` (ipc), `voice.css`, `ambient.css`, `drop-zone.css`, `task-graph.css`

## Key Modified Files

| File | Phases touched |
|------|---------------|
| `src-tauri/src/agent/conductor.rs` | 4.0, 4.1, 4.4, 4.5 |
| `src-tauri/src/commands.rs` | 4.0–4.5 (6 new commands) |
| `src-tauri/src/lib.rs` | 4.0–4.5 |
| `src/components/TextInputBar.tsx` | 4.1, 4.2, 4.3 |
| `src/App.tsx` | 4.0, 4.1, 4.3 |
| `src-tauri/src/action/dispatcher.rs` | 4.0 (pending actions, usage_count) |

---

## New Dependencies

- **Cargo.toml:** `tokio-stream = "0.1"`, `base64 = "0.22"`
- **package.json:** None (Web Audio API, SpeechRecognition, FileReader, drag-and-drop all browser-native)
