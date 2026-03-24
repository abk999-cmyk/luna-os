# Document 4: System Architecture Overview

**Project:** LLM-Native Operating System
**Document Type:** Technical Architecture Specification
**Scope:** Complete system 30,000-foot view
**Audience:** Engineers implementing all layers
**Status:** Active specification for implementation

---

## Executive Summary

This document defines the complete technical architecture of the LLM-native OS. The system is organized into 8 horizontally-stacked layers, each with defined responsibilities, interfaces, and data contracts. Every layer has measurable performance targets and explicit dependencies.

**Key Architectural Principles:**
- **Agent-driven:** Autonomous agents at three hierarchical levels make decisions
- **Memory-centric:** Multiple memory systems feed context into agent decision-making
- **Action-oriented:** All computation expressed as strongly-typed, validated actions
- **Instantly-rendered:** UI generated dynamically without compilation
- **Learnable:** System learns from behavior and adapts over time

---

## Layer Architecture

### Layer 1: User Interaction Layer

**Responsibility:** All mechanisms for users to command the system and perceive state.

**Components:**

1. **Text Command Bar (Bottom of Screen)**
   - Primary input mechanism
   - Swipe-right gesture triggers voice input
   - Always visible, persistent across workspaces
   - Receives free-form text commands

2. **Ambient Voice Mode**
   - Always-listening microphone (privacy-gated)
   - Parses natural commands from ongoing conversation
   - Does not require push-to-talk or trigger phrases
   - Streams audio to speech-to-text pipeline

3. **Multimodal Input**
   - Drag-and-drop files, images, URLs anywhere on screen
   - Screenshots auto-captured and used as context
   - Clipboard monitoring (user-configurable)
   - All inputs treated as "context" for agent consumption

4. **Spatial Reference Map**
   - Every visual element on screen has a coordinate reference
   - User can point and say "what is that?" or "use that for..."
   - Enables "deictic" reference: spatial gestures paired with voice
   - Maps screen regions to semantic objects (window, widget, data element)

5. **Window System**
   - Cards snap together magnetically (Solitaire-style stacking)
   - Cards are individual windows managed by Workspace Orchestrator
   - Supports manual and agent-controlled repositioning
   - Visual hierarchy: foreground card active, background cards accessible

6. **Right-Side Task Panel**
   - Live DAG (directed acyclic graph) visualization
   - Shows current task tree, dependencies, and execution state
   - Tap to expand/collapse tasks
   - Real-time updates from Conductor

