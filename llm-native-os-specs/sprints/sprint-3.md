# Sprint 3: Dynamic UI & Rendering

**Project:** Luna — LLM-Native Operating System
**Duration:** Phase 3 (Weeks 11–15)
**Status:** Complete
**Date:** 2026-03-24
**Builds On:** Sprint 2 (Core Intelligence)

---

## Objective

Transform Luna from text-in/text-out into a visual application platform. The LLM can now create interactive UIs by emitting JSON app descriptors, which are rendered as live React component trees inside virtual windows. Sprint 3 also adds magnetic window snapping, grouped drag, ephemeral action registration, and a real-time state sync layer.

---

## Sprint 2 Bugs Fixed (Phase 3.0)

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | PendingApproval auto-allows agent actions | `action/dispatcher.rs` | Agent actions now return error; User/System pass through |
| 2 | Episodic memory errors silently discarded | `agent/conductor.rs` | `if let Err(e) { warn!(...) }` instead of `.ok()` |
| 3 | Scratchpad eviction underflow | `agent/scratchpad.rs` | `saturating_sub(3_600_000)` |
| 4 | MessageBus.send() returns Ok for missing agent | `agent/messaging.rs` | Returns `Err(LunaError::Agent(...))` |
| 5 | No window bounds validation | `window/manager.rs` | `bounds.clamp()` after offset |
| 6 | Conductor history bleeds across sessions | `agent/conductor.rs` | Added `session_id` field + `reset_session()` |
| 7 | Hardcoded action routing in lib.rs | `lib.rs` → `action/handler_registry.rs` | Pluggable `ActionHandlerRegistry` with dynamic registration |

---

## Phase 3.0: Handler Registry Refactor

Replaced the 65-line hardcoded `match action.action_type.as_str()` block in `lib.rs` with a pluggable `ActionHandlerRegistry`.

**New file:** `src-tauri/src/action/handler_registry.rs`

- `ActionHandlerFn` — boxed async handler type
- `ActionHandlerRegistry` — maps action_type → handler, with app-scoped handler tracking
- `register()`, `register_app_handler()`, `deregister_app_handlers()`, `dispatch()`
- `register_core_handlers()` — registers all 9 core handlers at startup
- Queue processor reduced to 3 lines: `registry.dispatch(&action, &handle, &state).await`

---

## Phase 3.1: Component Primitive Library (21 components)

All primitives implement the shared `PrimitiveProps` interface and are styled using Doc 11 design tokens.

| Component | File | Features |
|-----------|------|----------|
| DataTable | `DataTable.tsx` | Sort, search, paginate, row select |
| List | `List.tsx` | Ordered/unordered, clickable items |
| Card | `Card.tsx` | Title, body, action footer |
| Panel | `Panel.tsx` | Titled container, collapsible |
| Container | `Container.tsx` | Flex container |
| Grid | `Container.tsx` | CSS grid layout |
| Divider | `Container.tsx` | Horizontal rule |
| Spacer | `Container.tsx` | Flexible spacer |
| TextInput | `TextInput.tsx` | Label, validation, multiline |
| NumberInput | `NumberInput.tsx` | Min/max/step |
| Select | `Select.tsx` | Single/multi select |
| Checkbox | `Checkbox.tsx` | Checkbox + Toggle variant |
| Slider | `Slider.tsx` | Range slider |
| Stat | `Stat.tsx` | Label + value + trend |
| Timeline | `Timeline.tsx` | Vertical timeline with status |
| Tabs | `Tabs.tsx` | Tabbed content panels |
| Modal | `Modal.tsx` | Overlay dialog |
| Toast | `Toast.tsx` | System notifications |
| Chat | `Chat.tsx` | Message list + input |
| Chart | `Chart.tsx` | Bar/line/pie via inline SVG |
| Gauge | `Gauge.tsx` | Circular progress |
| Breadcrumbs | `Breadcrumbs.tsx` | Path navigation |
| CodeEditor | `CodeEditor.tsx` | Textarea with line numbers |
| Terminal | `Terminal.tsx` | Read-only output |

**CSS files:** `styles/primitives/{containers,data-table,inputs,modal,toast,chart,code-editor}.css`

---

## Phase 3.2: Dynamic Renderer + App System

The core of Sprint 3. LLM emits JSON → OS renders interactive UI.

### Frontend

| File | Purpose |
|------|---------|
| `renderer/ComponentRegistry.ts` | Maps type strings → React components |
| `renderer/DynamicRenderer.tsx` | Recursive JSON→React renderer |
| `renderer/dataBinding.ts` | Resolves `$.field.path` against data context |
| `renderer/eventBridge.ts` | Routes component events → Tauri IPC → agent |
| `renderer/types.ts` | AppDescriptor, ComponentSpec TS types |
| `stores/appStore.ts` | Zustand: app_id → {spec, data, windowId} |

### Backend

| File | Purpose |
|------|---------|
| `src-tauri/src/app/mod.rs` | Module declaration |
| `src-tauri/src/app/descriptor.rs` | AppDescriptor Rust struct + validation |
| `src-tauri/src/app/lifecycle.rs` | AppManager: create/update/destroy apps |
| `src-tauri/src/app/commands.rs` | `dispatch_app_event` Tauri command |

### Action Types

- `app.create` — Creates dynamic app with full descriptor payload
- `app.update` — Updates data context or components
- `app.destroy` — Destroys app, closes window, deregisters handlers
- `app.event` — Internal: routes component events to controlling agent

### Integration

- `Window.tsx` renders `<DynamicRenderer>` when `content_type === 'dynamic_app'`
- `App.tsx` listens for `app-created`, `app-updated`, `app-destroyed` events
- Conductor system prompt includes app.create documentation with component type reference

