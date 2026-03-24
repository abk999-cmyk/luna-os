# 26. LLM-Native Operating System: Development Roadmap & Build Order

**Document Type:** Implementation Roadmap
**Status:** Master Build Plan
**Version:** 1.0
**Date:** 2026-03-23

---

## Executive Summary

This document specifies the exact build order for implementing the LLM-native OS prototype using Tauri (Rust backend + web frontend), then extracting into a true OS. Dependency order is **critical**—phases must be sequenced to unblock subsequent work.

The roadmap balances:
- **Zero-dependency foundations first** (scaffolding, window system, core dispatch)
- **Early value delivery** (working memory + single agent enables end-to-end testing)
- **Risk reduction** (build the hard parts early; validation at each phase)
- **Iterative evolution** (Tauri → optimized codebase → native OS)

**Total Estimated Duration:** 16-20 weeks for Phase 1–3 (MVP); 24-32 weeks for Phase 1–6 (Full System)

---

## Phase 1: Foundation (Weeks 1–4)

### Objective
Bootstrap a functional Tauri application with basic window management, action dispatch, and human input capture. Create the skeletal system that allows Phase 2 to add intelligence.

### Components to Build

#### 1.1 Tauri Project Setup & Lifecycle
**Spec Reference:** Document 1 (System Architecture), Document 19 (Tauri Integration)

- Initialize Tauri project (Rust backend + Svelte/React frontend)
- Configure cargo dependencies (serde, tokio, uuid, chrono, tracing)
- Set up development and release build pipelines
- Configure logging/tracing infrastructure (structured JSON logs)
- Implement graceful shutdown with resource cleanup
- Create CI/CD skeleton (GitHub Actions or equivalent)

**Dependencies:** None (ground zero)

**Complexity:** Low–Medium

**Success Criteria:**
- Tauri app launches and displays a blank window
- Rust backend compiles without warnings
- Frontend build succeeds
- Logging system captures backend events
- Application can shut down cleanly

**Testing:** Manual startup/shutdown; verify logs appear

---

#### 1.2 Window System (Desktop Shell)
**Spec Reference:** Document 3 (Window & Component System), Document 5 (Visual Language)

- Implement core window struct (id, title, bounds, z-order, visibility state)
- Window creation RPC from frontend to Rust backend
- Window resizing (manual drag + constraints)
- Window minimization/restoration
- Z-order management (bring-to-front, send-to-back)
- Multi-window support (allow N windows simultaneous)
- Window close handler (cleanup, persistence)

**Dependencies:** Phase 1.1 (Tauri setup)

**Complexity:** Medium

**Success Criteria:**
- Create window via API call
- Resize window by dragging edges
- Minimize/restore window
- Multiple windows visible simultaneously
- Windows persist state (position/size) across restart

**Testing:**
- Unit tests for window bounds validation
- Integration test: create/modify/close window
- Manual: open 3+ windows, verify z-order, minimize/restore

---

#### 1.3 Action Dispatch Layer (Core)
**Spec Reference:** Document 2 (Agent Architecture), Document 6 (Action Schema), Document 8 (Message Protocol)

- Define `Action` struct (id, type, payload, timestamp, source, priority, retry_count)
- Implement action queue (async channel-based)
- Create dispatcher (accepts action, validates schema, enqueues)
- Action type registry (enumeration of all possible actions)
- Error handling for invalid actions (schema validation, fallback)
- Action history log (in-memory ring buffer, 10k limit)
- RPC interface: `dispatch_action(action: Action) -> ActionId`

**Dependencies:** Phase 1.1 (Tauri setup)

**Complexity:** Medium (core to entire system)

**Success Criteria:**
- Dispatcher accepts and validates actions
- Invalid actions rejected with clear error
- Action history queryable
- Latency <50ms for dispatch
- Zero data loss under load (1000 actions/sec)

**Testing:**
- Unit: validate action schema, test rejection cases
- Integration: dispatch 1000 actions, verify all logged
- Stress: measure dispatch latency under concurrent load

---

#### 1.4 Text Input Bar (Basic)
**Spec Reference:** Document 12 (User Interaction Model), Document 13 (Voice & Input)

- Single-line text input field (frontend)
- Character input → action (create `UserTextInput` action)
- Dispatch text input as action to backend
- Placeholder suggestions (e.g., "Describe a task…")
- Submit on Enter key
- Clear input after submit
- Basic focus management

**Dependencies:** Phase 1.1, Phase 1.3

**Complexity:** Low

**Success Criteria:**
- Type text, press Enter
- Action dispatched with text payload
- Input field clears
- Text appears in action history
- Focus persists after submit

**Testing:** Manual input entry; verify action logged

---

#### 1.5 Single Agent Connection (Stub)
**Spec Reference:** Document 2 (Agent Architecture), Document 7 (LLM Integration)

- Initialize Claude API client (Anthropic SDK)
- Create "Conductor" agent (single instance, no hierarchy)
- Implement request-response cycle: user input → LLM → action output
- Parse LLM response into structured action(s)
- Route action(s) back to dispatcher
- Error handling: LLM timeout, parse failures, API errors
- Logging: all LLM requests/responses with tokens used

**Dependencies:** Phase 1.1, Phase 1.3, Phase 1.4

**Complexity:** Medium

