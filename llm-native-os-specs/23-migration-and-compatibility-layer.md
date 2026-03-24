# Document 23: Migration and Compatibility Layer

## Executive Summary

The LLM-native OS cannot require users to abandon their existing files, tools, and workflows on day one. This document defines the compatibility architecture that allows traditional apps, file formats, and workflows to coexist with AI-native components. The strategy is **progressive adoption**—users can start in compatibility mode and gradually transition to full AI-native workflows as they choose.

The OS runs as a Tauri desktop application on existing operating systems (Windows, macOS, Linux) and must interoperate smoothly with the host OS while providing a clear path forward to native AI workflows.

---

## 1. File Format Compatibility

### 1.1 Core Principle: Format-Agnostic Import

The OS accepts files in any format and converts them to an internal representation that supports both backward-compatible export and native AI operations.

### 1.2 Supported Formats and Handling

#### Text Documents
- **Input:** `.docx`, `.odt`, `.rtf`, `.md`, `.txt`, `.html`
- **Import behavior:** Extract content, metadata (author, creation date, revision history), and formatting hints
- **Internal representation:** Store as AI-native document structure with backward compatibility metadata
- **Export:** Users can export to original format (with fidelity warnings if native features were used)

#### Code Files
- **Input:** `.py`, `.js`, `.ts`, `.go`, `.rs`, `.java`, `.cpp`, `.c`, `.h`, `.sql`, etc.
- **Import behavior:** Parse syntax, extract semantic structure (classes, functions, imports), preserve original formatting
- **Internal representation:** Code graph (AST-like) with native AI analysis and generation capabilities
- **Export:** Recreate original file format, preserve custom formatting where possible

#### Data Files
- **Input:** `.csv`, `.json`, `.yaml`, `.toml`, `.xml`, `.sql` queries/dumps
- **Import behavior:** Parse into structured format, infer schema where possible
- **Internal representation:** Native data structures with AI-backed querying and manipulation
- **Export:** Re-serialize to original format

#### Images and Media
- **Input:** `.png`, `.jpg`, `.gif`, `.svg`, `.webp`, `.pdf`, `.mp4`, `.mov`, `.mp3`, `.wav`
- **Import behavior:** Store original; generate AI-native metadata (OCR for documents, scene understanding for images, transcript for audio)
- **Internal representation:** Original file + AI-extracted knowledge layer
- **Export:** Return original format; allow export of extracted knowledge

#### Spreadsheets
- **Input:** `.xlsx`, `.xls`, `.csv`, `.ods`
- **Import behavior:** Parse sheet structure, formulas, formatting; build dependency graph
- **Internal representation:** Spreadsheet graph with AI-capable formula analysis and generation
- **Export:** Preserve original structure and formulas where possible

### 1.3 Graceful Degradation

If a format cannot be fully parsed:
1. Store the raw file as a blob with metadata
2. Create a text/binary view for manual inspection
3. Provide an AI agent to help interpret or convert the file
4. Never lose data; always provide an "original format download" option

---

## 2. Traditional App Integration and Compatibility Wrapper

### 2.1 Architecture: Leaf Agent Wrapper

Non-AI-native applications run within the OS via a minimal compatibility wrapper that:
- Provides the app with a standard file system view (mapped from OS files)
- Intercepts I/O operations to log and cache interactions
- Attaches a lightweight AI agent to help users understand the app
- Allows the AI layer to suggest native alternatives

### 2.2 Wrapper Components

#### File System Mapping
```
Host OS file system
      ↓
Tauri app manages access
      ↓
Legacy app sees a standard file hierarchy
      ↓
OS tracks all reads/writes and caches file representations
```

#### I/O Interception
- **Read:** When a legacy app reads a file, the OS:
  - Checks if it's cached in AI-native form
  - Returns the file (possibly with AI-generated hints in metadata)
  - Logs the access pattern

- **Write:** When a legacy app writes:
  - Intercept the write, store the file
  - Offer to convert/import into AI-native format
  - Keep the original for backward compatibility

#### Leaf Agent
- A minimal AI agent dedicated to one app instance
- Understands the app's inputs, outputs, and common workflows
- Suggests AI-native alternatives ("Would you like to use the native editor instead?")
- Provides real-time help ("This dialog means...")
- Never modifies app behavior; only observes and advises

