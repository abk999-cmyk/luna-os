# Third-Party App Integration Specification

**Document 22 of 26** – LLM-Native Operating System
**Status:** Platform Design | **Audience:** Third-Party Developers, Integrators

---

## Overview

This document specifies how external developers build AI-native applications for the LLM-native OS. Every third-party app is AI-native by design: it exposes composable primitive components, registers actions that the LLM can invoke, and integrates with the OS workspace memory and decision systems.

### Core Principles

1. **AI-First**: Every app is designed for LLM orchestration, not just human UI
2. **Composable**: Apps use standardized primitive components and extend them predictably
3. **Action-Driven**: App capabilities are discoverable via the action registration protocol
4. **Memory-Aware**: Apps read and write workspace state through defined memory access patterns
5. **Sandboxed**: Third-party code runs in controlled isolation with explicit permissions
6. **Discoverable**: App capabilities are introspectable by the LLM runtime

---

## Part 1: Developer SDK Structure

### SDK Components

```
llm-os-sdk/
├── @llm-os/primitives/          # Component library
├── @llm-os/runtime/              # Action registration, memory access
├── @llm-os/types/                # TypeScript types & schemas
├── @llm-os/testing/              # Testing tools & mocks
├── @llm-os/cli/                  # Development CLI (create, build, test, publish)
├── docs/                          # API docs and guides
└── examples/                      # Reference apps
```

### Installation

```bash
npm install @llm-os/sdk

# Or piecemeal
npm install @llm-os/primitives @llm-os/runtime @llm-os/types
```

### Minimal App Structure

```
my-app/
├── app.manifest.json              # App metadata & permissions
├── src/
│   ├── index.ts                   # App entry point
│   ├── components/                # React-like UI components
│   ├── actions/                   # Action definitions
│   └── memory.ts                  # Memory access patterns
├── tests/
│   └── app.test.ts
├── package.json
└── tsconfig.json
```

---

## Part 2: Component Primitive API

### Primitive Components

The OS provides six core UI primitives that apps compose, extend, and specialize:

#### 2.1 DataTable

Structured, sortable, filterable tabular data with LLM-aware rendering.

```typescript
// @llm-os/primitives/DataTable

interface DataTableProps {
  columns: Array<{
    id: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'custom';
    sortable?: boolean;
    filterable?: boolean;
    render?: (value: any, row: any) => ReactNode;
  }>;
  rows: Array<Record<string, any>>;
  onRowSelect?: (row: any) => void;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  onFilter?: (filters: Record<string, any>) => void;
  selectable?: boolean;
  virtualized?: boolean; // For large datasets
  metadata?: {
    description: string;
    semantics: string; // "time-series" | "entities" | "events" | etc.
  };
}

export const DataTable: React.FC<DataTableProps>;
```

**Example: Sales App**

```typescript
import { DataTable } from '@llm-os/primitives';

export const SalesTable = ({ sales }: { sales: Sale[] }) => (
  <DataTable
    columns={[
      { id: 'date', label: 'Date', type: 'date', sortable: true },
      { id: 'customer', label: 'Customer', type: 'string', filterable: true },
      { id: 'amount', label: 'Amount', type: 'number', sortable: true },
      { id: 'status', label: 'Status', type: 'string', filterable: true },
    ]}
    rows={sales}
    onRowSelect={(row) => console.log('Selected:', row)}
    metadata={{
      description: 'Quarterly sales transactions',
      semantics: 'time-series',
    }}
  />
);
```

#### 2.2 InteractiveMap

Geographic or node-graph visualization with clickable regions, overlays, and annotations.

```typescript
// @llm-os/primitives/InteractiveMap

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  icon?: string;
  metadata?: Record<string, any>;
}

interface MapProps {
  type: 'geographic' | 'graph';
  markers?: MapMarker[];
  paths?: Array<{ from: string; to: string; label?: string }>;
  onMarkerClick?: (marker: MapMarker) => void;
  onPathClick?: (path: any) => void;
  center?: [number, number];
  zoom?: number;
  metadata?: {
    description: string;
    semantics: string; // "spatial" | "network" | "topology" | etc.
  };
}

export const InteractiveMap: React.FC<MapProps>;
```

#### 2.3 Timeline

Temporal visualization of events, milestones, phases, with drill-down.

