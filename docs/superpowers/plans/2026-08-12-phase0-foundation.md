# Phase 0 — Foundation (Multi-Tenant Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Forge's mock, plaintext-password login with real multi-tenant authentication (Postgres + Drizzle + httpOnly JWT session cookies) in the existing `artifacts/api-server` scaffold, matching the role hierarchy already encoded in the frontend mock.

**Architecture:** Two new Drizzle tables (`studios` as the tenant, `users` scoped to a tenant) in `@workspace/db`. `artifacts/api-server` gets password hashing, JWT session cookies (via the already-present `cookie-parser` dependency), and `requireAuth`/`requireMinRole` middleware. New `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` endpoints are added OpenAPI-first, regenerated into `@workspace/api-zod` and `@workspace/api-client-react`, and consumed by the frontend's `useAuthStore`. The rest of the `User` entity (avatar, department, capacity, skills, etc.) stays sourced from the existing frontend mock (`artifacts/forge/src/data/mockData.ts`) for now — a deliberate Phase 0 boundary, since a full Users/Departments entity model is Phase 1 scope per `docs/superpowers/specs/2026-08-12-forge-ftrack-parity-design.md`. This plan supersedes and deletes the old `docs/superpowers/plans/2026-08-12-core-backend.md`, which targeted a nonexistent `artifacts/server` package.

**Tech Stack:** Node.js 24, TypeScript 5.9 (strict), Express 5, PostgreSQL 16, Drizzle ORM + drizzle-zod, Zod (`zod/v4`), bcryptjs, jsonwebtoken, Vitest, Supertest, Orval (OpenAPI codegen).

## Global Constraints

- Use the pnpm workspace setup; every new/changed dependency must be added via each package's `package.json`, followed by `pnpm install` from the repo root.
- Use `drizzle-orm` version `catalog:` (pinned to `^0.45.2` in `pnpm-workspace.yaml`) and `zod` version `catalog:` (pinned to `^3.25.76`) — never hand-pin a different version for these two.
- All new backend code is TypeScript, follows `tsconfig.base.json`'s strict settings (`strictNullChecks`, `noImplicitAny`, etc.), and passes `pnpm run typecheck` from the repo root.
- Drizzle-zod schemas use the `zod/v4` import path (`import { z } from "zod/v4"`), matching the convention already documented in `lib/db/src/schema/index.ts`.
- `pnpm-workspace.yaml` enforces a 24-hour `minimumReleaseAge` on new npm packages (a supply-chain safety guard — **never disable it**). If `pnpm install` rejects a version pinned in this plan as "too new," relax that one package's version range (e.g. drop the exact patch pin) rather than touching the `minimumReleaseAge` setting.
- Env vars are read directly from `process.env` and required at module load (matching the existing `PORT`/`DATABASE_URL` pattern in `artifacts/api-server/src/index.ts` and `lib/db/src/index.ts`) — this codebase does not use `dotenv`; developers export vars into their shell before running dev/test commands.
- Route handlers validate request/response bodies with the generated Zod schemas from `@workspace/api-zod`, matching the existing `artifacts/api-server/src/routes/health.ts` convention.

---

### Task 1: Retire the outdated core-backend plan

**Files:**
- Delete: `docs/superpowers/plans/2026-08-12-core-backend.md` (already removed from the working tree; this task commits that removal)

**Interfaces:** None — this is a docs-only cleanup task.

- [ ] **Step 1: Verify the old plan file is gone and stage the deletion**

Run: `git status docs/superpowers/plans/`
Expected: `2026-08-12-core-backend.md` shows as deleted (not present in the untracked/modified list, since git tracks it as removed relative to HEAD).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-12-core-backend.md
git commit -m "docs: retire core-backend plan, superseded by phase0-foundation plan"
```

---

### Task 2: Local Postgres for dev + env template

**Files:**
- Create: `scripts/dev-db.sh`
- Create: `.env.example`

**Interfaces:**
- Produces: A local Postgres instance reachable at `postgresql://forge:forge@localhost:5433/forge`, and a documented list of required env vars for later tasks.

Note: this repo's sandboxed dev environment ships a very old Docker (API 1.13.1, no `docker compose` plugin, no usable `docker-compose` binary) — use plain `docker run` rather than a compose file for portability. If your environment has a modern `docker compose`, feel free to translate this into a `docker-compose.yml` instead; the script below is the lowest-common-denominator choice.

- [ ] **Step 1: Create `scripts/dev-db.sh` at the repo root's `scripts/` package**

