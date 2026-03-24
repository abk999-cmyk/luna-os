# 14. Workspace Layout and Composition Rules

## Overview

A workspace is a **semantic context container** — a unified environment shaped by the system's understanding of the user's current goal, not by manual window management. When a user declares intent ("I'm writing my thesis," "debugging the API," "planning next quarter"), the conductor orchestrates a complete workspace composition: relevant applications, windows, agent instances, data sources, and UI panels arrange themselves intelligently. Workspaces preserve state, enable rapid context switching, and elevate the user above low-level window manipulation.

---

## 1. Workspace Concept and Semantic Grounding

### 1.1 Workspace as Semantic Context

A workspace is defined by:
- **User intent** — the articulated or inferred goal ("thesis writing," "API debugging," "market research")
- **Semantic composition** — the set of tools, agents, data, and windows required for that goal
- **Persistent state** — editor positions, scroll locations, agent context, task history
- **Visual arrangement** — the physical layout optimized for the workflow

**Workspace ≠ Window arrangement.** Two workspaces with identical window positions may serve different intents and behave differently. For example:
- Thesis writing workspace: editor centered, reference papers on left, citation tool on right, research agent in bottom panel
- Thesis submission workspace: same windows, different focus — editor peripheral, submission checklist center, formatting validator right, compliance agent active

### 1.2 LLM-Driven Composition

The conductor (primary LLM orchestrator) decides workspace composition based on:
- **Goal understanding** — parsed from user speech, text, or inferred from recent activity
- **Task graph structure** — which subtasks are parallel, sequential, or blocking
- **User history** — past preferences for this type of work
- **Available resources** — connected agents, applications, data sources
- **Cognitive load optimization** — progressive disclosure, cognitive grouping

**Default is intelligent automation.** The user declares intent; the system composes. The user retains full override capability but rarely needs it because the system's compositional decisions are sound by default.

### 1.3 User Override and Customization

Users can:
- Accept the default composition
- Modify it (drag, resize, add, remove windows)
- Save the modified layout as a custom workspace template
- Revert to auto-composed layouts with a command

Custom templates are stored as composable JSON schemas and merged with LLM-derived layouts, allowing hybrid manual + automatic composition.

---

## 2. Workspace Creation and Lifecycle

### 2.1 Workspace Trigger Events

Workspaces are created or activated by:

| Trigger | Example | Behavior |
|---------|---------|----------|
| **Explicit user command** | "switch to coding workspace" | Load workspace by name |
| **Intent declaration** | "I'm working on my thesis" | Conductor analyzes intent, creates/loads matching workspace |
| **Application launch** | User opens GitHub desktop | Suggest coding workspace; auto-activate if user confirms |
| **Task assignment** | Agent receives task "review pull request" | Spawn review-specialized workspace |
| **Context marker** | User enters `/planning` mode | Activate planning workspace template |
| **Ambient inference** | System detects sustained focus on code + terminal for 5+ min | Prompt: "Activate coding workspace?" |

### 2.2 Workspace Initialization Algorithm

```
function createWorkspace(userIntent, context) {
  1. PARSE INTENT
     - Extract primary goal (e.g., "thesis writing")
     - Identify secondary goals (research, formatting, collaboration)
     - Infer required tools from semantic database

  2. QUERY RESOURCE GRAPH
     - Match intent to available applications
     - Identify active agents capable of supporting task
     - Retrieve relevant data sources (open documents, project files)

  3. COMPOSE INITIAL LAYOUT
     - Apply composition rules (see 3.1)
     - Determine primary, secondary, and utility windows
     - Calculate magnetic snap zones

  4. APPLY USER HISTORY
     - Load user's previous customizations for this workspace type
     - Apply saved template overrides

  5. ACTIVATE AGENTS
     - Spawn sub-agents matching task decomposition
     - Pre-fetch relevant context into agent memory

  6. BUILD TASK GRAPH
     - Construct visual DAG of workspace tasks
     - Populate task panel with progress tracking

  7. RENDER WORKSPACE
     - Animate windows into position
     - Display task panel
     - Notify user of readiness
}
```

### 2.3 Workspace State Preservation

Each workspace maintains:
- **Persistent storage** — JSON state file at `~/.os/workspaces/{workspace_id}/state.json`
- **Application memory** — each window stores its own state (editor position, scroll, undo history)
- **Agent context** — LLM context for active agents, including task history
- **Task graph snapshot** — serialized DAG and progress data
- **Custom layout** — user modifications to the default composition

When a workspace is deactivated, all state is frozen. Upon reactivation, the exact state is restored, including:
- Window positions and sizes
- Editor scroll positions
- Agent conversation history (last N messages)
- Task panel state and expanded/collapsed nodes
- Which sub-agents are running

---

## 3. Window Behavior and Arrangement

### 3.1 Window Model

Windows are **task containers** with the following properties:

