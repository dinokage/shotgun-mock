"""
Forge Shot Creator -- Nuke plugin.

Create a shot in Forge (Symbiosys Technologies' production tracker) from
inside Nuke, into an existing Project -> Episode -> Sequence, without
switching to the browser.

Install: drop this file in your ~/.nuke/ folder, then add this line to
your ~/.nuke/menu.py:

    import forge_shot_creator

A "Forge" menu appears with "Create Shot...".

Get a token from Forge: Settings -> API Tokens -> Generate Token.

Mostly one-directional: this creates a shot in Forge and never writes
anything back into your Nuke script. It does read the script's own
first_frame/last_frame (Project Settings) to pre-fill the new shot's
frame range and duration, since that's real spec the script already has
and typing it in twice invites it going stale. Still editable in the
Shot Name panel before you hit OK.

Built as a short sequence of native nuke.Panel() dialogs (project, then
episode, then sequence, then name) rather than one combined cascading
form -- Nuke's built-in Panel has no change-callback to refresh a
dependent pulldown when an earlier one changes, and this avoids pulling
in PySide2/PySide6 (whose exact version varies across Nuke releases) for
what a few short steps already handle cleanly.
"""

import json
import os
import urllib.error
import urllib.request

import nuke

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
    # Written owner-only (0600): a plain open(..., "w") leaves the token
    # readable by every other account on a shared workstation, which a
    # render-farm or studio login machine often is -- flagged by security
    # review. os.open with O_CREAT lets us set the mode atomically at
    # creation instead of racing a separate chmod after the fact.
    if os.path.exists(CONFIG_PATH):
        os.chmod(CONFIG_PATH, 0o600)
    fd = os.open(CONFIG_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
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
    p = nuke.Panel("Forge -- Connect")
    p.addSingleLineInput("Server URL", config.get("server_url", ""))
    p.addSingleLineInput("Token", config.get("token", ""))
    if not p.show():
        return None
    config["server_url"] = p.value("Server URL").strip()
    config["token"] = p.value("Token").strip()
    if not config["server_url"] or not config["token"]:
        nuke.message("Both a server URL and a token are required.")
        return None
    _save_config(config)
    return config


def _pick(title, items, label_key="name"):
    """One nuke.Panel with a single pulldown; returns the chosen item dict
    or None if cancelled. `items` is a list of dicts each with at least
    `id` and `label_key`."""
    if not items:
        nuke.message("%s: nothing to pick from." % title)
        return None
    p = nuke.Panel(title)
    names = "|".join(item[label_key] for item in items)
    p.addEnumerationPulldown(title, names)
    if not p.show():
        return None
    chosen_name = p.value(title)
    for item in items:
        if item[label_key] == chosen_name:
            return item
    return None


def create_shot():
    config = _load_config()
    if not config.get("server_url") or not config.get("token"):
        config = _configure()
        if not config:
            return

    try:
        projects = _request(config, "GET", "/projects") or []
    except RuntimeError as e:
        nuke.message(str(e))
        return

    project = _pick("Project", projects)
    if not project:
        return

    try:
        episodes = _request(config, "GET", "/episodes?projectId=" + project["id"]) or []
    except RuntimeError as e:
        nuke.message(str(e))
        return

    episode = None
    if episodes:
        episode = _pick("Episode", episodes)
        # A cancelled episode pick still lets the shot be created directly
        # under the project (episodeId is optional server-side) -- only
        # bail out entirely if there were no episodes to begin with wasn't
        # the case here, so re-ask whether to skip rather than abandon.
        if episode is None:
            if not nuke.ask("No episode selected. Create the shot without one?"):
                return

    sequence = None
    if episode:
        try:
            sequences = _request(
                config, "GET", "/sequences?projectId=%s&episodeId=%s" % (project["id"], episode["id"])
            ) or []
        except RuntimeError as e:
            nuke.message(str(e))
            return
        if sequences:
            sequence = _pick("Sequence", sequences)
            if sequence is None:
                if not nuke.ask("No sequence selected. Create the shot without one?"):
                    return

    default_range = "%d-%d" % (
        int(nuke.root()["first_frame"].value()),
        int(nuke.root()["last_frame"].value()),
    )
    p = nuke.Panel("Shot Name")
    p.addSingleLineInput("Shot Name", "")
    p.addSingleLineInput("Frame Range", default_range)
    if not p.show():
        return
    name = p.value("Shot Name").strip()
    if not name:
        nuke.message("Enter a shot name.")
        return
    frame_range = p.value("Frame Range").strip()

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
            pass
    try:
        script_name = nuke.root().name()
    except ValueError:
        script_name = "untitled"
    body["notes"] = "Created from Nuke (script: %s)" % script_name

    try:
        _request(config, "POST", "/shots", body)
    except RuntimeError as e:
        nuke.message("Couldn't create shot:\n%s" % e)
        return

    nuke.message('Shot "%s" created in Forge.' % name)


nuke.menu("Nuke").addMenu("Forge").addCommand("Create Shot...", create_shot)
nuke.menu("Nuke").findItem("Forge").addCommand("Reconfigure server/token...", _configure)
