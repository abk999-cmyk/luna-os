# Document 20: Security and Sandboxing Model

**Status:** Design specification for LLM-native OS implementation
**Version:** 1.0
**Last Updated:** 2026-03-23

---

## Overview

An LLM-native operating system faces unique security challenges: agents create executable actions dynamically, memory systems can be manipulated, and permission semantics differ from traditional OSs. This document specifies a security architecture that:

- Provides three configurable permission modes for user control
- Sandboxes dynamically created actions and LLM-generated applications
- Isolates data between workspaces while enabling controlled cross-workspace flows
- Implements comprehensive audit logging and undo capabilities
- Defends against adversarial agent behavior and resource exhaustion

Security in an LLM-native OS is not about preventing all unsafe actions (the user can override), but about **debuggability, auditability, and preventing accidental damage through sandboxing and logging**.

---

## Part 1: Permission Modes

The OS offers three configurable permission modes, selectable at runtime and changeable at any time. These govern when the OS prompts the user before executing sensitive operations.

### 1.1 Supervised Mode

**Default for new users. Most protective.**

**Behavior:**
- OS prompts user confirmation before executing any "significant action"
- User sees what is about to happen: the action, its arguments, affected resources
- User can approve, reject, or modify parameters before execution
- All significant actions are logged with user decision
- Suitable for: exploration, learning, high-sensitivity workflows

**Significant Actions Triggering Prompts:**
- Creating, modifying, or deleting agents
- Creating, modifying, or deleting actions
- Accessing or modifying workspaces or data isolation boundaries
- Writing to persistent storage (filesystem, databases)
- Making network requests (reading or writing)
- Accessing user credentials or sensitive data
- Modifying permissions, audit logs, or security settings
- Allocating resources above baseline thresholds
- Cross-workspace data flows

**Non-Significant Actions (No Prompt):**
- Reading from memory or scratchpad
- Computing within allocated resources
- Querying system state (logs, permissions)
- Internal state transitions

**User Experience:**
```
Agent "research" requests:
  Action: write_file
  Path: /workspaces/project-a/report.md
  Size: ~2.4 MB

Do you approve? [YES / NO / MODIFY]
```

### 1.2 Autonomous Mode

**For trusted workflows and power users.**

**Behavior:**
- OS executes all actions without prompting
- Every action is logged in detail (who, what, when, where, why)
- Undo becomes critical: users rely on rollback to recover from mistakes
- Audit trail supports forensic recovery
- Suitable for: mature workflows, scripted tasks, agents with proven track records

**Requirements for Safe Autonomous Mode:**
- Strong undo/rollback system (Part 4: Undo Architecture)
- Real-time audit logging with queryable interface
- Resource limits strictly enforced (Part 6)
- Workspace isolation still active (Part 2: Data Isolation)
- User regularly reviews audit logs

**User Experience:**
```
Agent "research" executed:
  Action: write_file
  Path: /workspaces/project-a/report.md
  Size: 2.4 MB
  Timestamp: 2026-03-23 14:37:22
  Audit ID: audit_8a7f2c9e

Recent actions logged. Undo window: 24 hours.
```

### 1.3 Custom Mode

**Fine-grained per-action-type rules.**

**Behavior:**
- User defines rules: "Prompt on network writes, but not file reads"
- Rules can reference: action type, agent, workspace, resource size, time of day
- Defaults to Supervised for undefined action types
- Rules edited via policy file or UI builder
- Suitable for: custom security postures, compliance requirements

**Policy File Structure:**
```yaml
permissions:
  rules:
    - action_type: write_file
      prompt: true
      max_size_mb: 100

    - action_type: read_file
      prompt: false

    - action_type: network_request
      prompt: true
      allowed_domains:
        - api.example.com
        - internal.company.net

    - action_type: create_agent
      prompt: true
      allowed_creators:
        - agent_id: "trusted-supervisor"
        - user: true

    - action_type: modify_action
      prompt: false
      allowed_agents:
        - "agent-a"
      restrictions:
        - cannot_modify_sandbox_config
        - cannot_bypass_limits

enforcement:
  default_mode: supervised
  timeout_on_prompt: 300s  # 5 minutes, then deny
  log_level: detailed
```

### 1.4 Permission Bypass

**User Discretion Always Available**

**Principle:** The user can always override the permission system. This is intentional.

**Mechanism:**
```
Supervised mode prompt:

  Action: delete_workspace /workspaces/archive

Do you approve? [YES / NO / MODIFY]
Advanced: [OVERRIDE PERMISSIONS] [VIEW DETAILS]
```

**Override Semantics:**
- User explicitly selects "bypass permissions for this action"
- Action executes immediately without further safeguards
- **Extra-detailed audit logging** of the bypass (who, when, why signal, action)
- Sandbox still applies (security isolation, not gating)
- Undo still available in autonomous/override mode
- OS logs override with elevated alert status

**Rationale:** Users own their data and workflows. Permission systems prevent accidents and misunderstandings, not determined attacks. If user wants to proceed, OS cooperates and logs everything for recovery.

---

## Part 2: Data Isolation Between Workspaces

Workspaces are the OS's primary isolation boundary. Data isolation prevents accidental cross-workspace contamination and enables multi-tenant or multi-project scenarios.