```typescript
// @llm-os/primitives/Timeline

interface TimelineEvent {
  id: string;
  timestamp: Date | string;
  title: string;
  description?: string;
  category?: string;
  color?: string;
  metadata?: Record<string, any>;
}

interface TimelineProps {
  events: TimelineEvent[];
  mode: 'linear' | 'nested' | 'gantt';
  onEventClick?: (event: TimelineEvent) => void;
  timeRange?: { start: Date; end: Date };
  metadata?: {
    description: string;
    semantics: 'historical' | 'forecast' | 'project' | etc.;
  };
}

export const Timeline: React.FC<TimelineProps>;
```

#### 2.4 Canvas

Freeform drawing, diagramming, visual programming surface.

```typescript
// @llm-os/primitives/Canvas

interface CanvasShape {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'text' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, any>;
  metadata?: Record<string, any>;
}

interface CanvasProps {
  shapes: CanvasShape[];
  onShapeAdd?: (shape: CanvasShape) => void;
  onShapeModify?: (id: string, updates: Partial<CanvasShape>) => void;
  onShapeDelete?: (id: string) => void;
  tools?: Array<'select' | 'draw' | 'text' | 'image'>;
  metadata?: {
    description: string;
    semantics: 'diagram' | 'flowchart' | 'sketch' | etc.;
  };
}

export const Canvas: React.FC<CanvasProps>;
```

#### 2.5 CodeEditor

Syntax-highlighted, multi-language code editing with language server protocol support.

```typescript
// @llm-os/primitives/CodeEditor

interface CodeEditorProps {
  language: string; // 'javascript' | 'python' | 'markdown' | etc.
  code: string;
  onChange?: (code: string) => void;
  onSave?: (code: string) => void;
  readOnly?: boolean;
  lineNumbers?: boolean;
  minimap?: boolean;
  theme?: 'light' | 'dark';
  lsp?: {
    endpoint: string;
    documentUri: string;
  };
  metadata?: {
    description: string;
    semantics: 'source' | 'config' | 'snippet' | etc.;
  };
}

export const CodeEditor: React.FC<CodeEditorProps>;
```

#### 2.6 Chat

Conversational interface for human-LLM exchange within the app.

```typescript
// @llm-os/primitives/Chat

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokenCount?: number;
    model?: string;
    sourceApp?: string;
  };
}

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage?: (content: string) => void;
  onEditMessage?: (id: string, content: string) => void;
  placeholder?: string;
  contextWindow?: string; // Reference to memory context
  metadata?: {
    description: string;
    semantics: 'user-instruction' | 'agent-task' | 'explanation' | etc.;
  };
}

export const Chat: React.FC<ChatProps>;
```

### Extending Primitives

Developers can create specialized variants by composing and extending primitives:

```typescript
// src/components/ResearchDataTable.tsx
import { DataTable } from '@llm-os/primitives';
import { useMemory } from '@llm-os/runtime';

export const ResearchDataTable = ({ papers }: { papers: Paper[] }) => {
  const { read, write } = useMemory();

  const handleRowSelect = (paper: Paper) => {
    // Write selection to workspace memory for LLM
    write('selected_paper', paper);
  };

  return (
    <DataTable
      columns={[
        { id: 'title', label: 'Title', type: 'string' },
        { id: 'authors', label: 'Authors', type: 'string' },
        { id: 'year', label: 'Year', type: 'number', sortable: true },
        {
          id: 'relevance',
          label: 'Relevance',
          type: 'custom',
          render: (value) => <RelevanceBadge score={value} />,
        },
      ]}
      rows={papers}
      onRowSelect={handleRowSelect}
      metadata={{
        description: 'Academic papers with relevance scores',
        semantics: 'research-corpus',
      }}
    />
  );
};
```

---

## Part 3: Action Registration Protocol

### Action Registration System

Apps register their capabilities as "actions" that the LLM can discover and invoke. This creates the **app-registered tier** of automation.

#### 3.1 Action Definition

```typescript
// @llm-os/runtime/Action

interface ActionDefinition {
  id: string;                        // Unique action ID (e.g., "sales:export-to-csv")
  name: string;                      // Human-readable name
  description: string;               // LLM-visible description
  category: string;                  // "data-query" | "data-manipulation" | "reporting" | etc.
  visibility: 'public' | 'internal'; // Public: LLM can see; Internal: app-only
  inputs: JSONSchema;                // Input parameters (JSON Schema)
  outputs: JSONSchema;               // Output type (JSON Schema)
  requiredMemory?: string[];         // Memory keys this action needs
  modifiesMemory?: string[];         // Memory keys this action writes
  sideEffects?: string[];            // "file-system" | "external-api" | "ui-change"
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit: number;
  };
}

interface ActionHandler {
  (params: Record<string, any>, context: ActionContext): Promise<any>;
}

interface ActionContext {
  appId: string;
  userId: string;
  memory: MemoryAccessor;
  os: OSRuntime;
  logger: Logger;
}
```

