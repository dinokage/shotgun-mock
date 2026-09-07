# RBAC/Login Core (Sub-projects A, B, C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Lead/Manager role duality into one `lead` role with a
single-gate review chain; replace the fake 6-card login picker with one
real employee login that routes by actual DB role; add a client
access-link flow (code redemption → scoped session) to replace the
hardcoded `"demo"` access-code check; add role-based route/sidebar
visibility so each role only sees pages it can use.

**Architecture:** This is the first of several plans implementing
`docs/superpowers/specs/2026-09-01-final-phase-rbac-login-admin-deploy-design.md`
— specifically Sub-projects A, B, and C, chosen first because everything
else in that spec (client-review producer gate, route guarding, RBAC
enforcement on other routes) depends on the role model being final and the
login flow actually routing by real role. Sub-projects D (timesheets/
Kanban-assign/chat/media-upload/eraser/drag-fix), E (producer approve-for-
client gate), G (data reset + admin bootstrap), and I (Jenkins deploy) are
separate follow-up plans. Sub-project F (logo/light-theme) is blocked on
user input and not planned here.

**Tech Stack:** Express + Drizzle ORM (backend), React + Wouter + TanStack
Query (frontend), JWT session cookies (`jsonwebtoken`, `argon2`) — all
already established in this codebase, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-final-phase-rbac-login-admin-deploy-design.md`

## Global Constraints

- Drizzle ORM only; any schema change needs a real `drizzle-kit generate`
  migration, checked for drops before applying.
- `pnpm run typecheck` must stay green after every task.
- No changes to `artifacts/mockup-sandbox`.
- No test suite in this repo — verification is typecheck + manual
  curl/browser checks, same as every prior plan this project has used.
- **Every new write-capability restriction must be enforced server-side**
  (a `requireCapability` call or an inline role/scope check in the route
  handler), never frontend-hiding alone — this is the spec's explicit
  security requirement (§9 of the spec) and applies to every task below
  that adds a restriction.
- Work happens on `main` directly or an isolated worktree per the
  standing SDD process — controller's call at execution time, following
  the same worktree-isolation discipline established in the prior plan
  (never run `docker-compose`/DB-touching commands against the shared dev
  stack from inside a worktree; the controller does those steps directly).

---

### Task 1: Collapse the review-status chain (`manager-review` removed)

**Files:**
- Modify: `artifacts/forge/src/data/mockData.ts` (the `TaskStatus` type and
  the `ApprovalEvent.action` union)
- Modify: `artifacts/forge/src/components/shared/StepTracker.tsx`
- Modify: `artifacts/forge/src/components/shared/PipelineVisualizer.tsx`
- Modify: `artifacts/forge/src/components/shared/review/FeedbackList.tsx`
- Modify: `artifacts/forge/src/components/shared/StatusBadge.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shell/Sidebar.tsx`
- Modify: `artifacts/forge/src/pages/home.tsx`
- Modify: `artifacts/forge/src/pages/department-detail.tsx`
- Modify: `artifacts/forge/src/pages/project-detail/TasksKanban.tsx`
- Modify: `artifacts/forge/src/pages/project-detail/TasksList.tsx`
- Modify: `artifacts/forge/src/pages/review.tsx`
- Modify: `artifacts/forge/src/lib/aiInsights.ts`
- Modify: `artifacts/forge/src/hooks/useTasks.ts` (approval-event action
  union only — no schema/route change, that column is already free-text)

**Interfaces:**
- Produces: `TaskStatus` (no longer includes `"manager-review"`),
  `ApprovalEvent["action"]` (no longer includes
  `"submitted-for-manager-review"`) — every later task in this plan and
  future plans uses this narrowed type.

- [ ] **Step 1: Narrow the two type unions in `mockData.ts`.** Remove the
  `| "manager-review"` line from `TaskStatus` (around line 228) and the
  `| "submitted-for-manager-review"` line from `ApprovalEvent["action"]`
  (around line 210). Do NOT touch `"submitted-for-lead-review"` or any
  other value — only the two `manager`-named literals.

- [ ] **Step 2: Run typecheck and read every resulting error.** Run:
  ```
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/repo" -w /repo -e CI=true node:24-alpine sh -c "corepack enable && pnpm run typecheck"
  ```
  Removing the type literal turns every remaining `"manager-review"` /
  `"submitted-for-manager-review"` string literal in the codebase into a
  type error — this is the mechanism that finds every site needing a fix,
  so don't skip straight to grepping; let the compiler enumerate them,
  then fix each per Step 3's rules, then re-run until clean.

- [ ] **Step 3: Fix each flagged site using these rules** (apply the rule
  matching what the code is doing — every real occurrence in this
  codebase falls into one of these four shapes):
  - **A stage/step definition** (e.g. `StepTracker.tsx`'s `STAGES` array,
    `PipelineVisualizer.tsx`'s stage list): delete the `manager-review`
    stage entry entirely. In `StepTracker.tsx` specifically, delete the
    whole `{ key: "manager-review", label: "Manager Review", statuses:
    ["manager-review"] }` object (lines 27-31) — the array becomes
    `submitted → lead-review → approved`, three stages instead of four.
    Update the file's own top comment (line 6) to say
    `review/lead-review -> approved` instead of the four-stage chain it
    currently describes.
  - **A status→style/label map** (`StatusBadge.tsx`'s `STATUS_STYLES`,
    `FeedbackList.tsx`'s label map, `TaskDrawer.tsx`'s color map): delete
    the `"manager-review": ...` entry.
  - **A status-membership check** (`t.status === "lead-review" ||
    t.status === "manager-review"` in `home.tsx`, `Sidebar.tsx`,
    `department-detail.tsx`; `["review", "lead-review", "manager-review",
    "approved"].includes(...)` in `TaskDrawer.tsx`): delete the
    `manager-review` branch/array-entry, keep the rest of the condition
    working the same way for the remaining statuses.
  - **A literal status value assigned somewhere** (`TaskDrawer.tsx:506`'s
    `status: "manager-review"` inside whatever button/handler sets a
    task's status forward through the chain, `TasksKanban.tsx`'s
    `{ id: "manager-review", title: "Manager Review" }` column definition,
    `TasksList.tsx`'s status-select `<SelectItem value="manager-review">`,
    `review.tsx`'s `"submitted-for-manager-review": "submitted for Manager
    review"` label map, `aiInsights.ts`'s reference to the status,
    `useTasks.ts`'s `APPROVAL_EVENT_ACTIONS` array): delete the
    entry/branch. Where a status-advancing action button currently reads
    "Submit for Manager Review" or similar and sets `status:
    "manager-review"`, that action is now redundant — a task that just
    left `lead-review` goes straight to `approved`, so delete the button/
    branch rather than repointing it (verify against Task 2's backend
    change, which does the same collapse server-side, so there's no
    button whose only destination no longer exists).

