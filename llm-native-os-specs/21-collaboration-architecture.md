# Document 21: Collaboration Architecture
## Multi-User Collaboration as a Core Primitive

**Status**: Specification
**Version**: 1.0
**Date**: 2026-03-23

---

## 1. Overview

Collaboration is not a feature added on top of the OS—it is embedded in the core architecture. The system is built from the ground up to support multiple users working together on shared projects, with each user having autonomous agent capabilities while maintaining coordination through shared workspace orchestrators.

### Core Principle
**Two users + one shared workspace = both maintain independent agent conductors while sharing workspace orchestration, storage, and agent services.**

This creates a fundamentally collaborative OS where:
- Each user retains autonomy and private memory
- Shared projects are orchestrated by shared workspace components
- Agents can serve both users transparently
- Conflicts are resolved through explicit protocols
- Presence and communication are built-in primitives

---

## 2. Architecture Overview: Multi-User Hierarchy

### Standard Single-User Hierarchy (Reference)
```
┌─────────────────────────┐
│   User Terminal/UI      │
└────────────┬────────────┘
             │
┌────────────▼────────────┐
│  User Conductor         │  (orchestrates agents for one user)
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      │             │
┌─────▼──────┐ ┌───▼───────┐
│ Workspace  │ │ Private    │
│ Orchestrator│ │ Memory     │
└─────┬──────┘ └────────────┘
      │
   ┌──┴────────────────────┐
   │                       │
┌──▼────┐  ┌──────────┐ ┌─▼──────┐
│Agents │  │ Shared   │ │Private  │
│       │  │ Scratchpad│ │Scratchpad
└────────┘  └──────────┘ └─────────┘
```

### Multi-User Hierarchy with Shared Workspace
```
┌─────────────────────┐         ┌─────────────────────┐
│  User A Terminal    │         │  User B Terminal    │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
┌──────────▼──────────┐         ┌──────────▼──────────┐
│ Conductor A         │         │ Conductor B         │
│ (User A agents)     │         │ (User B agents)     │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           └──────────────┬────────────────┘
                          │
         ┌────────────────▼────────────────┐
         │ Shared Workspace Orchestrator    │
         │ (shared agents, coordination)    │
         └────────────┬─────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
    ┌───▼──┐     ┌────▼────┐  ┌───▼────┐
    │Shared│     │ Shared  │  │Private  │
    │Agents│     │Scratchpad  │Memory   │
    └──────┘     │         │  │         │
                 │ (A+B)   │  │(A | B)  │
                 └─────────┘  └─────────┘
```

### Key Structural Components

**Conductors** (Two independent, non-merged):
- User A has Conductor A (controls their own agents)
- User B has Conductor B (controls their own agents)
- Conductors do NOT share internal state
- Each conductor only controls agents it owns

**Workspace Orchestrator** (Shared, one per workspace):
- Orchestrates agents that serve the entire workspace
- Coordinates between the two conductors
- Manages conflict resolution
- Enforces permission policies
- Maintains workspace-level state

**Agents** (Taxonomy):
1. **Private agents** - belong to individual conductor, serve only that user
2. **Shared agents** - registered with workspace orchestrator, serve both users
3. **Hybrid agents** - can be called from either conductor with role awareness

**Memory/Storage** (Partitioned):
- **Shared scratchpad**: visible to both users' agents
- **Private scratchpad**: each user has their own, not visible to other user
- **Workspace storage**: project files, shared artifacts
- **User-specific storage**: per-user configurations, preferences

---

## 3. Multi-User Workspace Sharing Protocol

### 3.1 Workspace Connection Model

When two users connect to a shared workspace:

```json
{
  "workspace_id": "proj-2024-ai-startup",
  "participants": [
    {
      "user_id": "user_alice",
      "conductor_id": "conductor_alice",
      "role": "owner",
      "connected_at": "2026-03-23T09:00:00Z",
      "status": "active",
      "presence": {
        "last_activity": "2026-03-23T09:15:30Z",
        "current_focus": "implementation/agent-loop.py"
      }
    },
    {
      "user_id": "user_bob",
      "conductor_id": "conductor_bob",
      "role": "collaborator",
      "connected_at": "2026-03-23T09:05:00Z",
      "status": "active",
      "presence": {
        "last_activity": "2026-03-23T09:15:25Z",
        "current_focus": "tests/test-agent.py"
      }
    }
  ],
  "orchestrator_id": "orch_proj-2024-ai",
  "capabilities": ["read", "write", "manage_agents"],
  "created_at": "2026-03-20T14:00:00Z"
}
```

### 3.2 Connection Handshake

```
User A                          Workspace Orchestrator            User B
  │                                      │                          │
  │─ register_conductor() ──────────────►│                          │
  │                                      │                          │
  │ ◄──── conductor_registered ─────────│                          │
  │                                      │                          │
  │                                      │ ◄─── register_conductor()
  │                                      │                          │
  │ ◄─── participant_joined ────────────│─── conductor_registered ─►
  │      (Bob joined)                    │                          │
  │                                      │                          │
  │                  ┌─── sync_state ───┤                          │
  │                  │  (workspacestate) │                          │
  │◄─────────────────┘                   │                          │
  │                                      │                          │
  │                                      │◄─── sync_state ──────────
  │                                      │    (workspacestate)      │
  │                                      └────────────────────────► │
```

---

## 4. Conductor Coexistence Model

### 4.1 Two Conductors, One Workspace

Each user maintains their own conductor. Conductors do NOT communicate directly—they communicate through the shared workspace orchestrator.

```json
{
  "conductor_alice": {
    "user_id": "user_alice",
    "owns_agents": [
      "agent_research_alice",
      "agent_writing_alice"
    ],
    "internal_state": {
      "current_goal": "Draft design document",
      "active_agents": 2,
      "memory_usage": "234 MB"
    },
    "workspace_context": {
      "can_see_shared_scratchpad": true,
      "can_see_bob_presence": true,
      "cannot_see": ["bob_private_scratchpad", "bob_internal_state"]
    }
  },
  "conductor_bob": {
    "user_id": "user_bob",
    "owns_agents": [
      "agent_review_bob",
      "agent_refactor_bob"
    ],
    "internal_state": {
      "current_goal": "Code review",
      "active_agents": 2,
      "memory_usage": "189 MB"
    },
    "workspace_context": {
      "can_see_shared_scratchpad": true,
      "can_see_alice_presence": true,
      "cannot_see": ["alice_private_scratchpad", "alice_internal_state"]
    }
  },
  "shared_orchestrator": {
    "workspace_id": "proj-2024-ai",
    "mediates_between": ["conductor_alice", "conductor_bob"],
    "shared_agents": ["agent_artifact_builder", "agent_tester"],
    "conflict_log": []
  }
}
```

