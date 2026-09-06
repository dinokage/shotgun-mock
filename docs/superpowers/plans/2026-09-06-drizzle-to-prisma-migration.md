# Drizzle → Prisma Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Drizzle ORM with Prisma across the entire `@workspace/db` package and every consumer (17 route files, 2 lib files, 3 scripts), keeping the database schema byte-for-byte identical and the HTTP API's response shapes byte-for-byte identical, validated against a real-data staging clone before a single planned-downtime production cutover.

**Architecture:** A throwaway staging Postgres container (restored from a real production backup) is introspected with `prisma db pull` to produce `schema.prisma`, adopted via Prisma's baseline-migration flow (no DDL runs against real data), and `@workspace/db` swaps its Drizzle client for a generated Prisma Client while keeping the same package export shape. Every consumer file is converted mechanically (query syntax only — business logic, capability gates, and side effects are preserved verbatim) and verified with real HTTP requests through a locally-run `api` container pointed at the staging clone before the next task starts. Production is touched only in the final task.

**Tech Stack:** Prisma ORM + Prisma Client (Node.js/TypeScript), PostgreSQL 15, Express, Docker/docker-compose.

**Spec:** `docs/superpowers/specs/2026-09-06-drizzle-to-prisma-migration-design.md`

## Global Constraints

- **Prisma Client only** for all new query code — no raw SQL except where Prisma has no equivalent.
- **Schema is introspected, not hand-written.** `schema.prisma` is generated via `prisma db pull` against the staging clone, never hand-transcribed from the Drizzle schema files.
- **No production DDL.** The adoption path is Prisma's standard "adopting Prisma in an existing project" baseline: generate one baseline migration representing current state, mark it `--applied` without running it. This applies identically whether run against the staging clone or (later) production.
- **`pnpm run typecheck` must stay green** at the end of every task.
- **No test suite exists** — verification is `pnpm run typecheck` plus manual curl/browser checks against the staging clone (except the final cutover task, which verifies against production).
- **Verify over the real connection path.** Every "does this work" check connects the way the real system will: through the Docker network to the `api` container's exposed port, or through the actual HTTP API — never a local/Unix-socket shortcut that could silently bypass what's being tested (see the password-rotation incident in the spec's Context section — `docker exec psql` uses `trust` auth locally and proves nothing about network auth).
- **Preserve business logic verbatim.** When converting a route file's queries from Drizzle to Prisma syntax, the surrounding logic (capability checks, tenant-scoping `where` clauses, notification/audit side effects, the approval-stage gates in `tasks.ts`) must produce identical behavior. This is a mechanical query-syntax port, not a logic rewrite.
- **`.env`/`docker-compose.yml` secrets are untouched** by this migration except for whatever `DATABASE_URL` format Prisma expects (identical to Drizzle's — a standard Postgres connection string).
- **Prisma field names must stay camelCase, matching every existing JSON response field exactly.** `prisma db pull` does NOT auto-camelCase snake_case DB columns — introspection keeps them as literally `tenant_id`, `role_id`, etc. unless each field is explicitly renamed with `@map("actual_column_name")` in `schema.prisma`. Skipping this turns every API response into snake_case and breaks every frontend hook in `artifacts/forge/src/hooks/*.ts`, all of which expect camelCase (`tenantId`, `roleId`, ...). Task 1 produces the authoritative field-name mapping every later task's "Interfaces: Consumes" section relies on.

---

## Reference: authoritative table → Prisma model mapping (produced by Task 1, consumed by every later task)

This is the exact mapping from each Postgres table (and its snake_case columns) to the Prisma model name, accessor, and camelCase field names every route conversion must produce. Derived directly from the current Drizzle schema files (`lib/db/src/schema/*.ts`) — this is what Task 1's `schema.prisma` must match field-for-field.

| Table (DB) | Prisma model | Client accessor | Fields (camelCase field → `@map` snake_case column, only where they differ) |
|---|---|---|---|
| `tenants` | `Tenant` | `prisma.tenant` | `id, name, slug, stripeCustomerId→stripe_customer_id, logo, createdAt→created_at, deletedAt→deleted_at` |
| `platform_users` | `PlatformUser` | `prisma.platformUser` | `id, email, hashedPassword→hashed_password, createdAt→created_at` |
| `users` | `User` | `prisma.user` | `id, tenantId→tenant_id, roleId→role_id, departmentId→department_id, email, hashedPassword→hashed_password, name, title, avatar, status, punchedInAt→punched_in_at, createdAt→created_at, deletedAt→deleted_at` |
| `audit_logs` | `AuditLog` | `prisma.auditLog` | `id, tenantId→tenant_id, actorUserId→actor_user_id, action, targetEntityType→target_entity_type, targetEntityId→target_entity_id, metadata, createdAt→created_at` |
| `pending_invites` | `PendingInvite` | `prisma.pendingInvite` | `id, tenantId→tenant_id, email, roleId→role_id, departmentId→department_id, token, expiresAt→expires_at, createdAt→created_at` |
| `tenant_roles` | `TenantRole` | `prisma.tenantRole` | `id, tenantId→tenant_id, name, isSystemDefault→is_system_default` |
| `tenant_role_capabilities` | `TenantRoleCapability` | `prisma.tenantRoleCapability` | `roleId→role_id, capabilityId→capability_id` (composite PK on both) |
| `departments` | `Department` | `prisma.department` | `id, tenantId→tenant_id, name, abbr, pipeline, pipelineOrder→pipeline_order, color, icon, createdAt→created_at` |
| `client_access_links` | `ClientAccessLink` | `prisma.clientAccessLink` | `id, tenantId→tenant_id, code, projectId→project_id, episodeId→episode_id, versionId→version_id, createdByUserId→created_by_user_id, expiresAt→expires_at, revokedAt→revoked_at, createdAt→created_at` |
| `projects` | `Project` | `prisma.project` | `id, tenantId→tenant_id, name, code, type, client, status, startDate→start_date, endDate→end_date, createdAt→created_at, deletedAt→deleted_at` |
| `episodes` | `Episode` | `prisma.episode` | `id, tenantId→tenant_id, projectId→project_id, name, createdAt→created_at` |
| `sequences` | `Sequence` | `prisma.sequence` | `id, tenantId→tenant_id, projectId→project_id, episodeId→episode_id, name, createdAt→created_at` |
| `sequence_team_members` | `SequenceTeamMember` | `prisma.sequenceTeamMember` | `id, tenantId→tenant_id, sequenceId→sequence_id, userId→user_id, joinedAt→joined_at` |
| `assets` | `Asset` | `prisma.asset` | `id, tenantId→tenant_id, projectId→project_id, episodeId→episode_id, sequenceId→sequence_id, assigneeId→assignee_id, name, type, status, version, usdVersion→usd_version, tags, thumbnail, fileSize→file_size, polyCount→poly_count, dependencies, publishStatus→publish_status, description, notes, createdAt→created_at, updatedAt→updated_at, deletedAt→deleted_at` |
| `shots` | `Shot` | `prisma.shot` | `id, tenantId→tenant_id, projectId→project_id, episodeId→episode_id, sequenceId→sequence_id, assigneeId→assignee_id, name, status, frameRange→frame_range, duration, complexity, currentVersion→current_version, usdVersion→usd_version, internalReviewStatus→internal_review_status, clientReviewStatus→client_review_status, thumbnail, notes, createdAt→created_at, updatedAt→updated_at, deletedAt→deleted_at` |
| `tasks` | `Task` | `prisma.task` | `id, tenantId→tenant_id, entityId→entity_id, entityType→entity_type, title, description, assignedTo→assigned_to, status, priority, department, pipelinePhase→pipeline_phase, weeklyRating→weekly_rating, tags, estimatedHours→estimated_hours, actualHours→actual_hours, startDate→start_date, dueDate→due_date, lastStatusUpdate→last_status_update, createdAt→created_at` |
| `daily_logs` | `DailyLog` | `prisma.dailyLog` | `id, tenantId→tenant_id, taskId→task_id, userId→user_id, date, hours, note, createdAt→created_at` |
| `versions` | `Version` | `prisma.version` | `id, tenantId→tenant_id, entityId→entity_id, entityType→entity_type, versionNumber→version_number, taskId→task_id, mediaUrl→media_url, status, notes, thumbnail, derivedFromId→derived_from_id, fileSize→file_size, createdById→created_by_id, createdAt→created_at` |
| `task_checklist_items` | `TaskChecklistItem` | `prisma.taskChecklistItem` | `id, tenantId→tenant_id, taskId→task_id, text, done, position, createdAt→created_at` |
| `task_dependencies` | `TaskDependency` | `prisma.taskDependency` | `id, tenantId→tenant_id, taskId→task_id, dependsOnTaskId→depends_on_task_id, type, lagDays→lag_days, createdAt→created_at` |
| `task_comments` | `TaskComment` | `prisma.taskComment` | `id, tenantId→tenant_id, taskId→task_id, userId→user_id, text, createdAt→created_at` |
| `task_attachments` | `TaskAttachment` | `prisma.taskAttachment` | `id, tenantId→tenant_id, taskId→task_id, url, uploadedById→uploaded_by_id, createdAt→created_at` |
| `task_approval_events` | `TaskApprovalEvent` | `prisma.taskApprovalEvent` | `id, tenantId→tenant_id, taskId→task_id, action, byUserId→by_user_id, byRole→by_role, createdAt→created_at` |
| `reviews` | `Review` | `prisma.review` | `id, tenantId→tenant_id, entityId→entity_id, entityType→entity_type, versionId→version_id, reviewerId→reviewer_id, status, comments, frame, createdAt→created_at, updatedAt→updated_at` |
| `annotations` | `Annotation` | `prisma.annotation` | `id, tenantId→tenant_id, versionId→version_id, frame, type, color, x, y, w, h, points, text, startFrame→start_frame, endFrame→end_frame, fontFamily→font_family, fontSize→font_size, backgroundColor→background_color, createdById→created_by_id, createdAt→created_at` |
| `notifications` | `Notification` | `prisma.notification` | `id, tenantId→tenant_id, recipientUserId→recipient_user_id, category, title, description, entityType→entity_type, entityId→entity_id, actionUrl→action_url, read, createdAt→created_at` |

`id`/`name`/`title`/`status`/`type`/`action`/`text`/`code`/`color`/`frame`/`x`/`y`/`w`/`h`/`points`/`text`/`hours`/`date`/`note`/`tags`/`thumbnail`/`notes`/`description`/`priority`/`department`/`duration`/`complexity`/`version` need no `@map` — the column name already equals the camelCase field name.

---

### Task 1: Foundation — Prisma setup in `lib/db`

**Files:**
- Create: `lib/db/schema.prisma`
- Create: `lib/db/prisma/migrations/0000_baseline/migration.sql` (generated, not hand-written — see steps)
- Create: `lib/db/prisma/migrations/migration_lock.toml` (generated)
- Modify: `lib/db/src/index.ts`
- Modify: `lib/db/src/migrate.ts`
- Modify: `lib/db/package.json`
- Delete (at the end, once everything else is converted — NOT in this task): `lib/db/drizzle/`, `lib/db/drizzle.config.ts`, `lib/db/src/schema/*.ts` — these stay in place and in use until Task 10, since every not-yet-converted route file still imports from `@workspace/db/schema` (Drizzle). Task 1 adds Prisma alongside Drizzle; it does not remove Drizzle yet.
- Test: none (no test suite) — manual verification via steps below.

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working, network-reachable staging Postgres container (`forge-staging-db`, on network `forge-staging`) restored from a real backup; `lib/db/schema.prisma` (the authoritative schema, matching the Reference table above); a generated Prisma Client importable as `import { prisma } from "@workspace/db/prisma"`; every table/field mapping in the Reference table above, which every later task's Prisma queries must use exactly.

- [ ] **Step 1: Create the isolated staging network and clone the database**

Run from the repo root (`C:\Users\user\shotgun-mock\.claude\worktrees\rbac-login-core` or wherever this plan is being executed from):

```bash
docker network create forge-staging

docker run -d --name forge-staging-db \
  --network forge-staging \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=staging_only_password \
  -e POSTGRES_DB=forge \
  -p 5433:5432 \
  postgres:15-alpine

# Wait for it to accept connections
until docker exec forge-staging-db pg_isready -U postgres -d forge; do sleep 1; done
```

Find the most recent real backup (written by the live `db-backup` service to `./backups` relative to the repo root):

```bash
ls -t backups/forge-*.sql.gz | head -1
```

Restore it into the staging container — **not** the `restore.sh` script (that script is written to run inside the live `db` service via `docker compose exec` and prompts interactively; here we're restoring into a brand-new, empty, isolated container, so a plain `gunzip | psql` is simpler and equally safe since there's nothing on this container to destroy):

```bash
LATEST_BACKUP=$(ls -t backups/forge-*.sql.gz | head -1)
gunzip -c "$LATEST_BACKUP" | docker exec -i forge-staging-db psql -U postgres -d forge
```

- [ ] **Step 2: Verify the clone over the real connection path**

Do NOT verify with a bare `docker exec psql` alone (matches the incident this plan exists to avoid) — verify by actually querying real data:

```bash
docker exec forge-staging-db psql -U postgres -d forge -c "SELECT count(*) FROM tasks;"
docker exec forge-staging-db psql -U postgres -d forge -c "SELECT count(*) FROM users;"
```

Expected: non-zero counts matching the live tenant's real data (1065 tasks, ~65+ users at time of writing — exact numbers will differ as production changes, the point is "not zero, not an error").

- [ ] **Step 3: Add Prisma to the `@workspace/db` package**

```bash
cd lib/db
pnpm add prisma @prisma/client
pnpm add -D prisma
```

- [ ] **Step 4: Introspect the staging clone to generate `schema.prisma`**

```bash
cd lib/db
DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" npx prisma db pull --schema=./schema.prisma
```

This generates `lib/db/schema.prisma` with a `datasource`/`generator` block plus one `model` per table, using the DB's actual snake_case column names as field names and PascalCase-pluralized-guess model names.

- [ ] **Step 5: Rename every model and field to match the Reference table above**

Edit `lib/db/schema.prisma` by hand: rename each model to the exact name in the Reference table's "Prisma model" column (e.g. whatever `db pull` named the `tasks` table's model, rename it to `Task`), add `@@map("tasks")` (etc., using the real table name) to preserve the real table name, and for every field listed with a `→` in the Reference table, rename the field to the camelCase name and add `@map("original_column_name")`. Example — the `Task` model must end up looking like:

```prisma
model Task {
  id               String    @id
  tenantId         String    @map("tenant_id")
  entityId         String    @map("entity_id")
  entityType       String    @map("entity_type")
  title            String
  description      String
  assignedTo       String?   @map("assigned_to")
  status           String
  priority         String
  department       String?
  pipelinePhase    String?   @map("pipeline_phase")
  weeklyRating     String?   @map("weekly_rating")
  tags             Json
  estimatedHours   Int       @map("estimated_hours")
  actualHours      Int       @map("actual_hours")
  startDate        DateTime? @map("start_date")
  dueDate          DateTime? @map("due_date")
  lastStatusUpdate DateTime  @map("last_status_update")
  createdAt        DateTime  @default(now()) @map("created_at")

  @@map("tasks")
}
```

Apply the same pattern to all 25 other models per the Reference table. The generator/datasource block at the top of the file should read:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 6: Generate the Prisma Client and verify it compiles**

```bash
cd lib/db
npx prisma generate --schema=./schema.prisma
```

Expected: "Generated Prisma Client" with no errors. If it errors on a field/model name typo from Step 5, fix and re-run.

- [ ] **Step 7: Adopt Prisma's migration history without running any DDL**

```bash
cd lib/db
mkdir -p prisma/migrations/0000_baseline
DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" \
  npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel ./schema.prisma \
  --script > prisma/migrations/0000_baseline/migration.sql

DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" \
  npx prisma migrate resolve --applied 0000_baseline
```

The second command tells Prisma's migration tracker "this migration is already reflected in the database" without executing `migration.sql`'s `CREATE TABLE` statements against the (already-populated) staging clone. Verify:

```bash
docker exec forge-staging-db psql -U postgres -d forge -c "SELECT * FROM _prisma_migrations;"
```

Expected: one row for `0000_baseline` with a non-null `finished_at`.

- [ ] **Step 8: Replace `lib/db/src/index.ts`'s Drizzle export with a Prisma Client export, alongside the existing Drizzle export**

Both exports coexist during the migration — not-yet-converted route files still import Drizzle's `db`/table objects from `@workspace/db`, while newly-converted files import the new Prisma client. Modify `lib/db/src/index.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { PrismaClient } from "../generated/prisma-client"; // or wherever `prisma generate`'s output points, per schema.prisma's generator block

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export const prisma = new PrismaClient();

export * from "./schema";
```

Update `lib/db/package.json`'s `exports` field to also expose the Prisma client:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./prisma": "./src/index.ts"
  }
}
```

(Both `.` and `./prisma` resolve to the same file since `index.ts` now exports both `db` and `prisma` — this keeps every existing `import { db, xTable } from "@workspace/db"` working unchanged while giving converted files `import { prisma } from "@workspace/db"` too. A separate `./prisma` export path is optional convenience, not required — the simpler choice is to just have every converted file do `import { prisma } from "@workspace/db";`, so only add the extra export path if the reviewer prefers the separate import path for clarity.)

- [ ] **Step 9: Replace `lib/db/src/migrate.ts` with a Prisma-based wrapper**

```ts
import { execSync } from "child_process";
import path from "path";

console.log("Running migrations...");
try {
  execSync("npx prisma migrate deploy --schema=./schema.prisma", {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
  console.log("Migrations complete.");
  process.exit(0);
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
```

- [ ] **Step 10: Verify Step 9's wrapper against the staging clone**

```bash
cd lib/db
DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" npx tsx src/migrate.ts
```

Expected: "Running migrations..." then "Migrations complete." with exit code 0, and no schema changes (this is the already-applied baseline — `prisma migrate deploy` should report "No pending migrations to apply").

- [ ] **Step 11: `pnpm run typecheck` from the workspace root**

```bash
cd ../.. # back to repo root
pnpm run typecheck
```

Expected: green. Nothing has changed for any consumer file yet (they all still use Drizzle), so this should pass exactly as it did before this task.

- [ ] **Step 12: Commit**

```bash
git add lib/db/schema.prisma lib/db/prisma lib/db/src/index.ts lib/db/src/migrate.ts lib/db/package.json
git commit -m "feat: add Prisma alongside Drizzle in lib/db (foundation for migration)"
```

---

### Task 2: Simple CRUD group — `departments.ts`, `episodes.ts`, `sequences.ts`, `roles.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/departments.ts`
- Modify: `artifacts/api-server/src/routes/episodes.ts`
- Modify: `artifacts/api-server/src/routes/sequences.ts`
- Modify: `artifacts/api-server/src/routes/roles.ts`
- Test: none (no test suite) — manual verification via steps below.

**Interfaces:**
- Consumes: `prisma.department`, `prisma.episode`, `prisma.project` (for `projectInTenant` checks), `prisma.sequence`, `prisma.sequenceTeamMember`, `prisma.user`, `prisma.tenantRole` from Task 1's client, field names per the Reference table.
- Produces: nothing new consumed by later tasks (these are leaf resources).

- [ ] **Step 1: Convert `departments.ts`**

Replace the Drizzle import and both handlers:

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

const router = Router();
router.use(tenantAuthMiddleware);
const VALID_PIPELINES = ["PROD", "3D", "VFX", "2D"];

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const departments = await prisma.department.findMany({
      where: { tenantId },
    });
    return res.json(departments);
  } catch (err) {
    req.log.error(err, "Failed to fetch departments");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, abbr, pipeline, pipelineOrder, color, icon } = req.body;
    if (!name || !abbr || !pipeline)
      return res.status(400).json({ error: "name, abbr, and pipeline are required" });
    if (!VALID_PIPELINES.includes(pipeline))
      return res.status(400).json({
        error: `pipeline must be one of: ${VALID_PIPELINES.join(", ")}`,
      });

    const existing = await prisma.department.findFirst({
      where: { tenantId, abbr },
      select: { id: true },
    });
    if (existing)
      return res.status(409).json({ error: "A department with this abbreviation already exists" });

    const created = await prisma.department.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name,
        abbr,
        pipeline,
        pipelineOrder: pipelineOrder ?? 0,
        color: color || null,
        icon: icon || null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create department");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

