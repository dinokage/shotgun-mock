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

# Generate schemas and db before building
RUN pnpm --filter "@workspace/api-spec" run codegen
RUN pnpm --filter "@workspace/db" run generate

# Build the api server
RUN pnpm --filter "@workspace/api-server" run build

# Prune dev dependencies for a smaller image
RUN pnpm --filter "@workspace/api-server" deploy --prod /prod/api-server
RUN pnpm --filter "@workspace/db" deploy --prod /prod/db
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