### 4.2 Agent Ownership and Control

**Rule: An agent is owned by exactly one conductor or the workspace orchestrator.**

- Private agents: owned by and called only by their conductor
- Shared agents: owned by orchestrator, called by either conductor (with permission checks)
- Hybrid agents: can have logic that behaves differently based on caller

```json
{
  "agent_research_alice": {
    "type": "private",
    "owner": "conductor_alice",
    "can_call": ["conductor_alice"],
    "access_to": ["alice_shared_scratchpad", "shared_workspace_scratchpad"]
  },
  "agent_artifact_builder": {
    "type": "shared",
    "owner": "workspace_orchestrator",
    "can_call": ["conductor_alice", "conductor_bob"],
    "access_to": ["shared_workspace_scratchpad"],
    "audit": true
  },
  "agent_context_handler": {
    "type": "hybrid",
    "owner": "workspace_orchestrator",
    "behavior": {
      "when_called_by_alice": "return alice-specific context",
      "when_called_by_bob": "return bob-specific context"
    }
  }
}
```

---

## 5. Conflict Resolution Strategy

### 5.1 Conflict Detection

Conflicts occur when two agents (from different users) attempt to perform incompatible operations on shared resources.

```json
{
  "conflict_id": "conflict_2026_03_23_001",
  "timestamp": "2026-03-23T09:15:45Z",
  "workspace_id": "proj-2024-ai",
  "conflict_type": "concurrent_write",
  "details": {
    "resource": "shared_file_design.md",
    "operation_1": {
      "agent": "agent_research_alice",
      "user": "user_alice",
      "action": "write",
      "section": "Architecture Overview",
      "content": "The core system uses...",
      "timestamp": "2026-03-23T09:15:44Z"
    },
    "operation_2": {
      "agent": "agent_writing_bob",
      "user": "user_bob",
      "action": "write",
      "section": "Architecture Overview",
      "content": "The system architecture includes...",
      "timestamp": "2026-03-23T09:15:45Z"
    }
  }
}
```

### 5.2 Conflict Resolution Mechanisms

**1. Last-Write-Wins (LWW) with Audit Trail**
- Default for non-critical changes
- Later write overwrites earlier write
- Original is preserved in audit log
- Users are notified of overwrites

**2. Lock-Based (Pessimistic)**
- For critical resources (code, architecture docs)
- First agent to touch resource locks it
- Other agent must wait or request early unlock
- Timeout: 5 minutes default

```json
{
  "resource": "shared_file_implementation.py",
  "lock": {
    "held_by": "agent_research_alice",
    "conductor": "conductor_alice",
    "acquired_at": "2026-03-23T09:10:00Z",
    "expires_at": "2026-03-23T09:15:00Z",
    "queue": [
      {
        "requesting_agent": "agent_refactor_bob",
        "conductor": "conductor_bob",
        "requested_at": "2026-03-23T09:11:30Z",
        "priority": "normal"
      }
    ]
  }
}
```

**3. Merge-Based (Optimistic)**
- For documents with structured format
- Both writes are preserved in semantic merge
- Conflict markers inserted if unmergeable
- Users review and resolve

```
<<<<<<< alice
The architecture uses a hierarchical conductor model
=======
Our system uses a distributed orchestrator approach
>>>>>>> bob
```

**4. Operational Transform (OT)**
- For real-time collaborative editing
- Transforms concurrent operations into commutative sequence
- Maintains causal ordering
- State converges across users

```json
{
  "document_id": "doc_design",
  "operation_alice": {
    "type": "insert",
    "position": 150,
    "text": "hierarchical",
    "timestamp": "2026-03-23T09:15:44.123Z",
    "conductor": "conductor_alice"
  },
  "operation_bob": {
    "type": "insert",
    "position": 152,
    "text": "distributed",
    "timestamp": "2026-03-23T09:15:44.456Z",
    "conductor": "conductor_bob"
  },
  "resolved_sequence": [
    {
      "operation": "insert",
      "position": 150,
      "text": "hierarchical"
    },
    {
      "operation": "insert",
      "position": 162,
      "text": "distributed"
    }
  ]
}
```

**5. Agent Negotiation**
- For semantic conflicts, invoke resolution agents
- Agents from both users collaborate to resolve
- Mediated by orchestrator's arbitration agent

```json
{
  "negotiation_session": {
    "conflict_id": "conflict_2026_03_23_001",
    "mediator_agent": "agent_arbitrator",
    "phase": "resolution",
    "participants": [
      {
        "agent": "agent_research_alice",
        "position": "We should prioritize user experience..."
      },
      {
        "agent": "agent_refactor_bob",
        "position": "Performance optimization is critical..."
      }
    ],
    "resolution": "Proposed hybrid approach incorporating both priorities"
  }
}
```

### 5.3 Escalation Path

```
Detected Conflict
    ↓
[Automatic Resolution Attempt]
├─ LWW? → Resolve with audit
├─ Lock Available? → Apply lock
├─ Mergeable? → Merge with markers
├─ OT Applicable? → Transform ops
└─ Can Agents Negotiate? → Invoke negotiation

    ↓ (if auto-resolution fails)

[Manual Resolution Required]
├─ Notify both users
├─ Request decision/guidance
├─ Implement user choice
└─ Log resolution metadata
```

---

## 6. Shared vs. Private Memory Model

### 6.1 Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│             WORKSPACE MEMORY HIERARCHY                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  SHARED WORKSPACE SCRATCHPAD                             │
│  - Visible to both Alice and Bob                         │
│  - Read/write by either conductor (with audit)          │
│  - Persisted to workspace storage                        │
│  - Conflict resolution applied                          │
│  Examples:                                              │
│  - Project goals and milestones                         │
│  - Shared design decisions                              │
│  - Common artifact registry                             │
│  - Merged code changes                                  │
└─────────────────────────────────────────────────────────┘

        ↓ partitioned into                    ↓

