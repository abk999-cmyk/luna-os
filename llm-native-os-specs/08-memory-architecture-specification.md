# Document 8: Memory Architecture Specification
## LLM-Native Operating System Design

**Status:** Core Specification
**Priority:** Critical Implementation Path
**Complexity:** High
**Context Window Impact:** Transformative

---

## Executive Summary

The four-layer memory system is the architectural foundation that transforms a stateless LLM into a contextually aware, adaptive agent. This is not a caching layer—it is an intelligent episodic-semantic-procedural-working memory hierarchy that mirrors human cognition while accounting for the LLM's unique constraints and capabilities.

**Critical Principle:** Working memory management is the single highest-leverage performance multiplier for LLM agent systems. The OS aggressively curates what enters the context window, not the LLM.

---

## Part 1: The Four Memory Layers

### 1.1 Episodic Memory: The Timeline

**Purpose:** A complete, indexed record of what happened and when.

**Data Model:**
```
EpisodeEntry {
  id: string (UUID)
  timestamp: ISO8601
  category: enum [user_action, agent_action, system_event, outcome]
  actor: string (user | agent_name)
  action: string (structured description)
  context_tags: string[] (indexed search fields)
  related_objects: {
    file_paths?: string[]
    project_ids?: string[]
    user_model_updates?: string[]
    semantic_refs?: string[]
  }
  outcome: {
    success: boolean
    result_summary: string
    errors?: string[]
    metrics?: Record<string, number>
  }
  parent_episode: string | null (links to parent workflow)
  duration_ms: number
  cost_tokens: number (if agent action)
}
```

**Examples:**

```
timestamp: 2026-03-23T15:45:22Z
actor: user
action: "Requested refactoring of authentication module in auth_service.ts"
context_tags: ["auth", "refactor", "typescript", "critical-path"]
related_objects.file_paths: ["src/auth/auth_service.ts"]
related_objects.project_ids: ["project-x"]

---

timestamp: 2026-03-23T15:46:10Z
actor: agent-editor
action: "Applied refactoring pattern: extract-method on validateToken function"
outcome.success: true
outcome.result_summary: "Extracted 3 validation checks into separate private methods. Improved readability."
cost_tokens: 1847
parent_episode: <previous episode id>

---

timestamp: 2026-03-23T15:47:05Z
actor: system
action: "Test suite executed"
outcome.success: true
outcome.metrics: { passed: 142, failed: 0, coverage: 0.89 }
```

**Storage Technology:** Time-series database optimized for range queries.
- **Recommended:** ClickHouse, TimescaleDB, or QuestDB
- **Index Strategy:** (timestamp, actor, category), (context_tags, timestamp), (related_objects)
- **Retention:** All data retained, but older entries shift to cold storage after 90 days

**Query Interface:**

```
// Core episodic queries
GetEpisodesByTimeRange(start: ISO8601, end: ISO8601) -> EpisodeEntry[]
GetEpisodesByActor(actor: string, limit: int = 100) -> EpisodeEntry[]
GetEpisodesByTag(tag: string, limit: int = 50) -> EpisodeEntry[]
GetEpisodeSequence(parent_episode_id: string) -> EpisodeEntry[]
SearchEpisodes(query: string) -> EpisodeEntry[] // full-text on action + context_tags
GetRecentOutcomes(category: string, limit: int = 20) -> EpisodeEntry[]
```

**Performance Requirements:**
- Time-range queries: < 100ms for 1-year window
- Tag queries: < 50ms
- Full-text search: < 200ms
- Insertion rate: 1000+ episodes/second

---

### 1.2 Semantic Memory: The Knowledge Graph

**Purpose:** Persistent factual knowledge about the user, projects, code, and preferences. This is what enables *personalization* and *contextual understanding* without re-reading everything.

**Data Model (Property Graph):**

```
Node {
  id: string (globally unique)
  type: enum [
    person, project, file, codebase, concept,
    preference, technology, workflow_pattern, team, artifact
  ]
  name: string
  description: string (nullable)
  properties: Record<string, any> {
    // Type-specific properties stored here
    // Examples below
  }
  created_at: ISO8601
  updated_at: ISO8601
  confidence_score: float (0.0-1.0, inferred from episodic evidence)
  tags: string[]
  metadata: {
    source: string ("inferred" | "explicit" | "user_provided")
    last_accessed: ISO8601
    access_frequency: integer
  }
}

Edge {
  id: string
  source_id: string
  target_id: string
  relationship_type: enum [
    works_on, prefers, depends_on, related_to, contains,
    uses_technology, authored, collaborates_with, implements,
    references, requires, has_property, contradicts, evolved_from
  ]
  properties: Record<string, any> (context-specific)
  weight: float (0.0-1.0, confidence or frequency)
  created_at: ISO8601
  updated_at: ISO8601
  episodic_evidence: string[] (links to EpisodeEntry IDs that support this edge)
}
```

**Node Examples:**

