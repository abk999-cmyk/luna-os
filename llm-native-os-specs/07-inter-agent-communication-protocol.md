# 07: Inter-Agent Communication Protocol

## Overview

Multi-agent systems fail when communication breaks down. This specification defines how agents coordinate at scale—within workspaces, across workspaces, and up/down the organizational hierarchy. Communication is the substrate on which all emergent behavior depends.

The protocol enables:
- **Local coordination**: Leaf agents within a workspace via shared scratchpad
- **Hierarchical escalation**: Leaf → Orchestrator → Conductor
- **Cross-workspace awareness**: Conductor-mediated semantic connections
- **Ambient state**: Persistent context always available to agents
- **Guaranteed ordering**: Critical for reproducibility and debugging

## 1. Message Format Specification

### 1.1 Base Message Structure

All inter-agent messages use this JSON schema:

```json
{
  "message_id": "string (UUID v4, auto-generated)",
  "timestamp": "ISO 8601 UTC datetime",
  "source": {
    "agent_type": "enum (leaf | orchestrator | conductor | terminal | search | code | browser)",
    "workspace_id": "string (null for conductor-level messages)",
    "agent_instance_id": "string (unique per agent per session)"
  },
  "destination": {
    "agent_type": "enum or array of enums",
    "workspace_id": "string or 'broadcast' or 'cross_workspace'",
    "agent_instance_id": "string (optional, specific routing)"
  },
  "message_type": "enum (state_update | query | escalation | delegation | notification | broadcast | ack | error)",
  "priority": "enum (critical | high | normal | low)",
  "payload": "object (type-specific)",
  "correlation_id": "string (UUID, for request-response pairs)",
  "idempotency_key": "string (UUID, for deduplication)",
  "ttl_seconds": "integer (default 3600, max 86400)",
  "requires_ack": "boolean (default false for broadcasts, true for critical)"
}
```

### 1.2 Message Type Payloads

#### State Update
Leaf agents publish findings, progress, or observations to the scratchpad.

```json
{
  "message_type": "state_update",
  "payload": {
    "category": "enum (finding | progress | context | blockers | preference | graph_node)",
    "data": {
      "content": "string (human-readable statement or structured data)",
      "source_evidence": "string (file path, line number, API endpoint, etc.)",
      "confidence": "float (0.0-1.0, for findings)",
      "tags": ["array", "of", "strings"]
    },
    "retention_policy": "enum (session | workspace_lifetime | permanent)",
    "visibility": "enum (workspace | conductor_aware | all_workspaces)"
  }
}
```

Example:
```json
{
  "message_type": "state_update",
  "payload": {
    "category": "finding",
    "data": {
      "content": "The user prefers dark mode. Mentioned in portfolio-workspace session #3.",
      "source_evidence": "portfolio-workspace/session-3/notes.txt:line 47",
      "confidence": 0.95,
      "tags": ["user_preference", "ui_design"]
    },
    "retention_policy": "workspace_lifetime",
    "visibility": "all_workspaces"
  }
}
```

#### Query
Agent requests information from other agents or the scratchpad.

```json
{
  "message_type": "query",
  "payload": {
    "query_type": "enum (scratchpad_lookup | capability_check | state_history | cross_workspace_semantic)",
    "search_criteria": {
      "tags": ["array", "of", "tags"],
      "timeframe": "string or null (e.g., '1_hour', '1_week', '1_month')",
      "category": "string (optional, for scratchpad lookups)",
      "workspace_scope": "enum (local | all_workspaces)"
    },
    "expected_response_format": "string (json | markdown | plaintext)"
  }
}
```

#### Escalation
Leaf agent escalates when it cannot resolve a task alone.

```json
{
  "message_type": "escalation",
  "payload": {
    "escalation_reason": "enum (capability_gap | deadlock | insufficient_context | conflict | timeout)",
    "reason_detail": "string (human-readable explanation)",
    "current_context": {
      "task": "string",
      "progress": "string",
      "attempted_solutions": ["array", "of", "strategies"],
      "blocking_issue": "string"
    },
    "requested_assistance": {
      "agent_types": ["array", "of", "agent_types"],
      "specific_capability": "string (optional)"
    },
    "escalation_path": "string (to_orchestrator | to_conductor)",
    "severity": "enum (critical | high | normal | low)"
  }
}
```