- [ ] **Step 4: Confirm zero remaining `manager-review`/
  `submitted-for-manager-review` string occurrences** with a final grep
  across `artifacts/forge/src` (comments referencing the *old* shape for
  historical context are fine to leave — e.g. a comment explaining why a
  migration exists — but no live code path should reference the removed
  status).

- [ ] **Step 5: Re-run typecheck to confirm 0 errors**, per Step 2's
  command.

- [ ] **Step 6: Commit**
  ```bash
  git add artifacts/forge/src/data/mockData.ts artifacts/forge/src/components/shared/StepTracker.tsx artifacts/forge/src/components/shared/PipelineVisualizer.tsx artifacts/forge/src/components/shared/review/FeedbackList.tsx artifacts/forge/src/components/shared/StatusBadge.tsx artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shell/Sidebar.tsx artifacts/forge/src/pages/home.tsx artifacts/forge/src/pages/department-detail.tsx artifacts/forge/src/pages/project-detail/TasksKanban.tsx artifacts/forge/src/pages/project-detail/TasksList.tsx artifacts/forge/src/pages/review.tsx artifacts/forge/src/lib/aiInsights.ts artifacts/forge/src/hooks/useTasks.ts
  git commit -m "refactor(frontend): collapse review chain to lead-review -> approved"
  ```

---