```bash
#!/usr/bin/env bash
# Manage the local Postgres container used for Forge dev/test.
set -euo pipefail

CONTAINER_NAME=forge-postgres
PORT=5433

case "${1:-}" in
  start)
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
      docker start "$CONTAINER_NAME" >/dev/null
    else
      docker run -d \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_USER=forge \
        -e POSTGRES_PASSWORD=forge \
        -e POSTGRES_DB=forge \
        -p "${PORT}:5432" \
        -v forge_postgres_data:/var/lib/postgresql/data \
        postgres:16-alpine >/dev/null
    fi
    echo -n "Waiting for Postgres to accept connections"
    for _ in $(seq 1 30); do
      if docker exec "$CONTAINER_NAME" pg_isready -U forge -d forge >/dev/null 2>&1; then
        echo " — ready."
        exit 0
      fi
      echo -n "."
      sleep 1
    done
    echo " — timed out waiting for Postgres to start." >&2
    exit 1
    ;;
  stop)
    docker stop "$CONTAINER_NAME" >/dev/null
    ;;
  status)
    docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/dev-db.sh`

- [ ] **Step 3: Create `.env.example` at the repo root**

```
# Copy the values below into your shell before running db/api-server scripts:
#   export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge
#   export JWT_SECRET=dev-secret-change-me
#   export PORT=5000
DATABASE_URL=postgresql://forge:forge@localhost:5433/forge
JWT_SECRET=dev-secret-change-me
PORT=5000
```

- [ ] **Step 4: Start Postgres and verify it's ready**

Run: `./scripts/dev-db.sh start`
Expected: prints `Waiting for Postgres to accept connections...— ready.`

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-db.sh .env.example
git commit -m "chore: add local Postgres dev script and env template"
```

---

### Task 3: Studios + Users + Role Drizzle schema

**Files:**
- Create: `lib/db/src/schema/roles.ts`
- Create: `lib/db/src/schema/studios.ts`
- Create: `lib/db/src/schema/users.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Consumes: `drizzle-orm/pg-core` (`pgTable`, `pgEnum`, `uuid`, `text`, `timestamp`), `drizzle-zod` (`createInsertSchema`).
- Produces: `roleEnum`, `ROLE_VALUES`, `Role`, `ROLE_RANK`, `studiosTable`, `insertStudioSchema`, `InsertStudio`, `Studio`, `usersTable`, `insertUserSchema`, `InsertUser`, `UserRow` — all re-exported from `@workspace/db`.

- [ ] **Step 1: Create `lib/db/src/schema/roles.ts`**

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

// Mirrors the Role union and ROLE_HIERARCHY in
// artifacts/forge/src/data/mockData.ts — keep both in sync until Phase 1
// makes the backend the source of truth for the frontend's role types too.
export const ROLE_VALUES = [
  "vfx_producer",
  "production_manager",
  "coordinator",
  "supervisor",
  "lead",
  "senior_artist",
  "artist",
  "junior_artist",
  "client",
] as const;

export type Role = (typeof ROLE_VALUES)[number];

export const roleEnum = pgEnum("role", ROLE_VALUES);

// Higher number = more authority, matching ROLE_HIERARCHY's ranking.
export const ROLE_RANK: Record<Role, number> = {
  vfx_producer: 8,
  production_manager: 7,
  coordinator: 6,
  supervisor: 5,
  lead: 4,
  senior_artist: 3,
  artist: 2,
  junior_artist: 1,
  client: 0,
};
```

- [ ] **Step 2: Create `lib/db/src/schema/studios.ts`**

```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studiosTable = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertStudioSchema = createInsertSchema(studiosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStudio = z.infer<typeof insertStudioSchema>;
export type Studio = typeof studiosTable.$inferSelect;
```

- [ ] **Step 3: Create `lib/db/src/schema/users.ts`**

```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studiosTable } from "./studios";
import { roleEnum } from "./roles";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studiosTable.id),
  empId: text("emp_id").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
```

- [ ] **Step 4: Replace the placeholder in `lib/db/src/schema/index.ts`**

```typescript
export * from "./roles";
export * from "./studios";
export * from "./users";
```

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema
git commit -m "feat: define studios and users tables with role enum"
```

---

### Task 4: Push schema and seed demo users

**Files:**
- Modify: `lib/db/package.json`
- Create: `lib/db/src/seed.ts`

**Interfaces:**
- Consumes: `db`, `pool`, `studiosTable`, `usersTable` from `./index`.
- Produces: A seeded `nebula` studio and 9 demo user rows (one per role), password `forge123` for all, bcrypt-hashed.

- [ ] **Step 1: Add `bcryptjs` and a `seed` script to `lib/db/package.json`**

Add to `dependencies`: `"bcryptjs": "^3.0.2"`.
Add to `devDependencies`: `"tsx": "catalog:"`.
Add to `scripts`: `"seed": "tsx src/seed.ts"`.

The full `package.json` should read:

```json
{
  "name": "@workspace/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "push": "drizzle-kit push --config ./drizzle.config.ts",
    "push-force": "drizzle-kit push --force --config ./drizzle.config.ts",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "bcryptjs": "^3.0.2",
    "drizzle-orm": "catalog:",
    "drizzle-zod": "^0.8.3",
    "pg": "^8.22.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/pg": "^8.20.0",
    "drizzle-kit": "^0.31.10",
    "tsx": "catalog:"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`
