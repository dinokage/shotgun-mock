pipeline {
    agent any

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
                sh 'corepack enable && pnpm install --frozen-lockfile'
            }
        }

        stage('Generate Prisma Client') {
            steps {
                // Both Typecheck below and `pnpm run build` (which re-runs
                // typecheck internally) import lib/db's generated client --
                // without this they fail on every run with
                // "Cannot find module '../generated/prisma-client'".
                sh 'pnpm --filter "@workspace/db" run prisma:generate'
            }
        }

        stage('Global Checks (Lint & Typecheck)') {
            steps {
                sh 'pnpm run lint'
                sh 'pnpm run typecheck'
            }
        }

        stage('Global Checks (Build)') {
            steps {
                sh 'pnpm run build'
            }
        }

        stage('Deploy') {
            // Triggered on changes to the main branch
            when {
                branch 'main'
            }
            steps {
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
