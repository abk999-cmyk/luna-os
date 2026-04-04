# Contributing to Luna OS

## Setup

1. Install prerequisites:
   - [Rust](https://rustup.rs/) (stable)
   - [Node.js](https://nodejs.org/) 20+
   - [Tauri CLI](https://tauri.app/v2/guides/getting-started/setup/): `cargo install tauri-cli`

2. Clone and install:
   ```bash
   git clone https://github.com/abk999-cmyk/luna-os.git
   cd luna-os/luna
   npm install
   ```

3. Run in development:
   ```bash
   npm run tauri dev
   ```

## Project Structure

See `CLAUDE.md` for detailed architecture and conventions.

## Code Style

- TypeScript: strict mode, no `any` where avoidable
- React: functional components, Zustand for state
- Rust: standard formatting (`cargo fmt`)
- All HTML rendering must use `sanitizeHtml()` from `src/utils/sanitize.ts`
- UI uses GLASS design tokens from `src/components/apps/glassStyles.ts`

## Testing

```bash
npm test          # Run frontend tests
cargo test        # Run backend tests
npx tsc --noEmit  # Type check
```

## Pull Request Process

1. Create a feature branch
2. Make changes with tests
3. Run `npx tsc --noEmit && npm test && cargo check`
4. Push and create PR against `main`
