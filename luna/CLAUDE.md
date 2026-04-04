# Luna OS Development Guide

## Project Overview
AI-native desktop OS built with Tauri v2 (Rust backend + React/TypeScript frontend).
An LLM conductor (GPT-5.4) controls 23+ built-in apps via structured JSON actions.

## Architecture
- **Backend:** Rust (Tauri v2) — action dispatch, agent system, SQLite persistence, security
- **Frontend:** React 19 + TypeScript + Zustand — window management, app rendering, design system
- **AI:** GPT-5.4 conductor that generates JSON actions from natural language

## Key Directories
- `src-tauri/src/` — Rust backend
  - `action/` — dispatch, handlers, queue, history, undo
  - `agent/` — conductor, orchestrator, LLM client, streaming
  - `persistence/` — SQLite database
  - `security/` — permissions, audit, sandbox
- `src/` — React frontend
  - `components/apps/` — 23 built-in app components
  - `components/primitives/` — 29 UI primitives for dynamic apps
  - `components/shell/` — TopBar, Dock, HomeSurface, Sidebar
  - `renderer/` — DynamicRenderer, ComponentRegistry, dataBinding
  - `stores/` — Zustand state (window, agent, shell, activity, app, task, workspace)
  - `ipc/` — Tauri IPC wrappers

## Commands
- `npm run dev` — Vite dev server (port 1420)
- `npm run tauri dev` — Full Tauri app with Rust backend
- `npm run test` — Vitest test suite
- `npm run build` — Production build
- `cargo check` — Rust type check
- `cargo test` — Rust tests

## Testing
- Framework: Vitest + React Testing Library + jsdom
- Test files: `src/__tests__/*.test.{ts,tsx}`
- Setup: `src/test/setup.ts` (mocks Tauri IPC, AudioContext)
- Run: `npm run test` or `npx vitest run`

## Code Conventions
- Use GLASS design system tokens from `src/components/apps/glassStyles.ts`
- All apps use inline styles with GLASS fragments (no CSS modules per app)
- Primitives follow PrimitiveProps interface: `{ id, props, onEvent, children?, layout? }`
- IPC wrappers in `src/ipc/` use `invoke()` from `@tauri-apps/api/core`
- Zustand stores use the `create` pattern with `set` and `get`
- Rust handlers registered in `action/handler_registry.rs::register_core_handlers()`
- All HTML rendering must use `sanitizeHtml()` from `src/utils/sanitize.ts`

## Design System
- GLASS module exports: surface, elevated, inset, accentBtn, ghostBtn, tab, tabActive
- Semantic colors: hoverBg, activeBg, selectedBg, selectedBorder, dividerColor, accentColor
- Type scale: GLASS.text (xs=11 through xxl=28)
- Spacing: GLASS.space (xs=4 through xxl=32)
- Radii: GLASS.radius (sm=6 through xl=16)
