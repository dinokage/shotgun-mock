# Final Phase — Quick Fixes (Sub-projects K, L step 1, M step 1, N step 3, Q) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest, self-contained, highest-value fixes from the
2026-09-02 checklist: marketplace locked to admin-only, notification bell
deep-linking, a real (non-mock) AI-insights risk score, an eraser tool in
the review annotation toolbar, and self-service profile editing.

**Architecture:** Six independent, small changes — no shared new
infrastructure, no schema migrations except one small addition for
Task 5. Each task is a self-contained diff against files that already
exist.

**Tech Stack:** Existing stack only (React/TypeScript frontend, Express/
Drizzle backend) — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-final-phase-rbac-login-admin-deploy-design.md`
§13 (Sub-project K), §14 (Sub-project L, step 1 only — step 2's top-bar
declutter is a separate plan), §15 (Sub-project M, step 1 only — step 2's
feedback-tab visibility is verify-only, folded into Task 6 below), §16
(Sub-project N, step 3 only), §19 (Sub-project Q).

## Global Constraints

- `pnpm run typecheck` must stay green (controller verifies via a fresh
  clean-install run after every task — never trust an implementer's own
  local typecheck claim, per this project's established discipline).
- No changes to `artifacts/mockup-sandbox`.
- No test suite exists in this repo — verification is typecheck plus
  manual curl/browser checks.
- Every new or changed write-capability route must be tenant-scoped and
  capability/role-checked server-side, not just hidden in the UI (the
  established "read-visibility frontend-side, write-capability
  server-side" axiom).
- Drizzle ORM only; any schema change needs a real committed migration via
  `drizzle-kit generate` (placeholder `DATABASE_URL`), never a hand-written
  SQL file, and any table/column id must be deterministic where the row is
  expected to be idempotent-safe on reseed (this project's established
  fix pattern for the recurring `crypto.randomUUID()`-in-`onConflictDoNothing()`
  bug — not relevant to this plan's one schema change, which is a single
  additive column, but stated here since it's a standing constraint).

---

### Task 1: Notification bell dropdown deep-links to its source

**Files:**
- Modify: `artifacts/forge/src/pages/notifications.tsx:23` (export the
  existing resolver)
- Modify: `artifacts/forge/src/components/shell/TopBar.tsx:264-267`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveNotificationRoute(notif: Notification): string | null`
  becomes an exported function other components can import — no signature
  change, just visibility.

- [ ] **Step 1: Export the existing resolver.**

In `artifacts/forge/src/pages/notifications.tsx`, change:
```typescript
function resolveNotificationRoute(notif: Notification): string | null {
```
to:
```typescript
export function resolveNotificationRoute(notif: Notification): string | null {
```
No other change to this file — the function body already correctly
switches on `entityType`/`entityId` and falls back to `actionUrl`.

- [ ] **Step 2: Wire the bell dropdown's item click to navigate.**

In `artifacts/forge/src/components/shell/TopBar.tsx`, add the import:
```typescript
import { resolveNotificationRoute } from "@/pages/notifications";
```

Then change the `DropdownMenuItem`'s `onSelect` (currently only calls
`markAsRead`) at line ~264:
```typescript
onSelect={(e) => {
  e.preventDefault();
  if (!notif.read) markAsRead(notif.id);
}}
```
to:
```typescript
onSelect={(e) => {
  e.preventDefault();
  if (!notif.read) markAsRead(notif.id);
  const route = resolveNotificationRoute(notif);
  if (route) setLocation(route);
}}
```
`setLocation` is already destructured from `useLocation()` at line 51 of
this file — no new import needed for that part.

- [ ] **Step 3: Typecheck.**