#### Delegation
Orchestrator or Conductor assigns work to other agents.

```json
{
  "message_type": "delegation",
  "payload": {
    "task_id": "string (UUID)",
    "task_description": "string",
    "assigned_to": {
      "agent_type": "string",
      "workspace_id": "string",
      "agent_instance_id": "string (optional, for specific agent)"
    },
    "task_context": {
      "background": "string",
      "dependencies": ["array", "of", "task_ids"],
      "deadline": "ISO 8601 or null",
      "priority": "enum (critical | high | normal | low)"
    },
    "success_criteria": {
      "deliverable_format": "string",
      "acceptance_tests": ["array", "of", "strings"],
      "required_metadata": ["array", "of", "field_names"]
    },
    "resource_constraints": {
      "max_tokens": "integer or null",
      "max_time_seconds": "integer or null",
      "external_services_allowed": ["array"]
    }
  }
}
```

#### Notification
Non-blocking updates (e.g., task completion, status changes).

```json
{
  "message_type": "notification",
  "payload": {
    "notification_type": "enum (task_complete | status_change | warning | info)",
    "subject": "string",
    "body": "string",
    "metadata": {
      "related_task_id": "string (optional)",
      "related_message_ids": ["array", "of", "message_ids"],
      "action_required": "boolean"
    }
  }
}
```

#### Broadcast
For ambient state updates that all agents should be aware of.

```json
{
  "message_type": "broadcast",
  "payload": {
    "broadcast_type": "enum (state_change | capability_update | context_refresh | clock_tick)",
    "content": "object (type-specific)",
    "applies_to": {
      "workspace_ids": ["array", "or", "*"],
      "agent_types": ["array", "or", "*"],
      "priority_threshold": "enum (or null, for all priority levels)"
    }
  }
}
```

#### Acknowledgment
Confirms receipt and processing of a message.

```json
{
  "message_type": "ack",
  "payload": {
    "ack_for_message_id": "string",
    "status": "enum (received | processing | processed | failed)",
    "processing_result": "object or null",
    "error_detail": "string or null"
  }
}
```

#### Error
Reports a communication or processing failure.

```json
{
  "message_type": "error",
  "payload": {
    "error_for_message_id": "string",
    "error_type": "enum (message_format | routing | timeout | processing | capacity)",
    "error_code": "string (e.g., 'INVALID_DESTINATION', 'AGENT_TIMEOUT')",
    "error_message": "string",
    "recoverable": "boolean",
    "suggested_action": "string or null"
  }
}
```

## 2. Communication Channels and Routing

### 2.1 Within-Workspace Communication (Scratchpad/Blackboard)

**Channel**: Shared persistent memory indexed by workspace_id.

**Participants**: All leaf agents within a workspace.

**Semantics**:
- All state updates with `visibility: "workspace"` are written to scratchpad
- Scratchpad is append-only with soft overwrites (old entries archived)
- Agents query scratchpad by tags, category, timeframe
- No guaranteed ordering within the blackboard—agents must handle concurrent updates
- Scratchpad entries are immutable once written; corrections require new entries

**Latency requirement**: < 100 ms

**Example query pattern**:
```
Query: "Find all findings from the 'code_analysis' agent in the last 2 hours, tagged 'bug' or 'performance'"
Scratchpad returns: Ordered array of matching entries with creation timestamps
```

### 2.2 Workspace Orchestrator Communication

**Channel**: Orchestrator is the hub within its workspace.

**Participants**: Orchestrator, leaf agents, workspace-level terminal agent.

**Semantics**:
- Leaf agents can escalate to orchestrator
- Orchestrator can delegate tasks to other agents
- Orchestrator polls scratchpad periodically and broadcasts contextual updates
- Orchestrator maintains a task queue (delegation tracking)
- Request-response pairs use `correlation_id` for matching

**Latency requirement**: < 200 ms for delegation, < 500 ms for escalation response

**Escalation protocol**:
1. Leaf agent sends `escalation` message with `requires_ack: true`
2. Orchestrator acknowledges receipt immediately
3. Orchestrator analyzes context, may pull in additional agents
4. Orchestrator sends delegation messages to helper agents
5. Once resolved, orchestrator sends completion notification to original escalating agent

### 2.3 Conductor Communication

**Channel**: Global, multi-workspace awareness.

**Participants**: Conductor, workspace orchestrators, cross-workspace queries.

