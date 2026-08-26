# RBAC, Department Data Model, and Admin Panel — Design Spec

**Date:** 2026-08-26
**Status:** Approved by user, ready for implementation planning

## 1. Purpose

Forge's frontend already has a sophisticated 9-role permission matrix
(`store/permissions.ts`) and a review-approval state machine (`review.tsx`)
that closely resemble a real VFX studio's access model — but neither is
actually connected to anything real:

- Editing the "Roles & Permissions" matrix in Settings has zero runtime
  effect. `useCapability()` reads `currentUser.capabilities` (from the
  backend session), not the editable matrix.
- Only 6 of the 9 frontend-defined roles can be created at all (seeded in
  `scripts/src/seed.ts`); the rest exist only as UI labels.
- There is no department↔user link anywhere in the real database. Every
  "which department do I supervise" check on a real (non-mock) user
  evaluates against `undefined` and fails.
- There is no way to create a user and assign them a role/department, or to
  change an existing user's role/department, beyond a mock-only "Invite
  Member" dialog that never calls the backend.

This spec defines a **clean, simplified 6-role scheme** matching the
studio's actual reporting structure, makes department membership real, and
gives Admin a genuine user/role/department management capability and a
cross-department monitoring dashboard.

**Explicitly out of scope for this pass** (see §7): backend-enforced
department-level data scoping for tasks/projects/assets. Those entities
have no `departmentId` in the schema today; adding one, and rewriting every
query that touches them, is a larger follow-on project. This pass makes
*who can see what page, and who Admin can create/reassign* real. It does
not yet make every department dashboard's underlying task/project data
come from a real department-scoped query — department views will
continue to read from the same tenant-scoped data everyone else does,
same as today.

## 2. Role Scheme

Six roles, replacing the current seed's role set entirely (not layered on
top of the existing 9-role scheme — see the accepted design decision):

| Role | Display name | Department-scoped? |
|---|---|---|
| `admin` | Admin | No — sees everything |
| `production_head` | Production Head | No — sees everything, but not user/system management |
| `producer` | Producer | Yes — own department only |
| `lead` | Lead | Yes — own department only, narrower than Producer |
| `artist` | Artist | Yes — own assigned tasks only, no department-wide view |
| `client` | Client | N/A — external review portal only, unchanged from today |

`production_head` is a role *type*, not a hard-enforced singleton — in
practice a studio will have one, but the system does not block creating a
second. (Ledger this as a ruling if it turns out to matter — cheap to add
a uniqueness constraint later if the user wants one.)

## 3. Capabilities

A fresh, minimal capability set (this replaces, not extends, the current
14-capability list — the current list is disconnected from runtime
enforcement anyway, so there's nothing to preserve compatibility with):

| Capability | admin | production_head | producer | lead | artist |
|---|:-:|:-:|:-:|:-:|:-:|
| `manage_users` (create/edit any user, assign role+department) | ✅ | | | | |
| `manage_system_settings` (studio config, schema builder, integrations) | ✅ | | | | |
| `view_all_departments` (cross-department monitoring) | ✅ | ✅ | | | |
| `view_financials` | ✅ | ✅ | | | |
| `edit_financials` | ✅ | ✅ | | | |
| `manage_department_schedule` (scheduling/capacity, own dept) | ✅ | ✅ | ✅ | | |
| `manage_department_team` (dept roster, task assignment) | ✅ | ✅ | ✅ | ✅ | |
| `create_tasks` | ✅ | ✅ | ✅ | ✅ | |
| `edit_tasks` | ✅ | ✅ | ✅ | ✅ | own tasks only (ownership-checked, not capability-gated) |
| `assign_tasks` | ✅ | ✅ | ✅ | ✅ | |
| `submit_reviews` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `review_lead_stage` (approve/reject at lead-review) | ✅ | ✅ | ✅ | ✅ | |
| `review_final_stage` (final approve/sanity-check/publish) | ✅ | ✅ | ✅ | | |
| `manage_pipeline` (workflow editor, schema builder) | ✅ | | | | |
| `broadcast_updates` | ✅ | ✅ | ✅ | ✅ | |

`client` gets none of these — it stays on its separate, capability-free
review-portal path exactly as it works today.

Artist's `edit_tasks` is intentionally listed as capability-true but
ownership-scoped: the capability alone doesn't distinguish "my task" from
"anyone's task," so the actual UI/API guard for artists must additionally
check `task.assignedTo === currentUser.id`. This mirrors how `hashedPassword`
stripping and tenant scoping already work elsewhere in this codebase — a
capability check plus a data-ownership check, not one doing both jobs.

## 4. Data Model Changes

**New `departments` table** (`lib/db/src/schema/core.ts` or a new
`schema/departments.ts`, tenant-scoped like every other table):

```
departments
  id            text primary key
  tenant_id     text not null references tenants(id) on delete cascade
  name          text not null
  abbr          text not null
  pipeline      text not null   -- "PROD" | "3D" | "VFX" | "2D"
  pipeline_order integer not null default 0
  color         text
  icon          text
  created_at    timestamp not null default now()
```

Seed with the existing 17-department list already defined in
`artifacts/forge/src/data/mockData.ts`'s `DEPT_DEFINITIONS` (Production
Management, then 3D: Modeling/Texturing-LookDev/Rigging/Layout/Animation/
Lighting/Rendering, VFX: Matchmove-Camera-Tracking/Rotomation/Creature-
Effects-CFX/FX-Simulations/Grooming, 2D: Rotoscoping/Paint-Prep/Digital-
Matte-Painting/2D-Animation-Motion-Graphics/Compositing) — reuse the exact
names, abbreviations, and pipeline grouping already there; this data is
already well-designed and the existing department UI already expects
these exact shapes.