### Task 2: Server-side — leadership roles can never be a task's assignee

**Files:**
- Modify: `artifacts/api-server/src/routes/tasks.ts`

**Interfaces:**
- Consumes: existing `userInTenant(id, tenantId)` helper already in this
  file (from the full-backend-build-out plan's Task 14).
- Produces: `assignedToIsArtist(id, tenantId)` — a new helper other future
  routes/tasks can reuse the same pattern from.

- [ ] **Step 1: Read the current file in full** to find the exact POST `/`
  and PUT `/:id` handlers' `assignedTo` validation (currently just
  `userInTenant`, per the full-backend-build-out plan's Task 14).

- [ ] **Step 2: Add a role-checking helper next to `userInTenant`**:
  ```typescript
  // Leadership roles (admin/production_head/producer/lead) assign work,
  // they never hold it — enforced server-side per this phase's spec,
  // not just hidden in the UI, since a client that skips the frontend
  // could otherwise assign a task to a producer directly via the API.
  async function assignedToIsArtist(id: string, tenantId: string) {
    const [row] = await db
      .select({ roleName: tenantRolesTable.name })
      .from(usersTable)
      .innerJoin(tenantRolesTable, eq(usersTable.roleId, tenantRolesTable.id))
      .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
    return row?.roleName === "artist";
  }
  ```
  Add `tenantRolesTable` to the file's existing `@workspace/db/schema`
  import list.

- [ ] **Step 3: Call it in the POST `/` handler**, immediately after the
  existing `userInTenant(assignedTo, tenantId)` check (same `if
  (assignedTo && ...)` guard structure), returning `400 { error:
  "assignedTo must be an artist" }` if `assignedToIsArtist` returns false.
  Same addition in the PUT `/:id` handler's `"assignedTo" in req.body`
  block.

- [ ] **Step 4: Verify.** Run the typecheck command from Task 1 Step 2.
  Then (controller-run, not the implementer, per this repo's standing
  worktree-isolation rule — implementer stops after typecheck and reports
  DONE): curl `PUT /api/tasks/:id` with a real artist's id as
  `assignedTo` (expect 200) and with a real lead/producer's id (expect
  400).

- [ ] **Step 5: Commit**
  ```bash
  git add artifacts/api-server/src/routes/tasks.ts
  git commit -m "fix(api): reject non-artist assignedTo on tasks, server-side"
  ```

---

### Task 3: Extend session payload for client-scoped sessions

**Files:**
- Modify: `artifacts/api-server/src/lib/auth.ts`
- Modify: `artifacts/api-server/src/middleware/tenant.ts`

**Interfaces:**
- Produces: `SessionPayload` gains two new optional fields
  (`clientAccessLinkId?: string`, and `userId` becomes `string | null`);
  `tenantAuthMiddleware` sets `req.clientAccessLinkId` (new,
  `string | undefined`) alongside its existing `req.tenantId`/
  `req.userId`/`req.roleId`/`req.departmentId`. Task 5 (the redeem route)
  and Task 6 (client-review wiring) both depend on these exact field
  names.

- [ ] **Step 1: Extend `SessionPayload` in `auth.ts`**:
  ```typescript
  export interface SessionPayload {
    userId: string | null; // null for a client-access session (no real users row behind it)
    tenantId: string;
    roleId: string;
    departmentId: string | null;
    clientAccessLinkId?: string; // present only for client-access sessions; Task 4's redeem route sets this, Task 6's client-review routes use it to scope queries
  }
  ```
  `signSession`/`verifySession` need no change — they already operate on
  the whole payload generically.

- [ ] **Step 2: Extend `tenantAuthMiddleware` in `middleware/tenant.ts`**
  to also set `req.clientAccessLinkId = session.clientAccessLinkId;` next
  to its existing five assignments, and extend the `Express.Request`
  interface augmentation at the top of the file with
  `clientAccessLinkId?: string;`.