```
// Person node (Abhinav)
{
  id: "person-abhinav",
  type: "person",
  name: "Abhinav",
  properties: {
    role: "graduate student",
    institution: "Northeastern University",
    research_focus: "GA-based game agents",
    expertise: ["genetic algorithms", "game design", "reinforcement learning"],
    communication_preference: "intuitive explanations",
    timezone: "EST",
    response_style_preference: "direct and technical",
    code_expertise_level: "advanced"
  },
  confidence_score: 0.95,
  metadata: { source: "explicit", access_frequency: 342 }
}

// Project node
{
  id: "project-game-agents",
  type: "project",
  name: "GA-Based Game Agents",
  properties: {
    status: "active",
    language: "Python",
    frameworks: ["pygame", "numpy"],
    team_size: 1,
    deadline: "2026-05-15",
    key_deliverables: ["algorithm paper", "working prototype", "benchmarks"]
  },
  confidence_score: 0.98,
  metadata: { source: "user_provided" }
}

// File node
{
  id: "file-auth-service",
  type: "file",
  name: "src/auth/auth_service.ts",
  properties: {
    language: "typescript",
    last_modified: "2026-03-23T15:47:05Z",
    lines_of_code: 287,
    test_coverage: 0.89,
    complexity_score: 0.72,
    has_technical_debt: true,
    refactoring_history: ["2026-03-23"]
  },
  confidence_score: 1.0,
  metadata: { source: "inferred", last_accessed: "2026-03-23T15:46:10Z" }
}

// Preference node
{
  id: "pref-paper-review",
  type: "preference",
  name: "Paper Review Workflow",
  properties: {
    review_order: ["methodology", "novelty", "writing_quality"],
    depth_preference: "thorough",
    timeline_preference: "detailed",
    feedback_style: "constructive"
  },
  confidence_score: 0.87,
  metadata: { source: "inferred", access_frequency: 12 }
}
```

**Edge Examples:**

```
// Abhinav works_on game-agents
{
  source_id: "person-abhinav",
  target_id: "project-game-agents",
  relationship_type: "works_on",
  weight: 1.0,
  episodic_evidence: ["ep-001", "ep-015", "ep-042"]
}

// game-agents depends_on numpy
{
  source_id: "project-game-agents",
  target_id: "tech-numpy",
  relationship_type: "depends_on",
  weight: 0.9,
  properties: { dependency_type: "core" }
}

// auth_service contains validateToken
{
  source_id: "file-auth-service",
  target_id: "function-validateToken",
  relationship_type: "contains",
  weight: 1.0
}

// Abhinav prefers intuitive_explanations
{
  source_id: "person-abhinav",
  target_id: "pref-intuitive-explanations",
  relationship_type: "prefers",
  weight: 0.95,
  episodic_evidence: ["ep-003", "ep-007", "ep-021"]
}
```

**Storage Technology:** Graph database with ACID guarantees.
- **Recommended:** Neo4j (with or without AuraDB), TigerGraph, or Apache JanusGraph
- **Index Strategy:** Index on (node.type, node.name), (node.id), (edge.relationship_type), (edge.source_id, edge.target_id)
- **Sharding:** By entity type for horizontal scaling

**Query Interface:**

```
// Node operations
GetNodeById(node_id: string) -> Node
GetNodesByType(type: NodeType) -> Node[]
SearchNodesByProperty(type: NodeType, property: string, value: any) -> Node[]
GetNodeNeighbors(node_id: string, relationship_types?: string[]) -> (Edge, Node)[]

// Edge operations
GetEdgesByType(relationship_type: string) -> Edge[]
GetEdgesBetween(source_id: string, target_id: string) -> Edge[]
GetIncomingEdges(node_id: string) -> Edge[]
GetOutgoingEdges(node_id: string) -> Edge[]

// Graph traversal (for recommendation/context building)
TraverseGraph(start_node_id: string, depth: int, max_results: int) -> (Node, Edge, distance)[]
FindShortestPath(source_id: string, target_id: string) -> Path
GetConnectedComponent(node_id: string) -> (Node, Edge)[]

// User model queries
GetUserModel(user_id: string) -> Node[] // all person node properties
GetProjectContext(project_id: string) -> (Node, Edge)[] // project + related nodes/edges
GetWorkflowPattern(workflow_id: string) -> Node

// Inference queries
GetRelatedNodes(node_id: string, limit: int = 20) -> Node[]
GetRecommendedContext(current_task: string) -> Node[]
```

**Performance Requirements:**
- Single node lookup: < 1ms
- Neighbor queries: < 50ms
- Depth-2 traversal: < 100ms
- Graph search: < 200ms
- Full graph write transaction: < 50ms
- Concurrent reads: 10,000+ ops/second

**Episodic ↔ Semantic Sync:**
- **Trigger:** When an EpisodeEntry is persisted, the OS evaluates whether it updates or creates semantic facts
- **Rules:** If an episode has `user_model_updates` or `semantic_refs`, trigger a graph sync
- **Conflict Resolution:** For contradictory information, increase the `updated_at` timestamp but preserve historical edges with lower `weight`

---

### 1.3 Procedural Memory: Learned Workflows

**Purpose:** Capture repeated, observable patterns in how the user works. When the same sequence recurs, the OS can pro-actively suggest or automate.

**Data Model:**