┌──────────────────────────┐    ┌──────────────────────────┐
│ ALICE PRIVATE SCRATCHPAD │    │  BOB PRIVATE SCRATCHPAD  │
│ - Only visible to Alice   │    │  - Only visible to Bob   │
│ - Only agent_alice_*      │    │  - Only agent_bob_*      │
│ - No conflict resolution  │    │  - No conflict resolution│
│ - Personal notes          │    │  - Personal notes        │
│ - Working drafts          │    │  - Working drafts        │
│ - Temp computations       │    │  - Temp computations     │
│ - Private ideas           │    │  - Private ideas         │
└──────────────────────────┘    └──────────────────────────┘

        ↓ separate from                    ↓

┌──────────────────────────┐    ┌──────────────────────────┐
│  ALICE'S CONDUCTOR STATE │    │  BOB'S CONDUCTOR STATE   │
│  - Goal stack            │    │  - Goal stack            │
│  - Active agents         │    │  - Active agents         │
│  - Call history          │    │  - Call history          │
│  - NOT shared with Bob   │    │  - NOT shared with Alice │
└──────────────────────────┘    └──────────────────────────┘
```

### 6.2 Memory Access Control Matrix

| Memory | Alice Read | Alice Write | Bob Read | Bob Write | Audit |
|--------|-----------|-----------|----------|----------|-------|
| Shared Workspace Scratchpad | ✓ | ✓ | ✓ | ✓ | Yes |
| Alice Private Scratchpad | ✓ | ✓ | ✗ | ✗ | — |
| Bob Private Scratchpad | ✗ | ✗ | ✓ | ✓ | — |
| Alice Conductor State | ✓ | ✓ | ✗ | ✗ | — |
| Bob Conductor State | ✗ | ✗ | ✓ | ✓ | — |
| Workspace File Index | ✓ | ✓ (own) | ✓ | ✓ (own) | Yes |
| Shared Workspace Files | ✓ | ✓ | ✓ | ✓ | Yes |

### 6.3 Data Exchange Protocol

When Alice's agent needs to share information with Bob's agents:

```json
{
  "message_type": "share_scratchpad_entry",
  "from_conductor": "conductor_alice",
  "to_conductor": "conductor_bob",
  "resource": "shared_workspace_scratchpad",
  "payload": {
    "key": "research_findings_arch_03_23",
    "value": {
      "title": "Hierarchical Conductor Model Analysis",
      "findings": "...",
      "confidence": 0.92,
      "timestamps": ["2026-03-23T08:30:00Z", "2026-03-23T09:00:00Z"]
    },
    "visibility": "shared",
    "allow_modification": true,
    "allow_deletion": false
  },
  "permissions": {
    "can_read": ["user_bob"],
    "can_write": ["user_bob"],
    "can_delete": ["user_alice"]
  },
  "posted_at": "2026-03-23T09:16:00Z"
}
```

Bob's conductor notifies Bob's agents of new shared content:

```json
{
  "event_type": "shared_content_available",
  "from_conductor": "conductor_bob",
  "to_agents": ["agent_review_bob", "agent_refactor_bob"],
  "content": {
    "source_user": "user_alice",
    "key": "research_findings_arch_03_23",
    "description": "New research findings available in shared scratchpad",
    "action_options": [
      "acknowledge",
      "incorporate",
      "discuss",
      "build_on"
    ]
  }
}
```

---

## 7. Real-Time Synchronization Protocol

### 7.1 Change Propagation Model

```
User A's Conductor          Workspace Orchestrator        User B's Conductor
(Conductor A)               (Shared Orchestrator)          (Conductor B)
        │                           │                            │
        │                           │                            │
        │─ execute_operation() ────►│                            │
        │  (write to shared file)   │                            │
        │                           │                            │
        │◄─── operation_ack ───────│                            │
        │                           │                            │
        │                  [conflict check]                      │
        │                           │                            │
        │                    [apply operation]                   │
        │                           │                            │
        │                    [version increment]                 │
        │                           │                            │
        │                  [build change delta]                  │
        │                           │                            │
        │                           │─ sync_update ─────────────►│
        │                           │  (change delta)            │
        │                           │                            │
        │                           │              [integrate]   │
        │                           │              [conflict?]   │
        │                           │                            │
        │◄─────────── presence ─────────────────────────────────│
        │            (operation complete)                        │