### 2.1 Workspace Architecture

**Structure:**
```
/workspaces/
├── project-alpha/
│   ├── data/
│   ├── agents/
│   ├── actions/
│   ├── memory/
│   └── audit.log
├── project-beta/
│   ├── data/
│   ├── agents/
│   ├── actions/
│   ├── memory/
│   └── audit.log
└── shared/  (optional, explicit cross-workspace container)
    ├── templates/
    └── libraries/
```

**Isolation Properties:**
- Each workspace has isolated storage: agents cannot read/write other workspaces' data by default
- Each workspace has isolated memory: scratchpad and state are per-workspace
- Each workspace has isolated agents: agents live in workspaces, cannot migrate
- Each workspace has independent audit logs
- Workspaces can have different security settings

### 2.2 Cross-Workspace Data Flows

**Explicit and Logged**

When an agent or action needs to access data from another workspace:

**1. Explicit Request:**
```python
# Agent in workspace-a requests data from workspace-b
conductor.read_across_workspace(
    source_workspace="workspace-b",
    source_path="/data/results.json",
    requesting_workspace="workspace-a",
    reason="aggregate_analysis"
)
```

**2. Conductor Handling:**
- Conductor receives request
- Checks permissions: does workspace-a have read access to workspace-b?
- If Supervised mode: prompts user with source/destination/size
- If Autonomous mode: logs and executes
- Audit log in both workspaces: who accessed what, when, why

**3. Audit Trail:**
```
Workspace-a audit.log:
  [2026-03-23 14:22:05] CROSS_WORKSPACE_READ
    Target: workspace-b:/data/results.json
    Size: 412 KB
    Initiator: agent_research_01
    Purpose: aggregate_analysis
    Status: APPROVED
    Timestamp: 2026-03-23 14:22:05.341

Workspace-b audit.log:
  [2026-03-23 14:22:05] CROSS_WORKSPACE_ACCESSED
    Source: workspace-a
    Initiator: agent_research_01
    Resource: /data/results.json
    Operation: READ
    Status: COMPLETED
```

**4. Default Policy:**
- Workspaces are isolated by default: no cross-workspace access without explicit permission
- User can grant workspace-to-workspace permissions via settings
- Shared workspace: explicit opt-in container for shared data
- Data transferred via Conductor, never direct agent-to-agent access

### 2.3 Workspace Security Boundaries

**Per-Workspace Settings:**

```yaml
workspace: project-alpha
security:
  isolation_level: strict

  # Which workspaces can this one read/write?
  cross_workspace_access:
    read: []  # isolated
    write: []

  # Can external data enter this workspace?
  external_data:
    allow_import: true
    sources_whitelist: null  # all

  # Can data exit this workspace?
  external_data:
    allow_export: true
    destinations_whitelist: null

  # Agents in this workspace
  agent_permissions:
    can_create_new_agents: true
    can_modify_actions: true
    can_access_filesystem: true

  # Audit
  audit_retention_days: 365
  audit_immutable: true
```

**Isolation Levels:**
- **strict**: No cross-workspace access; no external import/export without prompt
- **standard**: Cross-workspace access requires explicit configuration; external data allowed
- **open**: Minimal restrictions; suitable for trusted, non-sensitive workflows

---

## Part 3: Sandboxing Dynamic Actions and LLM-Generated Apps

### 3.1 The Sandboxing Imperative

Unlike traditional OSs, an LLM-native OS allows agents to **create executable actions at runtime**. These dynamically created actions are not pre-vetted code; they could be:

- Syntactically malformed
- Logically broken (infinite loops, memory leaks)
- Resource-greedy (requesting GB of memory)
- Accidentally destructive (delete loops)
- Security-exploitative (trying to escape sandbox)

**Sandboxing is not about permission gating**—users can bypass permissions. Instead, sandboxing is about:

1. **Containment**: Broken actions cannot crash the OS or affect other agents
2. **Debuggability**: If something breaks, logs show exactly which action caused it
3. **Resource Control**: Prevent runaway processes from exhausting shared resources
4. **Forensic Recovery**: Full trace of what executed, with undo support

### 3.2 Sandbox Architecture

**Three Categories of Actions:**

#### A. Core OS Actions

**Definition:** Actions built into the OS or provided by Anthropic (verified, tested, trusted).

**Examples:**
- `read_file`, `write_file`, `list_directory`
- `create_agent`, `delete_agent`
- `query_memory`, `update_memory`
- `network_request` (built-in, safe)

**Sandbox Status:** No sandbox. Core actions execute directly with full access to their resources.

**Trust Model:** Anthropic maintains core actions; bugs are Anthropic's responsibility.

#### B. Dynamically Created Actions

**Definition:** Actions created by agents or users at runtime, implemented in the action language (e.g., Python, YAML rule engine).

**Example:**
```python
# Agent creates a new action at runtime
new_action = {
    "name": "analyze_sentiment",
    "type": "python",
    "code": """
import some_nlp_library
def run(text):
    return some_nlp_library.sentiment(text)
""",
    "inputs": ["text"],
    "outputs": ["sentiment_score"]
}
os.create_action(new_action)
```

**Sandbox Status:** Sandboxed. Action runs in restricted environment.