**Semantics**:
- Orchestrators broadcast key state_update messages (visibility: "conductor_aware") to conductor
- Conductor maintains a semantic graph of all workspace states
- Conductor detects opportunities for cross-workspace collaboration
- Conductor can escalate workspace conflicts to conductor-level resolution
- Conductor does NOT micromanage—only gets involved when coordination is critical

**Latency requirement**: < 1000 ms (asynchronous, eventual consistency acceptable)

**Semantic linking example**:
```
Conductor receives: "User completed a system design project in workspace A"
Conductor checks: "Which workspaces are preparing for interviews or technical assessments?"
Conductor sends notification to workspace C: "State update available: Recent system design project from workspace A might be relevant context"
```

### 2.4 Cross-Workspace Communication

**Channel**: Conductor-mediated (no direct leaf-to-leaf across workspaces).

**Participants**: One orchestrator, conductor, another orchestrator.

**Semantics**:
- Orchestrator sends cross-workspace query to conductor
- Conductor searches all workspace scratchpads
- Conductor returns structured results without exposing other workspace internals
- Sensitive workspace data is filtered based on information governance rules
- Cross-workspace messages have longer TTL (multiple workspace sessions)

**Latency requirement**: < 2000 ms (best-effort async)

## 3. Priority Levels and Scheduling

Messages are processed according to priority and agent capacity:

```
Priority Level | Processing SLA | Preemption | Use Cases
----------------------------------------------------------
critical       | < 50 ms        | Preempts all  | Deadlock, security, user-initiated urgent requests
high           | < 200 ms       | Preempts normal/low | Escalations, time-sensitive findings
normal         | < 1000 ms      | Preempts low   | Regular state updates, delegations, queries
low            | Best effort    | Never preempts | Async notifications, background broadcasts
```

**Rules**:
- Critical messages always get an immediate `ack`
- High-priority escalations automatically escalate to next level if not resolved in 500 ms
- Low-priority messages can be batched (up to 50 per batch, max wait 5 seconds)
- An agent can only have one critical message in flight at a time

## 4. Scratchpad/Blackboard Specification

The scratchpad is the shared working memory for agents within a workspace. It is NOT general-purpose key-value storage—it's specifically for agent coordination notes.

### 4.1 Structure

```
workspace_scratchpad = {
  workspace_id: string,
  entries: [
    {
      entry_id: string (UUID, auto-generated),
      timestamp: ISO 8601,
      source_agent: string (agent_instance_id),
      category: enum (finding | progress | context | blockers | preference | graph_node),
      content: string or object,
      source_evidence: string,
      tags: [string],
      visibility: enum (workspace | conductor_aware | all_workspaces),
      retention_policy: enum (session | workspace_lifetime | permanent),
      archived: boolean (default false)
    }
  ],
  last_modified: ISO 8601,
  entry_count: integer,
  size_bytes: integer
}
```

### 4.2 Indexing

Scratchpad supports queries on:
- **Tags**: Fast exact match and prefix search
- **Category**: Exact match
- **Timestamp**: Range queries (last N hours/days)
- **Source agent**: Exact match
- **Visibility**: Filter by visibility level

Index SLA: Query latency < 50 ms for workspaces with < 10,000 entries.

### 4.3 Retention

- **session**: Cleared when workspace session ends
- **workspace_lifetime**: Persists across sessions while workspace is active
- **permanent**: Persists indefinitely (backed up)

Conductors periodically compact scratchpads: archived entries older than 30 days are summarized into a single "historical summary" entry per 24-hour period.

### 4.4 Scratchpad Examples

**Example 1: Finding**
```json
{
  "entry_id": "abc123",
  "timestamp": "2026-03-23T14:32:10Z",
  "source_agent": "code_analysis_leaf_1",
  "category": "finding",
  "content": "Function `calculateTotal()` in utils.js has a null-pointer dereference on line 42 when invoice.items is empty",
  "source_evidence": "codebase/utils.js:42",
  "tags": ["bug", "null_safety", "critical_path"],
  "visibility": "workspace",
  "retention_policy": "workspace_lifetime"
}
```