### 2.3 Launch and Lifecycle

```yaml
User double-clicks "legacy-app.exe"
  ↓
OS detects non-native app
  ↓
Leaf Agent spins up for this app instance
  ↓
File system mapping initialized
  ↓
App launches with standard OS-like environment
  ↓
Agent monitors: file I/O, window focus, user actions
  ↓
When user closes app: Agent learns patterns, offers native migration
```

### 2.4 Compatibility vs. Native Performance

- **Legacy apps work but run in compatibility mode:** Slightly lower performance, full functionality
- **Native apps integrate deeply:** Full OS capabilities, AI-aware workflows, real-time collaboration
- **Users see performance/capability differences:** Motivation to migrate without forced obsolescence

---

## 3. Clipboard and Drag-and-Drop Compatibility

### 3.1 Host OS Integration

The Tauri app bridges clipboard and drag-and-drop with the host OS:

#### Clipboard
- **Copy in native OS app → Paste in legacy app within OS:** Works; OS translates formats
- **Copy in legacy app within OS → Paste in host OS:** Works; retains original format
- **Copy in legacy app → Paste in native OS app:** OS analyzes clipboard content, offers to import
  - If text: Create a note or code block
  - If file reference: Create a workspace reference
  - If image: Import with AI metadata

#### Drag and Drop
- **Drag file from host OS into OS window:**
  - File is imported; user chooses compatibility or native mode
  - AI offers to convert to native format

- **Drag file from legacy app to host OS:**
  - OS intercepts, exports original format
  - File appears in host OS unchanged

- **Drag between native OS apps:**
  - Full AI-aware interop; can pass rich semantic data
  - Example: Drag a code block from editor to AI assistant preserves parse tree

### 3.2 Format Translation on Clipboard

| Source | Destination | Translation |
|--------|-------------|-------------|
| Host OS (any format) | OS clipboard | Auto-detect; offer import |
| OS native app | Host OS | Export to original format or user choice |
| Legacy app | Native app | Text/file → structured data import |
| Native app | Legacy app | Serialize to plaintext/HTML/file |

---

## 4. Keyboard Shortcut Compatibility

### 4.1 Familiar Shortcuts Always Work

The OS preserves common keyboard shortcuts to lower friction:

```
Cmd/Ctrl+C         → Copy (works in all contexts)
Cmd/Ctrl+V         → Paste (works in all contexts)
Cmd/Ctrl+X         → Cut (works in all contexts)
Cmd/Ctrl+Z         → Undo (works in all contexts)
Cmd/Ctrl+Shift+Z   → Redo (works in all contexts)
Cmd/Ctrl+S         → Save (works in all contexts)
Cmd/Ctrl+O         → Open (works in all contexts)
Cmd/Ctrl+N         → New (works in all contexts)
Cmd/Ctrl+W         → Close (works in all contexts)
Cmd/Ctrl+Q         → Quit (works in all contexts)
Alt+Tab (Cmd+Tab on macOS) → Switch windows (works in all contexts)
Cmd/Ctrl+F         → Find (works in native apps; legacy apps handle their own)
```

### 4.2 New AI-Native Shortcuts

Native OS apps get additional shortcuts:

```
Cmd/Ctrl+/         → Toggle AI sidebar / Command palette
Cmd/Ctrl+K         → Open AI command (like GitHub Copilot)
Cmd/Ctrl+Shift+I   → Inspect with AI (analyze selection)
Cmd/Ctrl+Alt+M     → Multi-select magic (AI-powered regex/pattern select)
Cmd/Ctrl+Shift+R   → Refactor with AI
```

### 4.3 Custom Shortcuts

Users can define custom shortcuts. OS stores preferences and applies them in:
- All native apps
- Legacy apps (where applicable; OS simulates keypresses)

---

## 5. Import and Export Workflows

### 5.1 Bulk Import: Bringing Existing Projects In

