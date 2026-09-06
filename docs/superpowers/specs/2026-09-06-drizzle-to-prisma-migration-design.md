# Drizzle → Prisma Migration Design

**Status:** Approved by user, ready for implementation planning.

## Context

Forge (the VFX production-tracking app) currently uses Drizzle ORM for its
entire database layer: schema declarations split across
`lib/db/src/schema/*.ts` (8 files, 26 tables), a custom migration runner
(`lib/db/src/migrate.ts`) invoked on every `api-server` container start, and
Drizzle query-builder calls (`db.select().from(x).where(and(eq(...)))`
style) scattered across 17 of 20 route files in `artifacts/api-server/src/routes/`,
plus 2 lib files (`lib/auditLog.ts`, `lib/sequenceReassignment.ts`) and 3
one-off scripts (`scripts/src/seed.ts`, `import-roster.ts`,
`reset-and-bootstrap-admin.ts`).

The user wants to migrate this to Prisma. This is a real, live production
deployment (self-hosted Docker at `10.180.9.120`) serving a real VFX studio
with real employee accounts and real imported production data — this is
not a green-field or throwaway app, so the migration must not put live data
or uptime at risk.

**Immediate precedent:** earlier the same day, a live-database password
rotation caused an outage because a verification step (`docker exec psql`
inside the Postgres container) gave a false-positive result — local Unix-
socket connections use `trust` auth in the `postgres:15-alpine` image,
bypassing password checks entirely, while the actual failure only showed up
over the Docker network. This design exists specifically to avoid repeating
that failure mode at much larger scale: **every verification step in this
plan must test the same way the real system will connect** (over the
Docker network / through the real HTTP API), never through a channel that
can silently pass for the wrong reason.

## Goals

- Replace Drizzle with Prisma as the ORM/query layer, keeping `@workspace/db`
  as the shared package boundary other code imports from.
- Keep the database schema byte-for-byte identical (table names, column
  names, types, constraints). This is an ORM swap, not a schema redesign.
- Validate the entire migration against a real-data clone before touching
  production.
- Ship via one planned-downtime cutover, not a gradual per-route production
  rollout — the user explicitly confirmed a short downtime window is
  acceptable, so there's no reason to pay for zero-downtime complexity.
- Preserve all existing business logic exactly (tenant scoping, capability
  gates, the approval-stage gates added earlier today, audit logging,
  notification side effects) — only the query *syntax* changes, not the
  authorization or data logic built on top of it.

## Non-goals

- No schema changes, no new tables/columns, no data migration.
- No zero-downtime/dual-write machinery.
- No change to `POSTGRES_PASSWORD`/`JWT_SECRET` handling (already fixed
  separately today) — this migration must not touch those files except
  where the Dockerfile's migration-runner invocation needs to change.

## Global Constraints

- **Prisma Client only** for all new query code — no raw SQL except where
  Prisma has no equivalent (should not be needed for this schema).
- **Schema is introspected, not hand-written.** `schema.prisma` is
  generated via `prisma db pull` against a staging clone restored from a
  real production backup — never hand-transcribed from the Drizzle schema
  files, which may have drifted from the live database's actual shape.
- **No production DDL.** The adoption path is Prisma's standard
  "adopting Prisma in an existing project" baseline: generate one baseline
  migration representing current state, mark it `--applied` without
  running it. This applies identically whether run against the staging
  clone or (later) production — in both cases Prisma is told "this schema
  already exists," never asked to create it.
- **`pnpm run typecheck` must stay green** at the end of every task in the
  implementation plan.
- **No test suite exists** (established precedent from this session)
  — verification is `pnpm run typecheck` plus manual curl/browser checks,
  run against the staging clone for every task except the final cutover.
- **Verify over the real connection path.** Every "does this work" check
  connects the way the real system will: through the Docker network to the
  `api` container's exposed port, or through the actual HTTP API — never
  a local/Unix-socket shortcut that could silently bypass what's being
  tested (see the password-rotation incident above).
- **Preserve business logic verbatim.** When converting a route file's
  queries from Drizzle to Prisma syntax, the surrounding logic (capability
  checks, tenant-scoping `where` clauses, notification/audit side effects,
  the approval-stage gates in `tasks.ts`) must produce identical behavior.
  This is a mechanical query-syntax port, not a logic rewrite — if a
  behavior change seems tempting, it's out of scope for this migration.
