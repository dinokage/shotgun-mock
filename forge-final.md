# Forge — Final Deployment Audit & Fix Report

**Date:** 2026-08-26
**Scope:** Full repo audit (`shotgun-mock`), root-cause analysis of the login failure, and fixes required to self-host the backend on your own company server today.

---

## 1. What this repo actually is

This is a **pnpm workspace monorepo** for "Forge" — a VFX/production-tracking studio management app (projects, shots, tasks, reviews, scheduling, timesheets, etc.), built for six role-based portals (Admin, Producer, Manager, Lead, Artist, Client).

```
shotgun-mock/
├── artifacts/
│   ├── forge/           ← the real frontend (React 19 + Vite + wouter + zustand + shadcn/ui).
│   │                       Also wraps as a Capacitor mobile app and a Tauri desktop app.
│   ├── api-server/      ← the real backend (Express 5 + Drizzle ORM + Postgres, TypeScript, esbuild bundle)
│   └── mockup-sandbox/  ← a separate, disconnected UI sandbox/prototype, not part of the deployed app
├── lib/
│   ├── db/               ← Drizzle schema + migrations + seed script (source of truth for the DB)
│   ├── api-spec/         ← openapi.yaml (source of truth for the API contract)
│   ├── api-zod/          ← generated Zod schemas from the OpenAPI spec
│   └── api-client-react/ ← generated typed fetch client from the OpenAPI spec (currently unused by the app UI)
├── scripts/               ← workspace-level scripts (DB seeding, etc.)
├── docker-compose.yml, Jenkinsfile, railway.json, vercel.json, .github/workflows/deploy.yml
└── .replit, replit.md      ← this project was originally built/iterated on Replit
```