#### 3.2 Registering Actions

```typescript
// src/actions/export.ts
import { defineAction, registerAction } from '@llm-os/runtime';

const exportSalesAction = defineAction({
  id: 'sales:export-to-csv',
  name: 'Export Sales to CSV',
  description: 'Export filtered sales data to a CSV file',
  category: 'data-export',
  visibility: 'public',
  inputs: {
    type: 'object',
    properties: {
      filters: {
        type: 'object',
        description: 'Filter criteria (date range, customer, status)',
        properties: {
          dateStart: { type: 'string', format: 'date' },
          dateEnd: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
        },
      },
      format: {
        type: 'string',
        enum: ['csv', 'tsv', 'json'],
        default: 'csv',
      },
    },
    required: ['filters'],
  },
  outputs: {
    type: 'object',
    properties: {
      fileId: { type: 'string' },
      filename: { type: 'string' },
      rowCount: { type: 'number' },
      downloadUrl: { type: 'string' },
    },
  },
  modifiesMemory: ['export_history'],
  sideEffects: ['file-system'],
  rateLimitLimit: {
    requestsPerMinute: 10,
    burstLimit: 2,
  },
});

// Handler implementation
const handler = async (params, context) => {
  const { filters, format } = params;
  const { memory, logger } = context;

  // Fetch data (from state or memory)
  const sales = await memory.read('sales_data');
  const filtered = applySalesFilters(sales, filters);

  // Generate export
  const filename = `sales-export-${Date.now()}.${format}`;
  const fileId = await generateExportFile(filtered, format, filename);

  // Log in memory
  await memory.write('export_history', {
    fileId,
    filename,
    timestamp: new Date().toISOString(),
    rowCount: filtered.length,
  });

  logger.info(`Exported ${filtered.length} sales records`);

  return {
    fileId,
    filename,
    rowCount: filtered.length,
    downloadUrl: `/files/${fileId}`,
  };
};

// Register with OS at app load
export const registerSalesActions = () => {
  registerAction(exportSalesAction, handler);
};
```

#### 3.3 Discovering Actions at Runtime

The LLM queries the OS for available actions:

```typescript
// OS runtime behavior
const discoverActions = async (appId?: string): Promise<ActionDefinition[]> => {
  // If appId specified, return actions from that app
  // Otherwise, return all public actions across all loaded apps
  return actionRegistry.getActions({ appId, visibility: 'public' });
};

// LLM receives action metadata and decides which to invoke
const availableActions = await os.discoverActions();
// [
//   { id: 'sales:export-to-csv', name: 'Export Sales to CSV', ... },
//   { id: 'sales:filter-by-date', name: 'Filter Sales by Date', ... },
//   { id: 'notes:create', name: 'Create Note', ... },
// ]
```

---

## Part 4: Memory Access Patterns

### Memory Architecture for Apps

Apps access three levels of memory:

1. **App-Private**: Local state, never visible to other apps
2. **Workspace Shared**: Workspace scratchpad, readable/writable by app
3. **System Read-Only**: OS state, read-only

#### 4.1 Memory Accessor API

```typescript
// @llm-os/runtime/Memory

interface MemoryAccessor {
  // Read workspace key (returns latest value or null)
  read(key: string): Promise<any>;

  // Write workspace key (creates or updates)
  write(key: string, value: any): Promise<void>;

  // Append to a log or array at a key
  append(key: string, value: any): Promise<void>;

  // Delete a key
  delete(key: string): Promise<void>;

  // List all keys matching pattern
  keys(pattern?: string): Promise<string[]>;

  // Atomic compare-and-swap (for concurrency)
  compareAndSwap(
    key: string,
    expectedValue: any,
    newValue: any,
  ): Promise<boolean>;

  // Subscribe to changes on a key (real-time updates)
  watch(key: string, callback: (value: any) => void): Unsubscribe;
}
```

#### 4.2 Memory Permissions

Every app declares in its manifest what memory it can access:

```json
{
  "id": "research-app",
  "memory": {
    "readWrite": ["selected_papers", "research_notes", "annotations"],
    "readOnly": ["workspace_context", "user_profile"],
    "restricted": []
  }
}
```