**Example 2: User Preference**
```json
{
  "entry_id": "def456",
  "timestamp": "2026-03-23T09:15:20Z",
  "source_agent": "context_leaf_2",
  "category": "preference",
  "content": "User explicitly prefers dark mode. Mentioned in 3 separate sessions.",
  "source_evidence": "portfolio-workspace/session-3/notes.txt:47",
  "tags": ["ui_preference", "accessibility"],
  "visibility": "all_workspaces",
  "retention_policy": "permanent"
}
```

**Example 3: Blocker**
```json
{
  "entry_id": "ghi789",
  "timestamp": "2026-03-23T16:45:00Z",
  "source_agent": "search_leaf_3",
  "category": "blockers",
  "content": "Cannot access external API (api.example.com). Rate limited after 50 requests. Need to implement exponential backoff retry.",
  "source_evidence": "api_logs/2026-03-23.log:error_2847",
  "tags": ["external_dependency", "rate_limiting"],
  "visibility": "workspace",
  "retention_policy": "session"
}
```

## 5. Escalation Protocol

### 5.1 Escalation Flowchart

```
Leaf Agent encounters problem
    ↓
Can this be resolved by querying scratchpad or peer agents?
    ├─ YES → Query scratchpad/peers, resolve locally
    └─ NO → Continue to next step
    ↓
Agent attempts up to 2 alternative approaches
    ├─ Success → Update scratchpad with resolution
    └─ Failure → Continue to next step
    ↓
Agent sends escalation message to workspace orchestrator
    (message_type: escalation, escalation_path: to_orchestrator)
    ↓
Orchestrator receives (SLA: 500 ms to respond)
    ├─ Can resolve by delegating to other leaf agents? → YES → Delegate
    ├─ Is it a multi-workspace issue? → YES → Escalate to conductor
    └─ Is it user-input required? → YES → Delegate to terminal agent
    ↓
Orchestrator sends delegation messages (correlation_id links all messages)
    ↓
Delegated agents execute task, report results back to orchestrator
    ↓
Orchestrator aggregates results, sends resolution to escalating agent
```

### 5.2 Escalation Message Example

**Leaf agent escalates to orchestrator**:
```json
{
  "message_id": "msg_12345",
  "timestamp": "2026-03-23T14:30:00Z",
  "source": {
    "agent_type": "code",
    "workspace_id": "workspace_alpha",
    "agent_instance_id": "code_analysis_leaf_1"
  },
  "destination": {
    "agent_type": "orchestrator",
    "workspace_id": "workspace_alpha"
  },
  "message_type": "escalation",
  "priority": "high",
  "payload": {
    "escalation_reason": "capability_gap",
    "reason_detail": "Found a performance bug but need database schema expertise to propose a fix.",
    "current_context": {
      "task": "Analyze performance bottleneck in user query API",
      "progress": "Identified N+1 query pattern in ProductService.getByUser()",
      "attempted_solutions": ["Caching", "Query profiling"],
      "blocking_issue": "Don't know optimal database indexes for this schema"
    },
    "requested_assistance": {
      "agent_types": ["database_expert"],
      "specific_capability": "Database schema analysis and indexing strategy"
    },
    "escalation_path": "to_orchestrator",
    "severity": "high"
  },
  "requires_ack": true
}
```

**Orchestrator responds with delegation**:
```json
{
  "message_id": "msg_12346",
  "timestamp": "2026-03-23T14:30:15Z",
  "source": {
    "agent_type": "orchestrator",
    "workspace_id": "workspace_alpha"
  },
  "destination": {
    "agent_type": "code",
    "workspace_id": "workspace_alpha",
    "agent_instance_id": "database_leaf_2"
  },
  "message_type": "delegation",
  "priority": "high",
  "correlation_id": "msg_12345",
  "payload": {
    "task_id": "task_escalation_001",
    "task_description": "Analyze N+1 query issue and propose index strategy",
    "assigned_to": {
      "agent_type": "code",
      "workspace_id": "workspace_alpha",
      "agent_instance_id": "database_leaf_2"
    },
    "task_context": {
      "background": "Code analysis agent found N+1 query in ProductService.getByUser()",
      "dependencies": [],
      "deadline": "2026-03-23T15:00:00Z",
      "priority": "high"
    },
    "success_criteria": {
      "deliverable_format": "JSON with: problem_summary, root_cause, proposed_indexes, expected_performance_gain",
      "acceptance_tests": ["Indexes are valid for the schema", "Gain estimate is > 50%"],
      "required_metadata": ["estimated_implementation_time", "risk_level"]
    }
  },
  "requires_ack": true
}
```

