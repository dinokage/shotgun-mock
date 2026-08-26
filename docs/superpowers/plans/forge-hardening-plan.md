# Forge — post-audit hardening plan

## Context

A full audit of this repo (see `forge-final.md` at repo root, and the baseline
commit on this branch) found and fixed the bugs blocking today's self-hosted
deploy (nginx proxy, migration chain, users route wiring). During that work,
an automated security review flagged a real gap the audit's fix did not
close: `POST /api/users` lets **any authenticated user in a tenant** create
new users in that tenant — including, if they can guess or discover a valid
`roleId`, provisioning themselves or an accomplice an admin account. There is
no capability/role check on that endpoint at all.

Investigating that finding surfaced the actual root cause: `requireCapability`
in `artifacts/api-server/src/middleware/rbac.ts` is a stub. It only checks
that the caller _has a role_ (`req.roleId` is truthy) — it never queries
whether that role actually holds the capability being checked. So even
mounting `requireCapability(...)` on a route today would not fix anything;
it would just let every authenticated user through unconditionally, same as
now. The role/capability data model already exists and is already populated
(`lib/db/src/schema/rbac.ts` — `tenantRoleCapabilitiesTable`, seeded in
`scripts/src/seed.ts` with real capability lists per role, e.g. `admin` and
`vfx_producer` get `manage_members`, `artist` and `client` do not).

This plan closes that gap and picks up two other small, safe, concrete
follow-ups already identified in `forge-final.md` §6 (Known limitations) that
are worth doing now rather than leaving as flagged debt.

**Out of scope for this plan** (do not attempt): rotating the leaked Neon DB
password (requires the user's own Neon console access — already called out
in `forge-final.md` §3), reformatting the 339 files flagged by
`pnpm run lint` (cosmetic, unrelated diff), building out the not-yet-real
backend endpoints (assets/shots/versions/notes — intentionally still
frontend-mock per `forge-final.md` §6).

## Global Constraints

- This repo is a pnpm workspace (Node 24, TypeScript 5.9, Express 5,
  Drizzle ORM, `zod/v4`). Every task must keep `pnpm run typecheck` passing
  with zero errors across the whole workspace — this is the project's
  actual CI gate (see `.github/workflows/deploy.yml`) and was clean before
  this plan starts.
- Tenant isolation is load-bearing throughout this codebase: every DB query
  that touches `usersTable`, `projectsTable`, or `tasksTable` must be scoped
  by `tenantId` (see `artifacts/api-server/src/middleware/tenant.ts` and the
  existing pattern in `artifacts/api-server/src/routes/projects.ts`). Do not
  introduce a query that reads or writes across tenants.
- Do not touch `artifacts/mockup-sandbox` — it is a disconnected prototype,
  not part of the deployed app.
- Do not run `pnpm install --force` or delete `node_modules` — the worktree
  already has a working install; only run `pnpm install` (no flags) if a
  `package.json` dependency list changes.
- No new dependencies. Everything needed (drizzle-orm, `and`/`eq` from
  `drizzle-orm`, the existing schema exports) is already available.
- Never weaken tenant/auth checks that already exist while making these
  changes — only add checks, don't relax them.

## Task 1: Real RBAC capability enforcement, and close the privilege-escalation gap

**Files:** `artifacts/api-server/src/middleware/rbac.ts`,
`artifacts/api-server/src/routes/users.ts`

**Problem:** `requireCapability(capabilityId)` in `rbac.ts` currently only
checks `req.roleId` is truthy — it never checks whether that role actually
has `capabilityId`. `POST /api/users` (in `users.ts`) has no capability
check applied at all, so any authenticated user in a tenant can create new
users in that tenant, including granting an arbitrary `roleId` — a privilege
escalation path.

**What to do:**

