# Document 12: Interaction Patterns Catalog
## LLM-Native Operating System

**Status:** Design Document
**Version:** 1.0
**Purpose:** Comprehensive catalog of every user interaction pattern with the OS, from triggering through completion, with implementation requirements for Claude Code.

---

## Pattern 1: TEXT COMMAND

**Name:** Text Command Input
**Trigger:** User types in the text input bar (bottom of screen) and presses Enter
**Behavior:**
- Text is tokenized and parsed into intent + entities
- Conductor agent receives message with full context: current workspace, active windows, task history, user profile
- Routing logic determines: direct execution (simple) vs. agent delegation vs. orchestration
- Result streams back to user with appropriate visualization

**Edge Cases:**
- Ambiguous commands ("add this") → system clarifies with inline suggestions
- Multi-window context needed → conductor surfaces relevant windows before execution
- Partial commands with implied context ("use that color") → spatial reference map provides resolution
- Command contradicts ongoing tasks → permission confirmation (if supervised mode)

**Visual/UX Description:**
- Input bar has clear visual state: empty (dim), focused (bright outline), processing (spinner), result (highlight)
- As user types, predictive suggestions appear below (context-aware, showing recent objects/functions/workspaces)
- Command executes on Enter; visual feedback shows which agent received it (small badge)
- Results surface in relevant window; if new window needed, it opens with animation

**Implementation Requirements:**
```
- Lexer/parser: Handle natural language command parsing
- Intent classifier: Map to conductor, agent, or direct execution
- Context aggregator: Pull current workspace state, window contents, task history
- Routing decision engine: Choose execution path based on complexity
- Result formatter: Render output appropriately (text, UI update, new window)
- Keyboard handling: Capture Enter key, manage input state lifecycle
- Suggestion engine: Real-time prediction based on context and frequency
- Error handler: Graceful degradation for unparseable input
```

---

## Pattern 2: VOICE COMMAND (SWIPE)

**Name:** Voice Input via Swipe Activation
**Trigger:** User swipes right on the text input bar (or long-press voice icon)
**Behavior:**
- Text input mode switches to voice input mode
- Microphone activates and records audio stream
- Audio is streamed to speech-to-text service with real-time transcription display
- User can see transcription building in real-time; can interrupt with gesture or voice
- On silence detection (>2 seconds), command auto-executes
- If user says "cancel" or taps elsewhere, reverts to text mode without executing

**Edge Cases:**
- Multiple speakers in environment → system filters for primary user (voice signature matching)
- Loud background noise → quality indicator shown; user can clarify or repeat
- Command spans multiple sentences → system batches until natural pause
- Partial command received → user can continue or explicitly execute
- Audio quality too poor → prompt user to repeat or switch to text

**Visual/UX Description:**
- Swipe reveals animated waveform visualization (bouncing bars matching audio levels)
- Real-time transcription appears in text input area (not final, shown in lighter gray)
- Microphone icon pulses to show active recording
- When command recognized as complete, transcription hardens (black text) and auto-executes
- User can cancel by swiping left or saying "cancel"

**Implementation Requirements:**
```
- Gesture recognizer: Detect right-swipe on input bar
- Audio capture API: Access microphone with permission handling
- Real-time STT service: Stream audio to speech-to-text (e.g., Whisper, proprietary)
- Transcription display: Live update of partial results
- Silence detector: Configurable silence threshold for auto-execution
- Voice signature matching: Identify primary speaker if multiple audio sources
- Fallback handler: Revert to text mode on audio failure
- State machine: Manage transition between text and voice modes
- Interrupt handling: Allow cancellation at any point
```

---

## Pattern 3: AMBIENT VOICE

**Name:** Always-Listening Ambient Command Parsing
**Trigger:** Ambient listening is enabled (user toggles in settings) and OS is active
**Behavior:**
- Microphone is always recording, but audio is processed locally (on-device) for privacy
- On-device ML model detects when user is likely issuing a command vs. ambient conversation
- Commands are extracted from natural conversation ("I think this function should be recursive" while coding)
- Extracted command is sent to relevant agent (code editor agent in this case) as implicit instruction
- Agent executes or requests confirmation based on autonomous vs. supervised mode
- Non-command speech is discarded locally (never sent to server)

**Edge Cases:**
- Similar phrasing both as casual thought and explicit command → system learns user patterns over time
- Multiple valid agents could handle command → conductor routes to most recently active agent
- User speaking to someone else → system filters out other voice signatures
- Private/sensitive speech accidentally captured → ultra-transparent logging (user can audit)
- Command seems destructive → always escalates to permission confirmation even in autonomous mode

**Visual/UX Description:**
- When ambient listening is enabled, a small persistent indicator appears (top-right, animated when listening)
- When command is detected, indicator pulses and shows a brief tooltip with extracted command
- Command appears in task graph with "ambient" tag and timestamp
- If confirmation needed, overlay appears with extracted command and "Approve / Deny / Edit" buttons
- User can tap indicator to see recent ambient commands (with option to retract)

**Implementation Requirements:**
```
- On-device wake-word detection: Lightweight model for "system is listening for commands"
- Local audio processing: Streaming VAD (voice activity detection)
- Local command extraction: Small model identifying command patterns (privacy-first)
- Voice signature database: Learn and identify user vs. others in environment
- Ambient confidence scoring: Only surface high-confidence extractions
- Agent routing: Send implicit instructions to appropriate agent via message queue
- Audit logging: Every ambient capture logged with timestamp, extracted command, user action
- Privacy toggle: User can disable entirely or restrict to specific contexts
- Batch processing: Process audio in small windows (100-200ms) to minimize latency
```

---

## Pattern 4: DROP OBJECT AS CONTEXT

**Name:** Drag-and-Drop Objects into Workspace
**Trigger:** User drags any object (file, image, URL, screenshot, text selection, clipboard content) onto screen and drops it
**Behavior:**
- Drop location is registered (which window, which coordinates)
- Object is immediately analyzed: type detection (image, code, document, link, etc.)
- Object is added to active workspace's context store
- All active agents receive notification with object metadata and content
- Depending on object type and active window, one or more agents respond:
  - Image dropped on code editor → vision agent analyzes and suggests comments
  - URL dropped on research window → page fetcher agent immediately loads and summarizes
  - CSV dropped on analysis window → data agent parses and offers visualizations
- No file picker, no upload dialog, no confirmation—instant context

