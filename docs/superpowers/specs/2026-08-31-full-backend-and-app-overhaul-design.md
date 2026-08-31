# Forge — Full Backend, Review System, Auth, and Filter-UX Overhaul — Design Spec

**Date:** 2026-08-31
**Scope:** Six sub-projects, each with its own future spec→plan→implementation cycle
(this document is the master overview plus the detailed design for Sub-project 1,
which is first in the build order). No implementation happens until this spec is
reviewed and approved.

## 0. Context and constraints

Forge is a VFX/production-tracking app (`artifacts/forge` frontend, React 19 +
Vite + wouter + zustand + react-query + shadcn/ui; `artifacts/api-server`
backend, Express 5 + Drizzle ORM + Postgres). Today only `/auth`, `/projects`,
`/tasks` (minimal), `/users`, `/departments`, `/roles`, and (as of this
session) `/standups` are real, tenant-scoped, backend-integrated resources.
Everything else the UI shows — assets, shots, versions, reviews/annotations,
daily logs, task checklists/dependencies/comments/attachments/approval-history
— is frontend-only mock data (`artifacts/forge/src/data/mockData.ts`) held in
local zustand stores, intentionally staged that way per `forge-final.md` §6.

This initiative un-defers that: the goal is real projects, trackable and
reviewable end-to-end, backed by the real database, so the product can
actually be used and tested (DCC integration itself stays deferred/stubbed —
explicitly out of scope for this initiative per the user's instruction).

**Deployment constraints, binding on every sub-project below:**
- Frontend deploys to **Vercel**; backend runs **self-hosted via Docker
  Desktop** (`docker-compose.yml`, already working — see this session's
  Docker verification). Every new API route must work across that
  cross-origin boundary: `CORS_ORIGIN` (already an env var on the `api`
  service) must include the Vercel domain in production, and all writes go
  through the JSON REST API — no server-rendered coupling.
- **ORM is Drizzle**, staying Drizzle. No second ORM, no schema drift between
  `lib/db/src/schema` and what routes actually query — this repo does not use
  Prisma (see the earlier conversation turn where this was explicitly
  decided).
- Every new/changed table needs a real, committed Drizzle migration
  (`lib/db/drizzle/000N_*.sql`), generated the same way this session already
  did for `standup_updates` (`drizzle-kit generate` with a placeholder
  `DATABASE_URL`, since it only diffs schema, never connects).
- `pnpm run typecheck` (whole workspace) must stay green throughout — this is
  the project's actual CI gate.
- No changes to `artifacts/mockup-sandbox` (disconnected prototype, not part
  of the deployed app).

## 1. Sub-project overview and build order

| # | Sub-project | Depends on | Why this order |
|---|---|---|---|
| 1 | Full backend build-out | — | Foundational; everything else needs real data to attach to. |
| 2 | Auth & portal redesign | Mostly independent (uses existing real `/auth`) | Can build in parallel with 1; frontend-heavy. |
| 3 | Review system overhaul | 1 (needs real `versions`/`reviews`/`annotations`) | The annotation *data model* already exists client-side (`components/shared/review/types.ts`'s `Annotation` type) — this makes it real and RBAC-scoped. |
| 4 | Filter-UX overhaul | 1 (needs real list data to filter), and ideally the ShotGrid parity audit (running independently, see `docs/superpowers/plans/2026-08-31-shotgrid-parity-audit.md`) | Filters should satisfy both ShotGrid parity and the reference-app pattern in one implementation. |
| 5 | Ancillary features (File-menu items, Daily-ToDo-style modal, branch-grouped chat roster) | Loosely depends on 1/2 for real data | Lowest priority; nice-to-have polish. |
| 6 | Verification & PRD gate | All of the above | Final full-product functional pass before any push to a shared branch. |

Sub-projects 2-6 get their own detailed spec (following this same
brainstorming process) shortly before their implementation starts — §3-7
below are intentionally lighter-weight direction-setting, not
implementation-ready detail, except §2 (Sub-project 1), which is fully
detailed because it's first.

---

## 2. Sub-project 1: Full backend build-out (detailed)

### 2.1 Schema additions

All in `lib/db/src/schema/`, following the exact conventions already
established (`text("id").primaryKey()`, `tenantId` FK with `onDelete:
"cascade"`, `createdAt: timestamp("created_at").defaultNow().notNull()`).

**`production.ts` additions/changes:**
- `episodesTable` — `id, tenantId, projectId, name, createdAt`.
- `sequencesTable` — `id, tenantId, projectId, episodeId (nullable), name, createdAt`.
- `shotsTable` — extend with: `episodeId (nullable FK)`, `sequenceId (nullable FK)`, `assigneeId (nullable FK to users)`, `frameRange`, `duration (integer)`, `complexity`, `currentVersion`, `usdVersion (nullable)`, `internalReviewStatus`, `clientReviewStatus`, `thumbnail (nullable)`, `notes`, `updatedAt`.
- `assetsTable` — extend with: `type`, `assigneeId (nullable FK)`, `version`, `usdVersion (nullable)`, `tags (jsonb string[])`, `thumbnail (nullable)`, `fileSize`, `polyCount (nullable)`, `dependencies (jsonb string[])`, `publishStatus`, `description`, `notes (nullable)`, `updatedAt`.
- `tasksTable` — extend with: `title`, `description`, `priority`, `dueDate`, `estimatedHours`, `actualHours`, `tags (jsonb string[])`, `department`, `pipelinePhase`, `weeklyRating (nullable)`, `lastStatusUpdate`. (Per the "everything, all at once" decision, the nested structures below become their own tables rather than JSONB blobs, since they need independent querying/RBAC — e.g. "show me all comments on tasks I can see" — which a JSONB blob can't do efficiently or safely.)
- `versionsTable` — extend with: `versionNumber`, `thumbnail (nullable)`, `derivedFromId (nullable, self-referencing FK)`, `fileSize`. (`status`/`notes`/`createdById`/`createdAt` already exist.)
- `dailyLogsTable` — `id, tenantId, taskId (FK), userId (FK), date, hours, note, createdAt`.

**New `lib/db/src/schema/tasks-detail.ts`** (nested Task sub-structures, each its own table so RBAC/queries scale):
- `taskChecklistItemsTable` — `id, tenantId, taskId (FK), text, done (boolean), position (integer)`.
- `taskDependenciesTable` — `id, tenantId, taskId (FK), dependsOnTaskId (FK), type (FS/SS/FF/SF), lagDays (nullable)`.
- `taskCommentsTable` — `id, tenantId, taskId (FK), userId (FK), text, createdAt`.
- `taskAttachmentsTable` — `id, tenantId, taskId (FK), url, uploadedById (FK), createdAt`.
- `taskApprovalEventsTable` — `id, tenantId, taskId (FK), action, byUserId (FK), byRole, createdAt`. (Append-only audit trail, matching the frontend's `ApprovalEvent[]` concept — never updated or deleted, only inserted.)

**New `lib/db/src/schema/reviews.ts`:**
- `reviewsTable` — `id, tenantId, entityId, entityType (shot/asset), versionId (FK), reviewerId (FK), status, comments, frame (nullable integer), createdAt, updatedAt`.
- `annotationsTable` — `id, tenantId, versionId (FK), frame (integer), type (select/pen/arrow/rectangle/text), color, x, y, w (nullable), h (nullable), points (nullable jsonb Point[]), text (nullable), startFrame (nullable), endFrame (nullable), fontFamily (nullable), fontSize (nullable), backgroundColor (nullable), createdById (FK), createdAt`. Maps 1:1 onto the existing frontend `Annotation` interface (`components/shared/review/types.ts`) — this is "persist the existing shape," not a new design.

### 2.2 Routes

One route file per resource, in `artifacts/api-server/src/routes/`, each
mounted in `routes/index.ts`, each using `tenantAuthMiddleware` and the
existing `eq(table.tenantId, tenantId)` scoping pattern:

`episodes.ts`, `sequences.ts`, `assets.ts`, `shots.ts`, `versions.ts`,
`reviews.ts` (covers both `reviewsTable` and `annotationsTable` under
`/reviews` and `/reviews/:versionId/annotations`), `daily-logs.ts`. Extend
existing `tasks.ts` for the enriched fields plus new nested-resource routes
(`/tasks/:id/checklist`, `/tasks/:id/comments`, `/tasks/:id/dependencies`,
`/tasks/:id/attachments`, `/tasks/:id/approval-history`).

**RBAC note carried into route design (ties to Sub-project 3):** list
endpoints (`GET /shots`, `GET /reviews`, etc.) return tenant-scoped data
without capability filtering (matching the existing `tasks`/`projects`
pattern) — role-based *visibility* is applied by the frontend, the same way
the standup feed's RBAC filter already works. This is a deliberate consistency
choice, not a shortcut: capability-based *write* gating (who can create/edit)
does get server-enforced per-route where sensitive (matching the
`requireCapability` pattern from the RBAC hardening plan), but read-visibility
filtering stays a frontend concern throughout this app, so Sub-project 3's
RBAC rules are additive on the frontend, not a new backend pattern.

### 2.3 Frontend rollout

One page-group at a time, each becoming fully react-query-backed (replacing
its zustand store) before moving to the next:
1. **Shots** (`shots.tsx`, `shot-detail.tsx`) — also feeds Tracking Grid.
2. **Assets** (`assets.tsx`, `asset-detail.tsx`).
3. **Versions/Reviews** (`review.tsx`, `client-review.tsx`) — directly sets up Sub-project 3.
4. **Task enrichment** (`tasks.tsx`, `task-detail.tsx`, `TaskDrawer`).
5. **Daily logs** (already partially covered by this session's Daily Standup fix; extends to task-level logging).

### 2.4 Seed data

Extend `scripts/src/seed.ts` to generate, per demo tenant: 2-3 projects, a
handful of episodes/sequences per project, 15-30 shots and 10-20 assets
spread across realistic statuses, 5-10 tasks per shot/asset with a few
checklist items/comments/dependencies each, 1-3 versions per shot/asset with
a few annotations, and a week of daily logs. Enough to exercise every
filter/status/RBAC branch without being enormous.

### 2.5 Verification approach

`pnpm run typecheck` after each page-group lands. Manual verification (this
codebase has no test suite yet, matching the precedent set by the RBAC
hardening plan) via curl/browser: for each new resource, confirm tenant
isolation (a second tenant's data never leaks), confirm the frontend page
renders real data end-to-end, confirm writes persist across reload.

---

## 3. Sub-project 2: Auth & portal redesign (direction)

Replace `login.tsx`'s 6-card portal picker (which today just pre-fills a
fixed demo email per role via `roleToEmail` — role is *not* actually derived
from credentials in the current UI, even though the backend already does
real credential→role lookup) with one employee login form (ID/email +
password) for admin/producer/lead/artist; post-login routing reads the real
`role` from the auth response. New `client_access_links` table (project or
review scope, generated code, expiry, created-by producer) plus a
`/client-access` entry point that exchanges link+code for a scoped session,
separate from the password-based employee flow. Detailed spec follows once
Sub-project 1 is far enough along that "which portal am I routed to" has real
data behind it.

## 4. Sub-project 3: Review system overhaul (direction)

Three pieces: (a) fix the previous/next-shot thumbnail strip overlapping the
scrubber at the bottom of `review.tsx`'s player — independent, no backend
dependency, can happen anytime; (b) an "Open in DCC vs. Review Here" chooser
when opening a version — frontend-only UX, DCC launch itself stays a stub;
(c) wire `review.tsx`/`client-review.tsx`'s existing local `Annotation[]`
state to the real `annotationsTable`/`reviewsTable` from §2.1, with the
3-tier RBAC visibility already decided (studio leadership + production see
all; leads see their department + own; artists see only shots/tasks assigned
to them — same pattern as the standup feed), and a simplified read-plus-approve
view for the client portal scoped to whatever a client-access link grants.

## 5. Sub-project 4: Filter-UX overhaul (direction)

A reusable sidebar filter panel (cascading Project → Episode → Task
dropdowns, plus search-driven checkbox facets for Artist/Status/
Branch-or-Department/Date, with live counts, matching the pattern shown from
the reference "Symbiosys" production-tracker screenshots) applied to Shots,
Tasks, Tracking Grid, and Assets. Deliberately sequenced after the
in-progress ShotGrid parity audit (`docs/superpowers/plans/2026-08-31-shotgrid-parity-audit.md`,
currently executing) so the exact filter set is designed once against both
references instead of twice.

## 6. Sub-project 5: Ancillary features (direction)

File-menu additions to the app shell: **Raise Ticket** and **Leave Apply**
(dark mode toggle already exists, per the reference screenshot's File menu).
A Daily-ToDo-style summary (My Tasks / Due Today / Upcoming counts, quick
task assignment) — likely an extension of the existing Daily Standup page
rather than a new one, to avoid two parallel "assign work" surfaces. A
branch/location-grouped roster view in the existing Team Chat's Quick Chat
panel (grouping by office/location the way the reference screenshot groups
by "Bbsr").

## 7. Sub-project 6: Verification & PRD gate (direction)

No PRD file exists anywhere in this repo today; this spec (and its
sub-project follow-ups) becomes the working PRD. Before any push to a shared
branch: every login path exercised end-to-end (all four employee roles +
client link flow), every new CRUD resource exercised against the real
backend (not just typechecked), the review/annotation RBAC rules verified
per-role, and the filter UX checked in-browser across the pages it touches.

---

## 8. Explicitly out of scope (this initiative)

- Real DCC (Maya, etc.) integration — deferred per direct instruction;
  Sub-project 3's "Open in DCC" chooser is UX-only, no live DCC connection.
- Workflows, AI suggestions, notifications, chat message persistence beyond
  what Sub-project 5 touches, publish logs — stay frontend-mock for now;
  not named in the original request, and pulling them in would blow up
  Sub-project 1's already-large scope further.
- Any change to `artifacts/mockup-sandbox`.
- Rotating the leaked Neon DB password or other items already flagged in
  `forge-final.md` §3/§6 as the user's own action items.
