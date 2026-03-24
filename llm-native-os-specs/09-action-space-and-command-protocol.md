# Document 9: Action Space and Command Protocol

## Overview

The action space is the typed, structured API contract between the LLM and the OS. Rather than free-form text commands, the OS exposes a **strongly-typed action space** where every operation is a callable action with a formal JSON schema. The LLM emits structured action intents, the OS validates and dispatches them, and structured state is returned.

This design eliminates the ambiguity that plagues natural language interfaces. The LLM works with tight schemas, not loose interpretation—surgical precision instead of guesswork.

**Core principle:** The action space is the language both the LLM and OS speak fluently. It is self-describing, discoverable, and extensible.

---

## 1. Action Definition Schema

Every action is formally defined as a JSON Schema object. This schema specifies:
- **Identity:** Unique action identifier
- **Signature:** Input parameters and types
- **Behavior:** Preconditions, side effects, guarantees
- **Tier:** Which registry tier it belongs to (core, app, or LLM-created)
- **Lifecycle:** Persistence and disposal rules

### 1.1 Action Definition Format

```json
{
  "actionId": "window.create",
  "tier": "core",
  "signature": {
    "type": "object",
    "required": ["type"],
    "properties": {
      "type": {
        "type": "string",
        "enum": ["editor", "browser", "console", "canvas", "panel"],
        "description": "Window type determines available features and UI layout"
      },
      "title": {
        "type": "string",
        "maxLength": 256,
        "description": "Display title of the window"
      },
      "width": {
        "type": "integer",
        "minimum": 200,
        "maximum": 3840,
        "description": "Initial width in pixels"
      },
      "height": {
        "type": "integer",
        "minimum": 150,
        "maximum": 2160,
        "description": "Initial height in pixels"
      },
      "position": {
        "type": "object",
        "properties": {
          "x": { "type": "integer" },
          "y": { "type": "integer" }
        },
        "description": "Initial position (optional; center if omitted)"
      },
      "content": {
        "type": "string",
        "description": "Initial content (editor text, HTML, etc.)"
      },
      "state": {
        "type": "object",
        "description": "Application-specific state blob"
      }
    }
  },
  "preconditions": [
    "Working memory layer 3 (OS state) must be initialized",
    "At least 512MB memory available",
    "No more than 32 windows may be open simultaneously"
  ],
  "postconditions": [
    "Window is added to active window stack",
    "Window ID is registered and returned",
    "Capability manifest is updated if app registers new actions"
  ],
  "sideEffects": [
    "Allocates memory for window buffer and state",
    "May trigger layout reflow in tiling manager",
    "Emits window.created event"
  ],
  "latencyBudget": 2,
  "returns": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string",
        "pattern": "^[a-f0-9]{16}$",
        "description": "Unique window identifier"
      },
      "status": {
        "type": "string",
        "enum": ["created", "error"],
        "description": "Creation outcome"
      },
      "error": {
        "type": "string",
        "description": "Error message if status is 'error'"
      }
    }
  },
  "examples": [
    {
      "intent": {
        "action": "window.create",
        "params": {
          "type": "editor",
          "title": "untitled.py",
          "width": 800,
          "height": 600,
          "content": "# new file"
        }
      },
      "result": {
        "windowId": "9a4e2f1c3b7d6e9f",
        "status": "created"
      }
    }
  ]
}
```

### 1.2 Action Definition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actionId` | string | Yes | Fully qualified action name (e.g., `window.create`, `editor.insert`, `task.spawn`) |
| `tier` | string | Yes | One of: `core`, `app-registered`, `llm-created` |
| `signature` | JSON Schema | Yes | Input parameter schema (must be object type) |
| `preconditions` | string[] | No | Conditions that must be true before execution |
| `postconditions` | string[] | No | Guarantees about state after execution |
| `sideEffects` | string[] | No | Any observable effects beyond return value |
| `latencyBudget` | number | Yes | Maximum milliseconds for execution (default: 5) |
| `returns` | JSON Schema | Yes | Schema of return value |
| `examples` | object[] | No | Concrete usage examples with intent and result |
| `documentation` | string | No | Human-readable description |
| `deprecated` | boolean | No | Whether this action is being phased out |
| `replacedBy` | string | No | New action ID if deprecated |

---

## 2. Three-Tier Action Registry

### 2.1 Tier 1: Core OS Actions