```

### 7.2 Change Message Format

```json
{
  "change_id": "change_2026_03_23_0847",
  "workspace_id": "proj-2024-ai",
  "source_conductor": "conductor_alice",
  "source_user": "user_alice",
  "timestamp": "2026-03-23T09:16:23.456Z",
  "sequence_number": 1247,
  "operation": {
    "type": "file_write",
    "resource_id": "shared_file_design.md",
    "previous_hash": "sha256_abc123...",
    "new_hash": "sha256_def456...",
    "diff": {
      "type": "unified_diff",
      "from_line": 45,
      "to_line": 52,
      "additions": 8,
      "deletions": 2,
      "patch": "--- design.md\n+++ design.md\n@@ -45,7 +45,13 @@..."
    }
  },
  "metadata": {
    "agent_responsible": "agent_research_alice",
    "operation_context": "Updating architecture section",
    "user_initiated": true
  },
  "dependencies": [1245, 1246],
  "idempotency_token": "idempotent_2026_03_23_0847"
}
```

### 7.3 Synchronization Guarantees

**Ordering Guarantees**:
- Changes from same conductor are ordered by sequence number
- Changes across conductors ordered by Lamport timestamp
- Causal dependencies preserved

**Consistency Guarantees**:
- Eventual consistency: all users see same final state (after conflict resolution)
- Strong consistency available for locked resources
- Monotonic read consistency: no one sees "older" state after "newer"

**Failure Handling**:
- If sync fails, operation queued locally
- Retry with exponential backoff (1s, 2s, 4s, 8s, 30s max)
- Broadcast heartbeat to confirm liveness
- If orchestrator unreachable >30s: enter local-only mode (queue operations)

```json
{
  "sync_state": {
    "conductor_id": "conductor_alice",
    "status": "healthy",
    "last_sync": "2026-03-23T09:16:25.789Z",
    "pending_operations": [],
    "queued_operations": [],
    "last_orchestrator_heartbeat": "2026-03-23T09:16:25.789Z",
    "orchestrator_reachable": true,
    "consistency_level": "eventual"
  }
}
```

---

## 8. Presence Awareness and Communication

### 8.1 Presence Model

```json
{
  "presence_state": {
    "user_id": "user_alice",
    "conductor_id": "conductor_alice",
    "status": "active",
    "last_activity": "2026-03-23T09:16:30Z",
    "activity_details": {
      "current_task": "Reviewing conflict in design doc",
      "current_file": "shared_file_design.md",
      "current_location": {
        "file": "shared_file_design.md",
        "line": 145,
        "column": 23
      },
      "active_agents": [
        {
          "agent_id": "agent_research_alice",
          "status": "thinking",
          "task": "Analyzing requirements"
        }
      ]
    },
    "timezone": "America/Los_Angeles",
    "idle_since": null
  }
}
```

### 8.2 Presence Synchronization

All users in a workspace receive presence updates:

```json
{
  "event_type": "presence_update",
  "workspace_id": "proj-2024-ai",
  "timestamp": "2026-03-23T09:16:31Z",
  "changes": [
    {
      "user_id": "user_alice",
      "previous": {
        "status": "idle",
        "idle_since": "2026-03-23T09:15:00Z"
      },
      "current": {
        "status": "active",
        "current_file": "shared_file_design.md",
        "current_location": { "line": 145, "column": 23 }
      }
    }
  ]
}
```

### 8.3 In-System Communication Protocol

Users can send messages through the workspace system:

```json
{
  "message_id": "msg_2026_03_23_0001",
  "type": "collaboration_message",
  "from_user": "user_alice",
  "from_conductor": "conductor_alice",
  "to_users": ["user_bob"],
  "to_workspace": "proj-2024-ai",
  "timestamp": "2026-03-23T09:16:45Z",
  "priority": "normal",
  "content": {
    "text": "I've updated the architecture section. Can you review for technical accuracy?",
    "attachments": [
      {
        "type": "file_reference",
        "file_id": "shared_file_design.md",
        "line_range": [45, 100]
      }
    ],
    "mentions": ["user_bob"],
    "tags": ["review_needed", "architecture"]
  },
  "reply_context": null,
  "status": "sent"
}
```

Recipients are notified:

```json
{
  "event_type": "incoming_message",
  "from_user": "user_alice",
  "message_id": "msg_2026_03_23_0001",
  "preview": "I've updated the architecture section. Can you review...",
  "action_required": true,
  "deadline": null
}
```

---

## 9. Permission Management in Shared Workspaces

### 9.1 Role-Based Access Control (RBAC)

```json
{
  "workspace_id": "proj-2024-ai",
  "rbac": {
    "roles": {
      "owner": {
        "description": "Full control",
        "permissions": [
          "read_workspace",
          "write_workspace",
          "execute_shared_agents",
          "modify_shared_agents",
          "invite_collaborators",
          "remove_collaborators",
          "change_permissions",
          "delete_workspace"
        ]
      },
      "collaborator": {
        "description": "Can read and write, execute agents",
        "permissions": [
          "read_workspace",
          "write_workspace",
          "execute_shared_agents",
          "create_private_agents"
        ]
      },
      "reviewer": {
        "description": "Can read and review, suggest changes",
        "permissions": [
          "read_workspace",
          "comment_on_files",
          "suggest_changes",
          "execute_shared_agents"
        ]
      },
      "viewer": {
        "description": "Read-only access",
        "permissions": [
          "read_workspace"
        ]
      }
    },
    "role_assignments": [
      {
        "user_id": "user_alice",
        "role": "owner",
        "granted_at": "2026-03-20T14:00:00Z",
        "granted_by": "system"
      },
      {
        "user_id": "user_bob",
        "role": "collaborator",
        "granted_at": "2026-03-23T09:05:00Z",
        "granted_by": "user_alice"
      }
    ]
  }
}
```

### 9.2 Resource-Level Permissions

```json
{
  "resource_id": "shared_file_implementation.py",
  "resource_type": "file",
  "owner": "user_alice",
  "permissions": {
    "user_alice": {
      "read": true,
      "write": true,
      "execute": true,
      "share": true,
      "delete": true
    },
    "user_bob": {
      "read": true,
      "write": true,
      "execute": true,
      "share": false,
      "delete": false
    }
  },
  "inherited_from": "workspace_proj-2024-ai"
}
```

### 9.3 Agent Execution Permissions

```json
{
  "agent_id": "agent_artifact_builder",
  "agent_type": "shared",
  "can_be_called_by": {
    "user_alice": {
      "allowed": true,
      "max_parallel_calls": 3,
      "max_tokens_per_call": 100000,
      "allowed_operations": ["file_write", "file_read", "file_create"]
    },
    "user_bob": {
      "allowed": true,
      "max_parallel_calls": 2,
      "max_tokens_per_call": 50000,
      "allowed_operations": ["file_write", "file_read"]
    }
  }
}
```

---

## 10. Agent Hierarchy in Collaboration

### 10.1 Hierarchy Structure

```
                    WORKSPACE ORCHESTRATOR
                    (Shared across A & B)
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼────┐         ┌───▼────┐        ┌───▼────┐
    │Shared  │         │Shared  │        │Shared  │
    │Agent 1 │         │Agent 2 │        │Agent 3 │
    └────────┘         └────────┘        └────────┘
        │                                     │
        │              (both calls)           │
        │                                     │
   ┌────┴────┐                          ┌────┴────┐
   │          │                          │         │
CONDUCTOR_A  CONDUCTOR_B             CONDUCTOR_A CONDUCTOR_B
   │          │                          │         │