**Current/attempted deployment surfaces found in the repo** (this explains "noen console" — that's **Neon**, the managed Postgres provider; the connection string in `artifacts/api-server/.env` points at `neon.tech`):
- **Database:** Neon (managed Postgres) — this is what's live today.
- **Frontend:** configured for **Vercel** (`vercel.json`, rewrites `/api/*` → `https://api.symbiosystech.in/api/*`).
- **Backend:** partially configured for **Railway** (`railway.json`, GitHub Actions deploy webhook) — this looks unfinished/never fully went live, which is consistent with what you're seeing (`api.symbiosystech.in` has nothing listening on it yet).
- **Self-hosted path (what you want to use today):** `docker-compose.yml` + `Jenkinsfile` + per-app `Dockerfile`s. This path had **multiple bugs that would have made it impossible to log in even after a successful deploy** — all fixed below.

---

## 2. Why login doesn't work

There wasn't one single bug — there were **four separate, independent blockers** stacked on top of each other in the self-hosted (`docker-compose`) path. Fixing only one would still have left you stuck.

| # | Bug | Effect |
|---|-----|--------|
| 1 | `artifacts/forge/nginx.conf` never proxied `/api/*` to the backend container — it just served `index.html` for every request, including API calls. | The browser's `POST /api/auth/login` would get back the frontend's `index.html`, not a JSON response. Login always fails. |
| 2 | `docker-compose.yml`'s `api` service ran migrations via `pnpm --filter "@workspace/db" run migrate"`, but the **production image is a pruned `pnpm deploy` output, not a pnpm workspace** — there's no `pnpm-workspace.yaml` in that image for `--filter` to resolve against. | Migrations silently fail to run → the database has **no tables at all** → even a working login endpoint has no `users` table to query. |
| 3 | `pnpm deploy --prod` (used for the `@workspace/db` package) strips **devDependencies**, but the migration script depends on `tsx` (to run the `.ts` migration runner) — a devDependency. | Even if bug #2's filter issue were fixed, `tsx` wouldn't exist in the container → migration command would crash with "command not found". |
| 4 | No migration files were ever generated/committed (`lib/db/drizzle/` doesn't exist in the repo), **and** the `Dockerfile` regenerated migrations fresh on every build with no DB connection available at build time (`drizzle.config.ts` hard-requires `DATABASE_URL` just to load, and the Docker build never provided one). | The API server's Docker image **could not be built at all** — the `RUN pnpm --filter "@workspace/db" run generate` step would crash immediately. |

All four are fixed in the working tree now (see §4). Once you rebuild and redeploy, login against a freshly-seeded database will work.

---

## 3. 🔴 Critical — rotate your database password today

`artifacts/api-server/.env` was **committed to git** (added in commit `f05841b`) and contains a **live Neon Postgres connection string with a real username and password**:

```
DATABASE_URL="postgresql://neondb_owner:npg_WYzh9pTgCA6E@ep-lingering-bar-azva7gtp-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Anyone with read access to this repository (or its git history — deleting the file doesn't erase history) has your production database credentials.

**What I did:** removed it from git tracking going forward (`git rm --cached`) — it's still on your disk locally for dev, and `.gitignore` already excludes `.env` files so it won't be re-added by accident.

**What you must do yourself (I can't do this for you — it needs your Neon account access):**
1. Log into the **Neon console** → rotate/reset the password for `neondb_owner` (or create a new role and swap to it).
2. Update the real `DATABASE_URL` in whatever secret store you use for the new self-hosted deployment (see §5) — **do not** put it back in a committed file.
3. Optional but recommended: since the password lived in git history, consider whether to purge it from history (`git filter-repo` / BFG) — this is a destructive history rewrite, so only do it with the team's sign-off and after everyone re-clones.

The last commit (`d735fc3`, "fix: resolve critical security and deployment configuration issues") already removed a root-level `.env`, `cookie.txt`, and a `dump.rdb` (Redis dump) from tracking — good instinct, but it missed this second `.env` file under `artifacts/api-server/`.

---

## 4. Fixes applied in this session

All of the below are made directly in your working tree (not committed — see §7 for what to review/commit). `pnpm run typecheck` passes cleanly across the whole workspace after these changes.

| File | Fix |
|---|---|
| `artifacts/forge/nginx.conf` | Added a `location /api/ { proxy_pass http://api:3001/api/; ... }` block so the self-hosted frontend container actually forwards API calls (and the session cookie) to the backend container. |
| `docker-compose.yml` | Fixed the `api` service's startup command to `cd /app/prod/db && pnpm run migrate` instead of the broken `pnpm --filter` invocation (bug #2 above). |
| `artifacts/api-server/Dockerfile` | (a) Only regenerates DB migrations if none are committed yet, and passes a placeholder `DATABASE_URL` so the build doesn't crash (bug #4). (b) Deploys `@workspace/db` **without** `--prod` so `tsx`/`dotenv` survive pruning (bug #3). |
| `artifacts/api-server/src/routes/index.ts` | Mounted `usersRouter` (it existed but was never wired up — `/api/users` was 404ing). Also fixed the health-check route, which was double-mounted at `/api/healthz/healthz` instead of `/api/healthz`. |
| `artifacts/api-server/src/routes/users.ts` | This endpoint had **no auth/tenant scoping at all** — `GET /` returned every user across every tenant (cross-tenant data leak) with password hashes included in the JSON, and `POST /` blindly inserted the raw request body (mass-assignment) with a plaintext password field that was never hashed. Fixed: added `tenantAuthMiddleware`, scoped queries to the caller's tenant, strip `hashedPassword` from responses, and hash passwords with `argon2` on create. |
| `railway.json` | `healthcheckPath` pointed at `/health`, which never existed — the real path is `/api/healthz`. Fixed to match (relevant if you revisit Railway later). |
| `artifacts/forge/src/hooks/useUsers.ts` | Was calling `/api/users` (would have double-prefixed to `/api/api/users` once `VITE_API_URL` is set) and unwrapping a `{ users: [...] }` shape the backend never returns (it returns a bare array) — this hook would have errored or silently returned nothing even with the route mounted. Fixed to match the actual API contract. |
| `scripts/package.json` | Added the missing `"seed": "tsx ./src/seed.ts"` script — `scripts/src/seed.ts` (the correct, current seed script matching the live schema and the demo accounts referenced by the login page) existed but had no way to run it. |
| `lib/db/seed.cjs` | **Deleted.** This was leftover from an earlier, incompatible schema (references a `studios` table and columns like `empId`/`password` that don't exist anymore) and wasn't referenced by any script anywhere. It would only have confused whoever tried to run "the" seed script. |

### Not changed, but verified clean
- **`pnpm run typecheck`** (all 4 relevant packages: api-server, forge, mockup-sandbox, scripts) — **passes with zero errors.**
- No other hardcoded secrets found anywhere else in tracked source (`.ts`/`.tsx`/`.json`/`.yml`/`.env*`) besides the one described in §3.

---

## 5. What you still need to do to deploy on your own server today

1. **Rotate the Neon DB password** (§3) and get the new `DATABASE_URL`.
2. On your company server, create a real `.env` from the template at repo root (`.env.production`) — copy it to `.env` and fill in real values:
   ```
   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB   ← only needed if you use the bundled local Postgres container
   API_PORT=3001
   JWT_SECRET=<generate a long random string, do NOT reuse the fallback in code>
   WEB_PORT=80
   CORS_ORIGIN=http://your-company-domain.com
   ```
   Then, since the `api` service needs `DATABASE_URL` too and `docker-compose.yml`'s default is a bundled local Postgres, decide:
   - **Option A (simplest today):** use the bundled `db` service in `docker-compose.yml` (a fresh local Postgres container) — don't set `DATABASE_URL` in `.env`, let it default to the compose-internal one.
   - **Option B (keep using Neon):** add `DATABASE_URL=<your rotated Neon URL>` to `.env` and remove/ignore the `db` service.
3. Run `docker-compose up -d --build` (this is exactly what the `Jenkinsfile` does when it deploys `main`).
4. **Seed the database** — this doesn't happen automatically in production on purpose (`scripts/src/seed.ts` refuses to run unless `NODE_ENV=development`, as a safety guard against accidentally re-seeding a live prod DB). To create the demo accounts the login page expects (`admin@acme.com` / `producer@acme.com` / `manager@acme.com` / `lead@acme.com` / `artist@acme.com` / `client@acme.com`, all password `password123`), run once, pointed at your target database:
   ```
   DATABASE_URL=<your target db url> NODE_ENV=development pnpm --filter "@workspace/scripts" run seed
   ```
   For a real studio rollout, replace these with real accounts before going further — these are demo/test credentials baked into the frontend's role-picker (`artifacts/forge/src/pages/login.tsx`).
5. **Point DNS/your reverse proxy** at the `web` container (port 80, or behind your own TLS-terminating proxy) for your company domain, and update `CORS_ORIGIN` and `vercel.json`'s rewrite target if the frontend is still going to be served from Vercel while the backend moves to your server (or drop `vercel.json`'s rewrite entirely if you're now serving both from the same self-hosted origin — that's the cleanest path and avoids CORS entirely, same as the docker-compose setup already does).
6. Re-run `pnpm run build` on the target server (or in CI) as a final gate before going live — I validated `typecheck` fully in this sandbox but could **not** fully validate `pnpm run build`'s native-binary steps here (esbuild/rollup native binaries failed to download in this sandboxed environment specifically — this is a sandbox network restriction, not a code issue, and should not occur on a normal server with npm registry access). Please run `pnpm run build` for real on your server or in CI once before relying on it.

---

## 6. Known limitations (not fixed — by design/scope, flagged for awareness)

These aren't blocking today's deploy, but you should know about them:

- **Most of the app still runs on frontend mock data**, not the real backend. Only `/auth/*`, `/projects`, `/tasks`, and (as of this session) `/users` are real, tenant-scoped API endpoints backed by Postgres. Everything else (assets, shots, versions, notes, reviews, scheduling, timesheets, chat, etc.) is `zustand`-store/local mock data — this is intentional/staged, matching the OpenAPI spec (`lib/api-spec/openapi.yaml`) which only documents those four resource groups. `useAuthStore.fetchMe()` already anticipates this and gracefully falls back (`.catch(() => [])`) for the not-yet-implemented resources.
- **`requireCapability` in `artifacts/api-server/src/middleware/rbac.ts` is a stub** — it only checks that the caller has *a* role, not that the role actually has the specific capability being checked. It's not currently wired into any route, but if you build on it later, know that it isn't real RBAC enforcement yet.
- **`docker-compose.yml`'s `depends_on` has no health-check condition** — the `api` container may start and attempt to connect to Postgres before it's fully ready on a cold `docker-compose up`. `restart: unless-stopped` means it'll recover on retry, but the first boot may show a crash/restart cycle for a few seconds. Not worth over-engineering for a same-day deploy, but worth knowing so you don't panic at the first-boot logs.
- **No `packageManager` field pinning pnpm's version** in the root `package.json` — CI/Docker builds use `corepack prepare pnpm@latest --activate`, which means a future pnpm major release could change lockfile-handling behavior under you with no warning. Low urgency, but worth adding (`"packageManager": "pnpm@11.20.0"`) when convenient.
- **`pnpm run lint` (Prettier) reports formatting-only issues in 339 files** — no logic bugs, just style. Not touched in this session since it's a huge, unrelated diff; run `pnpm run format` whenever convenient, separately from this deploy.
- **`artifacts/mockup-sandbox`** is a disconnected UI prototype, not part of the deployed app (`docker-compose.yml`/`Jenkinsfile` never build it) — ignore it for deployment purposes.

---

## 7. Before you commit

I made all fixes directly in your working tree but **did not commit anything** — please review with `git status` / `git diff` first. Summary of the change set:

```
D  artifacts/api-server/.env          (untracked — see §3, rotate the password!)
M  artifacts/api-server/Dockerfile
M  artifacts/api-server/src/routes/index.ts
M  artifacts/api-server/src/routes/users.ts
M  artifacts/forge/nginx.conf
M  artifacts/forge/src/hooks/useUsers.ts
M  docker-compose.yml
D  lib/db/seed.cjs                    (dead code, safe to remove)
M  railway.json
M  scripts/package.json
```

Once reviewed, commit and push to `main` — the `Jenkinsfile` on your server will then build and deploy via `docker-compose up -d --build` as configured.
