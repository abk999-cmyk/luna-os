# AI-Native Design Principles
## Document 2 of 26: The Constitution of LLM-Native OS Design

**Status**: Foundational Specification
**Version**: 1.0
**Last Updated**: 2026-03-23
**Scope**: Universal design rules for systems, interfaces, and interactions where an LLM is the primary operator. Every downstream design decision must be traceable to a principle in this document.

---

## Document Purpose

This document defines the non-negotiable design principles for an operating system architected around LLM agency. These are not guidelines—they are immutable constraints that govern all architectural, interface, and interaction design downstream.

Each principle below contains:
- **Core Statement**: The principle as a single declarative rule
- **Rationale**: Why this principle matters and what it solves
- **Implementation Requirements**: What Claude Code must build to uphold this principle
- **Anti-Patterns**: Violations of this principle and why they fail

---

## Principle 1: State Push, Not Pull

**Core Statement**: The OS proactively pushes ambient state into the LLM's working memory. The LLM should not have to query for context that is essential to decision-making.

**Rationale**:
LLMs operate best with ambient context loaded—like peripheral vision rather than active lookup. Forcing the LLM to ask "what's open?" or "what is the user doing?" adds latency, breaks flow, and wastes context window on routine queries. The moment the LLM must pull state, it has already failed the responsiveness requirement.

**Implementation Requirements**:
- **Live Capability Manifest**: Maintain a real-time, automatically-updating list of available actions in working memory, refreshed on every state change.
- **Ambient State Block**: A reserved section of context that contains: open workspaces, active tools, current file, user activity status, and recent context.
- **Auto-Updating Action Registry**: When new actions are registered (by apps, scripts, or the LLM itself), the action manifest refreshes instantly without the LLM having to poll.
- **State Change Notifications**: The OS broadcasts state changes (file saved, window opened, user input detected) so the LLM can maintain coherent context without polling.

**Anti-Patterns**:
- Requiring the LLM to call `list_open_windows()` or `get_current_state()` before acting (moves responsibility onto the LLM).
- State that becomes stale within the context window (pushes must stay current).
- Ambient state that is not disambiguated by workspace (global state is insufficient; the LLM needs scoped context).
- Hiding available actions—the manifest must be exhaustive and human-readable.

---

## Principle 2: Every Object is Referenceable

**Core Statement**: Everything rendered on screen is inherently referenceable by the LLM. The OS maintains a spatial reference map that resolves deictic references ("this", "that", "the window above") to actual objects.

**Rationale**:
Natural interaction is deictic—users point, gesture, and reference objects spatially. Current LLM interfaces force users to describe objects verbally ("the CSV file I opened 5 minutes ago") instead of gesturing toward them. The OS must maintain a live spatial map so that when a user says "move this window" while pointing, the system resolves "this" instantly to the exact window. This eliminates the largest single source of friction in current LLM interfaces.

**Implementation Requirements**:
- **Spatial Reference Map**: A real-time, screen-aware data structure that maps screen coordinates to semantic objects (windows, text selections, UI elements, file handles).
- **Reference Resolution Engine**: When the LLM emits a deictic reference (via gesture, click, or spoken word), the engine resolves it to a specific object with high confidence. Ambiguity should be resolved by proximity and recency.
- **Gesture-to-Reference Binding**: When the user gestures or clicks while speaking, capture the input modality pairing. The LLM sees: `reference: {type: "window", id: "editor_1", coordinates: [x, y], confidence: 0.98}`.
- **Named References**: Allow the user to name objects ("the blue window", "the main editor") and persist those names in the user model.
- **Reference Persistence**: References remain valid across workspace changes, so the LLM can say "bring back the window I was looking at" without ambiguity.

**Anti-Patterns**:
- Forcing the user to describe objects verbally instead of gesturing.
- Ambiguous references without confidence scores (the LLM must know when disambiguation is needed).
- References that break when workspaces change.
- Non-spatial objects (like actions or data) that cannot be referenced by their location or state.

---

## Principle 3: Progressive Disclosure by AI Judgment

**Core Statement**: The LLM decides what UI complexity to show and when, not a fixed hierarchy. Show what's needed now. Mention what's available. Add complexity only when explicitly asked or when it genuinely serves the task.

**Rationale**:
Most OS UIs present a static hierarchy of options. Many are overwhelming; others hide critical functionality. An LLM-native OS inverts control: the LLM decides what the user should see, based on task context and cognitive load. If the user is writing prose, show only text tools. If debugging, surface error logs and stack traces. If the user asks for "more options," load the advanced panel. This creates a calm, focused experience while maintaining full functionality.

**Implementation Requirements**:
- **Minimal Default View**: Core UI shows only the most essential elements. Everything else is available but not visible by default.
- **Intelligent Workspace Composition**: The conductor assesses the current task and dynamically composes the workspace—which panels to show, which tools to highlight, what level of detail to display.
- **Explicit Disclosure Requests**: When the user asks for "more", "advanced", or "options", the LLM loads the next layer of UI without reload delay.
- **Gradual Detail Loading**: As the user works deeper into a task, the LLM progressively reveals relevant tools and information. E.g., opening a file reveals file-specific actions; selecting code reveals refactoring options.
- **User-Definable Complexity Levels**: Allow users to set their preferred disclosure threshold ("always minimal", "standard", "expert", "debug").
- **Graceful Overflow**: When the UI approaches cognitive overload, the LLM can collapse or hide lower-priority panels without losing functionality.