#### Folder Import Dialog
```
User: File → Import Project
     ↓
OS shows folder picker
     ↓
User selects existing project folder (e.g., ~/my-project)
     ↓
OS scans folder:
  - Detects file types
  - Looks for metadata (git, package.json, requirements.txt, etc.)
  - Builds dependency graph
  - Indexes all files for search
     ↓
Creates workspace in AI-native format:
  - Files available in native editors
  - Legacy apps can still open original files (side-by-side)
  - AI builds understanding of project structure
     ↓
User can: edit natively, export modified files, keep using legacy tools
```

#### Project Detection
The OS recognizes project types:
- **Git repos:** `.git/` → Import with history insights
- **Node.js:** `package.json` → Show dependencies, suggest native package manager
- **Python:** `pyproject.toml` / `requirements.txt` → Show environment, suggest native venv
- **Go:** `go.mod` → Show modules
- **Rust:** `Cargo.toml` → Show crates
- **Generic:** Folder → Create basic workspace, let AI build understanding

### 5.2 Export Workflows

#### Selective Export
- User selects files/folders within OS
- OS exports to chosen format:
  - **As-is:** Original format, no changes
  - **Converted:** AI-native features translated to compatible format (with fidelity notes)
  - **Summary:** Human-readable overview of changes

#### Continuous Sync Option
- User can enable "dual-mode" editing
- Native OS editor writes to original file format automatically
- Legacy app can still open and edit the original
- OS merges changes intelligently (with conflict detection)

---

## 6. Data Migration

### 6.1 Import from Other Systems

#### From Desktop / Laptop
- **Files:** Drag-and-drop or file picker import (see Section 5.1)
- **Bookmarks:** Browser import dialog → Creates AI-indexed knowledge base
- **Notes:** Import from Notion, Obsidian, Apple Notes, OneNote
  - OS parses structure
  - Creates native knowledge graph
  - Preserves metadata (tags, creation date, etc.)

#### From Cloud Services
- **Google Workspace:** Export to `.docx` / `.xlsx` → Import normally
- **Dropbox / OneDrive / Drive:** Mount folder in OS, import projects
- **GitHub / GitLab:** Clone URL → Import with full history
- **Obsidian vaults:** Folder import → Migrate to native knowledge system
- **Notion:** Use official export → Parse structure → Import

#### From Browsers
- **Browser history:** One-click import → Creates searchable history timeline
- **Bookmarks:** One-click import → Creates knowledge base with AI categorization
- **Open tabs:** Export tab list → Create reading list or project workspace

### 6.2 Migration UI

```
Settings → Migrate Data
  ↓
Choose source:
  [ ] Import files from folder
  [ ] Import browser data
  [ ] Import from cloud service
  [ ] Import from another app
  [ ] Full system snapshot
  ↓
(for each choice)
  [Authenticate if needed]
  [Preview what will be imported]
  [Map old structure to new]
  [Start import]
  ↓
Progress bar + AI analysis running in background
  ↓
Post-import: OS offers to categorize, tag, and link imported data
```

---

## 7. Compatibility Wrapper Architecture

### 7.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│         OS Event Loop (Tauri + AI Runtime)              │
└──────────────┬──────────────────────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    ┌───▼────┐    ┌──▼────────┐
    │ Native │    │ Compatibility
    │ Apps   │    │ Layer
    │        │    │
    └────────┘    └──┬─────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
      ┌──▼─────────┐     ┌───────▼──┐
      │ File System │     │ Leaf Agent│
      │ Interceptor │     │ Wrapper   │
      └────────────┘     └───────────┘
         │                     │
      ┌──▼──────────────────────▼────┐
      │   Legacy App Instance         │
      │   (Python, Node, Java, etc.)  │
      └───────────────────────────────┘
         │
    ┌────▼─────────────────────┐
    │ Host OS (Windows/Mac/Linux) File System
    └─────────────────────────┘
