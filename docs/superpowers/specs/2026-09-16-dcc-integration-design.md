# DCC Integration — Design Spec

**Date:** 2026-09-16
**Status:** Approved, implementation starting

## Purpose

Symbiosys Technologies' artists work inside DCC tools (Maya, Blender, Nuke)
day to day. Today, registering a shot in Forge means switching to the
browser and using the Add Shot dialog. The goal is to let a shot be created
directly from inside the DCC tool the artist is already working in, without
duplicating Forge's business logic anywhere.

## Scope

- One-directional: DCC plugin → Forge. Forge never pushes into the DCC tool.
- Plugin creates shots into an **existing** Project → Episode → Sequence
  (selected from what's already in Forge). It does not create
  projects/episodes/sequences.
- Explicit, artist-initiated action (a "Create Shot" button in the plugin),
  never a silent hook on file save — avoids spurious/duplicate shots from
  test saves and keeps a human decision behind every shot that appears in
  Forge.
- Three plugins: Maya, Blender, Nuke, built in one pass since each is a thin
  UI shell once the shared API exists.
- Out of scope for this pass: revoking a token remotely disables it
  immediately (must work), but there is no attempt at auto-detecting a shot
  from scene contents, no bidirectional sync, no asset (only shot) creation.

## Architecture

### Auth: personal API tokens, not the session cookie

A DCC plugin is a Python script on someone's workstation, not a browser —
the existing httpOnly session cookie doesn't fit. Each artist generates a
personal token from their own Forge profile (self-service, like changing
their own password), pastes it once into the plugin's config.

**New table** `api_tokens`:
- `id`, `tenantId`, `userId`
- `tokenHash` (SHA-256 of the raw token; the raw value is shown exactly once
  at creation and never stored or retrievable again — same pattern as a
  password, not reversible)
- `label` (e.g. "Maya — workstation 3")
- `createdAt`, `lastUsedAt` (updated on each authenticated request, best
  effort), `revokedAt` (null while active)

**New middleware**: a request carrying `Authorization: Bearer <token>` hashes
it, looks up `api_tokens` where `tokenHash` matches and `revokedAt` is null,
and populates `req.userId` / `req.tenantId` / `req.roleId` exactly like the
cookie-session middleware does today. Every existing route's
`requireCapability(...)` gate applies unchanged — a token inherits whatever
the artist who owns it can already do (if they hold `create_tasks`, so does
their token; nothing new to grant). No new business-logic endpoints: the
plugins call the same `GET /projects`, `GET /episodes`, `GET /sequences`,
`POST /shots` the web app itself uses.

Revoking a token (`revokedAt` set) takes effect on the next request — no
caching of validity beyond a single request's lookup.

### Token management UI

New Settings section, "API Tokens" — self-service, a person manages only
their own:
- List of this user's tokens (label, created date, last used date, a Revoke
  button per token)
- "Generate Token" — asks for a label, creates the row, shows the raw token
  once in a copyable, dismiss-to-continue dialog (the same UX shape as the
  existing client-access-link "copy this code" flow), with a clear warning
  it won't be shown again.

### The plugins

Maya, Blender, and Nuke each get a single-file Python script implementing
the same small flow:
1. A one-time settings entry for the pasted token (and the Forge server
   URL, since this is self-hosted).
2. On opening the panel: `GET /projects` (bearer-authed) to populate a
   Project dropdown, then `GET /episodes?projectId=` and
   `GET /sequences?projectId=&episodeId=` as each upstream picker is chosen
   — the same cascading-picker shape CreateTaskModal.tsx already uses in
   the web app.
3. A shot name field and "Create Shot" button →
   `POST /shots { projectId, episodeId, sequenceId, name }`. Success/failure
   surfaces in the DCC tool's own UI idiom (Maya: `cmds.confirmDialog`;
   Blender: `self.report({'INFO'/'ERROR'}, ...)`; Nuke: `nuke.message`).

HTTP: plain `urllib.request` rather than assuming `requests` is bundled —
Blender in particular doesn't ship it reliably across versions, and this
keeps all three plugins dependency-free beyond the DCC's own Python.

## Data flow

```
Artist opens plugin panel in Maya/Blender/Nuke
  → GET /projects (Bearer <token>)          [populate Project dropdown]
  → GET /episodes?projectId=X                [on Project selected]
  → GET /sequences?projectId=X&episodeId=Y   [on Episode selected]
  → artist types shot name, clicks Create Shot
  → POST /shots { projectId, episodeId, sequenceId, name }
  → shot now visible in Forge's Episodes tab / Shots & Assets, same as if
    created through the web app
```

## Error handling

- Invalid/revoked/malformed token → 401, plugin shows "Token not valid —
  generate a new one in Forge Settings."
- Network/server unreachable → plugin shows the raw connection error rather
  than a misleading generic message (self-hosted server may simply be down).
- `POST /shots` failure (e.g. missing capability, validation error) →
  surfaces the API's actual error message in the DCC's dialog, same text a
  web-app user would see from the existing Add Shot dialog's error toast.

## Testing

- Backend: token creation produces a working bearer credential that reaches
  the same `req.userId` a cookie session for that user would; revocation
  takes effect immediately; an unrelated tenant's token cannot read this
  tenant's data (tenant scoping already enforced by every existing route,
  verified it isn't bypassed by the new middleware).
- One plugin (whichever is fastest to get a real DCC install to test
  against) is verified end-to-end: real token, real project picked, a real
  shot appears in Forge afterward. The other two are code-reviewed against
  the same flow rather than each independently live-tested if a second DCC
  install isn't available in this environment.
