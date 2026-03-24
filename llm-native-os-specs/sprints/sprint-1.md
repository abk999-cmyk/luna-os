# Sprint 1: Foundation

**Project:** Luna — LLM-Native Operating System
**Duration:** Phase 1 (Weeks 1-4)
**Status:** Implementation Complete
**Date:** 2026-03-23

---

## Objective

Bootstrap a functional Tauri application with basic window management, action dispatch, text input, Claude/OpenAI API integration, and persistence. Create the skeletal system that Phase 2 adds intelligence onto.

---

## What Was Built

### 1. Tauri v2 Application Shell
- **Rust backend** (Tokio async runtime) + **React/TypeScript frontend**
- Decorations disabled — custom window chrome rendered in webview
- 1280x800 default window size
- Structured JSON logging to `~/.luna/logs/`
- Graceful shutdown with state persistence

### 2. Action Dispatch System
- **Action struct:** id (UUID), action_type, payload (JSON), timestamp, source, priority, status
- **Three-tier registry:** Core actions (window.*, user.*, agent.*, system.*), app-registered, LLM-created
- **Ring buffer history:** 10,000 action capacity, queryable by type/source
- **Async queue:** tokio::mpsc unbounded channel for non-blocking processing
- **Dispatcher:** Validates → stamps → logs to history → persists to DB → enqueues
- Latency target: <50ms per dispatch

### 3. Virtual Window System
- Windows rendered as absolutely-positioned divs (simulating a custom compositor)
- **Full chrome:** Title bar with macOS-style traffic light controls (close/minimize/maximize)
- **Drag:** Mouse-based window dragging on title bar with requestAnimationFrame
- **Resize:** Bottom-right corner resize handle, min 320x240, clamped to viewport
- **Z-order:** Monotonic counter, click-to-focus brings window to front
- **Minimize/restore:** Minimized windows shown as buttons above input bar
- **Persistence:** Window positions saved to SQLite on shutdown, restored on launch

