# ShotGrid ↔ Forge Gap Matrix

**Inputs:** `shotgrid-catalog.md` (Task A5, 19 distinct ShotGrid pages in its Page Index) and `forge-inventory.md` (Task B, 38 Forge page sections) — both already committed and independently reviewed. This document only cross-references them; it does not re-derive any claim from source code. Per the parent audit's guidance, `forge-inventory.md`'s per-page "Data source" lines and its "Errors Found" / "Backend/Data-Model Notes" sections are treated as verified ground truth here, not re-checked.

**On `forge-final.md` §6:** `forge-inventory.md`'s own "Backend/Data-Model Notes" section states that §6's specific claim ("only `/auth/*`, `/projects`, `/tasks`, `/users` are real") is stale — `/departments` and `/roles` are also real, DB-backed endpoints as of this worktree's snapshot. §6's broader architectural statement — "most of the app still runs on frontend mock data… this is intentional/staged," explicitly naming assets, shots, versions, notes, reviews, scheduling, timesheets, and chat as staged-mock domains — is not contradicted and is treated as current. Per the task brief, the `Deferred (known, by design)` status below is used only where §6 explicitly names the specific gap as intentional; it is not used as a blanket label for every mock-backed page, since most rows below have additional, non-backend-related UI/control gaps that are real gaps regardless of data source.