**Scope:** Immutable, battle-tested operations. Ship with the OS. Never modified at runtime.

**Responsibilities:**
- Window and workspace management
- Memory read/write across all four layers
- Agent lifecycle (spawn, kill, signal)
- Filesystem operations
- System configuration and shutdown

**Registration:** Hardcoded in the OS kernel. Actions defined in `/os/core/actions/`.

**Stability guarantee:** Core actions are API-stable. Breaking changes trigger major OS version bumps.

**Examples:**

```json
{
  "actionId": "window.create",
  "actionId": "window.close",
  "actionId": "window.resize",
  "actionId": "window.move",
  "actionId": "window.stack",
  "actionId": "window.minimize",
  "actionId": "window.maximize",
  "actionId": "workspace.switch",
  "actionId": "workspace.create",
  "actionId": "memory.read",
  "actionId": "memory.write",
  "actionId": "agent.spawn",
  "actionId": "agent.kill",
  "actionId": "agent.signal",
  "actionId": "fs.read",
  "actionId": "fs.write",
  "actionId": "fs.delete",
  "actionId": "fs.move",
  "actionId": "fs.mkdir",
  "actionId": "config.set",
  "actionId": "config.get"
}
```

### 2.2 Tier 2: App-Registered Actions

**Scope:** Actions registered by components and applications when loaded.

**When registered:** When a component (code editor, browser, planner widget) initializes in the OS.

**Lifecycle:** Exist as long as the component is loaded. Removed when component is unloaded.

**Registration protocol:** Component emits a `registerActions` signal during initialization, OS validates and indexes.

**Examples:**

A code editor component registers on load:

```json
{
  "actions": [
    {
      "actionId": "editor.insert",
      "tier": "app-registered",
      "signature": {
        "type": "object",
        "required": ["text"],
        "properties": {
          "text": { "type": "string" },
          "position": {
            "type": "object",
            "properties": {
              "line": { "type": "integer", "minimum": 0 },
              "column": { "type": "integer", "minimum": 0 }
            }
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": {
          "status": { "type": "string", "enum": ["inserted", "error"] },
          "newCursorPosition": {
            "type": "object",
            "properties": {
              "line": { "type": "integer" },
              "column": { "type": "integer" }
            }
          }
        }
      }
    },
    {
      "actionId": "editor.lint",
      "tier": "app-registered",
      "signature": {
        "type": "object",
        "required": [],
        "properties": {
          "mode": {
            "type": "string",
            "enum": ["strict", "standard", "relaxed"]
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": {
          "errors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "line": { "type": "integer" },
                "message": { "type": "string" },
                "severity": { "type": "string", "enum": ["error", "warning"] }
              }
            }
          }
        }
      }
    },
    {
      "actionId": "editor.run",
      "tier": "app-registered",
      "signature": {
        "type": "object",
        "properties": {
          "args": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": {
          "exitCode": { "type": "integer" },
          "stdout": { "type": "string" },
          "stderr": { "type": "string" }
        }
      }
    }
  ]
}
```

### 2.3 Tier 3: LLM-Created Actions

**Scope:** The LLM can register NEW actions at runtime. This is the key innovation.

**When created:** When the LLM builds a dynamic widget or component and needs to define custom actions.

**Example scenario:** The LLM creates a travel planner widget. Simultaneously, it registers custom actions:
- `travel.add_destination(name, date, activities)`
- `travel.reorder_days(dayIndex, newPosition)`
- `travel.set_budget(total, breakdown)`
- `travel.generate_itinerary()`

**Lifecycle:** Ephemeral by default—exist as long as the widget exists. Can be **promoted to persistent** if the user repeatedly uses them → become part of the user's personal action library.

**Creation protocol:**

```json
{
  "action": "action.create",
  "params": {
    "actionId": "travel.add_destination",
    "tier": "llm-created",
    "signature": {
      "type": "object",
      "required": ["name", "date"],
      "properties": {
        "name": { "type": "string" },
        "date": { "type": "string", "format": "date" },
        "activities": {
          "type": "array",
          "items": { "type": "string" }
        },
        "notes": { "type": "string" }
      }
    },
    "returns": {
      "type": "object",
      "properties": {
        "destinationId": { "type": "string" },
        "status": { "type": "string" }
      }
    },
    "handler": {
      "componentId": "travel-planner-widget-xyz",
      "method": "addDestination"
    },
    "ephemeral": true,
    "promotionThreshold": 5
  ]
}
```

