# Document 6: Agent Hierarchy and Orchestration Model

**Status**: Design Document
**Version**: 1.0
**Date**: 2026-03
**Scope**: LLM-Native Operating System Architecture

---

## 1. Overview

The LLM-native OS employs a three-tiered agent hierarchy that mirrors human cognitive organization: a strategic conductor maintaining global context, mid-level workspace orchestrators managing domain-specific workflows, and specialized leaf agents executing focused tasks. This architecture enables emergent collaboration, graceful escalation, and transparent cross-workspace awareness while remaining model-agnostic in implementation.

The system prioritizes **proactive planning** over reactive responsiveness, with persistent living documents that capture evolving user context and priorities.

---

## 2. Three-Tier Agent Hierarchy

### 2.1 Conductor (Top Level)

**Role**: Global strategist and resource coordinator
**Scope**: All workspaces, user priorities, long-term goals
**Responsibilities**:
- Maintains comprehensive mental model of user's overall objectives
- Understands dependencies and semantic connections across workspaces
- Allocates computational resources between competing demands
- Orchestrates cross-workspace coordination when needed
- Proactively reviews and updates persistent planning documents
- Surfaces opportunities and insights across workspaces
- Decides when to spawn new workspaces or consolidate existing ones

**Key Characteristic**: NOT reactive. Proactively maintains living context documents and revisits plans periodically (not only on user command).

**Capabilities Required**:
- Long-context reasoning (must hold multiple workspace states)
- Planning and goal decomposition
- Cross-domain pattern recognition
- Strategic resource allocation
- Temporal reasoning (deadlines, priorities, sequencing)

**Model Selection**: User chooses (typically a high-capability model like Claude 3.5 Sonnet or equivalent)

**Example Conductor Knowledge State**:
```
Active Workspaces:
1. Thesis (academic writing)
   - Chapter 3: DRAFTED (completed 2026-03-15)
   - Chapter 4: BLOCKED (needs data analysis pipeline)
   - Deadline: 2026-04-10 (18 days)
   - Today's priority: Complete analysis pipeline for experimental results
   - Dependencies: Needs statistical validation, visualization outputs

2. Portfolio (professional projects)
   - Project A: COMPLETE (refactoring feedback applied)
   - Project B: IN REVIEW (awaiting peer feedback)
   - Connection detected: Project A results would strengthen thesis Chapter 5 case study

3. System Design Interview Prep
   - Next interview: 2026-04-02 (10 days)
   - Topics covered so far: distributed caching, load balancing
   - Next: consensus algorithms, database sharding
   - Connection detected: Portfolio Project A (distributed system design) could serve as concrete example

INSIGHTS & OPPORTUNITIES:
- Portfolio project A results = strong thesis example (flag for thesis workspace)
- Thesis chapter 4 analysis could demonstrate system design interview prep concepts
- Current bottleneck: analysis pipeline completion (highest impact work)
- Recommended focus: Complete analysis code → test suite → visualization
```

---

### 2.2 Workspace Orchestrator (Mid Level)

**Role**: Domain-specific workflow manager
**Scope**: Single workspace with specific context (thesis, coding project, learning topic, etc.)
**Responsibilities**:
- Owns complete workflow context for its domain
- Manages and coordinates leaf agents within the workspace
- Tracks workspace-specific state, documents, references, deadlines
- Reports progress and status up to conductor
- Identifies when escalation is needed (blocked agents, out-of-scope questions)
- Routes requests to appropriate leaf agents
- Manages scratchpad communication within workspace
- Handles cross-workspace requests through conductor

**Key Characteristic**: Deeply understands domain details but delegates execution to specialized agents.

**Capabilities Required**:
- Domain knowledge (e.g., academic writing conventions, programming patterns)
- Workflow management and state tracking
- Agent coordination and task decomposition
- Communication with conductor
- Context preservation across agent restarts

**Model Selection**: User chooses (typically slightly lighter than conductor, but still capable—e.g., Claude 3.5 Sonnet or Haiku with specialized context)

**Example Workspace Orchestrator State (Thesis Workspace)**:
```
Workspace: Thesis Writing
Domain: Academic manuscript (experimental sciences)
Workspace Configuration:
  - Editor Agent (document authoring)
  - Research Agent (literature search, citation management)
  - Analysis Agent (data processing, statistical validation)
  - Visualization Agent (plots, figures)
  - Formatting Agent (style, citations, cross-references)

Current Status:
  - Chapter 3: 8,500 words (DRAFT COMPLETE)
  - Chapter 4: 3,200 words (IN PROGRESS - needs analysis)
  - References: 87 unique sources catalogued
  - Figures: 12/18 needed figures generated
  - Timeline: 18 days to deadline

Critical Path:
  1. Complete analysis pipeline (3 days)
  2. Generate final visualizations (2 days)
  3. Write Chapter 4 body (4 days)
  4. Revise all chapters (3 days)
  5. Format and submit (1 day)

Known Blockers:
  - Analysis Agent: Statistical validation module needs testing
  - Research Agent: Two key papers in revision, deadline uncertain
  - Visualization Agent: Custom color scheme for thesis templates

Next Actions:
  - Escalate to Conductor: Do we deprioritize Portfolio Project B to focus on analysis?
  - Coordinate: Research Agent → find alternative references if papers delayed
  - Execute: Analysis Agent → run full test suite on validation module
```

