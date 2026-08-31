# ShotGrid Parity Audit — Design Spec

**Date:** 2026-08-31
**Scope:** Read-only audit of `Forge` (this repo's `artifacts/forge` + `artifacts/api-server`)
against Autodesk ShotGrid, verifying prior fixes and cataloging feature/filter gaps.
Output is a single PDF report artifact. **No code changes in this pass.**

## 1. Purpose

The user has a set of reference screenshots of the real Autodesk ShotGrid product
and wants to know, in one document:

1. Did the frontend corrections from the last working session (the RBAC/Admin
   Panel branch, commits `77a640f` and `a862b9f`, and the deployment-hardening
   pass in `forge-final.md`) actually land, and are there any errors in the
   current codebase (build breakage, dead controls, etc.)?
2. Feature-by-feature, does Forge implement what ShotGrid's dashboard/pages
   implement?
3. Page-by-page, does Forge have the same dropdown/filter controls ShotGrid
   has on the equivalent screen?

## 2. Inputs

- **ShotGrid reference material:** `C:\Users\user\Forge-final\` — 54 WhatsApp
  screenshots (`WhatsApp Image 2026-08-26 at *.jpeg`) of the real ShotGrid UI,
  plus 15 smaller `images*.jpg/png` icon references. All of it is ShotGrid
  material to study, none of it is our own product's assets.
- **Forge codebase:** `C:\Users\user\shotgun-mock`, checked out at `main`
  (`origin/main`, commit `a862b9f`) — this was stale (Aug 4) in the working
  copy before this session; it has been synced. The prior stale uncommitted
  work is preserved in git stash (`aug4-preaudit-wip-superseded-by-origin-main`)
  and is explicitly **out of scope** for this audit.
  - In scope: `artifacts/forge` (frontend, 30+ pages), `artifacts/api-server`
    (backend), `lib/db` (schema — for assessing whether a ShotGrid feature
    even has a data model to back it).
  - Out of scope: `artifacts/mockup-sandbox` — `forge-final.md` documents
    this as a disconnected prototype not part of the deployed app.
- **Existing project docs** (already-known context, not to be re-discovered
  or re-flagged as new findings):
  - `forge-final.md` — deployment audit; documents the self-host fixes and,
    critically, **§6 Known limitations**: only `/auth`, `/projects`,
    `/tasks`, `/users` are real backend-integrated; everything else
    (assets, shots, versions, notes, reviews, scheduling, timesheets, chat,
    etc.) is intentionally frontend-mock (zustand store) at this stage.
  - `docs/superpowers/plans/forge-hardening-plan.md` +
    `docs/superpowers/specs/2026-08-26-rbac-admin-panel-design.md` +
    `docs/superpowers/plans/2026-08-26-rbac-admin-panel.md` — the RBAC/
    department/admin-panel work, its design, and its two follow-up hardening
    tasks (real `requireCapability` enforcement, compose healthcheck
    ordering, pnpm version pin).

## 3. Workstreams

Five subagent tasks. 1–3 run independently in parallel; 4 depends on 1+2;
5 depends on all.

### Task A — ShotGrid reference catalog

Go through all 54 WhatsApp screenshots + 15 icon images. Produce a structured
catalog: for each screenshot, identify which ShotGrid screen/page/entity view
it shows, list every visible panel/widget, and — specifically — every
dropdown, filter chip, column-sort control, and grouping control visible.
Group screenshots by the page they depict (multiple screenshots may show the
same page). Output: a markdown catalog keyed by ShotGrid page name.

### Task B — Forge codebase inventory

Read the current disk state of `artifacts/forge/src` (routes in `App.tsx`,
every page component, every existing filter/dropdown/sort control per page)
and `artifacts/api-server/src` (routes, middleware, what's real vs. what the
frontend fakes). Cross-check `lib/db/src/schema` for what data model exists.
Flag any build/type errors found along the way (broken imports, orphaned
routes, etc.) as a distinct "Errors Found" list — do not fix them.
Output: a markdown inventory keyed by Forge page name, plus an errors list.

### Task C — Corrections verification

For each item in:
- `forge-final.md` §4 and §4a (self-host deploy-blocker fixes + hardening pass)
- `docs/superpowers/plans/forge-hardening-plan.md` Task 1 (real RBAC
  capability enforcement) and Task 2 (compose healthcheck + pnpm pin)
- The two flagged commits `77a640f` (whole-branch review findings) and
  `a862b9f` (re-review notes)

...check the current code at `main` (`a862b9f`) and confirm whether the fix
is actually present and correct, partially present, or missing/regressed.
Output: a markdown checklist, one row per claimed fix, with file:line
evidence for each verdict.

### Task D — Feature + filter/dropdown gap matrix

Depends on A and B. Cross-reference the ShotGrid catalog against the Forge
inventory:
- A feature-parity table: ShotGrid capability/widget → Forge status
  (Present / Partial / Missing) → note. Cross-reference `forge-final.md` §6
  so intentionally-mock/deferred areas are marked "Deferred (known, by
  design)" rather than flagged as gaps.
- A page-by-page dropdown/filter checklist: for each Forge page with a
  ShotGrid equivalent, list every ShotGrid filter/dropdown/sort control and
  whether Forge has a matching control.

### Task E — Report assembly

Depends on A–D. Compile everything into one cohesive, well-organized document
(sections: Executive Summary, Corrections Verification, Errors Found, Feature
Parity Matrix, Dropdown/Filter Audit per page, Appendix: ShotGrid screenshot
catalog) and publish it as a downloadable PDF artifact.

## 4. Error handling

This is a read-only audit. Any bug, broken import, or missing feature found
is a **finding to report**, not something to fix in this pass. Task B/C must
not modify any file. The only files this session writes are: this spec, the
final report artifact, and (if useful for reproducibility) the PDF content
saved to the scratchpad before publishing.

## 5. Verification approach

- Task E's PDF artifact must be checked to actually render/open correctly
  before being handed to the user (this is a report deliverable, not code —
  "testing" here means confirming the artifact is well-formed and complete,
  not running a test suite).
- Cross-check row counts: Task D's matrix should account for every ShotGrid
  page identified in Task A and every Forge page identified in Task B — no
  silently dropped pages.

## 6. Explicitly out of scope

- No code changes, no commits to `artifacts/*` or `lib/*`.
- No attempt to rotate the leaked Neon DB password or otherwise act on
  `forge-final.md` §3 — already flagged there as requiring the user's own
  Neon account access.
- No re-litigating deployment/Docker/CI concerns — already covered by
  `forge-final.md` and `forge-hardening-plan.md`; this audit is about
  product feature/UI parity with ShotGrid, not deployment.
- No changes to `artifacts/mockup-sandbox`.
