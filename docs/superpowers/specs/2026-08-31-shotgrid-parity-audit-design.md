# ShotGrid Parity Audit — Design Spec

**Date:** 2026-08-31
**Scope:** Read-only audit of `Forge` (this repo's `artifacts/forge` + `artifacts/api-server`)
against Autodesk ShotGrid, verifying prior fixes and cataloging feature/filter gaps.
Output is a single PDF report artifact. **No code changes in this pass.**

## 1. Purpose

The user has a set of reference screenshots of the real Autodesk ShotGrid product
and wants to know, in one document:

1. Did the frontend corrections from the last working session (the RBAC/Admin
   Panel branch, commits `77a640f` and `a862b9f`, and the deployment-hardening
   pass in `forge-final.md`) actually land, and are there any errors in the
   current codebase (build breakage, dead controls, etc.)?
2. Feature-by-feature, does Forge implement what ShotGrid's dashboard/pages
   implement?
3. Page-by-page, does Forge have the same dropdown/filter controls ShotGrid
   has on the equivalent screen?

## 2. Inputs

- **ShotGrid reference material:** `C:\Users\user\Forge-final\` — 54 WhatsApp
  screenshots (`WhatsApp Image 2026-08-26 at *.jpeg`) of the real ShotGrid UI,
  plus 15 smaller `images*.jpg/png` icon references. All of it is ShotGrid
  material to study, none of it is our own product's assets.
- **Forge codebase:** `C:\Users\user\shotgun-mock`, checked out at `main`
  (`origin/main`, commit `a862b9f`) — this was stale (Aug 4) in the working
  copy before this session; it has been synced. The prior stale uncommitted
  work is preserved in git stash (`aug4-preaudit-wip-superseded-by-origin-main`)
  and is explicitly **out of scope** for this audit.
  - In scope: `artifacts/forge` (frontend, 30+ pages), `artifacts/api-server`
    (backend), `lib/db` (schema — for assessing whether a ShotGrid feature
    even has a data model to back it).
  - Out of scope: `artifacts/mockup-sandbox` — `forge-final.md` documents
    this as a disconnected prototype not part of the deployed app.
- **Existing project docs** (already-known context, not to be re-discovered
  or re-flagged as new findings):
  - `forge-final.md` — deployment audit; documents the self-host fixes and,
    critically, **§6 Known limitations**: only `/auth`, `/projects`,
    `/tasks`, `/users` are real backend-integrated; everything else
    (assets, shots, versions, notes, reviews, scheduling, timesheets, chat,
    etc.) is intentionally frontend-mock (zustand store) at this stage.
  - `docs/superpowers/plans/forge-hardening-plan.md` +
    `docs/superpowers/specs/2026-08-26-rbac-admin-panel-design.md` +
    `docs/superpowers/plans/2026-08-26-rbac-admin-panel.md` — the RBAC/
    department/admin-panel work, its design, and its two follow-up hardening
    tasks (real `requireCapability` enforcement, compose healthcheck
    ordering, pnpm version pin).

## 3. Workstreams

Five subagent tasks. 1–3 run independently in parallel; 4 depends on 1+2;
5 depends on all.

### Task A — ShotGrid reference catalog

Go through all 54 WhatsApp screenshots + 15 icon images. Produce a structured
catalog: for each screenshot, identify which ShotGrid screen/page/entity view
it shows, list every visible panel/widget, and — specifically — every
dropdown, filter chip, column-sort control, and grouping control visible.
Group screenshots by the page they depict (multiple screenshots may show the
same page). Output: a markdown catalog keyed by ShotGrid page name.

### Task B — Forge codebase inventory

Read the current disk state of `artifacts/forge/src` (routes in `App.tsx`,
every page component, every existing filter/dropdown/sort control per page)
and `artifacts/api-server/src` (routes, middleware, what's real vs. what the
frontend fakes). Cross-check `lib/db/src/schema` for what data model exists.
Flag any build/type errors found along the way (broken imports, orphaned
routes, etc.) as a distinct "Errors Found" list — do not fix them.
Output: a markdown inventory keyed by Forge page name, plus an errors list.

### Task C — Corrections verification

Check the current code at `main` (`a862b9f`) against every claimed fix below
and confirm present-and-correct / partially present / missing-or-regressed,
with file:line evidence for each verdict. Output: a markdown checklist, one
row per item.

**From `forge-final.md` §4 (self-host deploy-blocker fixes):**
1. `artifacts/forge/nginx.conf` — `/api/` `proxy_pass` block added.
2. `docker-compose.yml` — `api` service migration command fixed (no longer
   the broken `pnpm --filter` invocation against a pruned deploy image).
3. `artifacts/api-server/Dockerfile` — only regenerates migrations if none
   are committed, passes a placeholder `DATABASE_URL` at build time, deploys
   `@workspace/db` without `--prod` (so `tsx` survives pruning).
4. `artifacts/api-server/src/routes/index.ts` — `usersRouter` mounted;
   `/api/healthz` no longer double-mounted at `/api/healthz/healthz`.
5. `artifacts/api-server/src/routes/users.ts` — tenant-scoped, strips
   `hashedPassword` from responses, hashes new passwords with argon2.
6. `railway.json` — `healthcheckPath` is `/api/healthz`.
7. `artifacts/forge/src/hooks/useUsers.ts` — no `/api/api/users`
   double-prefix; unwraps the bare-array response shape the API actually
   returns (not `{ users: [...] }`).
8. `scripts/package.json` — has a `"seed": "tsx ./src/seed.ts"` script.
9. `lib/db/seed.cjs` — deleted (was dead code against a retired schema).

**From `forge-final.md` §4a (follow-up hardening pass):**
10. `artifacts/forge/Dockerfile` — `COPY nginx.conf` resolves correctly
    against the build context (`COPY artifacts/forge/nginx.conf …`).
11. `lib/db/src/migrate.ts` — guards "object already exists" migration
    errors (warns + exits 0) without swallowing genuine failures.
12. `lib/db/src/schema/core.ts` — `users.email` is `UNIQUE`; `users.role_id`
    has a real FK to `tenant_roles(id)`.
13. `artifacts/api-server/src/routes/users.ts` — `POST /api/users` validates
    `roleId` belongs to the caller's tenant (`400` if not) and checks for
    duplicate email (`409`).
14. `lib/api-spec/openapi.yaml` + `lib/api-zod` + `lib/api-client-react` —
    `GET`/`POST /users` documented and codegen output regenerated/committed.
15. `docker-compose.yml` — `api` container's internal port fixed at 3001
    matching `nginx.conf`'s `proxy_pass`; `db` healthcheck uses
    `pg_isready -h 127.0.0.1` with a `start_period`.
16. `artifacts/*/Dockerfile` — uses `corepack enable` (not
    `corepack prepare pnpm@latest --activate`), respecting the
    `packageManager` pin.
17. `artifacts/api-server/.env.example` — exists with placeholder values.
18. `forge-final.md` itself — the live Neon password once quoted in §3 is
    redacted, not verbatim.

**From `docs/superpowers/plans/forge-hardening-plan.md`:**
19. Task 1 — `artifacts/api-server/src/middleware/rbac.ts`'s
    `requireCapability` actually queries `tenantRoleCapabilitiesTable`
    (not just checking `req.roleId` truthy), and is applied to
    `POST /api/users` (not `GET /`) with capability id `"manage_members"`.
20. Task 2 — `docker-compose.yml`'s `db` service has a `pg_isready`
    healthcheck and `api`'s `depends_on` uses the `condition: service_healthy`
    long form; root `package.json` has a `"packageManager": "pnpm@<version>"`
    field.

**From commit `77a640f` ("address final whole-branch review findings"):**
21. `artifacts/api-server/src/routes/users.ts` — `GET /api/users` left-joins
    `tenant_roles` so `role` is a real name, not `undefined`; blocks the
    `client` role from this endpoint.
22. `scripts/src/seed.ts` — per-role `tenant_roles` re-query scoped by
    `(name, tenantId)`, not name alone.
23. Frontend `auth.ts` store — department rows from the real API normalized
    to the mock `Department` shape's field names at the hydration boundary
    (not left mismatched: `abbreviation`/`description`/`studioId` vs. the
    API's `abbr`/`pipeline`/`tenantId`).
24. `departments.tsx` — the persisted "Pipeline Flow" order self-heals
    against the live department list when it can't resolve (was previously
    permanently empty against real UUID ids).
25. `useUsers.ts` / `admin.tsx` — uses the real `UserDTO` the endpoint
    returns, no `any` cast.
26. `artifacts/forge/src/scripts/generateMockData.ts` — deleted (dead code,
    retired 9-role scheme).

**From commit `a862b9f` ("address re-review notes"):**
27. `departments.tsx` — the Pipeline Flow self-heal fallback filters to
    `pipelineOrder > 0`, excluding "Production Management" (studio overhead,
    not a pipeline stage) from the strip.
28. `artifacts/api-server/src/routes/users.ts` — `GET /api/users` scopes the
    query itself for the `client` role (returns `200` with just
    admin/production_head rows) rather than blocking the endpoint outright
    and leaving the frontend's stale mock fallback to render fabricated
    names.

**Known limitation, not a defect (`forge-final.md` §6, carry forward,
do not re-flag as a new finding):** `requireCapability` is real now (item
19) but is still the *only* route guarded by a capability check — every
other write endpoint is tenant-scoped but not capability-scoped. `JWT_SECRET`
has a hardcoded fallback, bundled Postgres publishes `5432` on `0.0.0.0`,
`CORS_ORIGIN` defaults to `*` — all fine for a trusted internal network,
flagged in `forge-final.md`, not this audit's job to fix or re-flag.

### Task D — Feature + filter/dropdown gap matrix

Depends on A and B. Cross-reference the ShotGrid catalog against the Forge
inventory:
- A feature-parity table: ShotGrid capability/widget → Forge status
  (Present / Partial / Missing) → note. Cross-reference `forge-final.md` §6
  so intentionally-mock/deferred areas are marked "Deferred (known, by
  design)" rather than flagged as gaps.
- A page-by-page dropdown/filter checklist: for each Forge page with a
  ShotGrid equivalent, list every ShotGrid filter/dropdown/sort control and
  whether Forge has a matching control.

### Task E — Report assembly

Depends on A–D. Compile everything into one cohesive, well-organized document
(sections: Executive Summary, Corrections Verification, Errors Found, Feature
Parity Matrix, Dropdown/Filter Audit per page, Appendix: ShotGrid screenshot
catalog) and publish it as a downloadable PDF artifact.

## 4. Error handling

This is a read-only audit. Any bug, broken import, or missing feature found
is a **finding to report**, not something to fix in this pass. Task B/C must
not modify any file. The only files this session writes are: this spec, the
final report artifact, and (if useful for reproducibility) the PDF content
saved to the scratchpad before publishing.

## 5. Verification approach

- Task E's PDF artifact must be checked to actually render/open correctly
  before being handed to the user (this is a report deliverable, not code —
  "testing" here means confirming the artifact is well-formed and complete,
  not running a test suite).
- Cross-check row counts: Task D's matrix should account for every ShotGrid
  page identified in Task A and every Forge page identified in Task B — no
  silently dropped pages.

## 6. Explicitly out of scope

- No code changes, no commits to `artifacts/*` or `lib/*`.
- No attempt to rotate the leaked Neon DB password or otherwise act on
  `forge-final.md` §3 — already flagged there as requiring the user's own
  Neon account access.
- No re-litigating deployment/Docker/CI concerns — already covered by
  `forge-final.md` and `forge-hardening-plan.md`; this audit is about
  product feature/UI parity with ShotGrid, not deployment.
- No changes to `artifacts/mockup-sandbox`.