Run the project's typecheck command (`pnpm run typecheck` from repo
root, or the controller's established Docker clean-install pattern if
the local environment has the known Windows/Docker node_modules issue).
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/forge/src/pages/notifications.tsx artifacts/forge/src/components/shell/TopBar.tsx
git commit -m "feat(frontend): navigate to a notification's source when clicked in the bell dropdown"
```

---

### Task 2: AI Insights — real risk score instead of a nonexistent mock field

**Files:**
- Modify: `artifacts/forge/src/lib/aiInsights.ts:170-191`

**Interfaces:**
- Consumes: `PROJECTS` (already imported at the top of this file, already
  live-hydrated with real `/api/projects` rows on login per
  `store/auth.ts:47-64`), `SHOTS` (same hydration pattern).
- Produces: no signature change to `findProjectRiskInsight()` — same
  `AIInsight | null` return shape every other insight function in this
  file uses, so nothing downstream (the dashboard panel consuming
  `getAIInsights()` or equivalent) needs to change.

- [ ] **Step 1: Replace the nonexistent `riskScore`/`dueDate` reads with
  derived values computed from real shot data.**

The real `/api/projects` response has no `riskScore`, `dueDate`, or
`progress` field (confirmed live this session — only
`id, tenantId, name, status, startDate, endDate, createdAt, deletedAt`
exist). The current code reads `p.riskScore`, `top.riskScore`,
`top.progress`, and `top.dueDate` — all `undefined` on real data, which
is exactly the live "undefined/100" and "Invalid Date" bug seen in the
admin dashboard screenshot this session.

Replace:
```typescript
function findProjectRiskInsight(): AIInsight | null {
  const candidates = PROJECTS.filter((p) => p.status !== "COMPLETE").sort(
    (a, b) => b.riskScore - a.riskScore,
  );
  const top = candidates[0];
  if (!top) return null;

  const shots = SHOTS.filter((s) => s.projectId === top.id);
  const flaggedShots = shots.filter(
    (s) => s.status === "bottleneck" || s.status === "at-risk",
  ).length;

  return {
    id: `risk-${top.id}`,
    severity: top.riskScore >= 60 ? "critical" : "warning",
    title: `Elevated Risk: ${top.name}`,
    reasoning: `Flagged because ${top.name} carries the highest studio risk score (${top.riskScore}/100) among non-complete projects — ${top.progress}% complete against a ${new Date(top.dueDate).toLocaleDateString()} deadline, with ${flaggedShots} of ${shots.length} shots in a bottleneck or at-risk state.`,
    actionLabel: "View Project",
    actionHref: `/projects/${top.id}`,
  };
}
```
with:
```typescript
function computeProjectRiskScore(projectId: string): {
  score: number;
  flaggedShots: number;
  totalShots: number;
} {
  const shots = SHOTS.filter((s) => s.projectId === projectId);
  if (shots.length === 0) return { score: 0, flaggedShots: 0, totalShots: 0 };
  const flaggedShots = shots.filter(
    (s) => s.status === "bottleneck" || s.status === "at-risk",
  ).length;
  return {
    score: Math.round((flaggedShots / shots.length) * 100),
    flaggedShots,
    totalShots: shots.length,
  };
}

function findProjectRiskInsight(): AIInsight | null {
  const ranked = PROJECTS.filter((p) => p.status !== "COMPLETE")
    .map((p) => ({ project: p, risk: computeProjectRiskScore(p.id) }))
    .filter((r) => r.risk.totalShots > 0)
    .sort((a, b) => b.risk.score - a.risk.score);

  const top = ranked[0];
  if (!top || top.risk.score === 0) return null;

  const deadlineClause = top.project.endDate
    ? ` against a ${new Date(top.project.endDate).toLocaleDateString()} deadline`
    : "";

  return {
    id: `risk-${top.project.id}`,
    severity: top.risk.score >= 60 ? "critical" : "warning",
    title: `Elevated Risk: ${top.project.name}`,
    reasoning: `Flagged because ${top.project.name} carries the highest studio risk score (${top.risk.score}/100) among non-complete projects${deadlineClause}, with ${top.risk.flaggedShots} of ${top.risk.totalShots} shots in a bottleneck or at-risk state.`,
    actionLabel: "View Project",
    actionHref: `/projects/${top.project.id}`,
  };
}
```

The risk score is now purely derived from the real bottleneck/at-risk
shot ratio for that project (0-100, matching the same scale and severity
threshold the UI already expects) — no reliance on a field the real
schema doesn't have. A project with zero shots or zero flagged shots
correctly produces no insight (`null`), rather than a fabricated warning.

- [ ] **Step 2: Grep this file for any other reads of `riskScore`,
  `dueDate`, or `progress`** on `PROJECTS`/project objects (not `SHOTS` or
  `TASKS`, which have their own real fields) and apply the same fix
  pattern if any are found — the two calls at lines 173/185/187 were the
  ones confirmed this session, but do not assume they are the only ones
  without checking.

- [ ] **Step 3: Typecheck.** Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/forge/src/lib/aiInsights.ts
git commit -m "fix(frontend): compute AI insight risk score from real shot data instead of a nonexistent mock field"
```