### 5.3 Escalation Timeout Handling

If an escalated task isn't resolved within SLA:

1. **Orchestrator timeout (500 ms)**: Orchestrator auto-escalates to conductor with reason "timeout_on_escalation"
2. **Conductor timeout (2000 ms)**: Conductor rolls back partially completed work, returns error to user
3. **Task timeout (within task deadline)**: Delegated agent returns partial result + error message, orchestrator decides on escalation

## 6. Cross-Workspace Messaging

### 6.1 Conductor Semantic Detection

The conductor continuously monitors workspace scratchpads for semantic patterns:

**Detector 1: Skill Transfer Opportunities**
- "User completed a system design project in workspace A"
- Conductor checks: "Are other workspaces prepping for interviews?"
- Broadcasts: "Potential skill transfer: See system design project details"

**Detector 2: Conflicting Approaches**
- Workspace A proposes solution X to problem Y
- Workspace B proposes solution Z to problem Y
- Conductor escalates to user: "Two workspaces are solving the same problem differently"

**Detector 3: Prerequisite Chain**
- Workspace A: "Need to understand REST APIs"
- Workspace B: "Completed REST API course"
- Conductor: "Workspace B has relevant foundation for Workspace A"

### 6.2 Cross-Workspace Query Flow

```json
// Workspace A orchestrator initiates cross-workspace query
{
  "message_id": "msg_cross_001",
  "source": {
    "agent_type": "orchestrator",
    "workspace_id": "workspace_alpha"
  },
  "destination": {
    "agent_type": "conductor",
    "workspace_id": null
  },
  "message_type": "query",
  "payload": {
    "query_type": "cross_workspace_semantic",
    "search_criteria": {
      "tags": ["system_design", "interview_prep"],
      "timeframe": "1_month",
      "workspace_scope": "all_workspaces"
    },
    "expected_response_format": "json"
  },
  "requires_ack": true
}

// Conductor responds with aggregated results
{
  "message_id": "msg_cross_002",
  "source": {
    "agent_type": "conductor"
  },
  "destination": {
    "agent_type": "orchestrator",
    "workspace_id": "workspace_alpha"
  },
  "message_type": "notification",
  "correlation_id": "msg_cross_001",
  "payload": {
    "notification_type": "info",
    "subject": "Cross-workspace search results",
    "body": "Found 3 relevant entries from 2 other workspaces matching your query",
    "metadata": {
      "results": [
        {
          "workspace_id": "workspace_portfolio",
          "entry_summary": "Completed system design project on distributed caching",
          "relevance_score": 0.92,
          "entry_id": "portfolio_xyz"
        }
      ]
    }
  }
}
```

### 6.3 Information Governance

Cross-workspace queries respect these rules:

- **Public entries** (visibility: "all_workspaces"): Fully accessible
- **Conductor-aware entries** (visibility: "conductor_aware"): Metadata only, no sensitive content
- **Private entries** (visibility: "workspace"): Never accessible cross-workspace
- **User consent rules**: If workspaces are separated by user intent (e.g., two different clients), conductor never cross-links

## 7. Broadcast Messages and Ambient State

### 7.1 Broadcast Patterns

Broadcasts are used for ambient state—information every agent should be aware of but doesn't require per-agent routing.

**Broadcast Type 1: State Change**
```json
{
  "message_type": "broadcast",
  "priority": "high",
  "payload": {
    "broadcast_type": "state_change",
    "content": {
      "state": "user_context_updated",
      "details": {
        "user_goal": "Prepare for system design interview",
        "deadline": "2026-03-30T09:00:00Z",
        "skill_level": "intermediate"
      }
    },
    "applies_to": {
      "workspace_ids": ["*"],
      "agent_types": ["*"]
    }
  }
}
```

**Broadcast Type 2: Capability Update**
```json
{
  "message_type": "broadcast",
  "priority": "normal",
  "payload": {
    "broadcast_type": "capability_update",
    "content": {
      "agent_type": "search",
      "new_capability": "academic_paper_access",
      "available_from": "2026-03-23T15:00:00Z"
    },
    "applies_to": {
      "workspace_ids": ["*"],
      "agent_types": ["*"],
      "priority_threshold": "high"
    }
  }
}
```