| Property | Description |
|----------|-------------|
| **Task window ID** | Unique identifier (e.g., `editor-thesis`, `agent-research-0`) |
| **Content type** | Application (editor, terminal, browser), agent interface, data viewer |
| **State** | active, minimized, hidden, maximized, pinned |
| **Bounds** | x, y, width, height (in logical units, not pixels) |
| **Magnetic attachment** | Which other windows this window gravitationally groups with |
| **Priority** | Determines stacking order and animation timing (1–100) |
| **Z-index** | Visual stacking depth |
| **Interactivity layer** | Interaction rules (e.g., can send/receive drag-and-drop data) |

### 3.2 Magnetic Attachment System

Windows don't strictly "tile." Instead, they use **magnetic attachment physics** similar to cards in a solitaire game:
- Windows have invisible magnetic edges and zones
- When windows move near each other, they snap together with mild physics animation
- Groups form naturally around logical task clusters
- Groups can be moved as a unit, or individual windows can be dragged out

**Attachment rules:**
```
function shouldMagneticallyAttach(windowA, windowB) {
  if (windowA.taskType == "editor" && windowB.taskType == "agent") {
    return proximityScore(windowA, windowB) > THRESHOLD
  }
  if (groupedWith(windowA, windowB, pastSessions)) {
    return true  // Prefer grouping if historically grouped
  }
  if (windowA.priority > 80 && windowB.priority > 80) {
    return false  // High-priority windows may repel for independence
  }
  return proximityScore(windowA, windowB) > THRESHOLD
}
```

**Visual indicators:**
- When a window approaches another, both show faint outlines indicating snap zones
- Upon attachment, a subtle glow indicates grouped membership
- Attached groups show a virtual "container" outline when all members are within proximity
- Detaching a window fades the group indicator

### 3.3 Snap Zones

The workspace defines **semantic snap zones** — invisible regions optimized for specific window types:

```
SNAP ZONES (for standard workspace):
┌─────────────────────────────────────────────┐
│ [REF]  [EDITOR (Primary Content)]  [AGENT]  │
│   L    [              C             ]   R    │
│        [                           ]        │
├─────────────────────────────────────────────┤
│       [UTILITY: Terminal/Search/Output]     │
│                     U                       │
└─────────────────────────────────────────────┘

L = Left zone (references, auxiliary data)
C = Center zone (primary content — editor, canvas, chat)
R = Right zone (agents, controls, secondary tools)
U = Utility zone (terminal, search, status, logs)
```

Snap zones are layout-aware: as windows are added/removed, zones dynamically reflow. A window snapping to zone C automatically reflows L and R to accommodate.

### 3.4 Window Stacking and Grouping

**Stacking:**
- Windows can be stacked atop each other in the same zone
- Stack indicator shows count of hidden windows ("3 windows" badge)
- Clicking the badge or swiping shows a carousel of the stack
- Z-index is dynamic — focused window rises to top

**Grouping:**
- Magnetically attached windows form visual groups with shared borders
- Groups can be collapsed to a single representative window with a disclosure triangle
- Expanding a group shows all contained windows in a grid layout
- Groups are semantic — the system may auto-collapse less-relevant groups

### 3.5 Window Resize and Dragging

**Resize behavior:**
- Windows have minimum and maximum bounds
- Resizing one window reflows neighboring windows via magnetic repulsion
- If zones overflow, lower-priority windows collapse or move to a secondary viewport
- Resize handles appear on window edges with visual feedback (cursor change, glow)

**Dragging behavior:**
- Drag a window anywhere in the workspace
- As you drag, magnetic snap zones highlight, showing where the window will land
- Drop within a zone, and the window snaps with animation
- Drag across zone boundaries to reparent the window
- Long-drag (2+ seconds) initiates a "detach and float" mode — window becomes independent

### 3.6 Minimization, Hiding, and Dismissal

**Minimize:**
- Collapses window to a title bar in a "minimized dock" (left edge or above task panel)
- Clicking the minimized window restores it to previous bounds
- Minimized windows are still part of the workspace state

**Hide:**
- Removes window from view but keeps it in workspace state
- Useful for decluttering without losing context
- Hidden windows can be restored via task panel or with keyboard shortcut

**Dismiss:**
- Removes window entirely from workspace (though not from history)
- Data is preserved in undo buffer and workspace history
- User can restore with undo or by re-opening the window

---

## 4. Initial Layout Composition Algorithm

### 4.1 Composition Heuristics

When the conductor composes a workspace, it applies a set of heuristics:

**Goal-to-tools mapping:**
```
intent = parseUserGoal(userInput)

// Match intent to tool categories
tools = semanticMatch(intent, availableTools, userHistory)

// Examples:
"thesis writing" → [editor, research-agent, citation-tool,
                    reference-papers, formatting-tool]
"debugging" → [code-editor, terminal, debugger, logs,
               git-client, test-runner]
"market research" → [browser, notes-app, spreadsheet,
                     research-agent, data-visualization]
```

**Window prioritization:**
```
function prioritizeTools(tools, intent, taskGraph) {
  primary = tools.filter(t => taskGraph.criticalPath.includes(t))
  secondary = tools.filter(t => taskGraph.supportingTasks.includes(t))
  utility = tools.filter(t => !critical && !supporting)

  // Assign display priority
  for (tool in primary) { priority[tool] = 90 }
  for (tool in secondary) { priority[tool] = 50 }
  for (tool in utility) { priority[tool] = 20 }
}
```

