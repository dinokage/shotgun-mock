# Forge

Self-hosted production tracker for VFX/animation studios — projects, episodes,
sequences, shots, tasks, review workflow (Artist → Lead → Admin → Client), and
a client-facing review portal.

Runs entirely via Docker Compose: Postgres, Redis, the API server, the web
app, and a periodic DB backup service.

## Prerequisites

- Docker + Docker Compose
- Node.js 22 and `corepack` (only needed for local, non-Docker development —
  `pnpm run dev`, typecheck, lint). The pinned package manager is
  `pnpm@11.20.0` (`packageManager` in `package.json`); `corepack enable` picks
  it up automatically, no separate install needed.

## Running it locally

1. Copy the env template and fill it in:
   ```bash
   cp .env.example .env   # or edit .env directly if one already exists
   ```
   See **Environment variables** below for what every value means and how to
   generate strong ones.

2. Build and start everything:
   ```bash
   docker compose up -d --build
   ```
   First run also needs the database migrated and seeded:
   ```bash
   docker compose exec api sh -c "cd /app/prod/db && ./node_modules/.bin/tsx src/seed.ts"
   ```
   (Migrations run automatically as their own one-shot `migrate` service —
   see the `migrate` service in `docker-compose.yml` — you only need to run
   `seed.ts` once, against a genuinely empty database, to get a tenant, its
   roles, and an initial admin account. It prints a one-time temporary
   password to stdout — copy it immediately, it is never shown again.)

3. Open `http://localhost:${WEB_PORT:-80}`.

To run the API/web apps directly on your machine instead of in Docker (faster
iteration while developing):
```bash
corepack enable
pnpm install
pnpm --filter "@workspace/db" run prisma:generate
pnpm run dev   # runs forge (Vite) + api-server in parallel
```
You'll still need Postgres/Redis reachable (e.g. `docker compose up -d db redis`)
and a `DATABASE_URL`/`REDIS_URL` pointing at them.

## Environment variables

All of these live in `.env` at the repo root (gitignored — never commit real
secrets). Docker Compose reads it automatically.

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_USER` | no (`postgres`) | |
| `POSTGRES_PASSWORD` | **yes** | Real random value — Compose refuses to start without one. |
| `POSTGRES_DB` | no (`forge`) | |
| `JWT_SECRET` | **yes** | Signs session tokens. Real random value — never a fallback baked into source. |
| `CORS_ORIGIN` | no (`*`) | Set to the real origin(s) the web app is served from once you're not on `*`. |
| `COOKIE_SECURE` | no (`false`) | **Set to `true` once real HTTPS is terminated in front of this stack.** Left `false`, login silently breaks on any non-localhost origin: the browser drops a `Secure` cookie over plain HTTP, so `POST /auth/login` returns 200 but the very next `GET /auth/me` 401s. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_NAME` | no | Only needed for invite/notification emails. No `SMTP_USER`/`SMTP_PASSWORD` default on purpose — unset means those emails fail loudly instead of silently going nowhere. |
| `FRONTEND_URL` | no (`http://localhost`) | Used to build links inside emails (e.g. accept-invite). Set to the real domain so a clicked link actually works. |
| `WEB_PORT` | no (`80`) | Host port the web app is published on. |
| `LDAP_ENABLED` | no (`false`) | Turns on the "Company Login" tab / `POST /auth/login/ldap`. |
| `LDAP_URL` | if LDAP enabled | e.g. `ldap://10.1.8.251`. |
| `LDAP_BIND_DN` | if LDAP enabled | The service/bind account's DN, e.g. `CN=svc-forge,DC=example,DC=com`. **Use a dedicated low-privilege bind account, not a domain admin** — this credential only ever needs read access to search users. |
| `LDAP_BIND_PASSWORD` | if LDAP enabled | See the `$` gotcha below. |
| `LDAP_BASE_DN` | if LDAP enabled | e.g. `DC=example,DC=com`. |
| `BACKUP_RETENTION_DAYS` | no (`14`) | How long `db-backup` keeps old dumps. |
| `BACKUP_INTERVAL_SECONDS` | no (`21600`) | How often `db-backup` runs (default 6h). |