**Promotion mechanism:**

When an LLM-created action is called ≥ `promotionThreshold` times (default: 5), the OS offers promotion:

```json
{
  "event": "action.promotion_candidate",
  "actionId": "travel.add_destination",
  "usageCount": 7,
  "message": "This action has been used 7 times. Promote to persistent?"
}
```

If promoted, the action becomes part of the user's personal library:

```json
{
  "action": "action.promote",
  "params": {
    "actionId": "travel.add_destination",
    "destination": "user-library"
  }
}
```

Promoted actions survive widget unload and can be reused in future sessions.

---

## 3. Capability Manifest

The **live capability manifest** is a dedicated region in working memory (Layer 2) that ALWAYS contains the current, up-to-date action registry.

### 3.1 Manifest Structure

```json
{
  "timestamp": "2026-03-23T14:32:18.445Z",
  "osVersion": "2.1.0",
  "registryVersion": 247,
  "totalActions": 84,
  "tiers": {
    "core": 31,
    "app-registered": 38,
    "llm-created": 15
  },
  "actions": {
    "window": [
      {
        "actionId": "window.create",
        "signature": { "/* ... */" },
        "latencyBudget": 2,
        "tier": "core"
      },
      {
        "actionId": "window.close",
        "signature": { "/* ... */" },
        "latencyBudget": 1,
        "tier": "core"
      }
    ],
    "editor": [
      {
        "actionId": "editor.insert",
        "signature": { "/* ... */" },
        "latencyBudget": 3,
        "tier": "app-registered",
        "component": "code-editor-v5"
      }
    ],
    "travel": [
      {
        "actionId": "travel.add_destination",
        "signature": { "/* ... */" },
        "latencyBudget": 4,
        "tier": "llm-created",
        "ephemeral": true,
        "usageCount": 7,
        "promotionCandidate": true
      }
    ]
  },
  "namespaces": [
    "window",
    "workspace",
    "memory",
    "agent",
    "fs",
    "config",
    "editor",
    "browser",
    "task",
    "travel"
  ],
  "lastUpdated": "2026-03-23T14:32:18.445Z"
}
```

### 3.2 Manifest Update Protocol

The manifest is **pushed** into working memory, not pulled. When an action is registered or removed:

1. OS updates the manifest in memory
2. Manifest version increments
3. LLM is notified: `capability_manifest.updated`
4. LLM sees the new manifest in Layer 2 on next memory read (or pushed directly)

This is the **proactive state push** principle: The OS puts state into the LLM's working memory; the LLM doesn't call `os.capabilities()` to fetch it.

### 3.3 Manifest Access

The LLM can query the manifest:

```json
{
  "action": "capability.list",
  "params": {
    "tier": "llm-created",
    "namespace": "travel"
  }
}
```

Returns:

```json
{
  "actions": [
    {
      "actionId": "travel.add_destination",
      "signature": { "/* ... */" },
      "usageCount": 7,
      "promotionCandidate": true
    }
  ]
}
```

---

## 4. Action Registration Protocol

### 4.1 Core Actions (Tier 1)

**At OS boot time,** the kernel loads all core action definitions from `/os/core/actions/*.json`.

```
/os/core/actions/
├── window.json (window.create, window.close, ...)
├── workspace.json (workspace.switch, workspace.create, ...)
├── memory.json (memory.read, memory.write, ...)
├── agent.json (agent.spawn, agent.kill, ...)
├── fs.json (fs.read, fs.write, fs.delete, ...)
└── config.json (config.set, config.get, ...)
```

No registration call needed. They are **immutable and always available.**

### 4.2 App-Registered Actions (Tier 2)

When a component loads, it signals the OS:

```json
{
  "signal": "registerActions",
  "componentId": "code-editor-v5",
  "timestamp": "2026-03-23T14:25:03.221Z",
  "actions": [
    {
      "actionId": "editor.insert",
      "signature": { "/* ... */" },
      "returns": { "/* ... */" }
    },
    {
      "actionId": "editor.lint",
      "signature": { "/* ... */" },
      "returns": { "/* ... */" }
    }
  ]
}
```

**OS processing:**

1. Validate each action definition (see **Validation** section)
2. Check for namespace conflicts (e.g., is `editor.insert` already defined?)
3. Index into the registry
4. Update capability manifest
5. Return confirmation or error