---

### 2.3 Leaf Agents (Bottom Level)

**Role**: Specialized task executors
**Scope**: Single well-defined capability (code editing, terminal execution, web browsing, document formatting)
**Responsibilities**:
- Execute focused, well-scoped tasks
- Maintain local state within their domain (open files, current prompt, execution context)
- Communicate via workspace scratchpad
- Escalate to workspace orchestrator when blocked or encountering out-of-scope issues
- Report completion status and results
- Handle domain-specific error recovery

**Key Characteristic**: Does one thing well. No coordination burden on the leaf agent itself.

**Examples**:
- **Code Editor Agent**: Syntax highlighting, refactoring suggestions, completion, inline error checking
- **Terminal Agent**: Execute commands, capture output, manage processes, handle failures
- **Browser Agent**: Navigate, search, extract content, interact with web applications
- **Research Agent**: Query databases, manage citations, search literature
- **Visualization Agent**: Create plots, adjust styling, export formats
- **Formatting Agent**: Apply style guides, manage citations, cross-references, layout

**Capabilities Required**:
- Domain expertise for their specific task
- Error detection and basic recovery
- Clear communication of state and blockers
- Ability to escalate and receive guidance from orchestrator

**Model Selection**: User chooses. Can be smaller/faster models optimized for specific tasks (e.g., smaller LLM for code formatting, Claude Haiku for terminal operations)

**Example Leaf Agent State (Code Editor)**:
```
Agent: Code Editor Agent
Window: analysis_pipeline.py
Active State:
  - File: /workspace/thesis/analysis/pipeline.py (524 lines)
  - Cursor position: Line 187 (inside statistical_validation function)
  - Unsaved changes: 47 lines modified
  - Current task: Fix type hints in statistical module

Recent Actions:
  - Added mypy type checking (line 42-45)
  - Refactored validation function signature (line 185-195)
  - Identified issue: return type mismatch on line 192

Status: WORKING
Blocker: Return type 'Union[Dict, None]' doesn't match function docstring
  Expected: 'ValidationResult' (custom class)

Ready to Escalate to Orchestrator:
  - Should we introduce ValidationResult dataclass?
  - Would require updates to 4 calling functions
  - Estimated effort: 30 minutes
```

---

## 3. Agent Communication and Coordination

### 3.1 Shared Scratchpad/Blackboard Pattern

Each workspace maintains a shared scratchpad—structured working memory accessible to all leaf agents in that workspace. Unlike simple message passing, the scratchpad is a persistent, queryable log of observations, discoveries, and state notes.

**Scratchpad Structure**:
```json
{
  "workspace_id": "thesis-2026-03",
  "scratchpad": [
    {
      "timestamp": "2026-03-23T14:32:00Z",
      "agent": "research-agent",
      "entry_type": "discovery",
      "scope": "references",
      "message": "Located paper 'Bayesian Methods in Experimental Design' (Smith et al., 2024) - highly relevant to Chapter 4 methodology",
      "data": {
        "paper_id": "smith2024bayesian",
        "cite_key": "smith:2024",
        "relevance": "methodology-validation",
        "priority": "high"
      }
    },
    {
      "timestamp": "2026-03-23T14:15:00Z",
      "agent": "code-editor-agent",
      "entry_type": "blocker",
      "scope": "analysis-pipeline",
      "message": "Statistical validation module has type hint mismatch - line 192 return type conflicts with ValidationResult requirement",
      "data": {
        "file": "analysis/pipeline.py",
        "line": 192,
        "issue_type": "type-mismatch",
        "requires_escalation": true,
        "escalation_reason": "architectural-decision"
      }
    },
    {
      "timestamp": "2026-03-23T14:00:00Z",
      "agent": "visualization-agent",
      "entry_type": "status",
      "scope": "figures",
      "message": "Generated figures 7-9 (box plots for grouped data). Matching thesis template color scheme.",
      "data": {
        "figures_generated": [7, 8, 9],
        "format": "pdf",
        "location": "thesis/figures/",
        "ready_for_inclusion": true
      }
    },
    {
      "timestamp": "2026-03-23T13:30:00Z",
      "agent": "research-agent",
      "entry_type": "preference",
      "scope": "user-preferences",
      "message": "User confirmed preference for APA 7th edition citations across all chapters",
      "data": {
        "citation_style": "APA-7",
        "applies_to": "all-chapters",
        "previously_confirmed": false,
        "decision_date": "2026-03-23"
      }
    }
  ]
}
```