**Anti-Patterns**:
- A static UI that shows all options all the time (visual noise, decision paralysis).
- Progressive disclosure that requires click-through or menu navigation (breaks the flow).
- Hiding critical actions behind "advanced" tabs (they should be discoverable but not intrusive).
- Disclosing complexity that is irrelevant to the current task (adds noise).

---

## Principle 4: Structured Action Space Over Free-Form Text

**Core Statement**: Every operation in the OS registers as a callable action with a strict schema. The LLM emits structured intents (JSON-like), not free-form text commands.

**Rationale**:
Free-form CLI-style commands are ambiguous, error-prone, and require interpretation. They lead to failed operations, wasted retries, and user frustration. By contrast, a structured action space with explicit schemas is type-safe, debuggable, and composable. The LLM and the OS speak the same language: structured intents. This also makes reasoning auditable—we can see exactly what the LLM intended, not guess from text.

**Implementation Requirements**:
- **Action Schema Definition**: Every action has: name, description, required parameters (with types), optional parameters, return type, preconditions, and side effects.
- **Strongly-Typed Dispatch**: The LLM emits an action intent like `{action: "open_file", path: "/path/to/file", mode: "read"}`. The OS validates the intent against the schema before dispatch.
- **Error Reporting**: If the LLM emits an intent that violates the schema, the OS returns a structured error with the violation details, allowing the LLM to correct and retry.
- **Action Composition**: Actions can be composed into sequences. The LLM can emit: `[{action: "A", params: {...}}, {action: "B", params: {...}}]` and the OS executes atomically or reports failure.
- **Introspection**: The OS exposes the full action schema to the LLM in its context window. The LLM always knows what's possible and what constraints apply.
- **Undo/Redo Compatibility**: All actions are intrinsically reversible because their parameters are explicit and serializable.

**Anti-Patterns**:
- Allowing free-form text interpretation (ambiguous, hard to debug).
- Actions without explicit return types (the LLM cannot reason about downstream effects).
- Parameters that are optional but critical (forces the LLM to guess defaults).
- Actions that cannot be composed (prevents workflow automation).

---

## Principle 5: Self-Extending Capabilities

**Core Statement**: The LLM can register new actions at runtime. The action space grows organically as the system discovers new capabilities and patterns.

**Rationale**:
No static action set can anticipate all future needs. Users will invent new workflows; apps will expose new capabilities; the LLM will discover useful patterns. A closed action space is a ceiling on capability. Instead, the OS allows three tiers of actions: core (immutable, always available), app-registered (safe, sandboxed), and LLM-created (ephemeral, optionally promoted to persistent). This makes the system extensible without requiring a release cycle.

**Implementation Requirements**:
- **Action Registration API**: The LLM (or any process) can call `register_action(name, schema, handler)` to create a new action.
- **Tier System**:
  - Core actions: immutable, always available, built-in.
  - App-registered actions: registered by applications, subject to sandboxing and permission constraints.
  - LLM-created actions: registered by the LLM at runtime, ephemeral (lost on session end unless promoted), subject to user approval.
- **Handler Binding**: An action's handler can be a direct function, a workflow, a subprocess, or even a prompt template.
- **Promotion Workflow**: If the LLM creates a useful action, it can be promoted to persistent storage and reused across sessions.
- **Conflict Resolution**: When actions have the same name, the OS enforces a priority: core > app > LLM-created. Users can override.
- **Capability Versioning**: Actions have versions. The OS can track breaking changes and warn the LLM if a depended-on action changes.

**Anti-Patterns**:
- A fixed action set that cannot be extended (limits the system to designer-anticipated use cases).
- Unvetted LLM-created actions that run without sandboxing (security risk).
- Actions that disappear unexpectedly between sessions (breaks workflows).
- Unconstrained capability growth (the action registry could become unmanageably large).

---

## Principle 6: Composable Primitives Over Raw Generation

**Core Statement**: Dynamic interfaces are constructed from high-level, composable building blocks (DataTable, InteractiveMap, Timeline, Canvas, CodeEditor, Chat), not raw HTML/CSS generation.

**Rationale**:
When the LLM generates raw HTML, the results are brittle, inconsistent, and often non-functional. The LLM must get typography, layout, and interactivity right from scratch every time. By contrast, a library of composable primitives (each proven, accessible, and themeable) lets the LLM focus on intent: "show a table of these results with sortable columns and clickable rows." The primitive handles rendering, interaction, and theming. This is faster, more reliable, and produces better UX.

**Implementation Requirements**:
- **Primitive Library**: A comprehensive set of high-level UI components, each with:
  - Declarative schema (what to show, how to configure it).
  - Built-in interaction (sorting, filtering, pagination, zooming).
  - Accessibility support (ARIA, keyboard navigation, screen reader compatibility).
  - Theme support (respects the warm clay aesthetic).
- **Declarative Composition**: The LLM emits JSON-like intent like:
  ```json
  {
    "component": "DataTable",
    "columns": [{"name": "File", "type": "string", "sortable": true}, ...],
    "rows": [...],
    "actions": [{"label": "Open", "intent": "open_file"}]
  }
  ```