Expected: lockfile updates, no `minimumReleaseAge` rejection (see Global Constraints if it does).

- [ ] **Step 3: Create `lib/db/src/seed.ts`**

```typescript
import bcrypt from "bcryptjs";
import { db, pool, studiosTable, usersTable } from "./index";

// Demo accounts, one per role. Names match real entries in
// artifacts/forge/src/data/mockData.ts's USERS array so the frontend can
// enrich the authenticated identity with that mock profile's display
// fields (avatar, title, department, skills) until Phase 1 makes Users a
// fully real entity. See lib/db/src/seed.ts and
// artifacts/forge/src/data/demoAccounts.ts — keep both lists in sync.
const DEMO_PASSWORD = "forge123";

const DEMO_USERS = [
  { empId: "DEMO-PRODUCER", email: "maya@nebula.co", name: "Maya Chen", role: "vfx_producer" },
  { empId: "DEMO-PM", email: "ethan@nebula.co", name: "Ethan Brooks", role: "production_manager" },
  { empId: "DEMO-COORD", email: "kofi@nebula.co", name: "Kofi Mensah", role: "coordinator" },
  { empId: "DEMO-SUPERVISOR", email: "luca@nebula.co", name: "Luca Moretti", role: "supervisor" },
  { empId: "DEMO-LEAD", email: "isla@nebula.co", name: "Isla MacLeod", role: "lead" },
  { empId: "DEMO-SENIOR", email: "mia@nebula.co", name: "Mia Rodriguez", role: "senior_artist" },
  { empId: "DEMO-ARTIST", email: "jin@nebula.co", name: "Jin Park", role: "artist" },
  { empId: "DEMO-JUNIOR", email: "clara@nebula.co", name: "Clara Werner", role: "junior_artist" },
  { empId: "DEMO-CLIENT", email: "client@nebula.co", name: "External Client", role: "client" },
] as const;

async function seed() {
  const [studio] = await db
    .insert(studiosTable)
    .values({ name: "Nebula VFX", slug: "nebula" })
    .onConflictDoUpdate({
      target: studiosTable.slug,
      set: { name: "Nebula VFX" },
    })
    .returning();

  if (!studio) {
    throw new Error("Failed to create or find the seed studio");
  }

  for (const user of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    await db
      .insert(usersTable)
      .values({
        studioId: studio.id,
        empId: user.empId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: usersTable.empId,
        set: {
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
          studioId: studio.id,
        },
      });
  }

  console.log(
    `Seeded studio "${studio.name}" with ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD})`,
  );
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Push the schema to the local database**

Run: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge && pnpm --filter @workspace/db run push`
Expected: drizzle-kit reports the `role` enum and `studios`/`users` tables created, no errors.

- [ ] **Step 5: Run the seed script**

Run: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge && pnpm --filter @workspace/db run seed`
Expected: prints `Seeded studio "Nebula VFX" with 9 demo users (password: forge123)`.

- [ ] **Step 6: Verify the rows landed**

Run: `docker exec forge-postgres psql -U forge -d forge -c "select emp_id, role from users order by emp_id;"`
Expected: 9 rows, one per `DEMO-*` empId, roles matching the list above.

- [ ] **Step 7: Commit**

```bash
git add lib/db/package.json lib/db/src/seed.ts pnpm-lock.yaml
git commit -m "feat: seed demo studio and one user per role"
```

---

### Task 5: Password hashing utility

**Files:**
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/src/lib/auth/password.ts`
- Create: `artifacts/api-server/src/lib/auth/password.test.ts`
- Create: `artifacts/api-server/vitest.config.ts`
- Create: `artifacts/api-server/vitest.setup.ts`

