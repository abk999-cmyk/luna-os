# Document 3: Glossary & Conceptual Model
## LLM-Native Operating System Specification

**Document ID:** 03-glossary-and-conceptual-model.md
**Revision:** 1.0
**Status:** Normative
**Audience:** Claude Code implementation teams, OS architects, LLM engineers

---

## Overview

This document defines every term used in the LLM-native OS specification with mathematical precision. Each definition includes:
- **Formal Definition**: What the term means in the context of this system
- **Relationships**: How it connects to other concepts
- **Implementation Context**: How it manifests in code/state
- **Constraints**: Immutable properties and boundaries

This is the single source of truth for terminology. All implementation documents reference this glossary.

---

## AGENT HIERARCHY

### Conductor
**Formal Definition:** The top-level autonomous agent maintaining global context across all workspaces, responsible for resource allocation, cross-workspace coordination, and user goal tracking.

**Key Responsibilities:**
- Maintains a persistent living plan document for each active workspace
- Allocates computational resources (agent slots, memory budget) across workspaces
- Detects semantic connections between workspaces and surfacing them proactively
- Makes high-level prioritization decisions when resource constraints are reached
- Holds and updates the User Model based on observed interaction patterns
- Determines which agents should be spawned and when they should be terminated

**Relationships:**
- **Supervises**: All Workspace Orchestrators (N:1 cardinality — one Conductor, many orchestrators)
- **Consults**: User Model, Living Plans, Episodic Memory, Semantic Memory
- **Communicates With**: User via Living Plans, status reports, and escalation dialogs
- **Parent Of**: Workspace Orchestrators (but not leaf agents directly)

**Implementation Context:**
- Runs continuously, not per-task
- Has read access to all workspace scratchpads
- Cannot directly manipulate windows or files (delegates to subordinates)
- State is persisted across sessions
- Operates on turn-bounded time budgets (user provides 10 seconds of thinking time; Conductor decides how to allocate it across subordinates)

**Constraints:**
- Cannot execute arbitrary code or shell commands (delegates to leaf agents)
- Must respect user permissions model
- Cannot spawn more than N total leaf agents without user approval
- Cannot unilaterally delete user data

---

### Workspace Orchestrator
**Formal Definition:** A mid-level agent owning a specific semantic workflow context (e.g., "thesis chapter writing" or "code refactoring"). Manages leaf agents within its scope, translates high-level user goals into concrete actions, and reports status upward.

**Key Responsibilities:**
- Understands the domain-specific context (deadlines, dependencies, open questions)
- Spawns and kills leaf agents as work demands change
- Routes communications between leaf agents via the workspace scratchpad
- Escalates blockers to the Conductor
- Updates and maintains the Living Plan for its workspace
- Makes tactical decisions within its domain without waiting for Conductor input

**Relationships:**
- **Parent**: Conductor
- **Children**: Leaf Agents (N:M — one orchestrator, many leaf agents, each leaf can serve multiple orchestrators)
- **Owns**: One Workspace and its associated Task Graph
- **Reads/Writes**: Workspace Scratchpad, Task Graph, Living Plan
- **Peers**: Other Workspace Orchestrators (can request help through Conductor)

**Implementation Context:**
- One per active workspace
- Spawned on-demand when user establishes a new workflow context
- Lives for the lifetime of the workspace (unless user closes it)
- Has read-only access to other workspaces' scratchpads (for inter-workspace awareness)
- Operates on per-action time budgets (typically 1-5 seconds of thinking per action)

**Constraints:**
- Cannot allocate more resources than its workspace's budget
- Cannot spawn leaf agents beyond its configured maximum
- Cannot directly override user permissions
- Must escalate decisions about multi-workspace impact to Conductor

---

### Leaf Agent
**Formal Definition:** A specialized agent running inside a single window, optimized for one narrow task (e.g., code editing, terminal execution, web browsing). Communicates via the workspace scratchpad. Escalates complex problems to its parent Workspace Orchestrator.

**Synonyms:** Sub-Agent, Window Agent, Task Agent

**Key Responsibilities:**
- Execute the specific task assigned to its window
- Read task requirements from the workspace scratchpad
- Write progress updates and blockers to the scratchpad
- Request help or resources from Workspace Orchestrator when stuck
- Maintain state local to its window (scroll position, selection, etc.)

**Relationships:**
- **Parent**: Workspace Orchestrator
- **Siblings**: Other leaf agents in the same workspace
- **Workspace**: Assigned to exactly one workspace
- **Window**: Operates within one window (1:1 cardinality)
- **Communicates Via**: Workspace Scratchpad

**Implementation Context:**
- One per window
- Spawned when a window is created for a task
- Destroyed when the window is closed
- Has direct access to the window's DOM/canvas and its application state
- Time budgets are tight (500ms thinking per action typical)

**Constraints:**
- Cannot access other workspaces' windows or scratchpads
- Cannot spawn new agents (requests escalated to orchestrator)
- Cannot directly modify the Task Graph (writes status to scratchpad; orchestrator updates the graph)
- Cannot unilaterally change workspace configuration

---

### Sub-Agent
**Formal Definition:** Exact synonym for Leaf Agent. Used interchangeably in documentation to emphasize that the agent is subordinate and independently commandable.

**Usage Context:** Used when emphasizing independent control or when a Leaf Agent is being addressed directly by another agent or the user.

---

## MEMORY LAYERS

### Episodic Memory
**Formal Definition:** A time-indexed log of events (user actions, agent actions, state changes, outcomes) enriched with contextual metadata. Serves as the ground truth of "what happened."

**Structure:**
```
{
  "timestamp": "2026-03-23T14:32:15Z",
  "event_type": "user_action" | "agent_action" | "state_change" | "error",
  "actor": "user" | "conductor" | "orchestrator:workspace-id" | "leaf:window-id",
  "action": "string (human-readable description)",
  "workspace_id": "string",
  "window_id": "string (if relevant)",
  "context_tags": ["code_edit", "design_review", "bug_fix"],
  "input": "structured object (the command/input)",
  "output": "structured object (the result)",
  "duration_ms": number,
  "success": boolean
}
```

**Key Characteristics:**
- Immutable once written
- Indexed by timestamp, actor, workspace, and context tags
- Searchable by natural language query (LLM processes raw entries)
- Compressed and archived after N days (with summary metadata retained)
- Richer than conversation history — includes non-verbal actions (mouse clicks, selections, file operations)

**Relationships:**
- **Feeds**: Semantic Memory (periodic summarization)
- **Feeds**: Procedural Memory (pattern discovery)
- **Consulted By**: Replay and Teach system
- **Owned By**: OS kernel

**Implementation Context:**
- Stored in a time-series database or append-only log
- Latest N entries kept in fast memory; older entries archived
- Queried to answer: "What did I do yesterday?" "When did I last work on X?"

**Constraints:**
- Cannot be modified after creation (true append-only)
- User can redact entries for privacy (marks as deleted, not erased)
- Retention policy is configurable per user

---

### Semantic Memory
**Formal Definition:** A knowledge graph encoding facts, entities, relationships, and inferred patterns about the user and their world. Structured, not sequential.

**Structure:**
```
Entities: {user, project:thesis, tool:claude, person:advisor, concept:generative-models}
Relationships: {
  user --(owns)--> project:thesis,
  project:thesis --(has-goal)--> "complete by May 2026",
  project:thesis --(uses)--> tool:claude,
  person:advisor --(reviews)--> project:thesis,
  concept:generative-models --(related-to)--> project:thesis
}
Facts: {
  user.productivity_peak: "morning",
  user.prefers_async: true,
  project:thesis.deadline: "2026-05-15",
  project:thesis.current_status: "chapter-3-in-progress"
}
Inferred: {
  user.needs_help_with: [mathematical-proofs, citations-management],
  project:thesis.blocking_tasks: [literature-review, experimental-validation]
}
```

**Key Characteristics:**
- Queryable by relationship type ("What projects does the user own?")
- Supports entity disambiguation ("thesis" could refer to multiple projects)
- Includes inference rules (if X and Y, then Z is likely true)
- Continuously updated as new facts are observed
- Nodes can have confidence scores

**Relationships:**
- **Updated By**: Episodic Memory (facts extracted from events)
- **Consulted By**: Conductor (to understand user goals and context)
- **Consulted By**: Workspace Orchestrator (to understand domain specifics)
- **Consulted By**: User Model (to track preferences and patterns)

**Implementation Context:**
- Stored as a graph database or triple store
- LLM performs periodic batch updates to extract new facts from episodic memory
- Supports SPARQL-like queries or semantic search

**Constraints:**
- Must have sources/confidence attached to critical facts
- Cannot contain user secrets (API keys, passwords — stored separately)
- Outdated facts can be marked stale but should not be deleted without evidence

---

### Procedural Memory
**Formal Definition:** Learned workflows, patterns, and heuristics. Encodes "how the user works" and "when to do X, do steps A, B, C."