**Validation on Creation:**
1. Schema validation: is the action definition well-formed?
2. Type checking: do inputs/outputs match declared types?
3. Dependency checking: does it require unavailable libraries?
4. Size checking: code too large? (suspicious)
5. If validation fails, action is rejected with clear error

**Execution Sandbox:**
- Memory limit: 256 MB per action (configurable)
- CPU time limit: 30 seconds per invocation (configurable)
- Network access: no direct network calls; must use `network_request` OS action
- Filesystem access: sandboxed directory only (can't access parent workspace or other workspaces)
- Subprocess spawning: not allowed
- Import restrictions: only allowlisted libraries (data science, NLP, utils; not arbitrary packages)
- Audit: every invocation logged with inputs, outputs, resource usage, duration

**Logs:**
```
Action: analyze_sentiment (dynamically created)
Invocation ID: inv_7f8e2d1c

Input: text = "This is great!"
Output: sentiment_score = 0.87
Execution Time: 125 ms
Memory Used: 12 MB
Resource Limits Hit: None

Log Timestamp: 2026-03-23 14:25:33.521
Action Source: agent_nlp_01
```

#### C. LLM-Generated Applications

**Definition:** Multi-step applications generated by agents, combining multiple actions, control flow, state.

**Example:**
```yaml
app: report_generator
steps:
  - name: collect_data
    action: read_file
    args:
      path: ./data.json

  - name: analyze
    action: analyze_sentiment
    inputs:
      - from: collect_data
        field: text_data

  - name: generate_report
    action: create_file
    args:
      path: ./report.md
      content: |
        Analysis Results
        ================
        {{ analyze.results }}
```

**Sandbox Status:** Sandboxed.

**Validation on Creation:**
1. Step validation: does each step reference a valid action?
2. Input/output validation: do step outputs match step inputs?
3. Cycle detection: is there circular data flow?
4. Size limits: total size of app reasonable?
5. Timeout calculation: estimated runtime feasible?

**Execution Sandbox:**
- Each step executes in its own sandbox if the step action is dynamic
- Core OS actions within the app can execute normally
- Memory accumulates across steps (app memory budget: 512 MB total)
- Total execution timeout: 5 minutes per app invocation
- Network budget: max 10 outbound requests per app invocation
- Audit trail captures entire app execution, breakable down to individual steps

### 3.3 Sandbox Violation Handling

**When Sandbox Limits Breached:**

```
Action: analyze_large_dataset (dynamic)
Status: RESOURCE_LIMIT_EXCEEDED

Memory Limit: 256 MB
Memory Used: 287 MB (at 2.41 minutes)

Automatic Action:
1. Execution halted
2. Partial results (if any) returned
3. State rolled back to pre-execution
4. Agent notified: "Action exceeded memory limit"
5. Audit logged: who created action, when, what went wrong

Recovery Options:
- Increase memory limit via permissions (supervised prompt)
- Optimize action code (agent redesigns)
- Split into smaller actions
- Use streaming/batching instead of loading all data
```

**When Validation Fails:**

```
Action Creation Request: parse_json
Code Validation: FAILED

Reason: Action imports 'subprocess' module
Status: REJECTED

Error Message:
  "The 'subprocess' module is not allowlisted for sandboxed actions.
   If you need shell execution, file a request to the OS developers.
   Current allowlist: [stdlib, numpy, pandas, nltk, requests]"

No action created. Execution never attempted.
```

---

## Part 4: Agent Permission Boundaries

### 4.1 What Can Agents Do?

**Default Agent Capabilities (Supervised Mode):**

```yaml
agent: agent_01
permissions:
  actions:
    create_new_actions: true
    modify_existing_actions:
      own_actions_only: true
      core_actions: false

  memory:
    read_own_memory: true
    read_workspace_shared: true
    read_other_agents: false
    write_own_memory: true
    write_shared: false

  agents:
    create_agents: true
    delete_agents:
      own_agents_only: true
    modify_agent_permissions: false

  workspaces:
    read_own_workspace: true
    read_other_workspaces: false
    write_own_workspace: true
    write_other_workspaces: false

  resources:
    memory_limit_mb: 512
    cpu_time_limit_seconds: 300
    concurrent_actions: 5
    storage_quota_mb: 1000

  external:
    network_access: true  # via network_request action
    allowed_domains: null  # all
    external_imports: false
```

### 4.2 Agent-Created Agent Chains

**Scenario:** Agent A creates Agent B, which creates Agent C.

**Permission Cascade:**
- Agent A inherits permissions from its parent (user or agent)
- Agent B (created by A) inherits restricted permissions:
  - Cannot exceed A's resource limits
  - Cannot perform actions A cannot perform
  - Cannot access workspaces A cannot access
- Agent C further restricted by B
- **Max nesting depth:** 5 levels (configurable)

**Example:**
```
User (unrestricted)
  └─ Agent-supervisor
       Resource limit: 2 GB memory, 10 minutes
       Can create agents: yes
       └─ Agent-researcher
            Resource limit: 512 MB (parent's limit / 4)
            Can create agents: no
            └─ (cannot create further agents)
```

**Audit Trail Shows Chain:**
```
Agent-researcher executed action X
Parent chain: User > Agent-supervisor > Agent-researcher
Effective permissions: intersection of all parents
```

### 4.3 Agent Isolation

**Agents Cannot:**
- Directly access other agents' memory
- Directly invoke other agents' actions
- Modify other agents' code or permissions
- Escape their workspace
- Spawn OS-level processes
- Modify sandbox configuration
- Disable audit logging

**Agents Can:**
- Request cross-agent communication via Conductor (logged, controlled)
- Create new agents (subject to permissions)
- Create new actions (sandboxed)
- Read shared workspace data (if permitted)
- Invoke any action they have permission to invoke

---

## Part 5: Audit Logging and Compliance

### 5.1 What Gets Logged

**Comprehensive Audit Trail:**

```
Event Type | Trigger | Logged Data
-----------|---------|-------------
Action Execution | Every invocation | action_id, agent_id, inputs, outputs, duration, resource_usage, status
Action Creation | create_action() | action_name, creator, code_summary, dependencies, sandbox_config
Action Modification | modify_action() | action_id, modifier, changes, timestamp
Agent Creation | create_agent() | agent_id, parent, initial_permissions, workspace
Agent Permission Change | permission update | agent_id, old_perms, new_perms, approver
Memory Access | read/write | agent_id, memory_address, operation, timestamp
Workspace Access | cross-workspace op | source_ws, target_ws, operation, agent_id, user_decision
File I/O | read/write file | path, size, agent_id, workspace
Network Request | outbound HTTP | url, method, headers (no data), response_code, duration
Permission Decision | user choice | action, decision (approve/deny/modify), user_id, timestamp
Undo Operation | rollback | what_undone, undo_id, timestamp, affected_resources
Security Event | violations, bypasses | event_type, agent_id, severity, details
```

### 5.2 Audit Log Structure

**File Location:**
```
/workspaces/{workspace_id}/audit.log
/workspaces/{workspace_id}/audit/  (separate files per day or per agent)
```

**Format (JSON Lines for easy parsing):**
```json
{
  "timestamp": "2026-03-23T14:22:05.341Z",
  "audit_id": "audit_8a7f2c9e",
  "event_type": "action_execution",
  "agent_id": "agent_research_01",
  "action_id": "analyze_sentiment",
  "action_type": "dynamic",
  "inputs": {
    "text": "[256 byte string, not logged in full]"
  },
  "outputs": {
    "sentiment_score": 0.87
  },
  "execution_time_ms": 125,
  "memory_used_mb": 12,
  "resource_limits": {
    "memory_limit_mb": 256,
    "cpu_time_limit_s": 30
  },
  "sandbox_status": "executed_normally",
  "permission_mode": "autonomous",
  "workspace_id": "workspace-a",
  "created_by": "agent_nlp_01"
}
```

### 5.3 Log Immutability and Retention

**Immutability:**
- Audit logs cannot be deleted or modified after creation
- Immutability enforced at storage layer (append-only)
- User can deny future logging (not backward-erase history)

**Retention:**
- Default: 1 year
- Configurable per workspace
- Legal holds prevent deletion even after retention expires
- Archive to external storage for long-term compliance

**Access Control:**
- User can read their own workspace's audit logs
- Agents cannot modify audit logs
- User can export/download audit logs for analysis
- Cross-workspace audit data available only to workspaces with permission

### 5.4 Querying Audit Logs

**Interactive Query Interface:**
```python
# Search for all actions by agent_research_01
logs.query(agent_id="agent_research_01")

# Find all file writes in the past 24 hours
logs.query(event_type="file_io", operation="write", since_hours=24)

# Find all permission bypasses
logs.query(event_type="security_event", severity="high")

# Find all network requests to a specific domain
logs.query(event_type="network_request", url_pattern="api.example.com")

# Get action execution stats
logs.stats(group_by="action_id", metric="avg_execution_time_ms")
```

---

## Part 6: Undo Architecture and Autonomous Mode Safety

### 6.1 Why Undo is Critical for Autonomous Mode

In Autonomous mode, the OS executes actions without prompting. If an action is broken or has unintended side effects, the user needs a way to reverse it. Undo is not optional; it's a core safety mechanism.

### 6.2 Undo Scope and Mechanics

**Undoable Operations:**

```
✓ File I/O: write, delete, modify
✓ Memory changes: updates, deletes
✓ Agent creation/deletion
✓ Action creation/modification
✓ Workspace modifications
✗ Network requests (side effects external to OS)
✗ External API calls (can undo local state, not remote effects)
```

**Undo Mechanics:**

1. **Capture State:**
   - Before significant action, OS captures relevant state (files, memory, workspace config)
   - Capture is fast: copy-on-write or journaling, not full snapshots
   - Stored in undo buffer per workspace

2. **Execution:**
   - Action executes normally
   - All changes recorded (delta log)
   - Audit logged with undo_id

3. **User Initiates Undo:**
   ```python
   os.undo(undo_id="audit_8a7f2c9e")
   # or
   os.undo(last_n_actions=3)
   ```

4. **Rollback:**
   - OS applies stored state to reverse changes
   - File deletions: restore from trash
   - Memory updates: revert to captured state
   - Agent creation: remove newly created agent
   - Agent deletion: restore agent (if within undo window)
   - Audit log: records undo operation with timestamp

**Undo Window:**
- Default: 24 hours
- Configurable per workspace
- Beyond undo window: actions cannot be undone (requires explicit deletion/modification after)
- Undo data kept in fast storage (not archived)

### 6.3 Undo Limitations and Edge Cases

**Network Requests:**
```python
# Agent makes network request:
response = network_request(url="https://api.example.com/delete-record", method="DELETE")

# User wants to undo
os.undo(audit_id="...")

# Result:
# - Local state reversed (e.g., response saved to memory is deleted)
# - CANNOT undo the DELETE request sent to external API
# - OS displays warning: "This action made external network calls that cannot be undone"
```

**Cascade Undos:**
```
Action A writes file X
Agent reads file X, stores in memory Y
Action B uses memory Y to compute result Z
User undoes action A

Result:
- File X restored
- Memory Y still contains old value from action A
- Agent unaware that source data changed
- May lead to downstream errors

Mitigation: OS notifies agents of undo, suggests cache invalidation
```

**Concurrent Undo:**
```
Timeline:
  T1: Action A (file write)
  T2: Action B (memory update, depends on A's side effects)
  T3: User undoes action A

Behavior:
  - File reverted
  - B's memory changes NOT automatically undone (independent action)
  - Potential inconsistency
  - Audit log marks the inconsistency
  - Agent may need manual intervention

Mitigation: Offer "undo and dependent actions" option
```

### 6.4 Undo UX and Defaults

**Simple Case:**
```
Action: write_file /workspace/report.md
Status: Completed, 2.4 MB written

Recent Undo Window:
  [Undo This Action] [Keep It]

Actions you can still undo (within 24-hour window):
  - analyze_sentiment (3 minutes ago)
  - write_file (2 minutes ago) ← Most recent
  - read_large_dataset (1 minute ago)
```

**Complex Case (Cascading Dependencies):**
```
Undo Action: write_file /workspace/report.md
Audit ID: audit_8a7f2c9e

This action's side effects:
  - File written (can undo)
  - Memory updated by Agent-B (independent)
  - Network request made to log service (external, cannot undo)

Options:
  [Undo Just This] [Undo + Notify Agents] [Undo + Clear Caches]

Recommendation: "Undo Just This" - Agent-B can re-run if needed
```

---

## Part 7: Sandbox Escapes and Adversarial Scenarios

### 7.1 Threat Model for LLM-Native OS

**Attacker Model:** An agent or dynamically created action that is:
- Intentionally malicious (unlikely, but possible)
- Broken but aggressive (infinite loops, resource hogging)
- Exploitative (trying to break out of sandbox)
- Deceptive (hiding malicious intent in benign-looking code)

**Attacker Goals:**
1. Access data from other workspaces
2. Execute code outside sandbox
3. Crash the OS or other agents
4. Exhaust resources (DoS)
5. Disable audit logging
6. Trigger undo to cover tracks

### 7.2 Specific Adversarial Scenarios and Mitigations

#### Scenario A: Infinite Loop in Sandboxed Action

**Attack:**
```python
def run(data):
    while True:
        process(data)
        # Never terminates, burns CPU time
```

**Defenses:**
1. **CPU time limit:** Action halted after 30 seconds (configurable)
2. **Audit alert:** Timeout logged with HIGH severity
3. **Agent notification:** Agent receives error, can handle gracefully or re-attempt
4. **Resource recovery:** OS continues normally, other actions unaffected

**Outcome:** Attack fails. Action halted cleanly. Logged and recoverable.

---

#### Scenario B: Memory Exhaustion

**Attack:**
```python
def run(data):
    big_list = []
    while True:
        big_list.append("x" * 1_000_000)  # Allocate 1 MB per iteration
```

**Defenses:**
1. **Memory limit:** Action capped at 256 MB (configurable)
2. **OS-level enforcement:** Kernel/runtime prevents allocation beyond limit
3. **Graceful termination:** Out-of-memory error returned to agent
4. **Audit alert:** Logged with HIGH severity
5. **Workspace isolation:** Other agents' memory unaffected

**Outcome:** Attack fails. Memory-limited action terminated. Workspace stable.

---

#### Scenario C: Breakout Attempt via Subprocess

**Attack:**
```python
import subprocess
subprocess.run(["bash", "-c", "rm -rf /"])
```

**Defenses:**
1. **Import restrictions:** `subprocess` module not in allowlist
2. **Import validation:** Code analysis (static) rejects disallowed imports
3. **Action creation fails:** Error returned, no action created

**If somehow imported:**
1. **Runtime restriction:** Subprocess spawn syscalls blocked by sandbox
2. **Error on subprocess call:** Execution fails gracefully
3. **Audit alert:** Attempted jailbreak attempt logged

**Outcome:** Attack fails at multiple layers. Logged for forensics.

---

#### Scenario D: Accessing Other Workspace's Data

**Attack:**
```python
# Agent in workspace-a tries to read workspace-b's data
with open("/workspaces/workspace-b/data/secret.json") as f:
    return f.read()
```

**Defenses:**
1. **Filesystem sandboxing:** Sandbox environment can only see workspace-a's directory
2. **Path traversal blocking:** `../../workspace-b` paths cannot resolve outside sandbox
3. **Chroot or containerization:** Actual OS-level file restriction
4. **Access denied:** File not found or permission error
5. **Audit alert:** Attempted cross-workspace access logged, no success

**Outcome:** Attack fails. Isolated filesystem prevents access.

---

#### Scenario E: Disabling Audit Logging

**Attack:**
```python
import os
os.remove("/workspaces/workspace-a/audit.log")
```

**Defenses:**
1. **File immutability:** audit.log is immutable (append-only) at storage layer
2. **Permission denial:** Even root (if agent could run as root) cannot delete
3. **Attempted deletion logged:** Attempt recorded before it can succeed
4. **Audit corruption detection:** If somehow partially modified, checksums reveal tampering

**Outcome:** Attack fails. Audit trail protected. Attempt logged.

---

#### Scenario F: Rogue Agent Spawns Expensive Child Agent

**Attack:**
```python
# Agent-A (resource-limited) creates Agent-B (tries to bypass limits)
os.create_agent({
    "name": "expensive_agent",
    "memory_limit": "999 GB",  # Try to exceed workspace quota
    "cpu_time_limit": "999 hours"
})
```

**Defenses:**
1. **Permission cascade:** Agent-B cannot exceed parent (Agent-A) limits
2. **Workspace quota:** Total agents in workspace cannot exceed workspace resource limit
3. **Validation on creation:** OS checks requested limits against parent and workspace
4. **Request rejected:** Agent creation denied with clear error
5. **Audit alert:** Attempted resource escalation logged

**Outcome:** Attack fails. Limits enforced hierarchically.

---

#### Scenario G: Two Agents Fighting Over Shared State

**Attack:**
Agent-A and Agent-B both try to modify shared workspace data simultaneously.

**Defense:**
1. **Locking:** Shared memory access serialized (one agent at a time)
2. **Conflict resolution:** First writer wins; second gets error
3. **Retry mechanism:** Second agent notified, can retry
4. **Audit trail:** Both agents' attempts logged with timing

**Outcome:** Conflict detected and logged. Both agents can see what happened. Retry semantics clear.

---

#### Scenario H: Memory System Poisoning

**Attack:**
Agent-A deliberately stores false data in shared memory (e.g., previous analysis results).

```python
# Agent-A corrupts shared memory
memory.write("analysis_results", {"sentiment": "negative"}, overwrite=True)
# Later, Agent-B blindly trusts this data
```

**Defenses:**
1. **Versioning:** Memory writes include timestamp, version number
2. **Audit trail:** All memory writes logged with author, content hash
3. **Notification:** When memory is overwritten, agents can log observers are notified
4. **Validation:** Agents can request audit trail of memory updates
5. **Undo:** False data can be undone if caught within undo window

**Outcome:** Not prevented (agents can write data), but fully auditable. Agents responsible for validating data sources. Recoverable via undo.

---

### 7.3 Defense-in-Depth Summary

```
Layer 1: Validation at Creation
  - Schema validation
  - Dependency checking
  - Static code analysis (imports, disallowed operations)

Layer 2: Sandbox Enforcement at Execution
  - Resource limits (memory, CPU, network)
  - Filesystem isolation
  - Subprocess prevention
  - Import restrictions

Layer 3: Audit and Logging
  - All actions logged with full context
  - Immutable audit trail
  - Queryable history for forensics

Layer 4: Undo and Recovery
  - State snapshots for significant operations
  - Rollback capability within time window
  - Explicit undo semantics

Layer 5: User Control
  - Permission modes (Supervised, Autonomous, Custom)
  - Workspace isolation
  - Permission bypass with logging
  - Ability to adjust limits, disable agents, etc.
```

---

## Part 8: Resource Limits and Quotas

### 8.1 Resource Hierarchy

```
OS-Level Resources (System)
├── Workspace-Level Quotas
│   ├── Agent-Level Limits
│   │   ├── Action-Level Limits
```

**System Defaults:**
```yaml
system:
  max_memory_gb: 64
  max_cpu_cores: 8
  max_workspaces: 100
  max_agents_total: 1000

workspace_defaults:
  memory_quota_mb: 2048
  agent_quota: 20
  storage_quota_gb: 10
  concurrent_actions: 10
  action_creation_limit: 500

agent_defaults:
  memory_limit_mb: 512
  cpu_time_limit_seconds: 300
  storage_quota_mb: 1000
  concurrent_actions: 5
  action_creation_limit: 50
  max_child_agents: 10

action_defaults:
  memory_limit_mb: 256
  cpu_time_limit_seconds: 30
  max_input_size_mb: 100
  max_output_size_mb: 100
```

### 8.2 Quota Enforcement

**Memory Allocation:**
```python
# Agent tries to allocate more than its limit
agent.memory_limit = 512 MB
agent.allocate_memory(600 MB)
# Result: ERROR - Allocation denied. Only 512 MB available.

# Within action execution
action_memory_limit = 256 MB
action.allocate(300 MB)
# Result: Out-of-memory error. Action halted. State rolled back.
```

**CPU Time:**
```python
# Agent-supervised action running
start_time = now
while True:
    process_step()
    elapsed = now - start_time
    if elapsed > action_cpu_limit:
        raise TimeoutError("CPU time exceeded")
```

**Network Quota:**
```
Agent-A in a 1-hour window:
  - Max outbound requests: 100
  - Max data transferred out: 500 MB
  - Max concurrent connections: 10

Request #101 in the hour:
  Status: QUOTA_EXCEEDED
  Error: "Network request quota exhausted. 0 requests remaining this hour."
  Retry: Next quota window (after 1 hour)
```

### 8.3 Quota Adjustment

**User can adjust quotas:**

```yaml
workspace:
  id: workspace-a

  # Increase memory quota for this workspace
  memory_quota_mb: 4096  # was 2048

  # Increase agent quota
  agent_quota: 50  # was 20

  # Increase storage
  storage_quota_gb: 20  # was 10

  # Per-agent overrides
  agents:
    agent_research_01:
      memory_limit_mb: 1024  # increased
      action_creation_limit: 200  # increased
```

**Adjustment prompts in Supervised mode:**
```
Agent-A requests memory increase:
  Current limit: 512 MB
  Requested: 1024 MB
  Workspace available: 1500 MB

Approve? [YES / NO / SET CUSTOM LIMIT]
```

---

## Part 9: Network Access Controls

### 9.1 Network Action (Core OS)

**Network requests go through built-in `network_request` action:**

```python
# Agent cannot make raw HTTP calls; must use OS action
response = os.network_request(
    url="https://api.example.com/data",
    method="GET",
    headers={"Authorization": "Bearer ..."},  # User must provide
    timeout=30
)
```

**Network Action Restrictions:**
- No arbitrary library usage (e.g., cannot `import requests` directly)
- Must go through OS action
- OS logs every request (URL, method, response code, duration)
- User can review in audit logs
- Permissions can restrict to allowlisted domains

### 9.2 Domain Allowlisting

**Per-workspace or per-agent:**

```yaml
agent: agent_research_01
network:
  access_type: allowlist
  allowed_domains:
    - api.example.com
    - data.internal.company.net
    - "*.openai.com"
  denied_domains:
    - localhost
    - "127.*"
    - internal-secrets.company.net
```

**Default:** No restrictions (any domain, user's responsibility to audit).

### 9.3 Network Data Logging

**Audit log includes:**
```json
{
  "event_type": "network_request",
  "agent_id": "agent_research_01",
  "url": "https://api.example.com/search",
  "method": "GET",
  "request_headers": {
    "Content-Type": "application/json"
    // NOT logging Authorization, API keys, etc. (redacted)
  },
  "request_body_size": 1024,
  "response_code": 200,
  "response_headers": {
    "Content-Type": "application/json"
    // NOT logging sensitive response headers
  },
  "response_body_size": 8192,
  "duration_ms": 245,
  "timestamp": "2026-03-23T14:25:33.521Z"
}
```

**Sensitive Data Handling:**
- Authorization headers redacted before logging
- API keys and tokens not logged
- Response bodies not logged (only size and status)
- User can view response if needed (separate audit query)

---

## Part 10: Trust Hierarchy and Privilege Levels

### 10.1 Trust Levels

```
Level 1: Core OS Actions (Anthropic-Maintained)
  - read_file, write_file, network_request, etc.
  - No sandbox, full access
  - Bugs are Anthropic's responsibility
  - Updates provided by Anthropic

Level 2: Certified Actions (Community / Third-Party)
  - Actions vetted by Anthropic or trusted community
  - Sandboxed, but with higher trust
  - Can have broader resource access than Level 3
  - Signed/checksummed for integrity

Level 3: Dynamically Created Actions (User / Agent)
  - Created at runtime, not pre-vetted
  - Fully sandboxed
  - Resource limits strictly enforced
  - Default trust level: UNTRUSTED until proven

Level 4: User Overrides (Explicit Permission)
  - User explicitly bypasses sandbox for specific action
  - Still audited, logged at elevated alert level
  - Undo still available
  - Extra responsibility on user
```

### 10.2 Action Signing and Integrity

**Core and Certified Actions can be signed:**

```
Action: analyze_sentiment.action
Signature: -----BEGIN SIGNATURE-----
           MIIEpAIBAAKCAQEA5...[crypto signature]...
           -----END SIGNATURE-----
Signer: Anthropic
Cert Valid Until: 2026-12-31
Integrity: Verified ✓
```

**Dynamically created actions are NOT signed** (by definition, just created). Trust is implicit in the creating agent.

---

## Part 11: Threat Scenarios and Response Procedures

### 11.1 Suspected Compromised Agent

**Detection:**
- User notices agent behavior is strange
- Audit logs show unexpected actions
- Resource usage spike
- Repeated permission denials

**Response Procedure:**
```
1. Isolate Agent:
   os.disable_agent("agent_research_01")
   # Agent cannot execute new actions; existing ones not affected

2. Review Audit Trail:
   logs.query(agent_id="agent_research_01", event_type="action_execution")
   # Last 100 actions

3. Identify Malicious Action (if any):
   logs.query(agent_id="agent_research_01", sandbox_status="resource_exceeded")
   # Find the breaking point

4. Rollback (if necessary):
   os.undo(agent_id="agent_research_01", last_n_actions=10)
   # Undo last 10 actions by this agent

5. Investigate:
   - Review agent code and memory
   - Check who/what created it
   - Trace parent agent chain

6. Remediate:
   - Delete agent if malicious
   - Restore from backup if necessary
   - Update permissions for creating agent
```

### 11.2 Workspace Under Attack

**Detection:**
- Rapid resource exhaustion
- Suspicious cross-workspace access attempts
- Multiple permission denials
- Audit log flooding

**Response:**
```
1. Lock Workspace:
   os.lock_workspace("workspace-a")
   # No new actions execute; existing state preserved

2. Preserve Evidence:
   os.export_audit_logs("workspace-a", destination="/secure/backup")
   # Copy all logs for forensic analysis

3. Identify Attack Vector:
   logs.query(event_type="security_event", severity="high")
   # Find all security alerts in past 1 hour

4. Kill Offending Agent:
   os.delete_agent("agent_suspicious")
   # Remove source of attack

5. Restore:
   os.restore_workspace("workspace-a", from_backup="backup_timestamp")
   # Revert workspace to clean state
```

---

## Part 12: Security Compliance and Audit Trail Use Cases

### 12.1 Compliance Requirements

**Common regulatory requirements supported:**
- GDPR: Data deletion, audit trails, consent logging
- HIPAA: Audit logs, access controls, encryption
- SOC 2: Logging, access control, security monitoring
- CCPA: Data lineage, deletion verification

**Audit trail supports:**
- "Who accessed what data and when?"
- "Can we prove we deleted this data?"
- "What actions did this agent perform?"
- "What was the user's intent when approving this action?"

### 12.2 Forensic Queries

**Scenario: Investigate a data breach**

```python
# Find all data exports from the past 30 days
logs.query(
    event_type="action_execution",
    action_id="write_file",
    path_pattern="*export*",
    since_days=30
)

# For each export, find who initiated it and approved it
for log in results:
    agent = log["agent_id"]
    approve_log = logs.query(
        event_type="permission_decision",
        action="write_file",
        timestamp_after=log["timestamp"] - 60s,
        timestamp_before=log["timestamp"]
    )
    print(f"{log['path']} - Initiated by {agent}, Approved by {approve_log['user_id']}")
```

### 12.3 Export and Reporting

**User can export audit logs for analysis:**

```python
# Export all logs for a workspace
logs.export(
    workspace="workspace-a",
    format="csv",  # or json, parquet
    since_date="2026-01-01",
    until_date="2026-03-23",
    destination="/backup/audit-export.csv"
)

# Output:
# timestamp | event_type | agent_id | action_id | details | status
# 2026-03-01 14:22:05 | action_execution | agent_01 | read_file | ... | success
# ...
```

---

## Part 13: Implementation Checklist

### Core Components to Implement

- [ ] Permission mode selector (Supervised, Autonomous, Custom)
- [ ] Permission request/approval flow (for Supervised mode)
- [ ] Workspace isolation enforcement (filesystem sandboxing)
- [ ] Dynamic action sandbox (memory, CPU, network limits)
- [ ] Action validation on creation (schema, imports, dependencies)
- [ ] Agent permission cascade (parent/child limits)
- [ ] Audit logging infrastructure (append-only, immutable logs)
- [ ] Undo mechanism (state capture, rollback, undo window)
- [ ] Resource quota enforcement (memory, CPU, storage, network)
- [ ] Network access control (domain allowlisting, logging)
- [ ] Audit log querying interface
- [ ] Trust hierarchy (core vs. dynamic actions)
- [ ] Sandbox escape detection (logging of attempts)
- [ ] Recovery procedures (disable agent, rollback, restore)

### Security Testing Required

- [ ] Test infinite loop detection (CPU timeout)
- [ ] Test memory exhaustion (OOM handling)
- [ ] Test subprocess escape (disallowed import)
- [ ] Test filesystem escape (chroot/sandboxing)
- [ ] Test audit log immutability
- [ ] Test undo with cascading dependencies
- [ ] Test resource quota enforcement
- [ ] Test cross-workspace isolation
- [ ] Test permission cascade with child agents
- [ ] Test agent-to-agent isolation

---

## Part 14: Summary: Security Model

**Three-Layer Security Model:**

**Layer 1: Containment (Sandboxing)**
- Dynamic actions and LLM-generated apps run in restricted environment
- Resource limits prevent runaway processes
- Filesystem and network sandboxing prevent unauthorized access
- Purpose: Debuggability, not prevention

**Layer 2: Visibility (Audit)**
- All significant actions logged with full context
- Audit trail is immutable, queryable, compliant
- Permission decisions logged with user intent
- Purpose: Accountability and forensic recovery

**Layer 3: Control (Permissions and Undo)**
- Three permission modes: Supervised, Autonomous, Custom
- User can grant or deny specific actions
- Undo enables recovery from mistakes in Autonomous mode
- User can always override (with logging)
- Purpose: User agency and damage control

**Guiding Principles:**
- Security is for safety (preventing accidents), not restrictions (preventing determined attacks)
- User always has agency; permission system is advisory
- All security-relevant actions are logged and auditable
- Sandbox is not for permission gating; it's for isolation and debuggability
- Undo is a first-class recovery mechanism, not an afterthought

---

## References and Related Documents

- Document 1: OS Kernel Architecture
- Document 6: Agent Model and Lifecycle
- Document 8: Memory System (Scratchpad)
- Document 11: Action System
- Document 12: Conductor (Agent Orchestration)
- Document 19: Configuration and Customization