```json
{
  "signal": "actionsRegistered",
  "componentId": "code-editor-v5",
  "registered": [
    "editor.insert",
    "editor.lint"
  ],
  "conflicts": [],
  "timestamp": "2026-03-23T14:25:03.445Z"
}
```

When the component unloads, all its actions are **automatically removed** from the registry.

### 4.3 LLM-Created Actions (Tier 3)

The LLM calls `action.create`:

```json
{
  "action": "action.create",
  "params": {
    "actionId": "travel.add_destination",
    "tier": "llm-created",
    "signature": {
      "type": "object",
      "required": ["name", "date"],
      "properties": {
        "name": { "type": "string" },
        "date": { "type": "string", "format": "date" },
        "activities": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "returns": {
      "type": "object",
      "properties": {
        "destinationId": { "type": "string" },
        "status": { "type": "string" }
      }
    },
    "handler": {
      "componentId": "travel-planner-widget-xyz",
      "method": "addDestination"
    },
    "documentation": "Add a new destination to the travel itinerary",
    "ephemeral": true,
    "promotionThreshold": 5
  }
}
```

**OS processing:**

1. Validate the action definition
2. Check for conflicts with existing actions (core or app-registered; LLM actions can shadow each other)
3. Verify the handler points to a valid component
4. Create a reference from the namespace to the action
5. Mark as ephemeral if specified
6. Index in capability manifest
7. Return confirmation with action ID

```json
{
  "action": "action.create",
  "result": {
    "status": "created",
    "actionId": "travel.add_destination",
    "tier": "llm-created",
    "ephemeral": true,
    "timestamp": "2026-03-23T14:32:18.445Z"
  }
}
```

---

## 5. Validation Rules

### 5.1 Schema Validation

All action definitions must pass JSON Schema validation:

1. **actionId format:** `[a-z][a-z0-9]*\.[a-z][a-z0-9_]*` (namespace.action)
2. **signature:** Must be a JSON Schema object type
3. **returns:** Must be a JSON Schema object type
4. **latencyBudget:** Must be positive integer ≤ 5000 (milliseconds)
5. **preconditions, postconditions:** Array of strings (human-readable, not enforced)
6. **examples:** Each must have `intent` and `result` properties

**Validation logic:**

```javascript
function validateActionDefinition(actionDef) {
  const errors = [];

  // Check required fields
  if (!actionDef.actionId) errors.push("actionId is required");
  if (!actionDef.tier) errors.push("tier is required");
  if (!actionDef.signature) errors.push("signature is required");
  if (!actionDef.returns) errors.push("returns is required");

  // Check format
  if (!/^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/.test(actionDef.actionId)) {
    errors.push("actionId must match pattern: namespace.action");
  }

  if (!["core", "app-registered", "llm-created"].includes(actionDef.tier)) {
    errors.push("tier must be one of: core, app-registered, llm-created");
  }

  // Validate as JSON Schema
  if (actionDef.signature.type !== "object") {
    errors.push("signature must be of type 'object'");
  }

  if (actionDef.returns.type !== "object") {
    errors.push("returns must be of type 'object'");
  }

  // Check latency budget
  if (typeof actionDef.latencyBudget !== "number" || actionDef.latencyBudget <= 0) {
    errors.push("latencyBudget must be a positive number (default: 5)");
  }

  return { valid: errors.length === 0, errors };
}
```

### 5.2 Conflict Detection

The OS prevents or warns about action conflicts:

- **Core actions:** Cannot be overridden or shadowed.
- **App-registered actions:** Cannot shadow core or other app-registered actions from different components. Can coexist with LLM-created actions (LLM action takes precedence).
- **LLM-created actions:** Can shadow other LLM-created actions in the same namespace. Warned if shadowing app-registered action.

**Conflict checking:**

```javascript
function checkConflict(actionId, tier, componentId) {
  const existing = registry.get(actionId);

  if (!existing) return { conflict: false };

  if (existing.tier === "core") {
    return { conflict: true, reason: "Cannot shadow core action" };
  }

  if (existing.tier === "app-registered" && tier === "app-registered") {
    if (existing.componentId !== componentId) {
      return { conflict: true, reason: "Action already registered by different component" };
    }
  }

  if (existing.tier === "app-registered" && tier === "llm-created") {
    return { conflict: false, warning: "LLM action will shadow app-registered action" };
  }

  if (tier === "llm-created" && existing.tier === "llm-created") {
    return { conflict: false, warning: "Replacing previous LLM-created action" };
  }

  return { conflict: false };
}
```