**Broadcast Type 3: Context Refresh**
```json
{
  "message_type": "broadcast",
  "priority": "normal",
  "payload": {
    "broadcast_type": "context_refresh",
    "content": {
      "updated_entity": "workspace_config",
      "workspace_id": "workspace_alpha",
      "changes": {
        "max_agents": 8,
        "token_budget_per_session": 50000
      }
    },
    "applies_to": {
      "workspace_ids": ["workspace_alpha"],
      "agent_types": ["*"]
    }
  }
}
```

### 7.2 State Push (Ambient Context)

The OS proactively pushes state into agent working memory at the start of each agent execution:

```
Agent starts execution
  ↓
OS gathers current ambient state:
  - User goal/context
  - Workspace scratchpad (last 100 entries, tagged for relevance)
  - Recent delegations and their status
  - Current priority level
  - Available resources/budget
  ↓
OS injects into system prompt:
  "You are Code Analysis Agent in workspace_alpha. Current state: [full JSON]"
  ↓
Agent begins task with full context—no need to query "what's happening"
```

**Pushed state includes**:
```json
{
  "ambient_context": {
    "user_goal": "string",
    "user_deadline": "ISO 8601 or null",
    "current_workspace_id": "string",
    "current_agent_type": "string",
    "recent_scratchpad_entries": [
      // Last 5-10 entries, tagged for relevance
    ],
    "active_delegations": [
      {
        "task_id": "string",
        "status": "enum (pending | in_progress | blocked | complete)",
        "assigned_agents": ["array"],
        "deadline": "ISO 8601"
      }
    ],
    "available_token_budget": "integer (tokens remaining)",
    "time_until_deadline": "string (e.g., '2 hours 15 minutes')",
    "workspace_capacity": {
      "active_agents": "integer",
      "max_agents": "integer"
    }
  }
}
```

## 8. Error Handling in Communication

### 8.1 Failure Categories

```
Category          | Cause                           | Recovery
------------------------------------------------------------------
message_format    | Invalid JSON, missing fields    | Return error, log schema violation
routing           | Unknown workspace/agent         | Return error, suggest valid destinations
timeout           | No response within SLA          | Retry once, then escalate
processing        | Agent crashed or ran out tokens | Return error, mark agent unhealthy
capacity          | Message queue full              | Backpressure, slow down sender
network           | Connection lost (rare)          | Retry with exponential backoff
idempotency       | Duplicate message detected      | Return cached result, don't re-process
```

### 8.2 Error Message Format

```json
{
  "message_id": "msg_error_001",
  "timestamp": "2026-03-23T14:32:10Z",
  "source": {
    "agent_type": "conductor"
  },
  "destination": {
    "agent_type": "orchestrator",
    "workspace_id": "workspace_alpha"
  },
  "message_type": "error",
  "priority": "high",
  "payload": {
    "error_for_message_id": "msg_12345",
    "error_type": "routing",
    "error_code": "AGENT_INSTANCE_NOT_FOUND",
    "error_message": "Agent instance 'database_leaf_2' not found in workspace_alpha. Possible causes: agent crashed, workspace session ended, wrong workspace_id.",
    "recoverable": true,
    "suggested_action": "Retry delegation with agent_type='code' only (no specific instance), orchestrator will pick available instance"
  }
}
```

### 8.3 Retry Policy

- **Retriable errors** (timeout, transient processing failure): Retry up to 2 times with exponential backoff (100ms, 500ms)
- **Non-retriable errors** (format, routing, capacity): Return error immediately, don't retry
- **Critical messages**: Always retry at least once
- **Batch messages**: If one fails, rest proceed (fail-safe)

## 9. Message Ordering Guarantees

### 9.1 Ordering within a Single Channel

**Within-workspace scratchpad**: Append-only. All entries ordered by timestamp. Concurrent writes are handled by the OS (write serialization).

**Orchestrator ↔ Agent**: Request-response pairs linked by `correlation_id`. No guaranteed ordering between unrelated messages, but acknowledgments ensure at-least-once delivery.

**Conductor broadcasts**: All agents receive broadcasts in the same order (total ordering enforced by conductor).

### 9.2 Causal Ordering

Messages with causal dependencies use `correlation_id`:

```
Agent A → Orchestrator (query, correlation_id: "x")
  ↓
Orchestrator → Agent B (delegation, correlation_id: "x")
  ↓
Agent B → Orchestrator (result, correlation_id: "x")
  ↓
Orchestrator → Agent A (notification, correlation_id: "x")
```