**Edge Cases:**
- Large file dropped → background processing with progress indicator
- Sensitive file detected → warning overlay (PII, credentials, etc.)
- Same object dropped multiple times → deduplicated in context store
- Drop on empty screen → system opens appropriate workspace based on object type
- Drop on minimized window → system prompts if user wants to restore first

**Visual/UX Description:**
- During drag, visual feedback shows drop zones (highlighted windows, "drop here" regions)
- Drop location shows brief animation (flash/ripple)
- Object appears as a small card/badge in the workspace, linked to relevant context
- If multi-agent response occurs, small notifications cascade showing which agents are responding
- User can click the object card to see full details and trace its impact

**Implementation Requirements:**
```
- Drag-and-drop event handler: Capture dragover, drop, dragend events
- Drop location resolver: Map coordinates to window/region
- Content type detector: Identify file/image/URL/text/clipboard content
- Content parser: Extract data based on type (image OCR, URL fetcher, CSV parser, etc.)
- Object storage: Add to context store with metadata (type, source, timestamp, drop location)
- Agent notifier: Broadcast to all active agents with object metadata
- Sensitive content detector: Scan for PII/credentials/private data
- Large file handler: Stream processing for big objects, show progress
- Deduplication logic: Prevent duplicate context entries
- Visualization: Render object cards with type icons and metadata
```

---

## Pattern 5: POINT AND REFERENCE

**Name:** Spatial Reference Resolution via Pointing
**Trigger:** User points (or looks, if eye-tracking enabled) at a window/paragraph/line of code/chart while speaking or typing a command
**Behavior:**
- OS maintains continuous spatial reference map: window positions, text boundaries, UI element coordinates
- When user points, gesture recognizer detects point location and timestamp
- OS resolves what's at that location: window ID, element ID, character offset in text, chart data point, etc.
- In subsequent commands, when user references "this" or "that" or "this line" or "that variable", the spatial reference is resolved automatically
- Command executes with proper context binding
- If reference is ambiguous (multiple objects at point), system surfaces disambiguation UI

**Edge Cases:**
- User points at empty space → clarify which window/region was intended
- Pointing at scrolled content → resolver accounts for scroll offset
- Multiple monitors/windows overlapping → use z-order and overlap detection to resolve correctly
- Point gesture ambiguous (drag vs. point) → use dwell time and velocity to disambiguate
- User references "this" without recent point → use most recently active window/selection

**Visual/UX Description:**
- When user points, a small crosshair/highlight appears at the location
- In subsequent commands, "this" and "that" are visually highlighted/annotated when mentioned
- Spatial reference appears as a small badge in the command ("→ line 42 of main.py" shown inline)
- Resolved references are tracked in task graph with visual arrows showing connections
- User can tap a reference badge to see what was resolved (for debugging commands)

**Implementation Requirements:**
```
- Gesture recognizer: Detect pointing (mouse position, touch, eye-gaze)
- Spatial coordinate mapper: Maintain live map of window/element positions
- Z-order tracker: Track window layering for overlap resolution
- Text boundary calculator: Map character offsets to screen coordinates
- Chart element resolver: Identify data points in visualizations (bounding box logic)
- Natural language resolver: Parse pronouns ("this", "that", "the code above") with spatial context
- Reference caching: Store recent points with timestamps for contextual resolution
- Ambiguity detector: Identify when resolution is non-unique
- Visualization: Highlight/annotate resolved references in UI
- Fallback logic: Revert to recent context if point is not provided
```

---

## Pattern 6: WORKSPACE SWITCH

**Name:** Context-Aware Workspace Switching
**Trigger:** User says "switch to job prep" or "show me the portfolio analysis" or similar workspace reference
**Behavior:**
- Conductor parses workspace name/goal from command
- Conductor queries workspace registry (all saved workspaces with their associated agents, windows, tasks)
- If workspace exists, conductor initiates transition:
  - Current windows minimize and store their state
  - New workspace windows appear with animation
  - Agents are reconfigured for new context (agent state machine transitions)
  - Task graph updates to show new active tasks
- If workspace doesn't exist, conductor offers to create it:
  - User confirms the goal ("job interview prep")
  - Conductor composes initial layout: which agents to activate, which windows to create, recommended context
  - New workspace materializes
- Workspace switching includes state preservation: undo stack, open tasks, agent memory carry over

**Edge Cases:**
- Workspace name ambiguous ("prep" could be job prep, presentation prep) → clarify
- Workspace context partially overlaps (both involve code) → offer merge or separate
- Switching away from incomplete task → confirm discard or save state
- New workspace needs agents not yet loaded → lazy-load with progress indicator
- User switches back and forth frequently → maintain hot cache of last 3 workspaces

**Visual/UX Description:**
- Entire screen transitions with smooth animation (fade/slide effect)
- Old windows minimize into a single "archived" card (top-left corner)
- New workspace windows appear in composition order with staggered entrance animation
- Workspace name appears prominently (top center, breadcrumb style)
- Task panel on right shows new task graph for this workspace
- Previous workspace accessible via "Back" button or workspace history menu

**Implementation Requirements:**
```
- Workspace registry: Store workspace metadata (name, goal, agents, windows, state snapshots)
- Workspace state serializer: Serialize/deserialize window state, agent context, task history
- Conductor composition engine: Given workspace goal, determine initial agent/window layout
- Window manager: Batch minimize current windows, batch create new windows
- Agent state machine: Manage agent transitions between workspaces
- Task graph updater: Replace task graph for new workspace
- Hot cache: Keep last N workspaces in memory for fast switching
- Undo stack transfer: Preserve undo history across workspace boundaries
- Animation orchestrator: Coordinate smooth transition animations
- State preservation: Store workspace state to persistent storage
```

---

## Pattern 7: WINDOW MINIMIZE

**Name:** Window Minimize to Card
**Trigger:** User clicks minimize button (top-right of window) or uses keyboard shortcut
**Behavior:**
- Window state is captured and stored (scroll position, selection, agent state, etc.)
- Window contracts and animates to a minimized card
- Card appears in minimized window tray (typically bottom of screen or designated sidebar)
- Card shows window title, thumbnail preview of content, and optional badge (e.g., "task in progress")
- Clicking card restores window to previous state
- Dragging card allows reordering within tray
- Right-click card offers options: Close, Restore, Pin to Tray, Duplicate

**Edge Cases:**
- Minimizing window with unsaved changes → show indicator on card
- Minimizing ongoing agent task → agent continues in background; task badge updates
- Minimizing while agent is waiting for user input → show "waiting" indicator on card
- Window contains sensitive data → option to blur thumbnail
- Tray is full → use horizontal scroll or grouped view

