# Real Task Assignment, Audit Trail, and Global Mock-Data Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task assignment actually persist to the database (artists can be assigned tasks and can self-claim unassigned ones), rebuild the "Time Travel" rollback feature on a real audit-log table, rebuild the AI Insights panel and Scheduling auto-resolve against real data, purge every remaining raw `mockData.ts` array import from live pages, and add a real Excel/CSV bulk-import path for Scheduling/Tracking Grid.

**Architecture:** Backend routes and schema already exist for almost everything (`tasks.ts`, `useTasks.ts`'s nested-resource hooks, `auditLogsTable` in `core.ts`, `departments.ts`) but the frontend either never calls them or calls them with the wrong field names (mock `Task` shape: `assigneeId`/`assetId`/`shotId`/`projectId` vs. real `tasksTable` shape: `assignedTo`/`entityId`+`entityType`). This plan is primarily a **frontend field-shape correction + real-data rewiring** effort, plus three small backend additions (task RBAC gating, invite-time department picker, audit-log write path). No new architecture — reuse the same "Zustand store hydrated by `fetchMe()` on login" pattern already used for `PROJECTS`/`USERS`/`ASSETS`/`SHOTS`/`DEPARTMENTS`.

**Tech Stack:** Express + Drizzle ORM (backend), React + Zustand + TanStack Query (frontend), Vite/pnpm workspace.

**Spec:** No separate spec doc — this plan is written directly from a live-code audit (background agent `a62ff31868903c86d`, this session) confirming exact file:line locations for every gap below. Treat this plan document itself as the spec.

## Global Constraints

- Drizzle ORM only. Any schema change needs a real committed migration via `drizzle-kit generate` (placeholder `DATABASE_URL` is fine for generation).
- `pnpm run typecheck` must stay green after every task (clean-install `node_modules` first per this repo's established Docker/Windows corruption issue: `rm -rf node_modules .pnpm-store artifacts/*/node_modules lib/*/node_modules scripts/node_modules` before typechecking if anything looks off).
- No changes to `artifacts/mockup-sandbox`.
- Do NOT touch Workflows, Marketplace, or Integrations Hub pages/routes — user explicitly chose to keep these as-is and deprioritize DCC integration for now.
- Server-side capability checks use the existing `requireCapability(capabilityId)` middleware (`artifacts/api-server/src/middleware/rbac.ts`), backed by the real `tenant_role_capabilities` table. Valid capability ids are the `CAPABILITY_IDS` list in `artifacts/forge/src/store/permissions.ts` (`create_tasks`, `edit_tasks`, `assign_tasks`, etc.) — these are already seeded per-role by `scripts/src/reset-and-bootstrap-admin.ts` matching `DEFAULT_PERMISSION_SCHEME` exactly (artist has `edit_tasks: true`, `assign_tasks: false`; lead/producer/production_head/admin have both `true`).
- Real `tasksTable` shape (`artifacts/forge/src/hooks/useTasks.ts:13-33`, `TaskDTO`): `id, tenantId, entityId, entityType ("asset"|"shot"), title, description, assignedTo, status, priority, department, pipelinePhase, weeklyRating, tags, estimatedHours, actualHours, startDate, dueDate, lastStatusUpdate, createdAt`. It has NO `assigneeId`, NO `assetId`/`shotId` (use `entityId`+`entityType`), NO `projectId` (derive via the asset/shot's own `projectId`), and NO inline `checklist`/`comments`/`dependencies`/`attachments`/`approvalHistory`/`dailyLogs` — those are separate nested resources with their own real hooks already built in `useTasks.ts`: `useTaskChecklist`/`useAddChecklistItem`/`useToggleChecklistItem`, `useTaskComments`/`useAddTaskComment`, `useTaskDependencies`/`useAddTaskDependency`, `useTaskAttachments`/`useAddTaskAttachment`, `useTaskApprovalEvents`/`useAddTaskApprovalEvent`, `useDailyLogs`/`useDailyLogsByUser`/`useAddDailyLog`.
- `store/tasks.ts`'s `tasks` array IS already real backend data after login (`store/auth.ts:132-134` calls `useTasksStore.getState().setTasks(tasks)` with the real `GET /tasks` response) — the bug is entirely in how that data is written back (wrong field names) and read (code still expects mock-only fields like `assigneeId`/`assetId`/`checklist`).
- Every task in this plan that touches a `.tsx` page must be manually smoke-tested against the live LAN deployment (`http://10.180.9.120`, admin login already documented) after its own review passes — this repo has no test suite; `pnpm run typecheck` + manual browser verification is the standard here (established precedent, RBAC hardening plan and this session's standups work).

---

### Task 1: Backend — harden `tasks.ts` (RBAC gating, self-claim, patchable fields)

**Files:**
- Modify: `artifacts/api-server/src/routes/tasks.ts`

**Interfaces:**
- Consumes: existing `requireCapability` from `../middleware/rbac`, existing `assignedToIsArtist`/`userInTenant` helpers already in this file.
- Produces: no new exports; behavior change only.

- [ ] **Step 1**: Import `requireCapability` from `../middleware/rbac` (not currently imported in this file).
- [ ] **Step 2**: Add `requireCapability("create_tasks")` as a second middleware arg on `tasksRouter.post("/", ...)` (line 100), same pattern as `departments.ts:31` (`router.post("/", requireCapability("manage_members"), async (req, res) => {`).
- [ ] **Step 3**: On `tasksRouter.put("/:id", ...)` (line 167), replace the plain `async (req, res) => {` handler with capability logic that runs AFTER loading `existing` (need `existing.assignedTo` to detect self-claim) but BEFORE applying updates. Insert this block right after the `if (!existing) return res.status(404)...` check (after line 177), before the existing `assignedTo` validation block at line 179:
  ```ts
  const bodyKeys = Object.keys(req.body);
  const onlyClaimingSelf =
    bodyKeys.length === 1 &&
    bodyKeys[0] === "assignedTo" &&
    existing.assignedTo === null &&
    req.body.assignedTo === req.userId;

  if (!onlyClaimingSelf) {
    const isReassigning = "assignedTo" in req.body;
    const requiredCapability = isReassigning ? "assign_tasks" : "edit_tasks";
    const [grant] = await db
      .select()
      .from(tenantRoleCapabilitiesTable)
      .where(
        and(
          eq(tenantRoleCapabilitiesTable.roleId, req.roleId!),
          eq(tenantRoleCapabilitiesTable.capabilityId, requiredCapability),
        ),
      );
    if (!grant)
      return res.status(403).json({ error: "Forbidden: Missing capability" });
  }
  ```
  This lets an artist with only `edit_tasks` claim any currently-unassigned task for themselves (the one exception the user explicitly asked for — "they should be able to take tasks on their own") while every other reassignment still requires `assign_tasks`, and every other field edit still requires `edit_tasks`.
- [ ] **Step 4**: Add the import `tenantRoleCapabilitiesTable` from `@workspace/db/schema` (alongside the existing `tasksTable, usersTable, ...` import block) to support Step 3's query.
- [ ] **Step 5**: Add `"startDate"` and `"dueDate"` to `TASK_PATCHABLE_FIELDS` (line 153-165) so date changes actually persist — currently completely absent, meaning any frontend "reschedule" action silently no-ops server-side. In the `updates` build loop (line 194-196), special-case these two fields to convert to `Date` before assigning (matching `POST /`'s `dueDate ? new Date(dueDate) : null` pattern at line 138): replace the loop body with
  ```ts
  for (const field of TASK_PATCHABLE_FIELDS) {
    if (!(field in req.body)) continue;
    if (field === "startDate" || field === "dueDate") {
      updates[field] = req.body[field] ? new Date(req.body[field]) : null;
    } else {
      updates[field] = req.body[field];
    }
  }
  ```
- [ ] **Step 6**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 7**: Commit: `git add artifacts/api-server/src/routes/tasks.ts && git commit -m "feat: server-enforce task RBAC with artist self-claim exception, fix date persistence"`.

---

### Task 2: Backend — department picker at invite time

**Files:**
- Modify: `lib/db/src/schema/core.ts` (`pendingInvitesTable`)
- Create: a new Drizzle migration (via `drizzle-kit generate`, exact filename generated)
- Modify: `artifacts/api-server/src/routes/invites.ts`
- Modify: `artifacts/forge/src/hooks/useUsers.ts` (`useSendInvite`)
- Modify: `artifacts/forge/src/pages/admin.tsx` (Invite Member dialog, lines ~213-256)

**Interfaces:**
- Consumes: `DepartmentDTO` / `useDepartments()` from `artifacts/forge/src/hooks/useDepartments.ts` (already imported in `admin.tsx`).
- Produces: `pendingInvitesTable.departmentId: text (nullable, FK -> departments.id, onDelete: "set null")`.

- [ ] **Step 1**: In `lib/db/src/schema/core.ts`, add `departmentId: text("department_id").references(() => departmentsTable.id, { onDelete: "set null" }),` to `pendingInvitesTable` (after the `roleId` field, line 67). Add the import `import { departmentsTable } from "./departments";` at the top (this file already imports `tenantRolesTable` from `./rbac` — same pattern).
- [ ] **Step 2**: Generate the migration: from the repo root, run drizzle-kit generate against `lib/db` with a placeholder `DATABASE_URL` (same approach as prior migrations in this repo — check `lib/db/package.json` for the exact `generate` script name/command before running).
- [ ] **Step 3**: In `artifacts/api-server/src/routes/invites.ts`, `POST /` handler (line 24-83): destructure `departmentId` alongside `email, roleId` (line 31); if provided, validate it belongs to the tenant the same way `role` is validated (lines 35-44) — select from `departmentsTable` where `id = departmentId AND tenantId = tenantId`, 400 if not found; pass `departmentId: departmentId ?? null` into the `pendingInvitesTable` insert values (line 59-66).
- [ ] **Step 4**: In the same file's `POST /:token/accept` handler (line 129-182): select `departmentId` from the fetched `invite` row (the `select()` at line 137 already does `select()` with no column list, so it's already included) and use `invite.departmentId` instead of the hardcoded `null` at line 153 in the `usersTable` insert.
- [ ] **Step 5**: In `artifacts/forge/src/hooks/useUsers.ts`, find `useSendInvite()` and widen its mutation body type to accept an optional `departmentId?: string`, passed straight through in the POST body (same pattern as the existing `email`/`roleId` fields — read the hook first to match its exact current shape).
- [ ] **Step 6**: In `artifacts/forge/src/pages/admin.tsx`, add a `departments` Select to the Invite Member dialog (between the Role select at lines 232-246 and the Send Invite button at line 247), reusing the exact same `<Select name="departmentId">` / `<SelectItem>` pattern already used in the New User dialog at lines 299-313 (this page already has `departments` from `useDepartments()` in scope at line 56). Make it optional (no `required` attr, placeholder "None — assign later"). Update `handleInvite` to read and forward `departmentId` from the `FormData`.
- [ ] **Step 7**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 8**: Manually verify: invite a test email into the "Animation" department, confirm after accept the new user shows "Animation" in Admin Panel's user table without needing manual reassignment. Clean up the test account afterward (same pattern as this session's earlier SMTP end-to-end test).
- [ ] **Step 9**: Commit.

---

### Task 3: Backend — real audit-log write path + read route

**Files:**
- Modify: `artifacts/api-server/src/routes/assets.ts`
- Modify: `artifacts/api-server/src/routes/shots.ts`
- Create: `artifacts/api-server/src/lib/auditLog.ts`
- Create: `artifacts/api-server/src/routes/audit-logs.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (mount new router)

**Interfaces:**
- Consumes: the existing `auditLogsTable` in `lib/db/src/schema/core.ts:48-59` (already defined, never used anywhere — `id, tenantId, actorUserId, action, targetEntityType, targetEntityId, metadata (jsonb), createdAt`). No schema change needed.
- Produces: `recordAuditLog({ tenantId, actorUserId, action, targetEntityType, targetEntityId, before, after })` helper; `GET /audit-logs?entityId=` route.

- [ ] **Step 1**: Create `artifacts/api-server/src/lib/auditLog.ts`:
  ```ts
  import { db, auditLogsTable } from "@workspace/db";
  import * as crypto from "crypto";

  export async function recordAuditLog(params: {
    tenantId: string;
    actorUserId: string;
    action: string;
    targetEntityType: "asset" | "shot";
    targetEntityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }) {
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: params.action,
      targetEntityType: params.targetEntityType,
      targetEntityId: params.targetEntityId,
      metadata: { before: params.before, after: params.after },
    });
  }
  ```
  (Confirm `auditLogsTable` is exported from `@workspace/db`'s barrel — same import style already used for `tasksTable` etc. in `tasks.ts`.)
- [ ] **Step 2**: In `artifacts/api-server/src/routes/assets.ts`, find the `PUT /:id` handler. Before applying the update, capture the existing row's patchable fields as `before`; after applying, call `recordAuditLog({ tenantId, actorUserId: req.userId!, action: "update", targetEntityType: "asset", targetEntityId: req.params.id, before, after: updates })` (only include the fields actually present in `req.body`/`updates`, not the whole row — read the file's own `PATCHABLE_FIELDS`-equivalent list first to match its exact variable names). Do this as a fire-and-forget `.catch(err => req.log.error(err, "audit log write failed"))` so a logging failure never blocks the actual mutation response.
- [ ] **Step 3**: Same change in `artifacts/api-server/src/routes/shots.ts`'s `PUT /:id` handler (uses `PATCHABLE_FIELDS` per the earlier grep in this session — confirm exact name/line before editing).
- [ ] **Step 4**: Create `artifacts/api-server/src/routes/audit-logs.ts`:
  ```ts
  import { Router } from "express";
  import { db, auditLogsTable } from "@workspace/db";
  import { eq, and, desc } from "drizzle-orm";
  import { tenantAuthMiddleware } from "../middleware/tenant";

  export const auditLogsRouter = Router();
  auditLogsRouter.use(tenantAuthMiddleware);

  auditLogsRouter.get("/", async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const { entityId } = req.query;
      const conditions = [eq(auditLogsTable.tenantId, tenantId)];
      if (typeof entityId === "string")
        conditions.push(eq(auditLogsTable.targetEntityId, entityId));
      const rows = await db
        .select()
        .from(auditLogsTable)
        .where(and(...conditions))
        .orderBy(desc(auditLogsTable.createdAt));
      return res.json(rows);
    } catch (err) {
      req.log.error(err, "Failed to fetch audit logs");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  ```
- [ ] **Step 5**: Mount it in `artifacts/api-server/src/routes/index.ts`: `router.use("/audit-logs", auditLogsRouter);` (same pattern as the existing `invites` mount).
- [ ] **Step 6**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 7**: Commit.

---

### Task 4: Frontend — fix `store/tasks.ts` field-shape + add self-claim action

**Files:**
- Modify: `artifacts/forge/src/store/tasks.ts`

**Interfaces:**
- Produces: `claimTask: (id: string, userId: string) => void` added to `TaskState`; `reassignTask`, `addTask`, `updateTaskDates` now send real backend field names.
- Consumes: nothing new — same `syncBackend` helper, same `apiFetch`.

- [ ] **Step 1**: In `reassignTask` (line 112-119), change the local `set` to still write `assigneeId` on the LOCAL mock-shaped object (other frontend code isn't migrated yet — Tasks 5-7 handle that), but change the `syncBackend` call to send the real field name: `syncBackend(id, { assignedTo: assigneeId || null });`.
- [ ] **Step 2**: In `revokeAssignment` (line 120-127), same fix: `syncBackend(id, { assignedTo: null });`.
- [ ] **Step 3**: Add a new `claimTask` action right after `reassignTask`:
  ```ts
  claimTask: (id, userId) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, assigneeId: userId } : t,
      ),
    }));
    syncBackend(id, { assignedTo: userId });
  },
  ```
  and add `claimTask: (id: string, userId: string) => void;` to the `TaskState` interface (after `reassignTask`'s declaration, line 19).
- [ ] **Step 4**: In `updateTaskDates` (line 78-85), change `syncBackend(id, { dueDate: newDate })` — `newDate` here is already a string; confirm it's ISO-parseable (the backend's Task 1 Step 5 change does `new Date(req.body.dueDate)`, which accepts ISO strings) — no change needed if callers already pass ISO strings; if not, note this for the calling page in Tasks 5-7's brief.
- [ ] **Step 5**: `addTask` (line 69-77) sends the raw mock `Task` object as the POST body, which doesn't match the real `POST /tasks` shape (`entityId, entityType, status, title, description, priority, department, pipelinePhase, dueDate, estimatedHours, assignedTo`). Leave `addTask`'s signature and local `set()` alone (still takes a mock-shaped `Task` for the optimistic UI), but change its backend call to map fields explicitly:
  ```ts
  import("@/lib/apiClient").then(({ apiFetch }) => {
    apiFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({
        entityId: task.assetId || task.shotId,
        entityType: task.assetId ? "asset" : "shot",
        status: task.status,
        title: task.title,
        description: task.description,
        priority: task.priority,
        department: task.department,
        pipelinePhase: task.pipelinePhase,
        dueDate: task.dueDate,
        estimatedHours: task.estimatedHours,
        assignedTo: task.assigneeId || null,
      }),
    }).catch(console.error);
  });
  ```
- [ ] **Step 6**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 7**: Commit.

---

### Task 5: Frontend — Task consumers group A: `TaskDrawer.tsx`, `CreateTaskModal.tsx`, `tasks.tsx`

**Files:**
- Modify: `artifacts/forge/src/components/*/TaskDrawer.tsx` (locate exact path first — referenced in the audit as `TaskDrawer.tsx`)
- Modify: `artifacts/forge/src/components/*/CreateTaskModal.tsx` (locate exact path)
- Modify: `artifacts/forge/src/pages/tasks.tsx`

**Interfaces:**
- Consumes: `useTaskChecklist`/`useAddChecklistItem`/`useToggleChecklistItem`, `useTaskComments`/`useAddTaskComment`, `useTaskDependencies`/`useAddTaskDependency`, `useTaskAttachments`/`useAddTaskAttachment`, `useTaskApprovalEvents`/`useAddTaskApprovalEvent`, `useDailyLogs`/`useAddDailyLog` — all from `artifacts/forge/src/hooks/useTasks.ts` (Task 4's `claimTask` from `store/tasks.ts`).

- [ ] **Step 1**: Locate the exact file paths for `TaskDrawer` and `CreateTaskModal` (`Grep -r "TaskDrawer" artifacts/forge/src --include=*.tsx -l` / same for `CreateTaskModal`) before editing.
- [ ] **Step 2**: In `TaskDrawer`, replace every read of `task.checklist` with data from `useTaskChecklist(task.id)`; every read of `task.comments` with `useTaskComments(task.id)`; every read of `task.dependencies` with `useTaskDependencies(task.id)`; every read of `task.attachments` (if present) with `useTaskAttachments(task.id)`; every read of `task.approvalHistory` with `useTaskApprovalEvents(task.id)`; every read of `task.dailyLogs` with `useDailyLogs(task.id)`. Replace the corresponding mutation calls (`toggleChecklistItem`, `addComment`, `logTime`, `recordApprovalEvent` from `useTasksStore`) with their real-hook equivalents (`useToggleChecklistItem`, `useAddTaskComment`, `useAddDailyLog`, `useAddTaskApprovalEvent`).
- [ ] **Step 3**: Add a "Claim Task" button in `TaskDrawer`, visible only when `task.assignedTo` (or the local mock field `assigneeId` — whichever this file currently reads) is falsy AND the current user's role is `artist` (check `useAuthStore` for the current user/role pattern already used elsewhere in this file or a sibling component). Wire it to `useTasksStore.getState().claimTask(task.id, currentUser.id)` (Task 4's new action).
- [ ] **Step 4**: In `CreateTaskModal`, fix the submitted payload to use `entityId`/`entityType` derived from whatever asset/shot picker this modal already has, instead of separate `assetId`/`shotId` fields, matching Task 4 Step 5's `addTask` mapping.
- [ ] **Step 5**: In `pages/tasks.tsx`, fix any direct reads of `t.assigneeId`/`t.assetId`/`t.shotId`/`t.projectId` on task-store entries: `assigneeId` → keep reading (it's still the local field name per Task 4's approach — only the backend wire format changed, not the local Zustand shape), `assetId`/`shotId` → this page's local `tasks` array still has these fields from before hydration overwrote it with real `TaskDTO` data, so after login these will be `undefined`; replace any usage with a lookup: find the task's project via `useShots()`/`useAssets()`/store equivalents matching `task.entityId`+`task.entityType`, if this page needs a project label/filter. Read the file fully first to see exactly what's used.
- [ ] **Step 6**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 7**: Manually verify in browser at `http://10.180.9.120`: open a task, add a checklist item, add a comment, log time — confirm each persists across a page reload (proves it hit the real backend, not just local state).
- [ ] **Step 8**: Commit.