- **Standard Primitives**:
  - `DataTable`: Tabular data with sorting, filtering, pagination, inline editing.
  - `InteractiveMap`: Geographic or abstract maps with markers, layers, zoom.
  - `Timeline`: Chronological events with detail levels, filtering, scrubbing.
  - `Canvas`: Freeform drawing/visualization surface for custom rendering.
  - `CodeEditor`: Syntax-highlighted, navigable code with gutter actions.
  - `Chat`: Conversation interface with turn history, formatting, inline media.
  - `Form`: Structured data entry with validation, conditional fields.
  - `Inspector`: Hierarchical object inspection with drill-down.
  - `Schematic`: Diagram/node-link representation.
- **Extensibility**: Apps can register custom primitives following the same interface contract.
- **Theming**: All primitives respect the system color palette and typography, ensuring visual coherence.

**Anti-Patterns**:
- Raw HTML/CSS generation by the LLM (brittle, slow, inconsistent).
- Primitives that are too rigid (force the LLM to generate HTML for custom layouts).
- Primitives that are too flexible (become their own rendering language).
- Missing accessibility in primitives (screens become inaccessible).

---

## Principle 7: Hierarchy of Agency

**Core Statement**: Agency is organized hierarchically: Conductor (global orchestrator) → Workspace Orchestrators (context managers) → Leaf Agents (task executors). Global context flows down; escalation flows up. Sub-agents collaborate emergently through shared scratchpad.

**Rationale**:
An LLM managing an entire OS is a single point of failure and bottleneck. Breaking agency into levels—each with appropriate model capability and scope—improves reliability, allows parallel work, and scales to complex multi-step tasks. The Conductor sees the big picture; workspace orchestrators manage semantic contexts; leaf agents execute specific tasks. This hierarchy also maps naturally to the real workload: some tasks need global reasoning, others can be parallelized.

**Implementation Requirements**:
- **Conductor (Global Orchestrator)**:
  - Maintains system-wide state and high-level goals.
  - Decomposes user intent into workspace-level tasks.
  - Routes requests to appropriate workspace orchestrators.
  - Manages multi-workspace intelligence and connection detection.
  - Responds to escalations from lower levels.
  - Model: Claude Opus (most capable model).
- **Workspace Orchestrator (Context Manager)**:
  - Manages a single semantic context (e.g., "writing thesis", "debugging app").
  - Composes the workspace (which tools, panels, documents are open).
  - Routes workspace-local requests to appropriate leaf agents.
  - Maintains workspace-specific memory and state.
  - Escalates out-of-scope requests to the Conductor.
  - Model: Claude Sonnet (capable, lower-cost).
- **Leaf Agent (Task Executor)**:
  - Executes specific, bounded tasks (edit a file, run a test, format output).
  - Does not make multi-step decisions; executes given intent.
  - Escalates decisions to the workspace orchestrator.
  - Model: Claude Haiku (fast, cheap).
- **Shared Scratchpad**: All agents can read/write a workspace-scoped scratchpad, enabling emergent collaboration without explicit message passing.
- **Context Flow**: The Conductor's working memory includes distilled context from all workspace orchestrators. Workspace orchestrators include context from their leaf agents.
- **Escalation Protocol**: If a leaf agent encounters an out-of-scope decision, it escalates with a structured request to the orchestrator. If the orchestrator cannot decide, it escalates to the Conductor.

**Anti-Patterns**:
- A single LLM managing the entire system (becomes a bottleneck, wastes model capacity on simple tasks).
- Sub-agents making decisions beyond their scope (leads to incoherent behavior).
- No escalation path (agents get stuck when they encounter decisions outside their scope).
- Excessive communication overhead between levels (adds latency).

---

## Principle 8: Memory as a Layered System

**Core Statement**: The LLM's memory is not a flat, homogeneous context window. It is organized into four distinct layers—episodic, semantic, procedural, and working—each with different retention policies and retrieval mechanisms.

**Rationale**:
The context window is the single biggest performance lever in LLM systems. Wasting it on redundant or irrelevant information is costly. By contrast, a layered memory system stores different information types optimally: episodic (what happened) in logs, semantic (what is known) in a knowledge base, procedural (how to do things) as routines, and working (what matters now) in the active context. This maximizes signal-to-noise ratio and keeps the context window efficient.

**Implementation Requirements**:
- **Episodic Memory (Event Logs)**:
  - Records all actions, state changes, and interactions in immutable logs.
  - Indexed by timestamp and searchable.
  - Retention: Indefinite (on disk), but only recent episodes are in the context window.
  - Access: The LLM can query "what happened in the last 30 minutes?" or "show me all errors since yesterday."
  - Implementation: Append-only logs with incremental compression.
- **Semantic Memory (Knowledge Base)**:
  - Stores facts, relationships, and domain knowledge extracted from work.
  - E.g., "User prefers 2-space indents", "The auth service uses JWT tokens", "File format: CSV with headers".
  - Indexed by topic and searchable.
  - Retention: Indefinite, but prioritized in context by relevance.
  - Access: The LLM queries at the start of a task to load relevant facts.
  - Implementation: Semantic search (embeddings) + keyword indexing.
- **Procedural Memory (Routines & Workflows)**:
  - Stores learned patterns: "When debugging, open terminal below editor", "Run tests before commit", "Always backup before refactoring".
  - Indexed by intent and trigger.
  - Retention: Indefinite, can be modified or deleted.
  - Access: The OS automatically suggests procedures based on context. The LLM can invoke them by name.
  - Implementation: Workflow templates with learned triggers.