- [ ] **Step 2: Convert `episodes.ts`**

`.select().from(x).where(and(eq(a,b)))` with a single condition becomes `.findFirst({where:{a:b}})`; `db.insert(x).values(v)` followed by a re-select becomes a single `.create({data: v})` (Prisma's `create` already returns the created row — no re-select needed, unlike Drizzle's pattern here of insert-then-select-back). Convert the whole file:

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

export const episodesRouter = Router();
episodesRouter.use(tenantAuthMiddleware);

episodesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const rows = await prisma.episode.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

episodesRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });
    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });

    const created = await prisma.episode.create({
      data: { id: crypto.randomUUID(), tenantId, projectId, name },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Convert `sequences.ts`**

Same patterns as episodes.ts for the top two routes (GET with two optional filters merged into one `where` object, POST with tenant-ownership checks then `.create`). The `.../team` sub-resource routes use a join (`innerJoin` in Drizzle) — Prisma's equivalent is a nested `select`/`include`. Convert `GET /:id/team` (the join) as the worked example; the other two team routes (`POST /:id/team`, `DELETE /:id/team/me`) follow the same tenant-ownership-check-then-mutate pattern already shown in episodes.ts/departments.ts above.

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const row = await prisma.episode.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function sequenceInTenant(id: string, tenantId: string) {
  const row = await prisma.sequence.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const sequencesRouter = Router();
sequencesRouter.use(tenantAuthMiddleware);

sequencesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId } = req.query;
    const rows = await prisma.sequence.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
        ...(typeof episodeId === "string" ? { episodeId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

sequencesRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });
    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId)))
      return res.status(400).json({ error: "Invalid episodeId" });

    const created = await prisma.sequence.create({
      data: { id: crypto.randomUUID(), tenantId, projectId, episodeId: episodeId || null, name },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:id/team -- the join. Drizzle's innerJoin + explicit column selection
// becomes a nested `select` that shapes the joined User fields inline, then
// the response is flattened to match the original flat DTO shape exactly
// (SequenceTeamMemberDTO has id/userId/joinedAt/name/avatar/departmentId as
// SIBLING fields, not a nested `user: {...}` object -- Prisma's `include`
// would nest it, so this must be manually flattened after the query).
sequencesRouter.get("/:id/team", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const sequenceId = req.params.id;
    if (!(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(404).json({ error: "Not found" });

    const rows = await prisma.sequenceTeamMember.findMany({
      where: { tenantId, sequenceId },
      select: {
        id: true,
        userId: true,
        joinedAt: true,
        user: { select: { name: true, avatar: true, departmentId: true } },
      },
    });
    const members = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      joinedAt: r.joinedAt,
      name: r.user.name,
      avatar: r.user.avatar,
      departmentId: r.user.departmentId,
    }));
    return res.json(members);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /:id/team -- onConflictDoNothing becomes Prisma's upsert with a
// no-op update, using the sequenceId+userId unique constraint from
// schema.prisma (the SequenceTeamMember model needs
// `@@unique([sequenceId, userId])` from introspection -- verify this
// carried over from the DB's real unique constraint in Task 1's pull).
sequencesRouter.post("/:id/team", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const sequenceId = req.params.id;
    if (!(await sequenceInTenant(sequenceId, tenantId)))
      return res.status(404).json({ error: "Not found" });

    const member = await prisma.sequenceTeamMember.upsert({
      where: { sequenceId_userId: { sequenceId, userId } },
      update: {},
      create: { id: crypto.randomUUID(), tenantId, sequenceId, userId },
    });
    return res.status(201).json(member);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

sequencesRouter.delete("/:id/team/me", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const sequenceId = req.params.id;

    await prisma.sequenceTeamMember.deleteMany({
      where: { tenantId, sequenceId, userId },
    });
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: Convert `roles.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

const router = Router();
router.use(tenantAuthMiddleware);

router.get("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const roles = await prisma.tenantRole.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    return res.json(roles);
  } catch (err) {
    req.log.error(err, "Failed to fetch roles");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

- [ ] **Step 5: `pnpm run typecheck` from the workspace root**

```bash
pnpm run typecheck
```

Fix any Prisma type errors (commonly: a field name typo vs. the Reference table, or a missing `@@unique` in `schema.prisma` needed for the `sequenceId_userId` upsert key — if that compound key name doesn't match, check what `prisma generate` actually named it in the generated client and adjust the `where` key name to match, or add an explicit `@@unique([sequenceId, userId], name: "sequenceId_userId")` in `schema.prisma` and re-run `prisma generate`).

- [ ] **Step 6: Build and run a throwaway `api` container against the staging clone, verify over the real connection path**

```bash
cd ../.. # repo root, if not already there
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .

docker run -d --name forge-api-staging-test \
  --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret \
  -e REDIS_URL="" \
  -e NODE_ENV=production \
  -p 3099:3001 \
  forge-api-staging-test

sleep 3
docker logs forge-api-staging-test --tail 30
```

Expected: "Running migrations...", "No pending migrations to apply" (or similar), then "Server listening". If Redis connection errors appear because `REDIS_URL` is empty, that's expected/harmless for this verification (caching degrades to always-miss, not a failure) — only investigate if the server fails to start.

Now hit the real endpoints with curl, exactly as a browser would, and compare against the frontend DTOs:

```bash
# Need a real session cookie -- log in as a real user from the restored staging data.
# (Use any real user's email from the staging clone; password is whatever it
# actually is in the real backup -- if unknown, query the staging DB for a
# roleId, create a throwaway user with a known password via prisma directly
# against the staging clone for testing purposes, e.g.:
docker exec forge-staging-db psql -U postgres -d forge -c \
  "SELECT id, email FROM users LIMIT 3;"
# then use routes/auth.ts's real login endpoint with a password you set,
# or if the real hash is unknown, insert a test user via psql with a known
# argon2 hash for local verification only -- this is the staging clone, not
# production, so this is safe.)

curl -s http://localhost:3099/api/departments -H "Cookie: session=$STAGING_TOKEN" | head -c 2000
```

Confirm the response is a JSON array where each object has exactly these fields, matching `DepartmentDTO` in `artifacts/forge/src/hooks/useDepartments.ts`: `id, tenantId, name, abbr, pipeline, pipelineOrder, color, icon, createdAt` — camelCase, not `tenant_id`/`pipeline_order`. Repeat for:

```bash
curl -s http://localhost:3099/api/episodes -H "Cookie: session=$STAGING_TOKEN" | head -c 2000
# Compare against EpisodeDTO in hooks/useEpisodes.ts: id, tenantId, projectId, name, createdAt

curl -s http://localhost:3099/api/sequences -H "Cookie: session=$STAGING_TOKEN" | head -c 2000
# Compare against SequenceDTO in hooks/useSequences.ts: id, tenantId, projectId, episodeId, name, createdAt

curl -s "http://localhost:3099/api/sequences/<a-real-sequence-id>/team" -H "Cookie: session=$STAGING_TOKEN"
# Compare against SequenceTeamMemberDTO in hooks/useSequences.ts: id, userId, joinedAt, name, avatar, departmentId
# (flat -- NOT nested under a "user" key)

curl -s http://localhost:3099/api/roles -H "Cookie: session=$STAGING_TOKEN_FOR_A_MANAGE_MEMBERS_HOLDER"
# GET /roles requires the manage_members capability -- log in as an admin/production_head
# from the staging clone to get this token, $STAGING_TOKEN above won't have it.
# Compare against TenantRoleDTO in hooks/useRoles.ts: id, name
```

- [ ] **Step 7: Tear down the throwaway test container (keep the staging DB running for the next task)**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/routes/departments.ts artifacts/api-server/src/routes/episodes.ts artifacts/api-server/src/routes/sequences.ts artifacts/api-server/src/routes/roles.ts
git commit -m "feat: convert departments/episodes/sequences/roles routes to Prisma"
```

---

### Task 3: Identity group — `users.ts`, `auth.ts`, `invites.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/users.ts`
- Modify: `artifacts/api-server/src/routes/auth.ts`
- Modify: `artifacts/api-server/src/routes/invites.ts`

**Interfaces:**
- Consumes: `prisma.user`, `prisma.tenantRole`, `prisma.tenantRoleCapability`, `prisma.department`, `prisma.tenant`, `prisma.pendingInvite` from Task 1.
- Produces: nothing new for later tasks (auth/session logic is self-contained).

- [ ] **Step 1: Convert `users.ts`**

The `isClient` conditional-where pattern (Drizzle builds one of two `and(...)` clauses based on a runtime boolean) becomes a plain conditional spread into Prisma's `where`. The `leftJoin` + explicit column selection for role name becomes a nested `select` on the `role` relation, then flattened (same flattening technique as Task 2's sequence-team route) since `UserDTO` has `role: string | null` as a sibling field, not nested. Convert the whole file:

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";

const STUDIO_LEADERSHIP_ROLES = ["admin", "production_head"];
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, verifyPassword } from "../lib/auth";
import { cacheDel, cacheKeys } from "../lib/cache";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";

const router = Router();
router.use(tenantAuthMiddleware);

// ... AVATAR_UPLOAD_DIR / AVATAR_MIME_EXT / avatarUpload multer config
// unchanged verbatim from the current file (no DB queries in it) ...

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;

    const callerRole = await prisma.tenantRole.findFirst({
      where: { id: req.roleId! },
      select: { name: true },
    });
    const isClient = callerRole?.name === "client";

    const rows = await prisma.user.findMany({
      where: {
        tenantId,
        ...(isClient ? { role: { name: { in: STUDIO_LEADERSHIP_ROLES } } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        roleId: true,
        role: { select: { name: true } },
        departmentId: true,
        email: true,
        name: true,
        title: true,
        avatar: true,
        status: true,
        punchedInAt: true,
        createdAt: true,
      },
    });
    const users = rows.map((u) => ({ ...u, role: u.role?.name ?? null }));
    return res.json(users);
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

This requires a `role` relation on the `User` model in `schema.prisma` (User.roleId → TenantRole.id). Verify Task 1's introspection produced this relation automatically (it should, since it's a real FK) — if the relation field is named something other than `role` (e.g. `tenant_roles` or `TenantRole`), rename it to `role` in `schema.prisma` and re-run `prisma generate` for this exact code to compile.

Continue converting the rest of the file mechanically:

```ts
router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, name, password, roleId, departmentId, title } = req.body;
    if (!email || !name || !password || !roleId)
      return res.status(400).json({ error: "Missing email, name, password, or roleId" });

    const role = await prisma.tenantRole.findFirst({ where: { id: roleId, tenantId } });
    if (!role) return res.status(400).json({ error: "Invalid roleId" });

    if (departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: departmentId, tenantId } });
      if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const hashedPassword = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        roleId,
        departmentId: departmentId ?? null,
        email,
        name,
        title,
        hashedPassword,
      },
    });
    const { hashedPassword: _omit, ...user } = newUser;
    return res.status(201).json(user);
  } catch (err) {
    req.log.error(err, "Failed to create user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/me", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, title, avatar } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (title !== undefined) data.title = title;
    if (avatar !== undefined) data.avatar = avatar;
    if (Object.keys(data).length === 0)
      return res.status(400).json({ error: "No valid fields to update" });

    const result = await prisma.user.updateMany({ where: { id: userId, tenantId }, data });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

    await cacheDel(cacheKeys.userMe(tenantId, userId));
    const { hashedPassword: _omit, ...user } = updated;
    return res.json(user);
  } catch (err) {
    req.log.error(err, "Failed to update profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

Note the `updateMany` + re-fetch pattern above: Prisma's `update` (singular) throws if the `where` doesn't match a unique constraint with certainty of existence, and Drizzle's original code updated by `id` AND `tenantId` together (a compound, non-unique-by-itself condition from Prisma's point of view since `id` alone is the real unique key but the tenant check must still gate it). Using `updateMany` with the same compound `where`, checking `.count`, then re-fetching by `id` alone (already proven to belong to this tenant by the successful update) is the correct verbatim-behavior-preserving translation — do NOT switch to `prisma.user.update({where:{id: userId}})` alone, since that would drop the tenant-ownership check entirely (a real security regression, not just a syntax change). Apply this exact `updateMany`-then-refetch pattern to every other route in this file that has the same "update filtered by id AND tenantId" shape: `POST /me/punch-in`, `POST /me/punch-out`, `POST /me/avatar`, `PATCH /:id`. For `PATCH /:id`, additionally preserve the two nested validation blocks (roleId ownership check, departmentId ownership check) unchanged — only the query calls change to Prisma syntax, using the same `findFirst`-with-tenant-check pattern already shown above for `POST /`.

`PUT /me/password` uses `verifyPassword`/`hashPassword` (unrelated to the ORM) — only its two `prisma.user` calls (`findFirst` for lookup, `updateMany` for the write) need converting, following the same patterns above.

- [ ] **Step 2: Convert `auth.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { verifyPassword, signSession, verifySession } from "../lib/auth";
import { createNotification, findProductionManagers } from "./notifications";
import { cacheGet, cacheSet, cacheKeys } from "../lib/cache";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing email or password" });

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = await verifyPassword(password, user.hashedPassword);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    const tenant = await prisma.tenant.findFirst({ where: { id: user.tenantId } });
    const role = await prisma.tenantRole.findFirst({ where: { id: user.roleId } });
    const roleCaps = await prisma.tenantRoleCapability.findMany({
      where: { roleId: user.roleId },
    });
    const capabilities = roleCaps.map((c) => c.capabilityId);

    const sessionPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      departmentId: user.departmentId,
    };
    const token = signSession(sessionPayload);
    res.cookie("session", token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    if (role?.name !== "production_head") {
      (async () => {
        try {
          const dept = user.departmentId
            ? await prisma.department.findFirst({ where: { id: user.departmentId } })
            : null;
          const recipients = await findProductionManagers(user.tenantId, dept?.name);
          for (const recipient of recipients) {
            await createNotification({
              tenantId: user.tenantId,
              recipientUserId: recipient.id,
              category: "system",
              title: `${user.name} logged in`,
              description: `${user.name} (${role?.name || "member"}${dept ? `, ${dept.name}` : ""}) just signed in.`,
              entityType: "user",
              entityId: user.id,
            });
          }
        } catch (err) {
          req.log.error(err, "Failed to send login notification");
        }
      })();
    }

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        role: role?.name || "admin",
        departmentId: user.departmentId,
        capabilities,
        punchedInAt: user.punchedInAt,
      },
      tenant: { id: tenant!.id, name: tenant!.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("session");
  return res.status(200).json({ message: "Logged out" });
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const session = verifySession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  if (!session.userId) return res.status(401).json({ error: "Invalid session" });

  const cacheKey = cacheKeys.userMe(session.tenantId, session.userId);
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return res.status(200).json(cached);

  const user = await prisma.user.findFirst({ where: { id: session.userId } });
  if (!user) return res.status(401).json({ error: "User deleted" });

  const tenant = await prisma.tenant.findFirst({ where: { id: session.tenantId } });
  const role = await prisma.tenantRole.findFirst({ where: { id: session.roleId } });
  const roleCaps = await prisma.tenantRoleCapability.findMany({
    where: { roleId: session.roleId },
  });
  const capabilities = roleCaps.map((c) => c.capabilityId);

  const payload = {
    user: {
      id: user.id,
      name: user.name,
      role: role?.name || "admin",
      departmentId: user.departmentId,
      capabilities,
      punchedInAt: user.punchedInAt,
    },
    tenant: { id: tenant?.id ?? "", name: tenant?.name || "" },
  };
  await cacheSet(cacheKey, payload, 15);
  return res.status(200).json(payload);
});
```

- [ ] **Step 3: Convert `invites.ts`**

Same patterns as above (tenant-scoped `findFirst`, `create`, plus one `gt(expiresAt, new Date())` filter, which becomes Prisma's `{ expiresAt: { gt: new Date() } }`, and one `delete` becomes `deleteMany`):

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { hashPassword, signSession } from "../lib/auth";
import { sendInviteEmail } from "../lib/mailer";

export const invitesRouter = Router();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

invitesRouter.post("/", tenantAuthMiddleware, requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, roleId, departmentId } = req.body;
    if (!email || typeof email !== "string" || !roleId)
      return res.status(400).json({ error: "email and roleId are required" });

    const role = await prisma.tenantRole.findFirst({
      where: { id: roleId, tenantId },
      select: { id: true, name: true },
    });
    if (!role) return res.status(400).json({ error: "Invalid roleId" });

    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { id: true },
      });
      if (!dept) return res.status(400).json({ error: "Invalid departmentId" });
    }

    const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existingUser) return res.status(409).json({ error: "A user with this email already exists" });

    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.pendingInvite.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        email,
        roleId,
        departmentId: departmentId ?? null,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost";
    const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;
    await sendInviteEmail({ to: email, inviteUrl, roleName: role.name, tenantName: tenant?.name ?? "Forge" });

    return res.status(201).json({ email, roleId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  } catch (err) {
    req.log.error(err, "Failed to create invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});

invitesRouter.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.pendingInvite.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
      select: { email: true, tenantId: true, roleId: true, expiresAt: true },
    });
    if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

    const role = await prisma.tenantRole.findFirst({ where: { id: invite.roleId }, select: { name: true } });
    const tenant = await prisma.tenant.findFirst({ where: { id: invite.tenantId }, select: { name: true } });

    return res.json({ email: invite.email, roleName: role?.name ?? "member", tenantName: tenant?.name ?? "Forge" });
  } catch (err) {
    req.log.error(err, "Failed to look up invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});

invitesRouter.post("/:token/accept", async (req, res) => {
  try {
    const { token } = req.params;
    const { name, password } = req.body;
    if (!name || !password || typeof password !== "string" || password.length < 8)
      return res.status(400).json({ error: "name and a password (min 8 chars) are required" });

    const invite = await prisma.pendingInvite.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
    });
    if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: invite.tenantId,
        roleId: invite.roleId,
        departmentId: invite.departmentId,
        email: invite.email,
        hashedPassword,
        name,
        status: "active",
      },
    });
    await prisma.pendingInvite.deleteMany({ where: { id: invite.id } });

    const sessionToken = signSession({
      userId, tenantId: invite.tenantId, roleId: invite.roleId, departmentId: invite.departmentId,
    });
    res.cookie("session", sessionToken, {
      httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({ id: userId, email: invite.email, name });
  } catch (err) {
    req.log.error(err, "Failed to accept invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: `pnpm run typecheck` from the workspace root**

- [ ] **Step 5: Rebuild the staging test container and verify over the real connection path**

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3

# Full real login flow -- this is the most important check in this task,
# since auth.ts's login is the entry point for every other verification step
# in this plan going forward.
curl -s -c staging_cookies.txt -X POST http://localhost:3099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real user email from the staging clone>","password":"<its real password, or a test password you set directly in the staging clone via psql for this purpose>"}'
```

Confirm the response matches exactly: `{"user":{"id","name","role","departmentId","capabilities":[...],"punchedInAt"},"tenant":{"id","name"}}` — compare field-for-field against `store/auth.ts`'s expected login response shape (search that file for how it destructures the login response) and against `routes/auth.ts`'s own JSON literal above (which is unchanged from before — the fields it returns were never table-column-shaped in the first place, so no `@map` mismatch is possible here, but the QUERY that produces `user`/`role`/`tenant` must still resolve correctly).

```bash
curl -s -b staging_cookies.txt http://localhost:3099/api/auth/me
# Same shape as login's response.

curl -s -b staging_cookies.txt http://localhost:3099/api/users | head -c 2000
# Compare against UserDTO in hooks/useUsers.ts: id, tenantId, roleId, role,
# departmentId, email, name, title, avatar, status, punchedInAt, createdAt
# -- "role" must be the STRING role name (e.g. "artist"), not an object.
```

- [ ] **Step 6: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/users.ts artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/invites.ts
git commit -m "feat: convert users/auth/invites routes to Prisma"
```

---

### Task 4: Production-entity group — `assets.ts`, `shots.ts`, `versions.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/assets.ts`
- Modify: `artifacts/api-server/src/routes/shots.ts`
- Modify: `artifacts/api-server/src/routes/versions.ts`

**Interfaces:**
- Consumes: `prisma.asset`, `prisma.shot`, `prisma.version`, `prisma.project`, `prisma.episode`, `prisma.sequence`, `prisma.user`, `prisma.task` (for `versions.ts`'s `taskInTenant`) from Task 1. `recordAuditLog` from `lib/auditLog.ts` is consumed unchanged (Task 8 converts its internals; its signature doesn't change).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Convert `assets.ts`**

The four `xInTenant` helpers all follow the exact `findFirst`-with-tenant-check pattern from Task 2/3 — convert them identically. The PATCH-style `PUT /:id` handler's whitelisted-fields loop is unchanged (plain JS, no Drizzle involved) — only the three query calls (existing-row lookup, update, re-fetch) change:

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { recordAuditLog } from "../lib/auditLog";
import * as crypto from "crypto";

async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function episodeInTenant(id: string, tenantId: string) {
  const row = await prisma.episode.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function sequenceInTenant(id: string, tenantId: string) {
  const row = await prisma.sequence.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}
async function userInTenant(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const assetsRouter = Router();
assetsRouter.use(tenantAuthMiddleware);

assetsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    const rows = await prisma.asset.findMany({
      where: { tenantId, ...(typeof projectId === "string" ? { projectId } : {}) },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

assetsRouter.post("/", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name, type, episodeId, sequenceId, assigneeId } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "Missing projectId or name" });
    if (!(await projectInTenant(projectId, tenantId))) return res.status(400).json({ error: "Invalid projectId" });
    if (episodeId && !(await episodeInTenant(episodeId, tenantId))) return res.status(400).json({ error: "Invalid episodeId" });
    if (sequenceId && !(await sequenceInTenant(sequenceId, tenantId))) return res.status(400).json({ error: "Invalid sequenceId" });
    if (assigneeId && !(await userInTenant(assigneeId, tenantId))) return res.status(400).json({ error: "Invalid assigneeId" });

    const created = await prisma.asset.create({
      data: {
        id: crypto.randomUUID(), tenantId, projectId, name,
        type: type || "Prop", episodeId: episodeId || null, sequenceId: sequenceId || null, assigneeId: assigneeId || null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = [
  "name", "type", "status", "assigneeId", "version", "usdVersion", "tags",
  "thumbnail", "fileSize", "polyCount", "dependencies", "publishStatus", "description", "notes",
] as const;

assetsRouter.put("/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const assetId = req.params.id as string;

    const existing = await prisma.asset.findFirst({ where: { tenantId, id: assetId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    if ("assigneeId" in req.body && req.body.assigneeId && !(await userInTenant(req.body.assigneeId, tenantId)))
      return res.status(400).json({ error: "Invalid assigneeId" });

    const updates: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) {
        updates[field] = req.body[field];
        before[field] = (existing as Record<string, unknown>)[field];
      }
    }
    updates.updatedAt = new Date();

    await prisma.asset.updateMany({ where: { tenantId, id: assetId }, data: updates });
    const updated = await prisma.asset.findFirstOrThrow({ where: { tenantId, id: assetId } });

    if (Object.keys(before).length > 0) {
      recordAuditLog({
        tenantId, actorUserId: req.userId!, action: "update",
        targetEntityType: "asset", targetEntityId: assetId, before, after: updates,
      }).catch((err) => req.log.error(err, "audit log write failed"));
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Convert `shots.ts`**

Identical structure/patterns to `assets.ts` above — same four `xInTenant` helpers, same GET/POST/PUT shape, different table (`prisma.shot`) and field list (`PATCHABLE_FIELDS` per the current file: `name, status, assigneeId, frameRange, duration, complexity, currentVersion, usdVersion, internalReviewStatus, clientReviewStatus, thumbnail, notes`) and `targetEntityType: "shot"`. Apply the exact same conversion mechanically.

- [ ] **Step 3: Convert `versions.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const versionsRouter = Router();
versionsRouter.use(tenantAuthMiddleware);

versionsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType } = req.query;
    const rows = await prisma.version.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { entityId } : {}),
        ...(typeof entityType === "string" ? { entityType } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

versionsRouter.post("/", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionNumber, mediaUrl, taskId } = req.body;
    if (!entityId || !entityType) return res.status(400).json({ error: "Missing entityId or entityType" });
    if (taskId && !(await taskInTenant(taskId, tenantId))) return res.status(400).json({ error: "Invalid taskId" });

    const created = await prisma.version.create({
      data: {
        id: crypto.randomUUID(), tenantId, entityId, entityType,
        versionNumber: versionNumber || "v001", mediaUrl: mediaUrl || "",
        taskId: taskId || null, createdById: userId,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["status", "notes", "thumbnail", "mediaUrl"] as const;

versionsRouter.put("/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const versionId = req.params.id as string;

    const existing = await prisma.version.findFirst({ where: { tenantId, id: versionId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    await prisma.version.updateMany({ where: { tenantId, id: versionId }, data: updates });
    const updated = await prisma.version.findFirstOrThrow({ where: { tenantId, id: versionId } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: `pnpm run typecheck` from the workspace root**

- [ ] **Step 5: Rebuild the staging test container and verify over the real connection path**

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3

curl -s -c staging_cookies.txt -X POST http://localhost:3099/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'

curl -s -b staging_cookies.txt http://localhost:3099/api/assets | head -c 2000
# Compare against AssetDTO in hooks/useAssets.ts: id, tenantId, projectId,
# episodeId, sequenceId, assigneeId, name, type, status, version, usdVersion,
# tags, thumbnail, fileSize, polyCount, dependencies, publishStatus,
# description, notes, createdAt, updatedAt

curl -s -b staging_cookies.txt http://localhost:3099/api/shots | head -c 2000
# Compare against ShotDTO in hooks/useShots.ts: id, tenantId, projectId,
# episodeId, sequenceId, assigneeId, name, status, frameRange, duration,
# complexity, currentVersion, usdVersion, internalReviewStatus,
# clientReviewStatus, thumbnail, notes, createdAt, updatedAt

curl -s -b staging_cookies.txt http://localhost:3099/api/versions | head -c 2000
# Compare against VersionDTO in hooks/useVersions.ts: id, tenantId, entityId,
# entityType, versionNumber, taskId, mediaUrl, status, notes, thumbnail,
# derivedFromId, fileSize, createdById, createdAt
```

- [ ] **Step 6: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/assets.ts artifacts/api-server/src/routes/shots.ts artifacts/api-server/src/routes/versions.ts
git commit -m "feat: convert assets/shots/versions routes to Prisma"
```

---

### Task 5: Tasks — `tasks.ts` (+ sub-resources + approval-stage gates) and `daily-logs.ts`

This is the largest and highest-stakes file: it carries the approval-stage security gates added earlier this session (`canApproveAsDeptLead`, `canApproveAsProdManager`) and the sequence-completion auto-reassignment trigger. Every helper function's *logic* must survive unchanged — only its Prisma calls change.

**Files:**
- Modify: `artifacts/api-server/src/routes/tasks.ts`
- Modify: `artifacts/api-server/src/routes/daily-logs.ts`

**Interfaces:**
- Consumes: `prisma.task`, `prisma.user`, `prisma.tenantRole`, `prisma.tenantRoleCapability`, `prisma.taskChecklistItem`, `prisma.taskDependency`, `prisma.taskComment`, `prisma.taskAttachment`, `prisma.taskApprovalEvent`, `prisma.department`, `prisma.dailyLog` from Task 1. `createNotification`/`findProductionManagers` from `notifications.ts` (Task 7 converts their internals; this task's calls to them are unchanged). `maybeReassignOnSequenceCompletion` from `lib/sequenceReassignment.ts` (Task 8 converts its internals; this task's call to it is unchanged).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Convert the module-level helper functions**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";
import { createNotification, findProductionManagers } from "./notifications";
import { cacheGet, cacheSet, cacheDel, cacheKeys } from "../lib/cache";
import { maybeReassignOnSequenceCompletion } from "../lib/sequenceReassignment";

async function userInTenant(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

async function assignedToIsArtist(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { role: { select: { name: true } } },
  });
  return row?.role?.name === "artist";
}

async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

const DEPARTMENT_LEADERSHIP_ROLE_NAMES = ["lead", "producer"];

async function canApproveAsDeptLead(
  tenantId: string,
  actorUserId: string,
  actorRoleId: string,
  taskDepartmentName: string | null,
): Promise<boolean> {
  const grant = await prisma.tenantRoleCapability.findFirst({
    where: { roleId: actorRoleId, capabilityId: "approve_reviews" },
  });
  if (!grant) return false;

  const actorRole = await prisma.tenantRole.findFirst({
    where: { id: actorRoleId, tenantId },
    select: { name: true },
  });
  if (!actorRole || !DEPARTMENT_LEADERSHIP_ROLE_NAMES.includes(actorRole.name)) return false;
  if (!taskDepartmentName) return false;

  const actor = await prisma.user.findFirst({ where: { id: actorUserId, tenantId }, select: { departmentId: true } });
  const dept = await prisma.department.findFirst({ where: { tenantId, name: taskDepartmentName }, select: { id: true } });
  return !!actor?.departmentId && !!dept?.id && actor.departmentId === dept.id;
}

async function canApproveAsProdManager(
  tenantId: string,
  actorUserId: string,
  actorRoleId: string,
  taskDepartmentName: string | null,
): Promise<boolean> {
  const actorRole = await prisma.tenantRole.findFirst({ where: { id: actorRoleId, tenantId }, select: { name: true } });
  if (!actorRole || actorRole.name !== "production_head") return false;

  const productionHeads = await prisma.user.findMany({
    where: { tenantId, role: { name: "production_head" } },
    select: { id: true, departmentId: true },
  });
  if (productionHeads.length === 0) return false;

  let dept: { id: string } | null = null;
  if (taskDepartmentName) {
    dept = await prisma.department.findFirst({ where: { tenantId, name: taskDepartmentName }, select: { id: true } });
  }
  const ownDeptPMs = dept ? productionHeads.filter((u) => u.departmentId === dept!.id) : [];
  if (ownDeptPMs.length > 0) return ownDeptPMs.some((u) => u.id === actorUserId);

  const mainDept = await prisma.department.findFirst({ where: { tenantId, name: "Production Management" }, select: { id: true } });
  const mainPMs = mainDept ? productionHeads.filter((u) => u.departmentId === mainDept.id) : [];
  if (mainPMs.length > 0) return mainPMs.some((u) => u.id === actorUserId);

  return productionHeads.some((u) => u.id === actorUserId);
}

async function roleNameForCaller(roleId: string, tenantId: string) {
  const row = await prisma.tenantRole.findFirst({ where: { id: roleId, tenantId }, select: { name: true } });
  return row?.name;
}

const APPROVAL_EVENT_ACTIONS = [
  "submitted-for-lead-review", "submitted-for-manager-review", "approved",
  "changes-requested", "rejected", "published",
] as const;
```

`assignedToIsArtist`'s Drizzle version does an `innerJoin` and returns `row?.roleName` — the Prisma version above uses a nested `select` on the `role` relation instead (same relation used in Task 3's `users.ts` conversion), returning `row?.role?.name`. This is the one helper whose access path changes shape (`.roleName` → `.role?.name`); every other helper's logic is a 1:1 mechanical port.

- [ ] **Step 2: Convert `GET /` and `POST /`**

```ts
export const tasksRouter = Router();
tasksRouter.use(tenantAuthMiddleware);

tasksRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const cacheKey = cacheKeys.tasksList(tenantId);
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) return res.json(cached);

    const tasksList = await prisma.task.findMany({ where: { tenantId } });
    await cacheSet(cacheKey, tasksList, 10);
    return res.json(tasksList);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const {
      entityId, entityType, status, title, description, priority,
      department, pipelinePhase, startDate, dueDate, estimatedHours, assignedTo,
    } = req.body;
    if (!entityId || !entityType) return res.status(400).json({ error: "Missing entityId or entityType" });
    if (assignedTo && !(await userInTenant(assignedTo, tenantId))) return res.status(400).json({ error: "Invalid assignedTo" });
    if (assignedTo && !(await assignedToIsArtist(assignedTo, tenantId))) return res.status(400).json({ error: "assignedTo must be an artist" });

    const created = await prisma.task.create({
      data: {
        id: crypto.randomUUID(), tenantId, entityId, entityType,
        status: status || "not-started", title: title || "", description: description || "",
        priority: priority || "medium", department: department || null, pipelinePhase: pipelinePhase || null,
        startDate: startDate ? new Date(startDate) : null, dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: estimatedHours || 0, assignedTo: assignedTo || null,
      },
    });
    await cacheDel(cacheKeys.tasksList(tenantId));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Convert `PUT /:id` — the approval-gated status-transition route**

Every line of the authorization/business logic (the `onlyClaimingSelf` check, the capability grant lookup, the `assignedTo` validation, the `pm-review`/`approved` transition gates) is unchanged — only the four `db.select`/`db.update` calls become Prisma calls:

```ts
const TASK_PATCHABLE_FIELDS = [
  "status", "title", "description", "priority", "department", "pipelinePhase",
  "weeklyRating", "tags", "estimatedHours", "actualHours", "assignedTo", "startDate", "dueDate",
] as const;

tasksRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const taskId = req.params.id;

    const existing = await prisma.task.findFirst({ where: { tenantId, id: taskId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const bodyKeys = Object.keys(req.body);
    const onlyClaimingSelf =
      bodyKeys.length === 1 && bodyKeys[0] === "assignedTo" &&
      existing.assignedTo === null && req.body.assignedTo === req.userId;

    if (!onlyClaimingSelf) {
      const requiredCapability = "assignedTo" in req.body ? "assign_tasks" : "edit_tasks";
      const grant = await prisma.tenantRoleCapability.findFirst({
        where: { roleId: req.roleId!, capabilityId: requiredCapability },
      });
      if (!grant) return res.status(403).json({ error: "Forbidden: Missing capability" });
    }

    if ("assignedTo" in req.body && req.body.assignedTo && !(await userInTenant(req.body.assignedTo, tenantId)))
      return res.status(400).json({ error: "Invalid assignedTo" });
    if ("assignedTo" in req.body && req.body.assignedTo && !(await assignedToIsArtist(req.body.assignedTo, tenantId)))
      return res.status(400).json({ error: "assignedTo must be an artist" });

    const updates: Record<string, unknown> = {};
    for (const field of TASK_PATCHABLE_FIELDS) {
      if (!(field in req.body)) continue;
      if (field === "startDate" || field === "dueDate") {
        updates[field] = req.body[field] ? new Date(req.body[field]) : null;
      } else {
        updates[field] = req.body[field];
      }
    }
    updates.lastStatusUpdate = new Date();

    if (updates.status === "pm-review") {
      if (!(await canApproveAsDeptLead(tenantId, req.userId!, req.roleId!, existing.department)))
        return res.status(403).json({ error: "Forbidden: only the assigned department's Lead/Producer can advance this task to Production Manager review" });
    } else if (updates.status === "approved") {
      if (!(await canApproveAsProdManager(tenantId, req.userId!, req.roleId!, existing.department)))
        return res.status(403).json({ error: "Forbidden: only the eligible Production Manager can approve this task" });
    }

    await prisma.task.updateMany({ where: { tenantId, id: taskId }, data: updates });
    const updated = await prisma.task.findFirstOrThrow({ where: { tenantId, id: taskId } });
    await cacheDel(cacheKeys.tasksList(tenantId));

    if (updates.status === "approved") {
      maybeReassignOnSequenceCompletion(taskId, tenantId).catch((err) =>
        req.log.error(err, "Sequence auto-reassignment check failed"),
      );
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: Convert the checklist/comments/dependencies/attachments sub-resource routes**

All eight routes (`GET`/`POST /:id/checklist`, `PUT /:id/checklist/:itemId`, `GET`/`POST /:id/comments`, `GET`/`POST /:id/dependencies`, `GET`/`POST /:id/attachments`) follow the exact `findMany`-then-`create` pattern already demonstrated in Tasks 2–4 (tenant+parent-id filter on GET, `taskInTenant` check + `create` on POST). Convert each using `prisma.taskChecklistItem`, `prisma.taskComment`, `prisma.taskDependency`, `prisma.taskAttachment` respectively, with the same field names as the current Drizzle code (no renames needed within this file — the tenant/task-id/text/done/position/dependsOnTaskId/type/lagDays/url/uploadedById fields are all already camelCase per the Reference table).

- [ ] **Step 5: Convert the approval-events sub-resource routes**

```ts
tasksRouter.get("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskApprovalEvent.findMany({
      where: { tenantId, taskId: req.params.id },
    });
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

    const approvalTask = await prisma.task.findFirst({
      where: { tenantId, id: req.params.id },
      select: { department: true },
    });
    if (!approvalTask) return res.status(404).json({ error: "Not found" });

    if (action === "submitted-for-manager-review") {
      if (!(await canApproveAsDeptLead(tenantId, userId, roleId, approvalTask.department)))
        return res.status(403).json({ error: "Forbidden: missing lead-approval authority" });
    } else if (action === "approved" || action === "published") {
      if (!(await canApproveAsProdManager(tenantId, userId, roleId, approvalTask.department)))
        return res.status(403).json({ error: "Forbidden: missing production-manager approval authority" });
    }

    const byRole = await roleNameForCaller(roleId, tenantId);
    if (!byRole) return res.status(400).json({ error: "Invalid role" });

    const created = await prisma.taskApprovalEvent.create({
      data: { id: crypto.randomUUID(), tenantId, taskId: req.params.id, action, byUserId: userId, byRole },
    });

    (async () => {
      try {
        const task = await prisma.task.findFirst({ where: { tenantId, id: req.params.id } });
        if (!task) return;
        const actor = await prisma.user.findFirst({ where: { id: userId }, select: { name: true } });
        const actorName = actor?.name || "Someone";

        const notify = (recipientUserId: string, title: string, description: string) =>
          createNotification({
            tenantId, recipientUserId,
            category: action === "rejected" || action === "changes-requested" ? "workflow" : "review",
            title, description, entityType: "task", entityId: task.id, actionUrl: `/review/${task.id}`,
          });

        if (action === "submitted-for-lead-review") {
          const leads = await prisma.user.findMany({
            where: { tenantId, department: { name: task.department || "" } },
            select: { id: true },
          });
          for (const l of leads) {
            await notify(l.id, `"${task.title}" is awaiting your review`, `${actorName} submitted "${task.title}" for Lead review.`);
          }
        } else if (action === "submitted-for-manager-review") {
          const pms = await findProductionManagers(tenantId, task.department);
          for (const pm of pms) {
            await notify(pm.id, `"${task.title}" needs final sign-off`, `${actorName} approved "${task.title}" — awaiting Production Manager sign-off.`);
          }
        } else if ((action === "published" || action === "rejected" || action === "changes-requested") && task.assignedTo) {
          await notify(
            task.assignedTo,
            action === "published" ? `"${task.title}" was approved` : `"${task.title}" needs changes`,
            `${actorName} ${action === "published" ? "approved and published" : action === "rejected" ? "rejected" : "requested changes on"} "${task.title}".`,
          );
        }
      } catch (err) {
        req.log.error(err, "Failed to send approval-event notification");
      }
    })();

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

Note the `leads` query: Drizzle's version does `innerJoin(tenantRolesTable, ...)` AND `innerJoin(departmentsTable, ...)` — but neither role name filtering nor a real "is this person a lead" check actually appears in that specific query's `where` clause in the current code (it filters only by `tenantId` and `department.name`, matching every user in that department regardless of role — this looks like a pre-existing minor imprecision in the current Drizzle code, not something to silently "fix" during this migration per the Global Constraint to preserve behavior verbatim). The Prisma conversion above reproduces that exact same behavior (filters by `department.name` only) — do not add a role filter that wasn't in the original query, even if it looks like it should be there. This requires a `department` relation on the `User` model (`User.departmentId` → `Department.id`) in `schema.prisma`, alongside the `role` relation from Task 3 — verify Task 1's introspection produced both relations.

- [ ] **Step 6: Convert `daily-logs.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import * as crypto from "crypto";

export const dailyLogsRouter = Router();
dailyLogsRouter.use(tenantAuthMiddleware);

dailyLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { taskId, userId } = req.query;
    const rows = await prisma.dailyLog.findMany({
      where: {
        tenantId,
        ...(typeof taskId === "string" ? { taskId } : {}),
        ...(typeof userId === "string" ? { userId } : {}),
      },
    });
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

    const task = await prisma.task.findFirst({ where: { tenantId, id: taskId } });
    if (!task) return res.status(400).json({ error: "Invalid taskId" });

    const created = await prisma.dailyLog.create({
      data: { id: crypto.randomUUID(), tenantId, taskId, userId, date, hours, note: note || "" },
    });

    await prisma.task.updateMany({
      where: { tenantId, id: taskId },
      data: { actualHours: task.actualHours + hours },
    });

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PATCHABLE_FIELDS = ["date", "hours", "note"] as const;

dailyLogsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const logId = req.params.id as string;

    const existing = await prisma.dailyLog.findFirst({ where: { tenantId, id: logId } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== req.userId) return res.status(403).json({ error: "Forbidden: not your log entry" });

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if (typeof updates.hours === "number" && updates.hours !== existing.hours) {
      const delta = updates.hours - existing.hours;
      const task = await prisma.task.findFirst({ where: { tenantId, id: existing.taskId } });
      if (task) {
        await prisma.task.updateMany({ where: { tenantId, id: existing.taskId }, data: { actualHours: task.actualHours + delta } });
      }
    }

    await prisma.dailyLog.updateMany({ where: { tenantId, id: logId }, data: updates });
    const updated = await prisma.dailyLog.findFirstOrThrow({ where: { tenantId, id: logId } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

dailyLogsRouter.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const logId = req.params.id as string;

    const existing = await prisma.dailyLog.findFirst({ where: { tenantId, id: logId } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== req.userId) return res.status(403).json({ error: "Forbidden: not your log entry" });

    const task = await prisma.task.findFirst({ where: { tenantId, id: existing.taskId } });
    if (task) {
      await prisma.task.updateMany({
        where: { tenantId, id: existing.taskId },
        data: { actualHours: Math.max(0, task.actualHours - existing.hours) },
      });
    }

    await prisma.dailyLog.deleteMany({ where: { tenantId, id: logId } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 7: `pnpm run typecheck` from the workspace root**

- [ ] **Step 8: Rebuild the staging test container and verify over the real connection path — including the approval gates**

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3

# Log in as an artist and a lead (or set up test accounts in the staging clone).
curl -s -c artist_cookies.txt -X POST http://localhost:3099/api/auth/login -H "Content-Type: application/json" -d '{"email":"<artist>","password":"..."}'
curl -s -c lead_cookies.txt -X POST http://localhost:3099/api/auth/login -H "Content-Type: application/json" -d '{"email":"<lead>","password":"..."}'

curl -s -b artist_cookies.txt http://localhost:3099/api/tasks | head -c 2000
# Compare against TaskDTO in hooks/useTasks.ts: id, tenantId, entityId,
# entityType, title, description, assignedTo, status, priority, department,
# pipelinePhase, weeklyRating, tags, estimatedHours, actualHours, startDate,
# dueDate, lastStatusUpdate, createdAt

# THE CRITICAL SECURITY CHECK: an artist must still be blocked from the
# approval-gated transitions -- this is the exact exploit found and fixed
# earlier this session; the migration must not silently reopen it.
curl -s -w "\nHTTP %{http_code}\n" -X PUT -b artist_cookies.txt \
  -H "Content-Type: application/json" -d '{"status":"approved"}' \
  http://localhost:3099/api/tasks/<a-real-task-id>
# Expected: HTTP 403, "Forbidden: only the eligible Production Manager can approve this task"

curl -s -w "\nHTTP %{http_code}\n" -X PUT -b lead_cookies.txt \
  -H "Content-Type: application/json" -d '{"status":"pm-review"}' \
  http://localhost:3099/api/tasks/<a-task-in-the-lead-own-department>
# Expected: HTTP 200 if the lead's department matches the task's department,
# HTTP 403 otherwise -- confirm both cases with a task in and out of the
# lead's department.

curl -s -b artist_cookies.txt http://localhost:3099/api/daily-logs?taskId=<a-real-task-id>
# Compare against DailyLogDTO in hooks/useTasks.ts: id, tenantId, taskId, userId, date, hours, note, createdAt
```

- [ ] **Step 9: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/routes/tasks.ts artifacts/api-server/src/routes/daily-logs.ts
git commit -m "feat: convert tasks (incl. approval gates) and daily-logs routes to Prisma"
```

---

### Task 6: Reviews group — `reviews.ts` + annotations

**Files:**
- Modify: `artifacts/api-server/src/routes/reviews.ts`

**Interfaces:**
- Consumes: `prisma.review`, `prisma.annotation`, `prisma.version` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Convert the whole file**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

async function versionInTenant(id: string, tenantId: string) {
  const row = await prisma.version.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

export const reviewsRouter = Router();
reviewsRouter.use(tenantAuthMiddleware);

reviewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { entityId, entityType, versionId } = req.query;
    const rows = await prisma.review.findMany({
      where: {
        tenantId,
        ...(typeof entityId === "string" ? { entityId } : {}),
        ...(typeof entityType === "string" ? { entityType } : {}),
        ...(typeof versionId === "string" ? { versionId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { entityId, entityType, versionId, status, comments, frame } = req.body;
    if (!entityId || !entityType || !versionId)
      return res.status(400).json({ error: "Missing entityId, entityType, or versionId" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const created = await prisma.review.create({
      data: {
        id: crypto.randomUUID(), tenantId, entityId, entityType, versionId, reviewerId: userId,
        status: status || "pending", comments: comments || "", frame: typeof frame === "number" ? frame : null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.get("/:versionId/annotations", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.annotation.findMany({
      where: { tenantId, versionId: req.params.versionId },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.post("/:versionId/annotations", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const versionId = req.params.versionId as string;
    const { frame, type, color, x, y, w, h, points, text, startFrame, endFrame, fontFamily, fontSize, backgroundColor } = req.body;
    if (typeof frame !== "number" || !type || !color)
      return res.status(400).json({ error: "Missing frame, type, or color" });
    if (!(await versionInTenant(versionId, tenantId)))
      return res.status(400).json({ error: "Invalid versionId" });

    const created = await prisma.annotation.create({
      data: {
        id: crypto.randomUUID(), tenantId, versionId, frame, type, color,
        x: x ?? 0, y: y ?? 0, w: w ?? null, h: h ?? null, points: points ?? null,
        text: text ?? null, startFrame: startFrame ?? null, endFrame: endFrame ?? null,
        fontFamily: fontFamily ?? null, fontSize: fontSize ?? null, backgroundColor: backgroundColor ?? null,
        createdById: userId,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const ANNOTATION_PATCHABLE_FIELDS = [
  "frame", "color", "x", "y", "w", "h", "points", "text",
  "startFrame", "endFrame", "fontFamily", "fontSize", "backgroundColor",
] as const;

reviewsRouter.put("/annotations/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!userId || existing.createdById !== userId) return res.status(403).json({ error: "Forbidden" });

    const updates: Record<string, unknown> = {};
    for (const field of ANNOTATION_PATCHABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    await prisma.annotation.updateMany({ where: { tenantId, id }, data: updates });
    const updated = await prisma.annotation.findFirstOrThrow({ where: { tenantId, id } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

reviewsRouter.delete("/annotations/:id", requireCapability("submit_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    const id = req.params.id as string;
    const existing = await prisma.annotation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!userId || existing.createdById !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.annotation.deleteMany({ where: { tenantId, id } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: `pnpm run typecheck` from the workspace root**

- [ ] **Step 3: Rebuild the staging test container and verify over the real connection path**

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3
curl -s -c cookies.txt -X POST http://localhost:3099/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'

curl -s -b cookies.txt http://localhost:3099/api/reviews | head -c 2000
curl -s -b cookies.txt "http://localhost:3099/api/reviews/<a-real-version-id>/annotations" | head -c 2000
# Compare the annotations response against the `Annotation` type in
# artifacts/forge/src/components/shared/review/types.ts (used directly by
# hooks/useReviews.ts) -- field-for-field, including the frame/color/x/y/
# w/h/points/text/startFrame/endFrame/fontFamily/fontSize/backgroundColor
# set, all camelCase.
```

- [ ] **Step 4: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/reviews.ts
git commit -m "feat: convert reviews and annotations routes to Prisma"
```

---

### Task 7: Remaining group — `notifications.ts`, `audit-logs.ts`, `client-access.ts`, `uploads.ts`, `projects.ts`

**Files:**
- Modify: `artifacts/api-server/src/routes/notifications.ts`
- Modify: `artifacts/api-server/src/routes/audit-logs.ts`
- Modify: `artifacts/api-server/src/routes/client-access.ts`
- Modify: `artifacts/api-server/src/routes/uploads.ts` (no DB queries in this file at all — confirm during conversion that it needs no changes beyond, at most, an unused-import cleanup if any Drizzle import was present; per the file read during planning, it has none)
- Modify: `artifacts/api-server/src/routes/projects.ts`

**Interfaces:**
- Consumes: `prisma.notification`, `prisma.user`, `prisma.tenantRole`, `prisma.department`, `prisma.auditLog`, `prisma.clientAccessLink`, `prisma.version`, `prisma.project`, `prisma.episode` from Task 1.
- Produces: `createNotification`/`findProductionManagers` (unchanged exported function signatures, internals now use Prisma) — consumed by Task 5's `tasks.ts` and Task 8's `sequenceReassignment.ts`, both of which call these functions by name only and are unaffected by the internal ORM swap as long as the signatures and return shapes stay identical.

- [ ] **Step 1: Convert `notifications.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const notificationsRouter = Router();
notificationsRouter.use(tenantAuthMiddleware);

notificationsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await prisma.notification.findMany({
      where: { tenantId, recipientUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch notifications");
    return res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id as string;

    const result = await prisma.notification.updateMany({
      where: { id, tenantId, recipientUserId: userId },
      data: { read: true },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.notification.findFirstOrThrow({ where: { id, tenantId, recipientUserId: userId } });
    return res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to mark notification read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.post("/read-all", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await prisma.notification.updateMany({
      where: { tenantId, recipientUserId: userId },
      data: { read: true },
    });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to mark all notifications read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export async function createNotification(params: {
  tenantId: string; recipientUserId: string; category: string; title: string;
  description: string; entityType?: string; entityId?: string; actionUrl?: string;
}) {
  await prisma.notification.create({
    data: {
      id: crypto.randomUUID(), tenantId: params.tenantId, recipientUserId: params.recipientUserId,
      category: params.category, title: params.title, description: params.description,
      entityType: params.entityType, entityId: params.entityId, actionUrl: params.actionUrl,
    },
  });
}

export async function findProductionManagers(
  tenantId: string,
  departmentName: string | null | undefined,
): Promise<{ id: string }[]> {
  const productionHeads = await prisma.user.findMany({
    where: { tenantId, role: { name: "production_head" } },
    select: { id: true, departmentId: true },
  });
  if (productionHeads.length === 0) return [];

  const depts = await prisma.department.findMany({ where: { tenantId } });
  const dept = depts.find((d) => d.name === departmentName);
  const ownDeptPMs = dept ? productionHeads.filter((u) => u.departmentId === dept.id) : [];
  if (ownDeptPMs.length > 0) return ownDeptPMs;

  const mainDept = depts.find((d) => d.name === "Production Management");
  const mainPMs = mainDept ? productionHeads.filter((u) => u.departmentId === mainDept.id) : [];
  if (mainPMs.length > 0) return mainPMs;

  return productionHeads;
}
```

- [ ] **Step 2: Convert `audit-logs.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const auditLogsRouter = Router();
auditLogsRouter.use(tenantAuthMiddleware);

const LEADERSHIP_ROLE_NAMES = new Set(["admin", "production_head", "producer", "lead"]);

async function callerIsLeadership(roleId: string, tenantId: string) {
  const row = await prisma.tenantRole.findFirst({ where: { id: roleId, tenantId }, select: { name: true } });
  return !!row?.name && LEADERSHIP_ROLE_NAMES.has(row.name);
}

auditLogsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    if (!req.roleId || !(await callerIsLeadership(req.roleId, tenantId)))
      return res.status(403).json({ error: "Forbidden: Leadership access required" });

    const { entityId } = req.query;
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, ...(typeof entityId === "string" ? { targetEntityId: entityId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch audit logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Convert `client-access.ts`**

The `isNull`/`or`/`gt` compound filter becomes Prisma's nested `OR`/`gt` object syntax:

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import { signSession } from "../lib/auth";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

export const clientAccessRouter = Router();

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateAccessCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

clientAccessRouter.post("/redeem", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") return res.status(400).json({ error: "Missing code" });

    const link = await prisma.clientAccessLink.findFirst({
      where: {
        code,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!link) return res.status(401).json({ error: "Invalid or expired code" });

    const clientRole = await prisma.tenantRole.findFirst({
      where: { tenantId: link.tenantId, name: "client" },
      select: { id: true },
    });
    if (!clientRole) return res.status(500).json({ error: "Tenant has no client role configured" });

    const token = signSession({
      userId: null, tenantId: link.tenantId, roleId: clientRole.id, departmentId: null, clientAccessLinkId: link.id,
    });
    res.cookie("session", token, {
      httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ scope: { projectId: link.projectId, episodeId: link.episodeId, versionId: link.versionId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

clientAccessRouter.use(tenantAuthMiddleware);

async function scopeInTenant(
  tenantId: string,
  scope: { projectId?: string; episodeId?: string; versionId?: string },
): Promise<boolean> {
  if (scope.versionId) {
    const row = await prisma.version.findFirst({ where: { id: scope.versionId, tenantId }, select: { id: true } });
    return !!row;
  }
  if (scope.episodeId) {
    const row = await prisma.episode.findFirst({ where: { id: scope.episodeId, tenantId }, select: { id: true } });
    return !!row;
  }
  if (scope.projectId) {
    const row = await prisma.project.findFirst({ where: { id: scope.projectId, tenantId }, select: { id: true } });
    return !!row;
  }
  return false;
}

clientAccessRouter.post("/", requireCapability("approve_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { projectId, episodeId, versionId, expiresAt } = req.body;
    const scope = { projectId, episodeId, versionId };
    const scopeCount = [projectId, episodeId, versionId].filter(Boolean).length;
    if (scopeCount !== 1) return res.status(400).json({ error: "Provide exactly one of projectId, episodeId, or versionId" });
    if (!(await scopeInTenant(tenantId, scope))) return res.status(400).json({ error: "Invalid project, episode, or version" });

    const scopeWhere = versionId ? { versionId } : episodeId ? { episodeId } : { projectId };
    const existing = await prisma.clientAccessLink.findFirst({
      where: {
        tenantId, ...scopeWhere, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existing) return res.status(200).json(existing);

    const created = await prisma.clientAccessLink.create({
      data: {
        id: crypto.randomUUID(), tenantId, code: generateAccessCode(),
        projectId: projectId || null, episodeId: episodeId || null, versionId: versionId || null,
        createdByUserId: userId, expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

clientAccessRouter.get("/", requireCapability("approve_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, episodeId, versionId } = req.query;
    const rows = await prisma.clientAccessLink.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
        ...(typeof episodeId === "string" ? { episodeId } : {}),
        ...(typeof versionId === "string" ? { versionId } : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

clientAccessRouter.delete("/:id", requireCapability("approve_reviews"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const linkId = req.params.id as string;
    const existing = await prisma.clientAccessLink.findFirst({ where: { tenantId, id: linkId } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.clientAccessLink.updateMany({ where: { tenantId, id: linkId }, data: { revokedAt: new Date() } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: Convert `projects.ts`**

```ts
import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

export const projectsRouter = Router();
projectsRouter.use(tenantAuthMiddleware);

projectsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projects = await prisma.project.findMany({ where: { tenantId } });
    return res.json(projects);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

projectsRouter.get("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const project = await prisma.project.findFirst({ where: { tenantId, id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Not found" });
    return res.json(project);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

projectsRouter.post("/", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, code, type, client, status, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });

    const created = await prisma.project.create({
      data: {
        id: crypto.randomUUID(), tenantId, name, code: code || null, type: type || null, client: client || null,
        status: status || "active", startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PROJECT_PATCHABLE_FIELDS = ["name", "code", "type", "client", "status", "startDate", "endDate"] as const;

projectsRouter.put("/:id", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projectId = req.params.id as string;
    const existing = await prisma.project.findFirst({ where: { tenantId, id: projectId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PROJECT_PATCHABLE_FIELDS) {
      if (!(field in req.body)) continue;
      if (field === "startDate" || field === "endDate") {
        updates[field] = req.body[field] ? new Date(req.body[field]) : null;
      } else {
        updates[field] = req.body[field];
      }
    }
    await prisma.project.updateMany({ where: { tenantId, id: projectId }, data: updates });
    const updated = await prisma.project.findFirstOrThrow({ where: { tenantId, id: projectId } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

Note for the reviewer: `ProjectDTO` in `artifacts/forge/src/hooks/useProjects.ts` declares `thumbnail` and `studioId` fields that do NOT exist anywhere in the `projects` table or this route's response, and declares `status` as a narrow union (`"active" | "on_hold" | "complete"`) while the DB column is free text. This is a **pre-existing** frontend/backend shape mismatch, not something introduced by this migration — confirm the Prisma-based response returns the exact same field set as the current (pre-migration) Drizzle response (i.e., no `thumbnail`/`studioId`), and do not attempt to "fix" this drift as part of this task; it's out of scope.

- [ ] **Step 5: Confirm `uploads.ts` needs no changes**

Re-read the current file and confirm it has zero `db`/Drizzle imports (per the file read during plan authoring, all three routes use only `multer`/`fs`/`path`/`crypto`). If true, no edit is needed for this file — do not modify it just to "be thorough."

- [ ] **Step 6: `pnpm run typecheck` from the workspace root**

- [ ] **Step 7: Rebuild the staging test container and verify over the real connection path**

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3
curl -s -c cookies.txt -X POST http://localhost:3099/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'

curl -s -b cookies.txt http://localhost:3099/api/notifications | head -c 2000
# Compare against NotificationDTO in hooks/useNotifications.ts: id, tenantId,
# recipientUserId, category, title, description, entityType, entityId,
# actionUrl, read, createdAt

curl -s -b cookies.txt "http://localhost:3099/api/audit-logs?entityId=<a-real-entity-id>" | head -c 2000
# Compare against AuditLogDTO in hooks/useAuditLogs.ts: id, tenantId,
# actorUserId, action, targetEntityType, targetEntityId, metadata (with
# before/after keys), createdAt

curl -s -b cookies.txt "http://localhost:3099/api/client-access?projectId=<a-real-project-id>" | head -c 2000
# Compare against ClientAccessLinkDTO in hooks/useClientAccess.ts: id,
# tenantId, code, projectId, episodeId, versionId, createdByUserId,
# expiresAt, revokedAt, createdAt

curl -s -b cookies.txt http://localhost:3099/api/projects | head -c 2000
curl -s -b cookies.txt "http://localhost:3099/api/projects/<a-real-project-id>"
```

- [ ] **Step 8: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/routes/notifications.ts artifacts/api-server/src/routes/audit-logs.ts artifacts/api-server/src/routes/client-access.ts artifacts/api-server/src/routes/projects.ts
git commit -m "feat: convert notifications/audit-logs/client-access/projects routes to Prisma"
```

---

### Task 8: Support code — `lib/auditLog.ts`, `lib/sequenceReassignment.ts`

**Files:**
- Modify: `artifacts/api-server/src/lib/auditLog.ts`
- Modify: `artifacts/api-server/src/lib/sequenceReassignment.ts`

**Interfaces:**
- Consumes: `prisma.auditLog`, `prisma.task`, `prisma.shot`, `prisma.sequenceTeamMember`, `prisma.user`, `prisma.department` from Task 1. `createNotification` from Task 7's converted `notifications.ts` (unchanged signature). `cacheDel`/`cacheKeys` from `lib/cache.ts` (untouched — not a DB concern).
- Produces: `recordAuditLog` (consumed by Task 4's `assets.ts`/`shots.ts`, already committed with unchanged call signature) and `maybeReassignOnSequenceCompletion` (consumed by Task 5's `tasks.ts`, already committed with unchanged call signature) — both function signatures are already fixed by the time this task runs; only their internals change here.

- [ ] **Step 1: Convert `auditLog.ts`**

```ts
import { prisma } from "@workspace/db";
import * as crypto from "crypto";

export async function recordAuditLog(params: {
  tenantId: string; actorUserId: string; action: string;
  targetEntityType: "asset" | "shot"; targetEntityId: string;
  before: Record<string, unknown>; after: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      id: crypto.randomUUID(), tenantId: params.tenantId, actorUserId: params.actorUserId,
      action: params.action, targetEntityType: params.targetEntityType, targetEntityId: params.targetEntityId,
      metadata: { before: params.before, after: params.after },
    },
  });
}
```

- [ ] **Step 2: Convert `sequenceReassignment.ts`**

The `inArray`/`ne`/`or`/`isNull`/`lt`/`.orderBy().limit(1)` combination becomes Prisma's `in`/`not`/`OR`/`null`/`lt` object syntax plus `orderBy`/`take: 1`:

```ts
import { prisma } from "@workspace/db";
import { createNotification } from "../routes/notifications";
import { cacheDel, cacheKeys } from "./cache";

export async function maybeReassignOnSequenceCompletion(taskId: string, tenantId: string) {
  try {
    const task = await prisma.task.findFirst({ where: { id: taskId, tenantId } });
    if (!task || task.entityType !== "shot") return;

    const shot = await prisma.shot.findFirst({
      where: { id: task.entityId, tenantId },
      select: { sequenceId: true },
    });
    if (!shot?.sequenceId) return;
    const sequenceId = shot.sequenceId;

    const sequenceShots = await prisma.shot.findMany({
      where: { tenantId, sequenceId },
      select: { id: true },
    });
    const shotIds = sequenceShots.map((s) => s.id);
    if (shotIds.length === 0) return;

    const sequenceTasks = await prisma.task.findMany({
      where: { tenantId, entityType: "shot", entityId: { in: shotIds } },
    });
    if (sequenceTasks.length === 0) return;

    const allApproved = sequenceTasks.every((t) => t.status === "approved");
    if (!allApproved) return;

    const dueDates = sequenceTasks.map((t) => t.dueDate).filter((d): d is Date => d !== null);
    if (dueDates.length === 0) return;
    const latestDue = new Date(Math.max(...dueDates.map((d) => d.getTime())));
    if (latestDue.getTime() <= Date.now()) return;

    const teamMembers = await prisma.sequenceTeamMember.findMany({
      where: { tenantId, sequenceId },
      select: { userId: true, user: { select: { departmentId: true } } },
    });
    if (teamMembers.length === 0) return;

    let reassignedAny = false;
    for (const member of teamMembers) {
      const departmentId = member.user.departmentId;
      if (!departmentId) continue;
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { name: true },
      });
      if (!dept) continue;

      const bottleneck = await prisma.task.findFirst({
        where: {
          tenantId,
          department: dept.name,
          status: { not: "approved" },
          OR: [{ assignedTo: null }, { dueDate: { lt: new Date() } }],
        },
        orderBy: { dueDate: "asc" },
      });
      if (!bottleneck) continue;

      await prisma.task.updateMany({
        where: { id: bottleneck.id },
        data: { assignedTo: member.userId, lastStatusUpdate: new Date() },
      });
      reassignedAny = true;

      await createNotification({
        tenantId, recipientUserId: member.userId, category: "workflow",
        title: `Sequence wrapped early — assigned "${bottleneck.title}"`,
        description: `Your team finished ahead of schedule, so you've been automatically assigned a bottlenecked ${dept.name} task.`,
        entityType: "task", entityId: bottleneck.id, actionUrl: `/tasks/${bottleneck.id}`,
      });
    }

    if (reassignedAny) await cacheDel(cacheKeys.tasksList(tenantId));
  } catch (err) {
    console.error("[sequence-reassignment] failed:", (err as Error).message);
  }
}
```

Note the `teamMembers` query: Drizzle's version does an `innerJoin(usersTable, ...)` and selects `departmentId` as a sibling field named `departmentId` (from the joined `usersTable`). The Prisma version above nests it under `member.user.departmentId` (via the `User` relation on `SequenceTeamMember` — verify this relation exists in `schema.prisma` from Task 1's introspection, named `user` singular) and accesses it accordingly — this is an internal-only variable, not part of any HTTP response, so the nested-vs-flat shape difference here has no frontend-contract implications (unlike the `GET /:id/team` route in Task 2, which DOES need explicit flattening because its result is sent directly to the client).

- [ ] **Step 3: `pnpm run typecheck` from the workspace root**

- [ ] **Step 4: Verify over the real connection path**

This logic only fires as a side effect of `PUT /tasks/:id` with `status: "approved"` (already verified working in Task 5) and has no dedicated HTTP endpoint of its own — verify it by exercising the actual trigger condition against the staging clone:

```bash
docker build -f artifacts/api-server/Dockerfile -t forge-api-staging-test .
docker run -d --name forge-api-staging-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-staging-test
sleep 3
```

Set up a minimal real scenario in the staging clone: a sequence with one shot, one task on that shot with a future `dueDate`, and a team member on that sequence in a department that has another bottlenecked task (unassigned or overdue). Then, as a user with the right approval authority, PUT that one task to `status: "approved"` via curl (same auth flow as Task 5's verification) and confirm via `docker exec forge-staging-db psql` that the bottlenecked task's `assigned_to` column changed to the team member's id, and via `GET /notifications` (as that team member) that they received the "Sequence wrapped early" notification. This exercises `recordAuditLog`'s conversion indirectly too, if the same PUT also touches an asset/shot with audit logging — otherwise verify `recordAuditLog` directly via Task 4's already-passing `PUT /assets/:id` / `PUT /shots/:id` checks (no separate check needed here if Task 4 already confirmed the audit log write path end-to-end).

- [ ] **Step 5: Tear down the throwaway test container**

```bash
docker rm -f forge-api-staging-test
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/auditLog.ts artifacts/api-server/src/lib/sequenceReassignment.ts
git commit -m "feat: convert auditLog and sequenceReassignment lib code to Prisma"
```

---

### Task 9: Scripts — `seed.ts`, `import-roster.ts`, `reset-and-bootstrap-admin.ts`

These are dev/onboarding tools, not part of the live request path — lower priority than the routes above, but still part of the migration's scope (the spec's Non-goals only exclude schema/data changes, not script conversion).

**Files:**
- Modify: `scripts/src/seed.ts`
- Modify: `scripts/src/import-roster.ts`
- Modify: `scripts/src/reset-and-bootstrap-admin.ts`

**Interfaces:**
- Consumes: `prisma.tenant`, `prisma.department`, `prisma.project`, `prisma.user`, `prisma.tenantRole`, `prisma.tenantRoleCapability`, `prisma.episode`, `prisma.sequence`, `prisma.shot`, `prisma.asset`, `prisma.task`, `prisma.taskChecklistItem`, `prisma.taskComment`, `prisma.version`, `prisma.annotation`, `prisma.dailyLog` from Task 1.
- Produces: nothing (these are standalone CLI scripts, not imported by anything else).

- [ ] **Step 1: Convert `reset-and-bootstrap-admin.ts` (smallest, do this first as the worked pattern)**

The bulk `db.delete(tenantsTable)` (cascades) becomes `prisma.tenant.deleteMany({})`; the loop inserting roles + a `.values(capabilities.map(...))` bulk insert becomes a single `createMany`:

```ts
import { prisma } from "@workspace/db";
import * as argon2 from "argon2";
import * as crypto from "crypto";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

const ADMIN_EMAIL = "krishna.akshath11@gmail.com";
const ADMIN_NAME = "Krishna Akshath";
const TENANT_NAME = "Symbiosys Technologies";
const TENANT_SLUG = "symbiosys";

const ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  admin: ["manage_members", "manage_roles", "view_financials", "manage_licenses", "manage_integrations"],
  production_head: ["create_tasks", "edit_tasks", "delete_tasks", "assign_tasks", "submit_reviews", "approve_reviews", "view_financials", "edit_financials", "manage_pipeline", "broadcast_updates"],
  producer: ["create_tasks", "edit_tasks", "assign_tasks", "submit_reviews", "approve_reviews", "manage_pipeline", "broadcast_updates"],
  lead: ["create_tasks", "edit_tasks", "assign_tasks", "submit_reviews", "approve_reviews"],
  artist: ["edit_tasks", "submit_reviews"],
  client: ["approve_reviews"],
};

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("CRITICAL: This script can only be run in development environment.");
    process.exit(1);
  }
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    console.error("CRITICAL: Set ADMIN_BOOTSTRAP_PASSWORD in the environment before running this script. It is never hardcoded here.");
    process.exit(1);
  }

  console.log("Wiping every tenant-scoped table (cascades from tenants)...");
  await prisma.tenant.deleteMany({});

  console.log("Creating tenant, all six standard roles, and the admin user...");
  const tenantId = crypto.randomUUID();
  await prisma.tenant.create({ data: { id: tenantId, name: TENANT_NAME, slug: TENANT_SLUG } });

  const roleIdByName: Record<string, string> = {};
  for (const [roleName, capabilities] of Object.entries(ROLE_CAPABILITIES)) {
    const roleId = crypto.randomUUID();
    roleIdByName[roleName] = roleId;
    await prisma.tenantRole.create({ data: { id: roleId, tenantId, name: roleName, isSystemDefault: true } });
    await prisma.tenantRoleCapability.createMany({
      data: capabilities.map((capabilityId) => ({ roleId, capabilityId })),
    });
  }
  const adminRoleId = roleIdByName.admin;

  const hashedPassword = await hashPassword(password);
  await prisma.user.create({
    data: {
      id: crypto.randomUUID(), tenantId, roleId: adminRoleId, departmentId: null,
      email: ADMIN_EMAIL, hashedPassword, name: ADMIN_NAME, status: "active",
    },
  });

  console.log(`Bootstrap complete. Tenant "${TENANT_NAME}" (${tenantId}) created with all six standard roles and one admin user (${ADMIN_EMAIL}). Every other table is empty. Log in and use the admin panel to invite/add employees and departments.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset/bootstrap failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Convert `import-roster.ts`**

Only the four `db.select`/`db.insert` calls inside `main()` change (the XLSX parsing, `guessRoleName`, `slugifyEmail`, `guessDepartment` helpers are pure JS, unaffected):

```ts
import { prisma } from "@workspace/db";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import * as XLSX from "xlsx";

// ... TENANT_ID/ROSTER_PATH/TEMP_PASSWORD/EMAIL_DOMAIN, hashPassword,
// guessRoleName, RosterRow, parseRoster, slugifyEmail: all unchanged verbatim ...

async function main() {
  if (!TENANT_ID || !ROSTER_PATH || !TEMP_PASSWORD) {
    console.error("Set IMPORT_TENANT_ID, ROSTER_PATH, and IMPORT_TEMP_PASSWORD in the environment before running.");
    process.exit(1);
  }

  const roles = await prisma.tenantRole.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
  });
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

  const departments = await prisma.department.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, abbr: true },
  });

  function guessDepartment(sourceDept: string) {
    const d = sourceDept.trim().toLowerCase();
    if (!d) return undefined;
    return (
      departments.find((dept) => dept.name.toLowerCase() === d) ||
      departments.find((dept) => dept.name.toLowerCase().includes(d) || d.includes(dept.name.toLowerCase())) ||
      departments.find((dept) => dept.abbr.toLowerCase() === d)
    );
  }

  const existingUsers = await prisma.user.findMany({
    where: { tenantId: TENANT_ID },
    select: { email: true, name: true },
  });
  const existingNames = new Set(existingUsers.map((u) => u.name.toLowerCase()));
  const usedEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const rows = parseRoster(ROSTER_PATH);
  const hashedPassword = await hashPassword(TEMP_PASSWORD);

  let created = 0;
  let skipped = 0;
  const createdRows: { name: string; email: string; role: string; dept: string }[] = [];

  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) { skipped++; continue; }
    const roleName = guessRoleName(row.sourceDesignation);
    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`Skipping "${row.name}" -- no "${roleName}" role found for this tenant.`);
      skipped++;
      continue;
    }
    const dept = guessDepartment(row.sourceDept);
    const email = slugifyEmail(row.name, usedEmails);

    await prisma.user.create({
      data: {
        id: crypto.randomUUID(), tenantId: TENANT_ID, roleId, departmentId: dept?.id ?? null,
        email, hashedPassword, name: row.name, title: row.sourceDesignation || null, status: "active",
      },
    });
    existingNames.add(row.name.toLowerCase());
    created++;
    createdRows.push({ name: row.name, email, role: roleName, dept: dept?.name ?? "(none)" });
  }

  console.log(`Created ${created} real accounts, skipped ${skipped} (already existed or unmapped).`);
  console.log(`Shared temporary password: ${TEMP_PASSWORD}`);
  console.log("");
  for (const r of createdRows) {
    console.log(`${r.name.padEnd(28)} ${r.email.padEnd(38)} ${r.role.padEnd(16)} ${r.dept}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Roster import failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Convert `seed.ts`**

This file is 836 lines seeding tenants/departments/projects/users/episodes/sequences/shots/assets/tasks/checklist items/comments/versions/annotations/daily logs, and consistently uses ONE pattern throughout: `db.insert(x).values(...).onConflictDoNothing()` for idempotent re-seeding (using deterministic ids where the table has no natural unique constraint, or `onConflictDoNothing()` against a real unique constraint like `tenantsTable.slug`), sometimes followed by a re-select to recover the real row id. Convert every such call using Prisma's `upsert` (the direct equivalent of "insert, or do nothing and tell me what's there"):

```ts
// Drizzle pattern (recurs throughout the file):
await db.insert(tenantsTable).values({ id: crypto.randomUUID(), name: "Acme VFX", slug: "acme" }).onConflictDoNothing();
const [insertedTenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, "acme"));
const tenantId = insertedTenant.id;

// Prisma equivalent -- upsert does the insert-or-noop AND returns the real
// row (whichever id it ends up with) in one call, replacing the
// insert-then-reselect pair with a single query:
const tenant = await prisma.tenant.upsert({
  where: { slug: "acme" },
  update: {},
  create: { id: crypto.randomUUID(), name: "Acme VFX", slug: "acme" },
});
const tenantId = tenant.id;
```

For deterministic-id rows with no other unique constraint (e.g. the `projectDefs` pattern mentioned in the file), the equivalent is an upsert keyed on `id` itself:

```ts
// Drizzle: await db.insert(projectsTable).values({id: someFixedId, ...}).onConflictDoNothing();
const project = await prisma.project.upsert({
  where: { id: someFixedId },
  update: {},
  create: { id: someFixedId, ...otherFields },
});
```

Apply this exact upsert pattern to every `db.insert(...).onConflictDoNothing()` call in the file (grep the current file for `onConflictDoNothing` to enumerate every occurrence before starting — there are more beyond the tenant example above, covering departments, projects, episodes, sequences, shots, assets, tasks, and users). For any plain `db.insert(...).values(...)` call with no `onConflictDoNothing()` (an unconditional insert, used for rows created fresh every seed run, like tasks/checklist-items/comments/versions/annotations/daily-logs under each project), convert 1:1 to `prisma.<model>.create({data: {...}})` with no upsert semantics needed. Replace the file's Drizzle imports with `import { prisma } from "@workspace/db";` and remove the `import { and, eq } from "drizzle-orm";` line (Prisma's plain object `where` syntax needs no equivalent import).

- [ ] **Step 4: `pnpm run typecheck` from the workspace root**

- [ ] **Step 5: Verify against the staging clone**

These scripts require `NODE_ENV=development` to run at all (both `seed.ts` and `reset-and-bootstrap-admin.ts` refuse otherwise) — run them directly against the staging clone's `DATABASE_URL` from a local shell (not inside a container, matching how they're actually run today per `import-roster.ts`'s own header comment: "Run once, locally... against the dev DB exposed on localhost"):

```bash
cd scripts
NODE_ENV=development DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" ADMIN_BOOTSTRAP_PASSWORD=test12345678 npx tsx src/reset-and-bootstrap-admin.ts
```

**WARNING:** this WIPES the staging clone (that's its entire purpose) — run this LAST, after every other task's verification against this same staging clone is fully done, or restore the staging clone fresh from the backup again afterward (repeat Task 1 Steps 1–2) before any further work that needs the real imported production data. Confirm the script completes with "Bootstrap complete." and no errors, then confirm via `docker exec forge-staging-db psql -U postgres -d forge -c "SELECT count(*) FROM tenant_roles;"` that exactly 6 roles exist.

Do NOT run `seed.ts` or `import-roster.ts` against the staging clone in a way that would be mistaken for real verification of production behavior — these are dev-data tools whose only job here is to confirm they still execute without throwing under Prisma; a clean exit with the expected "Created N..." console output is sufficient verification for this task's scope.

- [ ] **Step 6: Commit**

```bash
git add scripts/src/seed.ts scripts/src/import-roster.ts scripts/src/reset-and-bootstrap-admin.ts
git commit -m "feat: convert seed/import-roster/reset-bootstrap scripts to Prisma"
```

---

### Task 10: Migration runner & Dockerfile finalization

Now that every consumer is converted, remove Drizzle entirely.

**Files:**
- Delete: `lib/db/drizzle/` (the whole directory — old Drizzle migrations)
- Delete: `lib/db/drizzle.config.ts`
- Delete: `lib/db/src/schema/*.ts` (all 8 files) — but NOT `lib/db/src/schema/index.ts` unless nothing outside `lib/db` imports from `@workspace/db/schema` anymore (grep first — see Step 1)
- Modify: `lib/db/src/index.ts` (remove the Drizzle `db`/`pool` exports, keep only `prisma`)
- Modify: `lib/db/package.json` (remove `drizzle-orm`, `drizzle-kit`, `drizzle-zod` dependencies; remove the `push`/`push-force`/`generate` scripts that were drizzle-kit-specific; keep/add a `migrate` script that runs the new Prisma-based `migrate.ts`)
- Modify: `artifacts/api-server/Dockerfile`
- Modify: `docker-compose.yml` (the `api` service's `command:` override)

**Interfaces:**
- Consumes: everything from Tasks 1–9 (all consumers already converted).
- Produces: the final, Drizzle-free `@workspace/db` package and container startup sequence — consumed by Task 11's regression pass and Task 12's cutover.

- [ ] **Step 1: Confirm nothing still imports Drizzle**

```bash
grep -rl "drizzle-orm\|@workspace/db/schema\|from \"@workspace/db\".*Table" artifacts/ scripts/ lib/db/src/index.ts
```

Expected: no matches outside `lib/db/src/schema/*.ts` and `lib/db/drizzle.config.ts` themselves (which this task is about to delete). If any match appears in a route/lib/script file, that file was missed in an earlier task — stop and convert it before proceeding (do not delete the Drizzle schema out from under a still-dependent file).

- [ ] **Step 2: Remove Drizzle from `lib/db`**

```bash
rm -rf lib/db/drizzle lib/db/drizzle.config.ts lib/db/src/schema/core.ts lib/db/src/schema/production.ts lib/db/src/schema/tasks-detail.ts lib/db/src/schema/rbac.ts lib/db/src/schema/departments.ts lib/db/src/schema/reviews.ts lib/db/src/schema/client-access.ts lib/db/src/schema/notifications.ts lib/db/src/schema/index.ts
```

Update `lib/db/src/index.ts` to only export Prisma:

```ts
import { PrismaClient } from "../generated/prisma-client"; // match Task 1's actual generator output path

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const prisma = new PrismaClient();
```

Update `lib/db/package.json`: remove `drizzle-orm`, `drizzle-zod`, `drizzle-kit` from dependencies/devDependencies; remove `pg`/`@types/pg` if nothing else in this package uses the raw `pg` driver directly (Prisma manages its own connection pooling internally); remove the `"push"`, `"push-force"`, `"generate"` scripts (drizzle-kit-specific); keep/update:

```json
{
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "migrate": "tsx src/migrate.ts",
    "prisma:generate": "prisma generate --schema=./schema.prisma"
  }
}
```

(Drop the separate `"./schema"` export entirely — nothing imports it anymore per Step 1's grep.)

- [ ] **Step 3: Update the Dockerfile**

The build stage's conditional migration-regeneration step (Dockerfile lines ~49–52, guarding against uncommitted Drizzle migrations) is entirely Drizzle-specific and no longer applies — Prisma's migrations are already committed from Task 1 and need no build-time regeneration. Remove that `RUN if [ ! -d "lib/db/drizzle" ]; then ...` block entirely. Add a `prisma generate` step before the api-server build (Prisma Client must be generated before anything that imports it can compile):

```dockerfile
# Generate the Prisma Client before building anything that imports it.
RUN pnpm --filter "@workspace/db" run prisma:generate

# Build the api server
RUN pnpm --filter "@workspace/api-server" run build
```

Update the two `COPY --from=builder` lines in the runner stage that referenced Drizzle's migration folder/script:

```dockerfile
# Was: COPY --from=builder /app/lib/db/drizzle /app/prod/db/drizzle
COPY --from=builder /app/lib/db/schema.prisma /app/prod/db/schema.prisma
COPY --from=builder /app/lib/db/prisma /app/prod/db/prisma
COPY --from=builder /app/lib/db/generated /app/prod/db/generated
# Was: COPY --from=builder /app/lib/db/src/migrate.ts /app/prod/db/src/migrate.ts
COPY --from=builder /app/lib/db/src/migrate.ts /app/prod/db/src/migrate.ts
```

(Adjust the `generated` path to wherever Task 1's `schema.prisma` generator block actually points — Prisma Client's default output location if unspecified, or a custom `output` path if one was set.)

- [ ] **Step 4: Update `docker-compose.yml`'s `api` service `command:`**

The current command is:

```yaml
command: >
  sh -c "cd /app/prod/db && ./node_modules/.bin/tsx src/migrate.ts && cd /app/prod/api-server && node --enable-source-maps ./dist/index.mjs"
```

`migrate.ts`'s new content (Task 1, Step 9) shells out to `npx prisma migrate deploy` itself, so this compose command needs no structural change — it already `cd`s into `/app/prod/db` and runs `tsx src/migrate.ts` first, which is exactly right. Just confirm the same comment above it (explaining why `tsx` is invoked directly instead of via `pnpm run migrate`) still applies: it does, since the reasoning (pruned `pnpm deploy` output has no workspace root to resolve `pnpm --filter` against) is unrelated to which ORM `migrate.ts` wraps. No edit needed here — the existing multi-line comment (lines ~123–131) already correctly targets `tsx src/migrate.ts` generically. Verify only, don't change unless the review step below finds otherwise.

- [ ] **Step 5: `pnpm run typecheck` from the workspace root**

Expected: green, with `lib/db`'s typecheck now only compiling Prisma-based code (no Drizzle types anywhere in the workspace).

- [ ] **Step 6: Build the full image and verify migration + startup against the staging clone from scratch**

This is the first end-to-end test of the ACTUAL production Dockerfile/compose command sequence (not a hand-run `tsx src/migrate.ts` like Task 1's Step 10) — rebuild the staging clone fresh first, since Task 9's script verification wiped it:

```bash
# Refresh the staging clone (repeat Task 1 Steps 1-2)
docker rm -f forge-staging-db
docker run -d --name forge-staging-db --network forge-staging \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=staging_only_password -e POSTGRES_DB=forge \
  -p 5433:5432 postgres:15-alpine
until docker exec forge-staging-db pg_isready -U postgres -d forge; do sleep 1; done
LATEST_BACKUP=$(ls -t backups/forge-*.sql.gz | head -1)
gunzip -c "$LATEST_BACKUP" | docker exec -i forge-staging-db psql -U postgres -d forge

# Re-apply the baseline (Task 1 Step 7) since this is a fresh container
DATABASE_URL="postgresql://postgres:staging_only_password@localhost:5433/forge" \
  npx prisma migrate resolve --applied 0000_baseline --schema=lib/db/schema.prisma

# Full image build (exercises the real Dockerfile end to end)
docker build -f artifacts/api-server/Dockerfile -t forge-api-final-test .

docker run -d --name forge-api-final-test --network forge-staging \
  -e DATABASE_URL="postgresql://postgres:staging_only_password@forge-staging-db:5432/forge" \
  -e JWT_SECRET=staging_test_secret -e NODE_ENV=production -p 3099:3001 \
  forge-api-final-test
sleep 5
docker logs forge-api-final-test
```

Expected: "Running migrations...", "No pending migrations to apply" (or equivalent Prisma output), "Migrations complete.", then "Server listening" — the exact same startup sequence the real deployment will go through. Verify with one more real HTTP round-trip:

```bash
curl -s -c cookies.txt -X POST http://localhost:3099/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'
curl -s -b cookies.txt http://localhost:3099/api/tasks | head -c 500
```

- [ ] **Step 7: Tear down**

```bash
docker rm -f forge-api-final-test
```

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/index.ts lib/db/package.json artifacts/api-server/Dockerfile
git rm -r lib/db/drizzle lib/db/drizzle.config.ts lib/db/src/schema
git commit -m "feat: remove Drizzle entirely, finalize Prisma-based migration runner and Dockerfile"
```

---

### Task 11: Full regression pass against the staging clone

**Files:** none created/modified — this task is pure verification. If it finds a bug, fix it in the relevant file from Tasks 2–10 and re-run this task's checks (don't silently patch and move on without re-verifying).

**Interfaces:**
- Consumes: the complete, Drizzle-free application from Task 10.
- Produces: a go/no-go signal for Task 12.

- [ ] **Step 1: Refresh the staging clone one more time**

Repeat Task 10 Step 6's clone-refresh sub-steps (fresh backup restore + baseline resolve) so this regression pass runs against the most realistic possible data, not whatever Task 9's script tests left behind.

- [ ] **Step 2: Rebuild and start the final image against the refreshed clone**

Same `docker build`/`docker run` sequence as Task 10 Step 6.

- [ ] **Step 3: Re-run every verification curl command from Tasks 2–8 in one pass**

Go back through this plan's Task 2 Step 6, Task 3 Step 5, Task 4 Step 5, Task 5 Step 8, Task 6 Step 3, Task 7 Step 7, and Task 8 Step 4, and re-run every curl command listed there against this freshly-built final image. This is not "spot check a few" — every endpoint this plan named gets re-hit here, since Task 10's Drizzle removal is the first point where a stray missed reference would surface as a runtime crash instead of the typecheck catching it.

- [ ] **Step 4: Test every role, not just whichever user was convenient during earlier tasks**

Log in as one real user of each role present in the staging clone's data (admin, production_head, producer, lead, artist, and a client-access-link session via `POST /client-access/redeem` with a real code from the data) and confirm `GET /auth/me` returns the correct role name and capability set for each, and that at least one capability-gated write route correctly allows the roles that should pass and 403s the ones that shouldn't (reuse the exact artist-blocked/lead-allowed approval-gate checks from Task 5 Step 8 as the template for this broader per-role sweep).

- [ ] **Step 5: Re-verify tonight's other fresh work specifically**

These are recent, easy to silently regress if a query's `where` clause lost a condition during conversion:
- The CORS fix (`app.ts`) is unrelated to this migration and unaffected by it — confirm it still works only incidentally (the login flow you're already exercising above depends on CORS behaving, so this should already be implicitly covered).
- The department backfill: confirm `GET /tasks` still shows `department: "Animation"` (not null) on the tracksheet-imported tasks, proving Task 5's conversion of the `department` field didn't get lost.
- The approval-stage gates: already covered explicitly in Step 4 above and Task 5 Step 8 — re-confirm here as part of this consolidated pass, don't skip it because it was "already checked once."

- [ ] **Step 6: `pnpm run typecheck` one final time from a completely clean state**

```bash
rm -rf node_modules **/node_modules # or however this workspace's clean-install step normally runs
pnpm install
pnpm run typecheck
```

This catches anything that only an actual `prisma generate` run (not a stale cached one from an earlier task) would reveal.

- [ ] **Step 7: Tear down all staging infrastructure**

Once every check above passes:

```bash
docker rm -f forge-api-final-test forge-staging-db
docker network rm forge-staging
```

- [ ] **Step 8: Report go/no-go**

If every check in Steps 3–6 passed: this plan is ready for Task 12. If anything failed: fix it in the relevant earlier task's file, re-run Step 2 onward, and do not proceed to Task 12 until this entire task is clean in one continuous pass.

---

### Task 12: Production cutover

**Files:** none — this is a deployment operation, not a code change. (The code being deployed is everything committed in Tasks 1–10.)

**Interfaces:**
- Consumes: the fully-verified image from Task 11.
- Produces: the live production deployment running on Prisma.

**This task executes against the real `10.180.9.120` deployment and the real database. Confirm the planned downtime window with the user before starting — do not run this task unattended or without an explicit go-ahead for this specific window, per this session's established pattern of asking before any action that touches the live system.**

- [ ] **Step 1: Fresh backup, in addition to the regular scheduled ones**

```bash
docker compose exec db-backup sh -c 'pg_dump | gzip > /backups/forge-pre-prisma-cutover-$(date +%Y%m%d-%H%M%S).sql.gz'
```

Verify the file exists and is non-trivially sized:

```bash
ls -lh backups/forge-pre-prisma-cutover-*.sql.gz
```

- [ ] **Step 2: Tag the current (pre-migration) image for rollback**

```bash
docker tag shotgun-mock-api:latest shotgun-mock-api:pre-prisma-migration
```

- [ ] **Step 3: Build the final Prisma-based image**

```bash
docker compose build api
```

Verify the built image actually contains the Prisma-based code before deploying (per this session's established build-verification protocol — never trust a build succeeding as proof the right code is in the image):

```bash
docker create --name verify-api-prisma shotgun-mock-api:latest
docker cp verify-api-prisma:/app/prod/api-server/dist/index.mjs /tmp/verify-index.mjs
docker rm verify-api-prisma
grep -c "PrismaClient\|@prisma/client" /tmp/verify-index.mjs
grep -c "drizzle-orm" /tmp/verify-index.mjs
```

Expected: the first grep finds matches, the second finds zero.

- [ ] **Step 4: Begin the downtime window — stop `api`**

```bash
docker compose stop api
```

The site's frontend (`web`/nginx) stays up but every `/api/*` call will 502 from this point until Step 6 completes — this is the planned downtime.

- [ ] **Step 5: Run the Prisma migration against the real database**

```bash
docker compose run --rm api sh -c "cd /app/prod/db && ./node_modules/.bin/tsx src/migrate.ts"
```

Expected: "Running migrations...", "No pending migrations to apply" (since this is the same already-applied baseline as staging — no real schema change happens here), "Migrations complete."

If this step reports anything OTHER than "no pending migrations" (i.e., it tries to actually run DDL), STOP — this means the real production database has drifted from what Task 1's staging clone represented (the backup used for staging was not fully representative), and proceeding could apply unintended schema changes to production. Investigate the diff before continuing; do not force it through.

- [ ] **Step 6: Deploy**

```bash
docker compose up -d --no-deps api
```

- [ ] **Step 7: Live verification over the real connection path — against the real host**

```bash
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://10.180.9.120/
curl -s -c prod_cookies.txt -X POST http://10.180.9.120/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"<a real production user>","password":"<their real password>"}'
curl -s -b prod_cookies.txt http://10.180.9.120/api/auth/me
curl -s -b prod_cookies.txt http://10.180.9.120/api/tasks | head -c 500
```

Expected: `200` for the site root, a valid login response, a valid `/auth/me` response, and a valid tasks array — the exact same shape checks from Task 11, now against the real host. Also re-run the artist-blocked approval-gate check from Task 5 Step 8 against production, since that's the highest-stakes behavior in this entire migration.

- [ ] **Step 8: Monitor logs for a few minutes**

```bash
docker logs -f forge-api --tail 50
```

Watch for any Prisma connection-pool errors, unexpected query failures, or crashes as real user traffic starts hitting the newly-deployed code. This is not a fixed-duration step — stay until you're confident the deployment is stable under real traffic, not just synthetic curl checks.

- [ ] **Step 9: Report completion**

Confirm to the user: cutover complete, rollback available via `docker tag shotgun-mock-api:pre-prisma-migration shotgun-mock-api:latest && docker compose up -d --no-deps api` if anything surfaces later, pre-cutover backup at the path from Step 1.

**No git commit in this task** — nothing in the repo changes here; everything was already committed in Tasks 1–10 and this task only deploys already-committed code.
