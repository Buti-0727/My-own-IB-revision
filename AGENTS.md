# Repository Guidelines

## Project Structure & Module Organization

The application lives in `web/`. Next.js routes and API handlers are in `web/src/app/`; feature UI is grouped under `web/src/components/` (`papers/`, `practice/`, `settings/`). Shared logic is organized in `web/src/lib/` by domain, papers, PDF, storage, practice, AI, and server integration. Static assets belong in `web/public/`. Unit and browser tests are in `web/tests/unit/` and `web/tests/e2e/`. Product plans and design notes live in `docs/`. Keep personal paper PDFs in local-only `pastpapers/`; never commit them.

Follow `web/AGENTS.md` when editing the Next.js app. Before relying on Next.js APIs, consult the installed guides under `web/node_modules/next/dist/docs/`.

## Build, Test, and Development Commands

Run app commands from `web/`:

- `npm install` — install dependencies.
- `npm run dev` — start the local site at `127.0.0.1:3000`; the lifecycle hook opens the LM Studio app and copies the PDF.js worker; start its local server/model in the app.
- `npm run build` — create a production build.
- `npm run start` — serve the production build locally; it also opens LM Studio.
- `npm test` — run Vitest unit tests.
- `npm run test:e2e` — run Playwright browser tests.
- `npm run lint` and `npm run typecheck` — check ESLint and TypeScript.

## Coding Style & Naming

Use strict TypeScript, two-space indentation, double quotes, and semicolons. Name React components in PascalCase, functions and variables in camelCase, and files in kebab-case. Keep features separated by domain and preserve the local-only data and AI boundaries.

## Testing Guidelines

Add or update tests for behavior changes. Use `*.test.ts` or `*.test.tsx` for Vitest and `*.spec.ts` for Playwright. Cover regressions and important error states; no coverage threshold is configured. Run unit tests, lint, and type-check before submitting. Run browser tests when the Playwright browser is available, and report environment blockers rather than claiming they passed.

## Commits & Pull Requests

Recent history uses short conventional prefixes such as `feat:`, `fix:`, and `docs:`. Keep commits focused and describe the user-facing change. PRs should include a summary, verification commands and results, and screenshots for visual changes. Call out unresolved checks or setup requirements.

## Privacy & Local Configuration

Papers and progress stay in browser storage; answer text and photos are temporary. AI feedback must go only to LM Studio on loopback (`127.0.0.1:1234` by default), with no cloud fallback. Never commit personal past-paper PDFs, answer images, or credentials; keep `pastpapers/` and personal PDFs out of version control.