**Enforcement**:
- If app tries to `write` to a key not in `readWrite`, the OS rejects it.
- If app tries to `read` from a key not in `readWrite` or `readOnly`, the OS rejects it.
- `restricted` keys (e.g., `user_credentials`, `system_config`) are never accessible to third-party apps.

#### 4.3 Memory Patterns in Practice

**Pattern 1: Passing Results to LLM**

```typescript
// research-app/src/actions/search.ts
const searchAction = defineAction({
  id: 'research:search',
  name: 'Search Papers',
  modifiesMemory: ['search_results'],
  // ...
});

const handler = async (params, context) => {
  const { query } = params;
  const { memory } = context;

  const results = await performSearch(query);

  // Write results to workspace so LLM can see them
  await memory.write('search_results', {
    query,
    count: results.length,
    papers: results,
    timestamp: new Date().toISOString(),
  });

  return { count: results.length };
};
```

**Pattern 2: Reading LLM Decisions**

```typescript
// codeEditor/src/actions/refactor.ts
const refactorAction = defineAction({
  id: 'code:refactor',
  requiredMemory: ['code_to_refactor', 'refactoring_instructions'],
  modifiesMemory: ['refactored_code'],
  // ...
});

const handler = async (params, context) => {
  const { memory } = context;

  // Read what the LLM decided
  const code = await memory.read('code_to_refactor');
  const instructions = await memory.read('refactoring_instructions');

  // Process
  const refactored = applyRefactoring(code, instructions);

  // Write result back
  await memory.write('refactored_code', refactored);

  return { success: true };
};
```

**Pattern 3: Reactive Updates via watch()**

```typescript
// notes-app/src/components/NoteViewer.tsx
import { useMemory } from '@llm-os/runtime';
import { useEffect, useState } from 'react';

export const NoteViewer = () => {
  const memory = useMemory();
  const [note, setNote] = useState(null);

  useEffect(() => {
    // Subscribe to note changes in workspace
    const unsubscribe = memory.watch('current_note', (value) => {
      setNote(value);
    });

    return unsubscribe;
  }, []);

  return <div>{note?.content}</div>;
};
```

#### 4.4 Reserved Memory Keys

Certain keys are off-limits to third-party apps:

```
RESTRICTED (always forbidden):
- user:*                    (user credentials, personal data)
- system:*                  (OS config, security state)
- os:*                      (internal OS state)

INTERNAL (read-only for most apps):
- workspace:history         (action history, audit log)
- workspace:permissions     (app permissions)
- workspace:memory-usage    (memory statistics)

SUGGESTED NAMESPACING FOR APPS:
- {appId}:{key}            (app-private workspace data)
- shared:{key}             (intentionally shared data)
```

---

## Part 5: App Manifest Format

Every app declares its metadata, permissions, and capabilities in `app.manifest.json`:

```json
{
  "id": "research-assistant",
  "name": "Research Assistant",
  "version": "1.0.0",
  "author": "ResearchCorp",
  "description": "AI-native research tool for literature review and paper analysis",
  "minOSVersion": "1.2.0",
  "maxOSVersion": "2.0.0",

  "entry": {
    "main": "dist/index.js",
    "ui": "src/App.tsx"
  },

  "permissions": {
    "memory": {
      "readWrite": ["selected_papers", "research_notes", "annotations"],
      "readOnly": ["workspace_context"],
      "restricted": []
    },
    "filesystem": {
      "read": ["/workspace/documents"],
      "write": ["/workspace/exports"],
      "delete": false
    },
    "network": {
      "allowExternal": true,
      "allowedDomains": ["api.semanticscholar.org", "arxiv.org"]
    },
    "externalApps": ["notes-app"],
    "clipboard": true,
    "notifications": true
  },

  "actions": [
    {
      "id": "research:search",
      "name": "Search Papers",
      "public": true
    },
    {
      "id": "research:analyze",
      "name": "Analyze Paper",
      "public": true
    },
    {
      "id": "research:export",
      "name": "Export Results",
      "public": true
    }
  ],

  "components": [
    {
      "name": "PaperTable",
      "extends": "DataTable",
      "description": "Displays research papers with metadata"
    },
    {
      "name": "CitationNetwork",
      "extends": "InteractiveMap",
      "description": "Visualizes citation relationships"
    }
  ],

  "capabilities": {
    "ai-native": true,
    "background-execution": false,
    "realtime-collaboration": false,
    "offline": true
  },

  "resources": {
    "minMemory": "100MB",
    "minDiskSpace": "50MB",
    "dependencies": [
      "@semantic-scholar/api@^1.0.0",
      "lodash@^4.17.0"
    ]
  },

  "distribution": {
    "registry": "llm-os-registry",
    "license": "MIT",
    "repository": "https://github.com/researchcorp/research-assistant",
    "homepage": "https://researchcorp.com/research-assistant",
    "keywords": ["research", "papers", "ai-native"]
  }
}
```