┌──▼──┐   ┌──▼──┐                    ┌──▼──┐   ┌──▼──┐
│Pvt  │   │Pvt  │                    │Pvt  │   │Pvt  │
│A1   │   │B1   │                    │A3   │   │B3   │
└─────┘   └─────┘                    └─────┘   └─────┘
```

### 10.2 Agent Registration Schema

```json
{
  "agents": [
    {
      "agent_id": "agent_research_alice",
      "conductor_id": "conductor_alice",
      "access_level": "private",
      "can_call": ["conductor_alice"],
      "memory_access": {
        "shared_scratchpad": "read_write",
        "private_scratchpad": "read_write",
        "conductor_state": "read"
      }
    },
    {
      "agent_id": "agent_artifact_builder",
      "orchestrator_id": "orch_proj-2024-ai",
      "access_level": "shared",
      "can_call": ["conductor_alice", "conductor_bob"],
      "memory_access": {
        "shared_scratchpad": "read_write",
        "private_scratchpad": "none",
        "conductor_state": "none"
      },
      "audit": {
        "log_all_calls": true,
        "track_resources": true
      }
    },
    {
      "agent_id": "agent_context_switcher",
      "orchestrator_id": "orch_proj-2024-ai",
      "access_level": "hybrid",
      "behavior": {
        "caller_awareness": true,
        "role_based_logic": true
      },
      "can_call": ["conductor_alice", "conductor_bob"],
      "memory_access": {
        "shared_scratchpad": "read_write",
        "alice_private_scratchpad": "read (alice only)",
        "bob_private_scratchpad": "read (bob only)"
      }
    }
  ]
}
```

---

## 11. Collaboration Protocol Specification

### 11.1 Message Types and Schemas

#### 11.1.1 Conductor Registration

```json
{
  "message_type": "register_conductor",
  "conductor_id": "conductor_alice",
  "user_id": "user_alice",
  "workspace_id": "proj-2024-ai",
  "version": "1.0",
  "capabilities": {
    "agents": 5,
    "memory_mb": 512,
    "concurrent_operations": 3
  }
}

{
  "message_type": "conductor_registered",
  "conductor_id": "conductor_alice",
  "orchestrator_id": "orch_proj-2024-ai",
  "status": "registered",
  "other_participants": [
    {
      "conductor_id": "conductor_bob",
      "user_id": "user_bob",
      "status": "active"
    }
  ],
  "sequence_number": 1000
}
```

#### 11.1.2 Operation Execution

```json
{
  "message_type": "execute_operation",
  "operation_id": "op_2026_03_23_0001",
  "conductor_id": "conductor_alice",
  "workspace_id": "proj-2024-ai",
  "operation": {
    "type": "file_write",
    "resource": "shared_file_design.md",
    "data": "...",
    "metadata": {}
  },
  "idempotency_token": "idempotent_2026_03_23_0001",
  "requires_lock": false,
  "conflict_resolution_strategy": "merge",
  "timestamp": "2026-03-23T09:17:00Z"
}

{
  "message_type": "operation_result",
  "operation_id": "op_2026_03_23_0001",
  "status": "succeeded",
  "result": {
    "resource_id": "shared_file_design.md",
    "new_hash": "sha256_xyz...",
    "version": 147,
    "sequence_number": 1248
  },
  "conflicts_resolved": 0,
  "timestamp": "2026-03-23T09:17:01.234Z"
}
```

#### 11.1.3 Conflict Detection and Resolution

```json
{
  "message_type": "conflict_detected",
  "conflict_id": "conflict_2026_03_23_001",
  "workspace_id": "proj-2024-ai",
  "severity": "high",
  "resource": "shared_file_design.md",
  "conflicting_operations": [
    {
      "operation_id": "op_2026_03_23_0001",
      "conductor_id": "conductor_alice",
      "type": "write"
    },
    {
      "operation_id": "op_2026_03_23_0002",
      "conductor_id": "conductor_bob",
      "type": "write"
    }
  ],
  "timestamp": "2026-03-23T09:17:02Z",
  "awaiting_resolution": true
}

{
  "message_type": "resolve_conflict",
  "conflict_id": "conflict_2026_03_23_001",
  "resolution_strategy": "merge",
  "resolution_details": {
    "strategy": "merge",
    "merged_content": "...",
    "conflict_markers": 1,
    "requires_user_review": true
  },
  "notified_users": ["user_alice", "user_bob"],
  "timestamp": "2026-03-23T09:17:03Z"
}
```

#### 11.1.4 State Synchronization

```json
{
  "message_type": "sync_request",
  "conductor_id": "conductor_bob",
  "workspace_id": "proj-2024-ai",
  "last_known_sequence": 1200,
  "last_sync": "2026-03-23T09:15:00Z"
}

{
  "message_type": "sync_response",
  "conductor_id": "conductor_bob",
  "workspace_id": "proj-2024-ai",
  "current_sequence": 1248,
  "changes": [
    {
      "sequence_number": 1201,
      "change_id": "change_2026_03_23_0048",
      "source_conductor": "conductor_alice",
      "operation": { "type": "file_write", "resource": "...", "diff": "..." }
    },
    {
      "sequence_number": 1202,
      "change_id": "change_2026_03_23_0049",
      "source_conductor": "conductor_bob",
      "operation": { "type": "file_read", "resource": "..." }
    }
  ],
  "timestamp": "2026-03-23T09:17:05Z"
}
```

#### 11.1.5 Presence Update

```json
{
  "message_type": "presence_update",
  "conductor_id": "conductor_alice",
  "user_id": "user_alice",
  "workspace_id": "proj-2024-ai",
  "presence": {
    "status": "active",
    "current_file": "shared_file_design.md",
    "current_location": { "line": 150, "column": 25 },
    "active_agents": ["agent_research_alice"],
    "last_activity": "2026-03-23T09:17:10Z"
  },
  "timestamp": "2026-03-23T09:17:10Z"
}

{
  "message_type": "presence_broadcast",
  "workspace_id": "proj-2024-ai",
  "updates": [
    {
      "user_id": "user_alice",
      "presence": { "status": "active", "current_file": "..." },
      "timestamp": "2026-03-23T09:17:10Z"
    }
  ],
  "broadcast_to": ["conductor_bob"]
}
```

#### 11.1.6 Collaboration Messages

```json
{
  "message_type": "collaboration_message",
  "message_id": "msg_2026_03_23_0001",
  "from_conductor": "conductor_alice",
  "from_user": "user_alice",
  "workspace_id": "proj-2024-ai",
  "to_users": ["user_bob"],
  "content": {
    "text": "I've completed the architecture section. Please review.",
    "mentions": ["user_bob"],
    "attachments": [
      {
        "type": "file_reference",
        "resource_id": "shared_file_design.md",
        "line_range": [45, 100]
      }
    ]
  },
  "timestamp": "2026-03-23T09:17:15Z",
  "reply_to": null
}

