# Forge — Final Phase: RBAC/Login Redesign, Admin Onboarding, Client Review, Filter/Admin Parity, Security & Deploy Readiness — Design Spec

## 0. Context and constraints

This is the next phase after the full-backend-build-out plan (schema, all
CRUD routes, frontend rollout — Shots/Assets/Versions-Reviews/Tasks/Daily
Logs — all merged to `main` and live-verified) and after two live-crash
fixes (a stale-localStorage `dailyLogs` guard, the Tracking Grid theme fix).
The user has now given an exhaustive final-phase requirements list, plus
answered two disambiguating questions this session:

- **Lead vs Manager**: "Lead" is the surviving role name. Research below
  confirms this is nearly free — the real backend (`Role` type, seeded
  `tenant_roles`, `DEPARTMENT_LEADERSHIP_ROLES`) already only has `lead`,
  never `manager`. "Manager" exists in exactly one place:
  `login.tsx`'s mock portal-picker card (`artifacts/forge/src/pages/login.tsx:89-94`,
  `role: "manager"`) and the `roleToEmail` map at line 35 — both deleted as
  part of Sub-project A below. The task-status pipeline's `manager-review`
  stage is a **separate** design question, addressed in Sub-project B.
- **Data reset**: full wipe, no pre-seeded admin — bootstrap the first
  admin account (`kris_sym` / a password the user supplied directly in
  chat) via a one-time script, not via `seed.ts`'s demo-data path.

**Global constraints carried over from the prior spec** (still binding):
Drizzle ORM only, real committed migrations via `drizzle-kit generate`,
`pnpm run typecheck` must stay green, no changes to
`artifacts/mockup-sandbox`, no test suite in this repo — verification is
typecheck + manual curl/browser checks. New for this phase: **every
write-capability change must be paired with a server-side
`requireCapability` (or equivalent) check, not just frontend hiding** — see
Sub-project H.

**Explicitly deferred, per direct user instruction**: real DCC (Maya)
integration testing (works, tested earlier this session against the
offline machine — no further action needed now); Active Directory
integration for emp-ID login (the user named this as a *later* phase, after
this one ships and is tested). This spec's auth design (Sub-project A)
should not make AD integration harder later, but does not implement it.

---

## 1. Current-state findings (verified against `main`, not assumed)

- **RBAC is already capability-based, not role-string-based, server-side.**
  `tenant_roles` (per-tenant rows) + `tenant_role_capabilities` (grants) +
  `requireCapability(id)` middleware
  (`artifacts/api-server/src/middleware/rbac.ts`) — real, DB-backed. But it's
  only actually applied to 3 routes today: `POST/PATCH /users`,
  `GET /roles` (all `requireCapability("manage_members")`). Every other
  route (shots/assets/tasks/versions/reviews/daily-logs/checklist/etc.) has
  **no** capability gating — only tenant-scoping. This is a real gap Sub-project H
  addresses.
- **The `Role` type already has no "manager"**: `admin | production_head |
  producer | lead | artist | client`
  (`artifacts/forge/src/data/mockData.ts:9-15`). Seeded roles in
  `scripts/src/seed.ts` match: `admin`, `production_head`, `producer`,
  `lead`, `artist` (no `manager`, no `client` — client accounts aren't
  seeded as `users` rows at all today).
  `DEPARTMENT_LEADERSHIP_ROLES = ["producer", "lead"]`,
  `STUDIO_LEADERSHIP_ROLES = ["admin", "production_head"]`
  (`artifacts/forge/src/store/permissions.ts:154-155`).
- **Login is a 6-card portal picker with fake routing.**
  `login.tsx`'s `handleManualLogin` (line 48-71) actually calls the real
  backend (`useAuthStore.login` → `POST /auth/login` then `GET /auth/me`,
  `artifacts/forge/src/store/auth.ts:122-140` — this part is already real
  and returns a real `role`), but the **post-login redirect** is
  `email.includes("producer") || email.includes("manager")` string-matching
  (line 56), never reading the real `response.user.role`. The card grid
  itself (`portalCards`, lines 73-116) is pure UI scaffolding with no
  backend concept behind "which portal am I."