**Visual/UX Description:**
- Window animates to small card with spring physics (bouncy feel)
- Card shows window title (bold), small preview thumbnail, and relevant metadata
- Badge on card shows agent status (running/waiting/complete)
- Hover over card shows expanded preview and restore button
- Drag card to reorder; drag off tray to close
- When restored, window animates back to previous position/size with smooth transition

**Implementation Requirements:**
```
- Window state capture: Serialize window content, scroll position, agent state
- Animation engine: Minimize/restore transitions with easing
- Minimized window tray: Horizontal scrollable container for cards
- Card renderer: Generate thumbnail preview of window content
- Card metadata: Display title, status badge, preview
- Restore logic: Fully reconstruct window state from serialized data
- Drag-and-drop: Support reordering and closure via drag-off
- Keyboard shortcut: Alt+H or similar to minimize focused window
- Unsaved indicator: Visual mark when window has unsaved changes
- Thumbnail caching: Generate and cache previews for fast rendering
```

---

## Pattern 8: WINDOW RESIZE

**Name:** Standard Window Resize Gestures
**Trigger:** User grabs window edge/corner and drags, or uses snap gestures (drag to screen edge)
**Behavior:**
- User can resize window by standard methods:
  - Edge drag: grab any edge to resize in that direction
  - Corner drag: grab corner to resize both dimensions
  - Snap left/right: drag window to left/right screen edge for half-width snapping
  - Snap corners: drag to screen corners for quarter-screen snapping
  - Double-click title bar: toggle maximize/restore
- Content reflows responsive to new window size
- Agent content updates to fit new constraints (e.g., text editor re-wraps, chart re-renders)
- Minimum/maximum size constraints enforced per window type
- Resize state preserved in workspace state

**Edge Cases:**
- Resize below minimum size → snap to minimum with visual feedback
- Resize while agent is rendering → background update continues, content updates on completion
- Snap gesture doesn't align perfectly → auto-snap with animation
- Multi-monitor setup → snap gestures account for monitor boundaries
- Window contains scrollable content → ensure scroll region is accessible after resize

**Visual/UX Description:**
- Cursor changes to resize indicator (arrows) when hovering over window edges/corners
- Drag shows a ghost outline of new size (helps user visualize)
- Snap targets appear as highlighted regions when dragging toward screen edges
- On snap, window animates to target position/size with smooth transition
- Content inside reflows with responsive animations (no jarring layout shift)

**Implementation Requirements:**
```
- Mouse event handler: Track edge/corner hover and drag
- Snap target detector: Calculate snap regions based on screen dimensions
- Ghost outline renderer: Show preview during drag
- Size constraint enforcer: Enforce min/max sizes per window type
- Responsive reflow: Trigger content re-layout on size change
- Animation orchestrator: Smooth transition to snapped size
- Double-click handler: Toggle maximize/restore on title bar double-click
- Scroll adjustment: Preserve scroll position or adjust after resize
- Multi-monitor support: Account for display boundaries and gaps
- State persistence: Save resized window dimensions to workspace state
```

---

## Pattern 9: MAGNETIC ATTACHMENT

**Name:** Magnetic Window Grouping
**Trigger:** User drags one window near another; when proximity threshold is reached, windows snap together
**Behavior:**
- Windows can be dragged freely on screen
- When two windows get within magnetic distance (e.g., 20-30 pixels), both windows snap together
- Snapped windows move as a unit (group can be dragged as one)
- Visually, grouped windows show a subtle connection (border glow, connector line, or grouped frame)
- Windows can be separated again by dragging one beyond the magnetic distance threshold
- Grouping is non-rigid: no grid enforcement, windows can overlap slightly if user drags within group
- Group state is preserved in workspace (which windows are grouped, their relative positions)
- Right-click on group shows options: Ungroup, Lock Group, Save as Layout

**Edge Cases:**
- Dragging window across multiple potential magnetic targets → snap to closest
- Window too large to snap → still shows connection but doesn't restrict movement
- Removing window from group → other windows reposition if they were only connected via the removed window
- Magnetic attachment in single-monitor vs. multi-monitor → snap only within same monitor
- User disables magnetic behavior → windows can still be grouped manually via right-click

**Visual/UX Description:**
- As window approaches another, a subtle glow/highlight appears on both
- When snapped, a thin connector line appears between windows (or matching border color)
- Grouped windows show "grouped" badge in title bar
- Moving any grouped window shows a ghost outline of the entire group
- Separating a window shows a brief separation animation
- Grouped layout can be saved as a "magnetic layout" template

**Implementation Requirements:**
```
- Drag event handler: Track window position changes
- Distance calculator: Compute distance between window edges
- Magnetic threshold: Configurable snap distance (default 20-30px)
- Snap algorithm: Calculate snap position (align edges, group center, etc.)
- Group data structure: Track which windows are grouped together
- Visual connector: Render connection indicators between grouped windows
- Unified drag: Move all grouped windows as unit when any one is dragged
- Separation logic: Ungroup when window dragged beyond threshold
- Layout saver: Serialize grouped layout as reusable template
- Persistence: Store group relationships in workspace state
- Multi-monitor: Ensure snapping respects monitor boundaries
```

---

## Pattern 10: TASK PANEL OPEN

**Name:** Live Task Graph and Agent Context Panel
**Trigger:** User pulls out right-side panel (swipe in from right edge, or click Task Panel button) or says "show me my tasks"
**Behavior:**
- Right-side panel slides in from screen edge, revealing live DAG of all active tasks
- Task graph shows:
  - Node for each task (hierarchical: workspace-level → agent tasks → subtasks)
  - Edge arrows showing dependencies and data flow
  - Node color/icon indicates task status: pending (gray), in-progress (blue/spinning), blocked (red), complete (green)
  - Estimated time to completion for in-progress tasks
  - Agent responsible for each task (with avatar/name)
  - Blocking relationships: if task A blocks task B, clear visual indication
- User can interact with graph:
  - Click task to view full details, agent reasoning, and history
  - Drag task to reorder priority (if non-dependent)
  - Hover over task to see tooltips with context
  - Toggle visibility of completed tasks
- Task panel updates in real-time as agents work

