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
auto-assignment algorithm — the logic lives inline in `app/api/endpoints.py`; the
`app/services/` directory it might logically belong in is empty) but is never called by
the frontend and represents a parallel, disconnected "truth." Notably,
`artifacts/forge/docker-compose.yml` already defines (unused) Postgres, Neo4j, and MinIO
services — reusable raw material for Phase 0's local-dev provisioning rather than
something to write from scratch.

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
- A live re-verification pass (2026-08-12, via parallel research agents) that re-fetched
  ftrack.com, developer.ftrack.com, github.com/ftrackhq, and backlight.co directly, and
  re-audited this document's codebase claims against the actual repo — see "Research
  provenance" at the end of the comparison section for what was confirmed, corrected, or
  added.

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
| Review | Sold as its own unbundled SKU ($10–15/user/mo) as well as bundled into Studio; Review Pro add-on ($120–150/*workspace*/mo: 10-way sync, 4K, watermarking) + cineSync (bundled, ftrack-created, not just a sibling brand) | Mocked annotation/approval UI, no real media | Real media storage + review, bundled not upsold |
| Extensibility | Schema-per-project, admin/API-configured; newer "Workflows" system allows arbitrary-depth custom hierarchies (replacing older, depth-limited "Workflow Schemas") | No-code Schema Builder designed in the original brief but never built | No-code Schema Builder — genuinely no-code, a step beyond ftrack's admin-only model |
| Real-time | WebSocket event hub (socket.io pub/sub; topics incl. `ftrack.update`, `ftrack.action.discover`/`launch`) drives live UI + Actions automation; a separate, newer, **SaaS-only** webhook layer (Automation → Trigger → WebhookAction, capped at 10, create/update only) layers on simple third-party integration | None — everything is static/local state | Pragmatic event layer introduced in Phase 3, not over-built upfront |
| Impact analysis | Not offered | Mocked graph UI with canned explanations | Real dependency graph computed from real relational data |
| Audit / time-travel | Not offered | Mocked | Real event-sourced audit log with "view as of" and rollback |
| AI | None found in current product — confirmed absent live (2026-08-12) across homepage, Features, Studio, Review, Workflows, and What's New/changelog pages; the only "AI" surface anywhere in the Backlight family is **Iconik**, a separate media-asset-management product, not ftrack itself | Canned "AI insight" cards, static text | Real assistant, answers always cite the specific entities/events used, built only after real data exists to cite |
| DCC integrations | Deep — **Connect 2 / open-source "Pipeline Framework"** (rebuilt 2022+, Python 3, layered plugin architecture with a host-UI abstraction enabling headless/non-Qt DCCs), shared publish/load/asset-management plugins per DCC | Narrative Python print-statement stubs only | **Explicitly deferred** |
| Hosting | SaaS-first (confirmed: GCP for compute + AWS S3 for storage — a hybrid-cloud split); self-hosting is a real Enterprise add-on — Docker + Kubernetes, **MariaDB** (not Postgres), 30GB RAM/10 CPU minimum runtime, not just a contract line item | N/A (no backend) | Multi-tenant SaaS-first, tenant-aware from day one (Postgres — a deliberate divergence from ftrack's MariaDB; no self-host planned in current phases) |
| Pricing | Confirmed live: Review $10–15/user/mo, Studio $25–30/user/mo, Enterprise contact-sales (no public number); Review Pro breaks the per-user pattern entirely at $120–150/*workspace*/mo; external reviewers confirmed free/unlimited seats | N/A | Not decided in this design — worth revisiting once Phase 2 (Review) ships, since ftrack's free-external-reviewer model is a proven adoption lever worth copying |
| Corporate context | Owned by Backlight (PSG-backed growth equity) since 2022, alongside cineSync (ftrack-created, bundled), iconik, Celtx, Wildmoka, Zype | Independent | — |

**Key technical facts about ftrack informing this plan** (live-verified 2026-08-12 via
direct fetches of developer.ftrack.com, ftrack.com, github.com/ftrackhq, and
backlight.co unless noted as inferred — see "Research provenance" below):
- Their API is entity/query-based, confirmed with real syntax:
  `session.query('Task where status is "In Progress"')`, `session.query('User where
  username is "test_user"').one()` — not plain REST. Python (`ftrackhq/ftrack-python`)
  and JS/TS (`ftrackhq/ftrack-javascript`) SDKs sit on top of it; a schema-generator
  package (`ftrack-ts-schema-generator`) confirms the API is schema-driven per instance.
- A WebSocket (socket.io) pub/sub **event hub** underlies both live UI updates and
  pipeline automation — "Actions" subscribe to `ftrack.action.discover` (to
  conditionally appear in the UI) and `ftrack.action.launch` (to execute), returning a
  Message, Form, or embedded HTML Widget. **Webhooks are a distinct, newer, SaaS-only
  layer** on top (not the same mechanism as the event hub) — cloud-only, capped at 10,
  create/update-only, built from chained Automation → Trigger → WebhookAction entities.
- Custom entity types are **schema-per-project**: `ObjectType`/`Status`/`Type` composed
  into a `ProjectSchema`/`Workflow` assigned per project — a configurable relational
  model, not a fully schema-less one. The newer "Workflows" system removes the older
  hierarchy-depth limits.
- Self-hosting is concretely **Docker on Kubernetes, MariaDB 10.11** as the database
  (30GB RAM / 10 CPU minimum; on AWS: EKS + RDS-for-MariaDB + S3 + ALB). Their SaaS
  offering runs on **GCP for compute + AWS S3 for storage** per their own security page
  — a confirmed hybrid-cloud split. The actual web/app framework (Django/Flask/etc.) is
  still **not publicly documented**; Python is a reasonable inference from their
  SDK/tooling ecosystem, not a confirmed fact about their own server.
- Connect was substantially rearchitected in 2022 ("Connect 2") into an open-source,
  layered "Pipeline Framework" (Python 3) with a host-UI abstraction — more sophisticated
  than a simple bridge app, which reinforces (rather than changes) the decision to defer
  DCC integrations rather than underestimate the lift.
- **No AI features exist in the product today** — this is a genuine whitespace, not a
  catch-up feature. Confirmed by checking every major marketing/product/changelog page
  live; the sole "AI" mention found site-wide is a single 2021 industry-commentary blog
  post, not a shipped feature.

### ftrack terminology mapping (for Phase 1 / Phase 5 schema naming)

Useful when naming our own schema/entities so a reader familiar with ftrack — or a future
migration tool — can map concepts directly:

| ftrack term | Meaning | Forge equivalent |
|---|---|---|
| `TypedContext` | Umbrella API class for Folder/Shot/Sequence/Task/custom entities | Our generic entity-type system (Phase 5) |
| `ObjectType` | The entity-type definition itself (e.g. Shot, or a custom type) | `entity_types` (Phase 5) |
| `AssetVersion` | A published iteration of an `Asset` | `versions` (Phase 1/2) |
| `ProjectSchema` / `Workflow` | Per-project configured entity hierarchy + allowed statuses/types | Our No-code Schema Builder (Phase 5) |
| `Notes` | Comments/annotations | Review comments (Phase 2) |
| `Actions` | Custom server-side automation triggered from the UI, built on the event hub | Workflow engine node types (Phase 7) |
| `Custom Attributes` | Custom metadata fields, including cross-entity links | Entity fields (Phase 5) |
| `Task Templates` | Reusable pre-configured task sets for fast project setup | Not yet planned — candidate for a later phase |

### Research provenance

The comparison table and technical facts above were re-verified live on 2026-08-12 by
three parallel research passes (product/UX, architecture/API, pricing/business) plus a
codebase re-audit, rather than relying solely on training-data knowledge. Primary sources fetched directly: the ftrack.com homepage plus its Studio, Features,
Review, Review Pro, Pricing, What's New, Workflows, VFX-use-case, and Security pages;
`developer.ftrack.com` (API, websocket-events, actions, webhooks, DCC-integration docs);
`github.com/ftrackhq`; `backlight.co/products`. Some documentation subdomains
(`help.ftrack-studio.backlight.co`, `help.ftrack-review.backlight.co`) blocked automated
fetches (HTTP 403) and were corroborated via search-engine snippets instead — flagged
inline above wherever a claim rests on that weaker evidence. The codebase re-audit found
**zero drift** from this document's original claims about `artifacts/api-server`,
`lib/db`/`lib/api-spec`, `artifacts/forge/server`, and the frontend's mock-only
`apiClient.ts`/`store/auth.ts`.

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
  `artifacts/forge/docker-compose.yml`'s existing (currently unused) Postgres service
  definition is a reasonable starting point for local dev rather than writing one from
  scratch.

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
  hub from day one. ftrack's own event hub (confirmed WebSocket/socket.io, topic-based
  pub/sub) validates this shape without requiring us to match its scale — we don't need
  a separate SaaS-only webhook layer on top until real third-party integrations demand
  one, which is out of scope for all current phases.
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
  event layer for pause-on-approval and resume-on-action in `workflow-run.tsx`. ftrack's
  "Actions" pattern (subscribe to a discover topic to conditionally appear, a launch
  topic to execute, respond with a Message/Form/Widget) is a reasonable reference shape
  for our node-type contracts, without needing their full event-hub scale.

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
  ships and there's a real product to price. Note for that future discussion: ftrack's
  own pricing isn't purely per-seat — Review Pro bills per-*workspace*
  ($120–150/mo), not per-user, which is worth considering as a precedent if Forge ever
  wants to price a heavy-usage add-on without penalizing team size.
- The generic entity engine (Phase 5) is the highest architectural-risk piece of this
  plan; if it proves harder than expected, the fallback is to keep it scoped to a small
  set of admin-defined custom fields rather than a fully dynamic entity system.
- LLM provider/cost model for Phase 6 is not decided — should be revisited with current
  options at that time rather than locked in now.
