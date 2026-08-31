# Forge Codebase Inventory

Snapshot of `artifacts/forge/src` (routes, pages, controls) and
`artifacts/api-server/src` + `lib/db/src/schema` (what's real vs. mocked),
as they exist on disk in this worktree (`worktree-shotgrid-parity-audit`,
branched from `origin/main` at `a862b9f`). Read-only audit — nothing in
`artifacts/` or `lib/` was modified to produce this document.

Note on scope: a separate, unrelated worktree (`full-backend-build-out`) is
mid-execution on a much larger plan that adds new backend routes/schema and
enriches some of these same page files (`shots.tsx`, `assets.tsx`,
`tasks.tsx`). None of that work is reflected here by design — this is a
snapshot of the current worktree's own files only.

---

## Errors Found

- **Verified: no broken `App.tsx` page imports today.** Every `import X from "@/pages/..."` in `artifacts/forge/src/App.tsx` (lines 15–53) resolves to an existing file under `artifacts/forge/src/pages/` (confirmed via directory listing — `login.tsx`, `home.tsx`, `projects.tsx`, `project-detail/index.tsx`, `scheduling/index.tsx`, `schema-builder/index.tsx`, and all other page files referenced by a route all exist). No orphaned routes at the route-table level. This independently checks the spec's generic "flag broken imports" instruction — nothing broken was pre-existing/inherited here; the four findings below were newly identified in this pass.

- **`/shots` page (`pages/shots.tsx`) calls a backend endpoint that doesn't exist** — `artifacts/forge/src/hooks/useShots.ts:19-27` (called from `artifacts/forge/src/pages/shots.tsx:51`) fetches `GET /shots` (resolves to `/api/shots` via `apiClient.ts`'s auto-prefixing), and `artifacts/api-server/src/routes/index.ts:11-22` mounts only `/auth`, `/projects`, `/tasks`, `/users`, `/departments`, `/roles`, `/standups` under `/api` — there is no `routes/shots.ts`. The request 404s. `shots.tsx:51` defaults `data: shots = []`, so the page doesn't crash — it silently renders "No shots found" / an empty grid unconditionally. The entire Shot Management page is functionally dead (no shot, real or mock, ever displays), even though `shotsTable` already exists in `lib/db/src/schema/production.ts:32-44`.

- **Project Dashboard's "Recent Activity" panel calls a backend endpoint that doesn't exist** — `artifacts/forge/src/hooks/useAudit.ts:15-27` (called from `artifacts/forge/src/pages/project-detail/DashboardTab.tsx:57`) fetches `GET /audit?projectId=...` (→ `/api/audit`); no `/audit` route is mounted (same route list as above). Degrades silently (`const events = auditData || []`, `DashboardTab.tsx:58`) rather than erroring — the panel just always renders empty, even though `auditLogsTable` already exists in `lib/db/src/schema/core.ts:48-59`.

- **Three more hooks target unmounted endpoints, but are currently unused (dead code, not an active bug)** — `artifacts/forge/src/hooks/useAssets.ts`, `useVersions.ts`, and `useNotes.ts` define `useQuery`/`useMutation` calls against `/api/assets`, `/api/versions`, and `/api/notes` respectively — none of which exist as backend routes either. A repo-wide search for `from "@/hooks/useAssets"` / `"@/hooks/useVersions"` / `"@/hooks/useNotes"` found zero importers among pages or components. These are inert today (nothing calls them), but would immediately hit the same 404 pattern as the two items above the moment something imports them.

- **Department Detail page 404s ("Department not found") for every real department, right now** — `artifacts/forge/src/pages/departments.tsx:34` sources its department list from the real, backend-DB-backed `useDepartments()` hook (real UUID ids from `departmentsTable`), and links every card/pipeline-chip to `/departments/${dept.id}` (`departments.tsx:121,218`). But `artifacts/forge/src/pages/department-detail.tsx:15,60` still resolves that id against the static frontend-mock `DEPARTMENTS` array imported from `data/mockData.ts` (placeholder ids like `"dept1"`). A real department's UUID never matches a mock id, so `DEPARTMENTS.find((d) => d.id === id)` returns `undefined` and the page renders its "Department not found" branch (`department-detail.tsx:71-77`) for every department reached from the (now backend-real) `/departments` list. This isn't speculative — `departments.tsx`'s own code comment (lines 41-46) independently states "mockData's placeholder ids ('dept1'...) ... never match the real backend's UUID department ids," confirming the same mismatch from the other side. **App breaks at runtime for a core, everyday navigation path** (Departments list → click a department).