---

### Task 3: Marketplace locked to admin-only

**Files:**
- Modify: `artifacts/forge/src/lib/roleRouteAccess.ts`
- Modify: `artifacts/forge/src/components/shell/Sidebar.tsx:148`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new `ADMIN_ONLY_ROUTES: string[]` array in
  `roleRouteAccess.ts`, and `ROLE_ALLOWED_ROUTES.admin`/`.production_head`
  diverge for the first time (every other admin-tier route today is
  shared between the two — confirmed by this session's Task 8 work).

- [ ] **Step 1: Read the current file** to confirm `/marketplace`'s exact
  current position in `PRODUCTION_MANAGEMENT_ROUTES` (confirmed this
  session at line 50, but re-read before editing — this file may have
  been touched by other work since) and the exact current shape of
  `ROLE_ALLOWED_ROUTES`.

- [ ] **Step 2: Remove `/marketplace` from `PRODUCTION_MANAGEMENT_ROUTES`,
  add a new `ADMIN_ONLY_ROUTES` tier, and include it only in
  `ROLE_ALLOWED_ROUTES.admin`** (not `.production_head`, which shares
  every other admin-tier route but must NOT get this one — the checklist
  is explicit that only admin decides plugin/tool access). Follow the
  exact structural pattern of the existing `BASE_ROUTES`/
  `PRODUCTION_MANAGEMENT_ROUTES`/`STUDIO_ADMIN_ROUTES` tiers already in
  this file (each tier is a `string[]`, each role's entry in
  `ROLE_ALLOWED_ROUTES` is built by concatenating the tiers that role
  gets — match whatever composition style the file already uses, do not
  invent a new one).

- [ ] **Step 3: Gate the Sidebar nav item too.** In `Sidebar.tsx:148`, the
  Marketplace entry currently has a comment `// available to everyone`
  and no capability check. Since `Sidebar.tsx`'s nav filter already
  composes `canAccessRoute(currentUser.role, item.href)` with any
  per-item capability check (established in Task 8 of the already-shipped
  `rbac-login-core` plan), removing `/marketplace` from
  `production_head`'s allowed routes in Step 2 is sufficient by itself —
  confirm this by reading the Sidebar's actual filter logic, and only add
  an explicit capability gate here if the filter does NOT already compose
  route-access with rendering (i.e., don't add a redundant check if
  Step 2 alone already hides the link).

- [ ] **Step 4: Server-side check.** Confirm whether any
  `/api/marketplace*`-shaped backend route exists (this session's
  research found none — the page reads only `PLUGINS` from
  `data/mockData.ts` via `usePluginsStore`, fully mock). If none exists,
  no server-side change is needed for this task (there is no live data
  endpoint to gate) — note this explicitly in the commit message rather
  than silently skipping it, so it's clear this was checked, not missed.

- [ ] **Step 5: Typecheck.** Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/forge/src/lib/roleRouteAccess.ts artifacts/forge/src/components/shell/Sidebar.tsx
git commit -m "feat(frontend): lock marketplace to admin-only, excluding production_head"
```

---

### Task 4: Eraser tool in the review annotation toolbar

**Files:**
- Modify: `artifacts/forge/src/components/shared/review/types.ts:17`
  (and the `ANNOTATION_TOOLS` array near line 59-65)
- Modify: `artifacts/forge/src/components/shared/review/AnnotationToolbar.tsx`
  (wherever it renders `ANNOTATION_TOOLS`)
- Modify: `artifacts/forge/src/components/shared/review/AnnotationCanvas.tsx`
  (the pointer down/move/up handlers, lines ~302-357, plus the existing
  `"select"` tool's hit-testing near line 125)

**Interfaces:**
- Consumes: the existing `Annotation` record shape this canvas already
  produces/consumes for `pen`/`arrow`/`rectangle`/`text` tools — no
  change to that shape.
- Produces: `AnnotationTool` union gains `"eraser"`; no other file outside
  this component group needs to know about the new value, since
  `AnnotationToolbar` and `AnnotationCanvas` are the only consumers found
  in this session's research.

- [ ] **Step 1: Read all three files in full** before editing — the tool
  enum, the toolbar's rendering of each tool button, and the canvas's
  pointer-event branching — to confirm the exact current code (this
  session's research summarized line ranges but did not quote every
  line; do not guess at the exact current text).

- [ ] **Step 2: Add `"eraser"` to the `AnnotationTool` union** in
  `types.ts`, and add a corresponding entry to `ANNOTATION_TOOLS` (icon:
  use an existing `lucide-react` eraser-shaped icon already available in
  this project's icon set — check what's already imported elsewhere in
  this component group before adding a new icon import; `Eraser` from
  `lucide-react` is available in this dependency if nothing closer
  exists).

- [ ] **Step 3: Add the eraser tool to `AnnotationToolbar`**, following
  the exact same button/selection pattern the other four tools already
  use — no new interaction pattern, just one more entry.

- [ ] **Step 4: Implement erase behavior in `AnnotationCanvas`.** Scope:
  when `tool === "eraser"` and the current user clicks on one of their
  own existing annotation marks on the current frame/layer, delete that
  annotation record. Reuse the existing `"select"` tool's hit-testing
  logic (near line 125) to determine which annotation, if any, was
  clicked — do not write new hit-testing logic when equivalent logic
  already exists in this file. Scope explicitly excludes: erasing another
  user's annotations (out of scope per the spec — this is a personal
  undo tool, not a moderation tool), and a drag-to-erase gesture (a
  click-to-delete-one-mark interaction is sufficient for what was asked).

- [ ] **Step 5: Typecheck.** Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/forge/src/components/shared/review/types.ts artifacts/forge/src/components/shared/review/AnnotationToolbar.tsx artifacts/forge/src/components/shared/review/AnnotationCanvas.tsx
git commit -m "feat(frontend): add eraser tool to review annotation toolbar"
```

---

### Task 5: Self-service profile editing (name/title/avatar)

**Files:**
- Create migration via `drizzle-kit generate` (no manual schema change
  needed — `name`, `title`, `avatar` already exist as columns on
  `usersTable`, confirmed this session at `lib/db/src/schema/core.ts:22-45`
  — this task adds a route, not new columns).
- Modify: `artifacts/api-server/src/routes/users.ts` (new route, near the
  existing `PATCH /:id` at line 148)
- Modify: `artifacts/forge/src/pages/profile.tsx` (add an edit form; file
  is currently 403 lines, fully read-only)
- Modify: `artifacts/forge/src/hooks/useUsers.ts` (or wherever this
  project's established react-query mutation-hook pattern lives — check
  how `admin.tsx`'s existing `PATCH /users/:id` call is wrapped, and
  follow that same pattern for the new route rather than a raw `fetch`
  call from the page)

**Interfaces:**
- Produces: `PATCH /api/users/me` — self-only, no `manage_members`
  capability required (any authenticated user may edit their own
  `name`/`title`/`avatar`), tenant-scoped implicitly via `req.userId`.
  Body: `{ name?: string, title?: string | null, avatar?: string | null }`.
  Returns the updated user row (same shape `GET /auth/me` returns).

- [ ] **Step 1: Add the new route.** In
  `artifacts/api-server/src/routes/users.ts`, add (near, but not
  replacing, the existing `PATCH /:id` admin route — this is a distinct
  endpoint, mounted at a fixed `/me` path, not a merge of the two):
  ```typescript
  router.patch("/me", async (req, res) => {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, title, avatar } = req.body;
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (title !== undefined) updates.title = title;
    if (avatar !== undefined) updates.avatar = avatar;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });
  ```
  Read the top of this file first to confirm the exact existing
  `db`/`and`/`eq`/`usersTable` import names before writing this (match
  what's already imported, don't introduce a second import style).
  **Mount order matters**: Express matches routes in registration order,
  and `/:id` would otherwise swallow a request to `/me` as if `"me"` were
  an id — register this `PATCH /me` route BEFORE the existing
  `PATCH /:id` route in this file, not after.

- [ ] **Step 2: Add a mutation hook.** Find this project's established
  pattern for wrapping a `PATCH` call as a react-query mutation (check
  `useUpdateTask()` in `useTasks.ts` or the equivalent already used for
  `admin.tsx`'s user-edit calls) and add a matching `useUpdateProfile()`
  hook calling `PATCH /users/me`, invalidating whatever query key
  `useAuthStore`/`GET /auth/me` data is cached under so the UI reflects
  the change immediately after a successful save.

- [ ] **Step 3: Add an edit form to `profile.tsx`.** An "Edit Profile"
  button toggles a small form (name, title, avatar-URL-or-upload —
  avatar as a plain URL text field is sufficient for this task; a file
  upload for avatars is out of scope here, that's Sub-project D's
  media-upload capability, not this one) that calls the new mutation hook
  on save. Keep the existing read-only view as the default state; the
  form only replaces it while actively editing.

- [ ] **Step 4: Typecheck.** Expected: 0 errors.

- [ ] **Step 5: Manual verification.** `curl -b <session-cookie> -X PATCH
  http://localhost/api/users/me -H "Content-Type: application/json" -d
  '{"title":"Senior Artist"}'` as a non-admin user (e.g. `artist@acme.com`)
  and confirm 200 + the updated row, then confirm a second non-owning
  user's session cannot reach another user's data through this route
  (there is no `:id` param to manipulate — the route only ever touches
  `req.userId` — but confirm this explicitly rather than assuming).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/users.ts artifacts/forge/src/hooks/useUsers.ts artifacts/forge/src/pages/profile.tsx
git commit -m "feat: self-service profile editing (name/title/avatar)"
```

---

### Task 6: Live-verify the review feedback tab is reachable by artists

**Files:** none (verification only — this session's research found no
code-level exclusion, but did not click through it live; confirm before
marking this checklist item resolved).

- [ ] **Step 1**: Log in as `artist@acme.com` (password `password123`),
  open a task under review via `TaskDrawer`, click "View Review Feedback"
  (confirmed to exist at `TaskDrawer.tsx:829-842`, linking to
  `/review?mode=feedback`), and confirm the feedback list actually
  renders for the artist role (not just that the link exists).

- [ ] **Step 2**: If it renders correctly with no errors, this item is
  done — record that in the SDD ledger as a verify-only task with no
  commit, per this project's established convention for verification
  tasks. If it does NOT render correctly (blank page, console error, or
  an unexpected redirect), that becomes a real bug — file it as a fix
  round on this task rather than silently leaving it broken, following
  the same severity convention as every other RBAC-visibility gap this
  session (a real, unintended access gap is Major, not Minor).

---

## Self-Review

**Spec coverage**: Sub-project K (§13) → Task 3. Sub-project L step 1
(§14) → Task 1 (step 2's top-bar declutter is intentionally a separate
plan, since it's a larger, more architecturally involved change touching
the workspace-switcher store and department-scope logic). Sub-project M
step 1 (§15) → Task 4 (step 2, feedback-tab visibility, → Task 6, since
this session's research found it likely already works and just needs
live confirmation, not a build). Sub-project N step 3 (§16) → Task 2
(steps 1-2 of §16, admin's own dashboard and admin-never-assigns, are a
separate, larger plan alongside Sub-project L step 2). Sub-project Q
(§19) → Task 5.

**Placeholder scan**: no "TBD"/"handle appropriately" language; every
code step shows the actual diff or the actual new code, not a
description of it.

**Type consistency**: `resolveNotificationRoute`'s signature is unchanged
across Tasks 1's two files (only its export visibility changes).
`PATCH /users/me`'s request/response shape in Task 5 is defined once and
consumed identically by the new hook and the profile-page form. Task 4's
`"eraser"` addition to `AnnotationTool` is a pure union extension — no
existing consumer of that type needs updating beyond the two files
listed, confirmed by this session's research showing only
`AnnotationToolbar`/`AnnotationCanvas` consume it.