- **`.env`/`docker-compose.yml` secrets are untouched** by this migration
  except for whatever `DATABASE_URL` format Prisma expects (should be
  identical to Drizzle's — both use a standard Postgres connection string).

## Architecture

### Staging environment

A throwaway Postgres container (not part of the live `docker-compose.yml`
stack, not exposed on any port the live app uses) restored from the most
recent real production backup (the scheduled backup service already writes
these — see `ops/db-backup/`). All development and verification work in
this migration happens against this clone until the final cutover task.

### `lib/db` package

- `schema.prisma`: generated via `prisma db pull` against the staging
  clone, then reviewed for sanity (table/column names match the Drizzle
  schema files' intent) before being committed.
- `prisma generate` produces the typed Prisma Client.
- One baseline migration directory (Prisma's `migrate diff` +
  `migrate resolve --applied` adoption flow), replacing Drizzle's
  `drizzle/` migration folder and `_journal.json` (the same journal
  mechanism whose corruption caused an outage earlier this session).
- `lib/db/src/index.ts` exports a Prisma Client instance in place of the
  Drizzle `db` object; the package's public API (what other code imports)
  stays as similar in shape as reasonably possible to minimize churn in
  consumers beyond the query-syntax changes.
- `lib/db/src/migrate.ts` (the custom runner invoked on container start)
  is replaced with a thin wrapper around `prisma migrate deploy`.

### Route/lib/script conversion

Each consumer file's Drizzle query calls
(`db.select().from(x).where(and(eq(x.col, val)))`) become Prisma Client
calls (`prisma.x.findMany({ where: { col: val } })`), preserving:
- the exact same `WHERE` conditions (tenant scoping above all — every
  existing tenant-ownership check must survive the port unchanged)
- the exact same returned shape (field names sent to the frontend don't
  change)
- the exact same side effects (cache invalidation via `lib/cache.ts`,
  `createNotification` calls, audit log writes, the approval-stage gate
  helpers added earlier today in `tasks.ts`)

### Docker/deploy

The `api-server` Dockerfile's startup sequence changes from Drizzle's
migration runner to `prisma migrate deploy`. No other Dockerfile/compose
changes are in scope.

## Validation Strategy

1. Every task except the final cutover runs its manual verification against
   the **staging clone**, connected the same way production would be
   (through the Docker network to a locally-run `api` container instance
   pointed at the staging clone's `DATABASE_URL` — not a bare `psql` shell
   check).
2. After all conversion tasks are done, a dedicated regression-pass task
   re-tests every route, every role (admin, production_head, producer,
   lead, artist, client), and specifically re-verifies tonight's fresh
   work (the approval-stage gates, the CORS fix's behavior is unrelated to
   this migration but the login flow it depends on is, department backfill
   query paths) against the staging clone.
3. Only after that full regression pass is green does the cutover task
   touch production.

## Cutover Plan

1. Fresh backup of production (in addition to the scheduled ones).
2. Planned downtime window: stop `api`, run `prisma migrate deploy` and
   the new image's startup against the **real** `DATABASE_URL`, redeploy
   `api` from the fully-converted image.
3. Live verification: the same connection-path-correct checks as staging,
   now against `10.180.9.120`.
4. Tag the pre-migration Docker image so rollback is "redeploy that image"
   — safe because no schema DDL ran against production; the database
   itself is unchanged in shape, so the old Drizzle-based image can read
   it exactly as before if a rollback is ever needed.

## Task Breakdown (for the implementation plan)

1. Foundation: Prisma setup in `lib/db` (schema pull, client generation,
   baseline migration, new package exports, migration-runner replacement).
2. Simple CRUD group: `departments.ts`, `episodes.ts`, `sequences.ts`,
   `roles.ts`.
3. Identity group: `users.ts`, `auth.ts`, `invites.ts`.
4. Production-entity group: `assets.ts`, `shots.ts`, `versions.ts`.
5. Tasks: `tasks.ts` (including checklist/comments/dependencies/
   attachments/approval-event sub-resources and the approval-stage gate
   helpers) + `daily-logs.ts`.
6. Reviews group: `reviews.ts` + annotations.
7. Remaining group: `notifications.ts`, `audit-logs.ts`,
   `client-access.ts`, `uploads.ts`, `projects.ts`.
8. Support code: `lib/auditLog.ts`, `lib/sequenceReassignment.ts`.
9. Scripts: `seed.ts`, `import-roster.ts`, `reset-and-bootstrap-admin.ts`.
10. Migration runner & Dockerfile finalization.
11. Full regression pass against the staging clone.
12. Production cutover.

Tasks 2–9 depend only on Task 1 and can, in principle, be reviewed in any
order, but should be executed in roughly the listed order since later
groups (Tasks) reference patterns established in earlier ones (Identity,
Production-entity). Tasks 10–12 are strictly sequential and depend on all
of 1–9 being complete and individually verified.