```
WorkflowPattern {
  id: string (UUID)
  name: string (human-readable, generated or user-assigned)
  pattern_type: enum [
    user_initiated, agent_initiated, collaborative_loop, task_decomposition
  ]
  trigger_condition: {
    // When should this pattern activate?
    episode_tags: string[] (OR logic)
    user_request_keywords: string[]
    semantic_prerequisites: {
      nodes: string[] (must exist in graph)
      edges: string[] (must exist in graph)
    }
  }
  steps: WorkflowStep[] {
    // Sequence of actions (user or agent)
    step_number: integer
    actor: enum [user, agent, system]
    action_template: string (with {variable} placeholders)
    expected_duration_ms: integer
    dependencies: integer[] (indices of prerequisite steps)
    success_criteria: {
      type: enum [semantic_check, outcome_check, user_confirmation]
      condition: string
    }
  }
  extracted_from: string[] (EpisodeEntry IDs that exemplify this pattern)
  frequency: integer (how many times observed)
  success_rate: float (0.0-1.0)
  last_observed: ISO8601
  user_feedback: enum [endorsed, neutral, rejected] (default: neutral)
  estimated_savings_hours: float
}

WorkflowStep {
  step_number: integer
  actor: "user" | "agent" | "system"
  action_template: string
  expected_duration_ms: integer
  dependencies: integer[]
  success_criteria: {
    type: "semantic_check" | "outcome_check" | "user_confirmation"
    condition: string
  }
}
```

**Examples:**

```
// Paper Review Workflow
{
  id: "workflow-paper-review",
  name: "Structured Paper Review (Abhinav's Style)",
  pattern_type: "user_initiated",
  trigger_condition: {
    episode_tags: ["paper", "review", "pdf"],
    user_request_keywords: ["review", "paper", "check methodology"]
  },
  steps: [
    {
      step_number: 1,
      actor: "user",
      action_template: "Provide paper or reference: {document}",
      expected_duration_ms: 30000,
      dependencies: [],
      success_criteria: {
        type: "semantic_check",
        condition: "document_is_accessible AND (pdf OR arxiv_link)"
      }
    },
    {
      step_number: 2,
      actor: "agent",
      action_template: "Analyze methodology section, identify research questions, note experimental design",
      expected_duration_ms: 15000,
      dependencies: [1],
      success_criteria: {
        type: "outcome_check",
        condition: "methodology_analysis_complete"
      }
    },
    {
      step_number: 3,
      actor: "agent",
      action_template: "Evaluate novelty against {user_field} literature",
      expected_duration_ms: 12000,
      dependencies: [2],
      success_criteria: {
        type: "outcome_check",
        condition: "novelty_assessment_complete"
      }
    },
    {
      step_number: 4,
      actor: "agent",
      action_template: "Review writing clarity and structure",
      expected_duration_ms: 10000,
      dependencies: [3],
      success_criteria: {
        type: "outcome_check",
        condition: "writing_review_complete"
      }
    },
    {
      step_number: 5,
      actor: "user",
      action_template: "Provide feedback on analysis",
      expected_duration_ms: 60000,
      dependencies: [4],
      success_criteria: {
        type: "user_confirmation",
        condition: "user_approved_analysis"
      }
    }
  ],
  extracted_from: ["ep-103", "ep-147", "ep-189"],
  frequency: 3,
  success_rate: 1.0,
  user_feedback: "endorsed",
  estimated_savings_hours: 0.5
}

// Code Refactoring + Test Workflow
{
  id: "workflow-refactor-and-test",
  name: "Refactor → Test → Approve",
  pattern_type: "collaborative_loop",
  trigger_condition: {
    episode_tags: ["refactor", "code", "typescript"],
    user_request_keywords: ["refactor", "improve", "clean up"]
  },
  steps: [
    {
      step_number: 1,
      actor: "user",
      action_template: "Specify file and refactoring goal: {file} - {goal}",
      expected_duration_ms: 20000,
      dependencies: [],
      success_criteria: {
        type: "semantic_check",
        condition: "file_exists AND (goal_is_clear OR goal_referenced_in_graph)"
      }
    },
    {
      step_number: 2,
      actor: "agent",
      action_template: "Apply refactoring pattern to {file}",
      expected_duration_ms: 5000,
      dependencies: [1],
      success_criteria: {
        type: "outcome_check",
        condition: "refactoring_applied_without_errors"
      }
    },
    {
      step_number: 3,
      actor: "system",
      action_template: "Run test suite for {project}",
      expected_duration_ms: 30000,
      dependencies: [2],
      success_criteria: {
        type: "outcome_check",
        condition: "all_tests_passed"
      }
    },
    {
      step_number: 4,
      actor: "user",
      action_template: "Review changes and approve or request modifications",
      expected_duration_ms: 45000,
      dependencies: [3],
      success_criteria: {
        type: "user_confirmation",
        condition: "user_approved OR user_requested_changes"
      }
    }
  ],
  extracted_from: ["ep-045", "ep-089", "ep-145"],
  frequency: 5,
  success_rate: 0.8,
  user_feedback: "endorsed",
  estimated_savings_hours: 1.2
}
```

**Storage Technology:** Document database with full-text search and temporal indexing.
- **Recommended:** MongoDB, Firestore, or PostgreSQL with JSONB
- **Index Strategy:** (trigger_condition.episode_tags), (pattern_type), (frequency, success_rate), (last_observed)

**Query Interface:**