**Scratchpad Entry Schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["timestamp", "agent", "entry_type", "scope", "message"],
  "properties": {
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of entry creation"
    },
    "agent": {
      "type": "string",
      "description": "ID of agent creating this entry (e.g., 'code-editor-agent', 'research-agent')"
    },
    "entry_type": {
      "type": "string",
      "enum": ["discovery", "blocker", "status", "preference", "decision", "insight", "error"],
      "description": "Classification of scratchpad entry"
    },
    "scope": {
      "type": "string",
      "description": "Which aspect of workspace this relates to (e.g., 'analysis-pipeline', 'references', 'figures')"
    },
    "message": {
      "type": "string",
      "description": "Human-readable summary of the entry"
    },
    "data": {
      "type": "object",
      "description": "Structured data supporting the entry (varies by entry_type)"
    },
    "requires_escalation": {
      "type": "boolean",
      "default": false,
      "description": "Whether this entry requires orchestrator or conductor attention"
    }
  }
}
```

**Scratchpad Query Examples**:
- "What blockers are currently marked by leaf agents?"
- "Show me all discoveries in the 'analysis-pipeline' scope from the last 2 hours"
- "What are the user's stated preferences for this workspace?"
- "What figures have been marked as ready for inclusion?"
- "Has the research agent found papers on topic X?"

---

### 3.2 Agent Message Protocol

Agents communicate upward (to orchestrator/conductor) through structured messages. These are distinct from scratchpad entries—messages are ephemeral requests, while scratchpad is persistent working memory.

**Upward Agent Message Schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["message_id", "source_agent", "destination", "message_type", "timestamp"],
  "properties": {
    "message_id": {
      "type": "string",
      "pattern": "^[a-z0-9-]{16,}$",
      "description": "Unique message identifier for tracking"
    },
    "source_agent": {
      "type": "string",
      "description": "ID of the agent sending this message"
    },
    "destination": {
      "type": "string",
      "enum": ["workspace-orchestrator", "conductor"],
      "description": "Where this message is directed"
    },
    "message_type": {
      "type": "string",
      "enum": ["status-update", "escalation", "resource-request", "coordination-request", "query"],
      "description": "Type of message"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "payload": {
      "type": "object",
      "description": "Message-specific content"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "normal", "high", "critical"],
      "default": "normal"
    },
    "expected_response_type": {
      "type": "string",
      "enum": ["acknowledgment", "guidance", "resource-allocation", "decision"],
      "description": "What kind of response the agent expects"
    }
  }
}
```

**Message Type Examples**:

**Status Update** (leaf → orchestrator):
```json
{
  "message_id": "msg-20260323-14-32-001",
  "source_agent": "visualization-agent",
  "destination": "workspace-orchestrator",
  "message_type": "status-update",
  "timestamp": "2026-03-23T14:32:15Z",
  "priority": "normal",
  "payload": {
    "status": "complete",
    "task": "Generate box plots for Chapter 4 data",
    "figures_generated": [7, 8, 9],
    "quality_check": "passed",
    "next_step": "await-inclusion-instructions",
    "artifacts": {
      "location": "/workspace/thesis/figures/",
      "files": ["fig7_grouped_boxplots.pdf", "fig8_distribution.pdf", "fig9_outliers.pdf"],
      "total_size": "2.3MB"
    }
  },
  "expected_response_type": "acknowledgment"
}
```

**Escalation** (leaf → orchestrator):
```json
{
  "message_id": "msg-20260323-14-15-002",
  "source_agent": "code-editor-agent",
  "destination": "workspace-orchestrator",
  "message_type": "escalation",
  "timestamp": "2026-03-23T14:15:30Z",
  "priority": "high",
  "payload": {
    "blocker_type": "architectural-decision",
    "description": "Type signature mismatch in validation module requires design decision",
    "context": {
      "file": "/workspace/analysis/pipeline.py",
      "line": 192,
      "issue": "Return type Union[Dict, None] conflicts with ValidationResult requirement",
      "impact": "Blocks 4 downstream functions, estimated 30 min to fix once decision made"
    },
    "options": [
      {
        "option": "A",
        "description": "Introduce ValidationResult dataclass, update all callers",
        "pros": ["Type safe", "self-documenting"],
        "cons": ["More refactoring"],
        "effort": "30 minutes"
      },
      {
        "option": "B",
        "description": "Use Dict with documented schema, suppress type hints",
        "pros": ["Minimal changes"],
        "cons": ["Type safety lost", "less maintainable"],
        "effort": "5 minutes"
      }
    ],
    "recommendation": "Option A - better long-term code quality"
  },
  "expected_response_type": "guidance"
}
```

**Resource Request** (leaf → orchestrator → conductor):
```json
{
  "message_id": "msg-20260323-13-00-003",
  "source_agent": "research-agent",
  "destination": "workspace-orchestrator",
  "message_type": "resource-request",
  "timestamp": "2026-03-23T13:00:00Z",
  "priority": "normal",
  "payload": {
    "resource_type": "computational",
    "request": "Execute systematic literature search across 5 academic databases",
    "reason": "Need 40+ papers on Bayesian methods for Chapter 4 validation",
    "estimated_duration": "15 minutes",
    "estimated_cost": "low (API calls within quota)"
  },
  "expected_response_type": "resource-allocation"
}
```

**Coordination Request** (orchestrator → conductor):
```json
{
  "message_id": "msg-20260323-12-00-004",
  "source_agent": "thesis-orchestrator",
  "destination": "conductor",
  "message_type": "coordination-request",
  "timestamp": "2026-03-23T12:00:00Z",
  "priority": "high",
  "payload": {
    "request_type": "workspace-prioritization",
    "context": "Thesis Chapter 4 analysis pipeline is critical path item. Completion by 2026-03-26 required for schedule adherence.",
    "question": "Should we deprioritize Portfolio Project B peer review to allocate full focus to analysis completion?",
    "workspace_states": {
      "thesis": { "urgency": "critical", "days_to_deadline": 18 },
      "portfolio": { "urgency": "medium", "status": "waiting-for-feedback" }
    },
    "recommendation": "Pause Portfolio Project B work, allocate available context to thesis analysis"
  },
  "expected_response_type": "decision"
}
```

