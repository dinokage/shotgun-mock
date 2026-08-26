FROM node:22-alpine AS builder
WORKDIR /app

# Copy root workspace configurations. tsconfig.json (not just
# tsconfig.base.json) is required here: the api-spec codegen step below runs
# `tsc --build` against the root project-reference graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Enable pnpm. `corepack install` (no args) activates exactly the version
# pinned by the root package.json's "packageManager" field, making that pin the
# single source of truth — `corepack prepare pnpm@latest --activate` would
# silently override it. It also pre-downloads pnpm here rather than leaving the
# first shim invocation to do it, which corepack refuses to do unprompted.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack install

# Copy packages that api-server depends on.
# lib/api-client-react is not an api-server runtime dependency, but the
# api-spec codegen step below regenerates BOTH orval outputs (api-zod and
# api-client-react) from one shared orval.config.ts, so its source directory
# must be present in the build context or that step fails with ENOENT.
COPY lib/db ./lib/db
COPY lib/api-zod ./lib/api-zod
COPY lib/api-client-react ./lib/api-client-react
COPY lib/api-spec ./lib/api-spec
COPY artifacts/api-server ./artifacts/api-server

# Install dependencies (ignoring scripts temporarily if there are issues, but we'll try normal first)
RUN pnpm install --frozen-lockfile

# Generate schemas before building.
RUN pnpm --filter "@workspace/api-spec" run codegen

# Only generate DB migrations if none are committed yet (lib/db/drizzle).
# Regenerating on every build gives each migration a fresh hash, which makes
# `drizzle-orm/migrator` try to re-apply it on every redeploy and fail with
# "relation already exists" against a database that's already migrated.
# Once migrations are committed to git, this step is skipped and the
# committed, stable migration files are used instead.
# drizzle-kit generate only diffs the TS schema against ./drizzle — it never
# connects to a database — but drizzle.config.ts requires DATABASE_URL to be
# set just to load, so we pass a placeholder here when generating.
# While migrations remain uncommitted, lib/db/src/migrate.ts's "object already
# exists" guard is what stops the regenerate-and-replay cycle from crash-looping
# this container. That guard is a safety net, NOT a fix: it cannot distinguish
# "already applied" from "a real new migration is needed", so it will silently
# skip genuine schema changes. See forge-final.md §5 step 3.
RUN if [ ! -d "lib/db/drizzle" ]; then \
      DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
      pnpm --filter "@workspace/db" run generate; \
    fi

# Build the api server
RUN pnpm --filter "@workspace/api-server" run build

# Prune dev dependencies for a smaller image.
# @workspace/db is deployed WITHOUT --prod: its runtime "migrate" script is
# run via `tsx`, and `dotenv` is used for local `.env` loading — both are
# devDependencies, so pruning them here would break migrations at container
# startup (see docker-compose.yml's api command).
# --legacy: pnpm v10+'s `deploy` refuses non-injected workspace dependencies
# by default (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE) unless
# inject-workspace-packages=true is set repo-wide; --legacy keeps the
# original (pre-v10) deploy behavior scoped to just these commands instead.
RUN pnpm --filter "@workspace/api-server" deploy --prod --legacy /prod/api-server
RUN pnpm --filter "@workspace/db" deploy --legacy /prod/db
RUN pnpm --filter "@workspace/api-zod" deploy --prod --legacy /prod/api-zod

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /prod /app/prod
COPY --from=builder /app/artifacts/api-server/dist /app/prod/api-server/dist
COPY --from=builder /app/lib/db/drizzle /app/prod/db/drizzle
COPY --from=builder /app/lib/db/src/migrate.ts /app/prod/db/src/migrate.ts

# We need pnpm available in the final image to run migrations easily, or we can just use node.
# The runner's /app/prod tree is a pruned `pnpm deploy` output with no
# "packageManager" field of its own, so plain `corepack enable` would leave
# corepack with no pin and force it to download a pnpm at container start.
# Instead, read the pinned version out of the root package.json (still the
# single source of truth) and pre-install/activate exactly that one at build
# time, so startup needs no network.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY --from=builder /app/package.json /tmp/root-package.json
RUN corepack enable \
    && corepack install -g "$(node -p "require('/tmp/root-package.json').packageManager")" \
    && rm /tmp/root-package.json
WORKDIR /app/prod/api-server

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