```
GetWorkflowById(workflow_id: string) -> WorkflowPattern
GetWorkflowsByTrigger(tags: string[]) -> WorkflowPattern[]
GetWorkflowsByActor(actor: string) -> WorkflowPattern[]
GetHighValueWorkflows(min_frequency: int, min_success_rate: float) -> WorkflowPattern[]
GetRecentlyUsedWorkflows(limit: int = 10) -> WorkflowPattern[]
SearchWorkflowsByName(name_query: string) -> WorkflowPattern[]
GetWorkflowsMatchingContext(episode_tags: string[]) -> WorkflowPattern[]

// Inference
GetApplicableWorkflows(current_episode: EpisodeEntry, limit: int = 5) -> WorkflowPattern[]
PredictNextStep(workflow_id: string, completed_steps: int) -> WorkflowStep
EstimateWorkflowDuration(workflow_id: string) -> integer
```

**Performance Requirements:**
- Lookup by ID: < 5ms
- Trigger-based search: < 50ms
- Applicable workflows inference: < 100ms
- Write/update: < 10ms

**Building Procedural Memory:**
- **Extraction Trigger:** System detects when the same episode-tag sequence appears 2+ times
- **Pattern Proposal:** OS generates candidate WorkflowPattern and stores with `user_feedback: neutral`
- **Refinement:** User feedback (via explicit endorsement or repeated use) increases confidence
- **Decay:** If unused for 60 days, `success_rate` weight decreases; if used again, it rebounds
- **Automation:** When `user_feedback == "endorsed"`, the OS can proactively suggest step automation

---

### 1.4 Working Memory: The Active Context Layer

**PURPOSE (CRITICAL):** The context window is finite and expensive. Working memory is the OS's responsibility to intelligently populate with *only what's relevant right now*. This is the performance lever that transforms an LLM from stateless to adaptive.

**Data Model:**

```
WorkingMemoryContext {
  id: string (UUID, tied to execution session)
  created_at: ISO8601
  expires_at: ISO8601 (default: current_time + 30 minutes)
  task_id: string (which task is this context for?)
  budget_tokens: integer (context window allocation for this task)
  budget_remaining: integer (tokens left to allocate)

  // The actual working memory contents
  contents: {
    // 1. Task Context (5-10% of budget)
    task_description: string (goal and constraints)
    task_metadata: {
      type: enum [user_request, agent_planning, system_maintenance, debugging]
      priority: enum [critical, high, medium, low]
      related_episodic_ids: string[] (2-3 most recent relevant episodes)
      estimated_complexity: integer (1-10 scale)
    }

    // 2. Active Workspace State (15-25% of budget)
    workspace: {
      current_project: {
        project_id: string
        name: string
        files_open: {file_path: string, snippet: string}[] (1-3 most relevant)
        recent_changes: string[] (2-3 most recent edit summaries)
      }
      active_chat_context: string (last 5-10 exchanges if relevant)
      live_errors: {file: string, error: string}[] (if debugging)
      recent_outcomes: {timestamp: ISO8601, result: string}[] (last 3)
    }

    // 3. Capability Manifest (5-10% of budget)
    available_agents: {
      agent_id: string
      capabilities: string[]
      context_cost_tokens: integer (how expensive is this agent to load?)
    }[]
    available_tools: {
      tool_id: string
      tool_name: string
      inputs: string
      outputs: string
      estimated_time_ms: integer
    }[]

    // 4. User Model Highlights (10-15% of budget)
    user_model_summary: {
      name: string
      primary_expertise: string[]
      communication_preference: string
      recent_feedback: string (last substantive user comment)
      relevant_preferences: {preference_id: string, preference_text: string}[]
    }

    // 5. Semantic Context (20-35% of budget)
    relevant_semantic_facts: {
      node_id: string
      node_name: string
      node_type: string
      key_properties: Record<string, any> (only most relevant properties)
      related_edges: {relationship_type: string, target_name: string}[]
    }[]

    // 6. Procedural Context (5-10% of budget)
    applicable_workflows: {
      workflow_id: string
      workflow_name: string
      trigger_match_confidence: float
      steps_summary: string (condensed description of first 2-3 steps)
      estimated_time_savings_minutes: integer
    }[]

    // 7. Scratchpad / Intermediate State (flexible)
    scratchpad: {
      notes: string (working notes, decisions, reasoning)
      variables: Record<string, any> (computed values during task execution)
      decision_points: {timestamp: ISO8601, decision: string, alternatives_considered: string[]}[]
    }
  }

  loading_strategy: enum [
    lazy_load_on_demand,  // Load incrementally as task evolves
    eager_load,           // Load everything upfront
    predictive_load       // OS predicts what will be needed
  ]

  eviction_policy: enum [
    fifo,                 // First in, first out
    lru,                  // Least recently used
    priority_based        // By task priority and relevance
  ]

  access_log: {
    timestamp: ISO8601
    accessed_section: string (e.g., "semantic_facts", "task_description")
    cost_tokens: integer
  }[]
}
```

**Loading Strategy Decision Tree:**

```
IF task_is_complex AND episodic_evidence_suggests_patterns:
  USE eager_load (load all predicted-relevant context upfront)
ELIF task_is_simple_and_focused:
  USE lazy_load_on_demand (load only as needed)
ELIF user_has_established_workflow_pattern:
  USE predictive_load (pre-load based on workflow pattern)
ELSE:
  USE lazy_load_on_demand (safe default)
```

**Storage Technology:** In-memory, ephemeral.
- **Recommended:** Redis (fast, expiring keys), memcached, or simple in-process cache
- **Backup:** Serialize to persistent store on task completion for audit/replay