- **Chat is 100% frontend-mock, no DMs, no backend at all.**
  `pages/chat.tsx` (729 lines) + `store/chatGroups.ts` (zustand+persist,
  seeded from `MESSAGES` in `mockData.ts`). No `artifacts/api-server/src/routes/chat*`
  file exists. No 1:1 DM concept found — channel/group-shaped only.
- **Client review has no real gating.** `client-review.tsx`'s `accessCode`
  state (line 104) is checked against the hardcoded string `"demo"` (line
  386) — not validated against anything real. No `client_access_links`
  table, no access-code concept anywhere in `lib/db/src/schema/` or
  `artifacts/api-server/src/routes/`.
- **Admin employee-creation UI already exists and is already real.**
  `pages/admin.tsx` has a "Create User" dialog (line 128) that calls the
  real `POST /users` (line 77, via `apiFetch`) and `PATCH /users/:id` (line
  104) — this is further along than expected. No department-creation UI
  found in the same file (scope check needed in Sub-project D).
- **No real media/video upload anywhere.** No `multer`, no presigned-URL
  pattern, no blob storage reference in either `artifacts/forge/src` or
  `artifacts/api-server/src`. `versionsTable.mediaUrl` is a plain
  `text().notNull()` column — the app has only ever accepted a URL string a
  user types in, never an actual uploaded file.
- **Deployment config is already env-var-driven** (`docker-compose.yml:48-50`:
  `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` all `${VAR:-default}`), but the
  *defaults* are dev-only and dangerous if left unset in production:
  `JWT_SECRET` defaults to the literal string `super-secret-jwt-key`,
  `CORS_ORIGIN` defaults to `*`. No code change needed — this is a
  deploy-checklist item (Sub-project I), not a bug.
- **Zero route-level RBAC guarding today.** `App.tsx` has 42 `<Route>`
  entries and not one role check, redirect, or conditional render based on
  the current user's role — every authenticated user sees every sidebar
  item and every route regardless of role.
- **Timesheets is 100% mock**, reading `useTasksStore`/`useTimesheetLogs`
  (`store/timesheets.ts`), same store as the `dailyLogs`-crash pages fixed
  earlier today.
- **The task-status pipeline has a real two-step review chain**:
  `review → lead-review → manager-review → approved`, referenced across 15+
  files (`StepTracker.tsx`, `TaskDrawer.tsx`, `PipelineVisualizer.tsx`,
  `FeedbackList.tsx`, `TasksKanban.tsx`, `TasksList.tsx`, `department-detail.tsx`,
  `home.tsx`, `review.tsx`, `aiInsights.ts`, `useTasks.ts`'s approval-event
  action enum, `mockData.ts`). This is NOT the same as the Lead/Manager
  *role* duality — it's a two-tier *approval* concept. Addressed head-on in
  Sub-project B rather than silently left alone, since leaving a
  `manager-review` stage in place after removing the Manager role would be
  confusing UI.

---

## 2. Sub-project A: Unified login + client access-link flow

**Direction** (already approved in the prior spec, now executed): replace
`login.tsx`'s 6-card picker with **one** employee login form (email/emp-ID +
password), for every employee role (`admin`/`production_head`/`producer`/
`lead`/`artist`). Post-login routing reads the real `response.user.role`
from the already-real `useAuthStore.login()` call — no more email
string-matching.

- **Step 1**: Rewrite `login.tsx` — remove `portalCards`, the
  `params.role`-driven pre-fill logic, and the `/login/:role` route
  variant. Single form: email/emp-ID + password. On submit, call the
  existing `login()`, then route by `currentUser.role`:
  `admin`/`production_head` → `/production` (or a to-be-decided studio
  dashboard route); `producer`/`lead` → `/production` (department-focus
  dashboard, matches today's `SupervisorDashboard` in `home.tsx`);
  `artist` → `/tasks`. Keep the existing role-hierarchy dashboard logic in
  `home.tsx`/`App.tsx`'s root route — this task only fixes what decides the
  *initial* redirect target, not the dashboards themselves.
- **Step 2**: New `client_access_links` schema table: `id, tenantId,
  projectId (nullable — project-wide) OR episodeId/versionId (nullable —
  narrower scope), code (unique, short, human-typeable), createdByUserId,
  expiresAt (nullable), revokedAt (nullable), createdAt`. A producer
  generates a link+code from the Publishing/Deliveries flow (ties into
  Sub-project E's producer-approval gate).
- **Step 3**: New `POST /api/client-access/redeem` route: takes `{code}`,
  looks up an unexpired, unrevoked `client_access_links` row, and on
  success sets a scoped session (same cookie-session pattern as employee
  login, but tagged `role: "client"` and carrying the link's
  project/episode/version scope) — no email/password for clients, ever.
  `GET /client-access` becomes the client's own entry point (replaces
  reaching `client-review.tsx` via the employee login's `email.includes("client")`
  hack).
- **Step 4**: `client-review.tsx`'s fake `accessCode === "demo"` check is
  replaced with the real redeem call; the page then only shows
  data within its session's granted scope (server-enforced — see
  Sub-project H).

