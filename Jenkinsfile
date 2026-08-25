pipeline {
    agent any

    environment {
        // Automatically injects your production .env if you use Jenkins Credentials Plugin,
        // otherwise it will rely on the .env file already existing on the deployment server.
        COMPOSE_PROJECT_NAME = "forge-production"
    }

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
                sh 'docker-compose up -d --build'
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