**Success Criteria:**
- User types query in input bar
- Request sent to Claude
- Response received and parsed
- Action(s) dispatched
- Latency <3 seconds (99th percentile)
- Zero silent failures (all errors logged)

**Testing:**
- Unit: test LLM response parser (valid/invalid JSON)
- Integration: send query, verify action output
- Manual: test error cases (timeout, API key missing)

---

#### 1.6 Basic Persistence Layer
**Spec Reference:** Document 9 (Persistence & State Management)

- SQLite database setup (Rust tokio-sqlx)
- Schema: actions (id, type, payload, timestamp), agents (id, name), sessions (id, start_time, end_time)
- Write action to DB on dispatch
- Query actions by session/agent/type
- Session lifecycle (start on app launch, end on shutdown)
- Transactional writes (prevent data loss on crash)

**Dependencies:** Phase 1.1

**Complexity:** Medium

**Success Criteria:**
- SQLite database created on first launch
- All actions persist
- Queries return correct results
- No data loss on ungraceful shutdown
- Query latency <100ms for 10k rows

**Testing:**
- Unit: SQL schema validation
- Integration: write 100 actions, close app, restart, verify persistence
- Manual: inspect DB with sqlite3 CLI

---

### Phase 1 Success Metrics

- [ ] Tauri app launches with window
- [ ] Window management (create/resize/minimize) working
- [ ] Text input bar accepts user queries
- [ ] Action dispatch system functional (validation, queue, history)
- [ ] Claude API integration working (request/response cycle)
- [ ] Actions persisted to SQLite
- [ ] All components communicate via RPC/async channels
- [ ] Zero crashes during 1-hour manual test

---

## Phase 2: Core Intelligence (Weeks 5–10)

### Objective
Implement the cognitive layer: memory systems, agent hierarchy, and scratchpad. Enable Claude to maintain state and coordinate across workspace. **This is where the system becomes "intelligent."**

### Components to Build

#### 2.1 Memory System (Multi-Layer)
**Spec Reference:** Document 10 (Memory System), Document 11 (State Evolution)

- **Working Memory:** In-memory map (agent_id → recent actions/observations, 256 entries max)
  - Auto-expire after 5 minutes of inactivity
  - Query by agent/type
  - Update on every action/observation

- **Episodic Memory:** SQLite table (session_id, timestamp, action, result, context)
  - Indexed by agent, session, timestamp
  - Query: "What happened in session X?" → full timeline
  - Retention: 30 days auto-purge

- **Semantic Memory:** Simple vector DB stub (for Phase 5 upgrade)
  - In Phase 2: key-value store (text snippets, embeddings placeholder)
  - Schema: (id, key, value, tags, created_at)
  - Query by tag or key substring

- **Persistent Agent State:** JSON blobs per agent (beliefs, preferences, capability registry)
  - Update on permission grant, learning, preference change
  - Load on agent init

**Dependencies:** Phase 1.6 (persistence), Phase 1.3 (action system)

**Complexity:** High (core memory architecture)

**Success Criteria:**
- Working memory: read/write <10ms
- Episodic query (1000 events): <50ms
- Semantic key-value query: <20ms
- Memory limits enforced (256 working, 30-day episodic purge)
- No race conditions under concurrent access

**Testing:**
- Unit: memory eviction policies (working memory expiry)
- Integration: write 10k episodic entries, query by agent/time
- Stress: 100 concurrent memory reads/writes
- Manual: query memory via debug UI, verify correctness

---

#### 2.2 Agent Hierarchy & Conductor Pattern
**Spec Reference:** Document 2 (Agent Architecture), Document 4 (Agent Roles)

- **Conductor Agent:** Single-instance orchestrator
  - Receives user input
  - Decomposes into sub-tasks
  - Routes to workspace orchestrators
  - Aggregates results
  - Updates user-facing state

- **Workspace Orchestrators:** One per workspace (initially just 1)
  - Manages leaf agents
  - Coordinates sub-tasks
  - Reports status back to Conductor

- **Leaf Agents:** Task-specific (initially stubbed, Phase 4+ populated)
  - Execute discrete actions
  - Report results to orchestrator

- Agent Registry: central mapping of agent_id → agent_type → capabilities
- Inter-agent messaging: action dispatch with agent_id target
- Timeout handling: agent takes >5s → escalate to Conductor

**Dependencies:** Phase 1.3 (action system), Phase 2.1 (memory)

**Complexity:** High

**Success Criteria:**
- Conductor receives user input
- Decomposition logic callable (stub OK for now)
- Orchestrators route to leaf agents
- Results aggregated and returned
- Latency: end-to-end <5 seconds for simple task
- All messages logged

**Testing:**
- Unit: agent registry, message routing logic
- Integration: user input → Conductor → Orchestrator → leaf → result
- Manual: trace a complete task through hierarchy

---

#### 2.3 Scratchpad / Blackboard System
**Spec Reference:** Document 11 (State Evolution)

- Shared workspace for agents to post intermediate results
- Data structure: {workspace_id: {task_id: {step: 1, result: "...", timestamp}}}
- Write: agent posts result, timestamp auto-generated
- Read: any agent can read current workspace state
- Lifecycle: clear on task completion or 1-hour timeout
- UI representation: visible panel showing current scratchpad