**Zone assignment:**
```
RULE 1: Primary content (editor, canvas, chat) → Center zone
RULE 2: Agents and controls → Right zone
RULE 3: References, data, auxiliary tools → Left zone
RULE 4: Terminal, logs, output → Utility zone
RULE 5: If center zone overflows, secondary content wraps to left/right
RULE 6: Low-priority utilities collapse to task panel shortcuts
```

**Progressive disclosure:**
```
function progressiveDisclosure(allTools, userExpertise) {
  // On first workspace activation, show only essentials
  essentials = toolsNeededForImmediate(intent)

  // On user request ("more tools") or after 60 seconds of inactivity,
  // offer to add secondary tools
  if (userIdle > 60s || userOpensMenu("Tools")) {
    showSecondaryTools(tools)
  }

  // Expert users with workspace history get full composition
  // immediately; novices get progressive reveal
}
```

### 4.2 Example Compositions

#### Example: Thesis Writing Workspace

**Intent:** "I'm working on my thesis"

**Composition:**
```
┌──────────────────────────────────────────────────────┐
│ [Ref Papers] [EDITOR: Thesis Draft] [Research Agent] │
│   (PDF)      [                   ]  (Q&A + Context)  │
│              [                   ]                    │
├──────────────────────────────────────────────────────┤
│ [Terminal: Citation Tool]  [Task Panel: Outline]      │
│ (BibTeX, formatting)       (Ch. progress, TODOs)      │
└──────────────────────────────────────────────────────┘
```

**Windows (in activation order):**
1. **Thesis Editor** (priority 95) — primary content
2. **Research Agent Panel** (priority 85) — secondary tool for fact-checking, citations
3. **Reference Papers Viewer** (priority 75) — supporting data
4. **Citation Tool Terminal** (priority 60) — utility
5. **Task Panel** (priority 50, always visible) — progress tracking

**Agent context:**
- Research agent has thesis draft, reading list, and citation history in context
- Can suggest citations, flag unsupported claims, offer outline analysis

**Magnetic groups:**
- Editor and Research Agent form primary group (tight coupling)
- Citation Tool and Task Panel form secondary group (supporting)

#### Example: Code Debugging Workspace

**Intent:** "debugging a memory leak"

**Composition:**
```
┌─────────────────────────────────────────────────────┐
│ [Git History] [CODE EDITOR] [Debugger Console]      │
│  (recent      [           ] (breakpoints, var       │
│   commits)    [           ]  inspection)            │
├─────────────────────────────────────────────────────┤
│ [Test Runner Output]  [Task Panel: Debugging Steps] │
│ (test results, stack traces) (sub-tasks, hypotheses)│
│                                                      │
│ [Terminal: Code Execution]                          │
│ (REPL, memory profiler output)                      │
└─────────────────────────────────────────────────────┘
```

**Windows (in activation order):**
1. **Code Editor** (priority 95) — primary content
2. **Debugger Console** (priority 90) — tightly coupled to editor
3. **Test Runner** (priority 80) — validating fixes
4. **Terminal** (priority 70) — execution, memory profiler output
5. **Git History** (priority 60) — context on recent changes
6. **Task Panel** (priority 50) — debugging checklist, hypotheses

**Agent context:**
- Debugging agent has code, recent commits, test failures, and hypothesis history in context
- Can suggest breakpoint locations, analyze stack traces, propose fixes

#### Example: Research and Planning Workspace

**Intent:** "planning next quarter's roadmap"

**Composition:**
```
┌─────────────────────────────────────────────────────┐
│ [Strategy Notes] [PLANNING CANVAS] [Planning Agent] │
│ (past goals,     (goals, timeline,   (decomposition,│
│  constraints)    dependencies)        resource calc)│
├─────────────────────────────────────────────────────┤
│ [Data Viz: Resource Allocation] [Spreadsheet: Metrics]
│ (Gantt, burndown)               (team capacity, dates)
│                                                      │
│ [Task Panel: Roadmap Structure]                     │
│ (goals → initiatives → tasks, dependencies)         │
└─────────────────────────────────────────────────────┘
```

**Windows (in activation order):**
1. **Planning Canvas** (priority 95) — primary content
2. **Planning Agent Panel** (priority 85) — generates decompositions, flags risks
3. **Data Visualization** (priority 75) — resource and timeline view
4. **Spreadsheet** (priority 70) — detailed metrics and capacity
5. **Strategy Notes** (priority 65) — past context and constraints
6. **Task Panel** (priority 50) — hierarchical roadmap view

**Agent context:**
- Planning agent has team capacity, past velocity, roadmap patterns, and dependencies in context
- Suggests task decompositions, highlights capacity gaps, flags risky dependencies

---

## 5. User Layout Modification

### 5.1 Modification Interactions

Users can reshape a workspace in real-time:

| Action | Interaction | Result |
|--------|-------------|--------|
| **Drag window** | Click title bar, drag to new position | Window moves; magnetic zones highlight; snap on release |
| **Resize window** | Click edge/corner handle, drag | Window resizes; neighbors reflow via magnetic repulsion |
| **Add window** | Right-click task panel → "Add tool" | Tool menu appears; select tool; window spawns in best available zone |
| **Remove window** | Click ✕ on window title bar | Window dismisses; state remains in undo buffer |
| **Collapse group** | Click group chevron/indicator | Group collapses to single card; click to re-expand |
| **Minimize window** | Click minimize button | Window collapses to minimized dock |
| **Restore window** | Click minimized dock item | Window restores to previous bounds |
| **Swap zones** | Drag window across zone boundary | Window reparents to new zone; zone reflows |

### 5.2 Undo/Redo for Layout

The workspace maintains an undo/redo stack for layout changes:
```
workspace.layoutHistory = [
  { timestamp, action: "window_moved", windowId, fromBounds, toBounds },
  { timestamp, action: "window_resized", windowId, fromSize, toSize },
  { timestamp, action: "window_added", windowId, tool },
  { timestamp, action: "window_dismissed", windowId },
  ...
]

// User can undo last N layout changes without affecting content
workspace.undoLayout()  // Reverts last layout change
workspace.redoLayout()  // Re-applies last undone layout change
```

### 5.3 Custom Layout Templates

When a user customizes a workspace layout and wants to save it:
```
workspace.saveAsTemplate("thesis-writing-custom", {
  description: "My preferred thesis workspace with extra research tools",
  baseWorkspace: "thesis-writing",
  customizations: {
    zones: { ... custom snap zone definitions ... },
    windows: [
      { toolId: "editor", bounds: [...], priority: 95 },
      { toolId: "research-agent", bounds: [...], priority: 85 },
      { toolId: "secondary-notes", bounds: [...], priority: 70 },
      ...
    ],
    grouping: [ ["editor", "research-agent"], ["notes", "outline"] ]
  }
})
```

Custom templates are stored as JSON and can be:
- Shared with teammates (exported, imported)
- Versioned in `.os/workspaces/templates/`
- Merged with LLM-composed layouts (custom rules override defaults)

---

## 6. Workspace Switching and Context Transitions

### 6.1 Switching Mechanics

When a user switches workspaces:

```
function switchWorkspace(targetWorkspaceId, animation = "fade") {
  // 1. Freeze current workspace state
  currentWorkspace.saveState()

  // 2. Hide current workspace with animation
  animateOut(currentWorkspace.windows, animation, duration: 300ms)

  // 3. Load target workspace state
  targetState = loadState(targetWorkspaceId)

  // 4. Spawn windows, position them off-screen
  spawnWindows(targetState.windows, offScreen: true)

  // 5. Animate windows into position
  animateIn(targetState.windows, animation, duration: 300ms)

  // 6. Activate agents from target workspace context
  activateAgents(targetState.agents)

  // 7. Restore task panel and progress tracking
  renderTaskPanel(targetState.taskGraph)

  // 8. Notify active agents of context switch
  broadcast("workspaceChanged", targetWorkspaceId)
}
```

### 6.2 Animation and Visual Transitions

**Fade transition** (default):
- All windows in current workspace fade out simultaneously
- New windows fade in
- Smooth crossfade over ~300ms

**Slide transition** (option):
- Windows slide off-screen (direction determined by workspace relationship)
- New windows slide in from opposite direction
- Creates sense of lateral movement between contexts

**Zoom transition** (option):
- Current workspace zooms out to small view
- New workspace zooms in from center
- Creates sense of entering a new context

**Custom transitions:**
- Workspaces can define custom animations in their metadata
- Example: "thesis workspace" might use a book-opening animation

### 6.3 State Preservation and Restoration

Each workspace preserves:

**Application state:**
```
window.editorState = {
  filePath: "thesis.md",
  cursorPosition: { line: 247, column: 5 },
  scrollPosition: { top: 4123, left: 0 },
  selection: { from: 4100, to: 4150 },
  undoStack: [...],
  redoStack: [...]
}
```

**Agent context:**
```
agents[researchAgent].context = {
  conversationHistory: [last 50 messages],
  recentQueries: [...],
  activeHypotheses: [...],
  citationCache: {...},
  timestamp: <when context was last active>
}
```

**Task graph:**
```
workspace.taskGraph = {
  nodes: [...],
  edges: [...],
  progress: { completed: 5, inProgress: 3, pending: 8 },
  expandedNodes: ["goal-1", "goal-1.2", ...],
  timestamp: <last modified>
}
```

Upon workspace reactivation, all state is restored **exactly as it was**:
- Editor shows exact same file, scroll position, cursor
- Agent has full conversation history and context
- Task panel shows same progress and structure
- User resumes work without context loss

### 6.4 Breadcrumb and Quick Navigation

A **workspace breadcrumb** appears at the top left:
```
Home > Workspaces > Thesis Writing > [Current Workspace Name]
```

Users can:
- Click breadcrumb to navigate back through workspace history
- Use keyboard shortcut `Cmd/Ctrl + Shift + W` to open workspace switcher (quick menu)
- Pin frequently used workspaces to the switcher for instant access

