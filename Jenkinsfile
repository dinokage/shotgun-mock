pipeline {
    // No top-level agent: the Node/pnpm stages below each declare their own
    // `docker { image 'node:22-slim' }` agent (this Jenkins agent has no
    // Node.js/corepack on its PATH at all -- confirmed live, "Install
    // Dependencies" failed with "corepack: not found", exit 127). node:22-
    // slim (Debian, glibc), not -alpine (musl) -- alpine's musl libc breaks
    // Vite/Rollup's native binary resolution (pnpm-lock.yaml only resolves
    // the glibc @rollup/rollup-linux-x64-gnu build), the exact same reason
    // artifacts/forge/Dockerfile already uses -slim instead of -alpine.
    // `reuseNode true` keeps every stage on the SAME checked-out workspace
    // instead of a fresh one per container, so node_modules installed in one
    // stage is still there for the next. Checkout and Deploy stay on the
    // bare agent itself: Checkout because there's nothing Node-specific
    // about it, and Deploy because `docker compose` needs the agent's own
    // Docker daemon,
    // not a nested container.
    agent none

    // No COMPOSE_PROJECT_NAME override here on purpose: docker-compose.yml
    // pins `name: shotgun-mock` itself, and Compose's env var takes
    // precedence over that pin. Setting one here (this used to say
    // "forge-production") would silently stand up a second, parallel stack
    // instead of updating the real one -- new containers, same host ports
    // already bound by the live stack, a confusing failure or a duplicate
    // deployment either way. Let the compose file's own name win.

    stages {
        stage('Checkout') {
            agent any
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            agent { docker { image 'node:22-slim'; reuseNode true } }
            steps {
                sh 'corepack enable && pnpm install --frozen-lockfile'
            }
        }

        stage('Generate Prisma Client') {
            agent { docker { image 'node:22-slim'; reuseNode true } }
            steps {
                // Both Typecheck below and `pnpm run build` (which re-runs
                // typecheck internally) import lib/db's generated client --
                // without this they fail on every run with
                // "Cannot find module '../generated/prisma-client'".
                sh 'pnpm --filter "@workspace/db" run prisma:generate'
            }
        }

        stage('Global Checks (Lint & Typecheck)') {
            agent { docker { image 'node:22-slim'; reuseNode true } }
            steps {
                sh 'pnpm run lint'
                sh 'pnpm run typecheck'
            }
        }

        stage('Global Checks (Build)') {
            agent { docker { image 'node:22-slim'; reuseNode true } }
            steps {
                sh 'pnpm run build'
            }
        }

        stage('Test') {
            agent { docker { image 'node:22-slim'; reuseNode true } }
            steps {
                sh 'turbo run test'
            }
        }

        stage('Deploy') {
            // Triggered on changes to the main branch
            when {
                branch 'main'
            }
            agent any
            steps {
                // Compose loads .env automatically from the working directory,
                // but .env is gitignored and never provisioned by `checkout
                // scm` -- it has to already exist on this agent. Without this
                // guard, a missing file fails late and confusingly inside
                // Compose's `${POSTGRES_PASSWORD:?...}` required-var syntax
                // instead of with a clear message naming the actual problem.
                sh 'test -f .env || (echo "Missing .env on this Jenkins agent -- Deploy cannot run without it." && exit 1)'
                echo 'Deploying Forge via Docker Compose...'
                // --scale api=3: replica count isn't declared in
                // docker-compose.yml (no deploy.replicas), only ever reached
                // via this flag -- a plain `up -d --build` silently drops
                // the API back to a single instance on every deploy.
                sh 'docker compose up -d --build --scale api=3'
            }
        }
    }

    post {
        success {
            echo 'Forge deployed successfully!'
        }
        failure {
            echo 'Deployment failed. Please check the logs.'
        }
    }
}