```

### 7.2 Compatibility Layer Components

#### File System Interceptor
- Implemented as a virtual file system layer (FUSE on Linux, similar on macOS/Windows)
- Sits between legacy app and OS file system
- **Capabilities:**
  - Redirect file paths transparently
  - Cache file contents in AI-native format
  - Log all I/O operations
  - Generate AI-friendly metadata on-the-fly

#### Leaf Agent
- Single-threaded per legacy app instance
- Responsibilities:
  - Monitor user actions in the app
  - Understand what the app is doing
  - Suggest AI-native alternatives
  - Answer "How do I..." questions
  - Help migrate data to native format
- **Never** modifies app behavior

#### Registry/Configuration Bridge
- Maintains compatibility config (which apps are wrapped, preferences)
- Stores app-specific metadata (last opened, frequently used files, etc.)
- Allows OS to learn app-specific patterns

### 7.3 Performance Characteristics

| Operation | Native App | Legacy App (Wrapped) | Notes |
|-----------|-----------|----------------------|-------|
| File read (small) | <1ms | 5–10ms | Intercept + cache lookup |
| File read (large) | 10–50ms | 20–100ms | Streaming with AI analysis |
| File write | 5–20ms | 10–50ms | Intercept + AI metadata |
| Startup | 100–500ms | 500–2000ms | Wrapper overhead |
| Runtime (native feature use) | Direct | Simulated | No performance penalty |

**Key insight:** Compatibility mode is slower but usable. Native mode is significantly faster, motivating gradual migration.

---

## 8. Progressive Migration Path

### 8.1 The Journey from Legacy to Native

```
Phase 1: Discovery
  User opens legacy app in OS
  Leaf Agent observes workflows
  OS offers native alternative ("Tired of this? Try the native editor")

Phase 2: Coexistence
  User tries native app for simple tasks
  Keeps legacy app for complex operations they trust
  Files are shared; OS handles conversions

Phase 3: Gradual Adoption
  User gains confidence in native app
  Slowly moves more workflows to native
  AI learns user's patterns and predicts needs

Phase 4: Full Migration
  User no longer needs legacy app
  OS can archive or remove it
  Full AI capabilities unlocked in native workflow

(User can revert at any time)
```

### 8.2 Incentives for Migration

#### Friction Reduction
1. **Suggestion system:** OS learns what user does, suggests better ways
2. **Interop:** Files work seamlessly in both contexts
3. **No lock-in:** Can always export and go back
4. **Keyboard shortcuts:** Familiar controls everywhere

#### Value Unlocking
1. **AI-powered features work better on native:** Real-time collaboration, intelligent suggestions
2. **Performance:** Native apps are noticeably faster
3. **Integration:** Native apps talk to each other; legacy apps are isolated
4. **Knowledge building:** AI builds understanding only for native artifacts

#### Onboarding
1. **First run:** OS offers "setup wizard" to import existing files
2. **Native app tours:** Quick, interactive guides for key features
3. **Leaf Agent help:** Legacy app wrapper provides contextual help
4. **Peer suggestions:** "Other users moved from X to Y; here's how"

### 8.3 Opt-Out Always Available

Users can:
- Disable AI features at any time
- Export data back to original format (lossless where possible)
- Delete cloud sync / collaboration features
- Use OS in "offline compatibility mode" (legacy apps + basic file storage)
- Switch to traditional OS if needed

---

## 9. Interoperability with Host OS

### 9.1 Tauri Bridge Architecture

The OS runs as a Tauri desktop application, giving it access to:

#### File System Access
- **On Windows:** Direct WinAPI file access + NTFS attributes
- **On macOS:** POSIX file system + extended attributes
- **On Linux:** POSIX file system + extended attributes
- **Virtual layer:** OS maintains its own FS abstraction on top

#### Window Management
- **Native window:** Tauri handles window chrome, resizing, moving, minimizing
- **File dialogs:** OS can use native file picker or custom picker
- **Menu bar:** Native menu bar for OS commands (File, Edit, View, etc.)

#### System Integration
- **Notifications:** OS can send native notifications
- **Tray icon:** OS icon in system tray (for quick access)
- **Keyboard shortcut registration:** Global hotkeys (Cmd/Ctrl+`) to bring OS to focus
- **URL handlers:** Register custom protocol (e.g., `llm-os://workspace/...`) for deep linking

#### Clipboard Interop
- Tauri provides access to system clipboard
- OS translates formats when crossing boundaries (see Section 3.2)

#### Drag and Drop
- Tauri passes drag-and-drop events to OS
- OS handles format detection and import (see Section 3.1)

### 9.2 File Format Preservation