### 5.3 Permission Model

Action execution is **not** gated by permissions (the user can always override). However, execution is **logged and traced** for debuggability.

All action calls are logged with:
- Timestamp
- Action ID
- Caller (core OS, component ID, or LLM)
- Parameters (sanitized)
- Result (success/error)
- Latency

---

## 6. Dispatch Pipeline

### 6.1 Dispatch Flow

```
LLM emits intent
        ↓
┌──────────────────────────────┐
│ 1. PARSE INTENT              │
│    - Extract action, params  │
│    - Check malformed JSON    │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│ 2. LOOKUP ACTION             │
│    - Find in registry        │
│    - Return error if missing │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│ 3. VALIDATE PARAMETERS       │
│    - Validate against schema │
│    - Check required fields   │
│    - Coerce types if needed  │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│ 4. CHECK PRECONDITIONS       │
│    - Sufficient memory?      │
│    - Resource availability?  │
│    - Can proceed?            │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│ 5. EXECUTE ACTION            │
│    - Call handler            │
│    - Enforce latency budget  │
│    - Catch exceptions        │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│ 6. VALIDATE RESULT           │
│    - Validate against schema │
│    - Log outcome             │
│    - Update state            │
└──────────────────────────────┘
        ↓
Return structured result to LLM
```

### 6.2 Dispatch Implementation

```javascript
async function dispatchAction(intent, sourceId) {
  const startTime = performance.now();
  const log = {
    timestamp: new Date().toISOString(),
    actionId: intent.action,
    sourceId: sourceId,
    status: null,
    latency: null,
    error: null
  };

  try {
    // 1. Parse intent
    if (!intent.action || typeof intent.action !== "string") {
      throw new Error("Invalid intent: missing or malformed 'action' field");
    }

    const params = intent.params || {};

    // 2. Lookup action
    const actionDef = registry.get(intent.action);
    if (!actionDef) {
      throw new Error(`Action not found: ${intent.action}`);
    }

    // 3. Validate parameters
    const paramValidation = ajv.validate(actionDef.signature, params);
    if (!paramValidation.valid) {
      throw new Error(`Parameter validation failed: ${paramValidation.errors.map(e => e.message).join("; ")}`);
    }

    // 4. Check preconditions
    if (actionDef.preconditions) {
      const preconditionsMet = checkPreconditions(actionDef.preconditions);
      if (!preconditionsMet) {
        throw new Error("Preconditions not met");
      }
    }

    // 5. Execute action with latency budget
    const handler = getHandler(actionDef);
    const result = await withTimeout(
      handler(params),
      actionDef.latencyBudget || 5
    );

    // 6. Validate result
    const resultValidation = ajv.validate(actionDef.returns, result);
    if (!resultValidation.valid) {
      throw new Error(`Result validation failed: ${resultValidation.errors.map(e => e.message).join("; ")}`);
    }

    log.status = "success";
    actionLog.push(log);

    return {
      status: "ok",
      result: result,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    log.status = "error";
    log.error = error.message;
    actionLog.push(log);

    return {
      status: "error",
      error: error.message,
      action: intent.action,
      timestamp: new Date().toISOString()
    };

  } finally {
    log.latency = performance.now() - startTime;
  }
}
```

### 6.3 Latency Enforcement

Each action has a `latencyBudget` (default: 5ms). If execution exceeds this:

1. Action is forcefully terminated (if possible)
2. Error is returned to LLM
3. Event is logged: `action.timeout`
4. Alert issued if action is mission-critical