The OS ensures all messages in the same correlation chain are delivered in order.

### 9.3 Durability

- **In-memory buffers**: Cleared after successful delivery + acknowledgment
- **Persistent storage**: Critical messages (escalations, delegations, errors) logged to workspace session storage
- **Replay**: If a workspace resumes after interruption, pending delegations are re-delivered with `idempotency_key` (prevents duplicate processing)

## 10. Latency Requirements Summary

```
Communication Type            | SLA     | Consequence of Miss
--------------------------------------------------------------
Leaf → Scratchpad write       | <100ms  | State inconsistency
Scratchpad query              | <100ms  | Agent waits (blocks task)
Leaf → Orchestrator escalation| <200ms  | Escalation stalls
Escalation response           | <500ms  | Auto-escalate to conductor
Orchestrator → Agent delegation| <200ms  | Task execution delayed
Conductor query response      | <2000ms | Best-effort (async OK)
Conductor broadcast           | <1000ms | Agents may miss context
Critical priority message     | <50ms   | Immediate ack required
```

Agents failing SLA are marked degraded. If SLA misses 3 consecutive times, agent is marked unhealthy and restarted.

## 11. Implementation Checklist

- [ ] Implement JSON schema validator for all message types
- [ ] Implement scratchpad as append-only log with indexing (tags, timestamp, category)
- [ ] Implement message routing logic (workspace → orchestrator, orchestrator → conductor)
- [ ] Implement correlation_id and idempotency_key deduplication
- [ ] Implement priority queue for message processing
- [ ] Implement SLA monitoring and escalation on timeout
- [ ] Implement state push mechanism (ambient context injection into agent prompt)
- [ ] Implement scratchpad retention policy enforcement
- [ ] Implement conductor semantic detection (skill transfer, conflict, prerequisites)
- [ ] Implement cross-workspace filtering (information governance)
- [ ] Implement broadcast ordering (total ordering from conductor)
- [ ] Implement retry logic with exponential backoff
- [ ] Implement message logging/tracing for debugging
- [ ] Implement health monitoring (SLA misses, queue depth)

## 12. Example End-to-End Scenario

**Scenario**: User asks "What's a good system design for a real-time chat app?" across two workspaces (system design workspace + interview prep workspace).

**Message flow**:

1. **User input** (system prompt injection):
   ```
   Ambient state pushed: User goal, workspace context, available agents
   ```

2. **System Design Workspace - Orchestrator delegates**:
   ```
   Orchestrator → Code Agent: Analyze existing chat architectures
   Orchestrator → Search Agent: Find reference implementations
   Orchestrator → Design Agent: Synthesize requirements
   ```

3. **Agents write findings to scratchpad**:
   ```
   Code Agent: Finding - "Kafka for message streaming recommended"
   Search Agent: Finding - "Stripe and Discord use similar patterns"
   Design Agent: Blocker - "Need clarity on scale: 1M or 10M users?"
   ```

4. **Design Agent escalates**:
   ```
   Escalation to Orchestrator: Need user clarification on scale
   ```

5. **Orchestrator delegates to Terminal Agent**:
   ```
   Delegation: Ask user for scale parameters
   ```

6. **Terminal Agent interacts with user, returns answer**:
   ```
   User says: "Start with 1M users, design for 10M"
   ```

7. **Orchestrator broadcasts ambient state update**:
   ```
   Broadcast: scale_parameter_updated (1M to 10M)
   All agents in workspace see this immediately
   ```

8. **Conductor detects opportunity**:
   ```
   Conductor semantic detector finds: "Interview prep workspace is preparing for architecture questions"
   Conductor broadcasts: "Relevant system design in progress in system design workspace"
   ```

9. **Interview Prep Workspace reacts**:
   ```
   Interview orchestrator receives conductor notification
   Orchestrator sends query to conductor: "Get system design findings"
   Conductor returns filtered results (non-private entries)
   ```

10. **Both workspaces benefit**:
    ```
    System design workspace: Completes architecture design
    Interview prep workspace: Uses as reference for mock interview
    ```

All messages logged, traceable, SLA-compliant.

---

**Document 7 of 26 | LLM-native OS Specification Series**

Next: Document 08 - Resource Management and Agent Scaling