{
  "message_type": "message_delivered",
  "message_id": "msg_2026_03_23_0001",
  "delivered_to": ["conductor_bob"],
  "delivery_timestamp": "2026-03-23T09:17:15.123Z"
}
```

---

## 12. Concrete Collaborative Workflow Examples

### 12.1 Workflow: Alice and Bob Co-Designing Architecture

**Timeline**: 09:00 - 09:30

**Participants**:
- Alice (user_alice, Conductor A): Expert in system design, owns the project
- Bob (user_bob, Conductor B): Expert in performance, joining to review

#### Step 1: Bob Joins (09:05)

```json
[BOB joins the workspace]
→ conductor_bob sends: register_conductor
  {
    "conductor_id": "conductor_bob",
    "user_id": "user_bob",
    "workspace_id": "proj-2024-ai",
    "capabilities": { "agents": 3, "memory_mb": 256 }
  }

← orchestrator sends: conductor_registered
  {
    "conductor_id": "conductor_bob",
    "orchestrator_id": "orch_proj-2024-ai",
    "other_participants": [
      { "conductor_id": "conductor_alice", "user_id": "user_alice", "status": "active" }
    ]
  }

← orchestrator broadcasts to conductor_alice: participant_joined
  {
    "new_participant": {
      "user_id": "user_bob",
      "conductor_id": "conductor_bob",
      "role": "collaborator"
    }
  }

→ conductor_bob requests: sync_request { "last_known_sequence": 0 }

← orchestrator sends: sync_response
  {
    "current_sequence": 120,
    "changes": [
      { "sequence_number": 1, ... change_draft_architecture ... },
      { "sequence_number": 2, ... change_add_hierarchy ... },
      ...
      { "sequence_number": 120, ... change_latest ... }
    ]
  }
```

#### Step 2: Alice Works on Architecture (09:10-09:15)

Alice's conductor calls agent_research_alice to draft the architecture section.

```json
[09:10] conductor_alice executes agent_research_alice
→ agent_research_alice reads shared_scratchpad (project goals)
→ agent_research_alice generates architecture draft
→ agent_research_alice writes to shared_scratchpad["architecture_draft"]

→ conductor_alice sends: execute_operation
  {
    "operation_id": "op_2026_03_23_0001",
    "conductor_id": "conductor_alice",
    "operation": {
      "type": "scratchpad_write",
      "key": "architecture_draft",
      "value": { "title": "...", "sections": [...] }
    },
    "sequence_number": 121
  }

← orchestrator sends: operation_result { "status": "succeeded", "sequence_number": 121 }

← orchestrator broadcasts to conductor_bob: sync_update
  {
    "change_id": "change_2026_03_23_0001",
    "operation": { "type": "scratchpad_write", "key": "architecture_draft" }
  }

[09:15] → conductor_alice sends: presence_update
  {
    "current_file": "architecture_draft",
    "active_agents": ["agent_research_alice"],
    "status": "thinking"
  }

← orchestrator broadcasts to conductor_bob: presence_broadcast
  {
    "user_id": "user_alice",
    "current_file": "architecture_draft",
    "status": "thinking"
  }
```

#### Step 3: Bob Reviews and Suggests Changes (09:18)

Bob's conductor calls agent_review_bob to analyze Alice's draft.

```json
[09:18] → conductor_bob sends: message
  {
    "from_user": "user_bob",
    "to_users": ["user_alice"],
    "text": "Reviewing your architecture draft now...",
    "mentions": ["user_alice"]
  }

← orchestrator delivers message to conductor_alice
← alice sees notification: Bob is reviewing

[09:20] conductor_bob executes agent_review_bob
→ agent_review_bob reads shared_scratchpad["architecture_draft"]
→ agent_review_bob analyzes for performance implications
→ agent_review_bob generates "review_findings" in Bob's private scratchpad (shared_scratchpad["bob_review_2026_03_23"])

→ conductor_bob sends: execute_operation
  {
    "operation_id": "op_2026_03_23_0002",
    "operation": {
      "type": "scratchpad_write",
      "key": "bob_review_2026_03_23",
      "value": {
        "summary": "Architecture is sound but needs performance optimization in agent pooling",
        "suggestions": [
          "Consider thread pool for agent orchestration",
          "Add caching layer for frequently accessed state"
        ]
      }
    }
  }

← orchestrator broadcasts: sync_update to conductor_alice
  { "source_conductor": "conductor_bob", "change": {...} }

[09:22] → conductor_bob sends: collaboration_message
  {
    "from_user": "user_bob",
    "to_users": ["user_alice"],
    "text": "I've reviewed your draft. I found some optimization opportunities around agent pooling. Check shared_scratchpad[bob_review_2026_03_23].",
    "attachments": [
      { "type": "scratchpad_reference", "key": "bob_review_2026_03_23" }
    ]
  }

← alice receives message notification
← alice's conductor loads bob_review_2026_03_23 from shared scratchpad
```

#### Step 4: Conflict - Concurrent Architecture Edit (09:24)

Both Alice and Bob try to write to the same shared architecture file simultaneously.

```json
[09:24:00.000] → conductor_alice sends: execute_operation
  {
    "operation_id": "op_2026_03_23_0003",
    "operation": {
      "type": "file_write",
      "resource": "shared_file_design.md",
      "section": "Agent Pooling",
      "content": "We use a hierarchical conductor model with stateless agent instances...",
      "diff": ...
    },
    "timestamp": "2026-03-23T09:24:00.000Z"
  }

[09:24:00.050] → conductor_bob sends: execute_operation
  {
    "operation_id": "op_2026_03_23_0004",
    "operation": {
      "type": "file_write",
      "resource": "shared_file_design.md",
      "section": "Agent Pooling",
      "content": "The system implements thread pooling for agent orchestration to maximize throughput...",
      "diff": ...
    },
    "timestamp": "2026-03-23T09:24:00.050Z"
  }