**Structure:**
```
Procedure: {
  "name": "user_writes_code_review_comment",
  "trigger": "user starts typing in code-review window",
  "learned_pattern": [
    { "step": 1, "action": "summarize_change", "confidence": 0.87 },
    { "step": 2, "action": "identify_concerns", "confidence": 0.92 },
    { "step": 3, "action": "suggest_alternatives", "confidence": 0.73 },
    { "step": 4, "action": "close_supportively", "confidence": 0.81 }
  ],
  "frequency": "15 times observed",
  "last_updated": "2026-03-20T10:00:00Z"
}
```

**Key Characteristics:**
- Discovered by Replay and Teach system watching user actions
- Confidence scores from observation frequency
- Can be manually created by user ("here's my workflow")
- Can be disabled per-instance by user
- Applies domain-specific and user-specific context

**Relationships:**
- **Discovered From**: Episodic Memory
- **Used By**: Leaf Agents (to predict next actions and suggest workflows)
- **Used By**: Workspace Orchestrator (to decide what agents to spawn)
- **Edited By**: User (via "teach" interface)

**Implementation Context:**
- Stored as pattern objects with metadata
- Queried to find matching procedures for current context
- Used to populate action suggestions and auto-complete

**Constraints:**
- Procedures with low confidence (<0.5) are not auto-executed without user approval
- Procedures cannot override explicit user commands
- User can delete any learned procedure at any time

---

### Working Memory
**Formal Definition:** The small, fast, structured context store of what is relevant RIGHT NOW for the current task. Not the full history or knowledge graph — just the active set of facts, actions, and references needed to execute the next few operations.

**Structure:**
```
{
  "current_task": { /* full task object */ },
  "active_workspace": "workspace-id",
  "active_window": "window-id",
  "visible_windows": ["window-1", "window-3", "window-5"],
  "recent_actions": [ /* last 3-5 actions */ ],
  "loaded_entities": { "user": {...}, "project:thesis": {...} },
  "action_registry": { /* Live Capability Manifest */ },
  "user_input": "last text or voice input",
  "scratchpad_excerpt": "relevant portion of current workspace scratchpad",
  "time_budget_remaining_ms": 2500
}
```

**Key Characteristics:**
- Size-bounded (typically <10KB of JSON)
- Aggressively managed — LLM decides what to load and unload
- Includes pointers to (not copies of) larger structures
- Includes the Live Capability Manifest (action registry)
- Updated once per agent action (synchronous with rendering)
- Acts as the "context" parameter in LLM function calls

**Relationships:**
- **Subset Of**: Episodic Memory, Semantic Memory, Procedural Memory
- **Includes**: Live Capability Manifest
- **Synced With**: Rendering (updated every frame)
- **Managed By**: OS kernel and agent schedulers

**Implementation Context:**
- Implemented as a structured JSON object
- Passed to LLM on every inference call
- Actively serialized/deserialized by OS kernel
- Size is a major performance lever — aggressively truncate if needed

**Constraints:**
- Must never exceed 15KB when serialized (or split into multiple LLM calls)
- Must be regenerated if stale (e.g., user closed a window)
- Cannot be the ground truth for anything (all facts must be backed by persistent memory)

---

## WORKSPACE & UI

### Workspace
**Formal Definition:** A semantic context representing a coherent workflow, NOT a physical window arrangement. A workspace is what the user intends to accomplish (e.g., "finish thesis chapter 3"), and the OS composes all relevant tools, agents, windows, and memory into a coordinated unit.

**Components:**
```
{
  "workspace_id": "thesis-ch3",
  "user_intent": "Complete draft of thesis chapter 3 by March 30",
  "semantic_domain": ["academic_writing", "research", "citations"],
  "windows": ["editor-1", "browser-1", "notes-1"],
  "orchestrator_id": "orch-thesis-ch3",
  "scratchpad": { /* workspace scratchpad object */ },
  "task_graph": { /* live task graph object */ },
  "living_plan": { /* persistent planning document */ },
  "memory_budget_bytes": 5242880,
  "status": "active" | "paused" | "archived",
  "created_at": "2026-03-15T09:00:00Z",
  "last_active": "2026-03-23T14:30:00Z"
}
```

**Key Characteristics:**
- Created implicitly when user establishes a new goal ("Let's work on the thesis")
- Contains multiple windows but is conceptually one thing
- Persists across sessions (user can resume a workspace days later)
- Has a clear entry point (Living Plan) and state visibility (Task Graph)
- Can be paused and resumed
- Can have strict resource limits (memory, agent count, execution time)

**Relationships:**
- **Managed By**: One Workspace Orchestrator
- **Supervised By**: Conductor
- **Contains**: Windows, Agents, Scratchpad, Task Graph, Living Plan
- **Owns**: Memory budget allocation
- **Associated With**: Semantic domain and user intent

**Implementation Context:**
- Workspace metadata stored in OS kernel state
- Workspace storage (scratchpad, task graph, plans) persisted to disk
- User can list/search/open/close workspaces from UI

**Constraints:**
- A window can only belong to one workspace at a time
- Workspaces are isolated unless conductor explicitly connects them
- Cannot exceed total system memory budget
- User must explicitly close a workspace to free resources

---

### Window
**Formal Definition:** A single task container on the screen representing a concrete tool or interface. A window is a viewport onto a specific application (code editor, terminal, web browser, note-taking tool). Windows are the visible units; workspaces are the semantic units.

**Properties:**
```
{
  "window_id": "editor-1",
  "window_type": "code_editor" | "terminal" | "browser" | "notes" | "canvas",
  "workspace_id": "thesis-ch3",
  "title": "thesis_chapter3.md",
  "position": { "x": 100, "y": 50 },
  "size": { "width": 800, "height": 600 },
  "z_index": 3,
  "state": "focused" | "unfocused" | "minimized",
  "attached_to": "window-id | null" (if magnetically attached),
  "leaf_agent_id": "leaf-editor-1",
  "content_reference": "file:///thesis/chapter3.md"
}
```

**Key Characteristics:**
- Resizable and repositionable by user or OS
- Can be minimized (removed from view but task persists)
- Exactly one window is in focus at any time
- Each window has exactly one leaf agent
- Can snap to other windows (magnetic attachment)
- Render state synced with visible content

**Relationships:**
- **Belongs To**: One Workspace
- **Operated By**: One Leaf Agent
- **May Attach To**: Another Window (magnetic attachment)
- **Managed By**: Window Manager (OS subsystem)

**Implementation Context:**
- Represented in OS render tree
- Window state persisted (user expects window layout to be remembered)
- Drag/resize operations handled by window manager, not agents

**Constraints:**
- Cannot exist without a workspace
- Cannot be in two workspaces simultaneously
- Cannot have more than one agent (by definition)
- Minimum and maximum size constraints enforced by OS

---

### Magnetic Attachment
**Formal Definition:** A visual and logical grouping mechanism where windows snap to each other like cards in a solitaire layout, implying hierarchy and containment without rigid tiling.

**Mechanics:**
- Windows can be dragged near each other and snap into aligned stacks
- Attached windows move as a unit when the parent is dragged
- Implies a visual hierarchy: parent window is "on top," attached child windows are "below" or "beside"
- Can be toggled on/off by user
- Does NOT imply data dependency — purely organizational

**Example:**
```
Code Editor (parent)
  ├─ Terminal (attached child)
  └─ Notes (attached child)
```

When the editor is dragged, the terminal and notes follow.

**Relationships:**
- **Applies To**: Windows
- **Part Of**: Workspace Layout
- **Visible In**: Rendering Layer

**Implementation Context:**
- Implemented as CSS or canvas positioning
- Parent window's position is primary; children are offset relative to parent
- Detachment is drag operation (child pulled away)

**Constraints:**
- Can create a stack (linear chain) but not arbitrary graphs
- Attachment is cosmetic — does not affect workspace semantics
- Breaking attachment does not close windows

---

### Task Graph
**Formal Definition:** A right-side pull-out panel displaying all active tasks and sub-tasks as a directed acyclic graph (DAG), showing dependencies, progress, blocking relationships, and which agents are working on what.

**NOT a flat task list.** Visualizes the structure of work, not just the list.

**Structure:**
```
{
  "workspace_id": "thesis-ch3",
  "tasks": [
    {
      "task_id": "task-1",
      "title": "Write thesis chapter 3 draft",
      "status": "in_progress",
      "progress": 0.65,
      "assigned_to": "orch-thesis-ch3",
      "subtasks": ["task-2", "task-3"],
      "depends_on": [],
      "blocked_by": ["task-4"],
      "estimated_minutes": 120,
      "created_at": "2026-03-15T09:00:00Z"
    },
    {
      "task_id": "task-2",
      "title": "Write introduction section",
      "status": "completed",
      "progress": 1.0,
      "assigned_to": "leaf-editor-1",
      "subtasks": [],
      "depends_on": [],
      "blocked_by": [],
      "estimated_minutes": 30,
      "created_at": "2026-03-15T09:00:00Z"
    },
    {
      "task_id": "task-4",
      "title": "Cite experimental results",
      "status": "blocked",
      "progress": 0.0,
      "assigned_to": "leaf-browser-1",
      "subtasks": [],
      "depends_on": ["task-5"],
      "blocked_by": [],
      "estimated_minutes": 45,
      "created_at": "2026-03-20T14:00:00Z"
    }
  ]
}
```