---

## Part 6: App Lifecycle

### 6.1 Installation

```bash
llm-os-cli app install research-assistant@1.0.0
```

**Steps:**
1. OS downloads manifest and app bundle
2. Validates permissions against user policy
3. Prompts user for approval: "Research Assistant wants to read papers and write exports. OK?"
4. If approved, downloads and extracts app
5. Records app in system registry
6. App enters `installed` state

### 6.2 Loading

When user opens or LLM requests the app:

```typescript
// OS runtime
const loadApp = async (appId: string) => {
  const manifest = await registry.getManifest(appId);
  const bundle = await loadBundle(manifest.entry.main);

  // Call app's initialization function
  const instance = bundle.initialize({ memory, actions, os });

  // Register actions from app
  for (const actionDef of manifest.actions) {
    registerAction(actionDef, instance.handlers[actionDef.id]);
  }

  // Mount UI if requested
  if (manifest.entry.ui) {
    const AppComponent = bundle.App;
    mountComponent(appId, AppComponent);
  }

  app.state = 'loaded';
};
```

### 6.3 Unloading

```typescript
// OS runtime
const unloadApp = async (appId: string) => {
  const app = loadedApps[appId];

  // Call cleanup hook if defined
  if (app.cleanup) {
    await app.cleanup();
  }

  // Unregister actions
  unregisterActionsForApp(appId);

  // Unmount UI
  unmountComponent(appId);

  app.state = 'unloaded';
};
```

### 6.4 Updating

```bash
llm-os-cli app update research-assistant@1.2.0
```

**Steps:**
1. Check version compatibility
2. Validate new manifest (permissions, dependencies)
3. If permissions changed, prompt user
4. Unload current version
5. Download and install new version
6. Load new version
7. If rollback needed, restore previous version

### 6.5 Removing

```bash
llm-os-cli app remove research-assistant
```

**Steps:**
1. Unload app
2. Delete app files
3. Remove from registry
4. Purge app-private data (user confirms)
5. Keep workspace data (user can export/archive)

---

## Part 7: Declaring Leaf Agent Capabilities

Apps can declare that they support **leaf agent execution** — the ability to run autonomous tasks on behalf of the LLM.

```typescript
// app.manifest.json
{
  "capabilities": {
    "leafAgent": {
      "enabled": true,
      "tasks": [
        {
          "id": "research:deep-dive",
          "name": "Deep Dive Research",
          "description": "Autonomously search and analyze papers on a topic",
          "maxDuration": "30m",
          "maxCost": 0.50,
          "requiredActions": ["research:search", "research:analyze"],
          "toolsUsed": ["web-search", "pdf-extraction", "nlp"]
        },
        {
          "id": "research:weekly-digest",
          "name": "Weekly Digest",
          "description": "Automatically compile new papers matching user interests",
          "schedule": "weekly",
          "maxDuration": "10m",
          "maxCost": 0.10
        }
      ]
    }
  }
}
```

**Handler Implementation:**

```typescript
// src/leafAgents.ts
import { defineLeafAgent } from '@llm-os/runtime';

export const deepDiveResearch = defineLeafAgent({
  id: 'research:deep-dive',
  execute: async (topic: string, context) => {
    const { actions, memory, logger } = context;

    logger.info(`Starting deep dive on "${topic}"`);

    // Search phase
    const searchResults = await actions.invoke('research:search', {
      query: topic,
      limit: 20,
    });

    // Analyze phase (per-paper)
    for (const paper of searchResults.papers) {
      await actions.invoke('research:analyze', {
        paperId: paper.id,
        aspect: 'relevance',
      });
    }

    // Synthesize
    const synthesis = synthesizeFindings(searchResults);
    await memory.write('deep_dive_results', synthesis);

    logger.info('Deep dive complete');
    return synthesis;
  },
});
```

---

## Part 8: Sandboxing Rules

