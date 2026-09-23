# Global Bug Audit and Resolution Spec

## 1. Goal
Conduct a comprehensive, parallelized audit of the entire shotgun-mock application to identify and resolve any latent bugs, structural issues, unhandled errors, or failing tests prior to final deployment.

## 2. Architecture of the Audit
The audit will be split across three independent problem domains, each investigated by a specialized subagent running concurrently:

1. **Backend Auditor (API Server):**
   - **Scope:** rtifacts/api-server/
   - **Responsibilities:** Verify Express routes, Prisma schema, LDAP configuration, error handling, session management, and rate limiting. Run typecheckers and linters to identify structural bugs.

2. **Frontend Auditor (Forge UI):**
   - **Scope:** rtifacts/forge/
   - **Responsibilities:** Check Next.js pages, React hooks, UI components, state management, and mock data removal. Verify Sanity UI and Excel import components.

3. **DCC & Integrations Auditor:**
   - **Scope:** dcc/ and Jenkins deployment scripts
   - **Responsibilities:** Verify Maya/Blender Python plugins, DCC sanity checks, Jenkinsfile, and Docker Compose setups. Ensure integration points with the backend are robust.

## 3. Global Constraints
- Do not introduce breaking changes to the database schema without explicit approval.
- Any bugs found must be fixed using systematic debugging principles (root cause analysis first).
- All fixes must preserve the offline capabilities of the LDAP and internal services.

## 4. Success Criteria
- All linters (pnpm lint) and typecheckers (pnpm typecheck) pass on the main repository.
- Subagents report zero unresolved bugs in their respective domains.
- The Jenkinsfile and Docker configuration are confirmed deploy-ready.