**Query Interface:**

```
// Initialization
CreateWorkingMemory(task_id: string, budget_tokens: int) -> WorkingMemoryContext
LoadWorkingMemoryFor(task_id: string) -> WorkingMemoryContext

// Read operations (must be < 1ms)
GetTaskContext() -> string
GetActiveWorkspaceState() -> string
GetCapabilityManifest() -> string
GetUserModelHighlights() -> string
GetSemanticContext() -> (Node, relationships)[]
GetProcedularContext() -> WorkflowPattern[]
GetScratchpad() -> string
GetRemainingBudget() -> integer

// Write operations (updates during task execution)
UpdateScratchpad(new_notes: string, variables?: Record<string, any>)
RecordDecisionPoint(decision: string, alternatives: string[])
AddToSemanticContext(node_id: string) // evicts lowest-priority existing content
AddToWorkspaceContext(workspace_updates: {})
EvictOldestContent(tokens_needed: integer)

// Lifecycle
ArchiveWorkingMemory(memory_context: WorkingMemoryContext, task_outcome: string)
ExpireWorkingMemory(memory_id: string) // soft delete after 30 min idle
```

**Performance Requirements (CRITICAL):**
- All read operations: < 1ms (p99)
- Write operations: < 5ms (p99)
- Budget calculations: < 2ms
- Eviction/loading: < 50ms

**Budget Allocation Algorithm:**

```
FUNCTION AllocateContextBudget(task: Task, total_window: int) -> int:
  // Typically 70-80% of context window available after system reservation
  available_budget = total_window * 0.75

  IF task.priority == critical:
    return available_budget * 0.9
  ELIF task.priority == high:
    return available_budget * 0.7
  ELIF task.priority == medium:
    return available_budget * 0.5
  ELSE:
    return available_budget * 0.3

FUNCTION AllocateWithinWorkingMemory(budget: int, task_context: Task):
  allocations = {}

  // Base allocations (non-negotiable)
  allocations["task_description"] = budget * 0.08
  allocations["capability_manifest"] = budget * 0.07

  // Adaptive allocations based on task type
  IF task_context.type == "code_editing":
    allocations["workspace_state"] = budget * 0.25
    allocations["semantic_facts"] = budget * 0.30
    allocations["scratchpad"] = budget * 0.20
  ELIF task_context.type == "planning":
    allocations["user_model"] = budget * 0.15
    allocations["procedural_context"] = budget * 0.25
    allocations["semantic_facts"] = budget * 0.25
    allocations["scratchpad"] = budget * 0.20
  ELIF task_context.type == "debugging":
    allocations["workspace_state"] = budget * 0.30
    allocations["semantic_facts"] = budget * 0.20
    allocations["scratchpad"] = budget * 0.25

  return allocations
```

---

## Part 2: Cross-Layer Data Flow

### 2.1 Episodic → Semantic Propagation

**Trigger:** When an EpisodeEntry is written to persistent storage.

**Process:**

```
ON EpisodeEntry.save():

  // Step 1: Extract semantic implications
  semantic_updates = ExtractSemanticFacts(episode)

  // Step 2: For each extracted fact, update or create semantic node/edge
  FOR semantic_fact IN semantic_updates:
    existing_node = GetNodeById(semantic_fact.node_id)

    IF existing_node EXISTS:
      // Update properties and weight
      existing_node.properties.update(semantic_fact.properties)
      existing_node.updated_at = NOW()
      existing_node.confidence_score = UpdateConfidence(
        current: existing_node.confidence_score,
        new_evidence: semantic_fact.confidence
      )
      existing_node.metadata.last_accessed = NOW()
    ELSE:
      // Create new node
      new_node = CreateNode(semantic_fact)
      new_node.metadata.source = "inferred"
      new_node.confidence_score = semantic_fact.confidence

    // Link episodic entry as evidence
    IF semantic_fact.relationship_type:
      edge = GetOrCreateEdge(semantic_fact.source_id, semantic_fact.target_id)
      edge.episodic_evidence.append(episode.id)
      edge.updated_at = NOW()
```

**Confidence Scoring:**

```
FUNCTION UpdateConfidence(current: float, new_evidence: float) -> float:
  // Bayesian-style update
  // More evidence increases confidence, contradictions lower it

  weight_current = 0.7  // Prior evidence is weighted
  weight_new = 0.3      // New evidence is weighted

  return (weight_current * current) + (weight_new * new_evidence)
```

**Example:**

```
EpisodeEntry:
  user requested: "Refactor the auth module because it's hard to test"

Extracted semantic facts:
  1. Node: "file-auth-service"
     Property: "has_technical_debt: true"
     Confidence: 0.9

  2. Node: "file-auth-service"
     Property: "test_difficulty: high"
     Confidence: 0.8

  3. Edge: "file-auth-service" --(depends_on_improvement)--> "project-x"
     Confidence: 0.7

Result:
  file-auth-service node updated:
    - has_technical_debt: true (confidence 0.9)
    - test_difficulty increased
    - updated_at refreshed
    - episodic_evidence appended with episode.id
```

---

### 2.2 Episodic → Procedural Pattern Extraction

**Trigger:** System monitors episodic sequences for recurring patterns.

**Detection Algorithm:**