- [ ] **Step 3: Verify.** Run the typecheck command from Task 1 Step 2 —
  this will surface every existing route handler that destructures
  `req.userId!` with a non-null assertion against what's now a nullable
  field on the payload type only (not on `req.userId` itself, which stays
  `string | undefined` as before — the `SessionPayload.userId` nullability
  only affects `auth.ts`'s own internals and whatever reads
  `session.userId` directly, which today is nothing outside `auth.ts`
  itself and the login route that constructs the payload — confirm this
  with a repo-wide grep for `session.userId` and `SessionPayload` before
  concluding no other file needs a change).

- [ ] **Step 4: Commit**
  ```bash
  git add artifacts/api-server/src/lib/auth.ts artifacts/api-server/src/middleware/tenant.ts
  git commit -m "feat(api): extend session payload for client-access-link sessions"
  ```

---

### Task 4: `client_access_links` schema + migration

**Files:**
- Create: `lib/db/src/schema/client-access.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Produces: `clientAccessLinksTable` — `id, tenantId, code (unique per
  tenant), projectId (nullable FK), episodeId (nullable FK), versionId
  (nullable FK), createdByUserId (FK), expiresAt (nullable timestamp),
  revokedAt (nullable timestamp), createdAt`. Task 5's redeem route and a
  later plan's link-generation UI (Sub-project A's producer-facing side,
  not in this plan) both depend on this exact column set.

- [ ] **Step 1: Create `lib/db/src/schema/client-access.ts`**:
  ```typescript
  import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
  import { tenantsTable } from "./core";
  import { usersTable } from "./core";
  import { projectsTable, episodesTable } from "./production";
  import { versionsTable } from "./production";

  // A producer-generated link+code a client redeems (no password) to get
  // a scoped, read-mostly session limited to exactly one of
  // project/episode/version — never a whole tenant. Exactly one of
  // projectId/episodeId/versionId should be set per row (narrowest scope
  // wins); enforced at the route layer (Task 5), not a DB constraint,
  // since Drizzle has no clean CHECK-constraint builder for "exactly one
  // of N columns" and this project doesn't hand-write raw SQL constraints
  // elsewhere either.
  export const clientAccessLinksTable = pgTable(
    "client_access_links",
    {
      id: text("id").primaryKey(),
      tenantId: text("tenant_id")
        .notNull()
        .references(() => tenantsTable.id, { onDelete: "cascade" }),
      code: text("code").notNull(),
      projectId: text("project_id").references(() => projectsTable.id, {
        onDelete: "cascade",
      }),
      episodeId: text("episode_id").references(() => episodesTable.id, {
        onDelete: "cascade",
      }),
      versionId: text("version_id").references(() => versionsTable.id, {
        onDelete: "cascade",
      }),
      createdByUserId: text("created_by_user_id")
        .notNull()
        .references(() => usersTable.id, { onDelete: "cascade" }),
      expiresAt: timestamp("expires_at"),
      revokedAt: timestamp("revoked_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
      // A code only needs to be unique within its own tenant, not
      // globally — two different studios could otherwise never both
      // pick "REVIEW1".
      tenantCodeUnique: unique().on(table.tenantId, table.code),
    }),
  );
  ```

- [ ] **Step 2: Add `export * from "./client-access";` to
  `lib/db/src/schema/index.ts`**, alongside the existing barrel exports.

- [ ] **Step 3: Generate and apply the migration.** This touches the live
  shared dev database — per this project's standing rule, the controller
  runs this step directly (not the implementer, and never from inside a
  worktree if one is in use): `drizzle-kit generate` with a placeholder
  `DATABASE_URL`, verify the resulting SQL is additive-only (a brand new
  table — no existing table altered, so this should be trivially safe,
  but still read the generated file before applying), then apply it to
  the live `forge-db` the same way every prior migration in this project
  has been applied (`docker exec -i forge-db psql -U postgres -d forge <
  the migration file`).

- [ ] **Step 4: Verify.** Typecheck (Task 1 Step 2's command), then
  (controller) `docker exec forge-db psql -U postgres -d forge -c "\d
  client_access_links"` to confirm the live schema matches.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/db/src/schema/client-access.ts lib/db/src/schema/index.ts lib/db/drizzle
  git commit -m "feat(db): add client_access_links table"
  ```

---

### Task 5: `client-access` redeem route

**Files:**
- Create: `artifacts/api-server/src/routes/client-access.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: `clientAccessLinksTable` (Task 4), `SessionPayload` with
  `clientAccessLinkId` (Task 3), `signSession`/`hashPassword`-adjacent
  helpers already in `lib/auth.ts`.