**Dependencies:** Phase 1.1, Phase 1.3, Phase 2.1

**Complexity:** Medium

**Success Criteria:**
- Agent writes to scratchpad
- Other agents read written data immediately
- UI displays scratchpad in real-time
- Scratchpad auto-clears after task completion
- Concurrent writes safe (no corruption)

**Testing:**
- Unit: scratchpad data integrity under concurrent ops
- Integration: orchestrator writes, leaf reads, verifies
- Manual: observe scratchpad panel during task execution

---

#### 2.4 Action Space with Schema Validation
**Spec Reference:** Document 6 (Action Schema), Document 14 (Capability Registry)

- Comprehensive action schema (JSON Schema format)
  - window.create {title, x, y, width, height, type}
  - agent.task.create {name, description, deadline, priority}
  - memory.store {key, value, agent_id, ttl}
  - llm.invoke {prompt, model, temp, max_tokens}
  - ui.update {component_id, properties}
  - file.read {path, encoding}
  - file.write {path, content, overwrite}
  - shell.execute {command, timeout} (Phase 3+)

- Schema validation on dispatcher
- Action rejection with error message if invalid
- Capability registry: agents declare what actions they can perform
- Permission check: agent_id can perform action_type?

**Dependencies:** Phase 1.3, Phase 2.2

**Complexity:** Medium