**Quick switcher:**
```
[Ctrl+Shift+W]
────────────────────────────
Recent Workspaces:
  > Thesis Writing (active)
  > Debugging: Memory Leak
  > Quarterly Planning
  > Code Review
────────────────────────────
All Workspaces:
  > Research [↻ Recent]
  > Development [↻ Recent]
  > Writing [↻ Recent]
  > Planning [↻ Recent]
────────────────────────────
Create New Workspace...
```

---

## 7. Workspace Orchestrators and Specialization

### 7.1 Workspace Orchestrator Pattern

A **workspace orchestrator** is a sub-agent responsible for managing layout, tool activation, and state for a specific workspace type. This follows the agent orchestration pattern (see Document 11).

**Orchestrator responsibilities:**
- Monitor user activity and intent
- Trigger workspace creation/switching based on context changes
- Manage tool activation order and dependency
- Coordinate agent spawning and context distribution
- Handle layout modifications and preservation
- Manage resource allocation (prioritize high-value tools)

**Example: Thesis Orchestrator**
```
class ThesisOrchestrator(WorkspaceOrchestrator):
  def __init__(self):
    self.intent_detector = IntentDetector()
    self.tool_manager = ToolManager()
    self.agent_coordinator = AgentCoordinator()

  def onUserIntent(self, utterance):
    if "thesis" in utterance or "dissertation" in utterance:
      workspace = self.composeThesisWorkspace()
      self.switchWorkspace(workspace)

  def composeThesisWorkspace(self):
    # Analyze current thesis state (chapter, word count, etc.)
    thesis_state = self.analyzeThesisProject()

    # Determine what tools are needed
    if thesis_state.phase == "research":
      tools = [editor, research_agent, references, notes]
    elif thesis_state.phase == "writing":
      tools = [editor, grammar_checker, formatting_tool]
    elif thesis_state.phase == "review":
      tools = [editor, review_agent, citation_checker, feedback_panel]

    # Compose workspace with intelligent layout
    workspace = Workspace(
      id="thesis-" + thesis_state.projectId,
      orchestrator=self,
      tools=tools,
      initialLayout=self.composeTool(tools, thesis_state),
      taskGraph=self.buildTaskGraph(thesis_state)
    )

    return workspace

  def onModificationDetected(self, event):
    # User modified the layout; offer to save as template
    if event.type == "window_repositioned" and event.count > 3:
      self.agent.suggest("Save this layout as a custom template?")
```

### 7.2 Multi-Agent Coordination in Workspaces

When a workspace is active, multiple agents may be operating:

**Agent roles in thesis workspace:**
- **Research Agent** — monitors references, suggests citations, checks facts
- **Writing Agent** — suggests prose improvements, checks grammar/clarity
- **Planning Agent** — manages chapter structure, TODOs, deadlines
- **Formatting Agent** — ensures citation style, heading hierarchy, document structure
- **Synthesis Agent** — (optional) creates cross-chapter summaries, identifies redundancy

**Coordination protocol:**
```
// When workspace is activated, agents are spawned and briefed
workspace.onActivate() {
  agents = [researchAgent, writingAgent, planningAgent, ...]

  for agent in agents {
    agent.context = {
      currentFile: workspace.focusedWindow.filePath,
      projectMetadata: workspace.metadata,
      relatedAgents: [list of other active agents],
      coordinationRules: [
        "research agent has priority on citation queries",
        "writing agent defers to research agent on fact-checking",
        "planning agent coordinates between chapter deadlines"
      ]
    }
    agent.activate()
  }
}
```

**Inter-agent communication:**
- Agents can message each other via a **workspace message bus**
- Example: Writing agent requests fact-check from research agent
- Messages are logged for later auditing
- Conflicts are escalated to the workspace orchestrator

---

## 8. Multiple Workspace Management

### 8.1 Workspace Lifecycle

Users typically maintain multiple workspaces simultaneously (though only one is active at a time):

**States:**
- **Active** — Currently displayed; all agents, tools, and monitors running
- **Inactive** — Not displayed; state frozen; agents dormant (but not terminated)
- **Archived** — Workspace completed or paused; state preserved; no resources allocated
- **Template** — Reusable blueprint for creating new workspaces of that type

**Storage:**
```
~/.os/workspaces/
  ├── active/
  │   ├── thesis-spring-2026/
  │   │   ├── state.json          (window layout, positions)
  │   │   ├── agents.json         (agent context snapshots)
  │   │   ├── task-graph.json     (DAG and progress)
  │   │   └── metadata.json       (workspace properties)
  │   └── debugging-api/
  │       └── ...
  ├── inactive/
  │   ├── market-research-q1/
  │   └── ...
  ├── archived/
  │   ├── thesis-fall-2025/
  │   └── ...
  └── templates/
      ├── thesis-writing.template
      ├── code-debugging.template
      ├── research.template
      └── user-custom-1.template
```

### 8.2 Workspace Dashboard

A **Workspace Dashboard** provides overview of all workspaces:

```
┌─────────────────────────────────────────────────────┐
│ Workspace Dashboard                          [+] [☰] │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ACTIVE (1)                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Thesis: Spring 2026]                           │ │
│ │ Last modified: 2h ago  │  4 windows active      │ │
│ │ Progress: 18/25 chapters written                │ │
│ │ [Switch] [Modify] [Archive]                     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ INACTIVE (3)                                        │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ Debugging    │ │ Market       │ │ Q2 Planning  │ │
│ │ API          │ │ Research     │ │              │ │
│ │ 5d ago       │ │ 1w ago       │ │ 10d ago      │ │
│ │ [Switch]     │ │ [Switch]     │ │ [Switch]     │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                      │
│ TEMPLATES                                           │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ Thesis       │ │ Debugging    │ │ Planning     │ │
│ │ [New from]   │ │ [New from]   │ │ [New from]   │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Actions on dashboard:**
- **Switch** — Activate inactive workspace
- **Modify** — Edit workspace properties (name, agents, tools)
- **Archive** — Move completed workspace to archive
- **Restore** — Recover archived workspace
- **New from** — Create new workspace from template
- **Delete** — Permanently remove (with confirmation)

### 8.3 Workspace Relationships and Dependencies

Workspaces can have relationships:

**Parent-child (decomposition):**
- Thesis workspace (parent) may spawn sub-workspaces for individual chapters
- Planning workspace (parent) may spawn sub-workspaces for initiatives

**Sequential (workflow):**
- "Research" workspace feeds into "Writing" workspace
- When user finishes research and declares "switching to writing," the system offers to migrate relevant context (reading list, notes, citations)

**Collaborative (shared):**
- Multiple users may edit the same workspace
- State synchronization handled via conflict-resolution agent
- Each user has their own local view; changes merged with eventual consistency

---

## 9. Task Panel Integration and Visual DAG

### 9.1 Task Panel Location and Behavior

The **Task Panel** is a right-side pull-out bar (always accessible) that displays:
- Live task graph (visual DAG)
- Progress tracking
- Agent status and context
- Quick tool shortcuts

**Panel layout:**
```
┌───────────────────────────────────┐
│ TASK PANEL                    [←] │
├───────────────────────────────────┤
│ [Live Task Graph]                 │
│                                   │
│ ┌─ Goal: Write Chapter 3          │
│ │  ├─ Research topic      [✓ 100%]│
│ │  ├─ Outline chapter     [→ 60%] │
│ │  └─ Draft section       [⊘ 0%]  │
│ │     ├─ Intro (blocking: outline)│
│ │     ├─ Method (ready)           │
│ │     └─ Results (ready)          │
│ │                                 │
│ ├─ Parallel: Review citations [↻] │
│ └─ Parallel: Format TOC       [⊘] │
│                                   │
│ ─────────────────────────────────│
│ [Agent Status]                    │
│ • Research Agent    [⚡ active]    │
│ • Writing Agent     [🔄 standby]   │
│ • Planning Agent    [⊘ idle]       │
│                                   │
│ ─────────────────────────────────│
│ [Quick Tools]                     │
│ [Add Tool] [Open Terminal] [Help] │
│                                   │
└───────────────────────────────────┘
```

### 9.2 Visual DAG Representation

The task graph uses a **hierarchical, left-aligned DAG visualization**:

**Symbols:**
- `[✓]` — Completed (100%)
- `[→]` — In progress (partial %)
- `[⊘]` — Pending/blocked
- `[↻]` — Waiting for dependency
- `[⚡]` — Currently executing
- `[!]` — High priority or error
- Indentation — Hierarchy and dependency relationships
- Edges (arrows) — Dependency direction (blocked by, waiting for)

**Interaction:**
- Click a task to focus the corresponding window(s) in the workspace
- Expand/collapse task nodes to control detail level
- Hover to see task description and estimated time remaining
- Right-click to edit, assign to agent, or adjust priority
- Drag task to reorder (only if not locked by orchestrator)

### 9.3 Progress Tracking

Each task node shows:
- **Task name and description**
- **Progress percentage** (0–100%)
- **Estimated time remaining** (if available)
- **Assigned agent(s)** (if any)
- **Blocking dependencies** (if any)
- **Last updated timestamp**

**Progress updates:**
- LLM agents update progress automatically (every minute or on milestone)
- User can manually update progress via task panel
- System infers progress from application state (word count, files saved, tests passed)

### 9.4 Agent Context Display

When user hovers over or clicks an agent in the task panel:

```
┌─────────────────────────────────┐
│ Research Agent (Context Preview) │
├─────────────────────────────────┤
│ Status: Active                   │
│ Current task: Research citations │
│ Progress: 3 of 8 sources found   │
│                                  │
│ Context (last 50 messages):      │
│ • "Find citations on X-ray..."   │
│ • [loading source 1]             │
│ • [loading source 2]             │
│ • "Need medical-grade databases" │
│                                  │
│ [View Full Context] [Interrupt]  │
│ [Send Message] [Adjust Priority] │
│                                  │
└─────────────────────────────────┘
```

---

## 10. Workspace-Specific Examples

### 10.1 Coding Workspace — Bug Fix Scenario

**User intent:** "There's a memory leak in the renderer. Debug it."

**Composition algorithm:**
1. Parse intent → "debugging code" task
2. Query tools → code editor, debugger, profiler, terminal, git, test runner
3. Analyze task graph → identify tests that fail, code that leaks, hypothesis testing tasks
4. Assign priorities → code editor (95), debugger (90), profiler (85), tests (75), terminal (70), git (60)
5. Compose layout → editor center, debugger right, tests bottom-left, terminal left
6. Activate debugging agent with code, recent commits, failing tests

**Initial state:**
```
┌────────────────────────────────────────────────┐
│ [Git: Recent] [CODE] [Debugger: Inspection] │
│  (commits,    [Renderer] (breakpoints, vars)   │
│   diffs)      [Bug]                            │
├────────────────────────────────────────────────┤
│ [Test Runner]              [Task Panel]        │
│ (failing: test-renderer)   (hypothesis, tasks) │
│                                                │
│ [Terminal: Memory Profiler Output]             │
└────────────────────────────────────────────────┘
```

**Task graph:**
```
┌─ Goal: Fix memory leak
│  ├─ Identify leak location    [→ 40%] (debugging agent active)
│  ├─ Propose fix               [⊘]     (waiting for step 1)
│  ├─ Implement fix             [⊘]     (waiting for step 2)
│  ├─ Run tests                 [⊘]     (waiting for step 3)
│  └─ Verify with profiler      [⊘]     (waiting for step 4)
```

**Agent behavior:**
- Debugging agent suggests breakpoint locations based on code analysis
- Analyzes memory profile to narrow down leak
- Suggests fixes based on similar patterns in codebase
- Recommends tests to validate fix

### 10.2 Research Workspace — Literature Review

**User intent:** "I need to review the last 5 years of papers on quantum error correction."

**Composition:**
1. Intent → "research and summarization" task
2. Tools → browser, notes app, research agent, citation manager, summary generator
3. Task graph → find papers, categorize, summarize, synthesize
4. Assign priorities → research agent (95), browser (85), notes (80), citation manager (70)
5. Layout → research agent center-right, browser left, notes bottom, citations utility

**Initial state:**
```
┌────────────────────────────────────────────────┐
│ [Academic Search] [Research Agent]             │
│ (arXiv, Google    (Q&A, paper analysis,        │
│  Scholar,         suggested reading order)     │
│  ResearchGate)                                 │
├────────────────────────────────────────────────┤
│ [Notes: Synthesis]        [Citations: Manager] │
│ (user notes, summaries)   (BibTeX export)      │
│                                                │
│ [Task Panel: Research Path]                    │
│ (papers found, papers read, synthesis progress)
└────────────────────────────────────────────────┘
```

**Agent behavior:**
- Research agent searches academic databases
- Suggests papers in optimal reading order (build-up from foundational to cutting-edge)
- Summarizes papers automatically
- Identifies key insights and cross-references
- Exports reading list with citations

### 10.3 Planning Workspace — Quarterly Roadmap

**User intent:** "Let's plan Q2. We have 3 teams, 8 initiatives in the backlog, 12-week sprint."

**Composition:**
1. Intent → "planning and decomposition" task
2. Tools → canvas/whiteboard, spreadsheet, planning agent, timeline visualizer, team capacity tool
3. Task graph → collect requirements, decompose initiatives, allocate capacity, build timeline
4. Assign priorities → canvas (95), planning agent (90), capacity tool (80), timeline (75), spreadsheet (70)
5. Layout → canvas center, planning agent right, capacity/timeline bottom, spreadsheet left

**Initial state:**
```
┌────────────────────────────────────────────────┐
│ [Backlog] [PLANNING CANVAS]  [Planning Agent]  │
│ (initiatives,(roadmap, goals (decomposition,   │
│  stories)   dependencies)    constraints)      │
├────────────────────────────────────────────────┤
│ [Team Capacity Viz]   [Timeline: Gantt]        │
│ (utilization by week) (sprint milestones)      │
│                                                │
│ [Task Panel: Roadmap Structure]                │
│ (initiatives → epics → tasks, dependencies)    │
└────────────────────────────────────────────────┘
```

**Task graph:**
```
┌─ Goal: Complete Q2 roadmap
│  ├─ Collect requirements from teams [→ 100%]
│  ├─ Decompose 8 initiatives        [→ 60%]
│  ├─ Allocate capacity              [⊘]
│  ├─ Build detailed sprint plan     [⊘]
│  ├─ Share with stakeholders        [⊘]
│  └─ Track dependencies             [⊘]
```

**Agent behavior:**
- Planning agent decomposes initiatives into epics and tasks
- Flags capacity constraints and risks
- Suggests sprint boundaries based on dependencies
- Recommends task prioritization for maximum value delivery

---

## 11. Layout Rules and Constraints

### 11.1 Hard Constraints

These are inviolable:

| Rule | Rationale |
|------|-----------|
| Primary content window always visible | User must see their work (editor, canvas, chat) |
| Task panel always accessible (slide-out) | Progress visibility must not be blocked |
| Minimum window size enforced | Windows must have readable content |
| At least one window must have focus (Z-index > 0) | Input routing requires a focused window |
| Agent context cannot exceed available memory | Prevents runaway resource consumption |
| Undo/redo buffer limited to 100 layout changes | Prevents memory bloat |

### 11.2 Soft Constraints

These are heuristics the system optimizes for:

| Heuristic | Weight | Rationale |
|-----------|--------|-----------|
| Primary content window is largest | 100 | Central focus |
| Magnetically grouped windows remain close | 90 | Semantic unity |
| Right-to-left reading flow | 80 | Natural for Western languages |
| Agent panels stay right of content | 70 | Doesn't occlude main work |
| Utility windows collapse if <5% viewport | 60 | Declutter if space constrained |
| User customizations override defaults | 99 | User intent paramount |

### 11.3 Responsive Layout Adaptation

As viewport size changes (window resize, monitor change), the workspace responds:

**Large viewport (>2K width):**
- All windows visible; zones wide; horizontal layout optimal

**Medium viewport (1440–2K):**
- Primary windows fully visible; utility windows may stack or collapse

**Small viewport (<1440):**
- Primary window maximized; others hidden or minimized
- Stacking increases; zones become vertical

**Mobile/tablet:**
- Single-window focus mode; other windows in carousel/carousel tabs
- Task panel becomes bottom slide-up
- Magnetic attachment relaxed

---

## 12. Performance and Resource Management

### 12.1 Window Rendering Pipeline

Each window has a rendering lifecycle:

```
SPAWN → POSITION → ANIMATE IN → INTERACTIVE → [USER INTERACTS] → ANIMATE OUT → UNLOAD
```

**Performance optimization:**
- Off-screen windows are not rendered (virtual scrolling)
- Minimized windows render lightweight placeholder only
- Hidden windows are not rendered at all
- Magnetic attachment calculations run at 60 FPS max
- Layout recalculation is debounced (max once per 16ms)

### 12.2 Agent Resource Limits

Each workspace defines resource budgets:

```
workspace.resourceLimits = {
  agents: 5,              // Max concurrent agents
  contextTokens: 50000,   // Total context available
  memoryMB: 500,          // RAM for agent state
  apiCallsPerMin: 10,     // Rate limiting for external APIs
}
```

The orchestrator enforces these limits:
- If agent count exceeds limit, lower-priority agents are paused
- If context exceeds limit, oldest messages are archived
- If API rate limit reached, requests queue

---

## 13. State Synchronization and Conflict Resolution

### 13.1 Multi-Device Synchronization

If a user accesses the same workspace on multiple devices:

```
workspace.syncPolicy = "conflict-resolution"