```
FUNCTION DetectPatterns():
  // Run every 100 episodes or hourly

  recent_episodes = GetEpisodesByTimeRange(NOW() - 30_days, NOW())

  FOR each 3+ sequential episodes:
    IF TagSequence(episodes).frequency > 1:
      // This sequence has occurred multiple times

      pattern_candidate = ExtractPatternFromSequence(episodes)

      existing_pattern = FindSimilarPattern(pattern_candidate)

      IF existing_pattern:
        // Increment frequency, update success_rate
        existing_pattern.frequency += 1
        existing_pattern.extracted_from.append(episodes[0].id)
        IF AllStepsSucceeded(episodes):
          existing_pattern.success_rate = UpdateSuccessRate(...)
      ELSE:
        // Create new pattern
        CreateWorkflowPattern(pattern_candidate)
        pattern_candidate.user_feedback = "neutral"
        pattern_candidate.frequency = 2
```

---

### 2.3 Semantic → Working Memory Population

**Trigger:** At task initialization or when task context changes.

**Process:**

```
FUNCTION PopulateWorkingMemory(task: Task, current_memory: WorkingMemoryContext):

  budget_available = current_memory.budget_remaining

  // 1. Load task description (mandatory)
  task_section = FormatTaskDescription(task)
  budget_available -= TokenCount(task_section)
  current_memory.contents.task_description = task_section

  // 2. Load workspace state if relevant to task type
  IF task.involves_editing OR task.involves_debugging:
    workspace_data = GetActiveWorkspace()
    current_memory.contents.workspace = workspace_data
    budget_available -= TokenCount(workspace_data)

  // 3. Load applicable semantic facts (targeted query)
  semantic_query_results = QuerySemanticMemory(
    task_keywords: task.description,
    depth: 2,
    max_results: 20
  )

  FOR fact IN semantic_query_results (ranked by relevance):
    fact_text = FormatSemanticFact(fact)
    fact_tokens = TokenCount(fact_text)

    IF fact_tokens < budget_available:
      current_memory.contents.relevant_semantic_facts.append(fact)
      budget_available -= fact_tokens
    ELSE:
      BREAK

  // 4. Load applicable workflows
  applicable_workflows = GetApplicableWorkflows(task, limit: 5)
  FOR workflow IN applicable_workflows:
    workflow_text = FormatWorkflowSummary(workflow)
    workflow_tokens = TokenCount(workflow_text)

    IF workflow_tokens < budget_available:
      current_memory.contents.applicable_workflows.append(workflow)
      budget_available -= workflow_tokens

  // 5. Load user model highlights (if personalizable task)
  IF task.requires_personalization:
    user_highlights = GetUserModelHighlights()
    current_memory.contents.user_model_summary = user_highlights
    budget_available -= TokenCount(user_highlights)

  // 6. Reserve scratchpad space
  current_memory.contents.scratchpad = {notes: "", variables: {}, decision_points: []}

  current_memory.budget_remaining = budget_available
```

**Relevance Ranking for Semantic Facts:**

```
FUNCTION RankSemanticFactForTask(fact: Node, task: Task) -> float:

  // Multi-factor relevance score (0.0 to 1.0)

  text_match_score = SemanticSimilarity(task.description, fact.description)

  project_match_score = IF fact.node_type == project:
                          CheckIfProjectMatchesTask(fact, task) ? 0.9 : 0.1
                        ELSE:
                          0.5

  recency_bonus = IF fact.metadata.last_accessed < 1_day_ago:
                    0.2
                  ELSE:
                    0.0

  frequency_score = Log(fact.metadata.access_frequency) / Log(max_frequency)

  confidence_weight = fact.confidence_score

  return (text_match_score * 0.4 +
          project_match_score * 0.25 +
          frequency_score * 0.2 +
          recency_bonus) *
         confidence_weight
```

---

### 2.4 Working Memory → Episodic on Task Completion

**Trigger:** Task reaches completion or is archived.

**Process:**

```
ON TaskCompletion(task: Task, working_memory: WorkingMemoryContext):

  // Create a summary episodic entry
  episode = EpisodeEntry.create(
    actor: "system",
    action: "Task completed: " + task.description,
    category: "system_event",
    outcome: {
      success: task.succeeded,
      result_summary: working_memory.contents.scratchpad.notes,
      metrics: {
        tokens_used: original_budget - working_memory.budget_remaining,
        duration_ms: NOW() - working_memory.created_at,
        decisions_made: len(working_memory.contents.scratchpad.decision_points)
      }
    }
  )

  // Preserve decision points as semantic memory
  FOR decision IN working_memory.contents.scratchpad.decision_points:
    CreateOrUpdateSemanticNode(
      type: "decision",
      properties: {decision: decision.decision, considered: decision.alternatives}
    )

  episode.save()
```

---

## Part 3: Storage Technology Recommendations

### 3.1 Complete Tech Stack

| Layer | Storage Type | Recommended | Rationale |
|-------|--------------|-------------|-----------|
| **Episodic** | Time-Series DB | ClickHouse or TimescaleDB | Optimized for range queries, cheap storage at scale, strong indexing |
| **Semantic** | Graph DB | Neo4j (Aura) or TigerGraph | Native graph operations, ACID, pattern matching, traversal performance |
| **Procedural** | Document DB | MongoDB or PostgreSQL (JSONB) | Flexible schema, full-text search on steps, easy to version patterns |
| **Working Memory** | In-Memory Cache | Redis or memcached | Sub-millisecond reads, natural expiration, serialization on task end |