**Visual Representation:**
- Nodes are tasks; edges are dependencies or blocking relationships
- Node color/shape indicates status: in_progress (blue), completed (green), blocked (red), pending (gray)
- Edges labeled "blocks" or "depends on"
- Progress bars inside nodes show percent complete
- Agent ID attached to each node (who is working on this?)

**Key Characteristics:**
- Real-time updated (as tasks change status, graph updates)
- Clickable to drill down into task details
- Collapsible/expandable for subtask trees
- Shows critical path (longest dependency chain)
- Searchable by task title or assigned agent

**Relationships:**
- **Owned By**: Workspace
- **Updated By**: Workspace Orchestrator
- **Visible In**: Workspace UI
- **References**: Scratchpad (for detailed task context)

**Implementation Context:**
- Implemented as an SVG or canvas-based visualization
- Data structure is a DAG (topologically sortable)
- Rendered on every workspace orchestrator update

**Constraints:**
- Cannot contain cycles (no task can depend on itself, directly or indirectly)
- Every task must be assigned to an agent or marked "unassigned"
- Must be consistent with actual agent activity (graph is the source of truth)

---

### Live Task Graph
**Formal Definition:** Exact synonym for Task Graph, emphasizing that it is real-time and actively updated.

**Usage Context:** Used when emphasizing the dynamic, reactive nature of the graph and its immediate connection to agent activity.

---

## ACTION SYSTEM

### Action Space
**Formal Definition:** The complete set of operations available to LLMs and agents, defined as strongly-typed JSON schemas. The action space is NOT free-form text execution — every action is a structured function dispatch with explicit parameters, types, and return values.

**Core Principles:**
1. **Strict Typing**: Every action parameter has a declared type (string, number, boolean, enum, object, array)
2. **Immutable Definitions**: Core OS actions never change shape (versioned if extended)
3. **Discoverable**: Action registry published to agents in real-time
4. **Auditable**: Every invocation is logged (who called what, when, why)
5. **Validated**: OS validates all parameters before execution

**Relationships:**
- **Includes**: Core OS Actions, App-Registered Actions, LLM-Created Actions
- **Published By**: Live Capability Manifest
- **Invoked By**: All agents
- **Validated By**: OS action dispatcher

**Implementation Context:**
- Stored as a registry of JSON Schema definitions
- Action definitions include: name, parameters (with types), return schema, permission level
- Dispatcher validates parameters against schema before execution

**Constraints:**
- Cannot define arbitrary actions in free-form text
- All actions must have well-defined return values (for dependency tracking)
- Cannot call undefined actions

---

### Core OS Actions
**Formal Definition:** Immutable system actions shipped with the OS kernel. These are the fundamental operations for window management, memory access, agent lifecycle, and filesystem operations.

**Definitive List:**
```json
{
  "window.create": {
    "params": { "workspace_id": "string", "window_type": "enum", "title": "string" },
    "returns": { "window_id": "string" },
    "permission": "mid"
  },
  "window.close": {
    "params": { "window_id": "string" },
    "returns": { "success": "boolean" },
    "permission": "mid"
  },
  "window.focus": {
    "params": { "window_id": "string" },
    "returns": { "success": "boolean" },
    "permission": "low"
  },
  "window.resize": {
    "params": { "window_id": "string", "width": "number", "height": "number" },
    "returns": { "success": "boolean" },
    "permission": "low"
  },
  "window.move": {
    "params": { "window_id": "string", "x": "number", "y": "number" },
    "returns": { "success": "boolean" },
    "permission": "low"
  },
  "window.minimize": {
    "params": { "window_id": "string" },
    "returns": { "success": "boolean" },
    "permission": "low"
  },
  "window.restore": {
    "params": { "window_id": "string" },
    "returns": { "success": "boolean" },
    "permission": "low"
  },
  "agent.spawn": {
    "params": { "agent_type": "enum (conductor|orchestrator|leaf)", "parent_id": "string | null", "config": "object" },
    "returns": { "agent_id": "string" },
    "permission": "high"
  },
  "agent.kill": {
    "params": { "agent_id": "string" },
    "returns": { "success": "boolean" },
    "permission": "high"
  },
  "agent.get_status": {
    "params": { "agent_id": "string" },
    "returns": { "status": "object (agent state)" },
    "permission": "low"
  },
  "memory.read": {
    "params": { "scope": "enum (episodic|semantic|procedural|working)", "query": "string | object" },
    "returns": { "results": "array of objects" },
    "permission": "low"
  },
  "memory.write": {
    "params": { "scope": "enum", "data": "object", "source": "string" },
    "returns": { "success": "boolean", "id": "string" },
    "permission": "mid"
  },
  "filesystem.read": {
    "params": { "path": "string" },
    "returns": { "content": "string | null", "error": "string | null" },
    "permission": "mid"
  },
  "filesystem.write": {
    "params": { "path": "string", "content": "string" },
    "returns": { "success": "boolean", "error": "string | null" },
    "permission": "high"
  },
  "scratchpad.read": {
    "params": { "workspace_id": "string" },
    "returns": { "content": "object" },
    "permission": "low"
  },
  "scratchpad.write": {
    "params": { "workspace_id": "string", "path": "string", "data": "object" },
    "returns": { "success": "boolean" },
    "permission": "mid"
  },
  "task_graph.update": {
    "params": { "workspace_id": "string", "task_id": "string", "updates": "object" },
    "returns": { "success": "boolean" },
    "permission": "mid"
  }
}
```

**Key Characteristics:**
- Version-locked (shape never changes; new versions create new action names)
- Every action is documented in the OS specification
- Cannot be overridden or removed
- Permission levels (low/mid/high) determine supervision requirements

**Relationships:**
- **Part Of**: Action Space
- **Invoked By**: All agents
- **Governed By**: Permission model
- **Published By**: Live Capability Manifest

**Implementation Context:**
- Compiled into the OS kernel at build time
- Dispatcher has hardcoded routing for each action
- No dynamic lookup for core actions (performance-critical)

**Constraints:**
- Cannot be modified by user or app
- Must be backward-compatible across OS versions
- New actions must be added with explicit version bump

---

### App-Registered Actions
**Formal Definition:** Custom actions defined and registered by loaded application components (code editors, browsers, note-taking tools, etc.). Come from verified component packages. Similar in structure to Core OS Actions but scoped to a specific app.

**Example:**
```json
{
  "editor.insert": {
    "params": { "window_id": "string", "text": "string", "position": "number | {line: number, col: number}" },
    "returns": { "success": "boolean", "new_position": "number | object" },
    "permission": "mid"
  },
  "editor.lint": {
    "params": { "window_id": "string" },
    "returns": { "diagnostics": "array of {line, col, severity, message}" },
    "permission": "low"
  },
  "editor.run": {
    "params": { "window_id": "string" },
    "returns": { "output": "string", "exit_code": "number" },
    "permission": "high"
  },
  "browser.navigate": {
    "params": { "window_id": "string", "url": "string" },
    "returns": { "success": "boolean", "loaded_at": "timestamp" },
    "permission": "mid"
  },
  "browser.extract_text": {
    "params": { "window_id": "string" },
    "returns": { "text": "string", "title": "string", "url": "string" },
    "permission": "low"
  }
}
```

**Key Characteristics:**
- Registered at app load time
- Scoped to a window_id (actions on a specific app instance)
- Must have JSON schemas (published to agents)
- Can be versioned independently of core OS
- Verified at package load (no arbitrary code execution)

**Relationships:**
- **Part Of**: Action Space
- **Registered By**: App component packages
- **Invoked By**: Leaf agents primarily
- **Published By**: Live Capability Manifest

**Implementation Context:**
- Each app component exports an action registry
- OS validates registry structure at load time
- Actions dispatched via app-specific handler functions
- Return values must match declared schema

**Constraints:**
- Cannot shadow core OS action names
- Must include permission level (used for supervision)
- Actions are synchronous (async wrapped by app as needed)
- Cannot directly access other apps' windows

---

### LLM-Created Actions
**Formal Definition:** Dynamically defined actions created by an LLM at runtime for a specific task. Ephemeral by default, but can be promoted to persistent if the user frequently reuses them. Used to encode task-specific workflows without coding them into the OS.

**Example:**
```json
{
  "thesis_cite": {
    "params": { "browser_window": "string", "note_window": "string", "style": "enum (mla|apa|chicago)" },
    "returns": { "citation_added": "boolean", "position": "object" },
    "permission": "mid",
    "created_by": "orchestrator:thesis-ch3",
    "created_at": "2026-03-23T14:00:00Z",
    "usage_count": 3,
    "ephemeral": false
  }
}
```

