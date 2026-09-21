# Forge DCC Plugins

Create a shot in Forge directly from Maya, Blender, or Nuke, into an
existing Project → Episode → Sequence, without switching to the browser.

Each plugin is a single, dependency-free Python file (stdlib `urllib`
only — no `requests`, since Blender in particular doesn't ship it
reliably). One-directional: the plugin creates a shot in Forge; Forge
never pushes anything back into the DCC tool.

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

## What it does and doesn't do

- Creates a shot into a Project/Episode/Sequence you already picked, that
  already exists in Forge. It does not create projects, episodes, or
  sequences.
- Always an explicit action you trigger — nothing runs automatically on
  file save.
- The shot then behaves exactly like one created through the web app's own
  Add Shot dialog (same validation, same visibility rules).