### 3.2 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LLM Agent Process                       │
│  (Claude + Working Memory in context window)                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Working Memory (in-process, ~ 50-100KB)              │ │
│  │  - Task context                                        │ │
│  │  - Workspace state                                     │ │
│  │  - Semantic facts subset                               │ │
│  │  - Scratchpad                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ↓                                   │
│                   Memory Manager API                        │
│                                                              │
└─────────────┬───────────────────────────────────────────────┘
              │
              │ (Redis connection, < 1ms latency)
              │
    ┌─────────┴─────────────────────────────┐
    │                                       │
┌───┴──────────────────────┐    ┌──────────┴──────────────┐
│  Redis (Working Memory)   │    │  Graph DB (Semantic)   │
│  - Ephemeral (30 min TTL) │    │  - Persistent          │
│  - Fast serialization     │    │  - ~1-100MB per user   │
│  - Multi-document txns    │    │  - Neo4j instance      │
└──────────────────────────┘    └────────────────────────┘
                                          │
                ┌─────────────────────────┼──────────────────┐
                │                         │                  │
    ┌───────────┴────────────┐ ┌─────────┴──────────┐ ┌──────┴──────────┐
    │ TimescaleDB            │ │   PostgreSQL       │ │  MongoDB        │
    │ (Episodic)             │ │ (Semantic backup)  │ │ (Procedural)    │
    │ - Millions of episodes │ │ - Replica          │ │ - Patterns      │
    │ - Cold storage after   │ │                    │ │ - Versioning    │
    │   90 days              │ │                    │ │                 │
    └───────────────────────┘ └────────────────────┘ └─────────────────┘
```

### 3.3 Replication and High Availability

- **Semantic (Graph DB):** Active-passive replication, failover in < 5 seconds
- **Episodic (TimescaleDB):** Streaming replication to warm standby
- **Procedural (MongoDB):** Replica set with automatic failover
- **Working Memory (Redis):** Replication optional; ephemeral data, loss tolerable

---

## Part 4: Retention and Eviction Policies

### 4.1 Episodic Retention

```
Policy:
  - Hot storage (immediate access): All episodes from last 30 days
  - Warm storage (slower access): Episodes 30-90 days old
  - Cold storage (archive): Episodes older than 90 days
  - Archival: Never delete, but compress and move to long-term storage

Purge triggers:
  - User requests explicit deletion (rare)
  - Compliance requirement (e.g., GDPR data minimization) — handled via anonymization, not deletion
  - Storage quota exceeded — escalate to user before deleting
```

### 4.2 Semantic Retention

```
Policy:
  - All nodes and edges retained indefinitely
  - Version historical changes via updated_at timestamp
  - For contradictory information: keep lower-confidence edge, update weight
  - Deprecated nodes: mark with deprecated: true, but retain for audit

Cleanup:
  - Orphaned nodes (no edges, not accessed for 1 year): archive
  - Stale edges (last_accessed > 1 year AND weight < 0.3): mark inactive
```

### 4.3 Procedural Retention

```
Policy:
  - High-value patterns (frequency >= 5 OR success_rate >= 0.8): retain indefinitely
  - Medium-value patterns (frequency 2-4, success_rate 0.6-0.8): retain 180 days
  - Low-value patterns (frequency 1, success_rate < 0.6, user_feedback == rejected): retain 30 days

Decay function:
  FUNCTION PatternWeight(pattern) -> float:
    if pattern.last_observed > 180_days_ago:
      pattern.success_rate *= 0.5  // confidence halves if unused for 180 days
    if pattern.last_observed > 365_days_ago:
      pattern.success_rate *= 0.1  // very stale
    return pattern.frequency * pattern.success_rate
```

### 4.4 Working Memory Eviction

```
Policy:
  - Eviction on task completion or 30-minute inactivity
  - If forced eviction (budget exceeded), use priority order:
    1. Scratchpad notes (lowest priority, less structured)
    2. Procedural context (can be reloaded quickly)
    3. Semantic facts (lowest priority, largest space)
    4. Workspace state (medium priority)
    5. Task context (highest priority, never evict first)

FUNCTION EvictContent(budget_needed: int, memory: WorkingMemoryContext):
  sections = [
    ("scratchpad", memory.contents.scratchpad),
    ("procedural", memory.contents.applicable_workflows),
    ("semantic", memory.contents.relevant_semantic_facts),
    ("workspace", memory.contents.workspace)
  ]

  for section_name, section_data in sections:
    if section_data is not empty:
      freed = TokenCount(section_data)
      section_data = remove_lowest_priority_items(section_data, budget_needed)
      memory.budget_remaining += freed - TokenCount(section_data)

      if memory.budget_remaining >= budget_needed:
        return
```

---

## Part 5: Query Patterns and Performance

### 5.1 Common Query Patterns

**Pattern 1: Get Working Memory for a New Task**
```
Query:
  1. GetTaskDescription(task_id)  [5ms]
  2. GetActiveWorkspace()         [10ms]
  3. QuerySemanticMemory(keywords, depth: 2)  [150ms]
  4. GetApplicableWorkflows(task) [50ms]
  5. GetUserModel()               [20ms]
  Total: ~235ms (acceptable for task initialization)