- **Working Memory (Active Context)**:
  - The current context window contents: the current task, open files, recent state, active decisions.
  - Ephemeral—only relevant to the current session/turn.
  - Retention: Lost after session end (but saved episodically).
  - Access: Always in the context window, never requires a query.
  - Implementation: Managed by the context injection system.
- **Context Window Management**:
  - The system maintains a budget (e.g., 50k tokens). Working memory gets a baseline (e.g., 20k), and the rest is available for episode/semantic/procedural lookups.
  - The LLM is aware of its context budget and can request more context if needed.
  - Retrieval is automatic based on relevance scores and time decay.

**Anti-Patterns**:
- Flat context where all memory is merged (wastes capacity, loses structure).
- Episodic memory that is queried constantly (slow, adds latency).
- Procedural memory that is written but never used (learns without applying).
- No retention policy (context grows unbounded, becomes unusable).

---

## Principle 9: Workspace as Context

**Core Statement**: A workspace is not merely a window arrangement. It is a semantic context—a unified, coherent environment shaped around the user's stated goal. When the user says "I'm working on my thesis," the entire environment reshapes: the right documents are open, the right tools are visible, the right references are nearby.

**Rationale**:
Current desktop OSes treat workspaces as static spatial arrangements—"this monitor has these windows." But work is semantic, not spatial. A user might work on a thesis across multiple files, web research, notes, and a chat for discussion. These are scattered across the screen, and switching contexts means manually reopening everything. An LLM-native OS understands the semantics: the thesis is the context, and the system composes the workspace to serve it. Switching contexts is instant—the old arrangement is saved, the new one is loaded.

**Implementation Requirements**:
- **Workspace Definition**: A workspace is a bundle of:
  - Semantic goal (e.g., "writing thesis on climate policy").
  - Open documents and their state (scroll position, selections, edits).
  - Active tools and their configuration.
  - Visible panels and their layout.
  - Ambient context (references, research, chat history relevant to the goal).
  - User preferences for this goal (focus mode, notification settings, etc.).
- **Workspace Composition**: When a user states a goal (via natural language), the workspace orchestrator:
  - Queries semantic memory for related documents, routines, and procedures.
  - Opens relevant files and tools.
  - Arranges them in a layout optimized for the task.
  - Loads procedural patterns for this goal.
  - Sets workspace-specific preferences.
- **Workspace Switching**: Switching from one workspace to another is instant:
  - Save the current workspace state (openness, scroll position, edits).
  - Clear the screen.
  - Load the new workspace.
  - All previous state is preserved and resumable.
- **Workspace Persistence**: Workspaces are named and stored in the user model. The user can say "back to thesis" and resume instantly.
- **Workspace Templates**: Common workspaces (writing, coding, debugging, research) can be templated and reused.
- **Workspace Merging**: The user can temporarily merge workspaces if two goals overlap, then re-split them.

**Anti-Patterns**:
- Treating workspaces as mere window layouts (lacks semantic meaning).
- Manual workspace setup (should be automatic based on goal).
- Workspaces that don't persist across sessions.
- No awareness of goal semantics (arranges based on recency, not relevance).

---

## Principle 10: Drop Anything as Context

**Core Statement**: Any object—an image, file, URL, screenshot, clipboard contents—can be dropped anywhere on screen and instantly becomes usable context. No upload dialogs, no file pickers, no "attach file" buttons.

**Rationale**:
Attaching context is currently friction-heavy: open a file picker, navigate, select, confirm. This is fine for occasional use but becomes tedious for fluid work. An LLM-native OS treats context as frictionless: drag an image into a chat, drop a PDF into a document, paste a URL into a code block. The system immediately ingest and contextualizes the object. This makes context flow as naturally as conversation.

**Implementation Requirements**:
- **Universal Drop Zones**: Every surface that can accept context—a chat, a document, a code editor, a canvas—is a drop zone. Dropping is uniform across the OS.
- **Drag Detection**: The OS detects when an object is being dragged and highlights compatible drop zones.
- **Instant Ingestion**: When dropped, the OS immediately:
  - Identifies the object type (image, file, URL, text, etc.).
  - Extracts metadata (dimensions, filesize, MIME type, preview).
  - Makes it available to the LLM in the current context.
  - Renders or embeds it in the target surface.
- **Context Inference**: The OS infers what the user intends by dropping the object. E.g., dropping an image into a chat likely means "analyze this". Dropping a CSV into the editor likely means "edit this".
- **Temporary Storage**: Dropped objects are stored temporarily in the workspace context, accessible via reference even if the object is dismissed.
- **Clipboard Integration**: Anything in the clipboard can be referenced directly by the LLM ("analyze what's on my clipboard").

**Anti-Patterns**:
- File pickers or upload dialogs (slow, context-breaking).
- Limited drop zones (forces the user to find the right target).
- Dropped objects that don't persist in the workspace context.
- No preview or metadata inference (the user must manually describe what they dropped).

---

## Principle 11: Ambient Input

**Core Statement**: Multiple input modalities—text, voice, gesture, pen, eye gaze—are first-class citizens in the interface. Each has appropriate use cases; none is secondary to the others.

**Rationale**:
Text is efficient for deliberate commands, but voice is better for ambient commentary. Gestures ground references. Pen is natural for sketching and annotations. An LLM-native OS integrates all modalities into a unified input space, where the user can seamlessly code via text, describe changes via voice, point via gesture, and sketch on a canvas with a pen. The system handles the translation.

