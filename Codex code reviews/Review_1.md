On the current snapshot, `npm run build` and `cargo test` both pass, but Rust
has only 2 tests and the frontend has none.

## Critical

- Supervised approval is broken: parked actions are never executed from the
  UI. The dispatcher exposes pending-action approve/deny, but the dialog only
  grants or denies future permissions, so `Allow Once` does not run the
  current action at all. `PermissionDialog.tsx` (line 17) `dispatcher.rs`
  (line 74) `dispatcher.rs` (line 181)
- Even if the pending-action API were used, "allow once" is effectively
  permanent because temporary grants are not implemented. `dispatcher.rs`
  (line 190) `permissions.rs` (line 83)
- The trust boundary is wrong: renderer-originated app events are stamped as
  `System`, and renderer code can directly invoke permission mutation /
  approval commands. Any compromised UI code can escalate privileges.
  `app/commands.rs` (line 23) `commands.rs` (line 148) `commands.rs`
  (line 394)
- Dynamic app creation is contract-broken: backend emits `descriptor`,
  frontend expects `spec` and dereferences it immediately. That can crash the
  listener and prevents reliable app registration/rendering.
  `handler_registry.rs` (line 274) `App.tsx` (line 128) `appStore.ts`
  (line 27)
- Orchestrator completions and conductor-controlled app events are dropped
  because the conductor never registers a message-bus receiver.
  `orchestrator.rs` (line 225) `handler_registry.rs` (line 389) `lib.rs`
  (line 147) `messaging.rs` (line 91)

## High

- Streaming state is global to the whole app, so overlapping responses can mix
  tokens, create duplicate response windows, and reset the wrong stream on
  done. `App.tsx` (line 74) `App.tsx` (line 77) `App.tsx` (line 90)
- The streaming parser mutates away parsed JSON, then the conductor stores
  only the leftover buffer as assistant history and reparses it, corrupting
  history and emitting bogus fallback actions. `stream_parser.rs` (line 53)
  `conductor.rs` (line 284) `response_parser.rs` (line 37)
- Agent-driven window management is incomplete: `window.create` drops geometry
  on the frontend path, and there are no listeners for agent `window.close` /
  `window.focus`. `handler_registry.rs` (line 121) `handler_registry.rs`
  (line 147) `App.tsx` (line 97) `windowStore.ts` (line 47)
- `app.create` allocates a backend window before validation/duplicate checks,
  so failed app creation leaks orphaned windows. `app.destroy` then emits
  close events instead of actually removing the window from the
  manager/frontend store. `handler_registry.rs` (line 245) `app/lifecycle.rs`
  (line 36) `handler_registry.rs` (line 351) `App.tsx` (line 168)
- Whisper transcription falls back to `ANTHROPIC_API_KEY` and sends it to an
  OpenAI endpoint. That both fails auth and leaks the wrong vendor secret.
  `commands.rs` (line 320) `transcription.rs` (line 34)
- Window persistence is unsafe and inconsistent: saves are session-scoped but
  restore loads all sessions, and save does delete-then-reinsert without a
  transaction. `db.rs` (line 216) `db.rs` (line 412) `lib.rs` (line 93)
- Any registered `system.*` or `user.*` action bypasses approval regardless of
  source, so a model can impersonate trusted action classes.
  `permissions.rs` (line 63) `dispatcher.rs` (line 58)
- Only one permission request can exist in the UI at a time; later requests
  overwrite earlier ones. `App.tsx` (line 41) `App.tsx` (line 173)
- The UI reports `idle` as soon as the streaming IPC call returns, not when
  the stream actually finishes. `TextInputBar.tsx` (line 21)
  `AmbientBadge.tsx` (line 14) `App.tsx` (line 90)
- `stopRecording()` does not wait for final speech-recognition results or
  final recorder chunks, so the end of an utterance can be lost.
  `useVoiceInput.ts` (line 86) `useVoiceInput.ts` (line 97)
  `useVoiceInput.ts` (line 117)
- New windows are added as focused without clearing existing focused flags, so
  multiple windows can be focused at once. `windowStore.ts` (line 47)
  `windowStore.ts` (line 139)
