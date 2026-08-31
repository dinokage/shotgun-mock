# Full Backend Build-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Forge's remaining frontend-mock entities (episodes, sequences, shots, assets, tasks' nested structures, versions, reviews/annotations, daily logs) with real, tenant-scoped, Drizzle/Postgres-backed data and real API routes, and rewire every consuming page to fetch/mutate through react-query instead of local zustand mock stores.

**Architecture:** Extend the existing Drizzle schema (`lib/db/src/schema/`) with new tables following the exact conventions already in use (`tenantId` FK + cascade, `text("id").primaryKey()`), add one Express route file per resource under `artifacts/api-server/src/routes/` (all using the existing `tenantAuthMiddleware` tenant-scoping pattern from `routes/tasks.ts`), then replace each page's zustand store with a react-query hook (the `useUsers.ts`/`useStandups.ts` pattern already established this session).

**Tech Stack:** Express 5, Drizzle ORM, Postgres, `@tanstack/react-query`, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-full-backend-and-app-overhaul-design.md` (Section 2)

## Global Constraints

- Drizzle ORM only — no Prisma, no second ORM.
- Every schema change needs a real, committed migration generated via `drizzle-kit generate` (placeholder `DATABASE_URL` is fine — it only diffs schema, never connects). Migrations are generated ONCE, in Task 7, after all schema tasks (1-6) land — do not generate a migration per schema task.
- `pnpm run typecheck` (whole workspace, run from repo root) must pass after every task.
- No changes to `artifacts/mockup-sandbox`.
- Read-visibility RBAC filtering (who sees what) stays a **frontend** concern, matching the existing `tasks`/`projects`/`standups` routes — new routes tenant-scope only, they do not filter by role. Write-capability gating (`requireCapability`) is server-enforced only on routes that are already sensitive by existing precedent (user creation) — none of the new routes in this plan need it (creating/editing shots/assets/tasks/reviews is not privilege-sensitive the way creating a user is).
- This repo has no automated test suite yet (established precedent: the RBAC hardening plan and this session's standups work both used manual verification). Every task's "Verify" step is `pnpm run typecheck` plus a concrete curl or browser check — not a unit test suite. Do not introduce a test framework as part of this plan.
- All `docker run`/`pnpm` commands referencing the Windows host directly may hit a known Windows/esbuild binary-version mismatch. If so, run the command inside a throwaway Linux container instead: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/repo" -w /repo -e CI=true node:24-alpine sh -c "corepack enable && <command>"`. If that leaves `node_modules` populated with Linux-platform symlinks, delete all `node_modules` directories before any subsequent `docker-compose build` (a Windows Docker Desktop bug fails the build-context transfer on those symlinks otherwise) — this repo now has a `.dockerignore` excluding `node_modules`, but the context-transfer failure happens before ignore-filtering can apply on this host.
- Local dev Postgres: `docker-compose up -d` (bundled `db` service, `postgres://postgres:postgres@localhost:5432/forge` from the host, `db:5432` from inside another container). Migrations apply via `pnpm --filter "@workspace/db" run migrate` (or the Linux-container form above) with that `DATABASE_URL`.

---

## Task 1: Episodes and Sequences schema

**Files:**
- Modify: `lib/db/src/schema/production.ts`

**Interfaces:**
- Produces: `episodesTable` (columns: `id`, `tenantId`, `projectId`, `name`, `createdAt`), `sequencesTable` (columns: `id`, `tenantId`, `projectId`, `episodeId` nullable, `name`, `createdAt`), both exported from `lib/db/src/schema/production.ts` and re-exported via `lib/db/src/schema/index.ts`'s existing `export * from "./production"`.

- [ ] **Step 1: Add the two tables to `lib/db/src/schema/production.ts`**, right after the existing `projectsTable` definition (so `episodesTable`/`sequencesTable` can reference `projectsTable`, already imported in this file):

```typescript
export const episodesTable = pgTable("episodes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sequencesTable = pgTable("sequences", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Verify.** Run `pnpm run typecheck` from the repo root (use the Linux-container form from Global Constraints if the host esbuild mismatch occurs). Expected: passes with zero errors — this step only adds new exported consts, nothing consumes them yet.

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/production.ts
git commit -m "feat(db): add episodes and sequences tables"
```

---

## Task 2: Enrich Shots schema

**Files:**
- Modify: `lib/db/src/schema/production.ts`

**Interfaces:**
- Consumes: `episodesTable`, `sequencesTable` from Task 1 (same file, already in scope).
- Produces: `shotsTable` gains columns `episodeId`, `sequenceId`, `assigneeId`, `frameRange`, `duration`, `complexity`, `currentVersion`, `usdVersion`, `internalReviewStatus`, `clientReviewStatus`, `thumbnail`, `notes`, `updatedAt`.

- [ ] **Step 1: Update the top-of-file imports.** The file currently imports `{ pgTable, text, timestamp } from "drizzle-orm/pg-core"` and `{ tenantsTable, usersTable } from "./core"` (the `usersTable` import was added when `standup_updates` was built). Add `integer`:

```typescript
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Replace the existing `shotsTable` definition** with the enriched version (same table name, same existing columns kept, new columns added):

```typescript
export const shotsTable = pgTable("shots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  sequenceId: text("sequence_id").references(() => sequencesTable.id, {
    onDelete: "set null",
  }),
  assigneeId: text("assignee_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  frameRange: text("frame_range").notNull().default("1001-1100"),
  duration: integer("duration").notNull().default(100),
  complexity: text("complexity").notNull().default("medium"),
  currentVersion: text("current_version").notNull().default("v001"),
  usdVersion: text("usd_version"),
  internalReviewStatus: text("internal_review_status")
    .notNull()
    .default("not-submitted"),
  clientReviewStatus: text("client_review_status")
    .notNull()
    .default("not-submitted"),
  thumbnail: text("thumbnail"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
```

- [ ] **Step 3: Verify.** `pnpm run typecheck` — expected zero errors (this file's other tables, e.g. `assetsTable`/`tasksTable`/`versionsTable`, reference `shotsTable`'s `id`/`tenantId`/`projectId` only, all unchanged).

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/production.ts
git commit -m "feat(db): enrich shots table with full production fields"
```

---

## Task 3: Enrich Assets schema

**Files:**
- Modify: `lib/db/src/schema/production.ts`

**Interfaces:**
- Produces: `assetsTable` gains columns `type`, `assigneeId`, `version`, `usdVersion`, `tags`, `thumbnail`, `fileSize`, `polyCount`, `dependencies`, `publishStatus`, `description`, `notes`, `updatedAt`.

- [ ] **Step 1: Add `jsonb` to the top-of-file import** (from Task 2's edit, the import line is now `import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";`):

```typescript
import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Replace the existing `assetsTable` definition:**

```typescript
export const assetsTable = pgTable("assets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  sequenceId: text("sequence_id").references(() => sequencesTable.id, {
    onDelete: "set null",
  }),
  assigneeId: text("assignee_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Prop"),
  status: text("status").notNull().default("active"),
  version: text("version").notNull().default("v001"),
  usdVersion: text("usd_version"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  thumbnail: text("thumbnail"),
  fileSize: text("file_size").notNull().default("0MB"),
  polyCount: text("poly_count"),
  dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
  publishStatus: text("publish_status").notNull().default("draft"),
  description: text("description").notNull().default(""),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
```

- [ ] **Step 3: Verify.** `pnpm run typecheck` — expected zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/production.ts
git commit -m "feat(db): enrich assets table with full production fields"
```

---

## Task 4: Enrich Tasks schema and add Daily Logs table

**Files:**
- Modify: `lib/db/src/schema/production.ts`

**Interfaces:**
- Produces: `tasksTable` gains columns `title`, `description`, `priority`, `dueDate`, `estimatedHours`, `actualHours`, `tags`, `department`, `pipelinePhase`, `weeklyRating`, `lastStatusUpdate`. New `dailyLogsTable` (columns `id`, `tenantId`, `taskId`, `userId`, `date`, `hours`, `note`, `createdAt`).

- [ ] **Step 1: Replace the existing `tasksTable` definition:**

```typescript
export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(), // Can be an asset id or shot id
  entityType: text("entity_type").notNull(), // 'asset' | 'shot'
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  assignedTo: text("assigned_to"), // FK to usersTable.id
  status: text("status").notNull().default("ready"),
  priority: text("priority").notNull().default("medium"),
  department: text("department"),
  pipelinePhase: text("pipeline_phase"),
  weeklyRating: text("weekly_rating"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  estimatedHours: integer("estimated_hours").notNull().default(0),
  actualHours: integer("actual_hours").notNull().default(0),
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  lastStatusUpdate: timestamp("last_status_update").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyLogsTable = pgTable("daily_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // ISO date string, e.g. "2026-08-31"
  hours: integer("hours").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Verify.** `pnpm run typecheck` — expected zero errors. Note `versionsTable` (later in the same file) already references `tasksTable.id` via `taskId` — unaffected since `id` didn't change.

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/production.ts
git commit -m "feat(db): enrich tasks table and add daily_logs table"
```

---

## Task 5: Task detail tables (checklist, dependencies, comments, attachments, approval events)

**Files:**
- Create: `lib/db/src/schema/tasks-detail.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Consumes: `tenantsTable` (from `./core`), `tasksTable`, `usersTable` (from `./core`).
- Produces: `taskChecklistItemsTable`, `taskDependenciesTable`, `taskCommentsTable`, `taskAttachmentsTable`, `taskApprovalEventsTable`, all exported and re-exported via `index.ts`.

- [ ] **Step 1: Create `lib/db/src/schema/tasks-detail.ts`:**

```typescript
import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";
import { tasksTable } from "./production";

export const taskChecklistItemsTable = pgTable("task_checklist_items", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FS/SS/FF/SF — see DependencyType in artifacts/forge/src/data/mockData.ts.
export const taskDependenciesTable = pgTable("task_dependencies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  dependsOnTaskId: text("depends_on_task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("FS"),
  lagDays: integer("lag_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskCommentsTable = pgTable("task_comments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskAttachmentsTable = pgTable("task_attachments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  uploadedById: text("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only audit trail — see ApprovalEvent in
// artifacts/forge/src/data/mockData.ts. Rows are only ever inserted, never
// updated or deleted.
export const taskApprovalEventsTable = pgTable("task_approval_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  byUserId: text("by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  byRole: text("by_role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Add the new file to the schema barrel.** In `lib/db/src/schema/index.ts`, add a line (alphabetical-ish placement doesn't matter, existing file has no strict order):

```typescript
export * from "./tasks-detail";
```

- [ ] **Step 3: Verify.** `pnpm run typecheck` — expected zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/tasks-detail.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add task checklist/dependencies/comments/attachments/approval-event tables"
```

---

## Task 6: Reviews and Annotations schema

**Files:**
- Create: `lib/db/src/schema/reviews.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Consumes: `tenantsTable`, `usersTable` (from `./core`), `versionsTable` (from `./production`).
- Produces: `reviewsTable`, `annotationsTable`, exported and re-exported via `index.ts`. `annotationsTable`'s columns map 1:1 onto the frontend `Annotation` interface in `artifacts/forge/src/components/shared/review/types.ts`.

- [ ] **Step 1: Create `lib/db/src/schema/reviews.ts`:**

```typescript
import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";
import { versionsTable } from "./production";

export const reviewsTable = pgTable("reviews", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'shot' | 'asset'
  versionId: text("version_id")
    .notNull()
    .references(() => versionsTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  comments: text("comments").notNull().default(""),
  frame: integer("frame"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Mirrors the frontend `Annotation` interface in
// artifacts/forge/src/components/shared/review/types.ts exactly, so the
// frontend can persist/hydrate the same shape it already uses locally.
export const annotationsTable = pgTable("annotations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  versionId: text("version_id")
    .notNull()
    .references(() => versionsTable.id, { onDelete: "cascade" }),
  frame: integer("frame").notNull(),
  type: text("type").notNull(), // 'select' | 'pen' | 'arrow' | 'rectangle' | 'text'
  color: text("color").notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  w: doublePrecision("w"),
  h: doublePrecision("h"),
  points: jsonb("points").$type<{ x: number; y: number }[]>(),
  text: text("text"),
  startFrame: integer("start_frame"),
  endFrame: integer("end_frame"),
  fontFamily: text("font_family"),
  fontSize: integer("font_size"),
  backgroundColor: text("background_color"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Add to the schema barrel.** In `lib/db/src/schema/index.ts`:

```typescript
export * from "./reviews";
```

- [ ] **Step 3: Verify.** `pnpm run typecheck` — expected zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/reviews.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add reviews and annotations tables"
```

---

## Task 7: Generate and apply the migration for Tasks 1-6

**Depends on:** Tasks 1-6 (all schema changes must be committed first — this task generates ONE migration covering all of them).

**Files:**
- Create: `lib/db/drizzle/000N_<generated-name>.sql` (drizzle-kit names this automatically; `N` is the next sequence number — check `lib/db/drizzle/` for the current highest, e.g. if `0002_spicy_wild_child.sql` exists, this generates `0003_*.sql`)
- Modify: `lib/db/drizzle/meta/_journal.json`, and a new `lib/db/drizzle/meta/000N_snapshot.json` (both drizzle-kit-managed, do not hand-edit)

**Interfaces:** Terminal task for the schema section — Tasks 8+ (routes) query these new tables assuming this migration has been applied to the dev database.

- [ ] **Step 1: Generate the migration.** From the repo root:

```bash
docker run --rm -v "$(pwd):/repo" -w /repo -e CI=true node:24-alpine sh -c "corepack enable && DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' pnpm --filter '@workspace/db' run generate"
```

(On Windows Git Bash, prefix with `MSYS_NO_PATHCONV=1` per Global Constraints.)

Expected output: a table listing all tables including the new ones (`episodes`, `sequences`, `daily_logs`, `task_checklist_items`, `task_dependencies`, `task_comments`, `task_attachments`, `task_approval_events`, `reviews`, `annotations`) and confirmation of the new `.sql` file path.

- [ ] **Step 2: Read the generated SQL file** and confirm it contains `CREATE TABLE` for all 10 new tables plus `ALTER TABLE ... ADD COLUMN` statements for the `shots`/`assets`/`tasks` enrichments from Tasks 2-4. If anything looks like an unintended `DROP` (drizzle-kit occasionally misinterprets a rename as drop+add), stop and reconcile the column names against Tasks 2-4 before proceeding — do not apply a migration that drops existing columns.

- [ ] **Step 3: Bring up the local dev database if it isn't already running:**

```bash
docker-compose up -d
```

- [ ] **Step 4: Apply the migration:**

```bash
docker run --rm -v "$(pwd):/repo" -w /repo --network shotgun-mock_default -e CI=true node:24-alpine sh -c "corepack enable && DATABASE_URL='postgres://postgres:postgres@db:5432/forge' pnpm --filter '@workspace/db' run migrate"
```

Expected output: `Running migrations...` then `Migrations complete.` with no errors.

- [ ] **Step 5: Verify.** `pnpm run typecheck` (unaffected by this task, but confirms nothing else broke). Then confirm the new tables exist:

```bash
docker exec forge-db psql -U postgres -d forge -c "\dt"
```

Expected: the table list includes `episodes`, `sequences`, `daily_logs`, `task_checklist_items`, `task_dependencies`, `task_comments`, `task_attachments`, `task_approval_events`, `reviews`, `annotations`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/drizzle
git commit -m "chore(db): generate and apply migration for full-backend schema additions"
```

---

## Task 8: Episodes and Sequences routes

**Depends on:** Task 7 (migration applied).

**Files:**
- Create: `artifacts/api-server/src/routes/episodes.ts`
- Create: `artifacts/api-server/src/routes/sequences.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET/POST /api/episodes` (query param `projectId` optional filter), `GET/POST /api/sequences` (query param `projectId`/`episodeId` optional filters). Both follow the exact `tasksRouter` pattern (see `artifacts/api-server/src/routes/tasks.ts` for the reference implementation this plan replicates throughout).

- [ ] **Step 1: Create `artifacts/api-server/src/routes/episodes.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { episodesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const episodesRouter = Router();

episodesRouter.use(tenantAuthMiddleware);

episodesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(episodesTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(episodesTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(episodesTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

episodesRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db.insert(episodesTable).values({ id: newId, tenantId, projectId, name });

    const [created] = await db
      .select()
      .from(episodesTable)
      .where(and(eq(episodesTable.tenantId, tenantId), eq(episodesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Create `artifacts/api-server/src/routes/sequences.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { sequencesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const sequencesRouter = Router();

sequencesRouter.use(tenantAuthMiddleware);

sequencesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId } = req.query;
    const conditions = [eq(sequencesTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(sequencesTable.projectId, projectId));
    }
    if (typeof episodeId === "string") {
      conditions.push(eq(sequencesTable.episodeId, episodeId));
    }
    const rows = await db
      .select()
      .from(sequencesTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

sequencesRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db
      .insert(sequencesTable)
      .values({ id: newId, tenantId, projectId, episodeId: episodeId || null, name });

    const [created] = await db
      .select()
      .from(sequencesTable)
      .where(and(eq(sequencesTable.tenantId, tenantId), eq(sequencesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Mount both routers.** In `artifacts/api-server/src/routes/index.ts`, add imports alongside the existing ones:

```typescript
import { episodesRouter } from "./episodes";
import { sequencesRouter } from "./sequences";
```

and mount lines alongside the existing `router.use(...)` calls:

```typescript
router.use("/episodes", episodesRouter);
router.use("/sequences", sequencesRouter);
```

- [ ] **Step 4: Verify.** `pnpm run typecheck`. Then, with the stack up (`docker-compose up -d --build`) and logged in as a demo user (see `docs/superpowers/plans/2026-08-31-shotgrid-parity-audit.md`'s pattern, or this session's earlier curl login examples), confirm:

```bash
curl -s -b /tmp/cookie.txt -X POST http://localhost:3001/api/episodes -H "Content-Type: application/json" -d '{"projectId":"<a real project id>","name":"EP101"}'
curl -s -b /tmp/cookie.txt http://localhost:3001/api/episodes
```

Expected: `POST` returns `201` with the created row; `GET` returns an array including it.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/episodes.ts artifacts/api-server/src/routes/sequences.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): add episodes and sequences routes"
```

---

## Task 9: Shots route

**Depends on:** Task 7.

**Files:**
- Create: `artifacts/api-server/src/routes/shots.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /api/shots` (optional `projectId` query filter), `POST /api/shots`, `PUT /api/shots/:id`.

- [ ] **Step 1: Create `artifacts/api-server/src/routes/shots.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { shotsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const shotsRouter = Router();

shotsRouter.use(tenantAuthMiddleware);

shotsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(shotsTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(shotsTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(shotsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

shotsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    const newId = crypto.randomUUID();
    await db.insert(shotsTable).values({
      id: newId,
      tenantId,
      projectId,
      name,
      episodeId: episodeId || null,
      sequenceId: sequenceId || null,
      assigneeId: assigneeId || null,
    });

    const [created] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Whitelisted patchable fields — every column a shot's UI can legitimately
// update in place (status, review states, assignment, notes, version
// pointers). Deliberately excludes id/tenantId/projectId/createdAt.
const PATCHABLE_FIELDS = [
  "name",
  "status",
  "assigneeId",
  "frameRange",
  "duration",
  "complexity",
  "currentVersion",
  "usdVersion",
  "internalReviewStatus",
  "clientReviewStatus",
  "thumbnail",
  "notes",
] as const;

shotsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const shotId = req.params.id;

    const [existing] = await db
      .select()
      .from(shotsTable)
      .where(and(eq(shotsTable.tenantId, tenantId), eq(shotsTable.id, shotId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    updates.updatedAt = new Date();

    await db.update(shotsTable).set(updates).where(eq(shotsTable.id, shotId));

    const [updated] = await db
      .select()
      .from(shotsTable)
      .where(eq(shotsTable.id, shotId));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Mount the router.** In `artifacts/api-server/src/routes/index.ts`, add `import { shotsRouter } from "./shots";` and `router.use("/shots", shotsRouter);`.

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then curl `POST`/`GET`/`PUT` against `/api/shots` the same way as Task 8's verification, confirming a status update via `PUT` persists on the next `GET`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/shots.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): add shots route"
```

---

## Task 10: Assets route

**Depends on:** Task 7.

**Files:**
- Create: `artifacts/api-server/src/routes/assets.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /api/assets` (optional `projectId` filter), `POST /api/assets`, `PUT /api/assets/:id`.

- [ ] **Step 1: Create `artifacts/api-server/src/routes/assets.ts`**, following Task 9's exact structure but for `assetsTable`:

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import {
  assetsTable,
  projectsTable,
  episodesTable,
  sequencesTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// Each check confirms a foreign-key id actually belongs to the caller's
// tenant before it's allowed to be linked onto an asset. A DB foreign key
// only verifies the referenced row exists, not who owns it — without this
// check, any authenticated user could cross-link their tenant's data to
// another tenant's project/episode/sequence/user by guessing or
// discovering an id (IDOR). Same pattern as routes/shots.ts.
async function projectInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.tenantId, tenantId)));
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: episodesTable.id })
    .from(episodesTable)
    .where(and(eq(episodesTable.id, id), eq(episodesTable.tenantId, tenantId)));
  return !!row;
}
async function sequenceInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: sequencesTable.id })
    .from(sequencesTable)
    .where(and(eq(sequencesTable.id, id), eq(sequencesTable.tenantId, tenantId)));
  return !!row;
}
async function userInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  return !!row;
}

export const assetsRouter = Router();

assetsRouter.use(tenantAuthMiddleware);

assetsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const conditions = [eq(assetsTable.tenantId, tenantId)];
    if (typeof projectId === "string") {
      conditions.push(eq(assetsTable.projectId, projectId));
    }
    const rows = await db
      .select()
      .from(assetsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

assetsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, type, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });
    if (sequenceId && !(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(400).json({ error: "Invalid sequenceId" });
    if (assigneeId && !(await userInTenant(assigneeId, tenantId)))
      return res.status(400).json({ error: "Invalid assigneeId" });

    const newId = crypto.randomUUID();
    await db.insert(assetsTable).values({
      id: newId,
      tenantId,
      projectId,
      name,
      type: type || "Prop",
      episodeId: episodeId || null,
      sequenceId: sequenceId || null,
      assigneeId: assigneeId || null,
    });

    const [created] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = [
  "name",
  "type",
  "status",
  "assigneeId",
  "version",
  "usdVersion",
  "tags",
  "thumbnail",
  "fileSize",
  "polyCount",
  "dependencies",
  "publishStatus",
  "description",
  "notes",
] as const;

assetsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const assetId = req.params.id;

    const [existing] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      "assigneeId" in req.body &&
      req.body.assigneeId &&
      !(await userInTenant(req.body.assigneeId, tenantId))
    )
      return res.status(400).json({ error: "Invalid assigneeId" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    updates.updatedAt = new Date();

    await db
      .update(assetsTable)
      .set(updates)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));

    const [updated] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.tenantId, tenantId), eq(assetsTable.id, assetId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Mount the router** in `artifacts/api-server/src/routes/index.ts` (same pattern as Task 9).

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then curl `POST`/`GET`/`PUT` against `/api/assets`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/assets.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): add assets route"
```

---

## Task 11: Versions route

**Depends on:** Task 7 (though `versionsTable` itself predates this plan, no route exists for it yet).

**Files:**
- Create: `artifacts/api-server/src/routes/versions.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /api/versions` (optional `entityId`/`entityType` query filters — a version belongs to a shot or asset), `POST /api/versions`, `PUT /api/versions/:id`. `versionsTable` already has `id, tenantId, taskId, mediaUrl, status, createdAt` per the pre-existing schema — this task also adds the missing `entityId`/`entityType`/`versionNumber`/`createdById`/`thumbnail`/`derivedFromId`/`fileSize`/`notes` columns the frontend `Version` interface needs, since `versionsTable` was never enriched in Tasks 1-6.

- [ ] **Step 1: Enrich `versionsTable` in `lib/db/src/schema/production.ts`.** Replace the existing definition:

```typescript
export const versionsTable = pgTable("versions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'shot' | 'asset'
  versionNumber: text("version_number").notNull().default("v001"),
  taskId: text("task_id").references(() => tasksTable.id, {
    onDelete: "set null",
  }),
  mediaUrl: text("media_url").notNull(),
  status: text("status").notNull().default("pending_review"),
  notes: text("notes").notNull().default(""),
  thumbnail: text("thumbnail"),
  derivedFromId: text("derived_from_id"),
  fileSize: text("file_size").notNull().default("0MB"),
  createdById: text("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Note: `taskId` changes from required to nullable (a version belongs to a shot/asset directly via `entityId`/`entityType`, not necessarily to a specific task) — this is a real schema change requiring its own migration, so **this step's SQL is generated together with the rest of this task**, not folded into Task 7's migration (Task 7 is already committed by the time this task runs).

- [ ] **Step 2: Create `artifacts/api-server/src/routes/versions.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { versionsTable, tasksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// Confirms taskId actually belongs to the caller's tenant before it's
// allowed to be linked onto a version. A DB foreign key only verifies the
// referenced row exists, not who owns it — without this check, any
// authenticated user could cross-link a version to another tenant's task
// (IDOR). Same pattern as routes/shots.ts.
async function taskInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, id), eq(tasksTable.tenantId, tenantId)));
  return !!row;
}

export const versionsRouter = Router();

versionsRouter.use(tenantAuthMiddleware);

versionsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType } = req.query;
    const conditions = [eq(versionsTable.tenantId, tenantId)];
    if (typeof entityId === "string") {
      conditions.push(eq(versionsTable.entityId, entityId));
    }
    if (typeof entityType === "string") {
      conditions.push(eq(versionsTable.entityType, entityType));
    }
    const rows = await db
      .select()
      .from(versionsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

versionsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionNumber, mediaUrl, taskId } = req.body;
    if (!entityId || !entityType || !mediaUrl)
      return res
        .status(400)
        .json({ error: "Missing entityId, entityType, or mediaUrl" });

    if (taskId && !(await taskInTenant(taskId, tenantId)))
      return res.status(400).json({ error: "Invalid taskId" });

    const newId = crypto.randomUUID();
    await db.insert(versionsTable).values({
      id: newId,
      tenantId,
      entityId,
      entityType,
      versionNumber: versionNumber || "v001",
      mediaUrl,
      taskId: taskId || null,
      createdById: userId,
    });

    const [created] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["status", "notes", "thumbnail"] as const;

versionsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const versionId = req.params.id;

    const [existing] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    await db
      .update(versionsTable)
      .set(updates)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));

    const [updated] = await db
      .select()
      .from(versionsTable)
      .where(and(eq(versionsTable.tenantId, tenantId), eq(versionsTable.id, versionId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Mount the router** in `routes/index.ts`.

- [ ] **Step 4: Generate and apply this task's migration** (same commands as Task 7 Steps 1 and 4, producing the next-numbered `.sql` file — this covers only the `versionsTable` enrichment from Step 1 of this task).

- [ ] **Step 5: Verify.** `pnpm run typecheck`, then curl `POST`/`GET`/`PUT` against `/api/versions`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/production.ts lib/db/drizzle artifacts/api-server/src/routes/versions.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api,db): enrich versions table and add versions route"
```

---

## Task 12: Reviews and Annotations route

**Depends on:** Task 7 (schema), Task 11 (versions must exist for annotations to attach to).

**Files:**
- Create: `artifacts/api-server/src/routes/reviews.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /api/reviews` (optional `entityId`/`entityType`/`versionId` filters), `POST /api/reviews`; `GET /api/reviews/:versionId/annotations`, `POST /api/reviews/:versionId/annotations`, `DELETE /api/reviews/annotations/:id`.

- [ ] **Step 1: Create `artifacts/api-server/src/routes/reviews.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { reviewsTable, annotationsTable, versionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

// Confirms versionId actually belongs to the caller's tenant before it's
// allowed to be linked onto a review or annotation. A DB foreign key only
// verifies the referenced row exists, not who owns it — without this
// check, any authenticated user could attach a review/annotation to
// another tenant's version (IDOR). Same pattern as routes/shots.ts.
async function versionInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: versionsTable.id })
    .from(versionsTable)
    .where(and(eq(versionsTable.id, id), eq(versionsTable.tenantId, tenantId)));
  return !!row;
}

export const reviewsRouter = Router();

reviewsRouter.use(tenantAuthMiddleware);

reviewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, versionId } = req.query;
    const conditions = [eq(reviewsTable.tenantId, tenantId)];
    if (typeof entityId === "string")
      conditions.push(eq(reviewsTable.entityId, entityId));
    if (typeof entityType === "string")
      conditions.push(eq(reviewsTable.entityType, entityType));
    if (typeof versionId === "string")
      conditions.push(eq(reviewsTable.versionId, versionId));
    const rows = await db
      .select()
      .from(reviewsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionId, status, comments, frame } = req.body;
    if (!entityId || !entityType || !versionId)
      return res
        .status(400)
        .json({ error: "Missing entityId, entityType, or versionId" });

    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const newId = crypto.randomUUID();
    await db.insert(reviewsTable).values({
      id: newId,
      tenantId,
      entityId,
      entityType,
      versionId,
      reviewerId: userId,
      status: status || "pending",
      comments: comments || "",
      frame: typeof frame === "number" ? frame : null,
    });

    const [created] = await db
      .select()
      .from(reviewsTable)
      .where(and(eq(reviewsTable.tenantId, tenantId), eq(reviewsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.get("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { versionId } = req.params;
    const rows = await db
      .select()
      .from(annotationsTable)
      .where(
        and(
          eq(annotationsTable.tenantId, tenantId),
          eq(annotationsTable.versionId, versionId),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { versionId } = req.params;
    const {
      frame,
      type,
      color,
      x,
      y,
      w,
      h,
      points,
      text,
      startFrame,
      endFrame,
      fontFamily,
      fontSize,
      backgroundColor,
    } = req.body;
    if (typeof frame !== "number" || !type || !color)
      return res.status(400).json({ error: "Missing frame, type, or color" });

    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const newId = crypto.randomUUID();
    await db.insert(annotationsTable).values({
      id: newId,
      tenantId,
      versionId,
      frame,
      type,
      color,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? null,
      h: h ?? null,
      points: points ?? null,
      text: text ?? null,
      startFrame: startFrame ?? null,
      endFrame: endFrame ?? null,
      fontFamily: fontFamily ?? null,
      fontSize: fontSize ?? null,
      backgroundColor: backgroundColor ?? null,
      createdById: userId,
    });

    const [created] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.delete("/annotations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db
      .delete(annotationsTable)
      .where(and(eq(annotationsTable.tenantId, tenantId), eq(annotationsTable.id, id)));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Mount the router** in `routes/index.ts` as `router.use("/reviews", reviewsRouter);`.

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then curl-create a review and an annotation against a real `versionId` (from Task 11's verification), confirm `GET /api/reviews/:versionId/annotations` returns it, confirm `DELETE` removes it.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/reviews.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): add reviews and annotations route"
```

---

## Task 13: Daily Logs route

**Depends on:** Task 7.

**Files:**
- Create: `artifacts/api-server/src/routes/daily-logs.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /api/daily-logs` (optional `taskId`/`userId` filters), `POST /api/daily-logs`.

- [ ] **Step 1: Create `artifacts/api-server/src/routes/daily-logs.ts`:**

```typescript
import { Router } from "express";
import { db } from "@workspace/db";
import { dailyLogsTable, tasksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const dailyLogsRouter = Router();

dailyLogsRouter.use(tenantAuthMiddleware);

dailyLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskId, userId } = req.query;
    const conditions = [eq(dailyLogsTable.tenantId, tenantId)];
    if (typeof taskId === "string") conditions.push(eq(dailyLogsTable.taskId, taskId));
    if (typeof userId === "string") conditions.push(eq(dailyLogsTable.userId, userId));
    const rows = await db
      .select()
      .from(dailyLogsTable)
      .where(and(...conditions));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

dailyLogsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { taskId, date, hours, note } = req.body;
    if (!taskId || !date || typeof hours !== "number")
      return res.status(400).json({ error: "Missing taskId, date, or hours" });

    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
    if (!task) return res.status(400).json({ error: "Invalid taskId" });

    const newId = crypto.randomUUID();
    await db.insert(dailyLogsTable).values({
      id: newId,
      tenantId,
      taskId,
      userId,
      date,
      hours,
      note: note || "",
    });

    // Roll the logged hours into the task's actualHours total.
    await db
      .update(tasksTable)
      .set({ actualHours: task.actualHours + hours })
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

    const [created] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.tenantId, tenantId), eq(dailyLogsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Mount the router** in `routes/index.ts` as `router.use("/daily-logs", dailyLogsRouter);`.

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then curl-create a daily log against a real `taskId`, confirm the parent task's `actualHours` increased on a subsequent `GET /api/tasks`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/daily-logs.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): add daily logs route"
```

---

## Task 14: Task enrichment route and nested task sub-resource routes

**Depends on:** Task 7.

**Files:**
- Modify: `artifacts/api-server/src/routes/tasks.ts`

**Interfaces:**
- Produces: extends existing `GET/POST/PUT` on `/api/tasks` for the new enriched fields; adds `GET/POST /api/tasks/:id/checklist`, `PUT /api/tasks/:id/checklist/:itemId`; `GET/POST /api/tasks/:id/comments`; `GET/POST /api/tasks/:id/dependencies`; `GET/POST /api/tasks/:id/attachments`; `GET/POST /api/tasks/:id/approval-events`.

- [ ] **Step 1: Read the current `artifacts/api-server/src/routes/tasks.ts` in full** (it's short, ~80 lines) to confirm the exact current `GET`/`POST`/`PUT` handlers before extending them — this task modifies existing handlers, not just appends. Add `usersTable` and `tenantRolesTable` to the file's existing `@workspace/db/schema` import, and add these helpers near the top of the file (after the imports, before the router handlers) — used by Steps 2, 3, and the nested sub-resource routes below: a DB foreign key only verifies a referenced row exists, not who owns it, so every foreign key accepted from a request body needs an explicit tenant-ownership check before use (same pattern already applied in `routes/shots.ts`, `routes/versions.ts`, `routes/reviews.ts`):

```typescript
async function userInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  return !!row;
}

// Used by every nested /:id/* sub-resource route below to confirm the
// parent task (req.params.id) belongs to the caller's tenant BEFORE
// inserting a checklist item/comment/dependency/attachment/approval-event
// against it — otherwise a user could write sub-resources onto another
// tenant's task just by knowing its id, even though the sub-resource row
// itself carries the caller's own tenantId (an IDOR-adjacent referential
// integrity gap, same root cause as the FK-ownership issue elsewhere in
// this plan).
async function taskInTenant(id: string, tenantId: string) {
  const [row] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, id), eq(tasksTable.tenantId, tenantId)));
  return !!row;
}

// The approval-events table is an append-only audit trail (see the schema
// comment in tasks-detail.ts) — its whole purpose is to record who approved
// what and in what capacity. Accepting `byRole` from the request body would
// let any caller write a false audit record (e.g. claim they acted as
// "lead" while actually an "artist"), so the role is always looked up
// server-side from the caller's own session (req.roleId), never trusted
// from the client.
async function roleNameForCaller(roleId: string, tenantId: string) {
  const [row] = await db
    .select({ name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)));
  return row?.name;
}

const APPROVAL_EVENT_ACTIONS = [
  "submitted-for-lead-review",
  "submitted-for-manager-review",
  "approved",
  "changes-requested",
  "rejected",
  "published",
] as const;
```

- [ ] **Step 2: Extend the existing `POST /` handler** to accept the new enriched fields (`title`, `description`, `priority`, `department`, `pipelinePhase`, `dueDate`, `estimatedHours`) alongside the existing `entityId`/`entityType`/`status`:

```typescript
tasksRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const {
      entityId,
      entityType,
      status,
      title,
      description,
      priority,
      department,
      pipelinePhase,
      dueDate,
      estimatedHours,
      assignedTo,
    } = req.body;

    if (!entityId || !entityType)
      return res.status(400).json({ error: "Missing entityId or entityType" });

    if (assignedTo && !(await userInTenant(assignedTo, tenantId)))
      return res.status(400).json({ error: "Invalid assignedTo" });

    const newId = crypto.randomUUID();
    await db.insert(tasksTable).values({
      id: newId,
      tenantId,
      entityId,
      entityType,
      status: status || "ready",
      title: title || "",
      description: description || "",
      priority: priority || "medium",
      department: department || null,
      pipelinePhase: pipelinePhase || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours || 0,
      assignedTo: assignedTo || null,
    });

    const [created] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Extend the existing `PUT /:id` handler** to whitelist the full patchable field set instead of just `status`:

```typescript
const TASK_PATCHABLE_FIELDS = [
  "status",
  "title",
  "description",
  "priority",
  "department",
  "pipelinePhase",
  "weeklyRating",
  "tags",
  "estimatedHours",
  "actualHours",
  "assignedTo",
] as const;

tasksRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const taskId = req.params.id;

    const [existing] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      "assignedTo" in req.body &&
      req.body.assignedTo &&
      !(await userInTenant(req.body.assignedTo, tenantId))
    )
      return res.status(400).json({ error: "Invalid assignedTo" });

    const updates: Record<string, unknown> = {};
    for (const field of TASK_PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    updates.lastStatusUpdate = new Date();

    await db
      .update(tasksTable)
      .set(updates)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

    const [updated] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: Append the nested sub-resource routes to the same file**, after the existing handlers. Update the top-of-file import to include the new tables:

```typescript
import {
  tasksTable,
  taskChecklistItemsTable,
  taskDependenciesTable,
  taskCommentsTable,
  taskAttachmentsTable,
  taskApprovalEventsTable,
} from "@workspace/db/schema";
```

Then append:

```typescript
tasksRouter.get("/:id/checklist", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.taskId, req.params.id),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/checklist", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { text, position } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const newId = crypto.randomUUID();
    await db.insert(taskChecklistItemsTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      text,
      position: position ?? 0,
    });
    const [created] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(and(eq(taskChecklistItemsTable.tenantId, tenantId), eq(taskChecklistItemsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.put("/:id/checklist/:itemId", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { done, text } = req.body;
    const [existing] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, req.params.itemId),
        ),
      );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: Record<string, unknown> = {};
    if (typeof done === "boolean") updates.done = done;
    if (typeof text === "string") updates.text = text;
    await db
      .update(taskChecklistItemsTable)
      .set(updates)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, req.params.itemId),
        ),
      );
    const [updated] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, req.params.itemId),
        ),
      );
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/comments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskCommentsTable)
      .where(
        and(eq(taskCommentsTable.tenantId, tenantId), eq(taskCommentsTable.taskId, req.params.id)),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/comments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const newId = crypto.randomUUID();
    await db.insert(taskCommentsTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      userId,
      text,
    });
    const [created] = await db
      .select()
      .from(taskCommentsTable)
      .where(and(eq(taskCommentsTable.tenantId, tenantId), eq(taskCommentsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/dependencies", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskDependenciesTable)
      .where(
        and(
          eq(taskDependenciesTable.tenantId, tenantId),
          eq(taskDependenciesTable.taskId, req.params.id),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/dependencies", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { dependsOnTaskId, type, lagDays } = req.body;
    if (!dependsOnTaskId)
      return res.status(400).json({ error: "Missing dependsOnTaskId" });
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    if (!(await taskInTenant(dependsOnTaskId, tenantId)))
      return res.status(400).json({ error: "Invalid dependsOnTaskId" });
    const newId = crypto.randomUUID();
    await db.insert(taskDependenciesTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      dependsOnTaskId,
      type: type || "FS",
      lagDays: lagDays ?? null,
    });
    const [created] = await db
      .select()
      .from(taskDependenciesTable)
      .where(and(eq(taskDependenciesTable.tenantId, tenantId), eq(taskDependenciesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/attachments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskAttachmentsTable)
      .where(
        and(
          eq(taskAttachmentsTable.tenantId, tenantId),
          eq(taskAttachmentsTable.taskId, req.params.id),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/attachments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const newId = crypto.randomUUID();
    await db.insert(taskAttachmentsTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      url,
      uploadedById: userId,
    });
    const [created] = await db
      .select()
      .from(taskAttachmentsTable)
      .where(and(eq(taskAttachmentsTable.tenantId, tenantId), eq(taskAttachmentsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskApprovalEventsTable)
      .where(
        and(
          eq(taskApprovalEventsTable.tenantId, tenantId),
          eq(taskApprovalEventsTable.taskId, req.params.id),
        ),
      );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const roleId = req.roleId!;
    const { action } = req.body;
    if (!action || !(APPROVAL_EVENT_ACTIONS as readonly string[]).includes(action))
      return res.status(400).json({ error: "Missing or invalid action" });
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const byRole = await roleNameForCaller(roleId, tenantId);
    if (!byRole) return res.status(400).json({ error: "Invalid role" });
    const newId = crypto.randomUUID();
    await db.insert(taskApprovalEventsTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      action,
      byUserId: userId,
      byRole,
    });
    const [created] = await db
      .select()
      .from(taskApprovalEventsTable)
      .where(and(eq(taskApprovalEventsTable.tenantId, tenantId), eq(taskApprovalEventsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 5: Verify.** `pnpm run typecheck`, then curl-exercise `POST`/`GET` for each of the 5 sub-resources against a real task id, and confirm the enriched `POST`/`PUT /api/tasks` fields persist.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/tasks.ts
git commit -m "feat(api): enrich tasks route and add checklist/comments/dependencies/attachments/approval-event sub-resources"
```

---

## Task 15: Frontend — Shots

**Depends on:** Task 9 (shots route).

**Files:**
- Create: `artifacts/forge/src/hooks/useShots.ts`
- Modify: `artifacts/forge/src/pages/shots.tsx`, `artifacts/forge/src/pages/shot-detail.tsx`
- Modify (callers): `artifacts/forge/src/pages/tracking.tsx` (already reads `useShotStore` — see `docs/superpowers/audit/2026-08-31-shotgrid-parity/forge-inventory.md` if the ShotGrid audit has landed by the time this task runs, for the full caller list)

**Interfaces:**
- Produces: `useShots(projectId?: string)` (react-query, returns `{ data: ShotDTO[], isLoading, isError }`), `useCreateShot()`, `useUpdateShot()` mutations — same pattern as `useStandups.ts` (`artifacts/forge/src/hooks/useStandups.ts`, already in this repo from this session's standups work).

- [ ] **Step 1: Create `artifacts/forge/src/hooks/useShots.ts`**, following `useStandups.ts`'s exact pattern:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface ShotDTO {
  id: string;
  tenantId: string;
  projectId: string;
  episodeId: string | null;
  sequenceId: string | null;
  assigneeId: string | null;
  name: string;
  status: string;
  frameRange: string;
  duration: number;
  complexity: string;
  currentVersion: string;
  usdVersion: string | null;
  internalReviewStatus: string;
  clientReviewStatus: string;
  thumbnail: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function useShots(projectId?: string) {
  return useQuery<ShotDTO[]>({
    queryKey: ["shots", projectId ?? "all"],
    queryFn: async () =>
      apiClient.get<ShotDTO[]>(
        projectId ? `/shots?projectId=${projectId}` : "/shots",
      ),
    staleTime: 10000,
  });
}

export function useCreateShot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; name: string; episodeId?: string; sequenceId?: string; assigneeId?: string }) =>
      apiClient.post<ShotDTO>("/shots", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shots"] }),
  });
}

export function useUpdateShot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ShotDTO>) =>
      apiClient.put<ShotDTO>(`/shots/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shots"] }),
  });
}
```

- [ ] **Step 2: Add `put` to `apiClient`.** `artifacts/forge/src/lib/apiClient.ts`'s `apiClient` object currently only exports `get`/`post` (see the file — `get: <T>(path) => apiFetch<T>(path)`, `post: <T>(path, body) => apiFetch<T>(path, {method: "POST", ...})`). Add:

```typescript
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
```

(Every other frontend task in this plan that needs `PUT` — Tasks 16, 17, 18 — depends on this same addition; it only needs to happen once, here, since it's a shared file.)

- [ ] **Step 3: Wire `shots.tsx` and `shot-detail.tsx` to the real hook.** Read both files first. Apply this transformation, which is the same mechanical pattern already used for `daily-standup.tsx`'s standups migration this session:
  - Remove the `useShotStore` import and any `import { SHOTS } from ...mockData` used only for fallback data.
  - Add `import { useShots, useUpdateShot } from "@/hooks/useShots";`.
  - Replace `const shots = useShotStore((state) => state.shots);` with `const { data: shots = [], isLoading } = useShots();`.
  - Replace `const updateShot = useShotStore((state) => state.updateShot);` and every call site `updateShot(id, { field: value })` with a `useUpdateShot()` mutation: `const updateShotMutation = useUpdateShot();` then each call site becomes `updateShotMutation.mutate({ id, field: value })`.
  - Replace any `updateReviewStatus(id, isInternal, status)` call sites with `updateShotMutation.mutate({ id, internalReviewStatus: status })` or `{ id, clientReviewStatus: status }` depending on the `isInternal` flag (the frontend `Shot` type field names already match the new `ShotDTO` field names one-for-one, so no field-name translation is needed anywhere in this file).
  - Where the page renders assignee/department info by looking up `USERS`/`DEPARTMENTS` from mock data via `shot.assigneeId`, leave that lookup as-is for now if `useUsersMap()` isn't already imported in the file — assignee/department resolution against real users was already established this session (`daily-standup.tsx`'s `usersMap.get(update.userId)` pattern) and should be applied here too if the file doesn't already do it, using `useUsersMap()` from `@/hooks/useUsers.ts`.

- [ ] **Step 4: Verify.** `pnpm run typecheck`. Then in the browser (`docker-compose up -d --build`, `http://localhost/shots`), confirm: the page loads without the old mock `SHOTS` array (a freshly-seeded tenant with no shots yet shows an empty state, not the old mock rows — if Task 20 hasn't run yet, seed at least one shot manually via curl to confirm rendering), and a status change persists across a page reload.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/hooks/useShots.ts artifacts/forge/src/lib/apiClient.ts artifacts/forge/src/pages/shots.tsx artifacts/forge/src/pages/shot-detail.tsx
git commit -m "feat(frontend): wire Shots pages to the real backend"
```

---

## Task 16: Frontend — Assets

**Depends on:** Task 10 (assets route), Task 15 (Step 2's `apiClient.put` addition).

**Files:**
- Create: `artifacts/forge/src/hooks/useAssets.ts`
- Modify: `artifacts/forge/src/pages/assets.tsx`, `artifacts/forge/src/pages/asset-detail.tsx`

**Interfaces:**
- Produces: `useAssets(projectId?)`, `useCreateAsset()`, `useUpdateAsset()` — identical pattern to Task 15's `useShots.ts`.

- [ ] **Step 1: Create `artifacts/forge/src/hooks/useAssets.ts`**, following Task 15 Step 1's exact structure but for assets (`AssetDTO` fields: `id, tenantId, projectId, episodeId, sequenceId, assigneeId, name, type, status, version, usdVersion, tags, thumbnail, fileSize, polyCount, dependencies, publishStatus, description, notes, createdAt, updatedAt` — matching `assetsTable` from Task 3).

- [ ] **Step 2: Wire `assets.tsx` and `asset-detail.tsx`**, following Task 15 Step 3's exact transformation pattern (`useAssetStore` → `useAssets`/`useUpdateAsset`, `updateAsset(id, updates)` call sites → `updateAssetMutation.mutate({ id, ...updates })`).

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then browser check at `http://localhost/assets` (same method as Task 15 Step 4).

- [ ] **Step 4: Commit**

```bash
git add artifacts/forge/src/hooks/useAssets.ts artifacts/forge/src/pages/assets.tsx artifacts/forge/src/pages/asset-detail.tsx
git commit -m "feat(frontend): wire Assets pages to the real backend"
```

---

## Task 17: Frontend — Versions and Reviews (annotations persistence)

**Depends on:** Task 11 (versions route), Task 12 (reviews/annotations route).

**Files:**
- Create: `artifacts/forge/src/hooks/useVersions.ts`, `artifacts/forge/src/hooks/useReviews.ts`
- Modify: `artifacts/forge/src/pages/review.tsx`, `artifacts/forge/src/pages/client-review.tsx`

**Interfaces:**
- Produces: `useVersions(entityId, entityType)`, `useAnnotations(versionId)`, `useCreateAnnotation()`, `useDeleteAnnotation()`.

- [ ] **Step 1: Create `artifacts/forge/src/hooks/useVersions.ts`:**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface VersionDTO {
  id: string;
  tenantId: string;
  entityId: string;
  entityType: "shot" | "asset";
  versionNumber: string;
  taskId: string | null;
  mediaUrl: string;
  status: string;
  notes: string;
  thumbnail: string | null;
  derivedFromId: string | null;
  fileSize: string;
  createdById: string | null;
  createdAt: string;
}

export function useVersions(entityId?: string, entityType?: "shot" | "asset") {
  return useQuery<VersionDTO[]>({
    queryKey: ["versions", entityId ?? "all", entityType ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityId) params.set("entityId", entityId);
      if (entityType) params.set("entityType", entityType);
      const qs = params.toString();
      return apiClient.get<VersionDTO[]>(`/versions${qs ? `?${qs}` : ""}`);
    },
    staleTime: 10000,
  });
}

export function useUpdateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<VersionDTO>) =>
      apiClient.put<VersionDTO>(`/versions/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["versions"] }),
  });
}
```

- [ ] **Step 2: Create `artifacts/forge/src/hooks/useReviews.ts`:**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Annotation } from "@/components/shared/review/types";

export function useAnnotations(versionId: string | undefined) {
  return useQuery<Annotation[]>({
    queryKey: ["annotations", versionId ?? "none"],
    queryFn: async () =>
      apiClient.get<Annotation[]>(`/reviews/${versionId}/annotations`),
    enabled: !!versionId,
    staleTime: 5000,
  });
}

export function useCreateAnnotation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotation: Omit<Annotation, "id">) =>
      apiClient.post<Annotation>(`/reviews/${versionId}/annotations`, annotation),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", versionId ?? "none"] }),
  });
}

export function useDeleteAnnotation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/reviews/annotations/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", versionId ?? "none"] }),
  });
}
```

- [ ] **Step 3: Add `delete` to `apiClient`** (`artifacts/forge/src/lib/apiClient.ts`), alongside the `put` added in Task 15 Step 2:

```typescript
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
```

- [ ] **Step 4: Wire `review.tsx` and `client-review.tsx`.** Both files currently hold annotations as local component state: `const [annotations, setAnnotations] = useState<Annotation[]>([]);` (confirmed in `review.tsx` at the point this session inspected it). Replace with:
  - `const { data: annotations = [] } = useAnnotations(currentVersionId);` (the file already has a concept of "current version" being reviewed — locate its existing version-selection state and use that id).
  - Every place the code called `setAnnotations((prev) => [...prev, newAnnotation])` to add one, replace with `createAnnotation.mutate(newAnnotation)` (using `const createAnnotation = useCreateAnnotation(currentVersionId);`).
  - Every place it called `setAnnotations((prev) => prev.filter((a) => a.id !== id))` to remove one, replace with `deleteAnnotation.mutate(id)` (using `const deleteAnnotation = useDeleteAnnotation(currentVersionId);`).
  - The annotation-drawing interaction logic itself (mouse-down/drag/mouse-up building up the in-progress shape before it's committed) stays local `useState` as today — only the *committed* annotation list becomes server-backed, not the transient drag state.

- [ ] **Step 5: Fix the layout overlap bug** (Sub-project 3's item (a) from the spec, folded into this task since it's in the same file): read the player's bottom section in `review.tsx` around the previous/next-shot thumbnail strip and the frame scrubber — they currently overlap. Adjust the container so the scrubber has its own row above the thumbnail strip (e.g. wrap the scrubber in a `div` with `mb-2` or move the thumbnail strip into a flex row below the scrubber's container, whichever matches this file's existing layout approach) rather than both being absolutely/flexibly positioned into the same space.

- [ ] **Step 6: Verify.** `pnpm run typecheck`, then browser check: open a review, draw an annotation, reload the page, confirm the annotation persisted. Confirm the previous/next-shot thumbnails no longer overlap the scrubber.

- [ ] **Step 7: Commit**

```bash
git add artifacts/forge/src/hooks/useVersions.ts artifacts/forge/src/hooks/useReviews.ts artifacts/forge/src/lib/apiClient.ts artifacts/forge/src/pages/review.tsx artifacts/forge/src/pages/client-review.tsx
git commit -m "feat(frontend): persist review annotations to the real backend, fix player layout overlap"
```

---

## Task 18: Frontend — Task enrichment and nested sub-resources

**Depends on:** Task 14 (enriched tasks route + sub-resources).

**Files:**
- Modify: `artifacts/forge/src/hooks/useStandups.ts`-adjacent — create `artifacts/forge/src/hooks/useTasks.ts` (new, distinct from the existing `store/tasks.ts` zustand store this replaces)
- Modify: `artifacts/forge/src/pages/tasks.tsx`, `artifacts/forge/src/pages/task-detail.tsx`, `artifacts/forge/src/components/shell/TaskDrawer.tsx`

**Interfaces:**
- Produces: `useTasks()`, `useUpdateTask()`, `useTaskChecklist(taskId)`, `useAddChecklistItem(taskId)`, `useToggleChecklistItem(taskId)`, `useTaskComments(taskId)`, `useAddTaskComment(taskId)`, `useTaskDependencies(taskId)`, `useTaskAttachments(taskId)`, `useTaskApprovalEvents(taskId)`.

**IMPORTANT — corrected field mapping (this section originally claimed
`TaskDTO`'s fields match the mock `Task` interface one-for-one; that claim
is WRONG and was caught by the controller before dispatch — do not trust
that claim if you see it repeated anywhere else).** The real `tasksTable`
schema (`lib/db/src/schema/production.ts`) and the mock `Task` interface
(`artifacts/forge/src/data/mockData.ts`) diverge on several fields:

| Mock `Task` field | Real `tasksTable` equivalent |
|---|---|
| `assetId` / `shotId` (two optional fields) | `entityId` + `entityType: "asset" \| "shot"` (one field pair covers both) |
| `assigneeId` | `assignedTo` |
| `assignedById` | **does not exist server-side** — no "who assigned this" column. Any UI that reads `task.assignedById` needs to either hide that field or fall back to a sensible default (e.g. omit the "assigned by" line); do not invent a fake value. |
| `projectId` | **does not exist server-side** — a task's project is only reachable indirectly via its `entityId`→shot/asset→`projectId`. `GET /api/tasks` (already-shipped, from Task 8, unmodified by Task 14) has NO `projectId` query filter — it returns all of the tenant's tasks unconditionally. Do not add one now (that needs a join through shots/assets and is out of scope for this task); `useTasks()` takes no arguments. If a page needs project-scoped tasks, filter client-side against `useShots()`/`useAssets()`'s already-fetched data by matching `entityId`. |
| `checklist` / `comments` / `attachments` / `dependencies` / `approvalHistory` / `dailyLogs` (inline arrays on the mock `Task` object) | **not present on `TaskDTO` at all** — these are the five separate nested-resource endpoints this task's hooks already cover (`useTaskChecklist`, `useTaskComments`, etc.). Any page code that reads e.g. `task.checklist` directly must be rewritten to call `useTaskChecklist(task.id)` instead — this is not a rename, it's a structural change from an inline field to a separate fetched resource. |

`TaskDTO`'s real field set (matching `tasksTable` exactly) is: `id,
tenantId, entityId, entityType, title, description, assignedTo, status,
priority, department, pipelinePhase, weeklyRating, tags, estimatedHours,
actualHours, startDate, dueDate, lastStatusUpdate, createdAt` (all
nullable except id/tenantId/entityId/entityType/title/description/status/
priority/tags/estimatedHours/actualHours/lastStatusUpdate/createdAt, per
the schema's `.notNull()` markers — `assignedTo`/`department`/
`pipelinePhase`/`weeklyRating`/`startDate`/`dueDate` are nullable).

- [ ] **Step 1: Create `artifacts/forge/src/hooks/useTasks.ts`** with the core `useTasks()`/`useUpdateTask()` pair (same structural pattern as Task 15's `useShots.ts` — query + update mutation with `staleTime`/`onSuccess: invalidateQueries` — but `useTasks()` takes no `projectId` argument, per the correction above; `TaskDTO` is the corrected field list above, not the mock `Task` interface) plus the five nested-resource hook pairs, each following `useReviews.ts`'s `useAnnotations`/`useCreateAnnotation` pattern from Task 17 but pointed at `/tasks/:id/checklist`, `/tasks/:id/comments`, `/tasks/:id/dependencies`, `/tasks/:id/attachments`, `/tasks/:id/approval-events` respectively. For the checklist toggle specifically, add a `useToggleChecklistItem(taskId)` mutation calling `apiClient.put(\`/tasks/${taskId}/checklist/${itemId}\`, { done })`.

- [ ] **Step 2: Wire `tasks.tsx`, `task-detail.tsx`, and `TaskDrawer.tsx`.** Read all three files first (the existing `useTasksStore` from `store/tasks.ts` has ~10 mutation methods per this session's earlier inspection — `updateTask`, `updateTaskStatus`, and several more for checklist/comments/dependencies). For each store method AND each field read, map it to the corresponding new hook or corrected field name per the table above:
  - `tasks` (read) → `useTasks()`'s `data`.
  - `updateTask(id, updates)` / `updateTaskStatus(id, status)` → `useUpdateTask()`'s `.mutate({ id, ...updates })` / `.mutate({ id, status })`.
  - Any checklist-toggle store method → `useToggleChecklistItem(taskId).mutate({ itemId, done })`.
  - Any comment-add store method → `useAddTaskComment(taskId).mutate({ text })`.
  - Any dependency-add store method → the dependencies hook's create mutation.
  - `task.assetId`/`task.shotId` reads → `task.entityId` (with `task.entityType` to disambiguate which kind it is).
  - `task.assigneeId` reads → `task.assignedTo`.
  - `task.checklist`/`.comments`/`.attachments`/`.dependencies`/`.approvalHistory` reads → the corresponding `useTaskChecklist(task.id)`/etc. hook's `data`, called at the point of use (e.g. inside `TaskDrawer.tsx`'s expanded-task view), not as a field access on the task object itself.
  - `task.assignedById` / `task.projectId` reads: no real backend equivalent exists (see table above) — omit the UI element that displayed it, or resolve it client-side (project: via the task's shot/asset lookup) rather than reading a nonexistent field.
  - Apply this same "identify the store method or field read, map to the matching hook call or corrected field name" transformation to every remaining `useTasksStore` call site in these three files.

- [ ] **Step 3: Verify.** `pnpm run typecheck`, then browser check at `http://localhost/tasks`: create/update a task, toggle a checklist item, add a comment, reload, confirm persistence.

- [ ] **Step 4: Commit**

```bash
git add artifacts/forge/src/hooks/useTasks.ts artifacts/forge/src/pages/tasks.tsx artifacts/forge/src/pages/task-detail.tsx artifacts/forge/src/components/shell/TaskDrawer.tsx
git commit -m "feat(frontend): wire Tasks pages and nested sub-resources to the real backend"
```

---

## Task 19: Frontend — Daily Logs

**Depends on:** Task 13 (daily-logs route), Task 18 (task hooks, since a log attaches to a task).

**Files:**
- Modify: `artifacts/forge/src/hooks/useTasks.ts` (add `useDailyLogs`/`useAddDailyLog`)
- Modify: `artifacts/forge/src/pages/daily-standup.tsx` (the "Log Update" dialog and the Recent Progress & Daily Logs list, which today read/write `task.dailyLogs` on the mock `Task` object via `store/tasks.ts`'s `updateTask`)
- Modify: `artifacts/forge/src/pages/task-detail.tsx` (if it has its own daily-log UI separate from the standup page's)

**Interfaces:**
- Produces: `useDailyLogs(taskId)`, `useAddDailyLog(taskId)`.

- [ ] **Step 1: Add to `artifacts/forge/src/hooks/useTasks.ts`:**

```typescript
export interface DailyLogDTO {
  id: string;
  tenantId: string;
  taskId: string;
  userId: string;
  date: string;
  hours: number;
  note: string;
  createdAt: string;
}

export function useDailyLogs(taskId: string | undefined) {
  return useQuery<DailyLogDTO[]>({
    queryKey: ["daily-logs", taskId ?? "none"],
    queryFn: async () => apiClient.get<DailyLogDTO[]>(`/daily-logs?taskId=${taskId}`),
    enabled: !!taskId,
  });
}

export function useAddDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { taskId: string; date: string; hours: number; note?: string }) =>
      apiClient.post<DailyLogDTO>("/daily-logs", body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily-logs", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] }); // actualHours changed
    },
  });
}
```

- [ ] **Step 2: Wire `daily-standup.tsx`'s log-submission flow.** The existing `handleLogUpdateSubmit` function (already read once this session — it calls `updateTask(task.id, { dailyLogs: [...task.dailyLogs, {...}], actualHours: ... })`) becomes:

```typescript
const addDailyLog = useAddDailyLog();

const handleLogUpdateSubmit = () => {
  const resolvedTaskId = logTaskId || myTasks[0]?.id;
  const hoursNum = parseFloat(logHours);
  if (!resolvedTaskId || !hoursNum || hoursNum <= 0) {
    toast({
      title: "Missing Info",
      description: "Select a task and enter valid hours.",
      variant: "destructive",
    });
    return;
  }
  addDailyLog.mutate(
    {
      taskId: resolvedTaskId,
      date: new Date().toISOString().slice(0, 10),
      hours: hoursNum,
      note: logNote.trim() || "No notes provided.",
    },
    {
      onSuccess: () => {
        toast({
          title: "Log Submitted",
          description: "Your daily update has been recorded successfully.",
        });
        setLogDialogOpen(false);
        setLogTaskId("");
        setLogHours("8");
        setLogNote("");
      },
    },
  );
};
```

- [ ] **Step 3: Update the "Recent Progress & Daily Logs" list rendering** to read from `useDailyLogs` per-task instead of `task.dailyLogs` — this list currently iterates `tasks.filter((t) => t.dailyLogs.length > 0)`; since daily logs are no longer embedded on the task object, fetch logs per visible task (or add a `GET /api/daily-logs?taskId=...` call per row, batched via `Promise.all` in a small local effect, or — simpler — extend the `GET /api/tasks` response is NOT changed by this plan, so query each relevant task's logs individually via `useDailyLogs(taskId)` called from a small per-row subcomponent, matching the pattern of components that need per-item data already used elsewhere in this file for per-member data via `USERS.find(...)`).

- [ ] **Step 4: Verify.** `pnpm run typecheck`, then browser check: submit a daily log from the Daily Standup page, confirm it appears in Recent Progress & Daily Logs after reload, confirm the task's actualHours updated.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/hooks/useTasks.ts artifacts/forge/src/pages/daily-standup.tsx artifacts/forge/src/pages/task-detail.tsx
git commit -m "feat(frontend): wire daily task logs to the real backend"
```

---

## Task 20: Seed data

**Depends on:** Tasks 1-14 (all schema and routes must exist).

**Files:**
- Modify: `scripts/src/seed.ts`

**Interfaces:** Terminal task — no downstream consumer within this plan, but this is what makes every prior task's frontend pages show non-empty real data on a fresh database.

- [ ] **Step 1: Read the current `scripts/src/seed.ts` in full** to see its existing structure (it already seeds tenants, roles, departments, users — this task extends the same script, in the same style, rather than replacing it).

- [ ] **Step 2: Extend the script** to generate, per demo tenant, after the existing user/department seeding: 2 projects, 2 episodes per project, 2-3 sequences per episode, 15-20 shots spread across the seeded episodes/sequences with varied `status`/`internalReviewStatus`/`clientReviewStatus` values and `assigneeId`s drawn from the seeded artist users, 10-15 assets similarly varied, 20-30 tasks referencing those shots/assets as `entityId`/`entityType` with a few `taskChecklistItemsTable` rows and `taskCommentsTable` rows each, 1-2 `versionsTable` rows per shot/asset with 2-3 `annotationsTable` rows on one of them (so the Review page has something to display immediately), and a week of `dailyLogsTable` rows across a handful of tasks. Use the same idempotent-insert style already established in this script (per `forge-hardening-plan.md`'s note that the seed script already has an idempotent tenant-insert pattern — follow it for the new tables too, so re-running seed doesn't duplicate rows).

- [ ] **Step 3: Verify.** Run the seed script against the local dev database (`DATABASE_URL=postgres://postgres:postgres@localhost:5432/forge NODE_ENV=development pnpm --filter "@workspace/scripts" run seed`, or the Linux-container form if the host esbuild issue recurs). Expected: completes without error. Then browser-check `http://localhost/shots`, `/assets`, `/tasks`, `/review` all show real, non-empty, varied data.

- [ ] **Step 4: Commit**

```bash
git add scripts/src/seed.ts
git commit -m "feat(seed): generate realistic episodes/sequences/shots/assets/tasks/versions/annotations/daily-logs"
```

---

## Self-Review

**Spec coverage:** Section 2.1's schema list (episodes, sequences, enriched shots/assets/tasks, daily_logs, task-detail tables, reviews/annotations) → Tasks 1-6. Section 2.1's migration requirement → Task 7 (plus Task 11's follow-up migration for versions, which Section 2.1 named but this plan's Task 11 discovered needed its own enrichment not originally itemized — flagged inline in Task 11 rather than silently folded in). Section 2.2's route list → Tasks 8-14. Section 2.3's frontend rollout order (Shots → Assets → Versions/Reviews → Task enrichment → Daily logs) → Tasks 15-19, in that exact order. Section 2.4's seed data → Task 20. Section 2.5's verification approach (typecheck + manual curl/browser, no test suite) → every task's Verify step. The spec's RBAC note (read-visibility stays frontend, write-gating only where already sensitive) → explicitly stated in Global Constraints and in Task 9/10/14's route design (no `requireCapability` added, matching the existing `tasks`/`projects` precedent).

**Placeholder scan:** No task step says "add appropriate error handling" or similar — every route handler shown is the complete, real implementation. Task 15/16/18's frontend-wiring steps describe a transformation *rule* rather than reproducing entire multi-hundred-line page files verbatim, which is a deliberate scoping choice (matching this skill's own "Modify: file:line" pattern for existing-file changes) rather than a vague placeholder — each rule names the exact old API (store selector/method name) and exact new API (hook name/mutation signature) being substituted.

**Type consistency:** `ShotDTO`/`AssetDTO`/`VersionDTO`/`TaskDTO`/`DailyLogDTO`/`Annotation` field names are defined once (Tasks 15, 16, 17, 18, 19) and match the Drizzle schema column names from Tasks 2-6 exactly (camelCase in TypeScript, Drizzle's `text("snake_case_column")` mapping handled by the ORM as already established elsewhere in this codebase — no task introduces a naming mismatch between its own schema and route). `apiClient.put`/`apiClient.delete`, added once each in Tasks 15/17 respectively, are referenced by name consistently in every later task that needs them (16, 17, 18, 19).

**Post-execution correction (during Task 9):** an automated security review of Task 9's originally-committed `shots.ts` found a real HIGH-severity IDOR — POST/PUT accepted foreign-key ids (`projectId`/`episodeId`/`sequenceId`/`assigneeId`, etc.) straight from the request body with no check that they belong to the caller's own tenant, since a DB foreign key only verifies the referenced row exists, not who owns it — plus a MEDIUM missing-tenant-scope on a PUT's `UPDATE` statement. Both traced back to this plan's own Task 9 template, which had already been copied unmodified into the already-approved Task 8 (`episodes.ts`, `sequences.ts`). All three files were fixed and re-reviewed (see the plan's execution ledger). This section (Tasks 10, 11, 12, 14 — not yet dispatched at the time of the finding) was then corrected in place to include the same tenant-ownership-check pattern from the start: `assets.ts` (Task 10) mirrors `shots.ts`'s four checks; `versions.ts` (Task 11) gained a `taskInTenant` check on `taskId` plus a tenant-scoped PUT; `reviews.ts`/`annotations` (Task 12) gained a `versionInTenant` check on both the reviews and annotations POST handlers plus a tenant-scoped annotation DELETE; Task 14's task-enrichment POST/PUT gained an `assignedTo` → `userInTenant` check with a tenant-scoped PUT, and every nested sub-resource POST (checklist/comments/dependencies/attachments/approval-events) gained a `taskInTenant` check on the parent `:id` before writing (plus `dependsOnTaskId` → `taskInTenant` in the dependencies POST, and a tenant-scoped checklist-item PUT). Task 13 (`daily-logs.ts`) already validated `taskId` correctly in its original form and needed no change.