**Edge Cases:**
- Very large task graph (100+ tasks) → use clustering/zoom to avoid overwhelming display
- Task dependencies form cycles (shouldn't happen but) → alert user to circular dependency
- Task blocked on user input → highlight in red and show input request inline
- Task completed but user doesn't see result → option to "replay" task to surface output
- Multiple agents working simultaneously → show concurrent execution clearly

**Visual/UX Description:**
- Panel slides in from right, pushes main workspace left (or overlays with semi-transparent background)
- Task nodes are colored circles/boxes with status icons (spinner for in-progress, checkmark for done, X for failed)
- Arrows between nodes show dependencies (solid for hard dependency, dashed for soft)
- Agent avatar or initials appear in node corner
- Task name and current progress shown inside node or on hover
- Scrollable/zoomable canvas for large task graphs
- Search/filter bar at top allows finding specific tasks
- "Collapse completed" toggle hides finished tasks for clarity

**Implementation Requirements:**
```
- Task DAG builder: Construct graph from agent task definitions and dependencies
- Real-time updater: Listen for task status changes and update graph live
- Graph renderer: Render DAG with force-directed or hierarchical layout
- Node/edge data structure: Maintain task metadata and relationships
- Interaction handlers: Click, drag, hover, search, filter
- Status indicator: Display task status with color and icon
- Blocking detector: Identify tasks blocked on dependencies or user input
- Concurrent visualization: Show multiple agents working simultaneously
- Large graph handling: Clustering and zoom for 100+ tasks
- Tooltip/detail view: Expand task information on click
- Persistence: Save task graph state (collapsed/expanded, search state)
```

---

## Pattern 11: OVERRIDE AGENT

**Name:** User Intervention and Agent Behavior Override
**Trigger:** User says "actually, do it this way instead" or "cancel that" mid-task, or clicks "Override" button on agent action
**Behavior:**
- Agent is executing a task (visible in task graph and/or window)
- User intervenes with a countermand or alternate instruction
- Override is immediately parsed and sent to the agent
- If agent has already started irreversible action, system shows confirmation dialog
- Agent pauses and receives new instruction
- Agent's task plan is updated to reflect override; old plan is archived (visible in history)
- If override changes approach significantly, task timeline/dependencies may shift
- User can see agent's reasoning for original plan vs. new plan (for learning)

**Edge Cases:**
- Override conflicts with task dependencies → system warns that override may break other tasks
- Agent was mid-execution of irreversible action (file deleted, message sent) → show what was lost
- Override contradicts established permission constraints → warn user
- Multiple agents working on related tasks → override may cascade to dependent tasks
- Override changes task complexity significantly → update estimated time to completion

**Visual/UX Description:**
- User's override appears as a speech bubble or text input in the task node
- Original plan and overridden plan both shown (with strikethrough or dimming for old plan)
- Agent acknowledges override with a status message ("Understood, switching approach")
- Task graph updates to show new dependencies or timing
- Visual indicator shows which parts of original plan are discarded vs. continued
- User can click a "Why?" button to see agent's reasoning for original plan

**Implementation Requirements:**
```
- Command parser: Parse override as new instruction
- Agent message queue: Send override to appropriate agent
- Irreversible action detector: Warn before discarding completed actions
- Task plan updater: Replace task plan with new plan based on override
- Plan diffing: Highlight differences between original and overridden plan
- Dependency analyzer: Check if override breaks dependent tasks
- Archive logic: Store original plan for history/audit
- Reasoning explainer: Surface agent's reasoning for both plans
- State recovery: Handle partial rollback if needed
- Real-time visualization: Update task graph to reflect new plan
- Permission check: Verify override doesn't violate constraints
```

---

## Pattern 12: REWIND/BRANCHING UNDO

**Name:** Branching Version Control Undo with Selective Preservation
**Trigger:** User says "go back to before you refactored that function" or "undo last 3 steps", or manually navigates undo tree
**Behavior:**
- Instead of linear undo, OS maintains a branching undo tree (similar to Git history)
- Each action creates a node in the tree; undo creates a branch
- User can travel back to any previous state
- When rewinding, user can selectively preserve certain later changes:
  - "Go back to before refactoring, but keep the test suite I added after"
  - System identifies which actions/changes are independent of the target undo point
  - Preserved actions are re-applied on top of the old state (if compatible)
- Branching visible in timeline UI (shows all branches and current branch)
- Each branch can be named and saved ("refactor-attempt-2", "original-approach", etc.)
- Branches can be merged (if compatible), compared, or deleted

**Edge Cases:**
- Preserved changes conflict with rewound state → show merge conflict UI
- Rewinding affects agent state (partially executed task) → agent must re-sync with new state
- User keeps many branches → UI becomes complex; use filtering/search
- Branches diverge so much that merge is impossible → manual reconciliation needed
- Cross-window undo (one window's undo affects another) → ensure consistency

**Visual/UX Description:**
- Undo panel shows branching timeline (tree view with current branch highlighted)
- Each commit/action is a node with timestamp, description, and icon (code change, file added, etc.)
- User can click any node to preview that state (without committing to rewind)
- When rewinding with selective preservation, a dialog shows which changes will be kept/discarded
- Preserved changes are re-applied with animation showing the process
- Branches named and colored for easy identification
- Timeline shows branch points clearly (where a rewind created a fork)

**Implementation Requirements:**
```
- Branching undo tree: Maintain DAG of all states (not linear undo stack)
- State serialization: Save full workspace state at each branch point
- State diffing: Identify what changed between branch points
- Change dependency analysis: Determine which changes can be preserved when rewinding
- Conflict detection: Flag changes that conflict when re-applying
- Merge algorithm: Merge compatible branches (or report conflicts)
- Timeline UI: Render branching history with branch visualization
- Rewind engine: Apply state changes to rewind to any point
- Selective application: Re-apply preserved changes on top of rewound state
- Branch naming: Allow user to name and organize branches
- Persistence: Store undo tree to persistent storage (not lost on workspace close)
```

---

## Pattern 13: PERMISSION CONFIRMATION

**Name:** Supervised Mode Agent Permission Requests
**Trigger:** Agent in supervised mode is about to perform a significant action (modify code, delete file, send message, execute command, etc.)
**Behavior:**
- Agent identifies action as "significant" based on pre-defined rules (user configurable)
- Before executing, agent sends permission request to user
- Permission request appears as an overlay or panel with:
  - Clear description of what agent is about to do
  - Reason agent thinks this action is appropriate
  - Proposed action highlighted in context (showing code about to be modified, file to be deleted, etc.)
  - Three buttons: Approve, Deny, Edit
- User can:
  - Approve: action executes immediately
  - Deny: action is canceled; agent receives feedback
  - Edit: user modifies the action before approval (e.g., change "delete all" to "delete matching")
- Approved actions are logged; over time, system learns which actions user consistently approves

**Edge Cases:**
- User takes too long to respond (>5 min) → agent notifies user and escalates to orchestrator
- Same permission requested repeatedly → system offers toggle to auto-approve similar actions
- Agent's reasoning is unclear → user can click "Explain more" to see full agent reasoning
- Denying action breaks dependent tasks → warn user about cascade effects
- Permission request contradicts earlier deny → warn user of inconsistency

**Visual/UX Description:**
- Overlay appears with semi-transparent background dimming main content
- Agent action shown in a framed box with icon indicating action type (modify, delete, send, etc.)
- Agent reasoning appears in italics or lighter text below action
- Context highlighted in main window (if applicable)
- Three action buttons clearly labeled and color-coded (Approve: green, Deny: red, Edit: blue)
- Timeout indicator shows if user is taking a long time
- Permission history link allows user to see past decisions and patterns

**Implementation Requirements:**
```
- Significant action classifier: Identify which actions require permission
- Permission request generator: Create clear, contextual permission requests
- User feedback collector: Capture Approve/Deny/Edit responses
- Learning system: Track user decisions and build approval patterns
- Auto-approval logic: Learn which actions can be auto-approved
- Timeout handler: Escalate if user doesn't respond in time
- Logging: Audit trail of all permission requests and responses
- Context highlighter: Show what's about to be modified in main window
- Edit interface: Allow user to modify action before approval
- Consistency checker: Warn if user makes contradictory decisions
```

---

## Pattern 14: PERMISSION BYPASS / AUTONOMOUS MODE

**Name:** Autonomous Mode with Full Logging
**Trigger:** User toggles to "Autonomous Mode" in settings, or says "run autonomously"
**Behavior:**
- Supervised mode is disabled; agents no longer request permission before significant actions
- Agents act freely and with full confidence in their decisions
- ALL actions are logged exhaustively:
  - Every file modification (before/after content)
  - Every message sent
  - Every command executed
  - Every API call
  - Every decision point and reasoning
- User can access full audit log at any time (searchable, filterable)
- If agent causes damage (deletes important file, breaks code, etc.), user can use audit log to understand what happened and rewind
- Autonomous mode can be time-limited ("autonomous for 2 hours, then revert to supervised")
- Critical actions still log even in autonomous mode (provide paper trail)

**Edge Cases:**
- Agent crashes or behaves erratically in autonomous mode → automatic fallback to supervised
- Autonomous mode enabled but user still wants oversight for specific task → can override per-task
- Logging storage exceeds capacity → oldest logs archived to external storage
- User wants to undo action from autonomous mode → use audit log + rewind pattern
- Agents learn to be more conservative in autonomous mode after previous failures

**Visual/UX Description:**
- Autonomous mode toggle in settings, with prominent warning ("All actions will be logged but not confirmed")
- When autonomous mode is active, a persistent indicator appears (top-right, "AUTONOMOUS MODE")
- Indicator color changes if action rate exceeds threshold (indicates agent is working hard)
- Click indicator to open live audit log (see what agent is doing in real-time)
- Audit log shows timeline of actions with color-coded severity (info, warning, error)
- Each log entry shows action, reasoning, result
- User can click entry to see full details and rollback option

**Implementation Requirements:**
```
- Mode toggle: Switch between supervised and autonomous in settings
- Permission bypass: Skip permission requests when autonomous
- Exhaustive logger: Log every action with full context and reasoning
- Audit log storage: Persistent storage of all logs with indexing
- Log retrieval: Queryable/filterable audit log UI
- Time-limited mode: Support autonomous mode with expiration timer
- Critical action detector: Flag critical actions even in autonomous mode
- Crash detection: Monitor agent health; revert to supervised on error
- Action rate monitor: Track action frequency; warn if agent is overactive
- Rollback support: Link audit log entries to undo/rewind system
- Consistency checker: Verify audit log against actual system state
```

---

## Pattern 15: ESCALATION VISIBLE

**Name:** Agent Escalation to Orchestrator with Visible Propagation
**Trigger:** Leaf agent (task-specific) encounters situation it cannot handle and escalates to orchestrator (conductor)
**Behavior:**
- Agent is executing a task and encounters a blocker:
  - Task requires decision that spans multiple agents' domains
  - Task was given conflicting constraints
  - Agent needs access to information it doesn't have
  - Agent is uncertain and wants human oversight
- Agent constructs escalation request with:
  - Summary of problem
  - Current task state and context
  - What it tried and why it failed
  - Request for guidance (decision, clarification, new context, etc.)
- Escalation is sent up the hierarchy to orchestrator
- Orchestrator processes escalation:
  - May activate additional agents to gather more context
  - May consult user
  - May make decision and send back instruction
  - May decompose task differently and return to leaf agents
- **Visible part**: User sees escalation propagate in task graph (task node highlights, escalation node appears)

**Edge Cases:**
- Multiple leaf agents escalate simultaneously about same problem → orchestrator coordinates response
- Escalation is due to user ambiguity → orchestrator asks user for clarification before proceeding
- Escalation cascades (orchestrator escalates to user) → show full escalation chain
- Escalation is resolved quickly → animate resolution path back down to leaf agent
- Agent escalates repeatedly for same task → system flags recurring escalation pattern

**Visual/UX Description:**
- Task node in graph begins to pulse/glow when escalation occurs
- "Escalating..." indicator appears in node
- An upward arrow animates from leaf agent's task to orchestrator node
- Escalation reason appears as a tooltip or sidebar detail
- Orchestrator node becomes active (highlights, shows reasoning)
- If orchestrator needs user input, overlay appears with question/options
- When resolved, animation shows resolution flowing back down to leaf agent
- Escalation is recorded in task history (can be reviewed later)

**Implementation Requirements:**
```
- Escalation detector: Identify when agent should escalate
- Escalation formatter: Create clear escalation request with context
- Escalation queue: Route escalation to orchestrator
- Orchestrator handler: Receive and process escalation
- Context gathering: Activate additional agents if needed
- User interface: Present escalation to user if needed
- Decision engine: Orchestrator makes decision or asks user
- Response mechanism: Send resolution back to escalating agent
- Visualization: Highlight escalation in task graph
- Logging: Record escalation reason and resolution
- Pattern detection: Flag recurring escalations
```

---

## Pattern 16: AGENT CREATION

**Name:** Dynamic Agent Spawning and Widget Generation
**Trigger:** User command results in creation of new agent/widget (e.g., "create a todo tracker", "build a Pomodoro timer", "make a markdown note editor")
**Behavior:**
- User issues command requesting dynamic app/widget
- Conductor routes to a specialized agent: the "agent creator" or "widget composer"
- Widget composer understands:
  - What the user wants (NLP parsing of intent)
  - What scaffolding/boilerplate is needed (based on framework/tech stack)
  - What interactions/behaviors are required
- Composer generates:
  - UI code (HTML/CSS or native components)
  - Interaction handler (JavaScript or state machine)
  - Styling and layout
  - Default behavior and rules
- Generated widget appears as a new window on screen
- Widget has full OS integration:
  - Can accept drag-and-drop context
  - Can receive commands via text/voice
  - Can save state to workspace
  - Can be minimized/maximized/resized
  - Can be saved as template for reuse

**Edge Cases:**
- Widget generation fails (invalid request) → show error with suggestion to clarify
- Generated widget is complex → generator breaks it into phases; first version appears, enhancements follow
- User wants to customize generated widget → open inline editor (code editor for widget, or visual editor)
- Generated widget needs data → system automatically surfaces relevant data sources
- Multiple similar widgets already exist → ask user if they want to reuse or create new

**Visual/UX Description:**
- When widget composer is invoked, a loading animation appears (usually in center of screen)
- Brief progress indicator shows phases: "Analyzing intent... Generating UI... Building interaction... Launching..."
- Widget appears as a new window with animation
- Widget has special header indicating it's dynamically generated (small icon/badge)
- Context menu on widget offers: Edit Code, Save as Template, Delete, Duplicate, Properties
- If widget needs tuning, inline editor is easily accessible

**Implementation Requirements:**
```
- Intent parser: Understand user's widget request
- Scaffolding generator: Create base component structure
- UI renderer: Generate UI code (HTML/CSS or native)
- Interaction engine: Build behavior/state machine
- Integration harness: Connect widget to OS services (drag-drop, commands, etc.)
- State management: Allow widget to maintain state and save to workspace
- Code editor: Offer inline editing of generated widget code
- Template saver: Allow saving successful widgets as reusable templates
- Template loader: Spawn new instances of saved templates
- Error handling: Graceful degradation and user guidance on generation failure
- Validation: Check generated code for safety and syntax
```

---

## Pattern 17: TEMPLATE SAVE

**Name:** Dynamic App/Widget Persistence as Reusable Template
**Trigger:** User right-clicks on dynamically generated widget and selects "Save as Template", or says "save this widget"
**Behavior:**
- User confirms saving the current widget state as a template
- Template saver captures:
  - Widget code (HTML/CSS/JS or native code)
  - Widget metadata (name, description, tags/categories)
  - Widget state schema (what data it persists)
  - Dependencies (external libraries, services, etc.)
  - Configuration options (user-adjustable settings)
- Template is saved to user's template library
- Template is now available for:
  - Creating new instances ("Create a new todo tracker")
  - Exporting/sharing with other users
  - Searching and discovery in template browser
- When creating instance from template, system:
  - Spawns new widget window with same structure/code
  - Allows pre-configuring options before creating
  - Maintains link to original template (can update if template evolves)

**Edge Cases:**
- Template has external dependencies → save those dependencies or reference them
- Template has sensitive data in state → prompt user to clear before saving
- User saves multiple versions of similar template → suggest consolidation or versioning
- Template becomes popular in shared workspace → system tracks usage and might suggest improvements
- Updating template → choice to update existing instances or keep them as-is

**Visual/UX Description:**
- Save dialog appears with fields: Template Name, Description, Category/Tags, Thumbnail
- Thumbnail auto-generated from widget current state (can be manually adjusted)
- Save button highlights on confirmation
- Success message shows template now available in "My Templates"
- Template appears in template browser with icon and metadata
- When creating from template, preview shows what widget will look like with default settings
- Template has edit/delete/share buttons in browser

**Implementation Requirements:**
```
- Template capture: Serialize widget code and metadata
- Template storage: Save to persistent template library
- Template metadata: Store name, description, tags, category
- Dependency tracking: Record external dependencies
- Template browser: UI for browsing and searching templates
- Instance creator: Spawn new widget instance from template
- Pre-configuration: Allow customizing before creating instance
- Template linking: Maintain reference between instance and template
- Template versioning: Optional versioning and update mechanism
- Export/import: Allow sharing templates across workspaces/users
- Thumbnail generation: Auto-generate preview image
- Cleanup: Handle sensitive data before saving
```

---

## Pattern 18: SENSOR ALERT

**Name:** Environmental Awareness and Contextual Notifications
**Trigger:** OS monitors environment and time-based factors and generates alerts when thresholds are crossed
**Behavior:**
- OS maintains awareness of:
  - Session duration (how long user has been working)
  - Time of day and calendar (meetings upcoming, end of day approaching)
  - User activity level (intense work, idle, etc.)
  - System resources (CPU/memory usage)
  - Physical environment (if available: light level, noise, etc.)
- Sensor-based alerts trigger when thresholds are crossed:
  - "You've been coding for 4 hours. Want to take a break?"
  - "Meeting in 15 minutes. Should I wrap up and summarize?"
  - "Memory usage is high. Run cleanup?"
  - "It's past 6pm. Save work and shut down?"
- User can:
  - Dismiss alert
  - Accept suggestion (OS may auto-pause current task, summarize progress, save state)
  - Customize threshold (don't alert me about breaks until 6 hours, etc.)
- Alerts are non-intrusive: appear as subtle notifications, not blocking overlays

**Edge Cases:**
- User is in flow state and doesn't want alerts → user can toggle "do not disturb" mode
- Alert fires during critical action (agent mid-execution) → queue alert until safe point
- User customizes alert threshold to something unreasonable → system gently warns but respects choice
- Multiple sensors trigger alerts simultaneously → batch them into single notification
- Alert recommendation conflicts with task requirements → show both options

**Visual/UX Description:**
- Alert appears as a subtle notification (top-right or bottom-right corner)
- Notification has icon indicating alert type (timer for break alert, calendar for meeting alert, etc.)
- Brief message and optional action buttons (Accept, Dismiss, Customize)
- Alert auto-dismisses after 5 seconds if no interaction
- Clicking notification shows extended info and options
- Dismissed alerts can be reviewed in notification history
- "Do Not Disturb" indicator visible when alerts are suppressed

**Implementation Requirements:**
```
- Session timer: Track user session duration
- Calendar integration: Know about upcoming meetings
- Activity monitor: Track user activity level (input frequency, mouse movement)
- Resource monitor: Monitor CPU, memory, disk usage
- Environmental sensors: Optional integration with light sensors, noise sensors
- Alert rules engine: Configurable rules for triggering alerts
- Threshold management: Allow user to customize alert thresholds
- Alert queue: Batch alerts if multiple trigger simultaneously
- Do not disturb: Allow suppressing alerts for period of time
- Notification UI: Subtle, non-intrusive notification rendering
- Notification history: Keep log of recent alerts and dismissals
- Action handler: Execute suggested actions (pause task, summarize, save, etc.)
```

---

## Pattern 19: CROSS-WORKSPACE SURFACING

**Name:** Conductor-Driven Contextual Connection Surfacing
**Trigger:** Conductor detects a connection between object/concept in one workspace and work in another workspace
**Behavior:**
- Conductor continuously analyzes all open workspaces and archived work
- When conductor detects a semantic connection, it surfaces the insight:
  - "The project you finished in portfolio would be a strong example for the system design question you're prepping for"
  - "The JavaScript patterns you learned in the web dev project apply directly to the code review task here"
  - "Data from the Q4 analysis in the other workspace might be relevant to this prediction task"
- User can:
  - Act on suggestion: jump to relevant workspace/object, pull content into current workspace
  - Dismiss: "not relevant" → system learns from dismissals
  - Explore: "tell me more" → conductor explains connection in detail
- Suggestion appears as a card or banner, usually when user switches workspaces or at natural pause points

**Edge Cases:**
- Too many suggestions → system prioritizes by relevance and surfaces top 3 (user can see more)
- User finds suggestions distracting → can disable cross-workspace surfacing
- Suggestion is made but user immediately dismisses → system reduces weight for similar suggestions
- Two workspaces have deeply connected data → offer merge or formal linking
- Conductor's suggestion is wrong → user provides feedback ("these aren't related"); system improves

**Visual/UX Description:**
- Suggestion appears as a floating card or banner (usually top-right, can be repositioned)
- Card shows two workspaces/objects being connected with icons
- Brief explanation of why they're connected
- Action buttons: "See it", "Pull it in", "More info", "Dismiss"
- Clicking "See it" jumps to the other workspace
- Clicking "Pull it in" copies or links the relevant content into current workspace
- Suggestion can be pinned (stays visible) or auto-dismissed
- If multiple suggestions, show as a collapsible list

**Implementation Requirements:**
```
- Semantic analyzer: Build semantic embeddings of workspace content and past projects
- Connection detector: Identify semantic similarities between workspaces
- Relevance ranker: Score connections by relevance and surfacing value
- Suggestion generator: Create clear, actionable suggestions
- User feedback loop: Learn from dismiss/accept patterns
- Personalization: Customize suggestions based on user history
- Deduplication: Avoid repeating same suggestion
- Filtering: User can filter by suggestion type or workspace pairs
- Pull-in mechanism: Copy or link relevant content between workspaces
- Persistence: Track which suggestions were made (for learning and audit)
```

---

## Pattern 20: SUB-AGENT COMMAND

**Name:** Direct Sub-Agent Command Routing
**Trigger:** User addresses a specific window's sub-agent directly (e.g., "code editor, refactor this function" instead of general "refactor this")
**Behavior:**
- User specifies which agent to target by window name, agent name, or agent role
- Command is routed directly to that agent, bypassing conductor routing logic
- Agent receives command with explicit focus on its window/domain
- Agent executes with full context of its window (selected code, active document, etc.)
- Result appears in the target window (no ambiguity about where to display result)
- Direct command is useful when:
  - Conductor's routing would be ambiguous
  - User wants to force an agent to handle task (overriding conductor's judgment)
  - User wants to ensure a specific agent's expertise is applied

**Edge Cases:**
- User specifies non-existent agent → system suggests closest match
- Agent is not compatible with command → agent responds with explanation
- Command spans multiple agents (e.g., "code editor, refactor this, then test it") → first agent executes and passes to next
- Agent is busy → command queues or user is asked if they want to wait
- Sub-agent command conflicts with current agent task → ask user for override confirmation

**Visual/UX Description:**
- In text input, user prefixes command with agent name: "@code-editor refactor this"
- Autocomplete suggests available agents as user types "@"
- Command is parsed with agent name highlighted
- When sent, a small indicator shows which agent is receiving the command
- Result appears in target window with a badge noting which agent produced it
- Command history shows direct-addressed commands separately (for learning)

**Implementation Requirements:**
```
- Agent name parser: Extract agent name from command prefix
- Agent registry: Maintain list of available agents and their aliases
- Direct routing: Send command directly to specified agent
- Autocomplete: Suggest agent names as user types "@"
- Compatibility check: Verify agent can handle command
- Queue management: Handle commands when agent is busy
- Fallback routing: Suggest alternative agents if specified agent unavailable
- Result isolation: Display result in target agent's window
- History tracking: Log direct-addressed commands separately
- Feedback: Show which agent received command and confirmation
```

---

## Pattern 21: MULTIMODAL INPUT

**Name:** Mixed-Mode Input with Image/File/Recording + Text
**Trigger:** User drops image/file/recording into input bar alongside text command, or types text while dragging object
**Behavior:**
- User can combine multiple input modalities in single command:
  - Text: "refactor this function"
  - + Image: code screenshot user just took
  - + Optional: "keep the original performance characteristics"
- When multimodal input is detected, OS parses each modality:
  - Text → intent and command
  - Image → content extraction (OCR, vision understanding, code parsing)
  - File → type detection and content parsing
  - Recording → transcription and intent parsing
- Agent receives unified message with all modalities available
- Agent can leverage all input simultaneously:
  - Vision agent analyzes image while text agent interprets command
  - Extracted code from image is treated as context alongside text request
- Result synthesizes insights from all modalities

**Edge Cases:**
- Image is unclear/unreadable → ask user to clarify or try again
- Text and image conflict (image shows different code than user described) → ask user which is authoritative
- File is large → background processing with progress indicator
- Recording has audio quality issues → show transcript confidence indicator
- Multiple files dropped → ask user if they're related or separate inputs

**Visual/UX Description:**
- Input bar shows icons for each modality type at the bottom (document icon for file, camera icon for image, microphone icon for recording)
- As user drags/drops content, icons light up showing which modalities are present
- Preview thumbnails appear in input bar (small image preview, filename, audio waveform)
- Multimodal input can be edited: user can remove individual modalities before sending
- Sent command shows badges for each modality used
- Agent response integrates all modalities in explanation

**Implementation Requirements:**
```
- Multimodal input parser: Identify and parse each input type
- Content type detector: Classify files, images, recordings
- Image processing: OCR, vision understanding, code parsing from screenshots
- File parser: Extract content from documents, code files, data files
- Audio processing: Transcribe recordings, detect intent
- Unified message builder: Combine all modalities into single agent message
- Confidence scoring: Rate confidence in each modality's extraction
- Conflict detection: Identify contradictions between modalities
- Preview generation: Show thumbnails/previews of each modality
- Agent integration: Pass all modalities to agent with proper formatting
- Fallback: Handle missing/corrupted modalities gracefully
```

---

## Pattern 22: PLAN INSPECTION

**Name:** Conductor's Living Task Plan Inspection
**Trigger:** User says "show me your plan" or "what's the plan" or clicks Plan button in UI
**Behavior:**
- Conductor maintains a living, structured task breakdown for the current workspace
- Plan includes:
  - Top-level goal/objective
  - Hierarchical task decomposition (goal → phases → tasks → subtasks)
  - Estimated time for each task
  - Progress indicators for each task (not started, in progress, blocked, complete)
  - Agent assignments (which agent handles which task)
  - Dependencies (task A must complete before task B starts)
  - Critical path (sequence of tasks that determines overall timeline)
- User can inspect plan in detail:
  - View entire plan at once (scrollable/zoomable)
  - Expand/collapse task hierarchy to focus on specific level of detail
  - Click task to see full description, conductor's reasoning, and assumptions
  - See real-time progress as agents work through plan
  - Ask conductor to explain reasoning for plan structure
- Plan is updated continuously as tasks are completed or blocked

**Edge Cases:**
- Plan becomes obsolete (user changes goals mid-way) → conductor re-plans
- Plan is very complex (100+ tasks) → use clustering/hierarchy effectively
- Critical path shifts as tasks complete faster/slower than estimated → highlight changes
- User disagrees with plan → can override specific decisions or ask conductor to re-plan
- Multiple possible plans exist → conductor shows top 3 options with pros/cons

**Visual/UX Description:**
- Plan view shows hierarchical tree or Gantt chart (user can toggle view)
- Tree view shows expandable task nodes with status color (gray: pending, blue: in progress, green: complete, red: blocked)
- Gantt chart shows timeline with tasks as bars, dependencies as connectors
- Node labels show task name and estimated time
- Agent avatar or icon appears in each task node
- Critical path highlighted in bold or red color
- Progress bar or percentage completion shown for in-progress tasks
- Hover over task shows tooltip with description and assumptions
- Right-click task offers options: View Details, Edit, Replan This, Skip, Complete

**Implementation Requirements:**
```
- Task hierarchizer: Decompose conductor's plan into hierarchical structure
- Estimator: Calculate time estimates for each task
- Dependency analyzer: Identify task dependencies and critical path
- Progress tracker: Update task progress as agents work
- Plan visualizer: Render as tree, Gantt chart, or other format
- Plan updater: Re-plan when conditions change
- Explainer: Answer user questions about why plan is structured certain way
- Plan comparison: Show alternative plans if multiple exist
- User override: Allow modifying plan structure or task estimates
- Real-time sync: Keep plan view in sync with actual agent progress
- History: Store previous plans (user can see how plan evolved)
```

---

## Cross-Pattern Architectural Notes

### Interaction Binding
All 22 patterns feed into a unified command/context pipeline:
```
User Action → Input Parser (text/voice/gesture/drag-drop)
→ Intent Classifier (direct command vs. agent delegation vs. orchestration)
→ Context Resolver (spatial references, workspace state, active agents)
→ Routing Engine (which agent/window receives this)
→ Agent Message Queue
→ Agent(s) execute
→ Result Formatter & Visualization
```

### State Preservation
Every interaction updates workspace state:
- Text commands, voice commands, overrides, permissions all logged
- Undo/branching undo tree captures every decision point
- Workspace state includes: window layout, agent state, task graph, context store, permission history

### Real-Time Responsiveness
All patterns assume real-time, low-latency execution:
- Parser must respond in <100ms for fluidity
- Routing must complete in <50ms
- Agent message delivery in <10ms
- UI updates streaming (don't wait for complete task)

### Permission Model Integration
Patterns 13 (permission confirmation) and 14 (autonomous mode) overlay on all other patterns:
- Every agent action is filtered through permission logic
- Supervised mode asks before significant actions
- Autonomous mode logs everything but doesn't ask
- User can toggle per-pattern, per-task, or globally

### Learning & Adaptation
Patterns 13, 14, 18, and 19 involve system learning:
- Over time, system learns which permission requests user always approves → auto-approve
- Alert thresholds adapt to user's work style
- Cross-workspace suggestions improve as system learns user's knowledge domains
- Agent confidence increases for actions user frequently accepts

---

## Implementation Priority

**Phase 1 (Core):**
1. Text Command (Pattern 1)
2. Workspace Switch (Pattern 6)
3. Task Panel (Pattern 10)
4. Permission Confirmation (Pattern 13)

**Phase 2 (Enhanced Interaction):**
5. Voice Command (Pattern 2)
6. Drop Object as Context (Pattern 4)
7. Point and Reference (Pattern 5)
8. Window Management (Patterns 7, 8, 9)

**Phase 3 (Advanced):**
9. Ambient Voice (Pattern 3)
10. Override Agent (Pattern 11)
11. Rewind/Branching (Pattern 12)
12. Agent Creation (Pattern 16)

**Phase 4 (Intelligence & Awareness):**
13. Escalation Visible (Pattern 15)
14. Autonomous Mode (Pattern 14)
15. Sensor Alerts (Pattern 18)
16. Cross-Workspace Surfacing (Pattern 19)
17. Plan Inspection (Pattern 22)

**Phase 5 (Polish):**
18. Sub-Agent Command (Pattern 20)
19. Multimodal Input (Pattern 21)
20. Template Save (Pattern 17)

---

## Documentation Complete

This catalog is self-contained and ready for implementation. Each pattern specifies what users see, what they do, what happens internally, and what code/architecture is needed. Feed this to Claude Code for iterative implementation.
