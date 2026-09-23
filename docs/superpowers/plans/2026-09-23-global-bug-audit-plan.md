# Global Bug Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conduct a comprehensive parallel audit to identify and resolve any latent bugs in the codebase prior to final deployment.

**Architecture:** Use parallel subagents to investigate independent domains (Backend, Frontend, DCC/Integrations) and fix any issues systematically.

**Tech Stack:** Node.js, Express, Prisma, Next.js, React, Python (Maya/Blender), Docker.

**Spec:** `docs/superpowers/specs/2026-09-23-global-bug-audit-design.md`

## Global Constraints
- Do not introduce breaking changes to the database schema without explicit approval.
- Any bugs found must be fixed using systematic debugging principles (root cause analysis first).
- All fixes must preserve the offline capabilities of the LDAP and internal services.

## Review Focus
- Unhandled rejections in API routes.
- React state synchronization issues in the frontend.
- Hardcoded absolute paths or network assumptions in the DCC plugins.
- Jenkinsfile step failures (e.g., missing dependencies).

---

### Task 1: Backend Audit (API Server)

**Files:**
- Modify: `artifacts/api-server/**/*.ts`

**Interfaces:**
- Consumes: N/A
- Produces: Robust, bug-free API routes

- [ ] **Step 1: Run Backend Linter & Typechecker**

```bash
cd artifacts/api-server
pnpm run lint
pnpm run typecheck
```

- [ ] **Step 2: Fix Backend Issues Systematically**
For any error discovered, apply `systematic-debugging` principles. Identify the root cause, apply a focused fix, and verify it passes the typechecker.

- [ ] **Step 3: Commit Backend Fixes**

```bash
git add artifacts/api-server/
git commit -m "fix(api): resolve bugs found during global audit"
```

### Task 2: Frontend Audit (Forge UI)

**Files:**
- Modify: `artifacts/forge/**/*.ts`, `artifacts/forge/**/*.tsx`

**Interfaces:**
- Consumes: Backend API
- Produces: Robust, bug-free Frontend components

- [ ] **Step 1: Run Frontend Linter & Typechecker**

```bash
cd artifacts/forge
pnpm run lint
pnpm run typecheck
```

- [ ] **Step 2: Fix Frontend Issues Systematically**
Identify and fix any React rendering issues, mock data remnants, or unhandled states.

- [ ] **Step 3: Commit Frontend Fixes**

```bash
git add artifacts/forge/
git commit -m "fix(forge): resolve bugs found during global audit"
```

### Task 3: DCC & Integrations Audit

**Files:**
- Modify: `dcc/**/*.py`, `Jenkinsfile`, `docker-compose.yml`

**Interfaces:**
- Consumes: API and UI schemas
- Produces: Stable pipelines and artist tools

- [ ] **Step 1: Run DCC Linter / Sanity Scripts**
Inspect Python code for undefined variables or incorrect imports.

- [ ] **Step 2: Fix Integration Issues Systematically**
Fix any errors found in DCC plugins or Jenkins deployment configurations.

- [ ] **Step 3: Commit Integration Fixes**

```bash
git add dcc/ Jenkinsfile docker-compose.yml
git commit -m "fix(integrations): resolve bugs found during global audit"
```
