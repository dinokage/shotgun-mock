FROM node:22-alpine AS builder
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy packages that api-server depends on
COPY lib/db ./lib/db
COPY lib/api-zod ./lib/api-zod
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
RUN pnpm --filter "@workspace/api-server" deploy --prod /prod/api-server
RUN pnpm --filter "@workspace/db" deploy /prod/db
RUN pnpm --filter "@workspace/api-zod" deploy --prod /prod/api-zod

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /prod /app/prod
COPY --from=builder /app/artifacts/api-server/dist /app/prod/api-server/dist
COPY --from=builder /app/lib/db/drizzle /app/prod/db/drizzle
COPY --from=builder /app/lib/db/src/migrate.ts /app/prod/db/src/migrate.ts

# We need pnpm available in the final image to run migrations easily, or we can just use node
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app/prod/api-server

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