When data flows between OS and host OS:

```
Host OS app writes file
  ↓
Tauri app reads file
  ↓
OS detects format
  ↓
If format is known: Parse + import as AI-native
If format is unknown: Store as blob + AI analyzes on-demand
  ↓
User edits in OS (AI-native format)
  ↓
Export back to original format
  ↓
Host OS app can still open original file unchanged
```

### 9.3 Background Services

The OS can run background services (via Tauri):
- **File watcher:** Detect external changes to imported files
- **Sync service:** Keep OS data in sync with cloud storage
- **Notification daemon:** Reminders, collaboration alerts
- **Indexer:** Build search indices for fast retrieval
- **AI worker:** Run non-blocking AI analysis in background

All services respect the host OS's resource limits and user preferences.

---

## 10. Conflict Resolution and Data Safety

### 10.1 Dual-Editing Scenarios

When the same file is edited in both legacy app and native app:

```
File: document.md

User edits in native app:
  Writes to OS storage
  Exports to host OS as document.md v2

User also edits in legacy app:
  Writes to host OS as document.md v1

Conflict Detection:
  OS detects version mismatch
  User is presented with merge dialog:
    [ ] Keep native version (v2)
    [ ] Keep legacy version (v1)
    [ ] Manual merge (line-by-line diff)
    [ ] Copy both (v1_legacy, v2_native)
```

### 10.2 Backup and Recovery

- **Auto-snapshot:** OS creates snapshots of all imported files at regular intervals
- **Version history:** OS maintains full version history in native format
- **One-click restore:** User can restore any version with one click
- **Trash recovery:** Deleted files go to trash; recoverable for 30 days

### 10.3 Data Safety Guarantees

1. **No silent data loss:** If import/export might lose data, user is warned
2. **Lossless export:** User can always export to original format with fidelity guarantee
3. **Format preservation:** Original files are never modified without permission
4. **Readable backups:** Snapshots are readable even if OS fails (stored in standard formats)

---

## 11. Keyboard Shortcut Compatibility Detailed

### 11.1 Universal Shortcuts

These work everywhere, in all contexts:

```
⌘/Ctrl+C       Copy
⌘/Ctrl+V       Paste
⌘/Ctrl+X       Cut
⌘/Ctrl+Z       Undo
⌘/Ctrl+Shift+Z Redo
⌘/Ctrl+S       Save
⌘/Ctrl+A       Select All
⌘/Ctrl+F       Find (in current document/window)
⌘/Ctrl+H       Find & Replace (in current document)
⌘/Ctrl+G       Go to Line (in editors)
⌘/Ctrl+,       Open Settings
⌘/Ctrl+?       Show Help
Escape          Cancel / Close modal
Tab             Indent (in editors); focus next (in forms)
Shift+Tab       Dedent (in editors); focus previous (in forms)
```

### 11.2 Legacy App Compatibility

- OS intercepts universal shortcuts and applies them consistently
- Legacy app receives the action (via simulated keypress or API call)
- If legacy app has its own behavior, it takes precedence
- User can override in settings

### 11.3 Native AI Shortcuts

Available only in native OS apps and AI-aware contexts:

```
⌘/Ctrl+/       Open command palette / AI sidebar
⌘/Ctrl+K       Open AI quick action
⌘/Ctrl+Shift+I Inspect/analyze selection with AI
⌘/Ctrl+Shift+R Refactor with AI (in code editor)
⌘/Ctrl+Shift+T Test generation (in code editor)
⌘/Ctrl+Space   AI inline suggestion (in editors)
⌘/Ctrl+J       AI chat (open sidebar)
⌘/Ctrl+Shift+C AI comment explanation
```

---

## 12. Example Workflows

### 12.1 Workflow: Migrate a Python Project

```
1. User opens OS
2. File → Import Project
3. Selects ~/my-python-project
4. OS detects:
   - requirements.txt (Python dependencies)
   - .git/ (Git history)
   - *.py files (source code)
5. OS creates native workspace:
   - All Python files available in native code editor
   - Dependency graph visualized
   - Git history integrated into OS timeline
6. User opens main.py in native editor
   - Syntax highlighting
   - AI-powered autocomplete
   - Real-time error checking
7. User can still run legacy Python IDE for testing if needed
8. Over time, user migrates all workflows to native editor
9. User exports updated project back to ~/my-python-project
10. Legacy tools can still work with the folder
```