**`usersTable` gets a new nullable column:**

```
department_id  text references departments(id) on delete set null
```

Nullable because `admin`, `production_head`, and `client` don't belong to
a single department. `producer`/`lead`/`artist` should always have one in
practice, but the DB doesn't hard-require it — enforce that at the
application layer (the user-creation/assignment endpoint validates it),
consistent with how `roleId`'s tenant-ownership is validated today rather
than relying solely on a DB constraint.

This is a new migration on top of the ones already committed today
(`lib/db/drizzle/0000_eminent_talos.sql`) — generate it the same way
(`pnpm --filter "@workspace/db" run generate`, now that the Windows path
bug is fixed) and commit the output, per the existing "migrations must be
committed, not regenerated per-build" rule established earlier today.

## 5. Backend API Changes

- **`GET /api/departments`** — new route, tenant-scoped list, no capability
  gate needed (any authenticated user can see department names — matches
  today's `GET /api/users` being open to any authenticated tenant member).
- **`POST /api/users`** (exists) — extend to accept `departmentId`
  (optional), validate it belongs to the caller's tenant the same way
  `roleId` is validated today (`Important #4`'s fix from earlier today is
  the pattern to follow). Gate behind `requireCapability("manage_users")`
  instead of the current `"manage_members"` (renaming to match the new
  capability set — `manage_members` doesn't exist in the new scheme).
- **`PATCH /api/users/:id`** — new route. Lets Admin change an existing
  user's `roleId` and/or `departmentId`. Gated behind
  `requireCapability("manage_users")`. Must re-validate both fields belong
  to the caller's tenant, same pattern as creation. This is the concrete
  answer to "admin should be able to create all profiles and decide
  whether they are an artist, manager, or lead" for *existing* users, not
  just new ones.
- **`requireCapability`** middleware itself (`rbac.ts`) needs no change —
  it already does a real DB-backed capability lookup (fixed earlier
  today); it just gets applied to more routes and checked against the new
  capability names.
- **Session/JWT payload** (`signSession`/`SessionPayload` in
  `artifacts/api-server/src/lib/auth.ts`): add `departmentId` alongside
  the existing `userId`/`tenantId`/`roleId`, so `req.departmentId` is
  available to any route that wants to reason about "is this the caller's
  own department" — even though this pass doesn't yet add department-
  scoped data queries, threading it through now avoids a second auth/JWT
  change when that follow-on project happens.

## 6. Frontend Changes

- **`store/permissions.ts`**: replace `ROLES_ORDER`/`DEFAULT_PERMISSION_SCHEME`
  /`CAPABILITY_IDS` with the 6-role, 15-capability scheme from §2/§3. The
  editable matrix UI in Settings can stay, but it needs to actually be
  wired to something real — simplest correct option: remove the "editable
  matrix" framing entirely for this pass (it was never real) and replace
  that Settings tab with a read-only display of each role's fixed
  capability set, until/unless a later project makes per-tenant custom
  permission editing a real, backend-persisted feature. Don't leave a UI
  that looks editable but silently does nothing — that's the exact bug
  being fixed here.
- **`hooks/use-capability.ts`**: `useCapability`/`useIsLeadership` keep
  reading from `currentUser.capabilities` (already correct — the bug was
  the matrix being disconnected, not this hook). Add a
  `useIsDepartmentScoped()`/similar helper for "does this role only see
  its own department" (producer/lead/artist) vs. sees-everything
  (admin/production_head), and expose `currentUser.departmentId` (now
  returned by `/auth/me`/`/auth/login` per §5's session payload change)
  through the auth store.
- **`App.tsx`**: audit and correct every route's guard against §3's table.
  Notably: `assets`, `shots`, `tasks`, `people`/`profile`, `daily-standup`,
  `review`, `publishing`, `chat`, `tracking`, `timesheets`, `notifications`
  currently have only `AuthGuard` (open to any role) — several of these
  need a capability check now (e.g. `people`/roster management-adjacent
  views probably shouldn't be fully open to `artist`). Go page-by-page
  against §2's access rules, not a blanket re-guard — some of today's
  open pages are correctly open (e.g. `chat`, `notifications`,
  `timesheets` — everyone reasonably needs these).
- **`Sidebar.tsx`**: update `ALL_NAV`'s `capabilities` gating to the new
  capability names; audit that every gated nav item's target route has a
  matching route guard (today these two systems can disagree — fix that
  as part of this pass, not just add new gates on top of a
  still-inconsistent base).
- **Department-scoped page filtering**: for `producer`/`lead`/`artist`,
  pages like `departments.tsx`/`department-detail.tsx` should default-
  filter to `currentUser.departmentId` instead of the current mock-only
  `currentUser?.departmentId` check that always fails for real users
  (§4 makes this field real). `admin`/`production_head` see all
  departments (their `view_all_departments` capability toggles the
  filter off).
- **New Admin Panel** (`/admin`, new route + page + capability-gated by
  `manage_users` or a dedicated `view_all_departments` + `manage_users`
  combination): the cross-department monitoring dashboard. Composition,
  not a rewrite — this reuses existing building blocks: an aggregate view
  across all 17 departments' headcount/task-status breakdown (data
  already exists per-department in `mockData.ts`'s generation, now needs
  to read from real seeded users' `departmentId` instead), plus a new
  **user management table**: list all tenant users, their role,
  department, status, with inline "change role" / "change department"
  actions calling the new `PATCH /api/users/:id`, and a "create user"
  form calling the extended `POST /api/users`. This is the single biggest
  net-new UI surface in this spec — everything else is rewiring existing
  pages to real data/capabilities.

## 7. Explicitly Deferred (Follow-on Project, Not This Pass)

- Adding `departmentId` to `projectsTable`/`tasksTable`/`assetsTable`/
  `shotsTable` and rewriting their routes to scope queries by department
  the way `tenantId` is scoped today. Until that lands, a Producer's
  "their department's tasks" view is filtered *client-side* against
  whatever tenant-scoped task data the frontend already has — real access
  *control* (who can reach which page, who Admin can assign), not yet
  real backend-enforced data *isolation* between departments. Call this
  out plainly in the implementation — don't let it read as done when it
  isn't.
- Backend-persisting the review-approval pipeline (`review.tsx`'s
  wip → lead-review → manager-review → approved state machine is
  currently local/mock state, not stored via `versionsTable`). The states
  already map cleanly to the new role names (§2); persisting them for
  real is a separate, schema-touching project.
- Enforcing a single `production_head` per tenant, if that turns out to
  matter in practice.

## 8. Verification Approach

No frontend test framework exists in this codebase (established earlier
today). Verification for this work follows the same pattern used
successfully today: `pnpm run typecheck` must stay clean, and real
verification is a Playwright sweep — log in as each of the 6 roles against
a locally seeded studio with users actually assigned to different
departments, and confirm: (a) each role reaches exactly the pages §2/§6
say it should and is blocked from the rest, (b) Admin can create a new
user with a chosen role+department and that user can immediately log in
with the right access, (c) Admin can change an existing user's role/
department via the new Admin Panel and the change takes effect on that
user's next request. Seed data needs updating (`scripts/src/seed.ts`) to
create users across multiple departments and all 6 new roles, not just
the current one-user-per-old-role set.