**Interfaces:**
- Produces: `hashPassword(plainText: string): Promise<string>`, `verifyPassword(plainText: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Add `bcryptjs`, `vitest`, and a `test` script to `artifacts/api-server/package.json`**

Add to `dependencies`: `"bcryptjs": "^3.0.2"`.
Add to `devDependencies`: `"vitest": "^3.2.4"`.
Add to `scripts`: `"test": "vitest run"`.

The full `package.json` should read:

```json
{
  "name": "@workspace/api-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "export NODE_ENV=development && pnpm run build && pnpm run start",
    "build": "node ./build.mjs",
    "start": "node --enable-source-maps ./dist/index.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@workspace/api-zod": "workspace:*",
    "@workspace/db": "workspace:*",
    "bcryptjs": "^3.0.2",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "drizzle-orm": "catalog:",
    "express": "^5.2.1",
    "pino": "^9.14.0",
    "pino-http": "^10.5.0"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "catalog:",
    "esbuild": "0.27.3",
    "esbuild-plugin-pino": "^2.3.3",
    "pino-pretty": "^13.1.3",
    "thread-stream": "3.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

- [ ] **Step 3: Create `artifacts/api-server/vitest.setup.ts`**

```typescript
process.env.JWT_SECRET ??= "test-secret-do-not-use-in-production";
process.env.NODE_ENV ??= "test";
```

- [ ] **Step 4: Create `artifacts/api-server/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 5: Write the failing test in `artifacts/api-server/src/lib/auth/password.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password", async () => {
    const hash = await hashPassword("forge123");
    await expect(verifyPassword("forge123", hash)).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("forge123");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a hash different from the plaintext input", async () => {
    const hash = await hashPassword("forge123");
    expect(hash).not.toBe("forge123");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module './password'`.

- [ ] **Step 7: Implement `artifacts/api-server/src/lib/auth/password.ts`**

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(
  plainText: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/vitest.config.ts artifacts/api-server/vitest.setup.ts artifacts/api-server/src/lib/auth/password.ts artifacts/api-server/src/lib/auth/password.test.ts pnpm-lock.yaml
git commit -m "feat: add bcrypt password hashing utility"
```

---

### Task 6: JWT sessions and auth middleware

**Files:**
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/src/lib/auth/jwt.ts`
- Create: `artifacts/api-server/src/lib/auth/jwt.test.ts`
- Create: `artifacts/api-server/src/lib/auth/cookies.ts`
- Create: `artifacts/api-server/src/middlewares/requireAuth.ts`
- Create: `artifacts/api-server/src/middlewares/requireAuth.test.ts`
- Create: `artifacts/api-server/src/middlewares/requireMinRole.ts`
- Create: `artifacts/api-server/src/middlewares/requireMinRole.test.ts`

**Interfaces:**
- Consumes: `Role` (type-only, from `@workspace/db`).
- Produces: `SessionPayload`, `signSessionToken`, `verifySessionToken`, `SESSION_COOKIE_NAME`, `setSessionCookie`, `clearSessionCookie`, `requireAuth` (Express middleware attaching `req.user`), `requireMinRole(minRole)` (Express middleware factory).

- [ ] **Step 1: Add `jsonwebtoken` to `artifacts/api-server/package.json`**

Add to `dependencies`: `"jsonwebtoken": "^9.0.2"`.
Add to `devDependencies`: `"@types/jsonwebtoken": "^9.0.7"`.

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

- [ ] **Step 3: Write the failing test in `artifacts/api-server/src/lib/auth/jwt.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt";

describe("session tokens", () => {
  const payload = {
    sub: "user-1",
    studioId: "studio-1",
    role: "artist" as const,
  };

  it("round-trips a signed token", () => {
    const token = signSessionToken(payload);
    expect(verifySessionToken(token)).toMatchObject(payload);
  });

  it("rejects a tampered token", () => {
    const token = signSessionToken(payload);
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifySessionToken("not-a-jwt")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module './jwt'`.

- [ ] **Step 5: Implement `artifacts/api-server/src/lib/auth/jwt.ts`**

```typescript
import jwt from "jsonwebtoken";
import type { Role } from "@workspace/db";

export interface SessionPayload {
  sub: string;
  studioId: string;
  role: Role;
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set. Did you forget to provision it?");
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 7: Create `artifacts/api-server/src/lib/auth/cookies.ts`**

```typescript
import type { Response } from "express";

export const SESSION_COOKIE_NAME = "forge_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}
```

- [ ] **Step 8: Write the failing test in `artifacts/api-server/src/middlewares/requireAuth.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { requireAuth } from "./requireAuth";
import { signSessionToken } from "../lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../lib/auth/cookies";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAuth", () => {
  it("attaches req.user for a valid session cookie", () => {
    const token = signSessionToken({ sub: "u1", studioId: "s1", role: "artist" });
    const req = { cookies: { [SESSION_COOKIE_NAME]: token } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.user).toEqual({ id: "u1", studioId: "s1", role: "artist" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 401 when there is no session cookie", () => {
    const req = { cookies: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 for a tampered session cookie", () => {
    const token = signSessionToken({ sub: "u1", studioId: "s1", role: "artist" });
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: `${token}tampered` },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module './requireAuth'`.

- [ ] **Step 10: Implement `artifacts/api-server/src/middlewares/requireAuth.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import type { Role } from "@workspace/db";
import { verifySessionToken } from "../lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../lib/auth/cookies";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; studioId: string; role: Role };
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const payload = typeof token === "string" ? verifySessionToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.user = { id: payload.sub, studioId: payload.studioId, role: payload.role };
  next();
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 12: Write the failing test in `artifacts/api-server/src/middlewares/requireMinRole.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { requireMinRole } from "./requireMinRole";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireMinRole", () => {
  it("allows a role at or above the minimum", () => {
    const req = { user: { id: "u1", studioId: "s1", role: "supervisor" } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a role below the minimum with 403", () => {
    const req = { user: { id: "u1", studioId: "s1", role: "artist" } } as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with 401", () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    requireMinRole("lead")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL — `Cannot find module './requireMinRole'`.

- [ ] **Step 14: Implement `artifacts/api-server/src/middlewares/requireMinRole.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { ROLE_RANK } from "@workspace/db";
import type { Role } from "@workspace/db";

export function requireMinRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }

    next();
  };
}
```

- [ ] **Step 15: Run the full test suite to verify it passes**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, all suites green.

- [ ] **Step 16: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 17: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/src/lib/auth artifacts/api-server/src/middlewares pnpm-lock.yaml
git commit -m "feat: add JWT session tokens and auth/RBAC middleware"
```

---

### Task 7: Extend OpenAPI spec with auth endpoints

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces: Generated `LoginRequest`, `AuthUser` Zod schemas in `@workspace/api-zod`; generated `loginUser`, `logoutUser`, `getCurrentUser` functions + React Query hooks in `@workspace/api-client-react`.

- [ ] **Step 1: Replace `lib/api-spec/openapi.yaml` with the following**

```yaml
openapi: 3.1.0
info:
  # Do not change the title, if the title changes, the import paths will be broken
  title: Api
  version: 0.1.0
  description: API specification
servers:
  - url: /api
    description: Base API path
tags:
  - name: health
    description: Health operations
  - name: auth
    description: Authentication operations
paths:
  /healthz:
    get:
      operationId: healthCheck
      tags: [health]
      summary: Health check
      description: Returns server health status
      responses:
        "200":
          description: Healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"
  /auth/login:
    post:
      operationId: loginUser
      tags: [auth]
      summary: Log in with employee ID and password
      description: Verifies credentials and sets an httpOnly session cookie.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/LoginRequest"
      responses:
        "200":
          description: Authenticated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUser"
        "400":
          description: Invalid request body
        "401":
          description: Invalid employee ID or password
  /auth/logout:
    post:
      operationId: logoutUser
      tags: [auth]
      summary: Log out
      description: Clears the session cookie.
      responses:
        "204":
          description: Logged out
  /auth/me:
    get:
      operationId: getCurrentUser
      tags: [auth]
      summary: Get the current session's user
      description: Returns the authenticated user for the session cookie.
      responses:
        "200":
          description: Current user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUser"
        "401":
          description: Not authenticated
components:
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
      required:
        - status
    LoginRequest:
      type: object
      properties:
        empId:
          type: string
        password:
          type: string
      required:
        - empId
        - password
    AuthUser:
      type: object
      properties:
        id:
          type: string
        empId:
          type: string
        name:
          type: string
        email:
          type: string
        studioId:
          type: string
        role:
          type: string
          enum:
            - vfx_producer
            - production_manager
            - coordinator
            - supervisor
            - lead
            - senior_artist
            - artist
            - junior_artist
            - client
      required:
        - id
        - empId
        - name
        - email
        - studioId
        - role
```

- [ ] **Step 2: Regenerate codegen**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: `lib/api-zod/src/generated/` gains `loginRequest.ts`/`authUser.ts`-style type files and updated `api.ts`; `lib/api-client-react/src/generated/api.ts` gains `loginUser`, `logoutUser`, `getCurrentUser` functions and matching hooks. Command also runs `typecheck:libs` as its last step — confirm it reports no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat: add auth endpoints to OpenAPI spec and regenerate codegen"
```

---

### Task 8: Auth routes wired into the Express app

**Files:**
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/src/routes/auth.ts`
- Create: `artifacts/api-server/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `db`, `usersTable` from `@workspace/db`; `LoginRequest`, `AuthUser` from `@workspace/api-zod`; `hashPassword`/`verifyPassword`, `signSessionToken`, `setSessionCookie`/`clearSessionCookie`, `requireAuth` from Task 5/6.
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

- [ ] **Step 1: Wire `cookie-parser` into `artifacts/api-server/src/app.ts`**

```typescript
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
```

- [ ] **Step 2: Add `supertest` to `artifacts/api-server/package.json`**

Add to `devDependencies`: `"supertest": "^7.1.1"`, `"@types/supertest": "^6.0.2"`.

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`

- [ ] **Step 4: Write the failing test in `artifacts/api-server/src/routes/auth.test.ts`**

```typescript
import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { db, studiosTable, usersTable } from "@workspace/db";
import app from "../app";

const TEST_EMP_ID = "TEST-AUTH-USER";
const TEST_PASSWORD = "test-password-123";

beforeAll(async () => {
  const [studio] = await db
    .insert(studiosTable)
    .values({ name: "Test Studio", slug: "test-studio-auth" })
    .onConflictDoUpdate({
      target: studiosTable.slug,
      set: { name: "Test Studio" },
    })
    .returning();

  if (!studio) throw new Error("Failed to create test studio");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  await db
    .insert(usersTable)
    .values({
      studioId: studio.id,
      empId: TEST_EMP_ID,
      email: "test-auth-user@example.com",
      name: "Test Auth User",
      role: "artist",
      passwordHash,
    })
    .onConflictDoUpdate({
      target: usersTable.empId,
      set: { passwordHash, studioId: studio.id },
    });
});

describe("POST /api/auth/login", () => {
  it("sets a session cookie and returns the user on valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ empId: TEST_EMP_ID, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ empId: TEST_EMP_ID, role: "artist" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/forge_session=/);
  });

  it("rejects an invalid password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ empId: TEST_EMP_ID, password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown employee ID", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ empId: "NOT-A-USER", password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid session", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ empId: TEST_EMP_ID, password: TEST_PASSWORD });

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ empId: TEST_EMP_ID });
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie so /auth/me becomes unauthenticated", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ empId: TEST_EMP_ID, password: TEST_PASSWORD });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge && pnpm --filter @workspace/api-server run test`
Expected: FAIL — `/api/auth/login` returns 404 (route doesn't exist yet).

- [ ] **Step 6: Implement `artifacts/api-server/src/routes/auth.ts`**

```typescript
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginRequest, AuthUser } from "@workspace/api-zod";
import { verifyPassword } from "../lib/auth/password";
import { signSessionToken } from "../lib/auth/jwt";
import { setSessionCookie, clearSessionCookie } from "../lib/auth/cookies";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function toAuthUser(user: typeof usersTable.$inferSelect) {
  return AuthUser.parse({
    id: user.id,
    empId: user.empId,
    name: user.name,
    email: user.email,
    role: user.role,
    studioId: user.studioId,
  });
}

router.post("/auth/login", async (req, res) => {
  const body = LoginRequest.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.empId, body.data.empId))
    .limit(1);

  const passwordValid = user
    ? await verifyPassword(body.data.password, user.passwordHash)
    : false;

  if (!user || !passwordValid) {
    res.status(401).json({ error: "Invalid employee ID or password" });
    return;
  }

  const token = signSessionToken({
    sub: user.id,
    studioId: user.studioId,
    role: user.role,
  });
  setSessionCookie(res, token);
  res.json(toAuthUser(user));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(toAuthUser(user));
});

export default router;
```

- [ ] **Step 7: Wire the router into `artifacts/api-server/src/routes/index.ts`**

```typescript
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

export default router;
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge && pnpm --filter @workspace/api-server run test`
Expected: PASS, all suites green.

- [ ] **Step 9: Typecheck and build**

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server run build`
Expected: no errors.

- [ ] **Step 10: Manually verify the server boots and login works end-to-end**

Run: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge JWT_SECRET=dev-secret-change-me PORT=5000 && pnpm --filter @workspace/api-server run dev`
In another shell: `curl -i -c /tmp/forge-cookies.txt -X POST http://localhost:5000/api/auth/login -H 'content-type: application/json' -d '{"empId":"DEMO-PRODUCER","password":"forge123"}'`
Expected: `200 OK`, JSON body with `"role":"vfx_producer"`, a `Set-Cookie: forge_session=...` header. Then: `curl -i -b /tmp/forge-cookies.txt http://localhost:5000/api/auth/me` returns the same user. Stop the dev server (Ctrl+C) when done.

- [ ] **Step 11: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/src/app.ts artifacts/api-server/src/routes pnpm-lock.yaml
git commit -m "feat: implement /api/auth login, logout, me endpoints"
```

---

### Task 9: Wire frontend auth store to the real API

**Files:**
- Create: `artifacts/forge/src/data/demoAccounts.ts`
- Modify: `artifacts/forge/src/store/auth.ts`
- Modify: `artifacts/forge/src/App.tsx`
- Modify: `artifacts/forge/src/pages/login.tsx`
- Modify: `artifacts/forge/src/components/shell/TopBar.tsx`
- Modify: `artifacts/forge/vite.config.ts`

**Interfaces:**
- Consumes: `loginUser`, `logoutUser`, `getCurrentUser`, `AuthUser` (type) from `@workspace/api-client-react`.
- Produces: `useAuthStore` with `login(empId, password): Promise<boolean>`, `logout(): Promise<void>`, `initAuth(): Promise<void>`, `isInitializing: boolean`. `currentUser` keeps the existing mock `User` shape (enriched by matching name against `mockData.ts`'s `USERS`), so every other page consuming `currentUser` (`home.tsx`, `tasks.tsx`, `review.tsx`, `profile.tsx`, `TopBar.tsx`, `CreateTaskModal.tsx`, `TaskDrawer.tsx`, etc.) keeps working unchanged.

- [ ] **Step 1: Add the dev proxy to `artifacts/forge/vite.config.ts`**

```typescript
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: path.resolve(process.cwd(), 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-toast'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
```

This makes `/api/...` requests from the browser same-origin during dev (proxied to `artifacts/api-server`), so the `forge_session` cookie round-trips automatically without any CORS/credentials configuration.

- [ ] **Step 2: Create `artifacts/forge/src/data/demoAccounts.ts`**

```typescript
// Login credentials for the 9 seeded demo accounts (lib/db/src/seed.ts).
// Names match real entries in ./mockData.ts's USERS array so the auth
// store can enrich the real, backend-authenticated identity with that
// mock profile's display fields — a Phase 0 stopgap until Phase 1 makes
// Users a fully real, backend-owned entity. Keep both lists in sync.
export interface DemoAccount {
  empId: string;
  password: string;
  name: string;
  role: string;
}

export const DEMO_PASSWORD = 'forge123';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { empId: 'DEMO-PRODUCER', password: DEMO_PASSWORD, name: 'Maya Chen', role: 'vfx_producer' },
  { empId: 'DEMO-PM', password: DEMO_PASSWORD, name: 'Ethan Brooks', role: 'production_manager' },
  { empId: 'DEMO-COORD', password: DEMO_PASSWORD, name: 'Kofi Mensah', role: 'coordinator' },
  { empId: 'DEMO-SUPERVISOR', password: DEMO_PASSWORD, name: 'Luca Moretti', role: 'supervisor' },
  { empId: 'DEMO-LEAD', password: DEMO_PASSWORD, name: 'Isla MacLeod', role: 'lead' },
  { empId: 'DEMO-SENIOR', password: DEMO_PASSWORD, name: 'Mia Rodriguez', role: 'senior_artist' },
  { empId: 'DEMO-ARTIST', password: DEMO_PASSWORD, name: 'Jin Park', role: 'artist' },
  { empId: 'DEMO-JUNIOR', password: DEMO_PASSWORD, name: 'Clara Werner', role: 'junior_artist' },
  { empId: 'DEMO-CLIENT', password: DEMO_PASSWORD, name: 'External Client', role: 'client' },
];
```

- [ ] **Step 3: Rewrite `artifacts/forge/src/store/auth.ts`**

```typescript
import { create } from 'zustand';
import { loginUser, logoutUser, getCurrentUser } from '@workspace/api-client-react';
import type { AuthUser } from '@workspace/api-client-react';
import { USERS } from '@/data/mockData';
import type { User } from '@/data/mockData';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  loginError: string | null;
  login: (empId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
  clearError: () => void;
}

function resolveProfile(authUser: AuthUser): User | null {
  const mockProfile = USERS.find((u) => u.name === authUser.name);
  if (!mockProfile) return null;
  return { ...mockProfile, id: authUser.id, role: authUser.role, email: authUser.email };
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isInitializing: true,
  loginError: null,

  login: async (empId, password) => {
    try {
      const authUser = await loginUser({ empId, password });
      const currentUser = resolveProfile(authUser);
      if (!currentUser) {
        set({ loginError: 'This account has no demo profile configured yet.' });
        return false;
      }
      set({ currentUser, isAuthenticated: true, loginError: null });
      return true;
    } catch {
      set({ loginError: 'Invalid Employee ID or password.' });
      return false;
    }
  },

  logout: async () => {
    await logoutUser().catch(() => {});
    set({ currentUser: null, isAuthenticated: false, loginError: null });
  },

  initAuth: async () => {
    try {
      const authUser = await getCurrentUser();
      set({
        currentUser: resolveProfile(authUser),
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch {
      set({ currentUser: null, isAuthenticated: false, isInitializing: false });
    }
  },

  clearError: () => set({ loginError: null }),
}));
```

- [ ] **Step 4: Call `initAuth` once on mount and gate `AuthGuard` on it in `artifacts/forge/src/App.tsx`**

Modify the `AuthGuard` function and the `App` function (leave every other import, guard, and route unchanged):

```typescript
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isAuthenticated, isInitializing, setLocation]);

  if (isInitializing || !isAuthenticated) return null;
  return <>{children}</>;
}
```

```typescript
function App() {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Rewrite `artifacts/forge/src/pages/login.tsx`**

```typescript
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { DEMO_ACCOUNTS } from '@/data/demoAccounts';
import { ROLE_LABELS } from '@/data/mockData';
import { MonitorPlay, Briefcase, Video, Crown, ChevronDown, Lock } from 'lucide-react';

export default function Login() {
  const { login } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(false);

  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');

  const routeForRole = (role: string) => {
    if (role === 'client') return '/client-review';
    if (role === 'vfx_producer' || role === 'production_manager') return '/production';
    if (role === 'artist' || role === 'senior_artist') return '/tasks';
    return '/';
  };

  const doLogin = async (targetEmpId: string, targetPassword: string) => {
    setIsLoading(true);
    const ok = await login(targetEmpId, targetPassword);
    setIsLoading(false);

    if (!ok) {
      toast({ title: 'Login Failed', description: 'Invalid Employee ID or Password.', variant: 'destructive' });
      return;
    }

    const account = DEMO_ACCOUNTS.find((a) => a.empId === targetEmpId);
    setLocation(routeForRole(account?.role ?? ''));
  };

  const quickLogin = (role: string) => {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role);
    if (!account) return;
    void doLogin(account.empId, account.password);
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin(empId, password);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col items-center">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <div className="w-8 h-8 bg-card rounded-md" />
            </div>
            <span className="text-5xl font-bold tracking-tight">Forge</span>
          </div>
          <p className="text-muted-foreground text-lg">Select Your Portal</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('client')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <MonitorPlay className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-emerald-500 transition-colors">Client Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">External review & approvals.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('artist')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Video className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-blue-500 transition-colors">Artist Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">Task execution & time tracking.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('lead')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Crown className="w-8 h-8 text-purple-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-purple-500 transition-colors">Lead Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">Department oversight & QC.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('vfx_producer')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Briefcase className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-orange-500 transition-colors">Production</h3>
                <p className="text-xs text-muted-foreground mt-2">Global pipeline & schedules.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading && (
          <div className="mt-8 text-sm text-muted-foreground animate-pulse flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Authenticating...
          </div>
        )}

        <div className="mt-12 w-full max-w-sm">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="pt-6">
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="empId">Employee ID</Label>
                  <Input
                    id="empId"
                    placeholder="e.g. DEMO-ARTIST"
                    value={empId}
                    onChange={e => setEmpId(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full gap-2 mt-2">
                  <Lock className="w-4 h-4" /> Secure Login
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 w-full max-w-2xl bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <button
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-3"
            onClick={() => setShowQuickPick(!showQuickPick)}
          >
            Demo Accounts
            <ChevronDown className={`w-4 h-4 transition-transform ${showQuickPick ? 'rotate-180' : ''}`} />
          </button>

          {showQuickPick && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200 mt-4">
              {DEMO_ACCOUNTS.map(account => (
                <button
                  key={account.empId}
                  onClick={() => void doLogin(account.empId, account.password)}
                  className="w-full flex items-center gap-4 px-4 py-2.5 rounded-md border border-border/50 bg-background/50 hover:bg-muted/80 hover:border-primary/50 transition-all text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{account.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{ROLE_LABELS[account.role as keyof typeof ROLE_LABELS] ?? account.role}</div>
                  </div>
                  <div className="text-xs font-mono font-medium text-muted-foreground">{account.empId}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update the "Demo: Switch Role" menu in `artifacts/forge/src/components/shell/TopBar.tsx`**

Replace the `USERS` import and the switch-role block. First, remove `import { USERS } from '@/data/mockData';` and add:

```typescript
import { DEMO_ACCOUNTS } from '@/data/demoAccounts';
```

Then change the destructured store values from `const { currentUser, logout, switchUser } = useAuthStore();` to:

```typescript
const { currentUser, logout, login } = useAuthStore();
```

Then replace the switch-role `DropdownMenuItem` block:

```typescript
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Demo: Switch Role</div>
            {DEMO_ACCOUNTS.filter(a => ['vfx_producer', 'artist', 'lead'].includes(a.role)).map(account => (
              <DropdownMenuItem
                key={account.empId}
                onClick={async () => {
                  const ok = await login(account.empId, account.password);
                  if (ok) window.location.reload();
                }}
                className={`cursor-pointer ${currentUser.empId === account.empId ? 'bg-primary/10' : ''}`}
              >
                {account.name} ({ROLE_LABELS[account.role as keyof typeof ROLE_LABELS] || account.role})
              </DropdownMenuItem>
            ))}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. If `AuthUser['role']` and `User['role']` are reported incompatible, check the exact string literals generated in `lib/api-client-react/src/generated/api.schemas.ts` against `ROLE_VALUES` in `lib/db/src/schema/roles.ts` — they must match exactly.

- [ ] **Step 8: Manually verify the login flow in the browser**

Run in one shell: `export DATABASE_URL=postgresql://forge:forge@localhost:5433/forge JWT_SECRET=dev-secret-change-me PORT=5000 && pnpm --filter @workspace/api-server run dev`
Run in another shell: `pnpm --filter @workspace/forge run dev`
Open `http://localhost:5173/login`, click the "Production" portal card (or expand "Demo Accounts" and click "Maya Chen"). Expected: redirected to `/production`, TopBar shows "Maya Chen" with avatar and department from the mock profile. Reload the page — expected: still logged in (session restored via `/api/auth/me`), no flash of the login page. Click "Log out" in the TopBar user menu — expected: redirected to `/login`.

- [ ] **Step 9: Commit**

```bash
git add artifacts/forge/src/data/demoAccounts.ts artifacts/forge/src/store/auth.ts artifacts/forge/src/App.tsx artifacts/forge/src/pages/login.tsx artifacts/forge/src/components/shell/TopBar.tsx artifacts/forge/vite.config.ts
git commit -m "feat: wire frontend login to real /api/auth endpoints"
```