1. In `artifacts/api-server/src/middleware/rbac.ts`, rewrite
   `requireCapability` so it actually queries the database. Import `db` from
   `@workspace/db` and `tenantRoleCapabilitiesTable` from
   `@workspace/db/schema` (see the exact import pattern already used in
   `artifacts/api-server/src/routes/users.ts` for `db`/table imports, and in
   `artifacts/api-server/src/routes/auth.ts` for how
   `tenantRoleCapabilitiesTable` is queried by `roleId` — follow that same
   `eq()`/`and()` style from `drizzle-orm`). The middleware must:
   - Keep the existing `if (!req.roleId)` → `403 { error: "Forbidden: Missing role" }` check first.
   - Query `tenantRoleCapabilitiesTable` for a row matching both
     `roleId === req.roleId` AND `capabilityId === capabilityId` (the
     argument passed into `requireCapability(...)`).
   - If no matching row is found, respond `403 { error: "Forbidden: Missing capability" }` and return (do not call `next()`).
   - If a matching row is found, call `next()`.
   - The middleware function must stay `async` and must be usable as
     Express route middleware exactly as `requireCapability` is used today
     (i.e. `requireCapability("some_capability")` returns a middleware
     function — don't change that outer signature).
2. In `artifacts/api-server/src/routes/users.ts`, apply
   `requireCapability("manage_members")` to the `POST /` route only (not
   `GET /` — any authenticated tenant member is allowed to list their own
   tenant's colleagues; only _creating_ a user is the privilege-sensitive
   operation). `"manage_members"` is the exact capability id already used
   for this purpose in `scripts/src/seed.ts`'s role definitions — do not
   invent a new capability name.
3. `tenantAuthMiddleware` already runs before this router (via
   `router.use(tenantAuthMiddleware)` at the top of `users.ts`) and sets
   `req.roleId`, so `requireCapability` can rely on it being populated
   whenever it runs.

**Why this shape:** `GET /` already correctly tenant-scopes and strips
`hashedPassword` from every row (from the audit's earlier fix) — that's
fine as-is. This task's job is narrowly: make `requireCapability` real, and
apply it to the one route that actually needs it right now. Do not add
`requireCapability` to any other route in this task — that's out of scope
(no other route currently has a capability gate to "fix"; adding new gates
elsewhere is a product decision, not a bug fix).

**Verify:**

- `pnpm run typecheck` passes.
- Write/extend a test or a short manual trace (whichever this codebase's
  existing conventions support — check for an existing test setup under
  `artifacts/api-server` first; if there is none, a clear manual
  verification write-up in your report is acceptable) confirming: (a) a
  request with a `roleId` that has `manage_members` succeeds on `POST /`,
  (b) a request with a `roleId` that does NOT have `manage_members` (e.g.
  the seeded `artist` or `client` role) gets `403`, (c) `GET /` is
  unaffected (still works for any authenticated tenant member, still
  tenant-scoped, still strips `hashedPassword`).

## Task 2: Compose startup ordering and pnpm version pinning

**Files:** `docker-compose.yml`, `package.json` (repo root)

**Problem A:** `docker-compose.yml`'s `api` service `depends_on: [db]` only
waits for the `db` container to _start_, not for Postgres to actually be
ready to accept connections. On a cold `docker-compose up`, `api` can attempt
its migration step before Postgres is accepting connections, causing a
crash/restart cycle on first boot (it recovers via `restart: unless-stopped`,
but it's worth fixing properly).

**Problem B:** The root `package.json` has no `packageManager` field. Every
build (`Jenkinsfile`, `artifacts/api-server/Dockerfile`,
`artifacts/forge/Dockerfile`) runs `corepack prepare pnpm@latest --activate`,
so there is nothing pinning which pnpm version actually builds this project
— a future pnpm major release changing lockfile-handling behavior would
affect production builds with no warning and no easy way to reproduce
locally against the same version.

**What to do:**

1. In `docker-compose.yml`, add a `healthcheck` to the `db` service using
   `pg_isready` (the standard Postgres image already includes this binary —
   no new image/dependency needed), and change the `api` service's
   `depends_on` from the short-form list (`depends_on: - db`) to the
   long-form condition syntax so it waits for `db`'s healthcheck to pass:
   ```yaml
   depends_on:
     db:
       condition: service_healthy
   ```
   Pick reasonable healthcheck parameters (interval/timeout/retries) —
   something in the range of a few seconds interval, 5-10 retries, is
   standard for local Postgres startup; use your judgment, this doesn't
   need to be exact. The `web` service's `depends_on: [api]` can stay as a
   plain list (no healthcheck exists for `api` today, and adding one is out
   of scope for this task).
2. Find the currently-installed pnpm version by running `pnpm --version` in
   this worktree, and add `"packageManager": "pnpm@<that version>"` to the
   root `package.json`. Use the exact version string `pnpm --version`
   prints (e.g. `pnpm@11.20.0`), not a guess.

**Verify:**

- `docker-compose config` (or equivalent YAML validation — `docker` may not
  be installed in this sandbox; if the `docker` CLI is unavailable, validate
  the YAML is well-formed via any available YAML parser, and note in your
  report that full `docker-compose config` validation should be re-run on a
  machine with Docker installed before relying on it) shows no errors.
- `pnpm run typecheck` still passes (this task shouldn't touch any `.ts`
  files, but confirm nothing broke).
- `pnpm install` still resolves cleanly after the `packageManager` field is
  added (run it once to confirm; if it prompts about a version mismatch
  with the currently-active pnpm, report that in your task report rather
  than fighting it — it means the pinned version and the sandbox's active
  version differ, which is useful information, not a task failure).

## Final review note

The final whole-branch review for this plan must review **the entire branch
diff against `main`**, not just this plan's two tasks — that includes the
baseline commit already on this branch (the self-host deploy-blocker fixes:
nginx proxy config, `Dockerfile`, `docker-compose.yml`'s migration command,
`routes/index.ts`, `routes/users.ts`'s tenant scoping, `useUsers.ts`,
`railway.json`). Treat that baseline commit as in-scope for scrutiny, not as
pre-approved — this plan exists specifically because a security review of
that baseline commit already found one real gap (the subject of Task 1).
