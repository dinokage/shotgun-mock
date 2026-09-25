pipeline {
    // Plain `agent any` throughout -- this Jenkins instance does NOT have the
    // Docker Pipeline plugin installed (confirmed live: build #2 failed to
    // even parse the Jenkinsfile, "Invalid agent type 'docker' specified.
    // Must be one of [any, label, none]"). Rather than depend on a plugin
    // that may or may not get installed, the Node/pnpm stages below just
    // shell out to `docker run` directly -- needs nothing beyond the Docker
    // CLI itself, which this agent already has (the Deploy stage below has
    // always used `docker compose`). Each `docker run --rm` is a fresh
    // container, but bind-mounting $WORKSPACE (Jenkins' own env var for the
    // checked-out job directory) as /work means node_modules installed in
    // one stage is still on disk for the next -- the persistence lives in
    // the bind-mounted directory, not the container.
    agent any

    environment {
        // node:22-slim (Debian, glibc), not -alpine (musl) -- alpine's musl
        // libc breaks Vite/Rollup's native binary resolution (pnpm-lock.yaml
        // only resolves the glibc @rollup/rollup-linux-x64-gnu build), the
        // exact same reason artifacts/forge/Dockerfile already uses -slim.
        NODE_IMAGE = 'node:22-slim'
    }

    // No COMPOSE_PROJECT_NAME override here on purpose: docker-compose.yml
    // pins `name: shotgun-mock` itself, and Compose's env var takes
    // precedence over that pin. Setting one here (this used to say
    // "forge-production") would silently stand up a second, parallel stack
    // instead of updating the real one -- new containers, same host ports
    // already bound by the live stack, a confusing failure or a duplicate
    // deployment either way. Let the compose file's own name win.

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'docker run --rm -v "$WORKSPACE:/work" -w /work "$NODE_IMAGE" sh -c "corepack enable && pnpm install --frozen-lockfile"'
            }
        }

        stage('Generate Prisma Client') {
            steps {
                // Both Typecheck below and `pnpm run build` (which re-runs
                // typecheck internally) import lib/db's generated client --
                // without this they fail on every run with
                // "Cannot find module '../generated/prisma-client'".
                sh 'docker run --rm -v "$WORKSPACE:/work" -w /work "$NODE_IMAGE" sh -c "corepack enable && pnpm --filter \'@workspace/db\' run prisma:generate"'
            }
        }

        stage('Global Checks (Lint & Typecheck)') {
            steps {
                sh 'docker run --rm -v "$WORKSPACE:/work" -w /work "$NODE_IMAGE" sh -c "corepack enable && pnpm run lint && pnpm run typecheck"'
            }
        }

        stage('Global Checks (Build)') {
            steps {
                sh 'docker run --rm -v "$WORKSPACE:/work" -w /work "$NODE_IMAGE" sh -c "corepack enable && pnpm run build"'
            }
        }

        stage('Test') {
            steps {
                sh 'docker run --rm -v "$WORKSPACE:/work" -w /work "$NODE_IMAGE" sh -c "corepack enable && pnpm exec turbo run test"'
            }
        }

        stage('Deploy') {
            // Triggered on changes to the main branch
            when {
                branch 'main'
            }
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
