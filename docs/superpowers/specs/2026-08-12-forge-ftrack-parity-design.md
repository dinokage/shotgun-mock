# Forge: Path to a Real, ftrack-Comparable Production Tracking Platform

## Context

"Forge" (this repo, `shotgun-mock`) started as a frontend-only, fully mocked clickable
prototype of a Production Operating System for VFX/animation/games/film studios — an
ftrack/ShotGrid/Kitsu-style tool. The original brief (see
`attached_assets/Pasted-Build-a-complete-clickable-frontend-only-prototype-of-F_1785825967130.txt`)
explicitly called for no real backend, auth, or persistence: "a visualization prototype."

That prototype now exists and is unusually well developed (~30 pages, real drag-and-drop
Kanban, a React-Flow workflow editor, a hand-rolled Gantt/scheduler) — but it is a dead
end as a product: all state lives in `localStorage`/Zustand, there is no real
authentication, no persistence across users or sessions, and no real media handling. A
partially-started "real backend" scaffold exists (`artifacts/api-server` +
`lib/db` + an OpenAPI-first codegen pipeline via `lib/api-spec` → `lib/api-zod` /
`lib/api-client-react`) but is essentially empty — one health-check endpoint, no schema,
no auth, and the frontend doesn't consume it. A separate, orphaned Python/FastAPI server
(`artifacts/forge/server`) is genuinely functional (real auth, RBAC, a working task
auto-assignment algorithm) but is never called by the frontend and represents a
parallel, disconnected "truth."

The goal of this design is to chart the path from "convincing mockup" to a real product
that reaches functional parity with ftrack — and beats it on a few deliberately chosen
dimensions — phase by phase, reusing the mock's UI, data shapes, and the FastAPI
server's proven logic wherever possible rather than starting over.

This design was produced after:
- A full audit of the current frontend (`artifacts/forge`), its mock data model, state
  management, and the orphaned FastAPI server.
- A full audit of the existing backend scaffold (`artifacts/api-server`, `lib/db`,
  `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`) and how far it's gotten.
- External research into ftrack's product surface, pricing, and (to the extent publicly
  discoverable) its technical architecture.
- A scoping conversation with the user, whose answers are encoded as the four decisions
  below.

## Decisions made (scoping)

1. **Backend foundation:** Extend the existing TypeScript scaffold (Express 5 +
   Postgres/Drizzle + OpenAPI-first codegen via orval → Zod + React-Query), not the
   orphaned FastAPI server and not a from-scratch rewrite. It's architecturally sound
   and already wired into the pnpm workspace and the frontend's dependencies — it just
   needs a schema, endpoints, and auth filled in.
2. **Differentiators to build for real (not just mock) in Phase 1–2 horizon:** AI
   Assistant with cited answers, Knowledge Graph / Impact Analysis, No-code Entity
   Schema Builder, Audit / Time-Travel.
3. **DCC integrations** (Maya/Nuke/Houdini plugins, a Connect-style desktop launcher):
   **deferred indefinitely.** Out of scope for all phases in this plan.
