<!-- Copilot / AI agent instructions for calibration-system repository -->
# Repository quick-guide for AI coding agents

Purpose: help an AI agent become immediately productive editing, testing, and extending the calibration-system monorepo.

High-level architecture
- Monorepo layout (root):
  - `apps/api` — Express + TypeScript API server, Prisma ORM, generates PDFs, handles approvals and calibrations. Start file: `apps/api/src/server.ts`.
  - `apps/web` — React + Vite frontend (TypeScript), Tailwind CSS, pages in `apps/web/src/pages` and reusable UI in `apps/web/src/components`.
  - `packages/shared` — shared types/utilities used by both apps (if present).
  - `scripts` — helper scripts (DB start, imports, seeding).

Developer workflows (how to run & debug)
- Start full dev stack (DB + API + Web): run `npm run dev` at repository root. This uses Docker for DB and concurrently to start services.
- API dev: `npm --prefix apps/api run dev` (uses `tsx watch src/server.ts`).
- Web dev: `npm --prefix apps/web run dev` (Vite). The frontend talks to backend at `/api` via Vite proxy.
- Prisma migrations and seeding: see `apps/api/package.json` scripts: `prisma:migrate`, `seed`, `seed:hub`.

Project-specific conventions & patterns
- Routes and modules: API endpoints are organized under `apps/api/src/modules/*/router.ts` (e.g. `calibrations/router.ts`, `approvals/router.ts`). Look for `requireAuth` / `requireRole` middleware.
- Event flow around calibrations:
  - Technicians create calibrations via `apps/web/src/pages/NewCalibration.tsx` which POSTs to `/api/calibrations` and then `/api/calibrations/:id/submit`.
  - Office/admin actions (approve/return) are in `apps/api/src/modules/approvals/router.ts` and `apps/api/src/modules/calibrations/router.ts`.
- Real-time notifications: server emits `pendingCalibrationsCount` via Socket.IO (see `apps/api/src/socket.ts`) and frontend listens in `apps/web/src/modules/admin/components/AdminLayout.tsx`. There's a legacy fallback: `window.dispatchEvent(new CustomEvent('calibrationStatusChanged'))` used locally.
- UI components: small component library in `apps/web/src/components/ui` (e.g. `dialog.tsx`, `input.tsx`, `button.tsx`) — prefer these for consistent styling.

Where to make common changes (examples)
- Change modal/dialog default size/padding: edit `apps/web/src/components/ui/dialog.tsx` or the page-level usage such as `apps/web/src/pages/CustomersPage.tsx`.
- Add server-side push on status changes: emit socket events from `apps/api/src/modules/*/router.ts` after DB updates (see existing `getIo()` usage).
- Update pending-count logic: API endpoint `GET /api/calibrations/pending-count` implemented in `apps/api/src/modules/calibrations/router.ts`.

Integration points & external deps
- Database: Prisma + PostgreSQL in Docker (scripts/start-db.ps1 orchestrates the DB). Check `prisma/schema.prisma` for models.
- Email: `nodemailer` used in `calibrations/router.ts` for sending reports.
- PDF generation: `generateReportPDF` in `apps/api/src/modules/calibrations/reportPdf.js`.
- Real-time: `socket.io` on server (`apps/api/src/socket.ts`) and `socket.io-client` on web client.

Testing & verification tips
- To verify UI changes: run web dev and open `http://localhost:5175` (or configured Vite port). Reproduce flows: create calibration, submit, and observe admin pending badge update.
- To test server events: restart `apps/api` after code changes (it runs under `tsx watch` by default). Check console logs for Socket.IO connection messages.

Conventions & code-style notes
- Files use ES modules and TypeScript. Keep imports as `from './...'` or `from '@/...'` (alias configured in `tsconfig.json`).
- Use `auditLog({...})` helper when changing calibration fields server-side (pattern used in `calibrations/router.ts`).
- When modifying public APIs, update both `apps/api` routers and any client calls in `apps/web/src/api/client.ts` or page code.

Key files to inspect first (fast orientation)
- `apps/api/src/server.ts` — server entry and middleware
- `apps/api/src/modules/calibrations/router.ts` — core calibration flows (create, submit, review, return)
- `apps/api/src/modules/approvals/router.ts` — approval and certificate issuance path
- `apps/api/src/socket.ts` — Socket.IO init and `getIo()` helper
- `apps/web/src/pages/NewCalibration.tsx` — technician flow and submit calls
- `apps/web/src/modules/admin/components/AdminLayout.tsx` — pending badge, socket listener, polling fallback
- `prisma/schema.prisma` — data model reference

If you change something, run these commands locally:
```bash
# install deps
npm --prefix apps/api install
npm --prefix apps/web install

# start whole stack
npm run dev
```

If anything here is unclear or you want the file to include additional examples (e.g. code snippets to emit socket events or how to run migrations), tell me which topics to expand and I'll iterate.
