# Forge DCC Plugins

Create a shot in Forge directly from Maya, Blender, Nuke, or Houdini, into
an existing Project → Episode → Sequence, along with that shot's real spec
(frame range, duration), without switching to the browser.

Each plugin is a single, dependency-free Python file (stdlib `urllib`
only — no `requests`, since Blender in particular doesn't ship it
reliably). Mostly one-directional: the plugin creates a shot in Forge and
pre-fills its frame range/duration by reading the current scene's own
timeline (Maya's Range Slider, Blender's Frame Start/End, Nuke's
first_frame/last_frame, Houdini's Playbar range) — Forge never pushes
anything back into the DCC tool, and the pre-filled fields stay editable
before you submit.

## Getting a token

1. In Forge, go to **Settings → API Tokens → Generate Token**.
2. Copy the token shown (it's shown once, and can't be retrieved again —
   if you lose it, revoke it and generate a new one).
3. Paste it into the plugin's settings for your tool (below).

A token acts as you, with exactly your own permissions. If you can't add a
shot in the Forge web app, the plugin will fail for the same reason.

## Server URL

Your studio's Forge server address, e.g. `http://10.180.9.120` — the same
one you use in the browser, no trailing slash.

## Per-tool install

- **Maya**: see `maya/forge_shot_creator.py` — drop it in your Maya
  `scripts/` folder, then in the Script Editor run:
  `import forge_shot_creator; forge_shot_creator.show()`
- **Blender**: see `blender/forge_shot_creator.py` — Edit → Preferences →
  Add-ons → Install..., pick the file, enable "Forge Shot Creator". A new
  "Forge" tab appears in the 3D viewport's sidebar (press `N`).
- **Nuke**: see `nuke/forge_shot_creator.py` — drop it in your
  `~/.nuke/` folder and add `import forge_shot_creator` to your
  `menu.py`. A "Forge" menu appears with "Create Shot...".
- **Houdini**: see `houdini/forge_shot_creator.py` — Shelf → right-click →
  New Tool..., paste the file's contents into the Script tab, save. Click
  the shelf button to run.

## What it does and doesn't do

- Creates a shot into a Project/Episode/Sequence you already picked, that
  already exists in Forge. It does not create projects, episodes, or
  sequences.
- Pre-fills the shot's frame range (and the derived frame-count duration)
  from the current scene's own timeline, editable before you submit.
- Always an explicit action you trigger — nothing runs automatically on
  file save.
- The shot then behaves exactly like one created through the web app's own
  Add Shot dialog (same validation, same visibility rules), and needs
  `create_tasks` (any artist, lead, or admin token already has it).

## Verification status

Each plugin's HTTP calls and the Forge-side endpoints they hit are
exercised end-to-end against a real, live Forge server as part of this
project's own testing. The DCC-side code itself (the `maya.cmds`/`bpy`/
`nuke`/`hou` calls) is written against each application's real, stable,
documented Python API, but has not been run inside an actual installed
copy of that application — do one quick smoke test per tool (connect,
create one real test shot) before relying on this for a client-facing
demo, and report anything that doesn't match what's described here.
