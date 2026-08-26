
# node:22-alpine (musl libc) fails to build here: pnpm-lock.yaml only has
# @rollup/rollup-linux-x64-musl marked unresolved ("-"), so Vite's build
# (which uses Rollup) crashes with "Cannot find module
# @rollup/rollup-linux-x64-musl". node:22-slim (Debian, glibc) uses the
# already-resolved @rollup/rollup-linux-x64-gnu instead.
FROM node:22-slim AS builder
WORKDIR /app

# Copy root workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Enable pnpm. `corepack install` (no args) activates exactly the version
# pinned by the root package.json's "packageManager" field, making that pin the
# single source of truth — `corepack prepare pnpm@latest --activate` would
# silently override it. It also pre-downloads pnpm here rather than leaving the
# first shim invocation to do it, which corepack refuses to do unprompted.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack install

# Copy packages that forge depends on
COPY lib/api-zod ./lib/api-zod
COPY lib/api-client-react ./lib/api-client-react
COPY artifacts/forge ./artifacts/forge

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the frontend
RUN pnpm --filter "@workspace/forge" run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# NOTE: COPY resolves against the build context root (the repo root — see
# docker-compose.yml's `context: .`), not against this Dockerfile's directory,
# so nginx.conf must be referenced by its full repo-relative path.
COPY artifacts/forge/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/artifacts/forge/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