← orchestrator detects: conflict_detected
  {
    "conflict_id": "conflict_2026_03_23_001",
    "resource": "shared_file_design.md",
    "conflicting_operations": [
      { "operation_id": "op_2026_03_23_0003", "conductor_id": "conductor_alice", "timestamp": "...000" },
      { "operation_id": "op_2026_03_23_0004", "conductor_id": "conductor_bob", "timestamp": "...050" }
    ]
  }

← orchestrator broadcasts: conflict_detected to both conductors

[AUTOMATIC RESOLUTION ATTEMPT]
→ orchestrator invokes agent_arbitrator (shared agent)
→ agent_arbitrator reads both proposed versions
→ agent_arbitrator reads alice_private_scratchpad["architecture_notes"]
→ agent_arbitrator reads bob_private_scratchpad["performance_constraints"]
→ agent_arbitrator composes merged version:
  "We use a hierarchical conductor model with agent pooling
   that leverages thread pooling for agent orchestration..."

← orchestrator sends: resolve_conflict
  {
    "conflict_id": "conflict_2026_03_23_001",
    "resolution_strategy": "merge_with_negotiation",
    "result": {
      "merged_content": "...",
      "status": "resolved",
      "strategy": "both_perspectives_incorporated",
      "awaiting_user_review": false
    }
  }

← broadcasts: conflict_resolved to both conductors
  { "strategy": "merged both perspectives" }

[09:24:15] → orchestrator sends: collaboration_message (auto)
  {
    "system": true,
    "text": "Architecture conflict resolved! Agent pooling section now includes both hierarchical conductor approach and thread pooling optimization.",
    "to_users": ["user_alice", "user_bob"]
  }
```

#### Step 5: Final Sync and Acknowledgment (09:28)

Both Alice and Bob review the merged section and agree it's good.

```json
[09:28] → conductor_alice sends: message
  {
    "from_user": "user_alice",
    "to_users": ["user_bob"],
    "text": "Great resolution! The merged agent pooling section looks solid. Let's finalize the design."
  }

← conductor_bob receives message

[09:29] → conductor_bob sends: message
  {
    "from_user": "user_bob",
    "to_users": ["user_alice"],
    "text": "Agreed! Ready to move to implementation."
  }

← conductor_alice receives message
← orchestrator logs: both users satisfied with current state

[09:30] ← orchestrator sends: presence_update broadcast
  {
    "updates": [
      { "user_id": "user_alice", "status": "active", "current_file": "shared_file_design.md", "last_activity": "2026-03-23T09:29:15Z" },
      { "user_id": "user_bob", "status": "active", "current_file": "shared_file_design.md", "last_activity": "2026-03-23T09:28:50Z" }
    ]
  }
```

---

### 12.2 Workflow: Permission-Based Access Control

Alice owns "proj-2024-ai" and invites Bob with different permission levels for different resources.

```json
[ALICE: Give Bob read-only access to sensitive_architecture.md]

→ conductor_alice sends: set_resource_permissions
  {
    "resource_id": "sensitive_architecture.md",
    "user": "user_bob",
    "permissions": {
      "read": true,
      "write": false,
      "execute": false,
      "share": false,
      "delete": false
    }
  }

← orchestrator acknowledges and broadcasts permission change

[BOB tries to write to sensitive_architecture.md]

→ conductor_bob sends: execute_operation
  {
    "operation_id": "op_2026_03_23_0010",
    "operation": {
      "type": "file_write",
      "resource": "sensitive_architecture.md",
      "content": "..."
    }
  }

← orchestrator sends: operation_denied
  {
    "operation_id": "op_2026_03_23_0010",
    "reason": "Permission denied",
    "required_permission": "write",
    "user_permissions": { "read": true, "write": false },
    "message": "You have read-only access to this resource. Ask user_alice for write permissions."
  }

← orchestrator sends: permission_request_suggestion
  {
    "resource": "sensitive_architecture.md",
    "current_permission": "read",
    "requested_permission": "write"
  }

[BOB requests write access]

→ conductor_bob sends: request_permission_elevation
  {
    "resource_id": "sensitive_architecture.md",
    "current_permission": "read",
    "requested_permission": "write",
    "reason": "Need to update implementation strategy section"
  }

← orchestrator routes request to owner: conductor_alice

← conductor_alice receives: permission_request
  {
    "from_user": "user_bob",
    "resource": "sensitive_architecture.md",
    "current_permission": "read",
    "requested_permission": "write",
    "reason": "Need to update implementation strategy section"
  }

[ALICE grants permission]

→ conductor_alice sends: grant_permission
  {
    "to_user": "user_bob",
    "resource_id": "sensitive_architecture.md",
    "permission": "write"
  }

← orchestrator updates permissions and broadcasts change

← conductor_bob receives: permission_granted
  {
    "resource": "sensitive_architecture.md",
    "permission": "write",
    "granted_by": "user_alice"
  }

[Now BOB can write]