---

## 4. Escalation and Delegation Patterns

Escalation is the core mechanism enabling emergent collaboration without requiring the user to manually orchestrate agents.

### 4.1 Escalation Trigger Conditions

Leaf agents escalate to workspace orchestrator when encountering:

1. **Out-of-Scope Questions**: "Should we use APA or Chicago citations?" → escalate to orchestrator (workspace decision)
2. **Architectural Decisions**: Type design, module structure, workflow changes → escalate to orchestrator
3. **Conflicting Instructions**: Contradictory guidance from different parts of system → escalate to orchestrator
4. **Resource Constraints**: Need more computational resources, API quota exceeded → escalate to orchestrator
5. **Cross-Domain Questions**: "Would example from Portfolio Project A work here?" → escalate to conductor
6. **Blocked Progress**: Agent unable to make forward progress on assigned task → escalate to orchestrator
7. **Temporal Questions**: "Is it worth 2 hours to implement this feature?" → escalate to orchestrator (deadline context)

Workspace orchestrators escalate to conductor when encountering:

1. **Cross-Workspace Coordination**: Need to pause one workspace to focus another → escalate to conductor
2. **Strategic Conflicts**: Competing priorities across workspaces → escalate to conductor
3. **Resource Allocation**: Demand exceeds available computational budget → escalate to conductor
4. **Semantic Opportunities**: Found connection between workspaces → escalate to conductor
5. **Goal Conflicts**: Current workspace direction conflicts with stated user goal in another workspace → escalate to conductor

### 4.2 Escalation Flow Diagram

```
Leaf Agent Blocked
       ↓
[Attempt local recovery - 2 min timeout]
       ↓
Can recover? → YES → Continue
       ↓ NO
   ESCALATE to Workspace Orchestrator
       ↓
[Orchestrator analyzes in domain context - 5 min timeout]
       ↓
Can resolve with existing authority? → YES → Send guidance back to leaf agent
       ↓ NO
   ESCALATE to Conductor
       ↓
[Conductor analyzes with global context - 10 min timeout]
       ↓
Can resolve strategically? → YES → Send decision back through orchestrator to leaf agent
       ↓ NO
   FLAG FOR USER DECISION (with full context and recommendations)
```

### 4.3 Escalation Request Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["escalation_id", "source_agent", "escalation_level", "timestamp", "reason"],
  "properties": {
    "escalation_id": {
      "type": "string",
      "description": "Unique identifier for this escalation"
    },
    "source_agent": {
      "type": "string",
      "description": "Which agent is escalating"
    },
    "escalation_level": {
      "type": "string",
      "enum": ["orchestrator", "conductor"],
      "description": "Where this escalation is directed"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "reason": {
      "type": "string",
      "enum": [
        "out-of-scope",
        "architectural-decision",
        "conflicting-instructions",
        "resource-constraint",
        "cross-domain-question",
        "blocked-progress",
        "temporal-question",
        "cross-workspace-coordination",
        "strategic-conflict",
        "semantic-opportunity",
        "goal-conflict"
      ]
    },
    "context": {
      "type": "object",
      "description": "Full context of the escalation"
    },
    "blocking_task": {
      "type": "string",
      "description": "What task is blocked by this escalation"
    },
    "timeout_duration_seconds": {
      "type": "integer",
      "description": "How long agent will wait for response (120-600)"
    },
    "acceptable_resolution_types": {
      "type": "array",
      "items": { "type": "string" },
      "description": ["guidance", "decision", "escalation-to-user"]
    }
  }
}
```

---

## 5. Persistent Living Planning Documents

The conductor maintains a living planning document for each workspace. These are not static plans—they evolve as work progresses, blockers emerge, and new information arrives.

### 5.1 Planning Document Structure

**File Location**: `{workspace_id}/CONDUCTOR_PLAN.md`

```markdown
# Conductor Plan: Thesis Writing (workspace-thesis-2026-03)

**Last Updated**: 2026-03-23T14:45:00Z
**Update Frequency**: Reviewed every workspace state change, proactively every 24h
**Next Proactive Review**: 2026-03-24T14:00:00Z

## User Context

Abhinav is working on his experimental biology thesis with a submission deadline of 2026-04-10 (18 days from today). The thesis examines bacterial growth patterns under varying environmental conditions. He is methodical, detail-oriented, and prefers evidence-based decision making. He maintains three active workspaces: thesis (primary), portfolio (professional projects), and interview prep (upcoming system design interviews).

## Current Status

### Chapters Breakdown

| Chapter | Status | Word Count | Quality | Deadline | Dependencies |
|---------|--------|-----------|---------|----------|---|
| 1 Introduction | COMPLETE | 2,100 | Final revision | 2026-04-10 | None |
| 2 Literature Review | COMPLETE | 4,200 | Pending final pass | 2026-04-10 | 3 references in revision |
| 3 Methods | DRAFT COMPLETE | 8,500 | Content ready | 2026-03-28 | Code cleanup |
| 4 Results & Analysis | IN PROGRESS | 3,200 | Blocked on analysis pipeline | 2026-04-02 | Analysis suite, visualizations |
| 5 Discussion | NOT STARTED | 0 | Planning phase | 2026-04-05 | Ch 3-4 completion |
| 6 Conclusion | NOT STARTED | 0 | Planning phase | 2026-04-08 | All chapters |