**Implementation Requirements**:
- **Ambient Voice Mode**:
  - The OS can listen passively to natural speech without requiring a "wake word" or push-to-talk.
  - Separates commands from ambient commentary (e.g., "hmm, I wonder if..." is not a command).
  - Integrates spoken context into the LLM's working memory.
  - Latency under 500ms from speech to interpretation.
- **Text Input Bar**:
  - A traditional text entry point for precise commands.
  - Supports markdown, code blocks, and inline references.
  - Autocomplete for actions and references.
  - Search integration (text bar can search documents, logs, etc.).
- **Gesture Input**:
  - Pointing (mouse, trackpad, eye gaze) to reference objects on screen.
  - Multi-touch gestures (pinch to zoom, swipe to navigate).
  - Gesture+speech pairing (e.g., "move this" while pointing).
- **Pen Input**:
  - Drawing on a canvas or directly on documents.
  - Stroke recognition for simple shapes, underlines, etc.
  - Annotation mode for marking up documents.
- **File & Media Drop**:
  - Dragging files, images, URLs into the input area or any surface.
  - Pasting from clipboard.
- **Multimodal Fusion**: When multiple modalities are used together (voice + gesture), the OS fuses them into a single intent. E.g., "move this" (voice) + pointer on window (gesture) = move the pointed window.

**Anti-Patterns**:
- Favoring one modality over others (limits accessibility and fluidity).
- Voice that requires explicit activation (adds friction).
- Gesture input that is unreliable or slow.
- Input modes that don't integrate well (forcing the user to choose).

---

## Principle 12: Reversibility as Default

**Core Statement**: Every action is reversible. The system maintains branching history, not linear undo. Users can "go back to before the refactor but keep the tests"—fork, not rewind.

**Rationale**:
Linear undo is restrictive. If you undo a refactor, you lose the tests you wrote after. Branching history preserves all work: you can rewind to any point, continue from there, and keep both branches. This is essential for exploratory work—try a refactor, don't like it, go back, try another. All branches are available, and you can later merge or compare them.

**Implementation Requirements**:
- **Immutable History Log**: Every action (file edit, workspace change, command execution) is recorded in an append-only, immutable log.
- **Branching Checkpoints**: At any point, the user can create a checkpoint and fork. The fork begins as a copy of the current state; changes in the fork don't affect the parent branch.
- **Branch Navigation**: The user can list all branches, switch between them, and see the state differences.
- **Merge Support**: If two branches diverge, the user can merge them with conflict resolution. The merge becomes a new checkpoint.
- **Diff Visualization**: The system can show diffs between branches, highlighting what changed.
- **Retention Policy**: Branches are retained indefinitely by default, but can be pruned manually or by policy (e.g., delete branches unused for 30 days).
- **Recursive Reversibility**: Even merge, branch creation, and deletion are reversible (undo goes back into history, fork allows recovery).

**Anti-Patterns**:
- Linear undo/redo (loses data when undoing and then acting differently).
- No history visualization (user loses track of what happened).
- Irreversible operations (dangerous; all operations should be rewindable).
- Excessive history that slows down the system (implement pruning and compression).

---

## Principle 13: Permission That Learns

**Core Statement**: Permission systems have three modes—supervised (ask every time), autonomous (never ask), and custom (learn). The system learns which actions the user always approves. Friction decreases organically over time.

**Rationale**:
Asking for permission on every action is safe but annoying. Never asking is fast but risky. A learning system is both safe and frictionless: the first time you perform an action, the OS asks. If you approve consistently, it learns and stops asking. If you revoke approval, it goes back to asking. This creates a smooth trust curve as the system learns the user's preferences.

**Implementation Requirements**:
- **Permission Matrix**: Track {action, context} → approval decision. E.g., "open_file in /home/user/Documents" is approved; "open_file in /etc" is denied.
- **Three Permission Modes**:
  - Supervised: Always ask (safe default).
  - Autonomous: Never ask (after learning or explicit override).
  - Custom: Ask based on learned patterns.
- **Learning Algorithm**:
  - If the user approves the same action in the same context N times (e.g., N=3), the system automatically moves to autonomous mode for that {action, context} pair.
  - If the user denies an action, the system respects that and doesn't auto-approve.
  - If the user modifies a permission decision (approve to deny or vice versa), the learning resets for that pair.
- **Visible Learning**: The user can inspect their learned permissions ("I always approve running tests") and manually override them.
- **Granularity Control**: The user can set learning granularity: learn at the action level, context level, or globally.
- **Override Capability**: The user can set any action to autonomous mode immediately ("never ask about this again") or back to supervised.
- **Audit Log**: All permission decisions (asked, approved, denied, learned) are logged and auditable.