→ conductor_bob retries: execute_operation (same op as before)
← orchestrator: operation_result { "status": "succeeded" }
```

---

## 13. Error Handling and Recovery

### 13.1 Network Partition Scenarios

```json
{
  "scenario": "Conductor loses connection to orchestrator",
  "phase": "detection",
  "heartbeat_interval": "5s",
  "failure_threshold": "6 heartbeats (30s)",

  "behavior_phases": {
    "phase_1_healthy": {
      "duration": "0-30s",
      "conductor_status": "normal",
      "operations": "sent to orchestrator",
      "queuing": false
    },
    "phase_2_degraded": {
      "duration": "30-60s",
      "conductor_status": "degraded",
      "operations": "queued locally",
      "queuing": true,
      "user_notification": "Connection to shared workspace unstable. Working offline."
    },
    "phase_3_offline": {
      "duration": "60s+",
      "conductor_status": "offline",
      "operations": "queued locally (no limit)",
      "local_agents": "can still execute",
      "shared_agents": "not accessible",
      "user_notification": "Offline mode. Shared workspace unavailable."
    }
  },

  "reconnection": {
    "detection": "orchestrator heartbeat received",
    "action": "flush operation queue",
    "sync": "full state sync",
    "conflict_resolution": "applies automatically",
    "user_notification": "Reconnected to shared workspace. Synced."
  }
}
```

### 13.2 Operation Failure Recovery

```json
{
  "operation_id": "op_2026_03_23_0005",
  "initial_attempt": "2026-03-23T09:30:00Z",
  "status": "failed",
  "error": {
    "type": "lock_timeout",
    "message": "Resource locked by conductor_alice for >5 minutes"
  },
  "retry_strategy": {
    "type": "exponential_backoff",
    "attempts": [
      {
        "attempt": 1,
        "delay_ms": 1000,
        "timestamp": "2026-03-23T09:30:01Z",
        "result": "failed (lock_held)"
      },
      {
        "attempt": 2,
        "delay_ms": 2000,
        "timestamp": "2026-03-23T09:30:03Z",
        "result": "failed (lock_held)"
      },
      {
        "attempt": 3,
        "delay_ms": 4000,
        "timestamp": "2026-03-23T09:30:07Z",
        "result": "failed (lock_held)"
      },
      {
        "attempt": 4,
        "delay_ms": 8000,
        "timestamp": "2026-03-23T09:30:15Z",
        "result": "succeeded"
      }
    ],
    "final_status": "succeeded",
    "final_timestamp": "2026-03-23T09:30:15Z"
  },
  "user_notification": "Your operation was queued due to resource lock. Now processing."
}
```

---

## 14. Security Considerations

### 14.1 Audit Logging

Every collaborative operation is logged:

```json
{
  "audit_log_entry": {
    "event_id": "audit_2026_03_23_0001",
    "timestamp": "2026-03-23T09:30:00Z",
    "event_type": "operation_executed",
    "actor": {
      "user_id": "user_alice",
      "conductor_id": "conductor_alice",
      "agent_id": "agent_research_alice"
    },
    "action": {
      "operation_id": "op_2026_03_23_0005",
      "type": "file_write",
      "resource": "shared_file_design.md",
      "previous_state_hash": "sha256_abc...",
      "new_state_hash": "sha256_def...",
      "diff_size_bytes": 1024
    },
    "access": {
      "source_conductor": "conductor_alice",
      "destination_resource": "shared_file_design.md",
      "permission_check": "passed"
    },
    "result": {
      "status": "succeeded",
      "latency_ms": 234
    },
    "retention": "30 days"
  }
}
```

### 14.2 Sandboxing Shared Agents

Shared agents run in isolated contexts:

```json
{
  "agent_id": "agent_artifact_builder",
  "sandbox": {
    "resource_limits": {
      "max_memory_mb": 512,
      "max_cpu_percent": 50,
      "max_execution_time_seconds": 300,
      "max_file_size_mb": 100
    },
    "capability_restrictions": {
      "can_read_filesystem": true,
      "can_write_filesystem": true,
      "can_execute_code": false,
      "can_access_network": false,
      "can_access_other_agents": false,
      "can_access_external_apis": false
    },
    "data_isolation": {
      "can_access_both_private_scratchpads": false,
      "can_access_shared_scratchpad": true
    }
  },
  "monitoring": {
    "resource_usage_tracked": true,
    "behavior_anomaly_detection": true,
    "abort_on_violation": true
  }
}
```

---

## 15. Implementation Checklist

- [ ] Multi-conductor coexistence without state merging
- [ ] Workspace orchestrator for mediation
- [ ] Conflict detection (write-write, lock, semantic)
- [ ] Automatic conflict resolution (LWW, lock, merge, OT, negotiation)
- [ ] Manual conflict resolution UI
- [ ] Shared scratchpad implementation
- [ ] Private scratchpad implementation
- [ ] Presence tracking and broadcasting
- [ ] In-system collaboration messaging
- [ ] Role-based access control (RBAC)
- [ ] Resource-level permissions
- [ ] Agent execution permissions
- [ ] Audit logging for all operations
- [ ] Network partition detection and recovery
- [ ] Operation queuing during offline mode
- [ ] Full state synchronization on reconnection
- [ ] Agent sandboxing for shared agents
- [ ] Permission elevation request/approval workflow
- [ ] Real-time presence updates
- [ ] Lock management and timeouts
- [ ] Idempotency tokens for operation replay
- [ ] Lamport/vector clocks for causal ordering
- [ ] Compression for large state syncs
- [ ] Benchmarks for concurrent operations

---

## 16. Design Rationale

**Why conductors don't merge**: Each user needs autonomy. A merged conductor would require constant synchronization of goal stacks, active agents, and state. By maintaining separate conductors, each user can work at their own pace while sharing only the workspace orchestrator.

**Why the workspace orchestrator exists**: Without mediation, two independent agents trying to modify the same resource would create chaos. The orchestrator is the single point where conflicts are detected and resolved, ensuring consistency.

**Why shared + private memory both exist**: Some information is genuinely shared (the design document everyone's building), while other information is personal (a user's draft notes, exploration paths, working memory). The system respects this distinction.

**Why multiple conflict resolution strategies**: Different types of conflicts benefit from different strategies. A lock works for critical sections. LWW works for telemetry. Merge works for documents. Agent negotiation works for semantic conflicts.

**Why presence is built-in**: Awareness of what others are doing prevents redundant work and enables coordination without explicit communication. Real-time presence is a primitive, not an add-on.

---

## 17. Relationship to Other Documents

- **Document 1 (Core Model)**: Collaboration extends the basic agent hierarchy
- **Document 2 (Agent Anatomy)**: Individual agents remain as described; shared agents follow same anatomy
- **Document 5 (Memory/Scratchpad)**: Extends to support shared and private scratchpads
- **Document 6 (Goals/Plans)**: Goal stacks remain conductor-local; orchestrator coordinates at workspace level
- **Document 13 (Security)**: Extends with collaboration-specific audit logging and sandboxing

---

## Document 21 Complete

This document specifies how the OS transforms from single-user to naturally collaborative, making multi-user work a core primitive rather than a bolted-on feature.

**Key Takeaway**: *Two users, one workspace, two independent conductors, one shared orchestrator. Autonomy + coordination = collaboration as architecture.*