- Produces: `POST /api/client-access/redeem` — no auth required (this IS
  the auth step for a client), sets the same session cookie every other
  login route sets.

- [ ] **Step 1: Create `artifacts/api-server/src/routes/client-access.ts`**:
  ```typescript
  import { Router } from "express";
  import { db } from "@workspace/db";
  import { clientAccessLinksTable, tenantRolesTable } from "@workspace/db/schema";
  import { eq, and, isNull, or, gt } from "drizzle-orm";
  import { signSession } from "../lib/auth";

  export const clientAccessRouter = Router();

  clientAccessRouter.post("/redeem", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string")
        return res.status(400).json({ error: "Missing code" });

      const [link] = await db
        .select()
        .from(clientAccessLinksTable)
        .where(
          and(
            eq(clientAccessLinksTable.code, code),
            isNull(clientAccessLinksTable.revokedAt),
            or(
              isNull(clientAccessLinksTable.expiresAt),
              gt(clientAccessLinksTable.expiresAt, new Date()),
            ),
          ),
        );
      if (!link) return res.status(401).json({ error: "Invalid or expired code" });

      // Every tenant is seeded with a system-default "client" role (Task 6's
      // sibling task in the admin-bootstrap plan ensures this — for now,
      // fall back to a 401 if a tenant somehow has none, rather than
      // fabricating a roleId that doesn't exist and would break every
      // downstream tenantRoleCapabilities lookup).
      const [clientRole] = await db
        .select({ id: tenantRolesTable.id })
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.tenantId, link.tenantId),
            eq(tenantRolesTable.name, "client"),
          ),
        );
      if (!clientRole)
        return res.status(500).json({ error: "Tenant has no client role configured" });

      const token = signSession({
        userId: null,
        tenantId: link.tenantId,
        roleId: clientRole.id,
        departmentId: null,
        clientAccessLinkId: link.id,
      });

      res.cookie("session", token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({
        scope: {
          projectId: link.projectId,
          episodeId: link.episodeId,
          versionId: link.versionId,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  ```
  Match the exact cookie options (`httpOnly`/`sameSite`/`maxAge`) the
  existing `routes/auth.ts` login handler uses — read that file first and
  copy its cookie-setting call verbatim rather than guessing the options,
  since a mismatch here would create a session cookie current middleware
  can't parse consistently with the rest of the app.

- [ ] **Step 2: Mount in `routes/index.ts`**: `router.use("/client-access",
  clientAccessRouter);` — this route is deliberately mounted BEFORE
  `tenantAuthMiddleware` would apply to it (it has none, since redeeming
  a code IS the auth step) — confirm the mount order in `index.ts`
  doesn't accidentally wrap it in an auth check some other way (e.g. a
  top-level `router.use(tenantAuthMiddleware)` applied before this
  route's mount — if one exists, this route must mount before it, same
  pattern `routes/auth.ts`'s own login/logout routes already use).

- [ ] **Step 3: Verify.** Typecheck. Then (controller, live curl against
  the running dev stack once this and Task 4 are both merged and the
  stack rebuilt): create a `client_access_links` row directly via psql
  with a known code, `curl -X POST /api/client-access/redeem -d
  '{"code":"..."}'`, confirm a `session` cookie is set and
  `GET /api/auth/me`-equivalent behavior is sane for a client session
  (Task 6 is what actually exercises this end-to-end; this task's own
  verification is just confirming the redeem call itself succeeds and
  sets a cookie).

- [ ] **Step 4: Commit**
  ```bash
  git add artifacts/api-server/src/routes/client-access.ts artifacts/api-server/src/routes/index.ts
  git commit -m "feat(api): add client-access-link redeem route"
  ```

---

### Task 6: Wire `client-review.tsx` to the real redeem flow

**Files:**
- Modify: `artifacts/forge/src/pages/client-review.tsx`