- The sync manager permanently marks itself initialized before listeners are
  installed; one transient failure disables realtime sync for the rest of the
  session. `SyncManager.ts` (line 14)
- `DataTable` selection is keyed by visible row index, so sorting/filtering
  can highlight and emit the wrong record. `DataTable.tsx` (line 19)
  `DataTable.tsx` (line 53)

## Medium

- "Permanent" grants are written to agent state but never reloaded into
  `PermissionMatrix` at startup, so they disappear after restart.
  `commands.rs` (line 161) `permissions.rs` (line 109) `lib.rs` (line 76)
- `query_actions` ignores `limit` whenever `action_type` is provided, so
  filtered queries can grow unbounded. `commands.rs` (line 20)
- The conductor write lock is held across whole LLM requests, blocking status
  reads and future concurrent message handling. `commands.rs` (line 66)
  `commands.rs` (line 242)
- Renderer-controlled payloads are unbounded: `transcribe_audio` base64-
  decodes arbitrary input into memory, and `inject_context` persists arbitrary
  text without size limits. `commands.rs` (line 310) `commands.rs` (line 333)
- Action status never advances past `Dispatched`; the queue worker logs handler
  failures but never records success/failure back into history/DB.
  `dispatcher.rs` (line 125) `lib.rs` (line 253)
- Optional action fields are barely validated, and `app.update` can silently
  accept malformed components or persist invalid descriptors. `registry.rs`
  (line 50) `handler_registry.rs` (line 309) `app/lifecycle.rs` (line 85)
- Message-bus delivery failures are downgraded to logs, so delegation/app
  events can be dropped while the action still looks successful.
  `handler_registry.rs` (line 223) `handler_registry.rs` (line 389)
- The action queue is unbounded, which is an easy memory-growth failure mode
  under streamed or malformed action floods. `queue.rs` (line 10)
- Focus updates can resolve out of order after IPC, leaving the wrong window
  focused locally. `windowStore.ts` (line 120)
- Closing a window does not clean its magnetic-group membership or dynamic-app
  state, so stale phantom state accumulates. `windowStore.ts` (line 59)
  `appStore.ts` (line 56)
- Focused windows are forced to `zIndex: 200`, so any unfocused window with
  `z_order > 100` can render above the focused one. `Window.tsx` (line 115)
- Ambient voice restart/timeout logic is wrong: `onend` closes over stale
  state, and the silence timer is cleared on speech and never re-armed.
  `useAmbientVoice.ts` (line 91) `useAmbientVoice.ts` (line 131)

## Spec Gaps

- The documented three-tier, multi-workspace agent model is not implemented;
  the repo hardcodes one `workspace_default` orchestrator and one stub leaf.
  `04-system-architecture-overview.md` (line 88)
  `06-agent-hierarchy-and-orchestration-model.md` (line 12) `lib.rs`
  (line 167) `leaf.rs` (line 20)
- The three security modes, modify/override flow, and undo/rollback model from
  the spec are absent; the implementation is only a small per-agent/action
  matrix. `20-security-and-sandboxing-model.md` (line 25) `permissions.rs`
  (line 17)
- The action space is not JSON-Schema-based and omits many spec-required core
  actions like workspace/fs/agent lifecycle actions.
  `09-action-space-and-command-protocol.md` (line 13) `registry.rs`
  (line 13) `registry.rs` (line 119)
- The memory system is much smaller than specified: no procedural memory,
  semantic memory is just KV, and episodic memory lacks the richer
  episode/query model. `08-memory-architecture-specification.md` (line 13)
  `memory/mod.rs` (line 12) `db.rs` (line 80)
- The runtime architecture diverges from the spec: no Go middleware layer, no
  Rust compositor/renderer path, ordinary React DOM rendering instead.
  `18-runtime-and-rendering-engine-spec.md` (line 5) `conductor.rs`
  (line 12) `DynamicRenderer.tsx` (line 13)
- The testing strategy in the spec is mostly unimplemented. `package.json` has
  no frontend test runner, and the repo only contains the tiny topic-matching
  Rust test. `25-testing-strategy-and-quality-assurance.md` (line 13)
  `package.json` `topic.rs` (line 66)