---

## Login (`src/pages/login.tsx`, route `/login/:role?`)
- **Purpose:** Role-portal picker + email/password login form; auto-fills demo credentials when a role is preselected via the URL param.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Real backend — `useAuthStore.login()` (`store/auth.ts`) calls the real `/auth` API (per `forge-final.md` and confirmed still mounted in `routes/index.ts`).

## ClientReview (`src/pages/client-review.tsx`, route `/client-review`)
- **Purpose:** External, unauthenticated client review portal — access-code gate, then a dashboard of pending reviews and a frame-accurate annotation/approval player.
- **Existing dropdowns/filters/sort controls:** None found in this file (annotation tool palette and color swatches are editing tools, not filter/sort controls).
- **Data source:** Frontend-mock — `useShotStore`, `useReviewStore`, `useBroadcastsStore` (zustand), plus static `PROJECTS`/`STUDIOS`/`VERSIONS` from `data/mockData.ts`.

## DeliveryDetail (`src/pages/delivery-detail.tsx`, route `/delivery/:id`)
- **Purpose:** Public (access-code-gated) landing page for one delivery link — watermarked shot playback, package browsing, manifest download. Sits outside `AuthGuard`.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Frontend-mock — `useDeliveryStore`, `useProjectStore`, `useShotStore` (zustand).

## Home (`src/pages/home.tsx`, route `/`)
- **Purpose:** Role-dependent landing dashboard — renders one of `ProducerDashboard` / `SupervisorDashboard` / `ArtistDashboard` / `ClientDashboard` based on the current user's role.
- **Existing dropdowns/filters/sort controls:** None found in this file (stat tiles, insight cards, and quick-action lists only — no filter/sort/group UI).
- **Data source:** Frontend-mock — `useProjectStore`, `useShotStore`, `useTasksStore`, `useReviewStore`, `useBroadcastsStore`, plus static `USERS`/`DEPARTMENTS` from `data/mockData.ts`.

## Projects (`src/pages/projects.tsx`, route `/projects`)
- **Purpose:** Studio-wide project list (table/card views) with export.
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search on project name.
  - `statusFilter` (`Select`) — Active / On Hold / Complete / All.
  - `typeFilter` (`Select`) — dynamically built from distinct `project.type` values in the current data / All.
  - `view` toggle — List vs. Card (not a filter, but a display-mode control).
- **Data source:** Real backend — `useProjects()` (`hooks/useProjects.ts`) → `GET /projects`.

## ProjectDetail (`src/pages/project-detail/index.tsx`, route `/projects/:id`)
- **Purpose:** Single-project workspace with 5 tabs: Dashboard, Shots & Assets, Tasks, Versions & Publishes, Dailies & Previews.
- **Existing dropdowns/filters/sort controls:**
  - **AssetsTab** (`AssetsTab.tsx`) — `view` toggle (Shots/Assets), free-text `search`, multi-select `statusFilter` (popover checklist), multi-select `typeFilter` (assets only).
  - **TasksTab** (`TasksTab.tsx`) — view switcher (Kanban / List / Timeline), not a filter.
    - **TasksList** (`TasksList.tsx`) — `groupBy` `Select` (None / Assignee / Status / Priority / Department); per-row inline Assignee/Status/Priority `Select`s; bulk-action `DropdownMenu`s (bulk status change, bulk reassign) triggered from multi-select checkboxes.
    - **TasksKanban** (`TasksKanban.tsx`) — per-card priority `DropdownMenu` (not a list filter).
  - **VersionsTab** (`VersionsTab.tsx`) — Upload-version dialog has an asset/shot target `Select`; no filter/sort on the version list itself.
  - **DailiesTab** (`DailiesTab.tsx`) — None found (theater/lightbox navigation only).
  - **DashboardTab** (`DashboardTab.tsx`) — None found (stat tiles + activity feed only).