Third-party apps run in a sandboxed environment with explicit boundaries:

### 8.1 Sandboxing Mechanisms

| Resource | Restriction |
|----------|-------------|
| **Filesystem** | Only permitted paths (manifest `permissions.filesystem`) |
| **Network** | Only whitelisted domains (manifest `permissions.network.allowedDomains`) |
| **Memory** | Only declared keys (manifest `permissions.memory`) |
| **Other Apps** | Only declared integrations (manifest `permissions.externalApps`) |
| **Process** | Isolated V8 worker or child process |
| **CPU Time** | Action timeout (default 60s, configurable) |
| **Memory Usage** | Hard limit per app (default 500MB) |
| **System Calls** | Restricted set (no raw socket, no fork, etc.) |

### 8.2 Violation Handling

```typescript
// OS runtime
const executeAction = async (actionId, params, app) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  try {
    const result = await withTimeout(
      app.handlers[actionId](params, context),
      60000, // 60s timeout
    );

    // Check resource usage post-execution
    const duration = Date.now() - startTime;
    const memoryDelta = process.memoryUsage().heapUsed - startMemory;

    if (memoryDelta > 500_000_000) {
      throw new Error('App exceeded memory limit (500MB)');
    }

    return result;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      logger.warn(`Action ${actionId} timed out after 60s`);
      app.state = 'suspended'; // Suspend app temporarily
    } else if (error.message.includes('PermissionDenied')) {
      logger.error(`App attempted unauthorized access: ${error.message}`);
      app.state = 'restricted'; // Further restrict app
    }

    throw error;
  }
};
```

---

## Part 9: App Distribution Model

### 9.1 Official Registry (llm-os-registry)

The OS maintains an official registry at `registry.llm-os.dev`:

```bash
# Publish to official registry
llm-os-cli publish --registry official

# Install from official registry
llm-os-cli app install research-assistant
```

**Registry Entry:**
- App metadata, version history, reviews, ratings
- Sandbox policy attestation
- Author verification
- Version compatibility matrix

### 9.2 Private/Custom Registries

Organizations can run private registries:

```typescript
// llm-os-cli config
{
  "registries": {
    "internal": "https://apps.company.com/registry",
    "official": "https://registry.llm-os.dev"
  }
}
```

### 9.3 Sideloading

For development/testing, load an app from local filesystem:

```bash
llm-os-cli app sideload ./my-app --dev
```

---

## Part 10: Versioning and Compatibility

### 10.1 Semantic Versioning

Apps follow semver: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes (manifest format, action signatures)
- **MINOR**: New features (new actions, new primitives)
- **PATCH**: Bug fixes, security patches

### 10.2 Compatibility Declarations

```json
{
  "version": "1.2.0",
  "minOSVersion": "1.2.0",
  "maxOSVersion": "2.0.0",
  "compatibleApps": {
    "notes-app": ">=1.0.0",
    "ui-toolkit": "2.x"
  },
  "deprecations": [
    {
      "action": "research:legacy-search",
      "removedInVersion": "2.0.0",
      "replacement": "research:search"
    }
  ]
}
```

### 10.3 Compatibility Checking

```typescript
// OS install/load logic
const checkCompatibility = (manifest, osVersion) => {
  const { minOSVersion, maxOSVersion } = manifest;

  if (!satisfiesVersion(osVersion, `>=${minOSVersion}`)) {
    throw new Error(
      `App requires OS >= ${minOSVersion}, got ${osVersion}`,
    );
  }

  if (maxOSVersion && !satisfiesVersion(osVersion, `<${maxOSVersion}`)) {
    throw new Error(
      `App not compatible with OS >= ${maxOSVersion}`,
    );
  }
};
```

---

## Part 11: Testing Tools for App Developers

### 11.1 Development CLI

```bash
# Create new app scaffold
llm-os-cli create my-app --type editor

# Start dev server (hot reload)
llm-os-cli dev

# Run tests
npm test

# Build for distribution
llm-os-cli build

# Lint manifest
llm-os-cli lint

# Simulate app isolation
llm-os-cli simulate-sandbox

# Publish to registry
llm-os-cli publish
```

### 11.2 Testing Framework