4. **Hosting model:** Multi-tenant SaaS first (matches ftrack's primary model) — tenant
   scoping designed into the schema and auth from Phase 0, not retrofitted later.

## Comparison: ftrack vs. Forge (current) vs. Forge (target)

| Dimension | ftrack | Forge (current) | Forge (target) |
|---|---|---|---|
| Core PM | Studio: tasks, scheduling, custom workflow schema | Fully mocked, richly interactive, zero persistence | Same UI, real multi-tenant backend |
| Review | ftrack Review / Review Pro (upsold tier) + cineSync, frame-accurate | Mocked annotation/approval UI, no real media | Real media storage + review, bundled not upsold |
| Extensibility | Schema-per-project, admin/API-configured | No-code Schema Builder designed in the original brief but never built | No-code Schema Builder — genuinely no-code, a step beyond ftrack's admin-only model |
| Real-time | WebSocket event hub, core to both UI and Connect/pipeline automation | None — everything is static/local state | Pragmatic event layer introduced in Phase 3, not over-built upfront |
| Impact analysis | Not offered | Mocked graph UI with canned explanations | Real dependency graph computed from real relational data |
| Audit / time-travel | Not offered | Mocked | Real event-sourced audit log with "view as of" and rollback |
| AI | None found in current product (confirmed absent across site, docs, changelog) | Canned "AI insight" cards, static text | Real assistant, answers always cite the specific entities/events used, built only after real data exists to cite |
| DCC integrations | Deep — Connect (Python + PySide2/Qt) + a shared publish/load/asset-management plugin framework per DCC | Narrative Python print-statement stubs only | **Explicitly deferred** |
| Hosting | SaaS-first; self-hosting is an Enterprise-only add-on | N/A (no backend) | Multi-tenant SaaS-first, tenant-aware from day one |
| Pricing | $10–30/user/month (Review / Studio tiers); external reviewers are free/unlimited seats | N/A | Not decided in this design — worth revisiting once Phase 2 (Review) ships, since ftrack's free-external-reviewer model is a proven adoption lever worth copying |
| Corporate context | Owned by Backlight (PE-backed) since 2022, alongside cineSync/iconik/Celtx | Independent | — |

**Key technical facts about ftrack informing this plan** (confirmed via their public docs
and GitHub unless noted as inferred):
- Their API is entity/query-based (`session.query("Project where status is active")`),
  not plain REST — Python and JS SDKs sit on top of it.
- A WebSocket pub/sub **event hub** underlies both live UI updates and pipeline
  automation (custom "actions" respond to events); webhooks are a newer, simpler layer
  alongside it.
- Custom entity types are **schema-per-project**: `ObjectType`/`Status`/`Type` composed
  into a `ProjectSchema` assigned per project — a configurable relational model, not a
  fully schema-less one.
- Backend language/framework and DB engine are not publicly documented; Python is a
  reasonable inference from their SDK/tooling ecosystem, not a confirmed fact.
- **No AI features exist in the product today** — this is a genuine whitespace, not a
  catch-up feature.

## Recommended approach: vertical-slice-first

Three approaches were considered:

1. **Vertical-slice-first (recommended).** Build a thin auth/tenancy foundation, then
   ship one full-stack domain at a time (schema → API → frontend wiring), mirroring how
   the mock frontend itself was already built page-by-page. Differentiators land after
   there's real data to ground them in.
2. **Foundation-heavy / extensibility-first.** Build the generic schema-builder engine
   and event hub before wiring any domain UI, so every future domain "falls out for
   free." Rejected as the primary strategy: much longer time-to-first-real-feature, and
   risks over-engineering a generic entity engine before real usage validates the
   design.
3. **Differentiator-first wedge.** Ship a flashy AI/graph demo on top of the existing
   mock data before building any real backend. Rejected: an AI assistant or impact graph
   over fake data isn't a real differentiator, it's a demo, and risks throwaway work.

Vertical-slice-first is recommended because it produces a real, demoable, trustworthy
product fastest, de-risks the backend rewrite early (rather than late), and keeps
momentum consistent with how this codebase has actually evolved so far.

## Phase-wise plan

### Phase 0 — Foundation
- Multi-tenant auth: `studios`/`organizations` + `users` tables, tenant-scoped from the
  start. Replace both the frontend's plaintext-password mock check
  (`artifacts/forge/src/store/auth.ts` against the hardcoded `USERS` array) and the
  orphaned FastAPI server's hardcoded-JWT-secret approach with real session/JWT auth in
  `artifacts/api-server`.
- RBAC matching the role hierarchy already encoded in
  `artifacts/forge/src/data/mockData.ts` (`vfx_producer > production_manager >
  coordinator > supervisor > lead > senior_artist > artist > junior_artist > client`).
- Retire and rewrite `docs/superpowers/plans/2026-08-12-core-backend.md` — it currently
  targets a nonexistent `artifacts/server` package and a flat `lib/db/src/schema.ts`,
  which conflicts with the real scaffold already in place (`artifacts/api-server`,
  `lib/db/src/schema/index.ts` as a directory, and the OpenAPI/orval/zod layer the old
  plan doesn't account for at all).
- Get `DATABASE_URL`/Postgres actually provisioned and `drizzle-kit push` working;
  extend `lib/api-spec/openapi.yaml` with auth endpoints and regenerate codegen.

### Phase 1 — Core PM vertical slice
- Drizzle schema for Projects, Shots, Assets, Tasks, Users, Departments — tenant-scoped,
  modeled on the shapes already proven out in `mockData.ts`.
- OpenAPI-first CRUD endpoints in `artifacts/api-server`, Zod-validated via
  `@workspace/api-zod`, codegen refreshed into `@workspace/api-client-react`.
- Wire `artifacts/forge` to consume the generated React Query hooks — replacing the
  decorative `src/lib/apiClient.ts` and the persisted mock Zustand stores
  (`store/tasks.ts`, `store/projects.ts`, `store/shots.ts`) as the source of truth for
  entity data. Zustand remains for UI-only state (modals, filters, panel visibility).
- Kanban drag-and-drop, bulk edit, and filters now hit the real API with optimistic
  updates. Server-side RBAC enforcement — porting the `canAssignTo()` logic from
  `mockData.ts` to be server-authoritative, not just a UI-level gate.

### Phase 2 — Media Review
- Version/Review/annotation data model, comments tied to timecodes, visible approval
  chain — matching the UI already built in `review.tsx` (1473 lines) and
  `client-review.tsx`.
- Real object storage (S3-compatible — Cloudflare R2 for SaaS, MinIO for the self-host
  story ftrack reserves for Enterprise) for uploaded media, with thumbnail generation.
- Token/link-based read-only client reviewer access — no seat cost, deliberately
  matching ftrack's free-external-reviewer adoption lever.

### Phase 3 — Scheduling & real-time layer
- A pragmatic event/notification layer (Postgres `LISTEN`/`NOTIFY` or a lightweight
  pub/sub) to support live review comments and notifications — introduced now, not
  upfront, and sized to what Phases 2–7 actually need rather than a full generic event
  hub from day one.
- Wire `scheduling.tsx`'s capacity grid and `timesheets.tsx`/`daily-standup.tsx` to real
  task/timelog data.
- Port the working task auto-assignment algorithm from the orphaned FastAPI server
  (`artifacts/forge/server/app`) into the TypeScript backend, then retire the Python
  server and the DCC "integration" stubs that reference it.

### Phase 4 — Audit / Time-Travel + Knowledge Graph
- Append-only audit log capturing field-level diffs on every mutation (a Drizzle
  transaction hook or outbox pattern) — powers both the Time-Travel UI
  (`audit.tsx`) and feeds the Phase 3 event layer.
- Dependency edges (already partially present as `dependencies` fields in the mock
  Task/Asset model) become real relational data, queried via recursive CTEs for Impact
  Analysis; plain-language summaries are generated from real query results
  (rule-based — no AI needed yet).

### Phase 5 — No-code Entity Schema Builder
- Generic `entity_types` / `entity_fields` / `entity_relationships` metadata tables plus
  a validated dynamic entity store, so studios can define new entity types without
  migrations.
- Deliberately scoped to **new custom types only** — Projects/Tasks/Shots/Assets stay on
  the hardcoded Phase 1 schema. Retrofitting core entities onto the generic engine is
  out of scope; it risks destabilizing something already working for marginal benefit.

### Phase 6 — AI Assistant with cited answers
- Built last on purpose: retrieval is grounded in the real audit log and knowledge graph
  from Phase 4, so citations reference real records rather than being hallucinated.
- Start with rule-based/templated responses over real queries; evaluate an actual LLM
  integration only once the retrieval layer is solid, to control citation-accuracy risk.

### Phase 7 — Workflow engine execution
- Make the graphs already built in `workflow-editor.tsx` (React Flow) actually execute
  server-side: trigger/condition/approval/notification node types, using the Phase 3
  event layer for pause-on-approval and resume-on-action in `workflow-run.tsx`.

### Deferred indefinitely
DCC integrations, a Connect-style desktop launcher, a real plugin marketplace backend,
and on-prem/self-host packaging. Explicitly out of scope per the scoping decisions
above; revisit only after Phases 0–7 are solid.

## Cross-cutting concerns (apply throughout)

- **Testing:** Vitest is already in the workspace (per the original core-backend plan's
  stated stack); each phase should add API-level tests for new endpoints and
  component/interaction tests for newly-wired frontend flows, not just typecheck.
- **Retiring dead code:** `src/lib/apiClient.ts`'s decorative fetch simulation and the
  orphaned FastAPI server (`artifacts/forge/server`) should be explicitly removed once
  Phase 1 and Phase 3 (respectively) supersede them — not left running in parallel
  indefinitely as a second "truth."
- **Workspace conventions to respect:** `@workspace/*` package naming, `pnpm-workspace.yaml`'s
  pinned `drizzle-orm`/`zod` catalog versions, and the existing `tsconfig.base.json`
  strict settings.

## Open risks / questions for later phases

- Pricing/packaging strategy is intentionally undecided here — revisit once Phase 2
  ships and there's a real product to price.
- The generic entity engine (Phase 5) is the highest architectural-risk piece of this
  plan; if it proves harder than expected, the fallback is to keep it scoped to a small
  set of admin-defined custom fields rather than a fully dynamic entity system.
- LLM provider/cost model for Phase 6 is not decided — should be revisited with current
  options at that time rather than locked in now.