- **Data source:** Mixed. Project record itself: real backend (`useProject()` → `GET /projects/:id`). All 5 tabs' actual content: frontend-mock — `useShotStore`, `useAssetStore`, `useReviewStore`, and (DashboardTab only) the broken `useAudit()` hook (see Errors Found). TasksTab's sub-views fall back to `useTasksStore` (mock) because `KanbanView`/list/timeline are invoked without a `tasks` prop inside this tab (contrast with `pages/tasks.tsx`, which passes real API data explicitly — see Backend/Data-Model Notes).

## Assets (`src/pages/assets.tsx`, route `/assets`)
- **Purpose:** Studio-wide asset browser (grid/list) with creation dialog.
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search on name/id.
  - `typeFilter` (`Select`) — Character/Environment/Prop/Rig/Effects/Vehicle/Texture/Material/Audio / All.
  - `statusFilter` (`Select`) — complete/in-progress/bottleneck/at-risk/review/not-started / All.
  - `projectFilter` (`Select`) — by project / All.
  - `mineOnly` — URL-param-driven (`?mine=1`) scoping to the current user's assignments, surfaced as a "Clear filter" chip rather than a control.
  - `view` toggle — Grid vs. List.
- **Data source:** Frontend-mock — `useAssetStore` (zustand). (Not wired to the `useAssets()` hook, which is unused dead code — see Errors Found.)

## AssetDetail (`src/pages/asset-detail.tsx`, route `/assets/:id`)
- **Purpose:** Single-asset detail view — pipeline/version history, dependency tracking, USD publish status.
- **Existing dropdowns/filters/sort controls:** None found in this file (tabs for Overview/Versions/Tasks/Activity are navigation, not filters).
- **Data source:** Frontend-mock — `useReviewStore`, `useAssetActivityStore`, `useAssetStore`, plus static `PROJECTS`/`USERS`/`TASKS`/`SHOTS`/`AUDIT_EVENTS` from `data/mockData.ts`.

## Shots (`src/pages/shots.tsx`, route `/shots`)
- **Purpose:** Studio-wide shot browser, grouped by sequence (grid) or flat (list).
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search on shot name.
  - `statusFilter` (`Select`) — todo/in_progress/review/approved/omitted / All.
  - `projectFilter` (`Select`) — by project / All.
  - `mineOnly` — URL-param-driven (`?mine=1`), same pattern as Assets.
  - `view` toggle — Grid (grouped by sequence) vs. List.
- **Data source:** Real backend call attempted, but broken — `useShots()` (`hooks/useShots.ts`) → `GET /shots`, which 404s (no such route exists server-side). See Errors Found — page always renders empty regardless of filters.

## ShotDetail (`src/pages/shot-detail.tsx`, route `/shots/:id`)
- **Purpose:** Single-shot detail — related tasks, version history, used assets, audit trail.
- **Existing dropdowns/filters/sort controls:** None found in this file (tab navigation only).
- **Data source:** Frontend-mock — `useShotStore`, `useReviewStore`, plus static `PROJECTS`/`USERS`/`TASKS`/`ASSETS`/`AUDIT_EVENTS` from `data/mockData.ts`.

## Tasks (`src/pages/tasks.tsx`, route `/tasks`)
- **Purpose:** Studio-wide task list/kanban with role-aware defaults (artists default to Kanban + "my tasks only"; leads default to "Needs My Review").
- **Existing dropdowns/filters/sort controls:**
  - Status pill row (`all/todo/in_progress/review/done`) — click-to-filter with live counts (not a `Select`, but a functioning status filter).
  - `search` — text search on task title.
  - `projectFilter` (`Select`) — by project / All Projects.
  - `departmentFilter` (`Select`) — by department / All Depts.
  - `myTasksOnly` toggle button; `needsReviewOnly` toggle button (leads/supervisors only).
  - `view` toggle — List vs. Kanban.