**Gotcha — a literal `$` in any `.env` value must be doubled (`$$`).** Docker
Compose interpolates `.env` values itself before substituting them into
`docker-compose.yml`; a single `$` gets read as the start of a variable
reference (e.g. `$ecret...` → Compose looks for a variable named `ecret`,
finds nothing, and silently substitutes an empty string). This mainly bites
`LDAP_BIND_PASSWORD` and `POSTGRES_PASSWORD` if a generated password happens
to contain `$`.

Generate strong values for the required secrets with:
```bash
openssl rand -base64 32
```

## First admin account / test data

- `pnpm --filter "@workspace/db" run seed` — bootstraps a brand-new, empty
  database: creates the tenant, its roles (`admin`, `lead`, `artist`,
  `client`), their capability grants, and one admin account. Refuses to run
  again once a tenant already exists.
- `pnpm --filter "@workspace/db" run promote-admin` — promotes an existing
  user to `admin`.
- `pnpm --filter "@workspace/db" run create-test-client` /
  `create-test-artist` — convenience scripts for spinning up a throwaway
  account of that role during testing.

(Run any of these against the `api` container with `docker compose exec api
sh -c "cd /app/prod/db && ./node_modules/.bin/tsx src/<script>.ts"`, or
locally with `pnpm --filter "@workspace/db" run <script>` if you have
`DATABASE_URL` pointed at the right database.)

## LDAP / Active Directory login

`POST /auth/login/ldap` (and the "Company Login" tab on the sign-in page)
lets everyone sign in with their existing AD/PC credentials instead of a
separately-provisioned Forge password. On first login it auto-creates the
Forge account and assigns a role based on AD group membership — see
`mapLdapGroupsToRole` in `artifacts/api-server/src/lib/ldap.ts` for the exact
group→role mapping, and adjust it there if your AD group names differ.

This only works when the machine running Forge has real network access to
your LDAP/AD server — a corporate LAN or VPN, never the public internet. A
cloud-hosted deploy (Railway, etc.) cannot reach an internal AD server at a
private IP; LDAP login only makes sense on an on-prem/self-hosted deployment.

## Deploying

### Via Jenkins (`Jenkinsfile` in this repo)

The pipeline: checkout → install → generate Prisma client → lint + typecheck
→ build → test → (on `main` only) `docker compose up -d --build --scale
api=3`.

The Jenkins agent that runs the Deploy stage needs, ahead of time:
- Docker + Docker Compose, and Node/pnpm (via corepack) for the earlier
  stages, which run directly on the agent (not inside a container).
- A real, production-value `.env` already sitting in the job's working
  directory — it is gitignored and never provisioned by checkout, and the
  Deploy stage refuses to run without one (`test -f .env || ...`).
- Network access to your LDAP/AD server, if `LDAP_ENABLED=true`.

Don't override `COMPOSE_PROJECT_NAME` — `docker-compose.yml` already pins
`name: shotgun-mock`; setting a different project name here stands up a
second, parallel stack instead of updating the live one.

### Manually

```bash
git pull
docker compose up -d --build --scale api=3
```

## Architecture notes

- `artifacts/forge` — React + Vite SPA, served by nginx (see its Dockerfile),
  which also reverse-proxies `/api/*` to the `api` service.
- `artifacts/api-server` — Express 5 + Prisma API.
- `lib/db` — Prisma schema, migrations, and the seed/admin/test-account
  scripts referenced above.
- Sessions are hand-rolled JWT (argon2 password hashing), not a third-party
  auth library — see `artifacts/api-server/src/lib/auth.ts`.
- Role model: `admin` (studio-wide, every capability), `lead` (per
  department — review/send-back authority scoped to their own department),
  `artist`, `client` (portal-only, scoped to whichever projects they've been
  explicitly granted access to).