**Interfaces:**
- Consumes: `POST /api/client-access/redeem` (Task 5).

- [ ] **Step 1: Read the current file in full**, specifically the
  `accessCode` state (line 104) and the `=== "demo"` check (line 386) and
  everything between — understand exactly what happens today on a
  successful/failed code check (what state changes, what renders next).

- [ ] **Step 2: Replace the hardcoded check** with a real call:
  ```typescript
  const handleRedeemCode = async () => {
    try {
      const res = await apiClient.post<{ scope: { projectId: string | null; episodeId: string | null; versionId: string | null } }>(
        "/client-access/redeem",
        { code: accessCode },
      );
      setClientScope(res.scope); // new local state — see Step 3
      // ...whatever the existing "success" branch already does to move
      // past the code-entry screen (reuse it, don't duplicate)
    } catch {
      toast({
        title: "Invalid Code",
        description: "That access code is invalid or has expired.",
        variant: "destructive",
      });
    }
  };
  ```
  Replace whatever the current `if (accessCode.toLowerCase() === "demo")`
  branch's success path does with a call to this new async handler,
  keeping the same downstream UI transition (don't redesign the page
  flow, just swap what validates the code).

- [ ] **Step 3: Add `clientScope` state** (`useState<{projectId:
  string|null; episodeId: string|null; versionId: string|null} | null>`)
  and use it to scope whatever this page currently fetches unconditionally
  — read the rest of the file to find where it lists shots/versions/
  reviews and add the appropriate `projectId`/`episodeId`/`versionId`
  query param matching `clientScope`'s non-null field, so the page only
  ever requests data within the redeemed link's granted scope. (Full
  server-side enforcement of this scope on every route the client session
  can reach is Sub-project E's job in a later plan — this task's
  responsibility is making the client page itself request only in-scope
  data, which is necessary but not sufficient on its own.)

- [ ] **Step 4: Verify.** Typecheck. Manual browser check deferred to this
  plan's final Task 9 (batch verification), per this project's established
  pattern.

- [ ] **Step 5: Commit**
  ```bash
  git add artifacts/forge/src/pages/client-review.tsx
  git commit -m "feat(frontend): wire client-review to the real access-link redeem flow"
  ```

---

### Task 7: Rewrite `login.tsx` — single form, real-role routing

**Files:**
- Modify: `artifacts/forge/src/pages/login.tsx`
- Modify: `artifacts/forge/src/App.tsx` (remove the `/login/:role` route
  variant if one is separately registered — check first, since `login.tsx`
  currently reads `useParams<{role?: string}>()` itself rather than having
  two separate route registrations; if it's the latter, only one route
  registration needs to go)

**Interfaces:**
- Consumes: `useAuthStore().login()` (already real, unchanged —
  `store/auth.ts:122-140`), `useAuthStore().currentUser.role` (already
  populated from the real backend response).

- [ ] **Step 1: Read the current file in full** (already read once this
  session — confirm nothing changed since, then proceed) and
  `App.tsx`'s route table for how `/login` and any `/login/:role`
  variant are currently registered.

- [ ] **Step 2: Replace the whole component body** with a single form, no
  portal-card grid, no `params.role`-driven pre-fill:
  ```typescript
  import { useState } from "react";
  import { useLocation } from "wouter";
  import { useAuthStore } from "@/store/auth";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent } from "@/components/ui/card";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { useToast } from "@/hooks/use-toast";
  import { Lock } from "lucide-react";

  const ROLE_LANDING_ROUTE: Record<string, string> = {
    admin: "/",
    production_head: "/",
    producer: "/production",
    lead: "/production",
    artist: "/tasks",
  };

  export default function Login() {
    const { login, currentUser } = useAuthStore();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      const success = await login(email, password);
      if (success) {
        const role = useAuthStore.getState().currentUser?.role;
        setLocation(ROLE_LANDING_ROUTE[role ?? ""] ?? "/");
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid Employee ID/Email or Password.",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>
        <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
          <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <div className="w-8 h-8 bg-card rounded-md" />
              </div>
              <span className="text-5xl font-bold tracking-tight">Forge</span>
            </div>
            <p className="text-muted-foreground text-lg">Employee Sign In</p>
          </div>
          <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Employee ID or Email</Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder="employee@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full gap-2 mt-2" disabled={isLoading}>
                  <Lock className="w-4 h-4" /> {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Reviewing as a client?{" "}
            <a href="/client-access" className="text-primary hover:underline">
              Use your access link instead
            </a>
          </p>
        </div>
      </div>
    );
  }
  ```
  The `ROLE_LANDING_ROUTE` map's exact target routes (`/`, `/production`,
  `/tasks`) match the spec's Sub-project A Step 1 direction — if any of
  those routes don't currently exist under those exact paths, check
  `App.tsx`'s route table and use the real path instead, keeping the same
  role→purpose mapping (studio leadership → the root dashboard,
  producer/lead → the department-focus dashboard, artist → their task
  list).