### New DB Tables

- `dynamic_apps` — Persists app state (app_id, window_id, descriptor, data)
- `ephemeral_actions` — Tracks app-registered actions with usage counters
- `window_groups` — Persists magnetic window groups

---

## Phase 3.3: Ephemeral Action Registration

**Modified:** `action/registry.rs`

- `ActionTypeDefinition` gains `app_id: Option<String>` and `usage_count: u64`
- `register_ephemeral(app_id, action_type, description, fields)` — registers app-owned actions
- `deregister_app_actions(app_id)` — removes all actions for a destroyed app
- `increment_usage(action_type)` — tracks dispatch count for future promotion

---

## Phase 3.4: Magnetic Window Layout

### Frontend

| File | Purpose |
|------|---------|
| `hooks/useMagneticDrag.ts` | Proximity snap (25px), group-aware drag |
| `components/WindowConnector.tsx` | SVG overlay: dashed lines between grouped windows |
| `styles/magnetic.css` | Snap glow, group badge, connector styles |

### Behavior

- Drag window within 25px of another → edges snap together
- Snapped windows automatically form a group
- Grouped windows display a badge showing group size
- Group members maintain relative position during drag
- Dragging away from snap breaks the group
- Visual dashed connectors between group members

### Store Changes

`windowStore.ts` gains:
- `windowGroups: Map<string, Set<string>>` — group_id → member window IDs
- `getWindowGroup(windowId)` — find containing group
- `joinWindows(a, b)` — merge into group (handles cross-group merging)
- `detachWindow(windowId)` — remove from group, dissolve if < 2 members

---

## Phase 3.5: State Sync Layer

### Backend

| File | Purpose |
|------|---------|
| `sync/mod.rs` | Module |
| `sync/topic.rs` | TopicManager: pub/sub with dot-namespaced topics + wildcard |
| `sync/batcher.rs` | UpdateBatcher: 16ms/10-item flush, dedup by topic |

The batcher runs a 60fps flush loop in Tauri setup, emitting `luna-sync` events with batched updates.

### Frontend

| File | Purpose |
|------|---------|
| `sync/SyncManager.ts` | Subscribes to `luna-sync` Tauri event, demuxes by topic |
| `sync/useSubscription.ts` | React hook: `useSubscription(topic, callback)` |

### AppState additions

- `topic_manager: Arc<TopicManager>`
- `update_batcher: Arc<UpdateBatcher>`

---

## New WindowContentType Variants

Added to `window/types.rs`:
- `DynamicApp` — renders via DynamicRenderer
- `Terminal` — terminal output display
- `Scratchpad` — agent scratchpad view

---

## Files Created

### Backend (Rust)
- `src-tauri/src/action/handler_registry.rs`
- `src-tauri/src/app/mod.rs`
- `src-tauri/src/app/descriptor.rs`
- `src-tauri/src/app/lifecycle.rs`
- `src-tauri/src/app/commands.rs`
- `src-tauri/src/sync/mod.rs`
- `src-tauri/src/sync/topic.rs`
- `src-tauri/src/sync/batcher.rs`

### Frontend (TypeScript/React)
- `src/renderer/ComponentRegistry.ts`
- `src/renderer/DynamicRenderer.tsx`
- `src/renderer/dataBinding.ts`
- `src/renderer/eventBridge.ts`
- `src/renderer/types.ts`
- `src/stores/appStore.ts`
- `src/sync/SyncManager.ts`
- `src/sync/useSubscription.ts`
- `src/hooks/useMagneticDrag.ts`
- `src/components/WindowConnector.tsx`
- `src/styles/magnetic.css`
- 21 component files in `src/components/primitives/`
- 7 CSS files in `src/styles/primitives/`

### Files Modified
- `src-tauri/src/lib.rs` — sync module, AppManager, batcher flush loop
- `src-tauri/src/state.rs` — app_manager, topic_manager, update_batcher fields
- `src-tauri/src/action/registry.rs` — app.* types, ephemeral support
- `src-tauri/src/action/dispatcher.rs` — PendingApproval fix
- `src-tauri/src/agent/conductor.rs` — session reset, app.create in prompt
- `src-tauri/src/agent/messaging.rs` — Event variant, missing agent error
- `src-tauri/src/agent/scratchpad.rs` — saturating_sub fix
- `src-tauri/src/window/types.rs` — DynamicApp/Terminal/Scratchpad variants
- `src-tauri/src/window/manager.rs` — bounds clamp
- `src-tauri/src/persistence/db.rs` — 3 new migration tables
- `src/components/Window.tsx` — DynamicRenderer, magnetic drag, group badge
- `src/components/Desktop.tsx` — WindowConnector overlay
- `src/stores/windowStore.ts` — window groups
- `src/App.tsx` — Toast, app events, sync init, primitives CSS

---

## Verification Checklist

- [x] All 7 Sprint 2 bugs fixed
- [x] ActionHandlerRegistry replaces hardcoded match
- [x] 21 primitives with Doc 11 design tokens
- [x] DynamicRenderer recursively renders JSON specs
- [x] JSONPath data binding resolves $.field.path
- [x] Component events route through eventBridge to agent
- [x] app.create/update/destroy action types registered
- [x] app.* handlers create windows and emit events
- [x] Ephemeral actions register/deregister with usage tracking
- [x] Magnetic snapping at 25px proximity
- [x] Grouped windows tracked in store
- [x] Visual connectors between grouped windows
- [x] State sync with TopicManager + UpdateBatcher
- [x] Toast notifications for system.notify
- [x] `cargo check` passes
- [x] `npx tsc --noEmit` passes
