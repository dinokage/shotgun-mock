# Forge

Forge is a Production Operating System for VFX, animation, and games studios — task
tracking, media review, scheduling, and studio administration in one tool, aimed at
functional and interactive parity with tools like ftrack. `artifacts/forge` (the
frontend) is a richly interactive, feature-complete product experience built against
mock data with real client-side persistence; `artifacts/api-server` (the backend, owned
by a separate collaborator) is a work in progress and not yet wired to the frontend.

## Run & Operate

- `pnpm --filter @workspace/forge run dev` — run the Forge frontend (port 5173)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, not yet
  consumed by the frontend)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/forge run test` — frontend test suite (Vitest)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
  from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env for the backend: `DATABASE_URL` — Postgres connection string

## Stack

**Frontend** (`artifacts/forge`): React 18 + Vite + TypeScript, Tailwind v4, shadcn/radix
components, Zustand (with `persist` middleware for anything meant to survive reload),
`wouter` for routing, `framer-motion` for animation, `@dnd-kit` for drag-and-drop,
`@xyflow/react` for the workflow editor's node canvas, `recharts` for charts.

**Backend** (`artifacts/api-server`, in progress): pnpm workspaces, Node.js 24,
TypeScript 5.9, Express 5, PostgreSQL + Drizzle ORM, Zod (`zod/v4`) + `drizzle-zod`
validation, Orval-generated API client/hooks from an OpenAPI spec, esbuild (CJS bundle).

## Product

Forge covers the full production-tracking surface a VFX/animation studio needs day to
day, built out to genuine ftrack-comparable feature depth (not a shallow mockup):

- **Task & asset management** — a unified Task Drawer (checklist, comments, approvals,
  daily time logging), typed dependency links (Finish-to-Start/Start-to-Start/etc. with
  lag), a self-serve "claim a task" queue, and a multi-level, saved-view tracking grid.
- **Review** — a shared internal/client annotation player (drawing tools, frame
  scrubbing, A/B wipe, motion-persistence "Ghosting"), Presentation Mode (lock viewers to
  a presenter's playhead), real browser-mic voice notes, and a persisted multi-tier
  Lead → Supervisor → Producer approval chain with a full audit history — a real
  differentiator, since ftrack itself only tracks a single status field per version.
- **Client Review Portal** — a separate, branded, token-gated portal for external
  stakeholders, with its own review/annotation flow and a moderated "transfer to
  internal team" step for client feedback.
- **Scheduling** — Team Board (drag-to-assign), Team Calendar (drag-to-reschedule), and
  Capacity Forecast (headcount-days vs. booked-plus-leave), plus persisted timesheets.
- **Workflows & Schema Builder** — a real node-based workflow editor (add/connect/save,
  with a dry-run "Test Run"), and a genuinely no-code Entity Schema Builder with seven
  field types including computed expressions (a hand-rolled safe evaluator, no `eval`) —
  ftrack's nearest equivalent is admin/API-configured, not actually no-code.
- **Dashboards** — role-differentiated Home dashboards (Producer/Supervisor/Artist),
  deterministic financials, and AI Insight cards whose "why" line is derived from real
  computed data (dependency fan-out, department pace, project risk) rather than canned
  text.
- **Cross-cutting** — a command palette (⌘K) with global search and real actions, a
  role-scoped Settings area (each of the 5 leadership tiers sees only the tabs their real
  permission-scheme capabilities grant), and a signature visual identity (true-black
  ground, a tally-amber/scope-cyan accent duotone, timecode typography, waveform-style
  "scope-trace" charts) pulled from the post-production world this product serves.

## Where things live

- `artifacts/forge/src/pages/` — one file (or folder, for multi-tab pages like
  `project-detail/`, `scheduling/`, `schema-builder/`) per route; 53 page components.
- `artifacts/forge/src/store/` — 20 Zustand stores, one per domain (tasks, projects,
  shots, reviews, permissions, schema, workflows, …). Stores are the source of truth for
  entity data; component-local state is for UI-only concerns (open/closed, drafts).
- `artifacts/forge/src/components/shared/` — cross-page shared components (TaskDrawer,
  CommandPalette, CreateTaskModal/CreateProjectModal, the unified `review/` annotation
  toolkit used by both the internal player and the client portal).
- `artifacts/forge/src/lib/motion.ts` — the app's shared animation vocabulary (easing
  curves, durations, reusable framer-motion variants) — reach for this instead of
  inventing new timing/easing per component.
- `artifacts/forge/src/data/mockData.ts` — the single source of generated mock data
  (projects, shots, assets, tasks, users, departments) everything else reads from.
- `artifacts/api-server/`, `lib/db/`, `lib/api-spec/`, `lib/api-zod/`,
  `lib/api-client-react/` — the in-progress TypeScript backend (OpenAPI-first: edit
  `lib/api-spec/openapi.yaml`, regenerate via the codegen command above).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design/planning history for
  this codebase, including a detailed ftrack feature comparison.

## Architecture decisions

- **Frontend and backend are intentionally decoupled tracks right now.** The backend is
  owned by a separate collaborator on a stack not yet finalized; the frontend's mock data
  + `localStorage`-backed Zustand stores are the interim source of truth, deliberately
  structured (real actions, real persistence within a session) so that swapping a store's
  internals for real API calls later is a contained change per store, not a rewrite.
- **The permission system is real, not decorative.** `store/permissions.ts` defines an
  actual capability matrix per role (`DEFAULT_PERMISSION_SCHEME`), and Settings' tab
  visibility, Reassign/Handoff actions, and other leadership-gated UI all read from it —
  so changing a role's capabilities in Settings genuinely changes what that role can do
  elsewhere in the app, not just what the Settings page itself shows.
- **No emojis anywhere in the product.** This is a deliberate, standing choice — Forge is
  professional B2B production software; use the existing `lucide-react` icon set instead.
- **Client portal keeps a visually distinct palette on purpose** (zinc/dark rather than
  the internal app's tally-amber/scope-cyan accent) — it's a separate, external-facing
  surface and shouldn't look like an admin tool.

## User preferences

- No emojis in the product UI or in written deliverables for this project.
- Do not commit to git or push without an explicit, direct request each time.
- When making structural/visual changes, verify with real browser evidence (screenshots,
  live interaction) before claiming something works — several real bugs in this codebase
  were only catchable that way, not from reading code alone.

## Gotchas

- Playwright's own bundled Chromium fails to install on this dev machine's macOS version;
  browser-based testing/QA scripts must launch with `{ channel: 'chrome', headless: true
  }` to drive the system-installed Google Chrome instead.
- A change to the root layout shell (`AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`) can
  outlive Vite's HMR sync on a long-lived browser tab — hard-refresh (Cmd+Shift+R) if a
  layout fix doesn't visibly apply.
- `pnpm-lock.yaml` is shared across the whole workspace (frontend + backend); when only
  one side's `package.json` changed, check the lockfile diff before committing it, since
  it can pick up the other side's in-flight, uncommitted dependency changes too.
- `artifacts/forge/src/lib/apiClient.ts` is a decorative fetch-simulation stub left over
  from an earlier iteration — don't build new features on it; use a real Zustand store
  action instead, following the pattern already used everywhere else in `src/store/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package
  details.
- `docs/superpowers/specs/2026-08-12-forge-ftrack-parity-design.md` — the full ftrack
  feature comparison and phased build plan this product's frontend work followed.