- [ ] **Step 3: Remove the now-dead `/login/:role` route registration**
  in `App.tsx` if one exists as a separate `<Route>` (vs. `login.tsx`
  handling the param itself, which Step 2 already removed the need for).

- [ ] **Step 4: Verify.** Typecheck.

- [ ] **Step 5: Commit**
  ```bash
  git add artifacts/forge/src/pages/login.tsx artifacts/forge/src/App.tsx
  git commit -m "feat(frontend): replace 6-card login picker with single form, real-role routing"
  ```

---

### Task 8: Route-level RBAC — page visibility per role

**Files:**
- Create: `artifacts/forge/src/lib/roleRouteAccess.ts`
- Modify: `artifacts/forge/src/App.tsx`
- Modify: `artifacts/forge/src/components/shell/Sidebar.tsx`

**Interfaces:**
- Produces: `ROLE_ALLOWED_ROUTES: Record<Role, string[]>`,
  `canAccessRoute(role: Role, path: string): boolean` — the sidebar
  (this task) and any future route guard both call this.

- [ ] **Step 1: Read `App.tsx`'s full route table** (42 routes, per this
  plan's research) and `Sidebar.tsx`'s nav-item list, to build an accurate
  route inventory before deciding per-role access — do not guess the
  route list from memory.

- [ ] **Step 2: Create `artifacts/forge/src/lib/roleRouteAccess.ts`**
  with a `ROLE_ALLOWED_ROUTES` map. Base the actual per-role list on: every
  role can reach `/`, `/tasks`, `/profile`, `/settings`; `artist` is
  additionally scoped to `/my-shots`, `/my-assets`, `/daily-standup`,
  `/timesheets`, `/review` (their own work only — enforced server-side
  separately, this is just page-reachability), `/chat`; `producer`/`lead`
  additionally reach `/production`, `/tracking`, `/scheduling`, `/reviews`,
  `/departments`, `/deliveries`, `/publishing`, `/analytics`; `admin`/
  `production_head` reach everything `producer`/`lead` reach plus
  `/admin`, `/studio-roster`, `/workflows`. Write out the FULL list against
  the real route table from Step 1 — this bullet names the categories,
  the implementer fills in the complete, exact path list per role by
  cross-referencing Step 1's inventory, not by inventing paths.
  ```typescript
  import type { Role } from "@/data/mockData";

  export const ROLE_ALLOWED_ROUTES: Record<Role, string[]> = {
    // ... full list per the rule above, using App.tsx's real paths
  };

  export function canAccessRoute(role: Role, path: string): boolean {
    const allowed = ROLE_ALLOWED_ROUTES[role] ?? [];
    return allowed.some((p) => path === p || path.startsWith(p + "/"));
  }
  ```