### Critical Path

**Immediate (3 days)**: Complete analysis pipeline and statistical validation
**Near-term (7 days)**: Generate visualizations, complete Chapter 4 writing
**Mid-term (14 days)**: Chapters 5-6, comprehensive revision pass
**Final (18 days)**: Formatting, submission

### Top Blockers

1. **Analysis Pipeline** (HIGH PRIORITY)
   - Statistical validation module has type design issue (identified 2026-03-23 14:15)
   - Resolution: Introduce ValidationResult dataclass
   - Expected impact: Unblocks all Chapter 4 work
   - Estimated completion: 2026-03-23 15:00

2. **Reference Delays** (MEDIUM PRIORITY)
   - Two key papers in revision (Smith et al., Patel et al.), delivery dates uncertain
   - Contingency: Research agent found 3 alternative papers covering same concepts
   - No blocking impact if contingency used

3. **Figure Generation** (LOW PRIORITY)
   - Visualization agent has generated 12/18 figures
   - Remaining 6 figures blocked on analysis completion
   - Timeline: Once analysis pipeline fixed, 2-3 hours to complete

## Resource Allocation

**Current Focus**: Thesis (85% of available context)
**Portfolio PR Review**: Paused (deprioritized 2026-03-23 by conductor)
**Interview Prep**: Minimal (10-15% context, passive review mode)

**Rationale**: Thesis has hardest deadline and critical path items. Portfolio review can resume after Chapter 4 completion.

## Cross-Workspace Insights

**Detected Connection**: Portfolio Project A (distributed caching system design) is a strong concrete example for:
- Thesis Chapter 5 (practical applications of experimental methodology)
- System Design Interview Prep (distributed systems fundamentals)

**Action Item**: Flag this connection in portfolio workspace—Project A could be polished into interview preparation artifact.

## Known Preferences

- Citation style: APA 7th edition (confirmed 2026-03-23)
- Figure formatting: Thesis template color scheme, PDF export
- Writing tone: Formal academic, evidence-based
- Collaboration: Solo work, orchestrator can make decisions without user input on routine matters

## Next Actions & Timeline

**2026-03-23 (Today)**
- [ ] Complete analysis pipeline type refactoring
- [ ] Run full statistical validation test suite
- [ ] Generate visualizations for Chapter 4

**2026-03-24**
- [ ] Complete Chapter 4 first draft (using pipeline results)
- [ ] Integrate references from research agent findings

**2026-03-25**
- [ ] Begin Chapter 5 outline and early drafting
- [ ] Conduct comprehensive revision of Chapters 1-3

**2026-03-26**
- [ ] Chapter 4 finalization and integration
- [ ] Final figure insertions

**2026-03-28 to 2026-04-02**
- [ ] Chapters 5-6 writing and revision
- [ ] Cross-chapter consistency check

**2026-04-03 to 2026-04-08**
- [ ] Final comprehensive revision pass
- [ ] Citation and formatting review
- [ ] PDF generation and validation

**2026-04-09**
- [ ] Final proofreading
- [ ] Submission preparation

**2026-04-10**
- [ ] SUBMIT

## Decision Log

| Date | Decision | Rationale | Outcome |
|------|----------|-----------|---------|
| 2026-03-23 14:30 | Use ValidationResult dataclass | Type safety, maintainability | Approved by orchestrator |
| 2026-03-23 12:00 | Pause Portfolio Project B | Thesis deadline criticality | No impact on portfolio timeline |

## Plan Evolution Notes

- **2026-03-23 14:45**: Added escalation context from code-editor-agent on type design. Verified with orchestrator, conductor approved architectural direction.
- **2026-03-23 13:30**: User confirmed APA 7 citation preference—updated across all workspace guidelines.
- **2026-03-23 13:00**: Research agent located 40+ relevant papers. Priority flagged to visualization agent to guide analysis scope.

---

## Conductor Assessment

**Overall Progress**: 47% (18.5 of 39.5 expected chapters complete by this date)
**Timeline Risk**: LOW (all critical path items on schedule)
**Resource Sufficiency**: ADEQUATE (minor block in analysis, otherwise progressing)
**Next Review**: 2026-03-24T14:00:00Z (proactive daily review)

**Key Success Factors**:
1. Complete analysis pipeline today (in progress)
2. Finish Chapter 4 by 2026-04-02
3. Maintain writing momentum through Chapters 5-6
4. Budget 2-3 days for comprehensive revision pass

---
```

### 5.2 Planning Document Update Triggers

The conductor proactively updates living plans when:

- **Agent escalation received** → Update context, add blocker, adjust timeline if needed
- **Status change from orchestrator** → Update chapter/task completion percentages
- **New preference stated by user** → Update guidelines section
- **Cross-workspace opportunity detected** → Add insights section
- **Blocker resolved** → Update status, remove from blocker list
- **Deadline change** → Recalculate critical path
- **Scheduled proactive review** (every 24h) → Full assessment of progress, emerging patterns, timeline risk

Updates are timestamped and logged so history is preserved.

---

## 6. Agent Lifecycle Management

### 6.1 Agent Spawning

**Workspace-Level Spawning**:
```
User opens new workspace (e.g., "Let's start a new thesis project")
     ↓
Conductor detects new workspace, routes to appropriate context setup
     ↓
Workspace Orchestrator initialized with domain knowledge base
     ↓
