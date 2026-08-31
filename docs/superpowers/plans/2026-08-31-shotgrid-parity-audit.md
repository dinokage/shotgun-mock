# ShotGrid Parity Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one PDF-downloadable report auditing Forge (this repo's `artifacts/forge` + `artifacts/api-server`) against Autodesk ShotGrid's real UI (from reference screenshots), verifying that the RBAC/hardening-branch corrections landed and cataloging every feature and dropdown/filter gap.

**Architecture:** Nine tasks, mostly parallel. Task A is split into 4 independent image-batch catalogers (A1–A4) plus a merge (A5) because 69 reference images is too much for one subagent's context window. Tasks B (codebase inventory) and C (corrections checklist) run independently in parallel with the A-batches. Task D (gap matrix) waits on A5+B. Task E (report assembly + PDF artifact) waits on everything.

**Tech Stack:** Read/Glob/Grep tools for research, markdown for intermediate outputs, the Artifact tool (HTML, print-friendly) for the final PDF-downloadable deliverable.

**Spec:** `docs/superpowers/specs/2026-08-31-shotgrid-parity-audit-design.md`

## Global Constraints

- **Read-only against the codebase.** No task may modify any file under `artifacts/` or `lib/`. The only files this plan creates are the ones listed under each task's "Files" section, plus the final artifact.
- **`artifacts/mockup-sandbox` is out of scope** — do not read it for Task B/D (it's a disconnected prototype, not part of the deployed app, per `forge-final.md`).
- **Do not re-flag known limitations as new findings.** `forge-final.md` §6 lists intentional scope (most entities are frontend-mock; `requireCapability` is the only capability-gated route; `JWT_SECRET` has a dev fallback, etc.) — carry these forward as "Deferred (known, by design)", don't present them as newly-discovered gaps.
- **Commit each task's output file to git** in `shotgun-mock` after writing it (frequent commits, one per task, for traceability of the audit trail itself).
- All reference images live under `C:\Users\user\Forge-final\` (absolute path — outside the `shotgun-mock` repo).
- All Forge codebase reading happens against `C:\Users\user\shotgun-mock` at branch `main` (`origin/main`, commit `a862b9f` at plan-writing time — if `main` has moved, note the new commit hash in your output but proceed against current `main`).

---

## Task A1: ShotGrid catalog — screenshot batch 1 (18.36.59–18.56.21)

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-1.md`

**Interfaces:**
- Produces: a batch catalog fragment consumed by Task A5 (merge). Must follow the exact section format below so A5 can mechanically merge fragments.

**Images to read (in order), all under `C:\Users\user\Forge-final\`:**
```
WhatsApp Image 2026-08-26 at 18.36.59.jpeg
WhatsApp Image 2026-08-26 at 18.37.21.jpeg
WhatsApp Image 2026-08-26 at 18.37.50.jpeg
WhatsApp Image 2026-08-26 at 18.38.30.jpeg
WhatsApp Image 2026-08-26 at 18.39.07.jpeg
WhatsApp Image 2026-08-26 at 18.39.27.jpeg
WhatsApp Image 2026-08-26 at 18.40.13.jpeg
WhatsApp Image 2026-08-26 at 18.41.21.jpeg
WhatsApp Image 2026-08-26 at 18.42.34.jpeg
WhatsApp Image 2026-08-26 at 18.43.09.jpeg
WhatsApp Image 2026-08-26 at 18.44.15.jpeg
WhatsApp Image 2026-08-26 at 18.45.10.jpeg
WhatsApp Image 2026-08-26 at 18.45.51.jpeg
WhatsApp Image 2026-08-26 at 18.46.00.jpeg
WhatsApp Image 2026-08-26 at 18.47.28.jpeg
WhatsApp Image 2026-08-26 at 18.50.28.jpeg
WhatsApp Image 2026-08-26 at 18.53.37.jpeg
WhatsApp Image 2026-08-26 at 18.56.21.jpeg
```

- [ ] **Step 1: Read all 18 images with the Read tool**, one at a time, in the order listed.

- [ ] **Step 2: For each image, write one entry using this exact template:**

```markdown
### <filename>
- **ShotGrid page/screen:** <e.g. "Shot list (grid view)", "Task detail panel", "My Tasks", etc. — name it the way ShotGrid itself would label it if visible in a header/breadcrumb, otherwise your best identification>
- **Layout:** <1-2 sentences: what's on screen — left nav, top bar, main panel content>
- **Widgets:** <bullet list of distinct UI widgets/panels visible — cards, charts, tables, timelines, thumbnails grid, etc.>
- **Dropdowns/Filters:** <bullet list, one per control. Format: "`<control label>` — <what it does/what options are visible>". If none visible on this screen, write "None visible on this screen.">
```

- [ ] **Step 3: Group entries under page-name headings.** If multiple images in this batch show the same page (e.g. several show "Shot list" from different scroll positions or with a dropdown open), group them under one `## <Page Name>` heading with each image as a sub-entry, rather than repeating the page name 3 times. If a page only appears once in this batch, it still gets its own `## <Page Name>` heading with one sub-entry.

- [ ] **Step 4: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-1.md` starting with:

```markdown
# ShotGrid Catalog — Batch 1 (18 images: 18.36.59–18.56.21)

<your grouped ## sections here>
```

- [ ] **Step 5: Self-verify.** Count the `###` sub-entries in your file — it must equal 18 (one per source image, even if grouped under a shared `##` heading). If it doesn't, find the missing image and add it. Add a final line: `**Image count check:** 18/18 cataloged.`

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-1.md
git commit -m "docs(audit): ShotGrid reference catalog, batch 1"
```

---

## Task A2: ShotGrid catalog — screenshot batch 2 (18.58.30–19.16.19)

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-2.md`

**Interfaces:** Same as Task A1 — produces a fragment for Task A5.

**Images to read (in order), all under `C:\Users\user\Forge-final\`:**
```
WhatsApp Image 2026-08-26 at 18.58.30.jpeg
WhatsApp Image 2026-08-26 at 19.00.01.jpeg
WhatsApp Image 2026-08-26 at 19.00.39.jpeg
WhatsApp Image 2026-08-26 at 19.02.26.jpeg
WhatsApp Image 2026-08-26 at 19.03.31.jpeg
WhatsApp Image 2026-08-26 at 19.05.06.jpeg
WhatsApp Image 2026-08-26 at 19.08.12.jpeg
WhatsApp Image 2026-08-26 at 19.08.37.jpeg
WhatsApp Image 2026-08-26 at 19.09.22.jpeg
WhatsApp Image 2026-08-26 at 19.09.58.jpeg
WhatsApp Image 2026-08-26 at 19.10.25.jpeg
WhatsApp Image 2026-08-26 at 19.11.13.jpeg
WhatsApp Image 2026-08-26 at 19.11.51.jpeg
WhatsApp Image 2026-08-26 at 19.12.30.jpeg
WhatsApp Image 2026-08-26 at 19.13.34.jpeg
WhatsApp Image 2026-08-26 at 19.14.01.jpeg
WhatsApp Image 2026-08-26 at 19.14.49.jpeg
WhatsApp Image 2026-08-26 at 19.16.19.jpeg
```

- [ ] **Step 1: Read all 18 images with the Read tool**, in order.
- [ ] **Step 2: Write one entry per image** using the identical template from Task A1, Step 2.
- [ ] **Step 3: Group entries under page-name headings**, same rule as Task A1, Step 3.
- [ ] **Step 4: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-2.md`, header: `# ShotGrid Catalog — Batch 2 (18 images: 18.58.30–19.16.19)`.
- [ ] **Step 5: Self-verify** — 18 `###` sub-entries, append `**Image count check:** 18/18 cataloged.`
- [ ] **Step 6: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-2.md
git commit -m "docs(audit): ShotGrid reference catalog, batch 2"
```

---

## Task A3: ShotGrid catalog — screenshot batch 3 (19.16.48–19.26.46)

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-3.md`

**Interfaces:** Same as Task A1 — produces a fragment for Task A5.

**Images to read (in order), all under `C:\Users\user\Forge-final\`:**
```
WhatsApp Image 2026-08-26 at 19.16.48.jpeg
WhatsApp Image 2026-08-26 at 19.17.18.jpeg
WhatsApp Image 2026-08-26 at 19.18.05.jpeg
WhatsApp Image 2026-08-26 at 19.18.51.jpeg
WhatsApp Image 2026-08-26 at 19.19.10.jpeg
WhatsApp Image 2026-08-26 at 19.19.36.jpeg
WhatsApp Image 2026-08-26 at 19.20.01.jpeg
WhatsApp Image 2026-08-26 at 19.21.09.jpeg
WhatsApp Image 2026-08-26 at 19.21.31.jpeg
WhatsApp Image 2026-08-26 at 19.22.14.jpeg
WhatsApp Image 2026-08-26 at 19.23.14.jpeg
WhatsApp Image 2026-08-26 at 19.23.37.jpeg
WhatsApp Image 2026-08-26 at 19.24.17.jpeg
WhatsApp Image 2026-08-26 at 19.25.02.jpeg
WhatsApp Image 2026-08-26 at 19.25.16.jpeg
WhatsApp Image 2026-08-26 at 19.25.30.jpeg
WhatsApp Image 2026-08-26 at 19.26.00.jpeg
WhatsApp Image 2026-08-26 at 19.26.46.jpeg
```

- [ ] **Step 1: Read all 18 images with the Read tool**, in order.
- [ ] **Step 2: Write one entry per image** using the identical template from Task A1, Step 2.
- [ ] **Step 3: Group entries under page-name headings**, same rule as Task A1, Step 3.
- [ ] **Step 4: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-3.md`, header: `# ShotGrid Catalog — Batch 3 (18 images: 19.16.48–19.26.46)`.
- [ ] **Step 5: Self-verify** — 18 `###` sub-entries, append `**Image count check:** 18/18 cataloged.`
- [ ] **Step 6: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-3.md
git commit -m "docs(audit): ShotGrid reference catalog, batch 3"
```

---

## Task A4: ShotGrid catalog — icon/asset reference batch

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-4-icons.md`

**Interfaces:** Same as Task A1 — produces a fragment for Task A5. This batch is likely icon/logo/status-badge references rather than full-page screenshots — say so explicitly if that's what you observe.

**Images to read (in order), all under `C:\Users\user\Forge-final\`:**
```
images.jpg
images.png
images (1).jpg
images (1).png
images (2).jpg
images (2).png
images (3).jpg
images (3).png
images (4).jpg
images (5).jpg
images (6).jpg
images (7).jpg
images (8).jpg
images (9).jpg
images (10).jpg
```

- [ ] **Step 1: Read all 15 images with the Read tool**, in order.

- [ ] **Step 2: For each image, write one entry using this template** (simpler than the full-page template — these are small assets, not screens):

```markdown
### <filename>
- **What it shows:** <e.g. "ShotGrid logo mark", "status pill icon (green, 'Approved')", "entity-type icon (Shot)", "a small UI snippet — describe exactly what's in it">
- **Relevance to a specific ShotGrid page/feature, if any:** <name it if identifiable, otherwise "Standalone icon/asset, not tied to a specific page.">
```

- [ ] **Step 3: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-4-icons.md`, header: `# ShotGrid Catalog — Batch 4: Icon/Asset References (15 images)`.

- [ ] **Step 4: Self-verify** — 15 `###` entries, append `**Image count check:** 15/15 cataloged.`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-4-icons.md
git commit -m "docs(audit): ShotGrid reference catalog, icon/asset batch"
```

---

## Task A5: Merge ShotGrid catalog batches into one document

**Depends on:** A1, A2, A3, A4 (must run after all four are committed).

**Files:**
- Read: `docs/superpowers/audit/2026-08-31-shotgrid-parity/catalog-batch-1.md`, `catalog-batch-2.md`, `catalog-batch-3.md`, `catalog-batch-4-icons.md`
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/shotgrid-catalog.md`

**Interfaces:**
- Consumes: the four batch files (each has `## <Page Name>` sections with `###` sub-entries per image, per the A1–A3 template; batch 4 has its own simpler per-icon template).
- Produces: the final merged catalog, consumed by Task D (gap matrix) and Task E (report appendix). Must have one `## <Page Name>` section per **distinct** ShotGrid page across all batches (the same page may appear in multiple batches — merge those into a single section, don't duplicate the heading), plus one `## Icon/Asset References` section carrying batch 4 through unchanged.

- [ ] **Step 1: Read all four batch files.**

- [ ] **Step 2: Build a page-name → images index.** List every distinct `## <Page Name>` heading found across batches 1–3. Where the same page name (or an unambiguous near-duplicate naming, e.g. "Shot List" vs "Shots list") appears in more than one batch, treat it as one page and merge its sub-entries together in read order.

- [ ] **Step 3: Write the merged file** with this structure:

```markdown
# ShotGrid Reference Catalog (merged)

**Total screenshots cataloged:** 69 (54 page screenshots + 15 icon/asset references)
**Distinct ShotGrid pages identified:** <N>

## Page Index
<one-line bullet list of every distinct page name, for Task D to scan quickly>

<then each merged ## <Page Name> section, all its ### sub-entries from every batch it appeared in, consolidated Dropdowns/Filters lists deduplicated (if two screenshots of the same page both show a "Status" filter, list it once, but keep any distinct filters each screenshot adds)>

## Icon/Asset References
<batch 4's content, unchanged>
```

- [ ] **Step 4: Self-verify.** Sum of `###` sub-entries across all `## <Page Name>` sections must equal 54. The Icon/Asset References section must have 15 entries. Append: `**Total check:** 54 page screenshots + 15 icon/asset references = 69/69 accounted for.`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/shotgrid-catalog.md
git commit -m "docs(audit): merge ShotGrid reference catalog batches"
```

---

## Task B: Forge codebase inventory

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/forge-inventory.md`

**Interfaces:**
- Produces: consumed by Task D (gap matrix). Must have one `## <Page Name>` section per Forge page/route, each listing its existing dropdown/filter/sort controls, plus a top-level `## Errors Found` section.

- [ ] **Step 1: Read the route table.** Read `C:\Users\user\shotgun-mock\artifacts\forge\src\App.tsx` in full. List every `<Route path="..." component={...}>` entry — this is your page inventory's index. Note the component name each route maps to.

- [ ] **Step 2: For each route's component, find and read its source file** under `C:\Users\user\shotgun-mock\artifacts\forge\src\pages\` (use Glob to confirm the exact filename/casing — some may be `kebab-case.tsx`, some may be a directory with an `index.tsx`). If an imported page component's file does **not** exist on disk, do not guess — record it directly in `## Errors Found` (see Step 4) with the exact import line and the route(s) that use it, and skip inventorying its controls (there's nothing to read).

- [ ] **Step 3: For each page file that does exist, identify every dropdown/filter/sort/group control** in its JSX/logic — search for patterns like `<Select`, `<DropdownMenu`, `useState` tied to a "filter"/"sort"/"status"/"group by" variable, or components imported from `@/components/shared/FilterBar` or similar shared filter components. Read the shared component file(s) once (e.g. `artifacts/forge/src/components/shared/FilterBar.tsx` if it exists) to understand what a "FilterBar" usage actually renders, rather than guessing from the import name alone.

  Write one section per page using this template:

```markdown
## <Page Name> (`src/pages/<file>`, route `<path>`)
- **Purpose:** <1 sentence, inferred from the code>
- **Existing dropdowns/filters/sort controls:**
  - `<control label or state var name>` — <what it filters/sorts, what options>
  - (or "None found in this file.")
- **Data source:** <real API call (name the hook/endpoint) or frontend-mock store (name the store)>
```

- [ ] **Step 4: Write `## Errors Found`** as the first section of the output file, before the per-page sections. List every broken import, orphaned route (route defined but component file missing), or dead/unreachable route you noticed while doing Steps 1–3. Format:

```markdown
## Errors Found

- **<short title>** — `<file>:<line>` — <what's wrong, and what breaks as a result (e.g. "app fails to build" / "route 404s at runtime")>
```

If you find none beyond what's already known, still include the heading with "No additional build/type errors found beyond what was already documented." — but do independently verify the specific broken-import claim from the spec's Task B description before writing that; don't assume it's still true without checking.

- [ ] **Step 5: Check `C:\Users\user\shotgun-mock\artifacts\api-server\src`** (routes, middleware) and `C:\Users\user\shotgun-mock\lib\db\src\schema` briefly — for each Forge page inventoried in Step 3, note in a final `## Backend/Data-Model Notes` section whether that page's data is backed by a real API route + DB table, or is frontend-mock-only. Cross-reference `forge-final.md` §6's claim that only `/auth`, `/projects`, `/tasks`, `/users` are real — confirm or correct this against current `main`.

- [ ] **Step 6: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/forge-inventory.md` with sections in this order: `## Errors Found`, then one `## <Page Name>` section per route from Step 1 (skip only truly-missing files, but still list them under Errors Found), then `## Backend/Data-Model Notes`.

- [ ] **Step 7: Self-verify.** Count the `## <Page Name>` sections — it must equal the number of distinct page components found in Step 1 (minus any confirmed-missing files, which instead appear in Errors Found). Append: `**Route coverage check:** <N> routes found in App.tsx, <M> pages inventoried, <K> missing/broken (see Errors Found). N = M + K.`

- [ ] **Step 8: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/forge-inventory.md
git commit -m "docs(audit): Forge codebase inventory"
```

---

## Task C: Corrections verification

**Files:**
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/corrections-checklist.md`

**Interfaces:**
- Produces: consumed by Task E (report). A markdown checklist, one row per item, verdict ∈ {✅ Present, ⚠️ Partial, ❌ Missing/Regressed}.

- [ ] **Step 1: Read the spec's Task C section** in `docs/superpowers/specs/2026-08-31-shotgrid-parity-audit-design.md` (28 numbered items, grouped into: items 1–9 from `forge-final.md` §4, items 10–18 from §4a, items 19–20 from the RBAC hardening plan, items 21–26 from commit `77a640f`, items 27–28 from commit `a862b9f`).

- [ ] **Step 2: For each of the 28 items, open the exact file(s) named** and check whether the described fix is actually present in the code at current `main`. Use Grep to locate the relevant function/line first if the file is large, then Read the surrounding context to confirm behavior, not just presence of a keyword.

- [ ] **Step 3: Write one row per item** using this exact table format:

```markdown
| # | Claim | Verdict | Evidence (file:line) | Notes |
|---|-------|---------|----------------------|-------|
| 1 | nginx.conf has /api/ proxy_pass block | ✅ Present | artifacts/forge/nginx.conf:12-18 | matches described behavior |
```

Fill in real file:line evidence for every row — "trust me" rows without a file:line citation are not acceptable. If something is ⚠️ Partial or ❌ Missing/Regressed, the Notes column must say specifically what's wrong (not just "doesn't match").

- [ ] **Step 4: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/corrections-checklist.md`, starting with `# Corrections Verification Checklist` and a one-line summary count (`**Result:** X/28 Present, Y/28 Partial, Z/28 Missing/Regressed.`), then the full 28-row table.

- [ ] **Step 5: Self-verify.** Table must have exactly 28 data rows (one per numbered item in the spec) — count them.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/corrections-checklist.md
git commit -m "docs(audit): corrections verification checklist"
```

---

## Task D: Feature + filter/dropdown gap matrix

**Depends on:** A5, B (must run after both are committed).

**Files:**
- Read: `docs/superpowers/audit/2026-08-31-shotgrid-parity/shotgrid-catalog.md`, `docs/superpowers/audit/2026-08-31-shotgrid-parity/forge-inventory.md`, `forge-final.md` (repo root, §6 specifically)
- Create: `docs/superpowers/audit/2026-08-31-shotgrid-parity/gap-matrix.md`

**Interfaces:**
- Consumes: the ShotGrid catalog's `## Page Index` and per-page `Dropdowns/Filters` lists; the Forge inventory's per-page `Existing dropdowns/filters/sort controls` lists.
- Produces: consumed by Task E (report). Two tables: feature-parity, and dropdown/filter-parity.

- [ ] **Step 1: Read both input files fully, plus `forge-final.md` §6.**

- [ ] **Step 2: Match ShotGrid pages to Forge pages.** For each ShotGrid page in the catalog's Page Index, find the Forge page that's meant to be its equivalent (they may not share an exact name — e.g. ShotGrid "My Tasks" ≈ Forge `tasks.tsx`). If no Forge equivalent exists at all, that's a full-page gap, not a control gap.

- [ ] **Step 3: Write the Feature Parity table:**

```markdown
## Feature Parity Matrix

| ShotGrid Page/Feature | Forge Equivalent | Status | Notes |
|---|---|---|---|
| Shot List (grid view) | shots.tsx | Present | matches core layout |
| Timesheets | timesheets.tsx | Partial | missing weekly-approval workflow seen in screenshot X |
| <backend-dependent feature already known-mock per forge-final.md §6> | <page> | Deferred (known, by design) | see forge-final.md §6 — intentionally frontend-mock at this stage |
```

Status ∈ {Present, Partial, Missing, Deferred (known, by design)}. Use "Deferred" only for items `forge-final.md` §6 already explicitly names as intentional scope — everything else missing is a real gap, even if it would require backend work.

- [ ] **Step 4: Write the Dropdown/Filter Parity table**, one row per ShotGrid page that has at least one dropdown/filter/sort control in the catalog:

```markdown
## Dropdown/Filter Parity

| ShotGrid Page | ShotGrid Control | Forge Page | Forge Has It? | Notes |
|---|---|---|---|---|
| Shot List | Status filter (dropdown) | shots.tsx | Yes | matches |
| Shot List | Group by Sequence | shots.tsx | No | not found in forge-inventory.md |
```

- [ ] **Step 5: Write the file** `docs/superpowers/audit/2026-08-31-shotgrid-parity/gap-matrix.md` with both tables, and a summary line before each: total pages compared, total controls compared, counts per status.

- [ ] **Step 6: Self-verify.** Every page listed in the ShotGrid catalog's Page Index must appear as a row (or be explicitly covered) in the Feature Parity table — no silently dropped pages. Append: `**Coverage check:** <N> ShotGrid pages in catalog, <N> rows in Feature Parity Matrix.` The two numbers must match.

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\user\shotgun-mock"
git add docs/superpowers/audit/2026-08-31-shotgrid-parity/gap-matrix.md
git commit -m "docs(audit): feature and dropdown/filter gap matrix"
```

---

## Task E: Report assembly and PDF artifact

**Depends on:** A5, B, C, D (must run after all four are committed).

**Files:**
- Read: `shotgrid-catalog.md`, `forge-inventory.md`, `corrections-checklist.md`, `gap-matrix.md` (all under `docs/superpowers/audit/2026-08-31-shotgrid-parity/`)
- Create: an HTML report file in the scratchpad directory (e.g. `<scratchpad>/shotgrid-parity-report.html`), then publish it via the Artifact tool.

**Interfaces:** Terminal task — no downstream consumer. Final deliverable is the published Artifact URL, reported back to the user.

- [ ] **Step 1: Read all four input files in full.**

- [ ] **Step 2: Before writing any HTML, load the `artifact-design` skill** (per this environment's Artifact tool requirement) to calibrate the report's visual design — this is a real deliverable the user will read/print, not a throwaway page.

- [ ] **Step 3: Compose the report content**, organized as:
  1. **Executive Summary** — a few sentences: overall corrections status (X/28), how many pages have full ShotGrid parity vs. partial vs. missing, how many dropdown/filter gaps found, count of errors found.
  2. **Corrections Verification** — the full 28-row table from `corrections-checklist.md`.
  3. **Errors Found** — pulled from `forge-inventory.md`'s `## Errors Found` section.
  4. **Feature Parity Matrix** — from `gap-matrix.md`.
  5. **Dropdown/Filter Audit** — from `gap-matrix.md`.
  6. **Appendix: ShotGrid Reference Catalog** — a condensed version of `shotgrid-catalog.md` (page index plus per-page dropdown/filter lists; the full per-image layout/widget prose can be summarized rather than reproduced verbatim, to keep the report scannable).

- [ ] **Step 4: Write the HTML file.** Follow the artifact-design skill's guidance for structure/typography. Include a print stylesheet (`@media print`) so the user can use the browser's Print → Save as PDF to get an actual PDF file — note this explicitly in the Executive Summary or a short instructions line, since the Artifact tool cannot force a file download itself.

- [ ] **Step 5: Publish via the Artifact tool.** Give it a distinctive title (e.g. "Forge / ShotGrid Parity Audit") and a one-sentence description. Pick a favicon emoji.

- [ ] **Step 6: Self-verify.** After publishing, use `Artifact` with `action: "read"` on the returned URL to confirm the page content matches what you intended (catches publish-time truncation or render issues) — do not just trust the publish call succeeded.

- [ ] **Step 7: No commit needed for the artifact itself** (it's hosted, not a repo file) — but commit the scratchpad HTML source is unnecessary too (scratchpad is not part of the repo). This task's only "commit" is reporting the final Artifact URL back to the user in your task summary.

---

## Self-Review

**Spec coverage:** Task A1–A5 cover spec Task A (all 69 images, grouped by page). Task B covers spec Task B (codebase inventory + errors list). Task C covers spec Task C (all 28 checklist items verbatim from the spec). Task D covers spec Task D (both the feature-parity table and the dropdown/filter table, with `forge-final.md` §6 cross-referencing to avoid false-flagging deferred scope). Task E covers spec Task E (single PDF-printable artifact with all required sections). Spec §4 (error handling: read-only, no fixes) is enforced as a Global Constraint. Spec §5 (verification: coverage checks, artifact render check) is implemented as each task's Self-Verify step plus Task E Step 6.

**Placeholder scan:** No task step says "handle appropriately" or "similar to Task N" without content — every step names exact files, exact templates, and exact self-verify counts.

**Type/format consistency:** The per-image template introduced in A1 Step 2 is reused verbatim by A2 and A3; A5's merge logic depends on that exact `## <Page Name>` / `###` structure holding across all three batches. Task B's per-page template and Task D's table columns are referenced consistently between the task that produces them and the task that consumes them.