- **Data source:** Mixed — the task list itself is real backend (`useTasks()`/`useUpdateTask()` → `GET/PUT /tasks`), but the `projectFilter`/`departmentFilter` dropdown option lists are still populated from static mock `PROJECTS`/`DEPARTMENTS` (`data/mockData.ts`), not the real `/projects`/`/departments` endpoints (code comments at `tasks.tsx:61-63` acknowledge this: "Could be replaced with useUsers()/useProjects()/useDepartments() later").

## Departments (`src/pages/departments.tsx`, route `/departments`)
- **Purpose:** Pipeline-flow visualization (draggable department chips) + department grid grouped by pipeline stage (PROD/3D/VFX/2D).
- **Existing dropdowns/filters/sort controls:** None found as `Select`/`DropdownMenu` — the "Customize Here" pipeline-reorder mode (left/right arrow buttons per chip) is a reorder control, not a filter.
- **Data source:** Real backend — `useDepartments()` (`hooks/useDepartments.ts`) → `GET /departments`. (Team-member counts/task stats per department still come from mock `USERS`/`TASKS`.) **Note:** see Errors Found — this page's real ids break the mock-backed Department Detail page.

## DepartmentDetail (`src/pages/department-detail.tsx`, route `/departments/:id`)
- **Purpose:** Single-department detail — team roster, task board, capacity.
- **Existing dropdowns/filters/sort controls:** Task-management `DropdownMenu`s (reassign task, change status) inside the Overview tab — not list filter/sort controls.
- **Data source:** Frontend-mock — static `DEPARTMENTS`/`USERS`/`TASKS` from `data/mockData.ts`, via `useTasksStore` for mutations. **Broken against the real Departments list** — see Errors Found.

## People (`src/pages/people.tsx`, route `/people`)
- **Purpose:** Studio personnel directory with RBAC-scoped visibility (artists see only their department; clients see only studio leadership contacts).
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search on name/title.
  - `deptFilter` (`Select`) — by department / All Departments.
- **Data source:** Frontend-mock — static `USERS`/`DEPARTMENTS` from `data/mockData.ts`. (Not wired to the real `useUsers()`/`useDepartments()` hooks, even though both back real endpoints — see Backend/Data-Model Notes.)

## Profile (`src/pages/profile.tsx`, routes `/people/:id` and `/profile`)
- **Purpose:** Single-person profile — role/department info, assigned tasks, active projects. Used both for viewing another person (`/people/:id`) and viewing one's own profile (`/profile`, no `:id`).
- **Existing dropdowns/filters/sort controls:** None found in this file (tab navigation for Overview/Tasks/Activity only).
- **Data source:** Frontend-mock — static `USERS`/`TASKS`/`PROJECTS`/`DEPARTMENTS` from `data/mockData.ts`.

## DailyStandup (`src/pages/daily-standup.tsx`, route `/daily-standup`)
- **Purpose:** Daily standup hub — post/read team status updates, a drag-reorderable dailies/playblast playlist, and the Mobile Status Broadcast feed/composer.
- **Existing dropdowns/filters/sort controls:** None found as `Select`/`DropdownMenu` — playlist reordering is drag-and-drop (`@dnd-kit`), not a sort control.
- **Data source:** Mixed — standup posts are real backend (`useStandupUpdates()`/`usePostStandupUpdate()` → `GET/POST /standups`); broadcasts are frontend-mock (`useBroadcastsStore`); playlist/task data via `useTasksStore` (mock) and static `USERS`/`DEPARTMENTS`/`PROJECTS`.

## Review (`src/pages/review.tsx`, route `/review`)
- **Purpose:** Internal frame-accurate review/annotation player with a pending-review queue, version A/B compare mode, and presentation-mode broadcasting.
- **Existing dropdowns/filters/sort controls:**
  - Compare-mode version-A / version-B `Select`s (choose which two versions to diff) — not a list filter, a compare-target picker.
  - An annotation-text-style `Select` (Sans-serif/Serif/Monospace) inside the annotation toolbar — a tool option, not a data filter.
  - No search/status/sort control was found for the review queue list itself.
