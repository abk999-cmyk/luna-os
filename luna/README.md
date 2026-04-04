# Luna OS

An AI-native desktop operating system where every app is designed for AI control from the ground up.

## What is Luna OS?

Luna OS is a desktop environment built with Tauri v2 (Rust + React/TypeScript) where an LLM conductor controls 23+ built-in apps via structured JSON actions. Unlike screen-scraping approaches (OpenClaw), Luna's apps speak AI natively — no pixel hunting, no screenshot parsing, just direct API control at near-100% reliability.

## Key Features

- **AI Conductor**: GPT-5.4 controls all apps via 40+ action types
- **App Factory**: AI generates new apps at runtime from natural language
- **29 UI Primitives**: DataTable, Chart, Gauge, Toggle, Slider, and more
- **Liquid Glass Design**: Unified design system across all apps
- **Cross-App Intelligence**: AI reads and composes across open windows
- **Persistent State**: SQLite-backed, survives restart
- **Global Search**: Cmd+K searches notes, contacts, calendar, files
- **Proactive AI**: Contextual suggestions based on your activity
- **Real System Integration**: File manager browses real filesystem, system monitor shows real metrics

## Built-in Apps

Calculator, Calendar, Clock, Contacts, Email, File Manager, Kanban, Music Player, Notes, Photos, Pomodoro, Settings, Slides, Spreadsheet, System Monitor, Text Editor, Todo, Video Player, Weather, Browser, and more.

## Quick Start

```bash
# Prerequisites: Rust, Node.js 20+, Tauri CLI
cd luna
npm install
npm run tauri dev
```

## Architecture

```
luna/
├── src-tauri/src/     # Rust backend
│   ├── action/        # Dispatch, handlers, queue, history, undo
│   ├── agent/         # Conductor, orchestrator, LLM client
│   ├── persistence/   # SQLite database
│   └── security/      # Permissions, audit, sandbox
├── src/               # React frontend
│   ├── components/
│   │   ├── apps/      # 23 built-in app components
│   │   ├── primitives/# 29 UI primitives for dynamic apps
│   │   └── shell/     # TopBar, Dock, HomeSurface
│   ├── renderer/      # DynamicRenderer, ComponentRegistry
│   ├── stores/        # Zustand state management
│   └── ipc/           # Tauri IPC wrappers
```

## Testing

```bash
npm test              # Frontend (Vitest)
cargo test            # Backend (Rust)
```

## License

MIT