```

**Pattern 2: Update Semantic Memory After Episode**
```
Query:
  1. ExtractSemanticFacts(episode)  [100ms]
  2. FOR each fact:
     - GetNodeById(id)              [1ms]
     - UpdateNodeProperties()       [5ms]
     - CreateOrUpdateEdge()         [5ms]
  Total: ~150-200ms per episode (batched)
```

**Pattern 3: Find Applicable Workflow**
```
Query:
  1. GetWorkflowsByTrigger(episode.tags)  [50ms]
  2. RankByRelevance(workflows, task)     [10ms]
  3. Return top 3-5                       [0ms]
  Total: ~60ms
```

### 5.2 Performance Targets

| Operation | Target | Constraint |
|-----------|--------|-----------|
| Working Memory read | < 1ms | Sub-contextual latency |
| Working Memory write | < 5ms | Non-blocking to agent |
| Semantic node lookup | < 1ms | Part of working memory load |
| Graph traversal (depth 2) | < 100ms | Acceptable for initialization |
| Episodic time-range query | < 100ms | Log analysis, debugging |
| Pattern matching/application | < 100ms | Should happen while agent works |

---

## Part 6: Cross-Layer Consistency

### 6.1 Consistency Guarantees

```
Level: Eventual consistency across layers

Synchronization:
  - Episodic → Semantic: Synchronous within 100ms of episode write
  - Episodic → Procedural: Asynchronous, batch every 100 episodes or 1 hour
  - Semantic → Working Memory: Lazy load, pulls fresh state on demand
  - Working Memory → Episodic: Synchronous on task completion

Conflict resolution:
  - If semantic fact contradicts newer evidence: update weight, preserve history
  - If procedure pattern fails: decrease success_rate, but retain the pattern
  - If working memory becomes inconsistent: reload from source

Transaction model:
  - Episodic: Full ACID
  - Semantic: ACID on individual nodes/edges, eventual consistency across graph
  - Procedural: Last-write-wins for workflow edits
  - Working Memory: No consistency requirement (ephemeral)
```

### 6.2 Audit Trail

Every significant operation should be logged:

```
AuditLog {
  timestamp: ISO8601
  operation_type: enum [create, update, delete, query, evict]
  affected_layer: enum [episodic, semantic, procedural, working_memory]
  affected_entity_id: string
  initiator: enum [user, agent, system]
  change_summary: string
  cost_tokens: integer (for computational cost)
}
```

---

## Part 7: Implementation Roadmap

### Phase 1: Episodic + Working Memory (MVP)
- Minimal TimescaleDB for episodes
- In-process working memory
- Basic task context loading
- Estimated effort: 2-3 weeks

### Phase 2: Semantic Memory
- Deploy Neo4j instance
- Build episodic → semantic sync
- User model creation
- Estimated effort: 3-4 weeks

### Phase 3: Procedural Memory + Intelligence
- MongoDB patterns storage
- Pattern detection algorithm
- Workflow suggestion + automation
- Estimated effort: 2-3 weeks

### Phase 4: Advanced Features
- Cross-layer optimization (smarter budget allocation)
- Predictive loading for common workflows
- Decay and retention policies fully implemented
- Estimated effort: 2 weeks

---

## Part 8: Configuration & Tuning

### 8.1 Configurable Parameters

```yaml
memory:
  episodic:
    retention_days: 90
    cold_storage_after_days: 30
    batch_write_size: 100
    index_refresh_ms: 1000

  semantic:
    max_nodes_per_user: 5000
    max_confidence_threshold: 0.95
    orphan_cleanup_days: 365
    edge_weight_decay_factor: 0.95

  procedural:
    pattern_frequency_threshold: 2
    success_rate_decay_factor: 0.5
    decay_period_days: 180
    pattern_retention_days: 30

  working_memory:
    default_budget_tokens: 8000
    task_timeout_minutes: 30
    semantic_query_depth: 2
    max_semantic_facts_loaded: 20
    loading_strategy: "predictive_load"

    budget_allocations:
      task_description: 0.08
      capability_manifest: 0.07
      user_model: 0.12
      workspace_state: 0.20
      semantic_facts: 0.30
      procedural_context: 0.08
      scratchpad: 0.15
```

### 8.2 Monitoring & Observability

```
Metrics to track:
  - Episodic: Write latency, query latency, storage size
  - Semantic: Graph traversal time, node/edge creation rate, query latency
  - Procedural: Pattern detection rate, workflow application rate, accuracy
  - Working Memory: Budget utilization %, eviction frequency, cache hit rate

Alerts:
  - Working memory read > 5ms
  - Semantic query > 500ms
  - Episodic write latency > 200ms
  - Budget exceeded (eviction threshold)
```

---

## Conclusion

This four-layer architecture is the difference between an LLM that forgets context and one that operates with human-like continuity. The critical insight is that **working memory management is not the LLM's job—it is the OS's job**. By aggressively curating what enters the context window, the OS transforms finite context into effective infinite context over time.

The system trades off implementation complexity for transformative user experience: the LLM receives exactly the information it needs, when it needs it, eliminating wasted context and enabling genuinely long-horizon tasks.

---

**Document Status:** Ready for Implementation
**Next Document:** Document 9 - Agent Architecture and Capabilities