7. **Visual Theme**
   - Primary: warm amber/clay (#C8A882, #D4AF99)
   - Secondary: teal accents (#4A9B8E, #2E7D6F)
   - Background: warm off-black (#1A1410)
   - Rationale: Reduces eye strain in long sessions; warm colors suggest warmth/intelligence

**Data Flow In:**
- User gesture/voice → Conductor (routed through appropriate Workspace Orchestrator)

**Data Flow Out:**
- Agent-generated UI component trees → Rendering Engine
- State updates → Rendered pixels on screen

**Performance Targets:**
- Voice input latency: <200ms to transcript
- Touch latency: <100ms to visual response
- Gesture recognition: >95% accuracy for standard gestures

---

### Layer 2: Agent Orchestration Layer

**Responsibility:** Multi-tiered intelligent decision-making and coordination across domains.

**Architecture:**

```
┌─────────────────────────────────────────────┐
│          CONDUCTOR (Global Context)         │
│   • Persistent living plans (cross-WS)      │
│   • Global semantic analysis                │
│   • User modeling (cognitive style)         │
│   • Workspace coordination                  │
│   • Inter-workspace communication           │
└────┬──────────────────────────────────────┬─┘
     │                                      │
     └─ Escalation Path ────────────────────┘
     │
┌────▼────────────────────────────────────────────────────────────┐
│   WORKSPACE ORCHESTRATORS (Domain-Specific, 1 per Workspace)    │
│   • Mid-level context (current task, domain state)              │
│   • Workspace DAG and task dependencies                         │
│   • Blackboard/scratchpad for intra-workspace comms             │
│   • Delegates to Leaf Agents                                    │
│   • Model selection for this workspace                          │
└────┬───────────────────────────────────────────────────────────┘
     │
     │ Delegation
     │
┌────▼────────────────────────────────────────────────────────────┐
│   LEAF AGENTS (Specialized, 1 per Window)                       │
│   • Single-domain expertise (e.g., CodeAgent, DataAgent)        │
│   • Receives: window context, user input, working memory        │
│   • Generates: actions, UI updates, debug traces                │
│   • Registers custom actions into action space                  │
│   • Model selection configurable per agent                      │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Responsibilities:**

| Agent Level | Scope | Lifespan | Context Size | Key Decisions |
|---|---|---|---|---|
| **Conductor** | All workspaces | Session-persistent | Full (10K+ tokens) | Multi-workspace coordination, long-term planning, permission escalation, model routing |
| **Workspace Orchestrator** | Single workspace | Workspace lifetime | High (5K tokens) | Task sequencing, agent delegation, workspace memory management |
| **Leaf Agent** | Single window | Window lifetime | Medium (2K tokens) | Action execution, UI generation, immediate problem-solving |

**Communication Mechanism: Blackboard/Scratchpad**

- Workspace Orchestrator hosts a shared scratchpad (JSON structure)
- Leaf Agents read/write facts, task status, data
- Enables asynchronous coordination without polling
- Conductor has access to all workspace scratchpads

**Escalation Paths**

1. **Leaf → Orchestrator:** Action denied by permission engine → Orchestrator decides
2. **Orchestrator → Conductor:** Cross-workspace conflict or high-permission request → Conductor decides
3. **Conductor → User:** Ambiguous or dangerous request → Present choices to user

**Model Selection**

- User configures preferred model per layer (Conductor, Orchestrator, Leaf)
- Can specify: Claude family, open-source alternative, hybrid strategies
- Fallback chain if primary model unavailable
- Cost/latency tradeoffs configurable

**Performance Targets:**
- Agent think time (latency to first action): <5s for Leaf, <10s for Orchestrator, <30s for Conductor
- Blackboard operations: <10ms

---

### Layer 3: Action Dispatch Layer

**Responsibility:** Strongly-typed execution of all system operations.

**Action Registry (3-Tier):**

```
TIER 1: Core OS Actions (Immutable)
├── ui.render(componentTree)
├── memory.store(episodic | semantic | procedural, data)
├── memory.retrieve(type, query)
├── input.capture(type)
├── process.spawn(isolationLevel)
├── app.install(bundleId)
└── app.uninstall(bundleId)

TIER 2: App-Registered Actions (Stable)
├── fileSystem.read(path, permissions)
├── fileSystem.write(path, data)
├── calendar.list(dateRange)
├── email.send(to, subject, body)
└── [Custom actions registered by persistent apps]

TIER 3: LLM-Created Actions (Ephemeral / Promotable)
├── <dynamic actions generated by agents>
├── Sandboxed execution by default
├── Promotable to Tier 2 if proven safe
└── Logged for future learning
```

**Action Structure (JSON):**

```json
{
  "actionId": "unique-uuid",
  "agentId": "leaf-agent-code-123",
  "type": "ui.render | memory.store | fileSystem.read | <custom>",
  "schema": "JSON Schema defining parameters",
  "parameters": { "param1": "value1", "param2": "value2" },
  "targetLatency": 500,
  "requiredPermissions": ["file_read", "memory_write"],
  "sandboxed": true,
  "timestamp": "2026-03-23T14:32:18Z",
  "metadata": {
    "origin": "leaf | orchestrator | conductor",
    "priority": "normal | high | critical",
    "audience": "private | shared | broadcast"
  }
}
```

**Dispatch Workflow:**

1. Agent emits action JSON
2. **Schema Validator** checks parameters against declared schema
3. **Permission Engine** evaluates required permissions
   - If autonomous mode: proceed
   - If supervised mode: log and ask user
   - If custom mode: apply learned policy
4. **Action Router** dispatches to appropriate handler
5. **Executor** runs (sandboxed if Tier 3)
6. **State Updater** feeds result back to memory system
7. **Action Logger** records for auditing and learning

**Live Capability Manifest:**

- Pushed to all agents at session start and whenever registry changes
- Formatted as: `{ "actionType": { "schema": {...}, "latency": 100, "permissions": [...] } }`
- Agents use manifest to generate valid actions (no guessing)
- Dynamic regeneration as new apps register/unregister

**Performance Targets:**
- Schema validation: <1ms
- Permission check: <2ms
- Dispatch: <5ms total
- Action creation-to-execution: <5ms for core actions

---

### Layer 4: Memory System

**Responsibility:** Multi-modal context management to inform agent decisions.

**Four Memory Types:**

#### 4.1 Episodic Memory
- Event timeline: what happened, when, by whom
- Indexed by timestamp and semantic tags
- Query examples:
  - "What did I do yesterday at 3pm?"
  - "Show me all errors in the past hour"
  - "Replay the conversation about budget"
- Storage: Time-series database with tag index
- Retention: Configurable (default: 30 days)

#### 4.2 Semantic Memory (Knowledge Graph)
- Entity nodes: Users, documents, concepts, tools
- Relationship edges: "document X is about topic Y", "user A knows user B"
- Facts: Properties, assertions, rules
- Query examples:
  - "What documents relate to the Q2 budget?"
  - "Who is the decision-maker for infrastructure?"
  - "What patterns do I follow on Mondays?"
- Storage: Graph database (e.g., Neo4j-compatible)
- Learning: Continuously updated from episodic memory

#### 4.3 Procedural Memory
- Learned workflows: sequence of steps to accomplish tasks
- Patterns: recurring behavioral patterns
- Examples:
  - "To review a PR, check tests → review code → suggest changes → comment"
  - "When someone emails me about X, I usually Y"
  - "During video calls, I typically open notes on the left, video on the right"
- Storage: Workflow graph with confidence scores
- Learning: Extracted from episodic memory via replay-and-teach

#### 4.4 Working Memory
- **Fast structured store** of current context
- Actively managed, aggressively pruned
- Holds:
  - Current task and sub-tasks
  - Recent user inputs (last 10 messages)
  - Relevant episodic facts (last hour)
  - Active variables and state
  - Current window contents
- Updated: Every agent action
- Pruned: Every 30 seconds (LRU eviction)

**Context Window Budget Management:**

```
Total Budget: 100K tokens (configurable)

Working Memory:     30K (current context)
  ├─ Recent chat:    8K
  ├─ Task state:     6K
  ├─ Window content:12K
  └─ Variables:      4K

Episodic Retrieval: 25K (just-in-time loaded)
  ├─ Recent events: 15K
  └─ Relevant facts: 10K

Semantic Retrieval: 20K (on-demand)
  ├─ Knowledge graph facts: 15K
  └─ Entity relationships:   5K

System Overhead:    15K (instructions, schemas, models)
  ├─ Agent prompts:  8K
  ├─ Action schemas: 5K
  └─ Config:         2K

Reserve:            10K (replan if exceeded)
```

**Loading Strategy:**
- At session start: Load working memory + last N hours episodic
- During agent think: Load semantic facts matching current task (BM25 ranking)
- Asynchronously: Refresh episodic cache every 5 minutes
- On context pressure: Summarize oldest episodic events → semantic facts

**Performance Targets:**
- Episodic retrieval: <50ms for recent events
- Semantic graph query: <100ms for entity relationships
- Working memory update: <5ms
- Context budget check: <1ms

---

### Layer 5: Dynamic Rendering Engine

**Responsibility:** Instant declarative UI rendering without compilation.

**Component Primitive Library:**

```
DataTable       Rows, columns, sorting, filtering, inline editing
InteractiveMap  Geo map, markers, layers, click handlers
Timeline        Events, grouping, zooming, scrubbing
Canvas          Free-form drawing, annotations, shapes
CodeEditor      Syntax highlighting, LSP integration, refactoring
Chat            Messages, threading, @mentions, reactions
Form            Input fields, validation, submission
Graph           Nodes, edges, force-directed layout, clustering
Modal           Overlay dialogs, focus trapping
Tabs            Multi-panel switcher
Sidebar         Collapsible navigation
```

**Declarative UI Description Format (LLM Output):**

```json
{
  "type": "component",
  "id": "window-abc123",
  "componentType": "Chat",
  "props": {
    "messages": [
      {"author": "user", "text": "List files", "timestamp": "2026-03-23T14:30:00Z"},
      {"author": "agent", "text": "Here are the files:", "type": "structured"}
    ],
    "onMessage": "submitAction",
    "theme": "amber"
  },
  "children": [
    {
      "type": "component",
      "componentType": "DataTable",
      "props": {
        "columns": [
          {"key": "name", "label": "File Name", "sortable": true},
          {"key": "size", "label": "Size", "sortable": true}
        ],
        "rows": [
          {"name": "report.pdf", "size": "2.4MB"},
          {"name": "data.csv", "size": "1.1MB"}
        ],
        "onRowClick": "selectFile"
      }
    }
  ]
}
```

**Rendering Pipeline:**

1. **Agent emits component tree** (JSON)
2. **Renderer validates** against component schema
3. **Type-specific render functions** convert to native UI
   - DataTable → React grid component
   - Canvas → WebGL context
   - CodeEditor → Monaco instance
4. **Event handlers attached** (user click, type, etc.)
5. **Instant display** (no build, no compile, no network)
6. **Event stream flows back** to controlling agent

**Event Flow (User → Agent):**

```
User clicks "Download" button
    ↓
Renderer captures click event
    ↓
Event includes target action: "downloadFile"
    ↓
Leaf Agent receives: { action: "downloadFile", rowId: "data.csv" }
    ↓
Agent determines next UI state or task
    ↓
Agent emits new component tree
    ↓
Renderer updates UI (diff-based)
```

**Generated Apps:**

- When an agent creates a custom multi-window application, each window registers actions
- Actions merged into action registry as Tier 3 (sandboxed)
- App becomes ephemeral (deleted when window closes) unless explicitly saved
- Promotable to persistent template: "Save this app as a template"

**Performance Targets:**
- Render latency: <16ms per frame (60fps target)
- Event capture-to-agent: <5ms
- Component tree validation: <10ms
- Diff-based updates: <5ms

---

### Layer 6: Runtime & Process Layer

**Responsibility:** Low-level execution, isolation, and performance.

**Technology Stack:**

| Component | Language | Rationale |
|---|---|---|
| **Kernel** | Rust | Performance-critical: compositor, rendering, memory, action dispatch |
| **Orchestration & Agents** | Go | Fast startup, simple concurrency, good stdlib for networking/IO |
| **Dynamic UI** | TypeScript + Custom Renderer | Instant iteration, familiar to AI code generation |
| **Shell & Distribution** | Tauri (Rust + Web) | Prototype: Rust backend, web frontend, cross-platform |

**Process Isolation Model:**

```
[OS Kernel - Rust]
  │
  ├─ Conductor Process (Go)
  │   ├─ Workspace Orchestrator 1 (Go)
  │   │   ├─ Leaf Agent 1 (Go + LLM)
  │   │   └─ Leaf Agent 2 (Go + LLM)
  │   └─ Workspace Orchestrator 2 (Go)
  │       └─ Leaf Agent 3 (Go + LLM)
  │
  ├─ Renderer Process (TypeScript)
  │   ├─ Component tree validator
  │   ├─ Event dispatcher
  │   └─ Diff engine
  │
  ├─ Memory System (Go + Rust bindings)
  │   ├─ Episodic DB connection
  │   ├─ Semantic graph DB connection
  │   └─ Working memory store
  │
  └─ App Sandbox (per LLM-created app)
      ├─ Restricted file access
      ├─ Network via proxy
      └─ CPU/Memory quotas
```

**Sandboxing Strategy:**

- Core OS and app-registered actions: full OS access
- LLM-created actions (Tier 3): run in isolated process with:
  - File access: paths whitelisted by permission engine
  - Network: HTTP(S) only, proxy validated
  - CPU: 1 core max, 1GB RAM max
  - Duration: 30s timeout
  - IPC: Actions can only emit events back to parent agent

**Agent Lifecycle Management:**

1. **Spawn:** Orchestrator creates Leaf Agent process when window opens
2. **Initialize:** Agent loads user model, capabilities manifest, working memory
3. **Run:** Agent loop: receive input → think (call LLM) → emit actions → wait for result
4. **Shutdown:** When window closes or user commands, process terminates
5. **Cleanup:** Actions logged, final state captured, temporary data purged

**Performance Targets:**
- Process spawn: <1s
- Agent think time: <5s (Leaf), <10s (Orchestrator)
- IPC latency: <10ms
- Memory per Leaf Agent: <100MB
- Compositor frame time: <16ms

---

### Layer 7: Intelligence Layer

**Responsibility:** User modeling, planning, learning, and adaptive behavior.

**4.1 User Modeling**

Builds a profile of the user's cognitive style and work patterns:

```
{
  "userId": "user-123",
  "cognitiveProfile": {
    "decisionStyle": "data-driven | intuitive | collaborative | iterative",
    "timePreference": "async | synchronous | real-time",
    "taskPreference": "detailed | high-level | examples",
    "workPattern": "deep-focus | context-switching | event-driven",
    "communicationStyle": "formal | casual | brief | verbose"
  },
  "workPatterns": {
    "morningFocus": true,
    "meetingCluster": "2-4pm",
    "interruptionTolerance": 0.3,
    "collaborationPreference": 0.7
  },
  "preferences": {
    "modelPreference": "Claude 3.5 Sonnet",
    "uiTheme": "amber",
    "voiceInputEnabled": true,
    "autoSaveFrequency": "every 5 minutes"
  },
  "permissions": {
    "autonomous": ["fileRead", "dataQuery", "renderUI"],
    "supervised": ["fileWrite", "networkCall"],
    "denied": ["systemConfig", "uninstallApp"]
  }
}
```

**Inspectable & Editable:**
- User can view and edit their own profile
- Changes are logged (learning system notes when user corrects prediction)

**4.2 Planning Engine (Living Plans)**

Conductor maintains persistent task trees across sessions:

```
Living Plan for "Q2 Budget Review" (Created: 2026-03-01)
├─ Phase 1: Gather Data (Status: Complete)
│  ├─ Collect department budgets (Complete, 2026-03-05)
│  ├─ Pull historical actuals (Complete, 2026-03-07)
│  └─ Request headcount updates (Complete, 2026-03-10)
├─ Phase 2: Analysis (Status: In Progress, 60%)
│  ├─ Compare YoY trends (In Progress)
│  ├─ Identify outliers (Pending)
│  ├─ Project Q3-Q4 (Pending)
│  └─ Risk assessment (Pending)
└─ Phase 3: Decision & Approval (Status: Pending)
   ├─ Board presentation (Pending)
   └─ Final sign-off (Pending)
```

**Proactive Updates:**
- Conductor reviews all living plans every 30 minutes
- Checks for blocked tasks, missed deadlines, new dependencies
- Alerts user or automatically escalates (per permission mode)
- Suggests parallel tasks when available

**4.3 Learning System (Replay-and-Teach)**

Asynchronously learns from user behavior:

```
User Action Sequence:
  1. Creates a document with title "Budget Analysis"
  2. Immediately creates a spreadsheet
  3. Opens a calendar for the meeting

Learning Engine Inference:
  → Pattern: "document title X" + "spreadsheet context" = "likely budget review task"
  → New procedural pattern: {
       trigger: documentType=="docx" AND title CONTAINS ["budget", "analysis"],
       response: suggestOpeningSpreadsheet(true),
       confidence: 0.78
     }
```

**Workflow Pattern Extraction:**
- Analyzes episodic memory for repeated action sequences
- Trains procedural memory model on extracted patterns
- User reviews and validates extracted patterns (teaching feedback)
- Patterns then used to suggest next steps proactively

**4.4 Permission Engine (Supervised/Autonomous/Custom)**

Manages action approval based on user's trust model:

| Mode | Behavior | Use Case |
|---|---|---|
| **Autonomous** | Agent can execute action immediately | Safe, low-risk (ui.render, memory.read) |
| **Supervised** | Agent must ask user before execution | Moderate risk (file.write, email.send) |
| **Custom** | Apply learned policy from training | High-risk (system.config, app.uninstall) |

**Learning Custom Policies:**
- Track user's "approve/deny" decisions over time
- Train classifier: `f(action, context) → approve | deny | ask`
- User can review learned policy and correct it
- Fallback to supervised if policy confidence < threshold

**4.5 Sensor Integration**

Feeds contextual signals into agent decision-making:

```
{
  "currentTime": "2026-03-23T14:32:18Z",
  "dayOfWeek": "Monday",
  "isWorkingHours": true,
  "calendar": {
    "currentEvent": "1:1 with Manager (30min remaining)",
    "nextEvent": "Team Standup (in 1 hour)",
    "busyFraction": 0.65
  },
  "location": "Office, Conference Room B",
  "systemResources": {
    "cpuUsage": 0.42,
    "memoryUsage": 0.55,
    "batteryLevel": 0.95
  },
  "biometrics": {
    "focusScore": 0.85,    // Eye tracking, mouse patterns
    "stressLevel": 0.3,    // Breathing (if available), keystroke patterns
    "energyLevel": 0.7     // Activity level, time-of-day adjustment
  }
}
```

**Usage:**
- Agents consider context before proposing actions
- "User is in a meeting" → suppress non-urgent notifications
- "Low battery" → defer heavy computations
- "High focus score" → don't interrupt with suggestions

**4.6 Cross-Workspace Semantic Analysis**

Conductor performs higher-level pattern detection:

```
Observed Across Workspace A and Workspace B:
  - User opened 3 different data sources in Workspace A
  - Then opened a "decision framework" doc in Workspace B
  - Closed both workspaces without saving

Inference:
  → User may be struggling with decision (high uncertainty)
  → Proactively offer: "I noticed you gathered data but didn't decide.
     Want me to summarize the decision tradeoffs?"
```

**Performance Targets:**
- User model update: <100ms
- Plan review cycle: every 30 minutes
- Learning inference: <500ms per pattern
- Permission decision: <100ms
- Sensor polling: every 5 seconds, <50ms per poll

---

### Layer 8: Collaboration Layer

**Responsibility:** Multi-user workspace sharing and real-time synchronization.

**Multi-User Architecture:**

```
Shared Workspace: "Q2 Planning"
├─ Conductor 1 (User A's session)
│  ├─ Workspace Orchestrator (shared)
│  │  └─ Leaf Agents (User A's perspective)
│  └─ Working Memory (User A's view)
│
└─ Conductor 2 (User B's session)
   ├─ Workspace Orchestrator (shared)
   │  └─ Leaf Agents (User B's perspective)
   └─ Working Memory (User B's view)

Shared State:
├─ Semantic Memory (knowledge graph) → all users see same facts
├─ Episodic Memory (events) → filtered by privacy boundaries
├─ Workspace Scratchpad → shared task state
└─ Rendered UI → synchronized via event log
```

**Memory Access Control:**

| Memory Type | Visibility | Sync Mechanism |
|---|---|---|
| **Semantic** | Shared (filtered by permission) | All updates push to graph DB |
| **Episodic** | User's own events + shared events | Event tagging: `{ visibility: "private" \| "workspace" \| "global" }` |
| **Procedural** | Personal learned patterns | No sync (user-specific) |
| **Working** | Personal (non-shared) | No sync |

**Real-Time Synchronization:**

1. User A's Leaf Agent emits action: `memory.store(semantic, { entity: "UserB", fact: "owns Q2 budget" })`
2. Action routed to Action Dispatch Layer
3. **Semantic DB** updated
4. **Event published:** `{ type: "semantic.updated", entity: "UserB", timestamp: ... }`
5. All other connected Conductors receive event
6. Conductors update their working memory caches
7. If relevant to current task, agents are re-prompted with new context

**Conflict Resolution:**

Scenario: Both User A and User B try to update the same semantic fact simultaneously.

```
User A: "Set project status = Red"
User B: "Set project status = Yellow"
(Both emit actions within 100ms)

Conflict Detection:
  → Action Dispatch detects write-write conflict
  → Timestamp-based resolution: earlier write wins (User A)
  → User B's action is rejected with:
     { error: "conflict", reason: "fact changed", current: "Red" }
  → User B's agent notified and can resubmit or handle conflict
```

**Permission Boundaries:**

```
Workspace: "Payroll" (Confidential)
├─ User A (HR Manager): full access
├─ User B (Finance): read-only episodic, no procedural
└─ User C (CEO): semantic summary only (aggregated data)

When User B tries to access:
  memory.retrieve(episodic, { dateRange: "past 7 days" })
  → Returns events tagged { visibility: "finance_readonly" }
  → Does NOT return personal notes or sensitive fields
```

**Performance Targets:**
- Event propagation: <500ms (P99)
- Conflict detection: <10ms
- Semantic DB consistency: eventual (5s window)
- User-perceived sync latency: <1s

---

## Data Flow (Canonical Examples)

### Example 1: User Voice Command → Action Execution

```
User (voice): "Show me all emails from Sarah in the past week"
    ↓
[Layer 1: User Interaction Layer]
Audio captured → Speech-to-text → "Show me all emails from Sarah in the past week"
Text sent to Conductor
    ↓
[Layer 2: Agent Orchestration Layer]
Conductor parses: intent=query, entity=email, filter={sender:Sarah, dateRange:1w}
Routes to Workspace Orchestrator (if workspace active) or creates new workspace
Workspace Orchestrator:
  - Checks: is there an email specialist window open?
  - If yes: delegates to that Leaf Agent
  - If no: spawns new Leaf Agent (type: EmailAgent)
Leaf Agent receives context:
  - User input: "Show me all emails from Sarah in the past week"
  - User model: formal, async-preferred, data-driven
  - Capabilities: can call memory.retrieve and ui.render
    ↓
[Layer 4: Memory System]
Leaf Agent emits: memory.retrieve(episodic, { type: "email", sender: "Sarah", after: "2026-03-16T00:00:00Z" })
    ↓
[Layer 3: Action Dispatch Layer]
Action validated (schema matches memory.retrieve)
Permission checked: user has "memory_read" → autonomous
Executed by Memory System
    ↓
[Layer 4: Memory System]
Episodic DB queried → returns 7 email event records
    ↓
[Layer 2: Agent Orchestration Layer]
Memory result fed back to Leaf Agent working memory
Leaf Agent generates next action: ui.render(componentTree)
    ↓
[Layer 3: Action Dispatch Layer]
ui.render action validated and routed to Rendering Engine
    ↓
[Layer 5: Dynamic Rendering Engine]
Component tree received:
{
  "componentType": "Chat",
  "props": {
    "messages": [
      {"author": "assistant", "text": "Found 7 emails from Sarah:"},
      {"author": "system", "type": "structured"}
    ]
  },
  "children": [
    {
      "componentType": "DataTable",
      "props": {
        "columns": ["From", "Date", "Subject"],
        "rows": [
          {"From": "Sarah", "Date": "2026-03-22", "Subject": "Q2 Review..."},
          ... (6 more rows)
        ],
        "onRowClick": "openEmail"
      }
    }
  ]
}
    ↓
[Layer 5: Dynamic Rendering Engine]
Renderer creates UI components and displays on screen
User clicks on first email row → event captured: { action: "openEmail", rowId: 0 }
    ↓
[Loop back to Layer 2: Agent Orchestration Layer]
Leaf Agent receives event, continues task
```

### Example 2: LLM Creates Custom Action

```
User (text): "Create a checklist for onboarding new engineers"
    ↓
[Layer 2: Agent Orchestration Layer]
Conductor routes to Workspace Orchestrator
Orchestrator spawns ProductivityAgent (Leaf)
    ↓
[Layer 2: Agent Orchestration Layer]
ProductivityAgent thinks (LLM call):
  Prompt: "User wants a checklist for onboarding. Render a form where they can add items."
  LLM decides: "Create a custom app with a form + checklist"
  Agent emits action:
  {
    "type": "app.create",
    "parameters": {
      "appId": "onboarding-checklist-temp",
      "initialCode": "// React component rendering form + checklist"
    }
  }
    ↓
[Layer 3: Action Dispatch Layer]
Action validated and routed to Rendering Engine
    ↓
[Layer 5: Dynamic Rendering Engine]
App code executed → component tree generated
Form displayed on screen
User adds items: "Laptop setup", "Email created", "Office tour", ...
    ↓
[Layer 1: User Interaction Layer]
Form submission event captured
    ↓
[Layer 3: Action Dispatch Layer]
Custom action registered by app: "checklist.addItem(text)"
Dispatched with Tier 3 (sandboxed) status
    ↓
[Layer 6: Runtime & Process Layer]
Action executed in isolated process
Result: checklist state updated
    ↓
[Layer 5: Dynamic Rendering Engine]
Component tree re-rendered with new item
    ↓
[Loop: User adds more items, same cycle repeats]
    ↓
User says: "Save this as a template"
    ↓
[Layer 2: Agent Orchestration Layer]
Conductor captures app definition
Stores as persistent template (not ephemeral)
Next session, user can: "Open onboarding checklist template"
```

### Example 3: Permission Escalation (Supervised Mode)

```
Leaf Agent wants to execute: fileSystem.write("/home/user/budget.xlsx", data)
    ↓
[Layer 3: Action Dispatch Layer]
Schema validated ✓
Permission engine checks: fileSystem.write requires "file_write" permission
Permission mode: "supervised"
    ↓
Escalate to user:
  UI popup: "Agent wants to write to budget.xlsx. Approve? [Yes] [No] [Edit]"
    ↓
User clicks [Yes]
    ↓
[Layer 6: Runtime & Process Layer]
Action executed with full OS permissions
File written to disk
    ↓
[Layer 4: Memory System]
Event logged: { action: "fileSystem.write", timestamp, user_approved: true }
    ↓
[Layer 7: Intelligence Layer]
Learning system observes:
  - Agent proposed fileSystem.write to budget.xlsx
  - User approved
  - Context: budget-related task in progress
  → Learns: "In budget context, file writes are usually safe"
  → Updates custom policy for future similar requests
```

---

## Interface Specifications

### Interface 1: Agent ↔ Action Dispatch

**Agents Emit:**
```json
{
  "agentId": "leaf-email-123",
  "actionId": "uuid-1234",
  "type": "memory.retrieve | ui.render | fileSystem.read | <custom>",
  "parameters": { ... },
  "metadata": { "priority": "high", "audience": "private" }
}
```

**Dispatch Returns:**
```json
{
  "actionId": "uuid-1234",
  "status": "success | error | pending_approval",
  "result": { ... },
  "executionTimeMs": 45,
  "metadata": { "tier": 1, "sandboxed": false }
}
```

### Interface 2: Memory System ↔ Agents

**Agents Query (Standard):**
```json
{
  "type": "episodic | semantic | procedural",
  "query": "SELECT * WHERE condition",
  "limit": 50,
  "offset": 0
}
```

**Memory Returns:**
```json
{
  "status": "success",
  "hits": [
    { "id": "event-123", "type": "email", "data": {...}, "timestamp": "..." },
    ...
  ],
  "totalHits": 147,
  "executionTimeMs": 35
}
```

### Interface 3: Leaf Agent ↔ Workspace Orchestrator (Escalation)

**Agent Requests Escalation:**
```json
{
  "type": "escalation_request",
  "reason": "permission_denied | ambiguous_task | cross_workspace_conflict",
  "originalAction": { ... },
  "context": "User asked X but I cannot determine Y"
}
```

**Orchestrator Resolves & Returns:**
```json
{
  "decision": "proceed | deny | ask_user",
  "reasoning": "...",
  "approvedAction": { ... } // if decision=="proceed"
}
```

### Interface 4: Workspace Orchestrator ↔ Conductor (Coordination)

**Workspace Reports Status:**
```json
{
  "workspaceId": "ws-abc",
  "status": "active | idle | blocked",
  "activeTasks": [ { "id": "task-1", "status": "in_progress" } ],
  "blockedReason": "waiting_for_other_workspace | waiting_for_user",
  "timestamp": "..."
}
```

**Conductor Issues Directive:**
```json
{
  "type": "rebalance | escalate | interrupt | plan_update",
  "targetWorkspace": "ws-abc",
  "details": { ... }
}
```

---

## Layer Interaction Summary

```
╔═════════════════════════════════════════════════════════════════════╗
║ LAYER 1: USER INTERACTION                                           ║
║ (Voice, Text, Gesture, Drag-Drop → Events to Conductor)             ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↓ Routes to appropriate Orchestrator ↓                              ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 2: AGENT ORCHESTRATION                                        ║
║ (Conductor → Workspace Orchestrator → Leaf Agents)                  ║
║ (Blackboard/scratchpad for coordination)                            ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↓ Agents generate actions ↓                                         ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 3: ACTION DISPATCH                                            ║
║ (Validation, permission, routing, execution)                        ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↓ Pulls context from, writes state to ↓                             ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 4: MEMORY SYSTEM                                              ║
║ (Episodic, Semantic, Procedural, Working)                           ║
║ (Context loading, storage, retrieval)                               ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↑ UI actions flow back to Layer 5 ↑                                 ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 5: DYNAMIC RENDERING ENGINE                                   ║
║ (Component tree → instant render, event capture)                    ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↓ Executed by ↓                                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 6: RUNTIME & PROCESS                                          ║
║ (Rust kernel, Go orchestration, TS renderer, Tauri shell)           ║
║ (Process isolation, sandboxing, lifecycle)                          ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↑ Informs and learns from ↑                                         ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 7: INTELLIGENCE LAYER                                         ║
║ (User modeling, planning, learning, permissions, sensors)           ║
║ (Feeds context into Layer 2)                                        ║
╠═════════════════════════════════════════════════════════════════════╣
║ ↔ Synchronized across users by ↔                                    ║
╠═════════════════════════════════════════════════════════════════════╣
║ LAYER 8: COLLABORATION                                              ║
║ (Multi-user sync, memory access control, conflict resolution)       ║
╚═════════════════════════════════════════════════════════════════════╝
```

---

## Key Design Decisions

1. **Three-Level Agent Hierarchy**
   - Leaf agents stay focused on single window/domain
   - Orchestrators handle workspace-level sequencing
   - Conductor maintains global coherence and long-term plans
   - Reason: Balances autonomy with coordination

2. **Strongly-Typed Action Dispatch**
   - All computation is validated JSON actions
   - Enables sandboxing, logging, learning
   - Agents cannot call arbitrary code
   - Reason: Safety and auditability

3. **Multiple Memory Systems**
   - Episodic for "what happened"
   - Semantic for "what do I know"
   - Procedural for "how do I do things"
   - Working for "what am I doing now"
   - Reason: Different query patterns need different storage

4. **Instant Rendering (No Build)**
   - Component trees emitted as JSON
   - Rendered immediately without compilation
   - Fast iteration for LLM-generated UIs
   - Reason: Enables dynamic app creation at runtime

5. **Blackboard Architecture**
   - Workspace scratchpad for async agent communication
   - Eliminates polling and tight coupling
   - Single source of truth for task state
   - Reason: Supports multiple agents working on same task

6. **Sandboxed LLM-Created Actions**
   - Tier 3 actions run in isolated process
   - Gradually promoted to Tier 2 if proven safe
   - Enables experimentation without risk
   - Reason: Balance between safety and expressiveness

---

## Performance Budgets (Summary)

| Operation | Target Latency | P99 Latency |
|---|---|---|
| Voice input capture | <200ms | <500ms |
| Touch input response | <100ms | <300ms |
| Agent think time (Leaf) | <5s | <15s |
| Action dispatch | <5ms | <50ms |
| Memory retrieval | <50ms | <200ms |
| UI render | <16ms per frame | <50ms |
| Permission decision | <100ms | <500ms |

---

## Implementation Roadmap Implications

1. **Core-First:** Implement Layer 6 (Runtime) before Layer 2 (Agents)
   - Build the execution substrate first
   - Agents depend on process management

2. **Action Dispatch → Memory:** Implement Layer 3 and Layer 4 together
   - Actions need memory as a target
   - Memory system needs action dispatch to store

3. **UI ← Agents:** Build Layer 5 (Rendering) after agents can emit actions
   - Agents need something to render into

4. **Intelligence Last:** Layer 7 (Learning, Planning) enhances but isn't critical
   - System functional without learning
   - Add incrementally for polish

---

## Document Purpose & Audience

This document is a **self-contained specification** for engineers implementing any layer. It defines:
- What each layer does
- How layers communicate
- Data contracts and interfaces
- Performance requirements
- No ambiguity—ready for code generation

**Use this document to:**
- Understand the complete system before diving into a specific layer
- Implement a layer with confidence about dependencies
- Debug cross-layer issues
- Make architectural decisions consistent with the whole

---

**Document Status:** Active Specification
**Last Updated:** 2026-03-23
**Next Document:** 05-Layer1-UserInteraction.md (detailed interaction model)