Orchestrator spawns required leaf agents based on workspace type:
   - Document workspace → Editor agent, Formatting agent, Research agent
   - Coding workspace → Code Editor agent, Terminal agent, Test Runner agent
   - Hybrid workspace → Multiple agents as appropriate
     ↓
Scratchpad created, Planning document initialized
     ↓
Status: READY
```

**Window-Level Spawning**:
```
User opens new window within workspace (e.g., opens terminal in coding workspace)
     ↓
Workspace Orchestrator detects window type
     ↓
Appropriate leaf agent spawned with window context
     ↓
Agent loads previous state if available (reuse context), or initializes fresh
     ↓
Status: READY
```

**Configuration Parameters**:
```json
{
  "workspace_id": "thesis-2026-03",
  "workspace_type": "academic-writing",
  "spawn_manifest": {
    "agents": [
      {
        "agent_id": "editor-agent",
        "role": "document-authoring",
        "model": "claude-opus-4.5",
        "context_size": 16000,
        "capabilities": ["syntax-aware-editing", "refactoring", "multi-file-editing"]
      },
      {
        "agent_id": "research-agent",
        "role": "literature-management",
        "model": "claude-sonnet-3.5",
        "context_size": 8000,
        "capabilities": ["database-search", "citation-management", "source-evaluation"]
      },
      {
        "agent_id": "analysis-agent",
        "role": "data-processing",
        "model": "claude-haiku-3.0",
        "context_size": 4000,
        "capabilities": ["statistical-analysis", "code-execution", "result-validation"]
      }
    ],
    "orchestrator": {
      "model": "claude-sonnet-3.5",
      "context_size": 32000
    },
    "conductor": {
      "model": "claude-opus-4.5",
      "context_size": 128000
    }
  },
  "initial_state": {
    "active_documents": ["thesis_outline.md"],
    "scratchpad_location": "/workspace/thesis/.scratchpad",
    "planning_doc_location": "/workspace/thesis/CONDUCTOR_PLAN.md"
  }
}
```

### 6.2 Agent Shutdown and State Preservation

**Normal Shutdown** (window closes, workspace closes):
```
Agent receives shutdown signal
     ↓
Agent writes final state to persistent storage:
  - Current file positions and selections
  - In-progress tasks and status
  - Scratchpad entries (critical state)
  - Session metadata (timestamp, tokens used, etc.)
     ↓
Agent uploads any modified workspace artifacts
     ↓
Agent terminates gracefully
     ↓
State files retained for next session
```

**State Preservation Schema**:
```json
{
  "agent_id": "code-editor-agent",
  "workspace_id": "thesis-2026-03",
  "session_id": "session-20260323-14-32-abc123",
  "shutdown_timestamp": "2026-03-23T14:47:30Z",
  "shutdown_reason": "user-closed-window",
  "preserved_state": {
    "open_files": [
      {
        "path": "/workspace/thesis/analysis/pipeline.py",
        "cursor_line": 192,
        "cursor_column": 45,
        "selection": { "start": 185, "end": 195 },
        "unsaved_changes": false
      }
    ],
    "active_task": "Fix type hints in statistical module",
    "task_progress": 65,
    "recent_edits": [
      { "timestamp": "2026-03-23T14:45:00Z", "change": "Added mypy configuration" },
      { "timestamp": "2026-03-23T14:30:00Z", "change": "Refactored validation function" }
    ],
    "scratchpad_entries_created": 3,
    "escalations_sent": 1
  },
  "metadata": {
    "tokens_used": 8420,
    "wall_clock_time_seconds": 845,
    "errors_encountered": 0
  }
}
```

**State Restoration** (next session):
```
User reopens window in workspace
     ↓
Orchestrator detects returning agent window
     ↓
Workspace loads previous agent state from storage
     ↓
Agent initializes with:
  - Open files in previous positions
  - Previous task context
  - Scratchpad entries from last session
  - Recent decision/escalation history
     ↓
Agent asks for brief update if > 1 hour has passed since shutdown
  ("Anything new since I was last here?")
     ↓
Agent resumes from previous task state
```

### 6.3 Agent Failure Handling

**Detection**:
```
Agent doesn't respond to orchestrator within timeout (varies: 30s for leaf, 5min for orchestrator)
     ↓
Orchestrator marks agent as UNRESPONSIVE
     ↓
Orchestrator attempts graceful recovery:
  1. Send reset signal
  2. If no response within 10s: terminate and restart agent
  3. If restart fails: escalate to conductor
```

**Recovery Strategy**:

```json
{
  "failure_type": "agent-timeout",
  "affected_agent": "code-editor-agent",
  "workspace_id": "thesis-2026-03",
  "detection_time": "2026-03-23T15:00:00Z",

  "recovery_steps": [
    {
      "step": 1,
      "action": "send-reset-signal",
      "timeout_seconds": 10,
      "success": false,
      "timestamp": "2026-03-23T15:00:05Z"
    },
    {
      "step": 2,
      "action": "terminate-and-restart",
      "preserve_state": true,
      "success": true,
      "timestamp": "2026-03-23T15:00:15Z",
      "recovery_state_loaded": true,
      "agent_restarted": "2026-03-23T15:00:20Z"
    }
  ],

  "outcome": "RECOVERED",
  "data_loss": false,
  "user_notification": "Code editor recovered from temporary unresponsiveness. All changes preserved."
}
```

**Permanent Failure** (recovery exhausted):
```
Agent fails to restart after 3 attempts
     ↓