**Success Criteria:**
- All valid actions accepted
- Invalid actions rejected with reason
- Capability checks enforced (agent can't perform unauthorized action)
- Schema covers all planned actions
- Validation latency <5ms

**Testing:**
- Unit: schema validation (valid/invalid payloads)
- Integration: capability check (allowed/denied)
- Manual: attempt unauthorized action, verify rejection

---

#### 2.5 LLM Prompt Engineering & Response Handling
**Spec Reference:** Document 7 (LLM Integration), Document 2 (Agent Architecture)

- System prompt for Conductor (goal, constraints, action space)
- System prompt for Orchestrator (task decomposition, delegation)
- Example prompts/few-shot for common tasks
- Response parser: extract action list from LLM output
  - Handle JSON blocks, plain text with action markers, etc.
  - Fallback: if parse fails, ask LLM to rephrase

- Token budgeting: track input/output tokens per session
- Cost tracking: log token counts for analytics

**Dependencies:** Phase 1.5, Phase 2.2

**Complexity:** Medium (iterative tuning)

**Success Criteria:**
- Conductor parses user input into actions 90%+ of time
- Orchestrator successfully decomposes 80%+ of tasks
- LLM response parser handles 3+ formats
- Fallback rephrasing works (recover from parse failures)
- Token tracking accurate

**Testing:**
- Manual: give 50 user inputs, measure success rate
- Manual: measure token counts, verify against API
- Integration: measure end-to-end success rate

---

#### 2.6 Permission & Capability Evolution
**Spec Reference:** Document 15 (Permission System), Document 11 (State Evolution)

- Permission matrix: agent_id × action_type → {allowed, denied, pending_approval}
- Initial default: most actions denied, whitelist expansion
- Grant permission: user approves via UI dialog
- Remember: persist granted permissions per agent
- Revoke: admin interface to revoke permissions
- Audit log: all permission changes with timestamp/user

**Dependencies:** Phase 1.6, Phase 2.1, Phase 2.4

**Complexity:** Medium

**Success Criteria:**
- Unauthorized actions blocked
- User approval dialogs functional
- Permissions persist across restart
- Audit log complete and queryable
- No race conditions in permission check

**Testing:**
- Unit: permission matrix logic
- Integration: agent requests denied action → approval dialog → grant → retry succeeds
- Manual: audit log shows all changes

---

### Phase 2 Success Metrics

- [ ] Working/episodic/semantic memory operational
- [ ] Agent hierarchy working (Conductor → Orchestrator → Leaf)
- [ ] Scratchpad visible and functional
- [ ] Full action space with validation
- [ ] Permission system enforced
- [ ] LLM response parsing reliable (>85% success)
- [ ] End-to-end task: user input → decomposition → execution → result (sub-5s)
- [ ] Token tracking and cost logging
- [ ] No data corruption under concurrent operation

---

## Phase 3: Dynamic UI & Rendering (Weeks 11–15)

### Objective
Build the visual layer: component primitives, dynamic app rendering, action registration. Transform from "invisible agent system" to **interactive visual workspace.**

### Components to Build

#### 3.1 Component Primitive Library
**Spec Reference:** Document 3 (Window & Component System), Document 5 (Visual Language)

**Web Components (Svelte):**
- Button (label, onClick, disabled, loading)
- Input (value, onChange, placeholder, validation)
- Select (options, value, onChange)
- Checkbox (checked, onChange, label)
- Textarea (value, onChange, rows)
- Modal (title, content, buttons, onClose)
- Panel (title, content, collapsible)
- List (items, onSelect, virtualized)
- Tabs (tabs[], activeTab, onChange)
- Progress bar (value 0–100, label)

**Properties:**
- All components accept: id, className, style, visible, disabled
- Theme variables (color, spacing, fonts) from design tokens
- Responsive layout (flex, grid, sizing)

**Dependencies:** Phase 1.1 (Tauri setup), Document 5 (Design Language)

**Complexity:** Medium (many components, but straightforward)

**Success Criteria:**
- All 10+ components render correctly
- All props controllable from backend
- Responsive on 800x600 to 4K screens
- Accessibility: ARIA labels, keyboard navigation
- Theme switching works

**Testing:**
- Visual regression tests (screenshot comparison)
- Manual: test each component in isolation
- Manual: test responsive behavior

---

#### 3.2 Dynamic App/Widget Rendering
**Spec Reference:** Document 3 (Window & Component System), Document 4 (Agent Roles)

- App descriptor format (JSON/YAML):
  ```
  {
    id: "task-planner-app",
    name: "Task Planner",
    window: {width: 600, height: 400, resizable: true},
    components: [
      {type: "input", id: "task-name", placeholder: "Enter task..."},
      {type: "button", id: "create-btn", label: "Create", onClick: "create_task"},
      {type: "list", id: "task-list", items: "binding:tasks"}
    ]
  }
  ```

- Runtime renderer: parse descriptor → instantiate components
- Data binding: component.items = "binding:tasks" → subscribes to memory.tasks
- Event handler: onClick → dispatch action with handler ID
- App lifecycle: init, render, update, cleanup

**Dependencies:** Phase 3.1, Phase 1.3 (action system), Phase 2.1 (memory)

**Complexity:** High

**Success Criteria:**
- App descriptor renders fully
- Data bindings auto-update (component reflects memory changes)
- Click handlers dispatch actions correctly
- App state persists across restart
- Render latency <200ms for 50-component app

**Testing:**
- Unit: descriptor parser
- Integration: bind to memory, update memory, verify UI updates
- Manual: render 3 different apps, interact with each

---

#### 3.3 Action Registration from Dynamic Apps
**Spec Reference:** Document 6 (Action Schema), Document 14 (Capability Registry)

- Apps declare custom actions in descriptor:
  ```
  actions: [
    {id: "create_task", type: "agent.task.create", schema: {...}},
    {id: "delete_task", type: "agent.task.delete", schema: {...}}
  ]
  ```

- Action registry: merge app-declared actions into global schema
- Validation: app actions follow same schema as core actions
- Handler dispatch: onClick on button → look up action handler → dispatch
- Fallback: if handler not found, error in UI (don't crash)

**Dependencies:** Phase 3.2, Phase 2.4 (action schema)

**Complexity:** Medium

**Success Criteria:**
- App actions merged into registry
- Validation enforced
- Handlers execute when triggered
- Invalid actions rejected gracefully
- Registry queryable (list all actions)

**Testing:**
- Unit: descriptor validation
- Integration: app declares action → trigger → dispatch verified
- Manual: create app with custom action, test trigger

---

#### 3.4 Window Attachment & Magnetic Layout
**Spec Reference:** Document 3 (Window & Component System)

- Detect window proximity (within 20px of another window edge)
- Offer "snap" suggestion (visual indicator)
- On snap: link two windows (shared position/size constraints)
- Unsnap: manual drag away
- Magnetic grid: optional snapping to 20px grid

**Dependencies:** Phase 1.2 (window system), Phase 1.1

**Complexity:** Medium

**Success Criteria:**
- Proximity detection working
- Visual snap indicator appears
- Snap link constrains windows
- Unsnap works (dragging breaks link)
- Latency <50ms for proximity check

**Testing:**
- Manual: drag windows close, observe snap
- Unit: proximity distance calculation

---

#### 3.5 Real-Time State Sync Frontend ↔ Backend
**Spec Reference:** Document 8 (Message Protocol), Document 9 (Persistence & State Management)

- WebSocket connection (Tauri IPC already handles this, but explicit sync)
- State change → backend broadcasts to frontend
- Frontend listens to state topics (memory.*, window.*, etc.)
- Update debouncing (batch updates, max latency 100ms)
- Reconnection handling (if connection drops, buffer updates)

**Dependencies:** Phase 1.1, Phase 2.1 (memory system)

**Complexity:** Medium

**Success Criteria:**
- State change reflected in UI <100ms
- No missed updates
- Reconnection works seamlessly
- Memory usage stable (no unbounded buffers)

**Testing:**
- Integration: change memory → verify UI update
- Stress: 100 concurrent state changes → all reflected
- Manual: kill connection, verify reconnect

---

### Phase 3 Success Metrics

- [ ] 10+ component primitives built and tested
- [ ] Dynamic app rendering working
- [ ] Apps can declare custom actions
- [ ] Window snapping functional
- [ ] Real-time state sync reliable
- [ ] UI responsive across screen sizes
- [ ] Render latency <200ms for complex apps
- [ ] Manual test: create and interact with 3 different apps

---

## Phase 4: Interaction Richness (Weeks 16–20)

### Objective
Add advanced input modalities and context-awareness: voice, ambient mode, drag-and-drop context, spatial reference. **Transforms passive task execution into immersive interaction.**

### Components to Build

#### 4.1 Voice Input (Text Bar Swipe)
**Spec Reference:** Document 13 (Voice & Input)

- Web Audio API: capture microphone stream (user grants permission once)
- Transcription service: send audio to Claude's voice API or Whisper
- Transcript → populate text input bar
- User can edit and submit, or press Enter to auto-submit
- Latency budget: <2 seconds from speech end to transcript ready
- Error handling: mic unavailable, transcription failure, network error

**Dependencies:** Phase 1.4 (text input bar)

**Complexity:** Medium (browser APIs + transcription service)

**Success Criteria:**
- Microphone permission requested and stored
- Speech captures without gaps
- Transcript appears in input bar
- Latency <2 seconds (99th percentile)
- Fallback to text input if transcription fails

**Testing:**
- Manual: speak 20 phrases, verify transcript accuracy
- Manual: test error cases (deny mic access, network down)
- Latency: measure end-to-speech to transcript

---

#### 4.2 Ambient Voice Mode (Continuous Listening)
**Spec Reference:** Document 13 (Voice & Input), Document 12 (User Interaction Model)

- Background microphone capture (low power mode)
- VAD (Voice Activity Detection): filter silence
- Transcribe only when speech detected
- Display transcript in floating badge
- User can tap badge → full transcription → submit
- Timeout: 10 seconds silence → discard draft transcript
- Battery/resource aware: disable on low battery

**Dependencies:** Phase 4.1 (voice input)

**Complexity:** Medium–High (VAD, continuous capture)

**Success Criteria:**
- Ambient listening active without user permission on every phrase
- VAD filters >90% of silence
- Transcript badge appears on speech
- Latency <2 seconds to badge display
- Resource usage <5% CPU, <50MB RAM increase

**Testing:**
- Manual: continuous ambient listen for 5 minutes, observe CPU/RAM
- Manual: test VAD accuracy (speech/silence discrimination)
- Manual: test timeout behavior

---

#### 4.3 Drop-as-Context (File/Text Drag-Drop)
**Spec Reference:** Document 12 (User Interaction Model), Document 3 (Window & Component System)

- Accept file drops on app windows
- Parse file type (text, JSON, CSV, image, PDF)
- Auto-generate context summary (e.g., "CSV with 100 rows, columns: name, email")
- Inject into memory as episodic entry + semantic snippet
- Update Conductor prompt: include dropped context
- UI feedback: drop zone highlight, confirmation toast

**Dependencies:** Phase 1.2, Phase 2.1 (memory), Phase 3 (dynamic UI)

**Complexity:** Medium

**Success Criteria:**
- Drag file onto window
- Context extracted and stored
- Conductor aware of context (in system prompt)
- Latency <500ms from drop to context ready
- Support 5+ file types

**Testing:**
- Manual: drop CSV, image, JSON, text file
- Integration: verify context in memory and LLM prompt
- Manual: verify Conductor uses dropped context

---

#### 4.4 Spatial Reference Map
**Spec Reference:** Document 3 (Window & Component System), Document 4 (Agent Roles)

- Panel showing spatial layout of all open windows
- Each window rendered as rectangle with title
- User can click on window in map → bring to front
- Map auto-updates when windows move/resize
- Optional: 3D representation (placeholder for Phase 5+)

**Dependencies:** Phase 1.2 (window system), Phase 3.1 (components)

**Complexity:** Low–Medium

**Success Criteria:**
- Map displays all windows
- Clicking map brings window to front
- Map updates in real-time as windows move
- Responsive to multi-monitor setups

**Testing:**
- Manual: open 5 windows, interact via map
- Manual: move windows, verify map updates

---

#### 4.5 Task Graph Panel
**Spec Reference:** Document 4 (Agent Roles), Document 11 (State Evolution)

- Visual representation of task decomposition tree
- Shows Conductor task → sub-tasks → leaf tasks
- Each node shows status (pending, running, completed, failed)
- Links show dependencies
- Color coding by status
- Click node → show details/logs

**Dependencies:** Phase 2.2 (agent hierarchy), Phase 3.1 (components)

**Complexity:** Medium

**Success Criteria:**
- Graph renders all tasks
- Status updates in real-time
- Dependencies visible
- Node details accessible
- Latency <100ms to update on task change

**Testing:**
- Manual: execute multi-level task, observe graph
- Unit: task dependency graph construction

---

### Phase 4 Success Metrics

- [ ] Voice input working (speech → text)
- [ ] Ambient voice mode functional
- [ ] Drag-and-drop context extraction
- [ ] Spatial map of windows
- [ ] Task graph visualization
- [ ] All new interactions tested and responsive
- [ ] Manual test: complete task using voice + dragged context

---

## Phase 5: Intelligence Layers (Weeks 21–28)

### Objective
Deepen system intelligence: user modeling, planning, learning, and cross-workspace reasoning. **Transforms reactive assistant into proactive agent.**

### Components to Build

#### 5.1 User Modeling
**Spec Reference:** Document 11 (State Evolution), Document 15 (Permission System)

- User profile: {name, preferences, role, skill_level, workspace_access}
- Preference tracking: task patterns, preferred workflows, time zones
- Skill inference: from tasks completed, errors made, queries asked
- Behavioral data: (time of day, task type, success rate)
- Model update: after every interaction, update belief state
- Privacy: no external data transmission; all on-device

**Dependencies:** Phase 2.1 (memory system)

**Complexity:** High

**Success Criteria:**
- Profile creates and updates without errors
- Preferences inferred from 10+ interactions
- Skill level measurable (e.g., "advanced planner, basic shell user")
- Model improvement tracked (accuracy of predictions)
- Privacy guarantee verified (no external data leaks)

**Testing:**
- Integration: simulate 50 user interactions, inspect model
- Manual: verify preferences match actual usage
- Privacy audit: trace all data access

---

#### 5.2 Planning Engine (Living Plans)
**Spec Reference:** Document 11 (State Evolution), Document 2 (Agent Architecture)

- Plan representation: DAG of tasks with constraints (deadline, priority, dependencies)
- Plan creation: Conductor generates from user goal + user model
- Plan refinement: Orchestrator decomposes into executable steps
- Adaptation: as tasks complete/fail, replan (re-invoke Conductor)
- Persistence: plans stored, queryable, reusable as templates
- UI: plan visualization + edit capability

**Dependencies:** Phase 2.2 (agent hierarchy), Phase 5.1 (user modeling)

**Complexity:** High

**Success Criteria:**
- Conductor generates coherent plans
- Plans execute correctly
- Adaptation (replan) on failure
- Plan templates usable for recurring tasks
- Latency: initial plan <10 seconds, replan <5 seconds

**Testing:**
- Integration: goal → plan → execution → completion
- Manual: inspect generated plans, verify coherence
- Manual: introduce failure, observe replan

---

#### 5.3 Learning / Adaptation (Replay & Teach)
**Spec Reference:** Document 11 (State Evolution)

- Replay mechanism: user selects past task → system replays execution
- Teach mechanism: user can annotate replays ("This was wrong, should have been…")
- Learning: store annotations in semantic memory
- Feedback integration: next similar task uses learned feedback
- Effectiveness metric: track post-learning success rate

**Dependencies:** Phase 2.1 (memory), Phase 5.2 (planning)

**Complexity:** High

**Success Criteria:**
- Replay works (task reruns identically)
- Teach annotations stored
- Learning applied to similar tasks
- Success rate improvement measurable (>10% lift)

**Testing:**
- Manual: replay 5 past tasks, verify exactness
- Manual: annotate 3 tasks with corrections
- Integration: verify corrections applied to future similar tasks

---

#### 5.4 Permission Evolution (Adaptive Scope)
**Spec Reference:** Document 15 (Permission System), Document 11 (State Evolution)

- Graduated permissions: start restrictive, expand as agent proves competence
- Competence metric: success_rate of tasks using agent
- Auto-promotion: if success_rate >95% for 10 uses, grant next level of permission
- User confirmation: optional auto-promotion, or require user approval
- Revocation: if success_rate drops <80%, revoke (with explanation)

**Dependencies:** Phase 2.6 (permission system), Phase 5.1 (user modeling)

**Complexity:** High

**Success Criteria:**
- Permission levels defined (e.g., restricted, trusted, unrestricted)
- Competence metric calculated correctly
- Auto-promotion triggers correctly
- User override possible
- Audit log complete

**Testing:**
- Integration: simulate agent tasks, measure competence, verify promotion
- Manual: override auto-promotion, verify choice respected

---

#### 5.5 Cross-Workspace Intelligence
**Spec Reference:** Document 4 (Agent Roles), Document 2 (Agent Architecture)

- Workspace registry: list all workspaces
- Information sharing: sanitized summaries passed between workspaces
- Conflict resolution: if two workspaces want conflicting actions, escalate to Conductor
- Shared learning: successful patterns learned in one workspace available to others
- User privacy: cross-workspace sharing requires explicit opt-in per workspace

**Dependencies:** Phase 2.2 (agent hierarchy), Phase 5.2 (planning)

**Complexity:** High

**Success Criteria:**
- Workspaces communicate without conflicts
- Shared learning functional
- Privacy respected (no unauthorized sharing)
- Escalation to Conductor on conflict

**Testing:**
- Integration: 2 workspaces, coordinated task
- Manual: verify conflict resolution

---

### Phase 5 Success Metrics

- [ ] User model created and updated
- [ ] Planning engine generates and adapts plans
- [ ] Learning system records and applies feedback
- [ ] Permission system evolves automatically
- [ ] Cross-workspace coordination working
- [ ] System measurably improves with use
- [ ] All learning data on-device (privacy verified)

---

## Phase 6: Polish & Scale (Weeks 29–32)

### Objective
Production readiness: collaboration, SDK, migrations, visual polish, performance. **Prepare for real-world deployment.**

### Components to Build

#### 6.1 Collaboration (Multi-User Workspaces)
**Spec Reference:** Document 4 (Agent Roles) — extended for multi-user

- User identity: per-session authentication (stub for now)
- Workspace sharing: owner can invite users
- Role-based access: (owner, editor, viewer)
- Concurrent editing: conflict resolution (last-write-wins for now)
- Presence: show which users are active
- Audit trail: log all user actions per workspace

**Dependencies:** Phase 2.2, Phase 3 (dynamic UI)

**Complexity:** High

**Success Criteria:**
- Multi-user workspace creation
- Concurrent edits without corruption
- Presence indicator accurate
- Audit trail complete
- Latency <200ms for state sync

**Testing:**
- Integration: 2 users, concurrent edits
- Manual: observe presence accuracy

---

#### 6.2 Third-Party App SDK
**Spec Reference:** Document 3 (Window & Component System), Document 6 (Action Schema)

- App manifest format: name, version, icon, entry point, permissions
- SDK library: (TypeScript/Python) for building apps
- App packaging: bundle descriptor + code as .taro file
- Installation: user approves, app mounted in workspace
- App isolation: sandboxed execution (Tauri limits + permission checks)
- App store stub: repo of 5–10 example apps

**Dependencies:** Phase 3.2 (dynamic app rendering), Phase 2.6 (permissions)

**Complexity:** High

**Success Criteria:**
- SDK published with 3 example apps
- Third-party app can run in workspace
- Permissions enforced
- App isolation verified (app can't access other workspaces)
- Store browsable

**Testing:**
- Manual: build test app with SDK
- Integration: install test app, verify isolation
- Manual: verify permissions enforced

---

#### 6.3 Migration & Compatibility Layer
**Spec Reference:** Document 9 (Persistence & State Management)

- Version tracking: app tracks schema version
- Migration scripts: Tauri → optimized codebase → native OS
- Data export: JSON/SQLite dump for backup
- Data import: restore from backup
- Backward compatibility: v1 data readable in v2

**Dependencies:** Phase 1.6 (persistence), Phase 2–5 (all state)

**Complexity:** Medium

**Success Criteria:**
- Data exports successfully
- Imports restore without data loss
- Version tracking accurate
- Migration scripts tested

**Testing:**
- Manual: export, wipe DB, import, verify restoration

---

#### 6.4 Full Visual Design Language Implementation
**Spec Reference:** Document 5 (Visual Language)

- All UI components restyled to design language
- Typography: font selection, sizes, weights
- Color palette: primary, secondary, accent, semantic (success, error, warning)
- Spacing: consistent grid-based (8px, 16px, 24px, etc.)
- Dark mode: complete theme
- Animations: smooth transitions (200–300ms)

**Dependencies:** Phase 3.1 (components)

**Complexity:** Medium

**Success Criteria:**
- All UI components match design
- Responsive across breakpoints
- Dark mode complete and tested
- Animations performant

**Testing:**
- Visual regression tests (screenshot)
- Manual: compare UI to design mockups
- Latency: verify animations don't stutter

---

#### 6.5 Performance Optimization to Latency Budgets
**Spec Reference:** Document 1 (System Architecture)

- Latency budgets (from Phase 1–5):
  - User input → action dispatch: <50ms
  - Conductor LLM request → response: <3 seconds
  - Memory query: <100ms (episodic), <20ms (working)
  - UI render on state change: <200ms
  - Voice transcription: <2 seconds

- Optimizations:
  - Action dispatch: use fast-path for validation (cache schema)
  - LLM: request batching, prompt caching
  - Memory: indexed queries, cache hot sets
  - UI: component memoization, virtual scrolling
  - Database: query optimization, explain plans

**Dependencies:** Phase 1–5 (all systems)

**Complexity:** High

**Success Criteria:**
- All latency budgets met (measured 99th percentile)
- No regression from Phase 1
- Memory usage stable (no leaks)
- CPU usage <20% at idle

**Testing:**
- Benchmarks: latency under load (1000 req/sec)
- Memory profiling: track heap over 1-hour session
- Manual: real-world usage, feel assessment

---

#### 6.6 Documentation & Handoff to Native OS Extraction
**Spec Reference:** All documents 1–25

- API documentation: all public endpoints
- Internal architecture document: how all systems connect
- Performance analysis: profiling results, bottlenecks
- Code comments: highlight extraction points (for native OS later)
- Runbook: how to deploy, debug, scale

**Dependencies:** Phase 1–5 (all complete)

**Complexity:** Low

**Success Criteria:**
- Comprehensive documentation
- New developer can contribute in 1 week
- Extraction path clear (comments marking native OS code)

**Testing:**
- Manual: have someone unfamiliar read docs and attempt contribution

---

### Phase 6 Success Metrics

- [ ] Multi-user workspaces functional
- [ ] SDK published with examples
- [ ] Data migration tested
- [ ] Visual design applied throughout
- [ ] All latency budgets met
- [ ] Documentation complete
- [ ] Ready for handoff to native OS extraction

---

## Critical Path Analysis

### Dependency Graph (Simplified)

```
Phase 1.1 (Tauri Setup)
├─→ Phase 1.2 (Window System)
├─→ Phase 1.3 (Action Dispatch)
│   └─→ Phase 1.4 (Text Input)
│       └─→ Phase 1.5 (Single Agent)
│   └─→ Phase 2.4 (Action Schema)
├─→ Phase 1.6 (Persistence)
│   └─→ Phase 2.1 (Memory System)
│       └─→ Phase 2.2 (Agent Hierarchy)
│           └─→ Phase 2.3 (Scratchpad)
│           └─→ Phase 4.5 (Task Graph)
│       └─→ Phase 2.6 (Permissions)
│           └─→ Phase 5.4 (Permission Evolution)
├─→ Phase 3.1 (Components)
│   └─→ Phase 3.2 (Dynamic Apps)
│       └─→ Phase 3.3 (Action Registration)
└─→ Phase 4.1 (Voice Input)
    └─→ Phase 4.2 (Ambient Voice)
└─→ Phase 5.1 (User Modeling)
    └─→ Phase 5.2 (Planning)
        └─→ Phase 5.3 (Learning)
└─→ Phase 6.2 (Third-Party SDK)
```

### Critical Path (No-Slack Components)

1. **Phase 1.1** (Tauri setup) → **Phase 1.3** (action dispatch) → **Phase 1.5** (single agent) → **Phase 1.6** (persistence)
2. **Phase 1.6** → **Phase 2.1** (memory) → **Phase 2.2** (hierarchy)
3. **Phase 2.2** → **Phase 2.5** (LLM prompting)
4. Parallel: **Phase 3.1/3.2** (dynamic UI) can start once Phase 1 complete
5. Parallel: **Phase 4.1** (voice) can start once Phase 1.4 complete
6. **Phase 5.x** (intelligence) depend on Phase 2 complete
7. **Phase 6.x** (polish) last, after Phase 5

### Fast-Path (MVP in 12 Weeks)

Skip: Phases 5.4, 5.5, 6.1, 6.2 (collaboration, SDK, advanced intelligence)

Focus: Phases 1–4 + simplified Phase 5.1/5.2 → Demonstrate core system working

---

## Build Constraints & Risk Mitigation

### Key Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM response parsing brittle | Phase 1.5 blocked | Invest in prompt engineering early; fallback to structured outputs |
| Voice transcription latency | Phase 4.1 fails | Test Whisper/Claude voice API early; fallback to manual text |
| Agent hierarchy too complex | Phase 2.2 overruns | Start with 2-level hierarchy (Conductor + Workspace), add later |
| Memory system race conditions | Data corruption | Use tokio mutex, test heavily, use SQLite transactions |
| UI framework learning curve | Phase 3 overruns | Choose Svelte (simpler) over React; allocate 1 week learning spike |
| Performance regression | Phase 6 fails | Benchmark Phase 1–5 weekly; address regressions immediately |

### Build Velocity Assumptions

- Senior Rust developer: 1 FTE
- Senior Frontend developer: 1 FTE
- Can build in parallel (Rust + Frontend)
- Weekly sync to integrate; integration <1 day
- Estimated velocity: 2–3 weeks per phase

### Testing Strategy by Phase

| Phase | Unit Tests | Integration Tests | Manual/E2E Tests |
|-------|-----------|-------------------|------------------|
| 1 | 30% | 20% | 50% (manual GUI) |
| 2 | 40% | 35% | 25% |
| 3 | 30% | 40% | 30% |
| 4 | 20% | 30% | 50% (manual interaction) |
| 5 | 35% | 40% | 25% |
| 6 | 10% | 30% | 60% (user acceptance) |

---

## Success Criteria Checklist

### End-to-End Validation (Phase 1–3, MVP)

- [ ] User opens app
- [ ] User types: "Create a task to research AI trends"
- [ ] Conductor receives, understands, creates task
- [ ] Task appears in UI
- [ ] User clicks task → opens in dynamic window
- [ ] Task completion logged
- [ ] Restart app → task history persists
- [ ] Memory query: "Show tasks created today" → returns correct result
- [ ] Voice input: speak same request → same result

### Performance Validation (End-to-End)

- [ ] Latency: user input → Conductor response <3 seconds (99th percentile)
- [ ] Memory: <200MB RAM at rest, <500MB under load
- [ ] CPU: <10% idle, <30% during active use
- [ ] Throughput: handle 100 actions/sec without queue overflow

### Stability Validation

- [ ] 1-hour continuous operation without crash
- [ ] Graceful shutdown (save state, close cleanly)
- [ ] Restart: all state restored
- [ ] Error cases handled (missing LLM key, network down, disk full)

---

## Tauri → Native OS Extraction Strategy

Once MVP complete (Phase 3):

1. **Code Audit:** Identify Tauri-specific code (window management, file I/O, IPC)
2. **Abstraction Layer:** Create trait-based interfaces for Tauri-dependent code
3. **Native Implementation:** Reimplement traits for native OS (Linux kernel, Wayland)
4. **Gradual Migration:** Swap Tauri components one-by-one
5. **Testing:** Each swap verified on native kernel
6. **Performance Validation:** Ensure native version meets or beats Tauri version

**Extraction timeline:** Weeks 32–48 (post-MVP)

---

## Appendix: Document References

| Document | Purpose |
|----------|---------|
| 1. System Architecture | Overall vision, principles |
| 2. Agent Architecture | Agent hierarchy, roles |
| 3. Window & Component System | UI building blocks |
| 4. Agent Roles & Responsibilities | Conductor, Orchestrator, Leaf |
| 5. Visual Language & Design | UI style guide |
| 6. Action Schema | All possible actions |
| 7. LLM Integration | Claude API details |
| 8. Message Protocol | Inter-component communication |
| 9. Persistence & State | Database schema |
| 10. Memory System | Working/episodic/semantic memory |
| 11. State Evolution | Learning, adaptation |
| 12. User Interaction Model | Input modalities |
| 13. Voice & Input | Transcription, ambient |
| 14. Capability Registry | Agent capabilities |
| 15. Permission System | Access control |
| 19. Tauri Integration | Tech stack |

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-03-23 | System Design | Initial roadmap |

---

**End of Document 26**

This roadmap is self-contained and actionable. A developer reading this document can begin Phase 1 immediately with confidence in the build sequence and success criteria.