### 12.2 Workflow: Bring in Browser Bookmarks

```
1. User opens Settings → Migrate Data
2. Selects "Import Browser Data"
3. Chooses browser (Chrome, Firefox, Safari)
4. OS reads bookmarks.html / browser API
5. Creates AI-native knowledge base:
   - Bookmarks indexed and searchable
   - URLs fetched and summarized with AI
   - Tags inferred from folder structure
   - Related bookmarks linked automatically
6. User can search: "Show me all bookmarks about React"
7. AI suggests: "You also have articles about Next.js and Vue"
8. User can export back to bookmarks.html anytime
9. AI keeps knowledge base in sync if user adds new bookmarks in native app
```

### 12.3 Workflow: Coexist with Legacy Office Software

```
1. User has existing Word documents
2. Drags document.docx into OS
3. OS imports and converts to native format
4. User sees options:
   - Edit in native word processor (AI-native)
   - Edit in legacy app (Word, LibreOffice)
   - Side-by-side view of both
5. User edits in native app
6. OS automatically keeps document.docx in sync (exports when native version changes)
7. User's coworker opens document.docx in Word (from host OS)
   - Sees the latest changes
   - Can edit and send back
8. OS detects the change, merges it intelligently
9. Both legacy and native workflows work without friction
```

---

## 13. Summary: Design Principles

| Principle | Implementation |
|-----------|-----------------|
| **No forced migration** | Users can use legacy apps indefinitely |
| **Interoperability first** | Files work in both contexts seamlessly |
| **Gradual adoption** | Progressive path from legacy to native |
| **Data safety** | Never lose data; always offer export |
| **Familiar UX** | Shortcuts, patterns, and workflows users know |
| **Performance motivation** | Native apps are noticeably faster |
| **AI as assistant** | Leaf agents help, don't replace legacy apps |
| **Format agnostic** | Accept any format; convert transparently |
| **Always reversible** | User can revert to legacy or export anytime |

---

## 14. Success Metrics

The compatibility layer is successful when:

1. **New user onboarding:** User can import existing project/files within 2 minutes
2. **Dual-editing:** User can edit same file in legacy and native apps without data loss
3. **Migration incentive:** User sees clear value in moving to native (performance, AI features)
4. **Keystroke consistency:** Familiar shortcuts work in all contexts
5. **Format preservation:** Exported files are readable in original tools
6. **Migration velocity:** User progresses from 10% native workflows to 50% within 1 month
7. **Reversibility:** User can export all data to original format in <5 minutes

---

## Appendix A: Format Support Matrix

| Format | Import | Export | AI Analysis | Notes |
|--------|--------|--------|-------------|-------|
| `.txt` | ✓ | ✓ | Text analysis | Plain text, no metadata |
| `.md` | ✓ | ✓ | Full + structure | Markdown parsing + linking |
| `.docx` | ✓ | ✓ | Content + metadata | Full fidelity conversion |
| `.pdf` | ✓ | ✓ | OCR + structure | Extract text + images |
| `.py` | ✓ | ✓ | AST + semantics | Full code analysis |
| `.js` / `.ts` | ✓ | ✓ | AST + semantics | TypeScript support |
| `.json` | ✓ | ✓ | Schema inference | Structured data |
| `.csv` | ✓ | ✓ | Column analysis | Delimiter detection |
| `.xlsx` | ✓ | ✓ | Formula + graph | Dependency tracking |
| `.html` | ✓ | ✓ | DOM + text | Semantic analysis |
| `.jpg` / `.png` | ✓ | ✓ | Vision + OCR | Image understanding |
| `.mp3` / `.wav` | ✓ | ✓ | Transcription | Audio to text + insights |
| `.git/` (repo) | ✓ | ✓ | Commit history | Full version tracking |

---

## Appendix B: Keyboard Shortcut Reference

See Section 11 for complete listing.

---

**Document 23 Complete.** Provides self-contained compatibility architecture ready for Claude Code implementation.