- **Data source:** Frontend-mock — `useTasksStore`, `useReviewStore`, `useNotificationStore`, plus static `USERS`/`SHOTS` from `data/mockData.ts`.

## Scheduling (`src/pages/scheduling/index.tsx`, route `/scheduling`)
- **Purpose:** Resourcing hub with 3 sub-views: Team Board (drag-to-assign), Team Calendar (drag-to-reschedule), Capacity Forecast; includes a bottleneck auto-resolve action and a CSV import dialog.
- **Existing dropdowns/filters/sort controls:**
  - View switcher (Board / Calendar / Forecast) — not a filter.
  - **TeamBoard** (`TeamBoard.tsx`) — `departmentFilter` (`Select`, by department / All), `projectFilter` (`Select`, by project / All).
  - **TeamCalendar** (`TeamCalendar.tsx`) — `projectFilter` (`Select`, by project / All).
  - **CapacityForecast** (`CapacityForecast.tsx`) — `pipelineFilter` (`Select`, by pipeline / All Pipelines).
  - CSV-import dialog has 4 column-mapping `Select`s (not data filters).
- **Data source:** Frontend-mock — `useTasksStore`, plus static `DEPARTMENTS`/`PROJECTS`/`USERS` from `data/mockData.ts`.

## Marketplace (`src/pages/marketplace.tsx`, route `/marketplace`)
- **Purpose:** Plugin/integration marketplace — browse, install/enable, uninstall.
- **Existing dropdowns/filters/sort controls:**
  - `activeCategory` — pill-button category filter (All/Pipeline/Render/Integration/Monitoring/Annotation), not a `Select` dropdown but a functioning filter.
  - `search` — text search on plugin name.
- **Data source:** Frontend-mock — static `PLUGINS` from `data/mockData.ts`; install/enable state via `usePluginsStore` (zustand).

## PluginDetail (`src/pages/plugin-detail.tsx`, route `/marketplace/:id`)
- **Purpose:** Single-plugin detail — description, permissions, install/enable toggle.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Frontend-mock — static `PLUGINS` from `data/mockData.ts`; state via `usePluginsStore`.

## IntegrationsHub (`src/pages/integrations.tsx`, route `/integrations`)
- **Purpose:** DCC/pipeline-tool integrations dashboard (Maya, Blender, Nuke, etc.) — connect/configure/sync status.
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search on integration name (no category/status dropdown found).
- **Data source:** Frontend-mock — a hardcoded `INTEGRATIONS` array declared directly in the page file (not a store or `data/mockData.ts`), plus `useIntegrationsStore` for connection toggles.

## Workflows (`src/pages/workflows.tsx`, route `/workflows`)
- **Purpose:** List of saved pipeline workflow graphs, with entry points to create/edit/run one.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Frontend-mock — `useWorkflowsStore` (graph data), falling back to static `WORKFLOWS` (`data/mockData.ts`) for node counts when no graph has been saved yet.

## WorkflowEditor (`src/pages/workflow-editor.tsx`, routes `/workflows/new` and `/workflows/:id`)
- **Purpose:** Node-graph pipeline editor (built on `@xyflow/react`) for designing/editing a workflow.
- **Existing dropdowns/filters/sort controls:** None found in this file (node palette and node-config dialogs are graph-editing tools, not list filters).
- **Data source:** Frontend-mock — `useWorkflowsStore`.

## WorkflowRun (`src/pages/workflow-run.tsx`, route `/workflows/run/:id`)
- **Purpose:** Visualizes a single workflow run's step-by-step execution state.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Frontend-mock — `useWorkflowsStore`, static `WORKFLOWS`.

## SchemaBuilder (`src/pages/schema-builder/index.tsx`, route `/schema-builder`)
- **Purpose:** No-code custom entity-type and task-template-bundle designer, with a live preview.
- **Existing dropdowns/filters/sort controls:**
  - Tab switcher (Entities / Templates) — not a filter.
  - **EntitySchemasTab** / **TaskTemplatesTab** — per-row `DropdownMenu`s (edit/duplicate/delete a field or template), not list filter/sort controls. `FieldTypePicker.tsx` is a field-type chooser for a new field, not a data filter.