---

### Task 6: Frontend — Task consumers group B: `project-detail/TasksKanban.tsx`, `TasksList.tsx`, `department-detail.tsx`, `home.tsx`

**Files:**
- Modify: `artifacts/forge/src/pages/project-detail/TasksKanban.tsx`
- Modify: `artifacts/forge/src/pages/project-detail/TasksList.tsx`
- Modify: `artifacts/forge/src/pages/department-detail.tsx`
- Modify: `artifacts/forge/src/pages/home.tsx`

**Interfaces:**
- Consumes: same as Task 5 where each file actually needs it; most of this group only reads top-level `TaskDTO` fields (`status`, `assignedTo`/local `assigneeId`, `dueDate`, `priority`, `department`) which are already correct after Task 4 — this task is about removing any lingering `assetId`/`shotId`/`projectId`/`checklist.length` etc. reads that will now silently be `undefined`/crash.
- Produces: nothing new.

- [ ] **Step 1**: Read each file fully. For every place a task's `projectId` is read (to filter/group/link), replace with a lookup through the task's `entityId`+`entityType` against the already-hydrated `useShots()`/`useAssets()` data (or the Zustand shot/asset stores, matching whichever pattern the file already uses for other project lookups) to get the owning shot/asset's `projectId`.
- [ ] **Step 2**: For every place `task.checklist.length`/`task.comments.length`/similar inline-array reads appear (e.g. a "3/5 checklist items done" badge on a Kanban card), either drop the badge (if it needs live counts, that's a Task 5-level nested-hook fetch per card, likely too expensive for a list view) or replace with a static "View details" affordance — use judgment, note the decision in your task report.
- [ ] **Step 3**: In `home.tsx`, confirm the "Recent Feedback" widget (already real per the audit) is unaffected; only fix task-shape issues if this page also renders task summaries/counts elsewhere.
- [ ] **Step 4**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 5**: Manually verify Kanban board and project task list render without console errors and reflect real task data.
- [ ] **Step 6**: Commit.

---

### Task 7: Frontend — Task consumers group C: `scheduling/TeamBoard.tsx`, `TeamCalendar.tsx`, `CapacityForecast.tsx`, `daily-standup.tsx`, `timesheets.tsx`, `tracking.tsx`

**Files:**
- Modify: `artifacts/forge/src/pages/scheduling/TeamBoard.tsx`
- Modify: `artifacts/forge/src/pages/scheduling/TeamCalendar.tsx`
- Modify: `artifacts/forge/src/pages/scheduling/CapacityForecast.tsx`
- Modify: `artifacts/forge/src/pages/daily-standup.tsx`
- Modify: `artifacts/forge/src/pages/timesheets.tsx`
- Modify: `artifacts/forge/src/pages/tracking.tsx`

**Interfaces:** same as Task 6 — fix `projectId`/`assetId`/`shotId` derivations, remove dead inline-array reads.

- [ ] **Step 1**: `TeamCalendar.tsx` almost certainly drives drag-to-reschedule via `updateTaskDates` (Task 4) — confirm it passes an ISO date string; if it currently passes a different format, fix at the call site (cheaper than changing the store contract again).
- [ ] **Step 2**: `daily-standup.tsx` and `timesheets.tsx` both read `USERS`/`DEPARTMENTS`/`PROJECTS` raw from `mockData.ts` (per the audit) in addition to task data — leave the raw-import fix for Task 9, but fix any task-field-shape issues in this pass since they're intertwined with the same render logic.
- [ ] **Step 3**: `tracking.tsx` shot rows are already real (via `useShots()`); this task only needs to fix any task-shape reads mixed into the grid (e.g. a per-shot task-count column). Filter-dropdown mock-data fix is Task 9's job.
- [ ] **Step 4**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 5**: Manually verify Scheduling (TeamBoard/TeamCalendar/CapacityForecast) and Timesheets render without console errors.
- [ ] **Step 6**: Commit.

---

### Task 8: Frontend — rebuild "Time Travel" on real audit logs

**Files:**
- Create: `artifacts/forge/src/hooks/useAuditLogs.ts`
- Modify: `artifacts/forge/src/store/audit.ts`
- Modify: `artifacts/forge/src/pages/audit.tsx`

**Interfaces:**
- Consumes: `GET /audit-logs?entityId=` from Task 3.
- Produces: `useAuditLogs(entityId?: string)` hook returning `AuditLogDTO[]` (`id, tenantId, actorUserId, action, targetEntityType, targetEntityId, metadata: { before, after }, createdAt`).

- [ ] **Step 1**: Create `useAuditLogs.ts` following the exact pattern of `useDepartments.ts` (`useQuery`, `apiFetch`), typed against the shape Task 3 Step 4 returns.
- [ ] **Step 2**: In `store/audit.ts`, replace the `AUDIT_EVENTS` mock import and `computeRollbackPatch`'s filter/sort logic (lines 17-33) to instead accept the real audit-log rows as a parameter (fetched by the calling component via `useAuditLogs`) rather than importing a global mock array — `computeRollbackPatch(entityId, timestamp, logs: AuditLogDTO[])`. Adapt the "before/after" extraction: real logs store `metadata.before`/`metadata.after` as objects (Task 3), not a `changedFields: Record<string, "before → after">` string map — rewrite the patch-building loop accordingly (iterate `Object.entries(event.metadata.before)`, no string-split needed).
- [ ] **Step 3**: Update `rollbackEntity`'s call sites in `pages/audit.tsx` to pass the fetched real logs through.
- [ ] **Step 4**: In `pages/audit.tsx`, replace the `AUDIT_EVENTS` import and any rendering of it with `useAuditLogs()` (unfiltered, for the studio-wide timeline) or `useAuditLogs(selectedEntityId)` for a per-entity view, matching whatever this page's existing UI structure expects — read the file fully before editing.
- [ ] **Step 5**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 6**: Manually verify: edit an asset's status via its own page, confirm a new entry appears in Time Travel, and that rolling back actually reverts the live asset.
- [ ] **Step 7**: Commit.

---

### Task 9: Frontend — purge remaining raw `mockData.ts` imports

**Files:**
- Modify: `artifacts/forge/src/pages/people.tsx`
- Modify: `artifacts/forge/src/pages/production.tsx`
- Modify: `artifacts/forge/src/pages/chat.tsx`
- Modify: `artifacts/forge/src/pages/departments.tsx`
- Modify: `artifacts/forge/src/pages/daily-standup.tsx` (the `USERS, DEPARTMENTS, PROJECTS` import specifically — task-shape already handled in Task 7)
- Modify: `artifacts/forge/src/pages/timesheets.tsx` (same, `PROJECTS, USERS, DEPARTMENTS` import)
- Modify: `artifacts/forge/src/pages/scheduling/TeamBoard.tsx` (same, `USERS, PROJECTS, DEPARTMENTS`)
- Modify: `artifacts/forge/src/pages/scheduling/CapacityForecast.tsx` (`USERS, DEPARTMENTS, LEAVE_EVENTS` — see Step 3 for `LEAVE_EVENTS`)
- Modify: `artifacts/forge/src/pages/tracking.tsx` (filter dropdowns only: `PROJECTS, EPISODES, SEQUENCES, USERS, DEPARTMENTS`)

**Interfaces:**
- Consumes: whichever already-hydrated real-data source the rest of the app uses for users/departments/projects — check `store/users.ts`/`store/departments.ts`/`store/projects.ts` (or `hooks/useUsers.ts`/`useDepartments.ts` if those pages already use TanStack Query elsewhere) for the established convention, and follow it exactly rather than introducing a second pattern.

- [ ] **Step 1**: For each file, replace `import { USERS, DEPARTMENTS, PROJECTS, ... } from "@/data/mockData"` with the real hydrated equivalents. Confirm first whether this app's convention for USERS/DEPARTMENTS/PROJECTS post-hydration is "read the mutated mock array directly" (since `fetchMe()` does `USERS.length = 0; USERS.push(...)` in place) or "read from a Zustand store" — if the mutated-array approach is already relied on elsewhere successfully, the fix here may be as simple as confirming these pages already get live data through the existing mutated arrays and the real bug is elsewhere (re-verify against a live reload before assuming a rewrite is needed). Only introduce a store/hook read if the mutated-array approach is provably stale in these specific files.
- [ ] **Step 2**: For `chat.tsx` and `departments.tsx`, same treatment for their `DEPARTMENTS`/`USERS`/`TASKS` imports.
- [ ] **Step 3**: `CapacityForecast.tsx`'s `LEAVE_EVENTS` array (`mockData.ts:2821`, synthesized from fake `USERS`) has no real backend at all — there is no leave/PTO tracking feature built yet. Do not attempt to fabricate a backend for it in this task; instead render an empty/placeholder state ("No leave data yet") when `LEAVE_EVENTS` would otherwise show fake entries mixed with real employees, and note this as a real feature gap in your task report (out of scope for this plan — flag for a future plan).
- [ ] **Step 4**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 5**: Manually verify People/Studio Roster, Production Dashboard, Chat, Departments, Daily Standup, Timesheets, Scheduling, and Tracking Grid each show only the real employees/departments/projects currently in the tenant — no fake names.
- [ ] **Step 6**: Commit.

---

### Task 10: Frontend — rebuild AI Insights + Scheduling auto-resolve against real data

**Files:**
- Modify: `artifacts/forge/src/lib/aiInsights.ts`
- Modify: `artifacts/forge/src/pages/scheduling/index.tsx` (`handleAutoResolve`, lines 70-101)

**Interfaces:**
- Consumes: whatever real data source Task 9 established for `USERS`/`DEPARTMENTS`/`PROJECTS`, plus the real, already-hydrated `ASSETS`/`SHOTS`/`TASKS`.

- [ ] **Step 1**: `aiInsights.ts`'s four insight functions (`findBlockingAssetInsight`, `findDepartmentPaceInsight`, `findProjectRiskInsight`, `findDepartmentOnTrackInsight`) already compute purely from `ASSETS`/`DEPARTMENTS`/`PROJECTS`/`SHOTS`/`TASKS` — since these arrays are already real post-hydration (mutated in place by `fetchMe()`), the computation logic itself does NOT need to change. Verify this file's imports resolve to the same real, mutated `mockData.ts` arrays (they already do — no fake seed logic lives in this file itself). The panel showing "fabricated" data is a side effect of the tenant being near-empty (few real projects/tasks yet), not fake logic — confirm by checking whether `generateProducerInsights()` returns `[]` or near-empty for a near-empty real tenant (it should, since every finder function has an early-return guard). If it does, no code change is needed here — just note in your report that this panel was already correctly wired and will populate meaningfully once real project data exists (matches the user's own framing: "once a real project is implemented for testing then we can test it for the best").
- [ ] **Step 2**: If Step 1's verification instead finds `generateProducerInsights()` still returning results built from fake departments/projects even against the current near-empty real tenant (i.e. the mutated-array assumption from Task 9 Step 1 turned out false for this file specifically), fix the import to pull from whatever real source Task 9 established instead.
- [ ] **Step 3**: In `scheduling/index.tsx`'s `handleAutoResolve` (lines 70-101), replace any `USERS`/`DEPARTMENTS` reference used for reassignment-candidate matching with the real equivalents (same source as Task 9), and change its task-reassignment call to use `useTasksStore.getState().reassignTask` (Task 4's fixed version, which now syncs correctly) or the new `claimTask` where appropriate, instead of whatever local-only mutation it currently performs.
- [ ] **Step 4**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 5**: Manually verify: with the current small real tenant (Animation dept, 2 artists), the AI Insights panel either shows a real, data-grounded insight or an appropriately empty state — never a fabricated one referencing departments/projects that don't exist in this tenant.
- [ ] **Step 6**: Commit.

---

### Task 11: Frontend — real Excel/CSV import for Scheduling and Tracking Grid

**Files:**
- Modify: `artifacts/forge/package.json` (add a parsing dependency)
- Modify: `artifacts/forge/src/pages/scheduling/index.tsx` (replace the fake dropzone, lines ~107-152, ~225-235)
- Modify: `artifacts/forge/src/pages/tracking.tsx` (add an equivalent import entry point if one doesn't already exist)

**Interfaces:**
- Consumes: `useCreateShot()` (`hooks/useShots.ts`) for shot rows; for task rows, use the fixed `store/tasks.ts` `addTask()` (Task 4) or a direct `apiFetch("/tasks", { method: "POST", body: ... })` loop matching the real `POST /tasks` shape from the Global Constraints section.
- Produces: nothing new exported — internal component logic only.

- [ ] **Step 1**: Add `xlsx` (SheetJS) as a dependency in `artifacts/forge/package.json` (`"xlsx": "^0.18.5"` — confirm current latest stable at install time) — it parses both `.xlsx` and `.csv` client-side with no backend involvement, matching this app's existing all-client-side-parsing patterns elsewhere.
- [ ] **Step 2**: In `scheduling/index.tsx`, replace the non-functional dropzone with a real `<input type="file" accept=".xlsx,.csv" onChange={...} />`. On file select: read via `FileReader`, parse with `XLSX.read(data, { type: "array" })`, take the first sheet, convert to JSON rows via `XLSX.utils.sheet_to_json`.
- [ ] **Step 3**: Define an explicit expected column mapping and show it in the UI (e.g. a small "Expected columns: Shot Name, Episode, Sequence, Status, Assignee Email, Due Date" hint) — do not attempt fuzzy/auto column-detection; require exact header names for the first version. Validate each row has the required columns before offering an "Import N rows" confirm button; show per-row errors for rows that fail validation instead of silently skipping them.
- [ ] **Step 4**: Replace `handleStartImport`'s hardcoded 3-task injection (lines 107-152) with a real loop: for each validated row, resolve `Assignee Email` to a real user id (match against the already-hydrated real `USERS`/user store from Task 9 — skip/flag rows with an unmatched email rather than silently dropping the assignee), then call `useCreateShot()` or the task-creation path (matching this row's target resource — Scheduling likely imports tasks, Tracking Grid likely imports shots; confirm which this page is actually meant to bulk-create by re-reading its current fake-import UI copy before deciding).
- [ ] **Step 5**: Gate the whole import UI behind the `create_tasks` (or `manage_pipeline`, whichever fits — check `useCapability()` usage elsewhere in this file) capability so only production manager/lead-tier roles see it, per the user's explicit ask ("either the production manager or the lead").
- [ ] **Step 6**: If `tracking.tsx` doesn't already have an entry point for this, add a small "Import" button near its existing filter bar that opens the same import flow (reuse Step 2-5's logic as a shared component rather than duplicating it — extract to e.g. `components/scheduling/ExcelImportDialog.tsx` if it's cleaner to share).
- [ ] **Step 7**: Run `pnpm run typecheck`. Fix any type errors.
- [ ] **Step 8**: Manually verify: build a small real `.xlsx` test file with 2-3 shot/task rows, import it, confirm the rows appear as real backend-persisted records (survive a reload) with the correct assignee/department.
- [ ] **Step 9**: Commit.

---

## Final Review

After all 11 tasks are complete: dispatch the final whole-branch code reviewer (per subagent-driven-development), on the most capable available model. Pay particular attention to:
- Every remaining `assigneeId`/`assetId`/`shotId`/`projectId` read on a task object that Tasks 5-7 might have missed (grep the whole `artifacts/forge/src` tree one more time for these four field names scoped to task-shaped variables).
- No raw `mockData.ts` array import remains in any page outside of `tasks.tsx`'s/`TaskDrawer`'s continued (correct) use of the mock `Task` type definition itself for local optimistic state.
- The task RBAC change (Task 1) doesn't block the admin from creating/assigning tasks (admin has every capability per `DEFAULT_PERMISSION_SCHEME`).

Once clean, use `superpowers:finishing-a-development-branch` to decide how to integrate — this work continues in the same `rbac-login-core` worktree/branch already in flight this session (do not create a new worktree).