**Key Characteristics:**
- Created by orchestrator or leaf agent on demand
- Encodes a multi-step workflow as a single action
- Includes usage statistics (count, last used)
- Default TTL is session (deleted on close) unless promoted
- Can be saved to persistent action library by user

**Relationships:**
- **Created By**: Workspace Orchestrator or Leaf Agent
- **Part Of**: Action Space (for current session)
- **May Become**: App-Registered Action (if user promotes)
- **Invoked By**: Any agent in the workspace

**Implementation Context:**
- Stored in working memory or scratchpad initially
- If promoted: persisted to action library JSON file
- Dispatcher must look up schema at invocation time (not hardcoded)

**Constraints:**
- Cannot shadow core OS or already-registered actions without user override
- Short TTL unless explicitly saved
- Cannot be distributed to other users (local only)
- Invocation counts used to suggest promotion

---

### Live Capability Manifest
**Formal Definition:** A dedicated, always-current region of working memory containing the action registry — all available actions for the current context (core OS actions, currently loaded app actions, and workspace-local LLM-created actions). State is pushed (OS updates the manifest) rather than pulled (agent queries for it).

**Structure:**
```json
{
  "timestamp": "2026-03-23T14:32:15Z",
  "core_actions": { /* all core OS actions */ },
  "app_actions": {
    "editor-1": { /* editor actions */ },
    "browser-1": { /* browser actions */ }
  },
  "workspace_actions": {
    "thesis_cite": { /* custom action */ },
    "thesis_format": { /* custom action */ }
  },
  "action_count": 42,
  "new_actions_since_last_update": ["thesis_cite"]
}
```

**Key Characteristics:**
- Updated automatically when apps load/unload or actions are created
- Copied into agent working memory on every turn
- Agents always know what actions are available
- Prevents stale action definitions
- Includes metadata (when manifest was last updated, what changed)

**Relationships:**
- **Contains**: Core OS Actions, App-Registered Actions, LLM-Created Actions
- **Part Of**: Working Memory
- **Updated By**: OS action dispatcher
- **Used By**: All agents (as the ground truth of what they can do)

**Implementation Context:**
- Regenerated on every significant event (app load, action creation/deletion)
- Included in working memory JSON passed to LLM
- Serialized with full schemas (not just names)

**Constraints:**
- Cannot include actions the current agent lacks permission for (filtered by permission model)
- Must be <5KB when serialized (performance constraint)
- Cannot reference actions that are not immediately available

---

### Action Schema
**Formal Definition:** A JSON Schema document (or subset thereof) defining the structure, types, and validation rules for a single action's parameters and return value.

**Example:**
```json
{
  "name": "editor.insert",
  "description": "Insert text at a position in the active editor",
  "parameters": {
    "type": "object",
    "properties": {
      "window_id": {
        "type": "string",
        "description": "The target editor window ID"
      },
      "text": {
        "type": "string",
        "description": "Text to insert"
      },
      "position": {
        "oneOf": [
          { "type": "number", "description": "Absolute character offset" },
          {
            "type": "object",
            "properties": {
              "line": { "type": "number" },
              "col": { "type": "number" }
            },
            "required": ["line", "col"],
            "description": "Line and column (0-indexed)"
          }
        ]
      }
    },
    "required": ["window_id", "text", "position"]
  },
  "returns": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "new_position": { "oneOf": [{ "type": "number" }, { "type": "object" }] },
      "error": { "type": "string" }
    },
    "required": ["success"]
  },
  "permission_level": "mid"
}
```

**Key Characteristics:**
- Enables validation before action invocation
- Used for auto-complete and type hints in agent planning
- Supports complex types (unions, nested objects, enums)
- Machine-parseable (enables static analysis)

**Relationships:**
- **Used By**: Action dispatcher (for validation)
- **Used By**: LLM (for understanding parameter types)
- **Part Of**: Action definition

**Implementation Context:**
- JSON Schema standard (with minor extensions for permission levels)
- Parsed by dispatcher before execution
- Used to generate documentation and examples

**Constraints:**
- Must be deterministic (same input, same validation result)
- Cannot reference schemas not defined in the system
- Parameter constraints must be reasonable (not overly permissive)

---

## COMMUNICATION

### Scratchpad / Blackboard
**Formal Definition:** A shared structured workspace (JSON document) within a workspace where agents leave notes, status updates, requests, and shared context for each other. Not synchronous message passing — persistent, readable, updated asynchronously.

**Structure:**
```json
{
  "workspace_id": "thesis-ch3",
  "timestamp_updated": "2026-03-23T14:32:15Z",
  "task_status": {
    "task-1": {
      "current_status": "in_progress",
      "progress": 0.65,
      "agent_working": "leaf-editor-1",
      "last_update": "2026-03-23T14:30:00Z",
      "blockers": ["Need citations from browser"],
      "next_steps": ["Complete literature section", "Add discussion"]
    }
  },
  "shared_context": {
    "deadline": "2026-03-30T23:59:59Z",
    "document_title": "Generative Models in Natural Language Processing",
    "key_references": [
      { "id": "ref-1", "title": "Attention Is All You Need", "url": "..." },
      { "id": "ref-2", "title": "BERT: Pre-training", "url": "..." }
    ]
  },
  "agent_requests": {
    "to_browser_agent": {
      "request_id": "req-1",
      "content": "Find papers about transformer training stability",
      "priority": "high",
      "requested_by": "leaf-editor-1",
      "requested_at": "2026-03-23T14:25:00Z",
      "status": "pending"
    }
  },
  "notes": {
    "note-1": {
      "content": "User mentioned preferring concise explanations",
      "author": "orchestrator:thesis-ch3",
      "timestamp": "2026-03-20T10:00:00Z"
    }
  }
}
```

**Key Characteristics:**
- Writes are idempotent (overwrite old values)
- Agents poll/subscribe to changes (not pushed)
- Structured (not free-form text) to enable parsing
- Workspace-scoped (each workspace has one scratchpad)
- Persisted across sessions

**Relationships:**
- **Belongs To**: One Workspace
- **Read/Written By**: All agents in the workspace
- **Synced With**: Task Graph (task status kept consistent)
- **Consulted By**: Workspace Orchestrator (for coordination)

**Implementation Context:**
- Stored as a JSON document in persistent storage
- Updated via `scratchpad.write` action
- Read via `scratchpad.read` action (entire doc or queried subset)
- Can be searched by LLM for status/context

**Constraints:**
- Cannot be queried in real-time (polling is required)
- Must be kept under 1MB (or archived into history)
- Writes should be atomic (no partial updates)
- No distributed transactions (single-writer recommended per section)

---

### Escalation
**Formal Definition:** A communication protocol where a Leaf Agent encounters a problem it cannot solve alone and bubbles it up to its parent Workspace Orchestrator with explicit context about what failed and what is needed.

**Escalation Structure:**
```json
{
  "escalation_id": "esc-1",
  "from": "leaf-editor-1",
  "to": "orchestrator:thesis-ch3",
  "escalated_at": "2026-03-23T14:32:15Z",
  "problem": "Cannot find citation format for this paper. Requires human decision.",
  "context": {
    "paper": "Smith et al. 2025",
    "attempted_actions": ["editor.lint", "browser.search"],
    "error": "No citation metadata found"
  },
  "requested_action": "Please determine if this should be cited as a preprint or journal article",
  "priority": "high",
  "timeout_seconds": 300
}
```

**Key Characteristics:**
- Explicit problem statement (not just "I failed")
- Includes context (what was tried, what error occurred)
- Specifies what help is needed (decision, new agent, resource)
- Can have timeout (expect response within N seconds)
- Logged for procedural learning

**Relationships:**
- **Initiated By**: Leaf Agent
- **Handled By**: Workspace Orchestrator (may delegate to Conductor)
- **May Trigger**: New agent spawn, resource reallocation, user request
- **Recorded In**: Episodic Memory

**Implementation Context:**
- Written to scratchpad's `agent_requests` section
- Orchestrator polls scratchpad periodically
- Escalation can be resolved by orchestrator spawning a new agent or by seeking user guidance