- **Data source:** Frontend-mock — `useSchemaStore` (`store/schema.ts`, inferred from directory structure; page holds all schema/template state client-side).

## Publishing (`src/pages/publishing.tsx`, route `/publishing`)
- **Purpose:** Asset/shot publish queue and publish-history log, with a "New Publish" simulation dialog.
- **Existing dropdowns/filters/sort controls:** None found — `Filter` and `Search` icons are imported but not wired to any actual filter/search state or control in this file (the only `Input`s found are the New-Publish dialog's asset-id/notes fields).
- **Data source:** Frontend-mock — `usePublishingStore`, static `ASSETS`/`USERS`/`PROJECTS` from `data/mockData.ts`.

## Analytics (`src/pages/analytics.tsx`, route `/analytics`)
- **Purpose:** Studio-wide analytics — burn/velocity charts, bid-vs-actual margins, department performance, all leadership-gated.
- **Existing dropdowns/filters/sort controls:**
  - `dateRange` (`Select`) — 7d / 30d / 90d, anchored to a fixed mock "today" (`MOCK_TODAY = 2024-10-15`).
  - Tab switcher across analytics sub-views — not a filter.
- **Data source:** Frontend-mock — static `PROJECTS`/`TASKS`/`REVIEWS`/`PUBLISH_LOGS`/`DEPARTMENTS`/`USERS`/`TIME_LOGS`/`SHOTS` from `data/mockData.ts`; dollar/margin figures are deterministic pseudo-random functions of each project's mock fields (`lib/seededMock.ts`), not real financial data.

## ProductionDashboard (`src/pages/production.tsx`, route `/production`)
- **Purpose:** Cross-project shot-status board for producers/managers — global stats plus a filterable shot grid.
- **Existing dropdowns/filters/sort controls:**
  - `filter` state (`"all" | "review" | "at-risk"`) — rendered as clickable stat tiles, not a `Select`, but a functioning shot-status filter.
  - Per-shot `DropdownMenu` (reassign/status actions) — not a list filter.
- **Data source:** Frontend-mock — `useShotStore`, static `DEPARTMENTS`/`PROJECTS`/`TASKS`/`USERS` from `data/mockData.ts`.

## FinancialDashboard (`src/pages/financials.tsx`, route `/financials`)
- **Purpose:** Studio-wide budget/spend dashboard — per-project spend, burn rate, over-budget flags, leadership-gated.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** Frontend-mock — static `PROJECTS`/`DEPARTMENTS` from `data/mockData.ts`, `useTasksStore`; dollar figures are a deterministic pseudo-random function of each project's mock `budget`/`progress`/`riskScore` fields (`lib/seededMock.ts`, shared with `analytics.tsx`), not real financial data.

## Audit (`src/pages/audit.tsx`, route `/audit`)
- **Purpose:** Entity-level audit log / rollback UI — view change history for an entity and roll back to a prior snapshot.
- **Existing dropdowns/filters/sort controls:**
  - `selectedEntity` — implicit selector (via clickable entity rows), not a `Select` dropdown.
  - No status/date/actor filter or sort control found.
- **Data source:** Frontend-mock — `useAuditStore` (`store/audit.ts`, a persisted zustand store with hand-authored `AUDIT_EVENTS`/rollback snapshots). Not wired to the real `useAudit()` hook or the real `auditLogsTable` (which exists in the schema but has no mounted API route — see Errors Found).

## Settings (`src/pages/settings.tsx`, route `/settings`)
- **Purpose:** Studio configuration hub — org/branding, RBAC role/capability matrix, API keys, notification preferences, leadership-gated.
- **Existing dropdowns/filters/sort controls:** None found bound to a live filter/sort state (the imported `Select` components are used inside the "invite user" dialog's role picker, a form field, not a list filter).
- **Data source:** Frontend-mock — static `ROLE_LABELS`/`USERS` from `data/mockData.ts`, plus RBAC capability metadata from `store/permissions.ts`.

## Deliveries (`src/pages/deliveries.tsx`, route `/delivery`)
- **Purpose:** Internal management view for client delivery links — create, revoke, resend, view access history, leadership-gated.
- **Existing dropdowns/filters/sort controls:** None found for the delivery list itself — the one `Select` present (line 253) is the "New Delivery" creation dialog's project picker, a form field, not a list filter.
- **Data source:** Frontend-mock — `useDeliveryStore`, `useProjectStore`, `useShotStore`.

## Chat (`src/pages/chat.tsx`, route `/chat`)
- **Purpose:** Department/studio-wide group chat with an "Everyone" synthetic channel.
- **Existing dropdowns/filters/sort controls:** None found in this file (channel list is a fixed sidebar, not filterable/sortable).
- **Data source:** Frontend-mock — `useChatGroupsStore`, `useChatMessagesStore`, static `DEPARTMENTS`/`USERS` from `data/mockData.ts`.

## TrackingGrid (`src/pages/tracking.tsx`, route `/tracking`)
- **Purpose:** ShotGrid-style configurable tracking spreadsheet/grid over shots+tasks, with saved views.
- **Existing dropdowns/filters/sort controls:**
  - `search` — text search.
  - `projectFilter` (`Select`) — by project / All Projects.
  - `groupBy1` (`Select`) — primary grouping key (via `TrackingGroupKey`, e.g. status/assignee/department/project/none).
  - `groupBy2` (`Select`, "Then by") — secondary grouping key; dynamically excludes whatever `groupBy1` is currently set to.
  - `sortBy` (via `TrackingSortKey`) — column sort control (`ArrowUpDown` icon-driven).
  - View toggle (table/grid-style, icons `TableProperties`/`List`/`LayoutGrid`).
  - Saved Views — save/load/delete a named filter+group+sort combination (`Bookmark`/`BookmarkPlus`/`Trash2`), backed by `useTrackingViewsStore`.
- **Data source:** Frontend-mock — `useShotStore`, `useTasksStore`, static `PROJECTS`/`EPISODES`/`SEQUENCES`/`USERS`/`DEPARTMENTS` from `data/mockData.ts`; saved views persisted client-side only (`useTrackingViewsStore`, zustand), not server-side.

## Timesheets (`src/pages/timesheets.tsx`, route `/timesheets`)
- **Purpose:** Weekly personal timesheet — log/edit/delete hours against tasks, week navigation.
- **Existing dropdowns/filters/sort controls:**
  - A task `Select` inside the "add time entry" form (choosing which task to log against) — a form field, not a list filter/sort.
  - No status/project filter or sort control found for the week's log list.
- **Data source:** Frontend-mock — `useTimesheetLogs()` (`store/timesheets.ts`), derived from `useTasksStore`'s `dailyLogs` (the same mock Task model used by `TaskDrawer`), plus static `PROJECTS`/`USERS`/`DEPARTMENTS`.

## Notifications (`src/pages/notifications.tsx`, route `/notifications`)
- **Purpose:** Notification inbox — list, mark-read, mark-all-read, deep-link to the source entity.
- **Existing dropdowns/filters/sort controls:** None found in this file (category muting happens in Settings' notification-preferences panel, not here).
- **Data source:** Frontend-mock — `useNotificationStore`.

## AdminPanel (`src/pages/admin.tsx`, route `/admin`)
- **Purpose:** User administration — create users, view/reassign department + role, pipeline department counts. Independently re-checks the `manage_members` capability and self-redirects non-admins even though it's already `LeadershipGuard`-wrapped.
- **Existing dropdowns/filters/sort controls:** None found for the user table itself (no search/status/department filter) — the `Select` controls present are the "Create User" dialog's Department and Role pickers, form fields not list filters.
- **Data source:** Real backend — `useUsers()`, `useDepartments()`, `useRoles()` (`GET /users`, `/departments`, `/roles`) and direct `apiFetch` calls for create/reassign actions. This page is fully backend-real, unlike almost every other page in the app.

## NotFound (`src/pages/not-found.tsx`, catch-all route, no path)
- **Purpose:** Generic 404 fallback for any unmatched path inside the authenticated `AppShell` switch.
- **Existing dropdowns/filters/sort controls:** None found in this file.
- **Data source:** N/A — static content only.

---

## Backend/Data-Model Notes

**Correcting `forge-final.md` §6:** that document states only `/auth`, `/projects`, `/tasks`, `/users` are real, tenant-scoped, DB-backed API endpoints. As of the current `main` snapshot in this worktree, that list is **stale/out of date** — `artifacts/api-server/src/routes/index.ts` now also mounts `/departments`, `/roles`, and `/standups`, each backed by a real Drizzle table (`departmentsTable`, `tenantRolesTable`, `standupUpdatesTable`) and real Express handlers that query Postgres (`routes/departments.ts`, `routes/roles.ts`, `routes/standups.ts` — all read/write via `db.select()`/`db.insert()`, none are stubs). **Current real surface: 7 resource groups (`/auth/*`, `/projects`, `/tasks`, `/users`, `/departments`, `/roles`, `/standups`), not 4.** This reflects the RBAC/Admin-Panel hardening work referenced in the spec's inputs section.

**Schema is ahead of the API for 3 resources.** `lib/db/src/schema/production.ts` and `core.ts` already define `assetsTable`, `shotsTable`, `versionsTable`, and `auditLogsTable` — but no `routes/assets.ts`, `routes/shots.ts`, `routes/versions.ts`, or `routes/audit.ts` exist server-side, and none of those four are mounted in `routes/index.ts`. Two frontend hooks (`useShots`, `useAudit`) already assume these routes exist and are actively wired into pages, causing the runtime breakage documented in Errors Found; three more (`useAssets`, `useVersions`, `useNotes` — the last has no backing schema table at all) are written but unused.

**Two disconnected Task data models coexist.** `hooks/useTasks.ts` is real and DB-backed (`tasksTable`, `GET/PUT /tasks`) and is used by `pages/tasks.tsx`'s top-level task list/kanban (tasks are explicitly passed down as a prop there). Everywhere else that touches tasks — `pages/scheduling/*`, `pages/timesheets.tsx`, `pages/home.tsx`'s Supervisor/Artist dashboards, `pages/department-detail.tsx`, and `pages/project-detail/TasksTab.tsx`'s Kanban/List/Timeline sub-views (which call `KanbanView`/etc. *without* a `tasks` prop, so they fall back internally) — reads from `store/tasks.ts`, a separate zustand store seeded from the static, hand-authored `data/mockData.ts` `TASKS` array. These are two disjoint id-spaces with no bridge: a task created via the real `/tasks` page's "Assign Task" flow is invisible in Scheduling/Timesheets/dashboards, and vice versa.

**Per-page data-source summary** (see each page's own "Data source" line above for detail):

| Real backend (DB-backed) | Frontend-mock only |
|---|---|
| Projects, ProjectDetail (project record only), Tasks (top-level list only), Departments, DailyStandup (standup posts only), AdminPanel | Login (auth is real; the portal UI itself has no data), ClientReview, DeliveryDetail, Home, ProjectDetail (all 5 tab bodies), Assets, AssetDetail, ShotDetail, DepartmentDetail, People, Profile, Review, Scheduling, Marketplace, PluginDetail, IntegrationsHub, Workflows, WorkflowEditor, WorkflowRun, SchemaBuilder, Publishing, Analytics, ProductionDashboard, FinancialDashboard, Audit, Settings, Deliveries, Chat, TrackingGrid, Timesheets, Notifications |
| Broken/attempted-real (404s) | Shots (via `useShots`), ProjectDetail's DashboardTab activity panel (via `useAudit`) |

**Route coverage check:** 40 `<Route>` entries found in `App.tsx` (39 path-based routes + 1 catch-all `NotFound`), resolving to 38 distinct page components — 38 pages inventoried, 0 missing/broken imports (see Errors Found). The gap between 40 and 38 is not a missing file: two components are legitimately reused across two routes each — `Profile` (`/people/:id` and `/profile`) and `WorkflowEditor` (`/workflows/new` and `/workflows/:id`) — both documented as single sections above, each listing both of its routes. **40 routes = 38 distinct page components + 2 duplicate route→component mappings + 0 missing.**