## 3. Sub-project B: Lead/Manager merge + review-chain simplification

- **Step 1**: Delete every "Manager"-labeled UI/routing reference that
  refers to the role (not the review-status): `login.tsx`'s Manager card
  (already gone per Sub-project A's rewrite), any sidebar/nav copy saying
  "Manager Portal."
- **Step 2 — review-chain decision, stated plainly for spec-review approval
  rather than silently picked**: collapse the two-tier
  `lead-review → manager-review` chain into a single `lead-review` step
  (`review → lead-review → approved`, dropping `manager-review` as a
  distinct status value). Rationale: with Lead/Manager merged into one
  role, a task no longer needs to pass through two department-level
  approval gates — the Lead's approval *is* the department-level
  sign-off. Studio-level oversight (admin/production_head) already exists
  as a separate concept (`STUDIO_LEADERSHIP_ROLES`) and doesn't need its
  own task-status stage — it's better expressed as a dashboard/reporting
  view over already-approved tasks, not a blocking gate every task must
  pass through. **This changes a `TaskStatus` enum value used in 15+
  files** (listed in §1) — every one gets updated in this sub-project, not
  left half-migrated.
- **Step 3**: Update `useTasks.ts`'s approval-event action enum
  (`submitted-for-manager-review` etc.) to match — the backend
  `taskApprovalEventsTable` already stores `action` as a free-text column
  (`artifacts/api-server/src/routes/tasks.ts`), so no schema/migration
  change, just the frontend's allowed-values list.
- **Step 4**: `assignedTo`/task-authorship enforcement — per the user's
  explicit requirement, `admin`/`production_head`/`producer`/`lead` should
  never be the *assignee* of a task themselves (they assign, they don't
  get assigned). Add a server-side check in `PUT /tasks/:id` (and
  `POST /tasks`): if `assignedTo` is provided, the target user's role must
  be `artist` (400 otherwise) — enforced next to the existing
  `userInTenant` check, same file, same pattern.

## 4. Sub-project C: Route-level RBAC page visibility

- **Step 1**: Central `ROLE_ROUTE_ACCESS: Record<Role, string[]>` (or an
  inverse per-route-allowed-roles map — whichever reads cleaner against
  `App.tsx`'s actual route list) naming which of the 42 routes each role
  may reach. Derive the list from what's already implied by
  `DEPARTMENT_LEADERSHIP_ROLES`/`STUDIO_LEADERSHIP_ROLES` plus the user's
  explicit asks (artists don't need Admin, Departments-admin, Studio
  Roster-edit, etc.; clients only ever reach `/client-review`).
- **Step 2**: A route-guard wrapper (checked in `App.tsx` per `<Route>`, or
  as a layout-level check reading `currentUser.role` from `useAuthStore`)
  that redirects to the user's own default dashboard (not a blank 403 page)
  when they hit a route outside their access list, and the sidebar
  (`components/shell/Sidebar.tsx`) filters its nav items the same way, so
  a role never even sees a link it can't use.
- **Step 3**: This is presentation-layer only — it does not replace
  Sub-project H's server-side capability checks. A hidden route and a
  blocked API call are two different layers of the same requirement, both
  needed (the axiom this whole app has followed since the original
  RBAC-hardening pass: read-visibility can be frontend-side, but every
  write must also be checked server-side).

## 5. Sub-project D: Remaining real-backend wiring

Four remaining frontend-mock surfaces the user named directly:

- **Timesheets** (`timesheets.tsx`, `store/timesheets.ts`): migrate off
  `useTasksStore`/`useTimesheetLogs` onto the real `useTasks()` +
  `useDailyLogsByUser()` (already exists, added during Task 19a) — this is
  now the *second* consumer of that hook, no new backend work needed, pure
  frontend rewiring following the exact pattern already proven on
  `daily-standup.tsx`.
- **Kanban for producers/leads** (`TasksKanban.tsx`): already partially
  real (Task 18's dual-shape fix made the `tasks.tsx`-fed instance work
  against real data). This sub-project's job is the *assignment* workflow
  specifically: confirm a producer/lead can drag an unclaimed task onto an
  artist (not just claim it themselves — recall Sub-project B says
  leadership roles never hold tasks) — audit `ClaimableTaskCard`'s
  `onClaim` handler and add an explicit "Assign to..." picker for
  non-artist viewers, since "claim for yourself" doesn't apply to them.
- **Chat/DMs**: new `messagesTable` (`id, tenantId, channelId OR
  dmParticipantIds[2], senderId, text, createdAt`) + `POST/GET
  /api/messages` (tenant-scoped, same pattern as every other route this
  session). Frontend: `chat.tsx` migrates off `store/chatGroups.ts` onto
  real hooks; 1:1 DM is a new capability (channelId nullable, two
  participant ids used instead) since none exists today.
- **Video/media import**: given no real storage exists anywhere in this
  stack today, and given the master spec's own "explicitly out of scope"
  section already named DCC integration as deferred, this needs a
  **scope decision from the user before planning it in detail** — real
  blob storage (S3-compatible, or a self-hosted volume mount for the
  company-server deployment) is a meaningfully sized infrastructure
  addition, not a page-wiring task like the others in this list. Flagged
  in the Self-Review as an open question rather than guessed at.

## 6. Sub-project E: Client review — producer sanity-check gate

- **Step 1**: New `reviewsTable.producerApprovedAt` (nullable timestamp) +
  `producerApprovedBy` (nullable FK to `usersTable`) columns — a version's
  review only becomes visible to a client-scoped session once a producer
  has explicitly approved it, distinct from the existing `reviewsTable.status`
  (which tracks the *content* review verdict, not the *release-to-client*
  gate).
- **Step 2**: New `POST /api/reviews/:id/approve-for-client` (capability:
  `approve_reviews`, already in the capability catalogue) — sets the two
  columns above.
- **Step 3**: `GET /api/reviews` (and the client-scoped annotation/version
  reads reachable from `client-review.tsx`) filter to
  `producerApprovedAt IS NOT NULL` when the caller's session role is
  `client` — server-side, not just hidden in the UI.
- **Step 4**: Ties into Sub-project A Step 2 — generating a
  `client_access_links` row is the producer's actual "send this to the
  client" action; the approve-for-client step (this sub-project) and the
  link-generation step (Sub-project A) are sequenced together in the
  Publishing/Deliveries page's UI.

## 7. Sub-project F: Branding

- New Forge logo — needs the user to supply the actual mark (a file, or a
  design direction) before this is buildable; flagged as an open input in
  Self-Review, not something to invent unilaterally.
- Light theme "can be better" — needs the user to point at specific pages
  or screenshots showing what's wrong, same as the tracking-grid fix
  needed a concrete bug report to act on; too vague to plan against as
  stated. Flagged as an open input.

## 8. Sub-project G: Full data reset + admin bootstrap

- **Step 1**: A `scripts/src/reset-and-bootstrap-admin.ts` script
  (deliberately separate from `seed.ts`, which stays as the
  demo-data-for-local-dev tool it already is) that: truncates every
  content table (`projects` through `daily_logs`, cascading) **and** the
  `users`/`departments`/`tenant_roles`/`tenant_role_capabilities`/`tenants`
  tables — a true blank slate, matching "wipe everything including admin."
- **Step 2**: The same script then creates exactly one tenant, one
  `admin`-role `tenant_roles` row with every capability granted, and one
  `users` row: email `kris_sym`, the password the user supplied in chat —
  **hashed with argon2 via the same `hashPassword()` helper `routes/users.ts`
  already uses**, never touching or logging the plaintext value anywhere
  outside this one script run. This is a one-time bootstrap script, run
  once against the target database (local now, the company server at
  deploy time) — not part of the normal seed/migrate flow.
- **Step 3**: From that single admin login, every other employee
  (production heads, producers, leads, artists) and every department gets
  created through `admin.tsx`'s already-real Create User flow — this
  sub-project's only job is getting to that one bootstrapped account, not
  building anything new in the admin UI itself (Sub-project D's Kanban
  item and this list's existing admin.tsx coverage already handle the
  rest).

## 9. Sub-project H: Security audit

Findings from this session's research pass, each with its fix folded into
the sub-project that owns the relevant code (not a separate pass) —
listed here together so the full picture is visible in one place:

- **Write-capability enforcement gap** (real, found this session): only
  `users`/`roles` routes call `requireCapability` today; every other
  mutating route (shots/assets/tasks/versions/reviews/daily-logs/checklist/
  comments/dependencies/attachments/approval-events) has tenant-scoping but
  no role/capability check. Given this phase's explicit requirement that
  artists can't assign tasks, leadership can't hold tasks, and only
  producers can approve-for-client, **every one of those new restrictions
  needs a real `requireCapability`/inline role check server-side**, added
  route-by-route as each sub-project above touches that route — not
  bolted on generically after the fact. This is the same "read-visibility
  frontend-side, write-capability server-side" axiom already established
  in this codebase, applied more completely.
- **`JWT_SECRET`/`CORS_ORIGIN` dev-only defaults**: not a code bug (already
  env-driven), but a deploy-checklist item — Sub-project I.
- **Client-scoped session must never see more than its granted scope**:
  today's `client-review.tsx` has zero real scoping (checked against a
  hardcoded string). Sub-project A/E's redesign must ensure a client
  session literally cannot query another project's/episode's data even by
  guessing an id — apply the same tenant-scoped-`*InTenant`-check
  discipline this session already established for cross-tenant IDORs, but
  for cross-*scope* (a client session is a narrower slice than a tenant)
  access.
- **Argon2 password hashing already correct** (`routes/users.ts`,
  confirmed in the earlier audit's item #5) — Sub-project G's bootstrap
  script must use the same helper, not roll its own hashing.
- **No route-level RBAC today** (Sub-project C) is itself a security
  posture gap even though every route is still tenant-scoped underneath —
  defense in depth, not just UX polish.

## 10. Sub-project I: Deployment readiness (company server)

- Deploy checklist (not code changes, config/process): real `JWT_SECRET`
  (long random value, not the dev default) set in the server's env; real
  `CORS_ORIGIN` (the actual deployed frontend origin, not `*`); real
  `POSTGRES_PASSWORD` (not the `postgres`/`postgres` dev default);
  confirm the company server's Docker/Docker Compose availability (or
  whatever the target runtime is — needs the user to specify: bare Docker
  Compose on a VM, Kubernetes, something else) before this sub-project can
  be planned in more detail than a checklist.
- Given `docker-compose.yml` already uses env-var defaults throughout
  (confirmed in research), this sub-project is mostly about *supplying the
  right values* at deploy time and documenting the process, not changing
  application code — flagged as comparatively low-risk/low-effort relative
  to the rest of this spec.

---

## 11. Explicitly out of scope (this phase)

- DCC integration further testing (already done, working).
- Active Directory / emp-ID login — named as a future phase by the user;
  this phase's auth design (session-cookie based, role read from a real DB
  row) doesn't block adding an AD-backed login method later, but doesn't
  build one now.
- Building an actual media/blob storage backend — flagged as an open
  scope question in Sub-project D, not silently included or excluded.
- New Forge logo asset and further light-theme polish — flagged as open
  inputs needed from the user in Sub-project F.

## 12. Open questions for the user (spec-review gate)

1. **Sub-project B's review-chain collapse** (dropping `manager-review`
   as a status, single `lead-review` gate) — confirm this is the right
   call, since it's the one place this spec made a judgment call instead
   of just following an explicit instruction.
2. **Sub-project D's video/media upload** — is real file storage in scope
   for this phase, or does "importing videos" mean "paste a URL to an
   already-hosted video" (today's `mediaUrl` text-field pattern, just
   wired into more places)? This changes the sub-project's size
   substantially.
3. **Sub-project F** — need the actual new logo (file or direction) and
   specific light-theme complaints (pages/screenshots) to plan against.
4. **Sub-project I** — what's the company server's actual runtime target
   (Docker Compose on a VM, Kubernetes, a PaaS)? Changes what the deploy
   checklist actually says.