**Constraints:**
- Cannot escalate beyond Workspace Orchestrator (agents can't call Conductor directly)
- Timeout enforced by orchestrator (escalation expires if not addressed)
- Escalation implies the leaf agent is waiting (blocking)

---

### Inter-Workspace Communication
**Formal Definition:** The Conductor's mechanism for detecting semantic connections between active workspaces and surfacing coordination opportunities to orchestrators. Not direct agent-to-agent messaging — mediated by the Conductor through the Semantic Memory.

**Mechanism:**
1. Conductor continuously queries Semantic Memory for relationships between active workspaces
2. If two workspaces reference related entities (same project, overlapping deadlines, shared tasks), Conductor creates a connection record
3. Conductor optionally suggests to orchestrators that they coordinate
4. Orchestrators can request shared context or agent assistance from the Conductor

**Example:**
```
Workspace A: "Writing thesis chapter 3"
Workspace B: "Creating figures for thesis"
Connection: Both workspaces reference project:thesis
Conductor: Suggests to Orch-A and Orch-B that they align on figure references
```

**Key Characteristics:**
- Semantic, not syntactic (based on entity relationships)
- Conductor initiates, not agents
- Optional coordination (orchestrators can ignore suggestions)
- Reduces the need for explicit workspace handoffs
- Logged for learning user's multi-workspace patterns

**Relationships:**
- **Facilitated By**: Conductor
- **Coordinated By**: Workspace Orchestrators
- **Enabled By**: Semantic Memory
- **Visible In**: Living Plans (connections noted)

**Implementation Context:**
- Conductor maintains a "workspace graph" of connections
- Connections are advisory (don't force orchestrators to communicate)
- Can be visualized to user as a multi-workspace dependency diagram

**Constraints:**
- Cannot force agents from different workspaces to interact
- Requires orchestrators to be active (no communication between paused workspaces)
- Semantic memory must be accurate for connections to be meaningful

---

## INPUT

### Text Bar
**Formal Definition:** The primary input mechanism at the bottom of the screen. Default mode is free-form text input. Right-swipe gesture activates voice input mode.

**Properties:**
```
{
  "text_bar": {
    "position": "bottom of screen",
    "default_mode": "text_input",
    "placeholder": "What would you like to do?",
    "can_swipe_right_for_voice": true,
    "history": [ /* recent inputs */ ],
    "autocomplete": true,
    "spell_check": true
  }
}
```

**Input Processing:**
1. User types text or speaks
2. Input captured and parsed for intent
3. Parsed intent routed to active workspace orchestrator
4. Orchestrator translates intent to actions

**Key Characteristics:**
- Always visible and ready for input
- Remembers input history (user can see past commands)
- Auto-completes based on recent commands and action names
- Single input point for all user interaction with OS

**Relationships:**
- **Connects To**: Active Workspace Orchestrator
- **Input Source For**: All user commands
- **Visible In**: UI always

**Implementation Context:**
- Rendered as a text input field at bottom of screen
- On-screen keyboard available on touch devices
- Can be activated by physical keyboard at any time

**Constraints:**
- Cannot be hidden or disabled
- Input limit ~1000 characters (very long inputs split)
- Must be always accessible

---

### Ambient Voice Mode
**Formal Definition:** An always-listening voice input mode that parses commands from natural conversation, even when not directly addressing the OS. Example: User says "I think this function should be recursive" while reading code, and the code editor agent picks it up.

**Mechanics:**
1. Microphone always listening (with user opt-in)
2. Voice processed through speech-to-text
3. Intent parser detects OS commands vs. user thinking aloud
4. Context-aware routing: "Recursive" in code editor context → suggest recursion refactor
5. Leaf agent in active window decides if it's a command or just commentary

**Key Characteristics:**
- Requires explicit user opt-in (privacy concern)
- Filters out music, background noise (ML-based)
- Requires high confidence to act (>80%)
- Provides visual feedback when listening
- Can be toggled on/off globally or per-workspace

**Relationships:**
- **Activates**: Leaf agents or Workspace Orchestrator
- **Input Source**: Voice (alternative to text bar)
- **Managed By**: User permissions model

**Implementation Context:**
- Voice-to-text via cloud API or on-device model
- Intent classification via lightweight NLP
- Low-confidence utterances ignored (not acted upon)

**Constraints:**
- Cannot be enabled without user consent
- High false-positive rate means high confidence threshold
- Should NOT take destructive actions based on ambient voice alone (requires explicit text confirmation)
- Limited to user's active language

---

### Drop-as-Context
**Formal Definition:** Any object (file, text, image, URL, window content) dropped onto the screen is instantly added as context to the active workspace, making it immediately available to agents.

**Mechanism:**
1. User drags a file from file explorer or another application
2. Object is dropped onto a window or workspace area
3. OS detects drop event and extracts object content/reference
4. Content is added to workspace scratchpad under `shared_context` section
5. Workspace orchestrator is notified

**Example:**
```
User drags "paper.pdf" onto the thesis workspace
→ PDF file added to shared context
→ Orchestrator notifies browser and editor agents
→ Browser agent can extract text, editor agent can cite it
```

**Key Characteristics:**
- Works with files, URLs, text, images
- No explicit action needed by user (drop is the action)
- Instant availability (no copying/uploading)
- Preserves provenance (where did this come from?)

**Relationships:**
- **Updates**: Workspace scratchpad
- **Notifies**: Workspace Orchestrator
- **Input Method**: Drag-and-drop (non-text input)
- **Triggers**: Context loading in agents

**Implementation Context:**
- Handled by window manager (drop event listener)
- File content extracted on drop (async if large)
- URL downloads triggered on demand (not immediately)
- Images rendered as embedded data URIs in scratchpad

**Constraints:**
- Cannot handle truly huge files (>1GB, streamed instead)
- Cannot accept arbitrary binary formats (only known types)
- Requires explicit user drag-and-drop (no drag-and-drop from user to agent without workspace context)

---

### Spatial Reference Map
**Formal Definition:** The OS maintains a real-time map of what is rendered where on the screen. Enables pronouns like "this" and "that" to resolve to actual objects when used with pointing/clicking while speaking.

**Structure:**
```
{
  "viewport": { "width": 1920, "height": 1080 },
  "rendered_elements": [
    {
      "id": "editor-1",
      "type": "window",
      "bounds": { "x": 100, "y": 50, "width": 800, "height": 600 },
      "label": "thesis_chapter3.md",
      "content_type": "code_editor"
    },
    {
      "id": "browser-1",
      "type": "window",
      "bounds": { "x": 950, "y": 50, "width": 900, "height": 600 },
      "label": "paper.pdf",
      "content_type": "browser"
    },
    {
      "id": "task_graph_panel",
      "type": "ui_panel",
      "bounds": { "x": 1600, "y": 0, "width": 300, "height": 1080 },
      "label": "Active Tasks"
    }
  ]
}
```

**Key Characteristics:**
- Updated on every render (frame)
- Includes all visible UI elements (windows, panels, buttons)
- Used to resolve spatial references in voice/pointing input
- Enables "point at that paragraph and explain it"
- Enables "move this window over there"

**Relationships:**
- **Updated By**: Rendering engine
- **Used By**: Voice input processor
- **Part Of**: Working Memory

**Implementation Context:**
- Built from render tree (computed positions of all elements)
- Kept in fast memory for low-latency lookup
- Used to compute which element is at a clicked coordinate

**Constraints:**
- Only includes visible elements (minimized windows not in map)
- Precision limited by rendering resolution
- Updated synchronously with render (no stale map)

---

## INTELLIGENCE

### User Model
**Formal Definition:** The OS's continuously-updated understanding of the user: cognitive style, work patterns, preferences, interaction patterns, communication style, productivity rhythms. Evolves through observation. User can inspect and edit it directly.

**Structure:**
```json
{
  "user_id": "user-123",
  "created_at": "2026-01-15",
  "last_updated": "2026-03-23T14:30:00Z",
  "preferences": {
    "input_style": "text",
    "ambient_voice": false,
    "supervision_level": "mid",
    "ui_density": "balanced",
    "theme": "light"
  },
  "cognitive_style": {
    "preferred_abstraction_level": "high",
    "verbose_explanations": false,
    "likes_examples": true,
    "prefers_structure": true
  },
  "work_patterns": {
    "productivity_peak_hours": ["09:00-11:00", "14:00-16:00"],
    "typical_session_duration_minutes": 120,
    "multi_tasking": true,
    "deadline_driven": true,
    "procrastination_pattern": "high"
  },
  "domain_expertise": {
    "machine_learning": "expert",
    "academic_writing": "advanced",
    "coding": "expert",
    "system_design": "intermediate"
  },
  "preferred_workflows": [
    {
      "name": "code_review",
      "steps": ["read_code", "identify_issues", "suggest_alternatives", "explain_reasoning"],
      "confidence": 0.92
    }
  ],
  "communication_style": {
    "formality": "casual",
    "response_detail": "medium",
    "likes_questions": true
  }
}
```

**Key Characteristics:**
- Built from episodic and procedural memory (observed patterns)
- Machine-readable (enables agents to tailor interactions)
- User-editable (can manually adjust)
- Confidence scores on inferred properties
- Evolves over time (older observations weighted less)

**Relationships:**
- **Built From**: Episodic Memory, Procedural Memory
- **Used By**: All agents (to tailor interaction style)
- **Updated By**: Conductor (periodically from observation)
- **Edited By**: User (via settings interface)

**Implementation Context:**
- Stored as JSON document
- Periodically recomputed from memory (e.g., every 100 interactions)
- Selectively loaded into working memory
- Can be versioned/historicized (user can see how model changed)

**Constraints:**
- Cannot include sensitive personal data (PII, medical, financial)
- Inferred properties must have sources/confidence
- User's explicit edit overrides inference (user has final say)
- Must be explainable (user can see why OS thinks X about them)

---

### Living Plan
**Formal Definition:** The Conductor's persistent planning document for each active workspace. Updated as work progresses, obstacles arise, and priorities change. Not just reactive — proactively maintained. Serves as a one-document overview of the workspace state and direction.

**Structure:**
```markdown
# Living Plan: Thesis Chapter 3
**Status:** In Progress
**Created:** 2026-03-15
**Last Updated:** 2026-03-23 14:30
**Deadline:** 2026-03-30

## Goal
Complete a draft of thesis chapter 3 (Generative Models in NLP) with 80% of citations resolved.

## Current State
- Introduction: DONE (2,500 words)
- Background section: 60% complete (4,000 of 6,500 words)
- Proposed method: NOT STARTED
- Experimental results: BLOCKED (waiting for simulation results)
- Discussion: NOT STARTED

## Critical Path
1. Complete background section (3 hours remaining)
2. Write proposed method (4 hours)
3. Wait for simulation results (external: ~24 hours)
4. Add results and discussion (3 hours)

## Blockers
- **External:** Simulation code still running, estimated 18 hours remaining
- **Internal:** User hasn't finalized citation format (MLA vs. APA)

## Next Actions
1. [Email advisor for citation format preference]
2. [Leaf agent: Continue background section while waiting]
3. [Keep browser agent on standby for additional references]

## Open Questions
- Should we include raw simulation output or just summary stats?
- Do we need to compare against baseline models?

## Resources Allocated
- Leaf agent: editor-1 (thesis writing)
- Leaf agent: browser-1 (research/references)
- Expected total time: 10 hours (mostly waiting for external results)

## Recent Changes
- User decided NOT to include user study (saves 1 week)
- New reference from advisor: Smith et al. 2025 (added to background)
```

**Key Characteristics:**
- Human-readable (markdown format)
- Single document per workspace
- Updated by Conductor based on agent activity
- Can be read by user at any time for full workspace overview
- Proactive (anticipates blockers, suggests next steps)

**Relationships:**
- **Created/Maintained By**: Conductor
- **Describes**: Workspace state and goals
- **References**: Task Graph, Scratchpad
- **Visible To**: User (accessible from UI)

**Implementation Context:**
- Stored as a markdown file in workspace storage
- Updated asynchronously (not real-time) after major changes
- Can be manually edited by user (edits incorporated on next update)
- Rendered to user as a readable document, not raw JSON

**Constraints:**
- Must be humanly readable (no nested JSON in the plan)
- Updates must be intelligent (not just data dumps)
- Cannot make irreversible decisions (only recommendations)
- Must stay accurate (stale plans lose trust)

---

### Progressive Disclosure
**Formal Definition:** The LLM's policy of deciding how much complexity to show or explain based on context. Start simple, add detail on request or when genuinely helpful. Avoids overwhelming the user with irrelevant technical depth.

**Principles:**
1. **Default to simplicity**: Explain in the fewest necessary terms
2. **Detect expertise**: Tailor detail level to user's domain knowledge
3. **Provide escape hatches**: "Want more details?" links to deeper content
4. **Context-driven**: Show what's relevant now, hide what isn't
5. **Progressive deepening**: Ask before diving deep

**Examples:**
```
Simple (default):
"I found the bug. It's in the loop condition."

With expertise signal (more detail):
"The off-by-one error is in the loop termination:
 for i in range(len(list)) should be range(len(list)-1)"

With explicit request for depth:
"This is a classic fencepost error. Common in C where you have
 to manually manage array bounds. Python's range() handles this,
 but it's easy to forget that range() is exclusive of the upper bound..."
```

**Key Characteristics:**
- Enabled by User Model (which tracks expertise)
- Applied to all communication (explanations, code, UI)
- Interactive (user can ask for more or less)
- Context-aware (different detail in different domains)

**Relationships:**
- **Uses**: User Model
- **Applies To**: All agent outputs
- **Controlled By**: User preferences

**Implementation Context:**
- Implemented as a pass in agent output generation
- User Model queried to determine detail level
- Markdown structure allows embedding expandable details

**Constraints:**
- Cannot hide critical information just because it's complex
- Safety-critical information always shown fully
- User can disable progressive disclosure globally

---

### Replay and Teach
**Formal Definition:** The OS's ability to observe manual user actions, extract procedural patterns, and propose learned workflows to the user. If the user frequently does steps A, B, C in sequence, the OS learns this and offers it as a reusable procedure.

**Mechanism:**
1. OS watches user actions (mouse, keyboard, clicks) in episodic memory
2. Pattern discovery algorithm looks for recurring sequences
3. On detection (with high confidence, >0.8), OS proposes: "I notice you often [A, B, C]. Should I create a workflow for this?"
4. User can approve → workflow added to procedural memory
5. Next time similar context appears, offer is suggested

**Example:**
```
Observed: User repeatedly does:
  1. Open browser
  2. Search for a term
  3. Copy result to note window
  4. Format with date and source

OS: "I notice you research and log references the same way each time.
    Should I create a 'Log Reference' workflow?"

User approves →
  workflow.log_reference = [
    browser.search(query),
    extract_result(content),
    note.append_dated(content)
  ]

Next time user opens browser in thesis workspace:
OS suggests: "Add reference? (uses your learned workflow)"
```

**Key Characteristics:**
- Non-intrusive (suggested, not automatic)
- Confidence-based (only suggests high-confidence patterns)
- User controls what's learned
- Patterns scoped to domain/context
- Can be disabled per-user

**Relationships:**
- **Observes**: Episodic Memory
- **Creates**: Procedural Memory
- **Suggests**: Workflows to user
- **Enables**: LLM-Created Actions

**Implementation Context:**
- Pattern detection runs async (not blocking)
- Frequency analysis to find repeated sequences
- Requires >2 observations of a pattern to trigger suggestion
- User approval explicitly required (no auto-learning)

**Constraints:**
- Cannot learn destructive patterns (delete, overwrite) without user explicit approval
- High confidence threshold (avoid false patterns)
- User can disable learning globally
- Learned workflows scoped to user only (not shared)

---

## PERMISSIONS

### Supervised Mode
**Formal Definition:** OS asks for user confirmation before executing actions above a certain permission level (typically "mid" and "high"). User sees what the OS intends to do and can approve, modify, or reject.

**Permission Levels:**
```
LOW (no supervision):
  - window.focus, window.resize, window.move
  - memory.read
  - browser.navigate (display only, can't execute)
  - editor.lint (read-only analysis)

MID (supervised):
  - window.create, window.close
  - filesystem.write
  - scratchpad.write
  - agent.spawn (new agents)
  - browser.navigate (actually load page)
  - editor.insert, editor.delete (modify code)

HIGH (always supervised):
  - agent.kill
  - filesystem.delete or overwrite critical files
  - External API calls (with credentials)
```

**Interaction Flow:**
```
1. Leaf agent decides to create a new window
2. window.create action has permission="mid"
3. OS routes to permission checker
4. User sees: "Create new window: 'Notes'? [Approve] [Deny] [Modify]"
5. User clicks Approve
6. Action executes
7. Logged to episodic memory
```

**Key Characteristics:**
- Default for normal OS usage
- Can be toggled globally or per-action-type
- User can set rules ("always allow script execution" or "never delete files")
- Visual confirmation required (not just text)

**Relationships:**
- **Applied By**: OS action dispatcher
- **Checked Against**: User permissions model
- **Tracked In**: Episodic Memory

**Implementation Context:**
- Permission checker intercepts actions before dispatch
- Supervisor UI shows action details and options
- User response captured and optionally remembered for future

**Constraints:**
- Cannot auto-approve destructive actions even with rules
- Cannot override explicit supervision rules without user interaction
- Supervision adds latency (user must respond)

---

### Autonomous Mode
**Formal Definition:** OS acts freely without asking for permission, logging all actions to episodic memory. Undo becomes critical. User enables this for trusted workspaces or when they want rapid iteration.

**Activation:**
```
User enables: "Settings > Permission Model > Autonomous Mode"
Or: Per-workspace toggle in Living Plan
```

**Constraints in Autonomous Mode:**
```
STILL NOT ALLOWED (even in autonomous mode):
  - Destructive file operations on user data (filesystem.delete)
  - Agent termination without backoff
  - External API calls with credentials
  - Creating new user accounts

ALLOWED FREELY:
  - Window management
  - Agent spawning
  - Memory writes
  - Code editor operations
  - File reads, writes (non-destructive)
```

**Key Characteristics:**
- Much faster (no UI prompts)
- Higher risk (can do more damage)
- Complete auditability (everything logged)
- Reversible via undo (critical)
- Can be scoped to trusted workspaces

**Relationships:**
- **Overrides**: Supervision requirement
- **Requires**: Trust (user explicit choice)
- **Depends On**: Undo system
- **Logged To**: Episodic Memory (100%)

**Implementation Context:**
- Permission checker skips user prompt if mode is autonomous
- All actions still logged with full context
- Undo system must be functional (fail-safe)

**Constraints:**
- Cannot be enabled globally by default (safety)
- High-permission actions still supervised
- User can revert to supervised mode at any time
- Workspace must be explicitly trusted

---

### Custom Mode
**Formal Definition:** User defines per-action-type permission rules. Example: "Always allow editor operations, always ask for network access, never allow script execution."

**Example Config:**
```json
{
  "rules": [
    { "action": "editor.*", "permission": "allow" },
    { "action": "network.*", "permission": "ask" },
    { "action": "filesystem.delete", "permission": "deny" },
    { "action": "agent.spawn", "permission": "ask" },
    { "action": "browser.execute_javascript", "permission": "deny" }
  ]
}
```

**Mechanism:**
1. Permission checker matches action name against rules
2. First matching rule determines action
3. If "ask": show supervision prompt
4. If "allow": execute
5. If "deny": reject with explanation

**Key Characteristics:**
- Fine-grained control
- Can be edited at any time
- Can be different per-workspace
- Can include regex patterns ("editor.*")
- Can have exemptions ("except for this file")

**Relationships:**
- **Defined By**: User
- **Enforced By**: Action dispatcher
- **Applied To**: All agent actions

**Implementation Context:**
- Stored as rule list (JSON or YAML)
- Rules evaluated in order (first match wins)
- Can be edited from settings UI

**Constraints:**
- Cannot override system safety constraints
- Destructive operations require explicit allow (never implicit)
- Rules must be machine-readable
- Cannot create rules that conflict

---

### Branching Undo
**Formal Definition:** A version-control-style undo system where actions are organized in a tree, not a linear stack. User can "undo" to a previous state and then take a different path, creating a branch. Example: "Go back to before the refactor but keep the tests."

**Tree Structure:**
```
Initial state
├── Change 1: Refactor function X
│   ├── Change 2a: Add tests
│   │   └── Change 3a: Fix lint errors ← current
│   └── (user goes back to 2a, takes different path)
│       └── Change 2b: Refactor differently
│           └── Change 3b: ...
└── Change 2c: (different branch from initial)
```

**User Interaction:**
```
User: "I want to undo the refactor, but keep the test I wrote"
OS: Shows tree with branches
User: "Go back to 2a (after Add tests), then I'll redo the refactor differently"
OS: Reverts to that state, but keeps the test file
```

**Key Characteristics:**
- Non-destructive (no history lost)
- Enables experimentation ("try this approach, but keep the option to revert")
- Workspace-scoped (per workspace undo tree)
- Time-bounded (old branches pruned after N days)
- Queryable ("what changed between branch A and B?")

**Relationships:**
- **Records**: All actions (from episodic memory)
- **Enables**: Safe experimentation
- **Part Of**: Autonomous Mode safety
- **Visible In**: A branch visualization UI

**Implementation Context:**
- Stored as a git-like object graph
- Each action is a node; edges are dependencies
- Can be compressed/pruned for performance
- Branches can be named/tagged by user

**Constraints:**
- Cannot undo truly external effects (email sent, API call made)
- Storage grows with experimentation (pruning needed)
- Cannot undo between sessions (tree starts fresh per session)
- Complex merges not supported (linear branches only)

---

## RENDERING

### Component Primitives
**Formal Definition:** High-level, reusable building blocks for composing dynamic UIs. LLMs use these to declare interfaces without coding low-level rendering logic.

**Available Primitives:**
```
1. DataTable
   - Rows, columns, sorting, filtering, pagination
   - Example: Task list, reference library

2. InteractiveMap
   - 2D spatial display with zoomable regions
   - Example: Task graph, dependency diagram

3. Timeline
   - Temporal sequence of events
   - Example: Episodic memory view, project timeline

4. Canvas
   - Arbitrary drawing surface for custom visuals
   - Example: Whiteboard, diagram editor

5. CodeEditor
   - Syntax highlighting, line numbers, folding, lint diagnostics
   - Example: Script editor, markdown editor

6. Chat
   - Conversational message thread with formatting
   - Example: Agent status updates, user instructions

7. InputField
   - Text, number, date, dropdown, multi-select
   - Example: Task name, deadline, priority

8. ProgressBar
   - Visual representation of completion percentage
   - Example: Task progress, file upload

9. Grid / Layout
   - Flexible container for positioning children
   - Example: Dashboard panels, card layout

10. Modal / Dialog
    - Overlay for confirmations and forms
    - Example: Supervision prompts, settings dialogs
```

**Declaration Example:**
```json
{
  "type": "DataTable",
  "props": {
    "rows": [ /* task data */ ],
    "columns": [
      { "name": "title", "label": "Task", "sortable": true },
      { "name": "status", "label": "Status", "filterable": true },
      { "name": "progress", "label": "Progress", "renderer": "ProgressBar" }
    ],
    "onRowClick": "select_task"
  }
}
```

**Key Characteristics:**
- Declared, not imperative (LLM specifies WHAT, not HOW)
- Type-safe (props validated against schema)
- Responsive (adapt to window size)
- Accessible (ARIA labels, keyboard nav)
- Fast rendering (OS optimizes)

**Relationships:**
- **Used By**: LLM to compose interfaces
- **Implemented By**: OS rendering engine
- **Part Of**: Dynamic App/Widget system

**Implementation Context:**
- Each primitive is a React component or equivalent
- Props schema defined (enables validation)
- Renderer maps primitive to screen coordinates
- Responsive layout engine handles resizing

**Constraints:**
- Limited to predefined types (can't add arbitrary widgets)
- Props must match schema (strict validation)
- Cannot access DOM directly (goes through primitives)
- Performance optimized (fast rendering is critical)

---

### Dynamic App/Widget
**Formal Definition:** A custom interface generated by the LLM at runtime for a specific task, composed from component primitives. Can be saved as a reusable template or dissolved (deleted) when no longer needed.

**Example:**
```
User: "Create a dashboard for tracking thesis progress"

LLM generates:
{
  "type": "DynamicApp",
  "name": "Thesis Progress Dashboard",
  "ephemeral": false,
  "components": [
    {
      "type": "DataTable",
      "props": { /* tasks with progress */ }
    },
    {
      "type": "ProgressBar",
      "props": { "value": 0.65, "label": "Overall Progress" }
    },
    {
      "type": "Timeline",
      "props": { /* milestones */ }
    }
  ]
}

OS renders this as a custom widget in a window.
User can save it as a template for reuse.
```

**Key Characteristics:**
- Generated on-the-fly (no pre-built apps needed)
- Composed from primitives (follows OS patterns)
- Ephemeral by default (deleted when task ends) or persistent
- Can be saved/shared as templates
- Fully functional (not just visualization)

**Relationships:**
- **Created By**: LLM/Workspace Orchestrator
- **Composed From**: Component Primitives
- **Rendered By**: OS
- **Stored In**: Workspace (as template)

**Implementation Context:**
- LLM generates JSON declaration
- OS validates and renders
- User interactions trigger actions on underlying data
- Can be saved as reusable template file

**Constraints:**
- Cannot contain arbitrary code (composed from primitives only)
- Must declare all data sources (no hidden dependencies)
- Ephemeral by default (user must save to persist)
- Cannot access external APIs directly (must go through actions)

---

## CONCEPTUAL MODEL: SYSTEM ARCHITECTURE

### Holistic View (Text-Based Diagram)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE LAYER                        │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │  Text Bar (Primary Input) | Voice (Swipe Right) | Drop-as-Context
│ │  Spatial Reference Map (Tracks what's where on screen)           │
│ │  Rendering Engine (Component Primitives → Screen)                │
│ └──────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ User Input
                                    │ Screen Output
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENT HIERARCHY LAYER                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ CONDUCTOR (Top-Level Agent)                                     ││
│  │ • Holds User Model, Living Plans, global context                ││
│  │ • Allocates resources across workspaces                         ││
│  │ • Detects inter-workspace connections                           ││
│  │ • Makes priority/resource decisions                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              ▼
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ WORKSPACE ORCHESTRATORS (Mid-Level Agents)                      ││
│  │ • One per active workspace (owns semantic context)              ││
│  │ • Manages leaf agents within workspace                          ││
│  │ • Updates task graph and scratchpad                             ││
│  │ • Escalates blockers to Conductor                               ││
│  └─────────────────────────────────────────────────────────────────┘│
│    ▲            ▲            ▲              (one per workspace)
│    │            │            │
│  ┌─┴─┐        ┌─┴─┐        ┌─┴─┐
│  │WS1│        │WS2│        │WS3│
│  └─┬─┘        └─┬─┘        └─┬─┘  (Workspaces: semantic contexts)
│    │            │            │
│    ▼            ▼            ▼
│ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ │ Leaf 1   │ │ Leaf 2   │ │ Leaf 3   │  (Leaf Agents: one per window)
│ │(editor)  │ │(browser) │ │(terminal)│
│ └──────────┘ └──────────┘ └──────────┘
│
│ Communication: Agents ←→ Scratchpad (shared working memory)
│                        ←→ Task Graph (visual DAG of work)
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Actions
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ACTION DISPATCH LAYER                          │
│                                                                     │
│  Live Capability Manifest (always-current action registry)          │
│  ├─ Core OS Actions (window, agent, memory, filesystem, scratchpad)
│  ├─ App-Registered Actions (editor.insert, browser.navigate, ...)   │
│  └─ LLM-Created Actions (ephemeral workflows)                      │
│                                                                     │
│  Permission Checker                                                 │
│  ├─ Supervised Mode (asks user before mid/high actions)            │
│  ├─ Autonomous Mode (acts freely, logs everything)                 │
│  └─ Custom Mode (user-defined per-action rules)                    │
│                                                                     │
│  Action Dispatcher (validates, executes, logs)                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ State Changes
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       MEMORY LAYERS                                  │
│                                                                     │
│  Working Memory (Current task context, ~10KB, fast)                │
│  ├─ Loaded entities, recent actions, time budget, action registry   │
│  └─ Synchronized with rendering (updated every turn)                │
│                                                                     │
│  Episodic Memory (Timeline of what happened)                       │
│  ├─ Timestamp, actor, action, input/output, context tags           │
│  └─ Immutable, indexed, feeds semantic & procedural learning       │
│                                                                     │
│  Semantic Memory (Knowledge graph: entities, relationships, facts)  │
│  ├─ User, projects, tools, people, concepts + relationships        │
│  └─ Updated by Conductor from episodic observations                │
│                                                                     │
│  Procedural Memory (Learned workflows and patterns)                 │
│  ├─ Discovered by Replay & Teach system                            │
│  └─ Confidence scores, can be manually edited                      │
│                                                                     │
│  User Model (Understanding of user: style, preferences, expertise) │
│  ├─ Built from episodic + procedural memory                        │
│  ├─ Used by all agents for interaction style                       │
│  └─ User-editable, confidence-scored inferences                    │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Reads/Writes
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE STORAGE LAYER                          │
│                                                                     │
│  For Each Workspace:                                                │
│  ├─ Scratchpad (shared notes, requests, context)                   │
│  ├─ Task Graph (DAG of tasks, progress, assignments)               │
│  ├─ Living Plan (persistent planning document)                     │
│  ├─ File references (documents, code, assets)                      │
│  └─ Window state (layout, attachments, positions)                  │
│                                                                     │
│  Persistence: Disk/Cloud (synced across sessions)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Relationships

**Agent Hierarchy → Memory:**
- Conductor reads User Model & Semantic Memory to understand user goals
- Workspace Orchestrators read Scratchpad & Task Graph to coordinate work
- Leaf Agents read Scratchpad to understand their task, write status updates
- All agents update Episodic Memory

**Action Space → Permission Model:**
- Every action has a permission level (low/mid/high)
- Supervisor checks permission before dispatch
- Supervised Mode asks user; Autonomous Mode executes; Custom Mode applies rules
- All invocations logged to Episodic Memory

**UI → Spatial Reference Map:**
- Rendering engine updates map on every frame
- User can point/click while speaking, resolving "this" to actual objects
- Drop-as-Context uses map to determine which workspace/window receives dropped object

**Working Memory ↔ Live Capability Manifest:**
- Action registry always in working memory (know what you can do)
- Updated whenever actions are registered/removed
- Agents can plan based on available actions

**Episodic Memory → Semantic & Procedural Memory:**
- Conductor periodically processes episodic log
- Extracts facts → Semantic Memory (knowledge graph)
- Extracts patterns → Procedural Memory (learned workflows)
- User Model continuously updated from both

**Workspace Orchestrator ↔ Scratchpad ↔ Task Graph:**
- Orchestrator reads task requirements from scratchpad
- Orchestrator spawns/kills leaf agents based on work
- Leaf agents write status to scratchpad
- Orchestrator updates task graph (visual DAG)
- All visible to user via Living Plan and Task Graph panel

**Progressive Disclosure + User Model:**
- Agents check User Model before generating output
- If user is expert in domain, show technical detail
- If user is novice, simplify; offer "more details" links
- Learned patterns enable contextual interaction

**Branching Undo ↔ Episodic Memory:**
- Every action stored with dependencies
- Undo system traverses action tree
- User can fork to alternative branch
- Non-destructive (all branches preserved)

---

## SUMMARY TABLE: Term → Definition → Used By

| Term | Definition | Used By |
|------|-----------|---------|
| **Conductor** | Top-level agent with global context, resource allocation, user goal tracking | OS, Workspace Orchestrators |
| **Workspace Orchestrator** | Mid-level agent owning semantic workflow context, manages leaf agents | Conductor, Leaf Agents |
| **Leaf Agent / Sub-Agent** | Specialized agent in one window, does one task well | Workspace Orchestrator |
| **Episodic Memory** | Immutable timeline of events with context metadata | Conductor, Semantic/Procedural learning |
| **Semantic Memory** | Knowledge graph of entities, relationships, facts | Conductor, Workspace Orchestrators |
| **Procedural Memory** | Learned workflows and patterns with confidence scores | Leaf Agents, Workspace Orchestrator |
| **Working Memory** | Small, fast, current-task context store (includes Live Capability Manifest) | All agents, Rendering engine |
| **Workspace** | Semantic context + composed windows/agents/memory for a coherent goal | Conductor, User |
| **Window** | Single task container on screen (1:1 with leaf agent) | Window Manager, Leaf Agent |
| **Magnetic Attachment** | Snap-together window grouping (visual hierarchy, no data dependency) | Rendering engine |
| **Task Graph** | DAG of tasks showing progress, dependencies, blocking relationships | Workspace Orchestrator, User |
| **Live Task Graph** | Synonym for Task Graph, emphasizing real-time updates | User, Workspace Orchestrator |
| **Action Space** | Complete set of operations defined as JSON schemas | Action Dispatcher, All agents |
| **Core OS Actions** | Immutable system actions (window, agent, memory, filesystem) | Action Dispatcher, All agents |
| **App-Registered Actions** | Custom actions from app components (editor, browser, etc.) | Leaf Agents, Action Dispatcher |
| **LLM-Created Actions** | Dynamically defined workflows generated at runtime | Workspace Orchestrator, Leaf Agents |
| **Live Capability Manifest** | Always-current action registry in working memory | All agents, Action Dispatcher |
| **Action Schema** | JSON Schema defining action parameters, types, return values | Action Dispatcher, LLM |
| **Scratchpad / Blackboard** | Shared workspace for inter-agent notes, requests, context | All agents within workspace |
| **Escalation** | Leaf agent bubbles problem up to Workspace Orchestrator | Leaf Agent, Workspace Orchestrator |
| **Inter-Workspace Communication** | Conductor-mediated coordination between workspaces | Conductor, Workspace Orchestrators |
| **Text Bar** | Primary input at bottom of screen (text/voice) | User, Workspace Orchestrator |
| **Ambient Voice Mode** | Always-listening mode for parsing commands from conversation | Microphone, Leaf Agents |
| **Drop-as-Context** | Drag-and-drop objects instantly added as workspace context | Window Manager, Workspace Orchestrator |
| **Spatial Reference Map** | Real-time map of screen rendering for resolving "this"/"that" | Voice input processor, Window Manager |
| **User Model** | OS's understanding of user's style, patterns, preferences, expertise | All agents |
| **Living Plan** | Persistent planning document per workspace, updated by Conductor | Conductor, User |
| **Progressive Disclosure** | Policy of showing complexity based on context and user expertise | All agents |
| **Replay and Teach** | System for observing user actions and proposing learned workflows | Leaf Agents, Procedural Memory |
| **Supervised Mode** | OS asks user before executing mid/high-permission actions | Action Dispatcher, User |
| **Autonomous Mode** | OS acts freely without asking, logs everything, requires trust | Action Dispatcher, Workspace |
| **Custom Mode** | User-defined per-action-type permission rules | Action Dispatcher |
| **Branching Undo** | Version-control-style undo with non-linear tree of branches | Workspace, User |
| **Component Primitives** | Reusable UI building blocks (DataTable, Canvas, CodeEditor, etc.) | LLM, Rendering Engine |
| **Dynamic App / Widget** | Custom interface generated by LLM at runtime from primitives | Workspace Orchestrator, User |

---

## CONFORMANCE & VALIDATION

This glossary defines the normative terminology for all subsequent OS specification documents. Implementation teams MUST:

1. **Use exact terminology** from this document (no synonyms unless explicitly noted)
2. **Understand relationships** between terms (refer to the relationship section in each definition)
3. **Respect constraints** listed for each term (immutable properties)
4. **Validate schemas** against action definitions (parameter types, return values)
5. **Maintain consistency** across documents (cross-reference this glossary)

Deviations from this glossary must be explicitly justified in implementation documents with a note referencing this document and proposing a terminology amendment.

---

## DOCUMENT HISTORY

| Revision | Date | Author | Changes |
|----------|------|--------|---------|
| 1.0 | 2026-03-23 | Specification Team | Initial comprehensive glossary and conceptual model |