```typescript
// @llm-os/testing

import { createMockContext, mockMemory, mockActions } from '@llm-os/testing';

describe('research-app', () => {
  let context;
  let memory;

  beforeEach(() => {
    memory = mockMemory();
    context = createMockContext({
      memory,
      actions: mockActions(),
    });
  });

  test('search action returns results', async () => {
    const handler = searchAction.handler;
    const result = await handler({ query: 'machine learning' }, context);

    expect(result.count).toBeGreaterThan(0);
    expect(memory.write).toHaveBeenCalledWith('search_results', expect.any(Object));
  });

  test('respects memory permissions', async () => {
    const illegalWrite = () => memory.write('user:credentials', 'secret');
    expect(illegalWrite).toThrow('PermissionDenied');
  });
});
```

### 11.3 Inspector Tool

```bash
# Inspect app state, memory, actions
llm-os-cli inspect research-app

# Output:
# App: research-assistant (v1.0.0)
# State: loaded
# Memory Keys: selected_papers, search_results, annotations
# Actions: research:search, research:analyze, research:export
# CPU: 12%, Memory: 45MB
```

---

## Part 12: Example Apps

### Example 1: Code Editor App

**Purpose**: Syntax-highlighted code editing with LLM-powered suggestions.

**Files:**

```typescript
// app.manifest.json
{
  "id": "code-editor",
  "name": "Code Editor",
  "version": "1.0.0",
  "entry": {
    "main": "dist/index.js",
    "ui": "src/App.tsx"
  },
  "permissions": {
    "memory": {
      "readWrite": ["open_file", "edited_code", "refactoring_task"],
      "readOnly": ["workspace_context"]
    },
    "filesystem": {
      "read": ["/workspace"],
      "write": ["/workspace"]
    }
  },
  "actions": [
    { "id": "editor:open", "public": true },
    { "id": "editor:save", "public": true },
    { "id": "editor:refactor", "public": true }
  ]
}
```

```typescript
// src/index.ts
import { registerAction } from '@llm-os/runtime';
import { CodeEditor } from './actions/editor';

const openAction = CodeEditor.defineOpen();
const saveAction = CodeEditor.defineSave();
const refactorAction = CodeEditor.defineRefactor();

export const initialize = ({ memory, actions }) => {
  registerAction(openAction, CodeEditor.handleOpen(memory));
  registerAction(saveAction, CodeEditor.handleSave(memory));
  registerAction(refactorAction, CodeEditor.handleRefactor(memory));
};

export const App = () => {
  const [code, setCode] = useState('');
  const memory = useMemory();

  useEffect(() => {
    // Load file from memory when opened
    memory.watch('open_file', async (file) => {
      const content = await fs.readFile(file.path, 'utf-8');
      setCode(content);
    });
  }, []);

  const handleSave = async () => {
    await memory.write('edited_code', code);
    // Action handler saves to filesystem
  };

  return (
    <CodeEditor
      language="javascript"
      code={code}
      onChange={setCode}
      onSave={handleSave}
    />
  );
};
```

### Example 2: Note-Taking App

**Purpose**: Collaborative note-taking with AI tagging and search.

```typescript
// app.manifest.json
{
  "id": "notes-app",
  "name": "Notes",
  "version": "1.0.0",
  "actions": [
    { "id": "notes:create", "public": true },
    { "id": "notes:search", "public": true },
    { "id": "notes:tag", "public": true }
  ],
  "permissions": {
    "memory": {
      "readWrite": ["notes", "tags", "selected_note"],
      "readOnly": ["workspace_context"]
    }
  }
}
```

```typescript
// src/actions/search.ts
export const defineSearchAction = () =>
  defineAction({
    id: 'notes:search',
    name: 'Search Notes',
    description: 'Full-text search across all notes',
    inputs: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['query'],
    },
    outputs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          relevance: { type: 'number' },
        },
      },
    },
    modifiesMemory: ['search_results'],
  });

export const handleSearchAction = (memory) => async (params, context) => {
  const { query, tags } = params;
  const notes = await memory.read('notes');

  const results = notes
    .filter((note) => {
      const matchesQuery = note.content.toLowerCase().includes(query.toLowerCase());
      const matchesTags = tags.length === 0 || tags.some((t) => note.tags.includes(t));
      return matchesQuery && matchesTags;
    })
    .map((note) => ({
      ...note,
      relevance: calculateRelevance(note, query),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  await memory.write('search_results', results);
  return results;
};
```

### Example 3: Research Tool App

**Purpose**: Paper discovery, annotation, and synthesis.

