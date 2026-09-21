"""
Forge Shot Creator -- Houdini shelf tool.

Create a shot in Forge (Symbiosys Technologies' production tracker) from
inside Houdini, into an existing Project -> Episode -> Sequence, without
switching to the browser.

Install: Shelf -> right-click -> New Tool..., paste this whole file into
the "Script" tab, give it a label like "Forge", save. Click the shelf
button to run.

(Alternatively, drop this file anywhere on your Python path and add
`import forge_shot_creator; forge_shot_creator.create_shot()` as the
tool's script if you'd rather keep the source in one place shared across
machines instead of pasted into the shelf tool definition itself.)

Get a token from Forge: Settings -> API Tokens -> Generate Token.

Mostly one-directional: this creates a shot in Forge and never writes
anything back into your Houdini scene. It does read the scene's own
global frame range (the Playbar's start/end, Edit -> Playbar Range --
the same field Render globals default from) to pre-fill the new shot's
frame range and duration, since that's real spec the scene already has
and typing it in twice invites it going stale.

Built as a short sequence of native hou.ui dialogs (project, then
episode, then sequence, then name+frame-range) rather than a PySide
panel -- Houdini ships PySide reliably, but which major version varies
by release the same way Nuke's does, and hou.ui's own dialogs already
cover everything this needs without depending on either.
"""

import json
import os
import urllib.error
import urllib.request

import hou

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".forge_dcc_config.json")


def _load_config():
    if not os.path.exists(CONFIG_PATH):
        return {"server_url": "", "token": ""}
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except (IOError, ValueError):
        return {"server_url": "", "token": ""}


def _save_config(config):
    # Not encrypted -- same trust level as a password saved in a DCC tool's
    # own preferences file, which this deliberately mirrors rather than
    # inventing a new, unaudited secret-storage scheme for one plugin.
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f)


def _request(config, method, path, body=None):
    url = config["server_url"].rstrip("/") + "/api" + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + config["token"])
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read()).get("error", str(e))
        except (ValueError, AttributeError):
            detail = str(e)
        raise RuntimeError("Forge server error (%s): %s" % (e.code, detail))
    except urllib.error.URLError as e:
        raise RuntimeError("Couldn't reach Forge at %s: %s" % (config["server_url"], e.reason))


def _configure():
    config = _load_config()
    button, values = hou.ui.readMultiInput(
        "Connect to your Forge server:",
        ("Server URL", "Personal Access Token"),
        initial_contents=(config.get("server_url", ""), config.get("token", "")),
        title="Forge -- Connect",
        password_mode=(False, True),
    )
    if button != 0:
        return None
    server_url, token = values[0].strip(), values[1].strip()
    if not server_url or not token:
        hou.ui.displayMessage("Both a server URL and a token are required.")
        return None
    config["server_url"] = server_url
    config["token"] = token
    _save_config(config)
    return config


def _pick(title, items, label_key="name"):
    """A single hou.ui.selectFromList; returns the chosen item dict or None
    if cancelled/nothing chosen. `items` is a list of dicts each with at
    least `id` and `label_key`."""
    if not items:
        hou.ui.displayMessage("%s: nothing to pick from." % title)
        return None
    labels = [item[label_key] for item in items]
    chosen = hou.ui.selectFromList(labels, exclusive=True, title=title, message="Pick a %s:" % title)
    if not chosen:
        return None
    return items[chosen[0]]


def _scene_frame_range():
    """The Playbar's global start/end -- the same field Render globals
    default from. Returns (frameRangeString, durationInFrames)."""
    start, end = hou.playbar.frameRange()
    start, end = int(round(start)), int(round(end))
    if end < start:
        start, end = end, start
    return "%d-%d" % (start, end), max(1, end - start + 1)


def create_shot():
    config = _load_config()
    if not config.get("server_url") or not config.get("token"):
        config = _configure()
        if not config:
            return

    try:
        projects = _request(config, "GET", "/projects") or []
    except RuntimeError as e:
        hou.ui.displayMessage(str(e), severity=hou.severityType.Error)
        return

    project = _pick("Project", projects)
    if not project:
        return

    try:
        episodes = _request(config, "GET", "/episodes?projectId=" + project["id"]) or []
    except RuntimeError as e:
        hou.ui.displayMessage(str(e), severity=hou.severityType.Error)
        return

    episode = None
    if episodes:
        episode = _pick("Episode", episodes)
        # A cancelled episode pick still lets the shot be created directly
        # under the project (episodeId is optional server-side) -- only
        # bail out entirely if that wasn't a deliberate skip.
        if episode is None:
            if not hou.ui.displayConfirmation("No episode selected. Create the shot without one?"):
                return

    sequence = None
    if episode:
        try:
            sequences = _request(
                config, "GET", "/sequences?projectId=%s&episodeId=%s" % (project["id"], episode["id"])
            ) or []
        except RuntimeError as e:
            hou.ui.displayMessage(str(e), severity=hou.severityType.Error)
            return
        if sequences:
            sequence = _pick("Sequence", sequences)
            if sequence is None:
                if not hou.ui.displayConfirmation("No sequence selected. Create the shot without one?"):
                    return

    default_range, _duration = _scene_frame_range()
    button, values = hou.ui.readMultiInput(
        "New shot:",
        ("Shot Name", "Frame Range"),
        initial_contents=("", default_range),
        title="Forge -- Create Shot",
    )
    if button != 0:
        return
    name = values[0].strip()
    if not name:
        hou.ui.displayMessage("Enter a shot name.")
        return
    frame_range = values[1].strip()

    body = {"projectId": project["id"], "name": name}
    if episode:
        body["episodeId"] = episode["id"]
    if sequence:
        body["sequenceId"] = sequence["id"]
    if frame_range:
        body["frameRange"] = frame_range
        try:
            lo, hi = frame_range.split("-", 1)
            body["duration"] = max(1, int(hi) - int(lo) + 1)
        except (ValueError, IndexError):
            # Hand-edited into something that doesn't parse as "N-M" --
            # still send it as the frame range label, just skip deriving a
            # duration from it rather than fail the whole submission over a
            # field the server treats as optional either way.
            pass
    body["notes"] = "Created from Houdini (scene: %s)" % (hou.hipFile.path() or "untitled.hip")

    try:
        _request(config, "POST", "/shots", body)
    except RuntimeError as e:
        hou.ui.displayMessage("Couldn't create shot:\n%s" % e, severity=hou.severityType.Error)
        return

    hou.ui.displayMessage('Shot "%s" created in Forge.' % name)


if __name__ == "__main__":
    create_shot()