```javascript
async function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Action timeout: exceeded ${timeoutMs}ms budget`)),
        timeoutMs
      )
    )
  ]);
}
```

---

## 7. Error Handling

### 7.1 Error Categories

| Category | Code | Meaning | Recoverable |
|----------|------|---------|-------------|
| Malformed Intent | `E_INTENT_INVALID` | Intent JSON is invalid or missing fields | No |
| Unknown Action | `E_ACTION_NOT_FOUND` | Action ID not in registry | No |
| Parameter Validation | `E_PARAM_INVALID` | Params don't match schema | No |
| Precondition Failure | `E_PRECONDITION_FAILED` | Resource or state prerequisites unmet | Maybe |
| Execution Timeout | `E_TIMEOUT` | Action exceeded latency budget | Maybe |
| Execution Error | `E_EXECUTION_FAILED` | Action handler threw an exception | Maybe |
| Result Validation | `E_RESULT_INVALID` | Returned result doesn't match schema | No |

### 7.2 Error Response Format

```json
{
  "status": "error",
  "error": {
    "code": "E_PARAM_INVALID",
    "message": "Parameter validation failed: 'position.line' must be >= 0",
    "action": "editor.insert",
    "details": {
      "field": "position.line",
      "expected": "integer >= 0",
      "received": -5
    },
    "timestamp": "2026-03-23T14:32:18.445Z",
    "suggestion": "Try calling with line >= 0"
  }
}
```

### 7.3 LLM Error Recovery

When the LLM receives an error:

1. **Parse error:** LLM reformulates the intent with correct JSON structure
2. **Unknown action:** LLM queries capability manifest to discover available actions
3. **Parameter validation:** LLM adjusts parameters per schema and retries
4. **Precondition failure:** LLM may wait, free resources, or use an alternative action
5. **Timeout:** LLM can retry with adjusted parameters or break task into subtasks
6. **Execution error:** LLM may adjust intent, check error message for guidance, or escalate

Example recovery flow:

```
LLM intent: editor.insert(text="hello", position=-1)
  ↓
OS error: parameter validation failed (position.line must be >= 0)
  ↓
LLM: "I see, the line index is 0-based. Let me try again with position.line = 0"
  ↓
LLM intent: editor.insert(text="hello", position={line: 0, column: 0})
  ↓
OS result: success
```

---

## 8. Promotion Mechanism: Ephemeral → Persistent

### 8.1 Promotion Flow

```
LLM creates widget
  ↓
LLM registers ephemeral actions
(e.g., travel.add_destination)
  ↓
LLM calls travel.add_destination → count = 1
  ↓
LLM calls travel.add_destination → count = 2
  ↓
LLM calls travel.add_destination → count = 5
  ↓
OS event: action.promotion_candidate
(usageCount >= promotionThreshold)
  ↓
User confirms promotion
  ↓
Action is saved to user's personal library
  ↓