```typescript
// app.manifest.json
{
  "id": "research-tool",
  "name": "Research Tool",
  "version": "1.0.0",
  "actions": [
    { "id": "research:search", "public": true },
    { "id": "research:annotate", "public": true },
    { "id": "research:synthesize", "public": true }
  ],
  "components": [
    { "name": "PaperTable", "extends": "DataTable" },
    { "name": "CitationNetwork", "extends": "InteractiveMap" }
  ],
  "permissions": {
    "memory": {
      "readWrite": ["papers", "annotations", "synthesis"],
      "readOnly": ["workspace_context"]
    },
    "network": {
      "allowExternal": true,
      "allowedDomains": ["api.semanticscholar.org"]
    }
  }
}
```

```typescript
// src/App.tsx
import { DataTable, InteractiveMap } from '@llm-os/primitives';
import { useMemory } from '@llm-os/runtime';

export const ResearchApp = () => {
  const memory = useMemory();
  const [papers, setPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);

  const handleRowSelect = async (paper) => {
    setSelectedPaper(paper);
    await memory.write('selected_paper', paper);
  };

  useEffect(() => {
    // React to search results from workspace
    memory.watch('search_results', (results) => {
      setPapers(results || []);
    });
  }, []);

  return (
    <div>
      <DataTable
        columns={[
          { id: 'title', label: 'Title', type: 'string' },
          { id: 'authors', label: 'Authors', type: 'string' },
          { id: 'year', label: 'Year', type: 'number', sortable: true },
        ]}
        rows={papers}
        onRowSelect={handleRowSelect}
        metadata={{ semantics: 'research-corpus' }}
      />

      {selectedPaper && (
        <PaperDetail paper={selectedPaper} />
      )}

      <InteractiveMap
        type="graph"
        markers={papers.map((p) => ({
          id: p.id,
          label: p.title,
          metadata: p,
        }))}
        paths={buildCitationGraph(papers)}
        metadata={{ semantics: 'citation-network' }}
      />
    </div>
  );
};
```

---

## Part 13: Integration Pattern Checklist

When building a third-party app, follow this checklist:

- [ ] **Manifest**: Define `app.manifest.json` with all permissions, actions, components
- [ ] **Entry Point**: Implement `initialize()` and export `App` component
- [ ] **Actions**: Define action schemas, register handlers, document inputs/outputs
- [ ] **Memory**: Declare what memory keys the app reads/writes, use memory.watch() for reactivity
- [ ] **UI**: Compose primitive components (DataTable, InteractiveMap, etc.), don't build custom rendering
- [ ] **Permissions**: Request minimum necessary; explain why in manifest
- [ ] **Error Handling**: Gracefully handle action failures, memory errors, network errors
- [ ] **Testing**: Write unit tests for actions, integration tests for memory flows
- [ ] **Documentation**: Document actions for LLM discovery, include examples
- [ ] **Versioning**: Set version, compatibility ranges, list deprecations
- [ ] **Publishing**: Validate with linter, build bundle, submit to registry

---

## Part 14: Troubleshooting & FAQ

**Q: Can my app access the clipboard?**
A: Only if declared in manifest: `"permissions": { "clipboard": true }`. LLM reads the manifest and respects the declaration.

**Q: How do I prevent my app from being unloaded?**
A: Apps don't prevent unloading. Use leaf agents for background tasks that need to persist.

**Q: Can two apps write to the same memory key?**
A: Yes, but this requires coordination. Use `compareAndSwap()` for safe concurrent writes.

**Q: What happens if my app crashes?**
A: The OS catches the error, logs it, and suspends the app. The LLM can retry or choose a different approach.

**Q: How do I test sandboxing violations?**
A: Use `llm-os-cli simulate-sandbox` to run your app in strict isolation mode and detect unauthorized access attempts.

**Q: Can my app spawn background tasks?**
A: Only via leaf agents, which are declared and scheduled. No arbitrary spawning.

**Q: How do I version my app for OS compatibility?**
A: Declare `minOSVersion` and `maxOSVersion` in manifest. The OS checks these before loading.

---

## Summary

Third-party apps on the LLM-native OS are **composed from primitives, action-driven, memory-aware, and sandboxed**. Developers use the SDK to build AI-native applications that integrate seamlessly with the LLM runtime and workspace. The action registration protocol makes every app's capabilities discoverable and invokable by the LLM. Memory access patterns allow apps to read/write workspace state deterministically. Distribution via registry, versioning, and compatibility checking enable a healthy ecosystem of third-party apps.

---

**Document 22 of 26**
**Next: Document 23 — AI Safety & Guardrails Framework**