- [ ] **Step 3: Wrap `App.tsx`'s route table** (or add a layout-level
  check, whichever fits this router's existing structure better — Wouter
  doesn't have built-in route guards like React Router, so this likely
  means a small wrapper component rendered around each protected
  `<Route>`'s element, checking `canAccessRoute(currentUser.role,
  location)` and calling `setLocation(ROLE_LANDING_ROUTE[role])` — reuse
  Task 7's `ROLE_LANDING_ROUTE` map, don't redefine it — if the check
  fails, rather than rendering the requested page.

- [ ] **Step 4: Filter `Sidebar.tsx`'s nav items** the same way — each
  nav-item's route checked against `canAccessRoute` before rendering it,
  so a role never sees a link it can't use (in addition to Step 3's
  guard, which stops direct URL navigation).

- [ ] **Step 5: Verify.** Typecheck. Live browser check happens in Task 9.

- [ ] **Step 6: Commit**
  ```bash
  git add artifacts/forge/src/lib/roleRouteAccess.ts artifacts/forge/src/App.tsx artifacts/forge/src/components/shell/Sidebar.tsx
  git commit -m "feat(frontend): add role-based route and sidebar visibility"
  ```

---

### Task 9: Whole-plan verification

**Files:** none (verification only).

- [ ] **Step 1: Full clean-install typecheck** (controller-run, per this
  project's established discipline of never trusting an implementer's own
  typecheck claim without an independent clean-install re-run):
  ```bash
  rm -rf node_modules .pnpm-store artifacts/*/node_modules lib/*/node_modules scripts/node_modules
  ```
  then the Task 1 Step 2 typecheck command. Confirm 0 errors.

- [ ] **Step 2: Rebuild and redeploy** `api` and `web` (controller-run,
  live Docker operations against the shared dev stack — same pattern used
  throughout the full-backend-build-out plan and this session's live-crash
  fixes: `docker-compose build api web`, stop/remove the old containers,
  `docker-compose up -d --no-deps api web`).

- [ ] **Step 3: Live-verify each role's login + landing page**, logged in
  as each of the 5 seeded demo users (`admin@acme.com`,
  `producer@acme.com`, `lead@acme.com`, `artist@acme.com`, plus a manually
  created `client_access_links` row + redeem for the client flow) —
  confirm: single login form (no portal cards), correct landing route per
  role, sidebar shows only that role's allowed pages, a direct URL
  navigation to a disallowed route redirects rather than rendering.

- [ ] **Step 4: Live-verify Task 2's server-side enforcement** — curl
  `PUT /api/tasks/:id` with `assignedTo` set to a lead/producer's real id,
  confirm 400; with an artist's id, confirm 200.

- [ ] **Step 5: Live-verify the review-chain collapse** — open a task in
  `TaskDrawer`, walk it through `review → lead-review → approved`, confirm
  no UI reference to "Manager Review" appears anywhere in the flow.

- [ ] **Step 6: Report results** — this task has no commit of its own; if
  Steps 3-5 find anything wrong, it becomes a fix round on the specific
  task that owns the broken behavior, following this project's established
  SDD fix-loop (resume the task's implementer, re-review, cap at 5
  rounds).

---

## Self-Review

**Spec coverage:** Sub-project A (login redesign, client access-link
redeem) → Tasks 3, 4, 5, 6, 7. Sub-project B (Lead/Manager merge,
review-chain collapse, leadership-can't-hold-tasks enforcement) → Tasks 1,
2. Sub-project C (route-level RBAC visibility) → Task 8. Sub-project H's
relevant slice (server-side enforcement for the new restrictions this plan
introduces, not the full audit — that continues in later plans as other
routes are touched) → Task 2's `assignedToIsArtist` check, Task 5's
scoped-session design. Sub-projects D, E, F, G, I are explicitly out of
this plan's scope per its own header, planned separately.

**Placeholder scan:** No task says "handle appropriately" or "add proper
error handling" without showing the actual code. Task 8's route-list step
names the *rule* rather than the exhaustive list because the full route
table wasn't read as part of writing this plan (would require pasting all
42 routes from `App.tsx` into this document) — flagged explicitly as
"cross-reference the real route table" rather than left as a silent gap,
consistent with how Tasks 15/16/18 of the prior plan handled
existing-large-file transformations.

**Type consistency:** `SessionPayload` (Task 3) is consumed identically by
Task 5's redeem route; `ROLE_LANDING_ROUTE` (Task 7) is explicitly reused,
not redefined, by Task 8's route guard; `clientScope`'s shape (Task 6) mirrors
Task 5's redeem response exactly (`{projectId, episodeId, versionId}`, all
nullable).