Orchestrator escalates to conductor
     ↓
Conductor decides:
  a) Migrate task to different agent type (if possible)
  b) Notify user and request manual intervention
  c) Queue task for retry when fresh workspace context available
     ↓
Scratchpad entry logged with failure details for debugging
```

### 6.4 Conductor Restart Handling

If the conductor itself becomes unresponsive:

```
User or system detects conductor unresponsiveness
     ↓
System loads latest planning documents for all workspaces
     ↓
New conductor instance starts with:
  - All workspace state from planning docs
  - Scratchpad histories
  - Orchestrator status reports
     ↓
Conductor performs "state reconciliation":
  - Verify all workspace states align with loaded plans
  - Check for any decisions that need immediate review
  - Resume proactive planning cycles
     ↓
Notify user: "Conductor restarted. All workspace context preserved."
```

**State Reconstruction Query** (conductor on startup):
```
Conductor → Orchestrators:
"Send me your current workspace state, including:
  - All open agents and their status
  - Scratchpad entries from last 24h
  - Any pending escalations
  - Current task progress
  - Known blockers"
     ↓
Orchestrators respond within 30 seconds
     ↓
Conductor reconciles with stored planning documents
     ↓
If conflicts detected: flag for manual resolution (unlikely in normal operation)
     ↓
Resume normal operation
```

---

## 7. Cross-Workspace Coordination Patterns

### 7.1 Conductor-Mediated Workspace Pausing

When a higher-priority workspace needs focus:

```json
{
  "coordination_request_id": "coord-20260323-12-00-001",
  "source_orchestrator": "thesis-orchestrator",
  "destination": "conductor",
  "message_type": "prioritization-request",
  "timestamp": "2026-03-23T12:00:00Z",

  "request": {
    "question": "Should we pause Portfolio Project B to accelerate thesis completion?",
    "current_state": {
      "thesis": {
        "workspace_id": "thesis-2026-03",
        "urgency": "critical",
        "deadline": "2026-04-10",
        "days_remaining": 18,
        "blocker_status": "one-high-priority-blocker",
        "impact_if_delayed": "thesis-submission-at-risk"
      },
      "portfolio": {
        "workspace_id": "portfolio-2026-03",
        "urgency": "medium",
        "status": "waiting-for-peer-feedback",
        "impact_if_delayed": "timeline-extends-but-not-critical"
      }
    }
  },

  "conductor_response": {
    "decision": "PAUSE_PORTFOLIO_B",
    "rationale": "Thesis has hard deadline 18 days away. Portfolio is in review phase (no active work needed immediately). Pause will recover 3-4 hours/day of context for thesis focus.",
    "action_plan": {
      "immediate": "Portfolio orchestrator receives pause signal",
      "leaf_agents_affected": ["code-review-agent", "documentation-agent"],
      "affected_tasks": ["peer-review-response", "docs-polishing"],
      "estimated_pause_duration": "5 days (until thesis chapter 4 complete)",
      "resume_trigger": "Chapter 4 writing complete and reviewed by orchestrator"
    },
    "cross_workspace_instruction": {
      "to": "portfolio-orchestrator",
      "action": "pause-all-active-work",
      "preserve_state": true,
      "scratchpad_entry_required": true,
      "resume_instruction_will_come_from": "conductor",
      "estimated_resume_date": "2026-03-28"
    }
  }
}
```

### 7.2 Semantic Connection Detection

The conductor continuously scans workspace contexts for meaningful overlaps:

```
Conductor finds: Portfolio Project A = distributed caching system design
     ↓
Conductor finds: Thesis Chapter 5 = practical applications section
     ↓
Conductor recognizes: "This project is a concrete example of the methodology we're writing about"
     ↓
Conductor creates insight entry:

SCRATCHPAD (conductor's global scratchpad, not per-workspace):
{
  "timestamp": "2026-03-23T11:30:00Z",
  "entry_type": "semantic-connection",
  "detected_by": "conductor",
  "connection": "portfolio-to-thesis",
  "source_workspace": "portfolio-2026-03",
  "target_workspace": "thesis-2026-03",
  "insight": "Portfolio Project A (distributed caching system design) serves as excellent concrete example for Thesis Chapter 5 (practical applications of experimental methodology). The caching performance optimization parallels the statistical methodology validation approach used in thesis.",
  "recommendation": "Flag this in thesis workspace so Chapter 5 writing can reference the project as case study. Also valuable for system design interview prep (third workspace).",
  "action_required": "YES - surface to thesis-orchestrator for Chapter 5 planning"
}
     ↓
Conductor sends message to thesis-orchestrator:
"I've detected that your Portfolio Project A would be a strong concrete example for Chapter 5 practical applications section. Found connection: [details]. Should I add this to your planning document?"
```

---

## 8. Model Selection and Configuration

The system is model-agnostic. Users specify which model runs at each level:

### 8.1 Example Configuration: Balanced Performance/Cost

```json
{
  "hierarchy": {
    "conductor": {
      "model": "claude-opus-4.5",
      "context_window": 128000,
      "reasoning_budget": "high",
      "rationale": "Global context requires strongest reasoning, longest context"
    },
    "workspace_orchestrator": {
      "model": "claude-sonnet-3.5",
      "context_window": 32000,
      "reasoning_budget": "medium",
      "rationale": "Domain-specific expertise, but narrower scope than conductor"
    },
    "leaf_agents": {
      "code-editor": {
        "model": "claude-haiku-3.0",
        "context_window": 4000,
        "reasoning_budget": "low",
        "rationale": "Focused task, high throughput, fast response times"
      },
      "terminal": {
        "model": "claude-haiku-3.0",
        "context_window": 4000,
        "reasoning_budget": "low",
        "rationale": "Command execution, minimal reasoning"
      },
      "research": {
        "model": "claude-sonnet-3.5",
        "context_window": 16000,
        "reasoning_budget": "medium",
        "rationale": "Needs to evaluate sources, but narrower scope"
      }
    }
  }
}
```

### 8.2 Example Configuration: Maximum Reasoning

```json
{
  "hierarchy": {
    "conductor": {
      "model": "claude-opus-4.5",
      "context_window": 128000,
      "extended_thinking": true,
      "rationale": "Complex planning, cross-workspace synthesis"
    },
    "workspace_orchestrator": {
      "model": "claude-opus-4.5",
      "context_window": 64000,
      "extended_thinking": true,
      "rationale": "Sophisticated domain orchestration"
    },
    "leaf_agents": {
      "all": {
        "model": "claude-sonnet-3.5",
        "context_window": 16000,
        "extended_thinking": false,
        "rationale": "Strong execution capability with reasonable latency"
      }
    }
  }
}
```

---

## 9. Communication Protocol Formalization

### 9.1 Message Queue and Delivery Guarantees

All agent messages are routed through a message queue to ensure delivery and ordering:

```json
{
  "message_queue": {
    "workspace_id": "thesis-2026-03",
    "queue_entries": [
      {
        "sequence_number": 1,
        "message_id": "msg-20260323-14-32-001",
        "status": "delivered",
        "source": "visualization-agent",
        "destination": "workspace-orchestrator",
        "timestamp_queued": "2026-03-23T14:32:10Z",
        "timestamp_delivered": "2026-03-23T14:32:11Z",
        "delivery_attempts": 1
      },
      {
        "sequence_number": 2,
        "message_id": "msg-20260323-14-15-002",
        "status": "awaiting-response",
        "source": "code-editor-agent",
        "destination": "workspace-orchestrator",
        "timestamp_queued": "2026-03-23T14:15:30Z",
        "timestamp_delivered": "2026-03-23T14:15:31Z",
        "delivery_attempts": 1,
        "expected_response_type": "guidance"
      }
    ],
    "ordering": "FIFO per destination"
  }
}
```

**Delivery Guarantees**:
- Messages are persisted immediately upon creation
- Delivery is attempted continuously until acknowledged by recipient
- Out-of-order messages within a workspace are queued in FIFO order by destination
- No message is lost even if agent/orchestrator/conductor crashes
- On recovery, recovery process checks message queue for undelivered items

---

## 10. Summary: Key Design Principles

1. **Three-Tier Clarity**: Conductor (strategy) → Orchestrators (domain) → Leaf Agents (execution). Clear authority and responsibility at each level.

2. **Proactive Planning**: Conductor maintains living documents that evolve with work progress. Not waiting for user commands to reassess priorities.

3. **Graceful Escalation**: Agents escalate rather than guess. System is designed to surface decisions upward when needed, but delegates heavily when possible.

4. **Persistent Scratchpad**: Shared working memory, not ephemeral message passing. Agents collaborate via structured observations in scratchpad.

5. **Semantic Awareness**: Conductor detects cross-workspace connections and surfaces opportunities for reuse, examples, and prioritization.

6. **Model Agnostic**: User chooses model at each level. System accommodates lightweight executors to heavyweight reasoners.

7. **State Preservation**: Agent shutdown/restart is transparent to user. Full state restored, workspace context maintained.

8. **Failure Resilience**: Comprehensive failure handling at each level. Cascade of recovery strategies before requiring user intervention.

9. **Transparency**: All decisions, blockers, and escalations are logged and visible via scratchpad and planning documents.

10. **Human in the Loop**: Conductor makes routine decisions autonomously but always escalates strategic choices for explicit user approval if needed.

---

## 11. JSON Schema Library

Complete reference schemas for implementation:

**Workspace Configuration Schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["workspace_id", "workspace_type", "conductor_id"],
  "properties": {
    "workspace_id": { "type": "string" },
    "workspace_type": { "type": "string" },
    "conductor_id": { "type": "string" },
    "orchestrator_id": { "type": "string" },
    "created_timestamp": { "type": "string", "format": "date-time" },
    "agents": { "type": "array", "items": { "type": "object" } },
    "scratchpad_location": { "type": "string" },
    "planning_doc_location": { "type": "string" }
  }
}
```

Additional schemas are embedded throughout the document for:
- Scratchpad entries (Section 3.1)
- Agent messages (Section 3.2)
- Escalation requests (Section 4.3)
- State preservation (Section 6.2)
- Message queues (Section 9.1)

---

## Next Documents

- **Document 7**: Memory and Context Management (graph databases, semantic indexing, context reuse)
- **Document 8**: Workspace and Window Architecture (document trees, focus models, persistence)
- **Document 9**: User Intent Interpretation (goal detection, preference learning, temporal context)