**Anti-Patterns**:
- Always asking (safe but tedious).
- Never asking (risky, hard to debug).
- Learning too aggressively (approving risky actions without enough confirmation).
- No user visibility into learned permissions (user can't debug unexpected behavior).

---

## Principle 14: The LLM Plans Visibly

**Core Statement**: The Conductor maintains a living, visible plan. When executing multi-step tasks, the plan is rendered as structured task breakdowns with progress indicators, success/failure states, and reasoning trails. This builds trust and enables early intervention.

**Rationale**:
When the LLM acts in the background, the user is left guessing: What is it doing? Is it stuck? Will it mess up? By rendering the plan visibly—as a task breakdown with progress—the user can see the intention, understand the reasoning, and intervene if needed. This is especially critical for risky operations (refactoring code, deleting files, making API calls).

**Implementation Requirements**:
- **Plan Data Structure**: A task tree with:
  - Task name and description.
  - Preconditions (what must be true before this task).
  - Subtasks (if any).
  - Status (pending, in-progress, done, failed).
  - Reasoning (why this task is needed, any dependencies or assumptions).
  - Estimated duration.
  - Actual duration (filled in after completion).
  - Success/failure messages.
- **Plan Rendering**: The OS renders the plan in a panel or sidebar, showing:
  - The task tree hierarchically.
  - Current progress (which tasks are done, which are in-progress).
  - A timeline or progress bar.
  - Reasoning annotations (why each task is necessary).
  - Expandable details (click a task to see more info).
- **Real-Time Updates**: As the LLM executes the plan, the panel updates in real-time showing progress.
- **Intervention Points**: The user can pause at any point, ask questions ("why are you doing this?"), and either approve continuation or request a change.
- **Plan Modification**: If the LLM detects a need to deviate from the plan, it updates the plan visibly and re-asks for approval.
- **Rollback**: If a task fails or the user rejects the plan, the OS can roll back and show what would have happened.

**Anti-Patterns**:
- Hidden LLM reasoning (user cannot see what the system intends).
- Plans that are too detailed or too abstract (hard to understand).
- No progress indication (user doesn't know if the system is stuck).
- No intervention points (user cannot stop bad plans in progress).

---

## Principle 15: Speed is Non-Negotiable

**Core Statement**: Every action dispatch must complete under 5ms. Every UI render must complete under 16ms (60 fps). Every agent response must be initiated under 100ms. Latency budgets are hard architectural requirements, not aspirations.

**Rationale**:
LLM-native interaction only works if the system feels instant. A 500ms lag between a spoken command and a response is alienating. A 100ms lag in UI rendering creates a sense of sluggishness even if imperceptible consciously. Latency budgets enforce architectural discipline: if a feature cannot be delivered within the budget, it needs to be rearchitected, not squeezed through with apologies.

**Implementation Requirements**:
- **Action Dispatch Latency Budget (5ms)**:
  - From the moment the LLM emits an action intent to the moment it is dispatched to the handler.
  - Includes schema validation, routing, and any middleware.
  - Any operation exceeding 5ms must be offloaded to a background process.
- **UI Render Latency Budget (16ms)**:
  - From the moment a state change is detected to the moment it appears on screen.
  - Includes DOM diffing, layout, painting, and compositing.
  - 16ms allows for 60fps. Frame drops below this threshold are visible.
  - Requires efficient rendering (batching, virtual scrolling, canvas-based rendering for complex UIs).
- **Agent Response Initiation Budget (100ms)**:
  - From the moment a request is sent to an agent to the moment it begins executing (not finishing—just starting).
  - This includes waking up the agent, loading context, and starting to process.
  - Does not include the agent's think time (which can be longer).
- **Measurement & Monitoring**:
  - Instrument all critical paths to measure latency.
  - Alert if any path exceeds its budget.
  - Build a latency dashboard showing percentile distributions (p50, p95, p99).
  - Profile and optimize hot paths.
- **Graceful Degradation**: If a latency budget is at risk, degrade gracefully:
  - Show a loading indicator rather than hanging.
  - Cache results for common queries.
  - Use approximate results instead of exact ones (e.g., show first 100 results while loading the rest).

**Anti-Patterns**:
- Synchronous blocking operations (agent calls, file I/O, network requests).
- Full re-renders when only a small part of the UI changed.
- Unoptimized event handlers (e.g., recalculating entire layout on every keystroke).
- Latency budgets that are ignored or exceeded repeatedly.

---

## Principle 16: Collaboration is Native

**Core Statement**: Multi-user workspace sharing is not an add-on feature. It is a core architectural capability. Multiple conductors and agents can coexist in the same workspace, sharing state, context, and action history.

**Rationale**:
Solo work is the exception, not the norm. People collaborate on nearly everything—code, documents, designs. Current LLM systems treat collaboration as a retrofit (upload to a shared cloud service, hope the LLMs don't interfere). An LLM-native OS makes collaboration architectural: shared workspace state, conflict resolution, visibility into what each agent is doing, and low-latency synchronization.

**Implementation Requirements**:
- **Shared Workspace State**: A workspace can be open in multiple conductors (different LLM instances, potentially on different machines). They share:
  - Document state (edits, selections, cursors visible to all).
  - Action history (all actions are broadcast to all participants).
  - Workspace configuration (layout, open files, tool state).
- **Operational Transformation (OT) or CRDT**: Implement a conflict-resolution algorithm so that simultaneous edits are merged intelligently without manual intervention.
- **Presence Awareness**: Each participant can see:
  - Who else is in the workspace.
  - What they're editing (cursor position, selection).
  - What they're doing (current action, plan, reasoning).
- **Permission Scoping**: The user can grant different permissions to different collaborators:
  - View-only (read the workspace, cannot edit).
  - Edit (can edit documents and create actions).
  - Admin (can change workspace configuration, invite users, manage permissions).
- **Synchronization**: Changes are broadcast in real-time (under 100ms latency) so all participants are in sync.
- **Conflict Alerts**: If two participants make conflicting changes, the system alerts both and provides tools to resolve.
- **Audit Trail**: All edits are attributed to their author and timestamped, enabling rollback to any point.

**Anti-Patterns**:
- Collaboration that requires manual syncing or merging (error-prone).
- Multiple conductors without coordination (leads to conflicting actions).
- Presence that is not visible (collaborators don't know what others are doing).
- No permission scoping (user cannot safely invite someone for limited access).

---

## Principle 17: The OS Knows the User

**Core Statement**: The system maintains a detailed user model capturing cognitive style, work patterns, and preferences. The OS adapts its presentation, interruption frequency, workspace structure, and learned actions based on this model. The user can inspect and edit their own model.

**Rationale**:
Generic interfaces work for no one well. Some users want constant proactive help; others want to minimize interruptions. Some prefer visual information; others prefer text. Some work at breakneck speed; others deliberate carefully. A user model captures these styles and allows the system to adapt. The user should always be able to inspect and correct their model—it's part of their external memory and identity.

**Implementation Requirements**:
- **User Model Schema**:
  - Cognitive style (visual, linguistic, kinesthetic preferences).
  - Work speed (fast, deliberate).
  - Interruption preference (proactive, passive, none).
  - Learned actions and permissions (from Principle 13).
  - Preferred tools for each task type.
  - Workspace templates and default layouts.
  - Time zone and notification preferences.
  - Context window budget preferences (small for speed, large for completeness).
  - Error tolerance (strict, permissive).
- **Inference**: The system infers user preferences by observing:
  - Which tools are opened and used frequently.
  - How much context the user provides (verbose vs. terse).
  - Reaction to suggestions (accept or reject).
  - Time spent on different tasks.
  - Undo/redo patterns (indicating preference for reversibility).
- **Model Inspection UI**: A dedicated interface showing the user's model in human-readable form:
  - "I think you prefer visual presentations" (can edit).
  - "I've learned that you approve 'run_tests' 95% of the time" (can reset).
  - "You typically work on thesis from 9-12 and code from 1-5" (can adjust).
- **Adaptation**: Based on the model, the OS adapts:
  - UI presentation (visual vs. text-heavy).
  - Proactivity (suggest actions frequently or rarely).
  - Context window allocation (more for thoughtful work, less for coding).
  - Default workspaces (open tools you typically use).
- **Privacy**: The user model is stored locally and not shared without consent.

**Anti-Patterns**:
- Generic interface that treats all users the same (wastes context, adds friction).
- User model that is learned but never visible (user can't debug or correct it).
- Adaptation that surprises or confuses (should be legible to the user).
- Model that is immutable (user cannot override system inferences).

---

## Principle 18: Learn by Watching

**Core Statement**: The OS observes manual user actions and proposes procedural patterns. "I noticed you always move the terminal below the editor when debugging. Want me to do that automatically?"

**Rationale**:
Users invent procedures organically—sequences they repeat frequently. Current systems ignore these patterns. An LLM-native OS watches, identifies repeating sequences, and offers to automate them. This has two benefits: the system learns useful workflows from the user, and the user saves time on routine actions.

**Implementation Requirements**:
- **Action Replay & Analysis**: The episodic memory log is analyzed for repeated sequences:
  - Identify actions that occur in the same order multiple times.
  - Extract generalizable patterns (e.g., "open terminal", "resize window", "run tests").
  - Calculate frequency and consistency.
- **Proposal System**: When a pattern is detected (e.g., same 5-action sequence repeated 3+ times), the system proposes:
  - "I've noticed you always [sequence]. Would you like me to do this automatically when [trigger]?"
  - E.g., "Would you like me to open the terminal below the editor when you start debugging?"
- **Trigger Inference**: The system infers what should trigger the procedure:
  - Time-based: "Every morning at 9 AM."
  - Context-based: "When you open a file with 'bug' in the name."
  - Action-based: "When you run the test suite."
  - Manual: "When you ask me to."
- **Automation**: If the user approves, the system creates a new action (procedural action) that executes the sequence.
- **Feedback Loop**: If the user later modifies the automated sequence, the system learns the correction and updates the procedure.
- **Procedure Library**: All learned procedures are stored in semantic memory and available across sessions.

**Anti-Patterns**:
- Watching user actions but never learning (collected data without benefit).
- Proposing automations without understanding intent (noisy suggestions).
- Automating without user approval (breaks trust).
- Procedures that become stale (user changes them but the automation doesn't adapt).

---

## Principle 19: Cross-Workspace Intelligence

**Core Statement**: The Conductor maintains semantic understanding across all workspaces. It detects connections between projects, surfaces relevant work, and highlights insights. "The system design you're prepping for could benefit from the portfolio project you finished last month."

**Rationale**:
Users juggle multiple projects simultaneously. Connections between them are often invisible. The Conductor has a global view—it sees all workspaces. By maintaining semantic understanding, it can detect when work in one workspace would help in another, surface relevant files or patterns, and help the user connect dots. This adds significant value and reduces the cognitive load of managing multiple contexts.

**Implementation Requirements**:
- **Semantic Indexing**: Every workspace, document, and note is indexed semantically (embeddings, topics, entities). This enables similarity search.
- **Cross-Workspace Search**: The user can search across all workspaces for:
  - Similar documents or projects.
  - Specific concepts or techniques.
  - Related people or references.
- **Automatic Connection Detection**: The Conductor runs periodic analysis:
  - Detect when two projects share concepts, technologies, or goals.
  - Identify documents that would be useful in a different workspace.
  - Highlight patterns that appear across workspaces.
- **Suggestion System**: When detected, surface suggestions:
  - In a notifications panel: "Project X uses the same API as Project Y. Might be worth comparing approaches."
  - In context: When the user is working on a problem, suggest "You solved a similar problem in Project Z."
  - Proactively: "Your portfolio project would strengthen the example for your thesis."
- **Workspace Linking**: The user can explicitly link workspaces, grouping related projects (e.g., "all thesis research", "all portfolio projects").
- **Historical Analysis**: The Conductor maintains statistics across workspaces: most common tools, typical duration, typical outcomes. This helps with planning and estimation for new projects.

**Anti-Patterns**:
- Siloed workspaces that cannot see each other (loses cross-project insights).
- No semantic understanding (searches are only keyword-based).
- Suggestions that are irrelevant or off-topic (erodes trust in the system).
- No way to link workspaces explicitly (requires the system to guess connections).

---

## Principle 20: Warm, Not Clinical

**Core Statement**: The visual and sonic aesthetic is intentionally warm and human-centered. The color palette uses warm sand/clay tones, amber/gold accents, and muted teal for system indicators. The experience feels like a well-worn wooden desk with good lighting, not a clinical lab or corporate spaceship.

**Rationale**:
Most software feels cold, industrial, and corporate. An LLM-native OS—designed around collaborative, intimate human-AI interaction—should feel different. The aesthetics should signal: "This is a tool for thinking, collaborating, and creating. It's on your side. It's warm, trustworthy, not corporate." This is not frivolous—aesthetics shape how users perceive the system's intent and their own comfort.

**Implementation Requirements**:
- **Color Palette**:
  - Primary: Warm sand/clay tones (#D4C4B8, #E0D4C3, #C9B8A8).
  - Accent: Warm amber/gold (#D4A574, #C9935A).
  - Secondary: Muted teal for system affordances (#6B9A8F, #7BA89D).
  - Text: Dark brown/charcoal (#3A3A3A), never black.
  - Background: Off-white or warm cream (#F5F1ED).
  - Danger/alert: Warm red (#B85C4C), not bright red.
  - Success: Warm green (#7A9E7A), not bright.
- **Typography**:
  - Serif body text for reading (e.g., Charter, Georgia) for warmth.
  - Sanserif for UI labels and headers (e.g., Inter, Relative).
  - Monospace for code (e.g., JetBrains Mono, Courier Prime) with warm background highlights.
- **Visual Language**:
  - Rounded corners on cards and panels (welcoming, not sharp).
  - Soft shadows with warm tints (instead of harsh black shadows).
  - Generous whitespace (uncluttered, calm).
  - Hand-drawn or natural elements where possible (e.g., sketchy borders on annotations, natural textures in backgrounds).
  - Icons use simple line work, not heavy fills.
- **Animation**:
  - Subtle, eased transitions (ease-in-out, 200-400ms).
  - No jarring or rapid changes.
  - Animation that feels organic (bounce, elasticity) rather than mechanical.
- **Audio Design** (if applicable):
  - Warm, organic sounds (wooden tones, resonance).
  - Low frequency for notifications (not shrill).
  - Spatial audio to indicate where attention is (left ear for input, right for output).
- **Density**:
  - Generous padding and margins (air, not crowded).
  - Large enough fonts for comfortable reading (18+ for body).
  - Plenty of whitespace between sections.

**Anti-Patterns**:
- Clinical color schemes (gray, white, bright blue—feels corporate).
- Small, cramped typography (feels rushed).
- Heavy, sharp visual elements (feels aggressive).
- Rapid, jarring animations (feels frantic).
- Dark mode as the default (feels cold; warm dark mode acceptable but not preferred).
- Maximize information density (sacrifices readability and calm).

---

## Implementation Checkpoints

For every design or implementation decision, validate against these principles:

1. **Does this push state or require the LLM to pull?** (Principle 1)
2. **Is every object referenceable?** (Principle 2)
3. **Does the UI complexity match the task?** (Principle 3)
4. **Are actions structured and typed?** (Principle 4)
5. **Can new capabilities be registered at runtime?** (Principle 5)
6. **Are we composing primitives, not generating HTML?** (Principle 6)
7. **Is agency hierarchical and clear?** (Principle 7)
8. **Is memory organized into distinct layers?** (Principle 8)
9. **Is the workspace semantically coherent?** (Principle 9)
10. **Can context be dropped without friction?** (Principle 10)
11. **Are all input modalities first-class?** (Principle 11)
12. **Is everything reversible?** (Principle 12)
13. **Does permission learning work?** (Principle 13)
14. **Is the plan visible?** (Principle 14)
15. **Are latency budgets met?** (Principle 15)
16. **Does collaboration work seamlessly?** (Principle 16)
17. **Is there a user model?** (Principle 17)
18. **Are patterns learned from observation?** (Principle 18)
19. **Is cross-workspace intelligence enabled?** (Principle 19)
20. **Is the aesthetic warm and human-centered?** (Principle 20)

---

## Relationship to Other Documents

- **Document 01**: Architectural Vision—establishes the "why"
- **Document 03 onwards**: Implementation specs, reference architectures, module designs—all must align with these principles
- These principles are the constitution; all downstream documents are legislation within that constitution

---

## Version History

- v1.0 (2026-03-23): Initial formalization of 20 principles from design conversation.

---

## Approval & Sign-Off

This document is the foundational specification for the LLM-Native OS project. All implementation work is contingent on alignment with these principles.

Document Owner: Architecture Team
Last Reviewed: 2026-03-23
Next Review: Post-implementation (Prototype 1.0)