Action persists across sessions
```

### 8.2 Promotion Thresholds

Default promotion threshold: **5 calls** (configurable per action).

When usage count reaches threshold:

```json
{
  "event": "action.promotion_candidate",
  "actionId": "travel.add_destination",
  "usageCount": 5,
  "promotionThreshold": 5,
  "timestamp": "2026-03-23T14:32:18.445Z",
  "message": "This action has been used 5 times. Do you want to keep it?"
}
```

### 8.3 User Promotion Decision

User can:

1. **Promote:** Saves to personal library (survives future sessions)
2. **Keep ephemeral:** Continue using without saving
3. **Discard:** Delete the action

```json
{
  "action": "action.set_persistence",
  "params": {
    "actionId": "travel.add_destination",
    "persistence": "permanent"
  }
}
```

Result:

```json
{
  "result": {
    "status": "promoted",
    "actionId": "travel.add_destination",
    "tier": "user-library",
    "persistence": "permanent",
    "savedTo": "/user/library/actions/travel.add_destination.json"
  }
}
```

Promoted actions become **tier 4: User Library** and are loaded on boot automatically.

---

## 9. Concrete Examples

### 9.1 Example 1: Window Creation

**LLM intent:**

```json
{
  "action": "window.create",
  "params": {
    "type": "editor",
    "title": "main.py",
    "width": 1024,
    "height": 768,
    "content": "#!/usr/bin/env python3\n"
  }
}
```

**Dispatch pipeline:**

1. **Parse:** ✓ Valid JSON, all required fields
2. **Lookup:** ✓ Found in core actions
3. **Validate:** ✓ type is valid, dimensions in range
4. **Preconditions:** ✓ OS initialized, memory available
5. **Execute:** → `windowManager.createWindow(...)`
6. **Validate result:** ✓ Returns windowId and status

**Result:**

```json
{
  "status": "ok",
  "result": {
    "windowId": "9a4e2f1c3b7d6e9f",
    "status": "created"
  },
  "timestamp": "2026-03-23T14:32:18.445Z"
}
```

### 9.2 Example 2: App-Registered Action (Code Lint)

A code editor component loads and registers `editor.lint`.

**LLM intent:**

```json
{
  "action": "editor.lint",
  "params": {
    "mode": "strict"
  }
}
```

**Dispatch pipeline:**

1. **Parse:** ✓ Valid JSON
2. **Lookup:** ✓ Found in app-registered actions (code-editor-v5)
3. **Validate:** ✓ mode is valid enum
4. **Preconditions:** ✓ Editor active and initialized
5. **Execute:** → `codeEditor.lint("strict")`
6. **Validate result:** ✓ Returns error array

**Result:**

```json
{
  "status": "ok",
  "result": {
    "errors": [
      {
        "line": 42,
        "message": "Unused variable 'x'",
        "severity": "warning"
      }
    ]
  },
  "timestamp": "2026-03-23T14:32:19.123Z"
}
```

### 9.3 Example 3: LLM-Created Action (Travel Planner)

**Step 1: LLM creates action definition**

```json
{
  "action": "action.create",
  "params": {
    "actionId": "travel.add_destination",
    "tier": "llm-created",
    "signature": {
      "type": "object",
      "required": ["name", "date"],
      "properties": {
        "name": { "type": "string", "maxLength": 100 },
        "date": { "type": "string", "format": "date" },
        "activities": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "returns": {
      "type": "object",
      "properties": {
        "destinationId": { "type": "string" },
        "status": { "type": "string", "enum": ["created", "error"] }
      }
    },
    "handler": {
      "componentId": "travel-planner-widget-abc123",
      "method": "addDestination"
    },
    "ephemeral": true,
    "promotionThreshold": 3
  }
}
```

**OS response:**

```json
{
  "status": "ok",
  "result": {
    "actionId": "travel.add_destination",
    "tier": "llm-created",
    "registered": true,
    "ephemeral": true
  }
}
```

**Step 2: LLM calls the action first time**

```json
{
  "action": "travel.add_destination",
  "params": {
    "name": "Paris",
    "date": "2026-04-15",
    "activities": ["Eiffel Tower", "Louvre", "Café"]
  }
}
```

**Result:**

```json
{
  "status": "ok",
  "result": {
    "destinationId": "dest_7c4a92e1",
    "status": "created"
  }
}
```

Capability manifest now shows `usageCount: 1`.

**Step 3: LLM calls the action 2nd and 3rd times** (for Rome, Barcelona)

After 3rd call, `usageCount: 3` triggers promotion candidate event:

```json
{
  "event": "action.promotion_candidate",
  "actionId": "travel.add_destination",
  "usageCount": 3,
  "promotionThreshold": 3,
  "message": "This action has been used 3 times. Keep it for future use?"
}
```

**Step 4: User promotes the action**

```json
{
  "action": "action.promote",
  "params": {
    "actionId": "travel.add_destination",
    "tier": "user-library"
  }
}
```

**Result:**

```json
{
  "status": "ok",
  "result": {
    "actionId": "travel.add_destination",
    "tier": "user-library",
    "persistent": true,
    "savedTo": "/user/library/actions/travel.add_destination.json"
  }
}
```

**Step 5: User closes travel planner widget**

Normally, ephemeral actions would be deleted. But since `travel.add_destination` was promoted, it **survives** and is available next session.

---

## 10. Summary

| Aspect | Design Choice | Rationale |
|--------|---------------|-----------|
| **Structure** | Strongly-typed JSON schemas | Eliminates ambiguity; LLM can work surgically |
| **Three tiers** | Core (immutable) + App (dynamic) + LLM (extensible) | Balances stability with flexibility |
| **Capability manifest** | Pushed into working memory, not pulled | Proactive state; LLM always knows what actions exist |
| **Ephemeral actions** | Default; promoted based on usage | Reduce cognitive load; persistent only if useful |
| **Validation** | Pre-execution schema check + post-execution result validation | Catch errors early; ensure contract adherence |
| **Latency budget** | Sub-5ms dispatch | Enables real-time interactivity |
| **Error handling** | Structured error codes + recovery suggestions | LLM can adapt and retry intelligently |

**The action space is the language of LLM-native computing.** Tight schemas, not loose interpretation. Surgical precision, not guesswork. This is how the LLM becomes a powerful, trustworthy agent in the OS.