### 4. Design Language Implementation
- **Full CSS token system** from Document 11:
  - Warm Sand/Clay palette (#faf7f2 to #6b5735)
  - Amber/Gold active states (#fffbf0 to #6b3408)
  - Muted Teal system indicators (#f2f9f8 to #154442)
  - Warm Grays hierarchy (#faf9f7 to #3d3632)
  - Status colors: success, warning, error, info
- **Typography:** Charter serif body, system sans-serif UI, monospace code
- **Animations:** window-open, pulse, slide-up, fade-in, toast-in
- **Dark mode:** Automatic via `prefers-color-scheme` media query
- **Shadows:** 5-level elevation system with warm-toned shadows

### 5. Text Input Bar
- Fixed bottom bar with context indicator, text field, status dot
- Enter to submit, auto-clear, auto-focus maintain
- Status indicator: idle (gray), working (amber pulse), error (red), success (green)

### 6. LLM Integration (Conductor Agent)
- **Dual provider support:** Anthropic (Claude) and OpenAI (GPT-4o)
- Raw HTTP via reqwest (no SDK dependency)
- **Response parser:** Three strategies — JSON array → code block extraction → plain text fallback
- **Never-fail parsing:** Always produces at least one action
- **Conductor system prompt:** Instructs LLM to respond with structured JSON actions
- **Conversation history:** In-memory, bounded to 20 messages
- Token usage logging on every request

### 7. SQLite Persistence
- Database at `~/.luna/data/luna.db`
- WAL mode for concurrent read performance
- Tables: sessions, actions (indexed by type/session/timestamp), agents, window_states
- Transactional writes for crash safety
- Auto-migration on first launch

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Rust | 1.94.0 |
| Frontend | React + TypeScript | React 18 + TS 5.6 |
| Framework | Tauri | 2.x |
| State Mgmt | Zustand | 5.x |
| Build Tool | Vite | 7.x |
| Database | SQLite (rusqlite) | 0.32 |
| HTTP Client | reqwest | 0.12 |
| Logging | tracing + tracing-subscriber | 0.1/0.3 |
| Serialization | serde + serde_json | 1.0 |

---

## Sprint 1 Simplifications

| Full Spec | Sprint 1 Decision | Returns In |
|-----------|-------------------|-----------|
| Go middleware for agent orchestration | Rust only, direct HTTP | Phase 2 |
| WebGPU/wgpu custom compositor | CSS in Tauri webview | Phase 3+ |
| Multi-model routing with fallbacks | Single provider, no fallback | Phase 2 |
| Streaming responses | Request-response only | Phase 2 |
| Agent hierarchy (Conductor/Orchestrator/Leaf) | Single Conductor | Phase 2 |
| Four-layer memory system | SQLite + in-memory ring buffer | Phase 2 |
| Magnetic card snapping | Free-form drag positioning | Phase 3 |
| Full JSON Schema validation | Type string existence check | Phase 2 |
| Action-level permissions | No permission checks | Phase 2 |

---

## File Structure

```
luna/
├── src-tauri/src/
│   ├── main.rs              # Entry point
│   ├── lib.rs               # Module wiring, Tauri builder, lifecycle
│   ├── error.rs             # LunaError enum (thiserror)
│   ├── config.rs            # API keys from env vars
│   ├── logging.rs           # JSON structured logging
│   ├── state.rs             # AppState (shared across Tauri commands)
│   ├── commands.rs          # dispatch_action, query_actions, send_message, get_agent_status
│   ├── action/
│   │   ├── types.rs         # Action, ActionId, ActionSource, Priority, ActionStatus
│   │   ├── registry.rs      # ActionTypeRegistry with core types
│   │   ├── history.rs       # Ring buffer (VecDeque, 10k)
│   │   ├── queue.rs         # tokio::mpsc unbounded channel
│   │   └── dispatcher.rs    # Central dispatch hub
│   ├── window/
│   │   ├── types.rs         # WindowState, Bounds, Visibility
│   │   ├── manager.rs       # WindowManager (HashMap-based)
│   │   └── commands.rs      # Tauri IPC commands for windows
│   ├── agent/
│   │   ├── llm_client.rs    # Anthropic + OpenAI HTTP clients
│   │   ├── response_parser.rs # JSON/text → Vec<Action>
│   │   └── conductor.rs     # Single Conductor agent
│   └── persistence/
│       └── db.rs            # SQLite connection, migrations, queries
├── src/
│   ├── App.tsx              # Root: event listeners, agent response handling
│   ├── main.tsx             # React render entry
│   ├── styles/              # theme.css, reset, typography, animations, windows, input-bar
│   ├── components/          # Desktop, Window, TextInputBar, StatusIndicator, ResponseDisplay
│   ├── stores/              # windowStore (Zustand), agentStore (Zustand)
│   ├── ipc/                 # windows.ts, agent.ts, actions.ts
│   └── types/               # action.ts, window.ts
```

---

## How to Run

```bash
# Set API key (pick one)
export ANTHROPIC_API_KEY="your-key-here"
# or
export OPENAI_API_KEY="your-key-here"

# Development mode
cd luna
npm install
cargo tauri dev

# The app will launch with a warm sand-colored desktop
# Type in the bottom bar to interact with the AI conductor
```

---

## Success Criteria

- [x] Tauri app launches with warm sand desktop
- [x] Window management (create/resize/minimize/drag) working
- [x] Text input bar accepts user queries
- [x] Action dispatch functional (validation, queue, history)
- [x] Claude/OpenAI API integration working (request/response)
- [x] Actions persisted to SQLite
- [x] All components communicate via Tauri IPC
- [ ] Zero crashes during 1-hour manual test (pending user testing)

---

## Phase 2 Preview (Core Intelligence)

Next sprint adds:
- **Multi-layer memory:** Working memory, episodic memory, semantic KV store
- **Agent hierarchy:** Conductor → Workspace Orchestrator → Leaf Agents
- **Scratchpad/blackboard:** Shared workspace for inter-agent communication
- **Full action schema validation** with JSON Schema
- **Permission system** with approval dialogs
- **Streaming responses** from LLM providers