**Page-matching approach:** each of the 19 ShotGrid catalog pages was matched to the Forge page whose purpose is the closest equivalent (may differ in name/scope — e.g. ShotGrid's per-project "Schedule" ≈ Forge's global `scheduling/index.tsx` resourcing hub). Several catalog pages are the same underlying ShotGrid screen captured in a different demo project/theme/admin-surface (per the catalog's own merge notes); each still gets its own row below since the catalog kept them as separate sections.

**Status heuristic (applied uniformly across both tables below):** Present/Yes is used only when the Forge equivalent matches closely — the central function and control set are comparable, with no material core-workflow gap. Partial is used whenever Forge offers *some* functional substitute for the ShotGrid item, even if that substitute uses a different UI pattern, is scoped differently, or is less complete than ShotGrid's — this includes discrete `Select` filters standing in for a unified `Filter` panel, and a whole page whose full catalog control set (search/sort/filter/etc., and, where applicable, an embedded Gantt chart) is entirely absent per forge-inventory, even when the page's broad conceptual purpose is otherwise matched. Missing/No is used only when no functional substitute exists at all — neither the control nor anything serving its purpose is documented on the matched Forge page (or no Forge page exists to match).

---

## Feature Parity Matrix

**Summary:** 19 ShotGrid pages compared — Present: 4, Partial: 11, Missing: 3, Deferred (known, by design): 1.

| ShotGrid Page/Feature | Forge Equivalent | Status | Notes |
|---|---|---|---|
| Projects | `projects.tsx` | Present | Real backend (`useProjects()` → `GET /projects`). Core browse/list function matches (search, `statusFilter`, `typeFilter`, List/Card `view` toggle) — no `Sort`/`Group`/`Fields`/`More` toolbar or dedicated `Filter` panel (toolbar-level gaps, not central to the page). |
| Schedule | `scheduling/index.tsx` | Partial | Frontend-mock. ShotGrid's Schedule page is defined by a per-project task-list + Gantt-chart timeline; Forge has no Gantt chart anywhere and instead offers a separate global resourcing hub (Team Board / Team Calendar / Capacity Forecast) with `departmentFilter`/`projectFilter`/`pipelineFilter` selects per sub-view. Structurally different, not just missing toolbar buttons. |
| Inbox | `notifications.tsx` | Partial | Frontend-mock (`useNotificationStore`). Core purpose (list, mark-read, mark-all-read, deep-link to source entity) matches; per forge-inventory, the page has no dropdowns/filters/search at all, so ShotGrid's `All Types` filter and `Search Inbox…` box have no counterpart. |
| My Tasks | `tasks.tsx` | Present | Real backend for the task list (`useTasks()`/`useUpdateTask()`). Core function (assigned-task list, search, project/department filters, my-tasks/needs-review toggles, List/Kanban view) matches and is arguably richer in places (Kanban, role-aware defaults). No explicit `Sort` control, and no "Create Versions" modal/flow anywhere on this page. |
| Assets | `assets.tsx` | Present | Frontend-mock (`useAssetStore`; the real `useAssets()` hook exists but is unused dead code per forge-inventory Errors Found). Core browse/search/filter/create function matches (search, `typeFilter`, `statusFilter`, `projectFilter`, `mineOnly`, Grid/List view). No `Sort`/`More`/dedicated `Filter` panel. |
| Sequences | — (no Forge page) | Missing | No page in the 38-page Forge inventory serves a standalone Sequences entity (list, detail, sub-tabs for Shots/Tasks/Assets/Notes). `shots.tsx`'s grid view groups shots by sequence name as a display mode, but there is no Sequence entity page, detail view, or per-sequence task rollup. |
| Shot Detail | `shot-detail.tsx` | Partial | Frontend-mock (`useShotStore`, `useReviewStore`, static mock data). Core structure (shot info + Tasks/Versions/Assets-style tabs) matches ShotGrid's Tasks/Versions/Assets sub-tab bar. Per forge-inventory, the page has zero dropdown/filter/sort controls, so ShotGrid's embedded task list's `Sort`/`Group`/`Fields`/`More`/`Gantt Display`/`Search Tasks…`/`Filter` have no counterpart, and there is no embedded Gantt chart. |
| Review | `review.tsx` | Partial | Frontend-mock (`useTasksStore`, `useReviewStore`, `useNotificationStore`). The player/annotation/compare-mode functionality is present and arguably richer than ShotGrid's static Version Player screen, but forge-inventory explicitly notes "no search/status/sort control was found for the review queue list itself" — a central browsing workflow for ShotGrid's playlist + Versions-grid page, not a decorative toolbar gap. |
| Version Player (Media Review Lightbox) | `review.tsx` | Deferred (known, by design) | The catalog page itself lists no dropdown/filter controls to compare, and `review.tsx` is a genuinely comparable frame-accurate review/annotation/notes player. The substantive remaining gap — real backend persistence for reviews/notes/annotations, vs. Forge's frontend-mock `useReviewStore` — is explicitly named as intentional/staged scope in `forge-final.md` §6 ("reviews" and "notes" both listed). |
| Assets (Demo: Animation project — classic dark theme) | `assets.tsx` | Partial | Same base page as "Assets" above, but this batch's screenshots showcase real, substantial ShotGrid features absent from Forge entirely: an advanced faceted Filter side-panel (Type/Status/Shots checkboxes with counts), a "Save Page As" / "My Filters" saved-filter system, and a "Project Pages" nav flyout with Favorites/Recently Viewed. None of these exist on `assets.tsx`. |
| Shots (Demo: Animation project — classic dark theme) | `shots.tsx` | Partial | Frontend-mock UI (search, `statusFilter`, `projectFilter`, `mineOnly`, Grid/List view) partially mirrors ShotGrid's shot-list controls, and the "Project Pages" flyout has no counterpart — but critically, per forge-inventory's Errors Found, `shots.tsx` calls `GET /shots`, which 404s (no such backend route is mounted); the page always renders "No shots found" regardless of any filter state. This is documented as an active bug, not an intentional deferral. |
| Schedule (Demo: Animation project — classic dark theme) | `scheduling/index.tsx` | Partial | Same base gap as "Schedule" above (no Gantt chart; different global resourcing-hub structure instead of a per-project Schedule tab). |
| Assets (Drednots project — Fields & Pipeline admin) | `assets.tsx` (base list) / `schema-builder/index.tsx` (field-admin concept) | Partial | Base Assets list maps to `assets.tsx` (see "Assets" row). This capture's defining features — the `Fields` column-chooser menu (Configure Columns…, Manage Asset Fields…, Pipeline/Linked Pipelines submenus), the New Field wizard (Default/Summary/Sort-by/visibility-scope), and the Add Statuses modal — have no equivalent reachable from `assets.tsx`. `schema-builder/index.tsx` offers a general, disconnected no-code entity/field/task-template designer elsewhere in the app (not integrated into the Assets page flow), which is the closest — but structurally different — Forge concept. |
| Shots (Signal project — Pipeline Step admin) | `shots.tsx` (base list) / `schema-builder/index.tsx` (weak conceptual cousin) | Partial | Base shot list maps to `shots.tsx` (same bug/gap profile as "Shots (Demo…)" above). This capture's defining admin features — Manage Shot Pipeline Steps modal, Add Pipeline Step wizard, "Project Actions" flyout (Tracking Settings/Navigation config, Save as Template), and the account/admin avatar menu's Admin nav list — have no documented equivalent reachable from `shots.tsx`. |
| Pipeline Steps (Admin) | — (no Forge page) | Missing | No Forge page manages an ordered, colored, per-entity-type (Asset/Shot/Level) pipeline-step list with department mapping. `schema-builder/index.tsx`'s Entities/Templates concept is a different data model (custom field schema and task-template bundles), not step ordering/coloring/short-codes — not a reasonable match even as a partial equivalent. |
| Tracking Settings (Signal project — Shot entity admin) | `schema-builder/index.tsx` | Partial | `schema-builder/index.tsx` is a real, broadly-related no-code entity/field/task-template designer, but forge-inventory does not document any equivalent to Tracking Settings' specific Hierarchy dropdown, Default Task Template dropdown, or its Properties/Fields/Steps/Statuses per-entity tab structure — only generic per-row `DropdownMenu`s on its Entities/Templates tabs. |
| Overview (Drednots project) | `project-detail/DashboardTab.tsx` | Partial | Frontend-mock dashboard tab exists (stat tiles + activity feed) and is the right conceptual match, but per forge-inventory it has zero dropdown/filter controls and a far smaller widget set than ShotGrid's Overview (no Sequences data-table widget, Shot-Status pie chart, Asset-Status bar chart, "% Final by Department" chart, Project Crew list, or Latest Versions grid). Its "Recent Activity" panel is additionally documented in Errors Found as actively broken — `useAudit()` calls `GET /audit`, which 404s, so the panel always renders empty; this is a real bug, not an intentional §6 deferral. |
| Action Menu Items (Admin) | — (no Forge page) | Missing | No admin page anywhere in the 38-page Forge inventory manages custom right-click/toolbar/"Add Entity"-menu actions (ShotGrid's Action Menu Items concept). No conceptual cousin was found. |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | `projects.tsx` | Present | Same base page/status as "Projects" above (core browse/filter function present, `Sort`/`Group`/`Fields`/`More` toolbar missing). This capture additionally shows an account/admin avatar flyout (Autodesk Identity, Account Settings, Help, Internal Resources, Admin nav) and an "Artist View" banner — neither documented as present on `projects.tsx` in forge-inventory. |

---

## Dropdown/Filter Parity

**Summary:** 18 of the 19 ShotGrid catalog pages have at least one dropdown/filter/sort control (Version Player (Media Review Lightbox) has none listed in the catalog — "None visible on this screen" — and is excluded from this table). 125 controls compared across those 18 pages — Yes: 5, Partial: 10, No: 110.

| ShotGrid Page | ShotGrid Control | Forge Page | Forge Has It? | Notes |
|---|---|---|---|---|
| Projects | Sort | `projects.tsx` | No | not documented |
| Projects | Group | `projects.tsx` | No | not documented |
| Projects | Fields | `projects.tsx` | No | not documented |
| Projects | More | `projects.tsx` | No | not documented |
| Projects | Filter | `projects.tsx` | Partial | no dedicated Filter panel; equivalent filtering via `statusFilter` + `typeFilter` + `search` |
| Schedule | Sort | `scheduling/index.tsx` | No | not documented |
| Schedule | Group | `scheduling/index.tsx` | No | not documented |
| Schedule | Fields | `scheduling/index.tsx` | No | not documented |
| Schedule | More | `scheduling/index.tsx` | No | not documented |
| Schedule | Gantt Display | `scheduling/index.tsx` | No | Forge has no Gantt chart anywhere in this app per forge-inventory |
| Schedule | Search Tasks… | `scheduling/index.tsx` | No | not documented |
| Schedule | Filter | `scheduling/index.tsx` | Partial | no unified panel; `departmentFilter`/`projectFilter` (Team Board), `projectFilter` (Team Calendar), `pipelineFilter` (Capacity Forecast) exist per sub-view instead |
| Inbox | All Types | `notifications.tsx` | No | notifications.tsx has no dropdowns/filters/sort documented at all |
| Inbox | Search Inbox… | `notifications.tsx` | No | same as above |
| My Tasks | Sort | `tasks.tsx` | No | no explicit Sort control; status pill row used instead |
| My Tasks | Filter | `tasks.tsx` | Partial | no dedicated Filter toggle; status pill row + `projectFilter`/`departmentFilter`/`myTasksOnly`/`needsReviewOnly` serve a similar purpose but aren't the same control |
| My Tasks | Search My Tasks… | `tasks.tsx` | Yes | `search` text field on task title |
| My Tasks | Projects (nav mega-menu) | `tasks.tsx` | No | no Projects nav mega-menu documented on this page |
| My Tasks | Link (Create Versions modal field) | `tasks.tsx` | No | no Create-Versions dialog found on `tasks.tsx` |
| My Tasks | Task (Create Versions modal field) | `tasks.tsx` | No | same as above |
| My Tasks | Project (Create Versions modal field) | `tasks.tsx` | No | same as above |
| My Tasks | More fields (Create Versions modal) | `tasks.tsx` | No | same as above |
| Assets | Sort | `assets.tsx` | No | not documented |
| Assets | More | `assets.tsx` | No | not documented |
| Assets | Search Assets… | `assets.tsx` | Yes | `search` text field on name/id |
| Assets | Filter | `assets.tsx` | Partial | no dedicated panel; `typeFilter`/`statusFilter`/`projectFilter` selects instead |
| Sequences | Sort | — (no page) | No | no Forge equivalent page exists — see Feature Parity Matrix |
| Sequences | Group | — (no page) | No | same |
| Sequences | Fields | — (no page) | No | same |
| Sequences | More | — (no page) | No | same |
| Sequences | Search Sequences… | — (no page) | No | same |
| Sequences | Search Shots… (nested Shots sub-table) | — (no page) | No | same |
| Sequences | Filter | — (no page) | No | same |
| Shot Detail | Sort | `shot-detail.tsx` | No | shot-detail.tsx has no dropdown/filter/sort controls at all (tab navigation only) per forge-inventory |
| Shot Detail | Group | `shot-detail.tsx` | No | same |
| Shot Detail | Fields | `shot-detail.tsx` | No | same |
| Shot Detail | More | `shot-detail.tsx` | No | same |
| Shot Detail | Gantt Display | `shot-detail.tsx` | No | no Gantt chart on this page |
| Shot Detail | Search Tasks… | `shot-detail.tsx` | No | same |
| Shot Detail | Filter | `shot-detail.tsx` | No | same |
| Review | Sort | `review.tsx` | No | forge-inventory explicitly notes no search/status/sort control was found for the review queue list |
| Review | Group | `review.tsx` | No | same |
| Review | Fields | `review.tsx` | No | same |
| Review | More | `review.tsx` | No | same |
| Review | Search Playlists… | `review.tsx` | No | same |
| Review | Search Versions… | `review.tsx` | No | same |
| Review | Filter | `review.tsx` | No | same |
| Assets (Demo: Animation project — classic dark theme) | Sort | `assets.tsx` | No | not documented |
| Assets (Demo: Animation project — classic dark theme) | Group | `assets.tsx` | No | not documented |
| Assets (Demo: Animation project — classic dark theme) | Fields | `assets.tsx` | No | not documented |
| Assets (Demo: Animation project — classic dark theme) | More | `assets.tsx` | No | not documented |
| Assets (Demo: Animation project — classic dark theme) | Pipeline | `assets.tsx` | No | not documented |
| Assets (Demo: Animation project — classic dark theme) | Search Assets… | `assets.tsx` | Yes | `search` text field |
| Assets (Demo: Animation project — classic dark theme) | Filter (panel toggle) | `assets.tsx` | Partial | no dedicated panel; `typeFilter`/`statusFilter`/`projectFilter` selects instead |
| Assets (Demo: Animation project — classic dark theme) | Save in Project (Save Page As modal) | `assets.tsx` | No | no save-page/save-filter feature found |
| Assets (Demo: Animation project — classic dark theme) | Project Pages (nav dropdown) | `assets.tsx` | No | no saved-pages nav feature found; `tracking.tsx`'s separate "Saved Views" feature is on a different page and not reachable from Assets |
| Assets (Demo: Animation project — classic dark theme) | Filter facet: Type | `assets.tsx` | Partial | `typeFilter` Select exists but as a single dropdown, not a faceted checkbox panel with per-facet counts |
| Assets (Demo: Animation project — classic dark theme) | Filter facet: Status | `assets.tsx` | Partial | `statusFilter` Select exists but as a single dropdown, not a faceted checkbox panel with per-facet counts |
| Assets (Demo: Animation project — classic dark theme) | Filter facet: Shots | `assets.tsx` | No | no shot-code faceted filter found |
| Shots (Demo: Animation project — classic dark theme) | Sort | `shots.tsx` | No | not documented |
| Shots (Demo: Animation project — classic dark theme) | Group | `shots.tsx` | No | not documented |
| Shots (Demo: Animation project — classic dark theme) | Fields | `shots.tsx` | No | not documented |
| Shots (Demo: Animation project — classic dark theme) | More | `shots.tsx` | No | not documented |
| Shots (Demo: Animation project — classic dark theme) | Search Shots… | `shots.tsx` | Yes | `search` text field on shot name — but see note: `GET /shots` 404s per Errors Found, so the list this search would filter is always empty |
| Shots (Demo: Animation project — classic dark theme) | Filter | `shots.tsx` | Partial | `statusFilter`/`projectFilter`/`mineOnly` selects instead of a unified panel; same 404/always-empty caveat as above |
| Shots (Demo: Animation project — classic dark theme) | Project Pages | `shots.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | Sort | `scheduling/index.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | Group | `scheduling/index.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | Fields | `scheduling/index.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | More | `scheduling/index.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | Gantt Display | `scheduling/index.tsx` | No | no Gantt chart anywhere in Forge |
| Schedule (Demo: Animation project — classic dark theme) | Search Tasks… | `scheduling/index.tsx` | No | not documented |
| Schedule (Demo: Animation project — classic dark theme) | Filter | `scheduling/index.tsx` | Partial | `departmentFilter`/`projectFilter`/`pipelineFilter` selects per sub-view instead of a unified panel |
| Assets (Drednots project — Fields & Pipeline admin) | Fields (column-chooser: Configure Columns…, Manage Asset Fields…, Pipeline/Linked Pipelines submenus) | `assets.tsx` | No | assets.tsx has no Fields column-chooser; `schema-builder/index.tsx`'s `FieldTypePicker.tsx` is a field-type chooser for adding a new field but not reachable from the Assets page |
| Assets (Drednots project — Fields & Pipeline admin) | Sort | `assets.tsx` | No | not documented |
| Assets (Drednots project — Fields & Pipeline admin) | More | `assets.tsx` | No | not documented |
| Assets (Drednots project — Fields & Pipeline admin) | Pipeline | `assets.tsx` | No | not documented |
| Assets (Drednots project — Fields & Pipeline admin) | Search Assets… | `assets.tsx` | Yes | `search` text field |
| Assets (Drednots project — Fields & Pipeline admin) | Default (New Field default-value dropdown) | `assets.tsx` / `schema-builder/index.tsx` | No | no field-creation modal with this sub-control documented on either page |
| Assets (Drednots project — Fields & Pipeline admin) | Summary (New Field rollup dropdown) | `assets.tsx` / `schema-builder/index.tsx` | No | same |
| Assets (Drednots project — Fields & Pipeline admin) | Sort by (New Field sort-basis dropdown) | `assets.tsx` / `schema-builder/index.tsx` | No | same |
| Assets (Drednots project — Fields & Pipeline admin) | Visibility-scope radio group (New Field modal) | `assets.tsx` / `schema-builder/index.tsx` | No | same |
| Assets (Drednots project — Fields & Pipeline admin) | Project-search field (New Field modal) | `assets.tsx` / `schema-builder/index.tsx` | No | same |
| Assets (Drednots project — Fields & Pipeline admin) | Global Status List checkboxes (Add Statuses modal) | `assets.tsx` / `schema-builder/index.tsx` | No | same |
| Shots (Signal project — Pipeline Step admin) | Sort | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Group | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Fields | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | More | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Pipeline | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Filter | `shots.tsx` | Partial | `statusFilter`/`projectFilter`/`mineOnly` selects instead of a unified panel |
| Shots (Signal project — Pipeline Step admin) | Project Actions (flyout) | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Account/avatar user menu | `shots.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Entity Pipeline (label, in Add/Manage Pipeline Step modals) | `shots.tsx` / `schema-builder/index.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Visibility-scope radio group | `shots.tsx` / `schema-builder/index.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Project-search field | `shots.tsx` / `schema-builder/index.tsx` | No | not documented |
| Shots (Signal project — Pipeline Step admin) | Per-step visibility eye-icon toggles | `shots.tsx` / `schema-builder/index.tsx` | No | not documented |
| Pipeline Steps (Admin) | Sort | — (no page) | No | no Forge equivalent page exists — see Feature Parity Matrix |
| Pipeline Steps (Admin) | Group | — (no page) | No | same |
| Pipeline Steps (Admin) | Fields | — (no page) | No | same |
| Pipeline Steps (Admin) | More | — (no page) | No | same |
| Pipeline Steps (Admin) | Entity Pipeline field (Add Pipeline Step wizard) | — (no page) | No | same |
| Pipeline Steps (Admin) | Visibility-scope radio group | — (no page) | No | same |
| Pipeline Steps (Admin) | Project-search field | — (no page) | No | same |
| Tracking Settings (Signal project — Shot entity admin) | Hierarchy | `schema-builder/index.tsx` | No | not documented (Entities/Templates tabs only expose per-row `DropdownMenu`s) |
| Tracking Settings (Signal project — Shot entity admin) | Default Task Template | `schema-builder/index.tsx` | No | TaskTemplatesTab is a broadly related concept (task-template-bundle designer) but a per-entity "Default Task Template" dropdown is not documented |
| Tracking Settings (Signal project — Shot entity admin) | Per-step visibility eye-icon toggles | `schema-builder/index.tsx` | No | not documented |
| Tracking Settings (Signal project — Shot entity admin) | Entity Pipeline (label) | `schema-builder/index.tsx` | No | not documented |
| Overview (Drednots project) | Project Actions menu | `project-detail/DashboardTab.tsx` | No | DashboardTab has no dropdowns/filters documented (stat tiles + activity feed only) |
| Overview (Drednots project) | Account/avatar user menu | `project-detail/DashboardTab.tsx` | No | same |
| Overview (Drednots project) | Configure Menu Options dropdown (Action Menu Item modal) | `project-detail/DashboardTab.tsx` | No | same |
| Overview (Drednots project) | Restrict to Permission Groups (multi-select) | `project-detail/DashboardTab.tsx` | No | same |
| Action Menu Items (Admin) | Sort | — (no page) | No | no Forge equivalent page exists — see Feature Parity Matrix |
| Action Menu Items (Admin) | Group | — (no page) | No | same |
| Action Menu Items (Admin) | Fields | — (no page) | No | same |
| Action Menu Items (Admin) | More | — (no page) | No | same |
| Action Menu Items (Admin) | Search Action Menu Items… | — (no page) | No | same |
| Action Menu Items (Admin) | Filter | — (no page) | No | same |
| Action Menu Items (Admin) | Filter facet: Configure Menu Options | — (no page) | No | same |
| Action Menu Items (Admin) | My Action Menu Item Filters (add-filter control) | — (no page) | No | same |
| Action Menu Items (Admin) | More Filters (expandable section) | — (no page) | No | same |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | Sort | `projects.tsx` | No | not documented |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | Group | `projects.tsx` | No | not documented |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | Fields | `projects.tsx` | No | not documented |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | More | `projects.tsx` | No | not documented |
| Projects (ticket-sg-16540 test org — user menu / Artist View) | Account avatar menu (Autodesk Identity, Account Settings, New Features, Sign Out, Help, Internal Resources) | `projects.tsx` | No | not documented as present on `projects.tsx` |

---

**Coverage check:** 19 ShotGrid pages in catalog, 19 rows in Feature Parity Matrix.