// Device A modifies task priority
Device A: task[3].priority = "high"

// Device B modifies same task description
Device B: task[3].description = "Updated description"

// Sync conflict detected
conflictResolution.merge(
  deviceA.state,
  deviceB.state,
  mergeStrategy: "last-write-wins-by-field"
)
// Result: priority from A, description from B (both preserved)
```

**Conflict resolution strategies:**
- **Last-write-wins** — Timestamp-based; later write takes precedence
- **By-field** — Different fields can have different strategies
- **User resolution** — Present conflict to user for manual decision
- **Agent mediation** — Orchestrator decides based on semantic analysis

### 13.2 Eventual Consistency

Workspace state uses **eventual consistency** model:
- Local changes immediately visible on user's device
- Changes propagate to other devices asynchronously (typically <1s)
- Conflicts detected and resolved automatically (unless user interaction required)
- Full consistency reached within 5 seconds of last change

---

## 14. Summary and Implementation Checklist

**Core concepts to implement:**
- [ ] Workspace creation triggered by user intent detection
- [ ] Magnetic attachment physics for windows (snap zones, grouping)
- [ ] Layout composition algorithm (goal → tools → layout)
- [ ] Progressive disclosure (start simple, reveal complexity on request)
- [ ] Workspace orchestrators as specialized agents
- [ ] State preservation and restoration
- [ ] Undo/redo for layout changes
- [ ] Custom layout templates
- [ ] Workspace switching with animations
- [ ] Task panel with visual DAG representation
- [ ] Multi-workspace management (active, inactive, archived, templates)
- [ ] Workspace dashboard
- [ ] Agent context tracking and status display
- [ ] Responsive layout adaptation for different viewports
- [ ] Resource limits and enforcement
- [ ] Multi-device synchronization with conflict resolution
- [ ] Breadcrumb navigation and workspace switcher
- [ ] Workspace-specific examples fully implemented (coding, research, planning)

**Testing scenarios:**
- [ ] User declares "I'm working on X" → correct workspace composed
- [ ] User drags window → snaps to nearby window with smooth physics
- [ ] User resizes window → neighboring windows reflow
- [ ] User switches workspaces → state preserved exactly
- [ ] User modifies layout, saves template → template can create workspace
- [ ] Two agents in same workspace coordinate via message bus
- [ ] Task graph updates in real-time as agent makes progress
- [ ] Workspace scales responsively to different screen sizes
- [ ] Undo/redo works for layout changes without affecting content

---

**Document 14 of 26: COMPLETE**

**Next:** Document 15 — Accessibility and Universal Design Principles
