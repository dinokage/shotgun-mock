"""
Forge Shot Creator -- Maya plugin.

Create a shot in Forge (Symbiosys Technologies' production tracker) from
inside Maya, into an existing Project -> Episode -> Sequence, without
switching to the browser.

Install: drop this file in your Maya scripts/ folder. In the Script Editor
(Python tab):

    import forge_shot_creator
    forge_shot_creator.show()

Get a token from Forge: Settings -> API Tokens -> Generate Token.

Mostly one-directional: this creates a shot in Forge and never writes
anything back into your Maya scene. It does read the scene's own playback
range (Range Slider min/max, not the full animation range -- the same
field the Render Settings frame range defaults from) to pre-fill the new
shot's frame range and duration, since that's real spec the scene already
has and typing it in twice invites it going stale. Both fields stay
editable in the dialog before you hit Create.
"""

import json
import os
import urllib.error
import urllib.request

import maya.cmds as cmds

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".forge_dcc_config.json")
WINDOW_NAME = "forgeShotCreatorWindow"


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
    # inventing a new, unaudited secret-storage scheme for one plugin. Still
    # written owner-only (0600): a plain open(..., "w") leaves the token
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


class _State(object):
    """Plain container -- Maya's cmds callbacks are free functions with no
    natural place to hang state, so this stands in for it."""

    def __init__(self):
        self.config = _load_config()
        self.projects = []
        self.episodes = []
        self.sequences = []


_state = _State()


def _project_names():
    return [p["name"] for p in _state.projects] or ["No projects found"]


def _episode_names():
    return [e["name"] for e in _state.episodes] or ["No episodes in this project"]


def _sequence_names():
    return [s["name"] for s in _state.sequences] or ["No sequences in this episode"]


def _selected_id(menu, items):
    if not items:
        return None
    value = cmds.optionMenu(menu, query=True, value=True)
    for item in items:
        if item["name"] == value:
            return item["id"]
    return None


def _refresh_episode_menu(*_args):
    project_id = _selected_id("forgeProjectMenu", _state.projects)
    cmds.optionMenu("forgeEpisodeMenu", edit=True, deleteAllItems=True)
    _state.episodes = []
    _state.sequences = []
    cmds.optionMenu("forgeSequenceMenu", edit=True, deleteAllItems=True)
    if not project_id:
        cmds.menuItem(label="No episodes in this project", parent="forgeEpisodeMenu")
        return
    try:
        _state.episodes = _request(_state.config, "GET", "/episodes?projectId=" + project_id) or []
    except RuntimeError as e:
        cmds.confirmDialog(title="Forge", message=str(e), button=["OK"])
        _state.episodes = []
    for name in _episode_names():
        cmds.menuItem(label=name, parent="forgeEpisodeMenu")
    _refresh_sequence_menu()


def _refresh_sequence_menu(*_args):
    project_id = _selected_id("forgeProjectMenu", _state.projects)
    episode_id = _selected_id("forgeEpisodeMenu", _state.episodes)
    cmds.optionMenu("forgeSequenceMenu", edit=True, deleteAllItems=True)
    _state.sequences = []
    if not project_id or not episode_id:
        cmds.menuItem(label="No sequences in this episode", parent="forgeSequenceMenu")
        return
    try:
        _state.sequences = _request(
            _state.config,
            "GET",
            "/sequences?projectId=%s&episodeId=%s" % (project_id, episode_id),
        ) or []
    except RuntimeError as e:
        cmds.confirmDialog(title="Forge", message=str(e), button=["OK"])
        _state.sequences = []
    for name in _sequence_names():
        cmds.menuItem(label=name, parent="forgeSequenceMenu")


def _scene_frame_range():
    """The Range Slider's min/max -- the same field Render Settings' own
    frame range defaults from, so it's what an artist already thinks of as
    "this shot's frames" rather than the (often much wider) full animation
    range. Returns (frameRangeString, durationInFrames)."""
    start = int(round(cmds.playbackOptions(query=True, minTime=True)))
    end = int(round(cmds.playbackOptions(query=True, maxTime=True)))
    if end < start:
        start, end = end, start
    return "%d-%d" % (start, end), max(1, end - start + 1)


def _create_shot(*_args):
    project_id = _selected_id("forgeProjectMenu", _state.projects)
    episode_id = _selected_id("forgeEpisodeMenu", _state.episodes)
    sequence_id = _selected_id("forgeSequenceMenu", _state.sequences)
    name = cmds.textField("forgeShotNameField", query=True, text=True).strip()
    frame_range = cmds.textField("forgeFrameRangeField", query=True, text=True).strip()

    if not project_id:
        cmds.confirmDialog(title="Forge", message="Pick a project first.", button=["OK"])
        return
    if not name:
        cmds.confirmDialog(title="Forge", message="Enter a shot name.", button=["OK"])
        return

    body = {"projectId": project_id, "name": name}
    if episode_id:
        body["episodeId"] = episode_id
    if sequence_id:
        body["sequenceId"] = sequence_id
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
    body["notes"] = "Created from Maya (scene: %s)" % (cmds.file(query=True, sceneName=True) or "untitled")

    try:
        _request(_state.config, "POST", "/shots", body)
    except RuntimeError as e:
        cmds.confirmDialog(title="Forge", message="Couldn't create shot:\n%s" % e, button=["OK"])
        return

    cmds.confirmDialog(title="Forge", message='Shot "%s" created.' % name, button=["OK"])
    cmds.textField("forgeShotNameField", edit=True, text="")


def _save_settings(*_args):
    _state.config["server_url"] = cmds.textField("forgeServerField", query=True, text=True).strip()
    _state.config["token"] = cmds.textField("forgeTokenField", query=True, text=True).strip()
    _save_config(_state.config)
    if cmds.window(WINDOW_NAME, exists=True):
        cmds.deleteUI(WINDOW_NAME)
    show()


def show():
    if cmds.window(WINDOW_NAME, exists=True):
        cmds.deleteUI(WINDOW_NAME)

    cmds.window(WINDOW_NAME, title="Forge Shot Creator", widthHeight=(360, 300))
    cmds.columnLayout(adjustableColumn=True, rowSpacing=8, columnAttach=("both", 12))
    cmds.separator(height=8, style="none")

    if not _state.config.get("server_url") or not _state.config.get("token"):
        cmds.text(label="Connect to your Forge server:", align="left")
        cmds.text(label="Server URL")
        cmds.textField("forgeServerField", text=_state.config.get("server_url", ""))
        cmds.text(label="Personal Access Token (Settings -> API Tokens in Forge)")
        cmds.textField("forgeTokenField", text="")
        cmds.separator(height=8, style="none")
        cmds.button(label="Save", command=_save_settings)
        cmds.showWindow(WINDOW_NAME)
        return

    try:
        _state.projects = _request(_state.config, "GET", "/projects") or []
    except RuntimeError as e:
        cmds.text(label=str(e), align="left", wordWrap=True)
        cmds.button(label="Reconfigure", command=lambda *_: _reset_settings())
        cmds.showWindow(WINDOW_NAME)
        return

    cmds.text(label="Project", align="left")
    cmds.optionMenu("forgeProjectMenu", changeCommand=_refresh_episode_menu)
    for name in _project_names():
        cmds.menuItem(label=name, parent="forgeProjectMenu")

    cmds.text(label="Episode", align="left")
    cmds.optionMenu("forgeEpisodeMenu", changeCommand=_refresh_sequence_menu)

    cmds.text(label="Sequence", align="left")
    cmds.optionMenu("forgeSequenceMenu")

    cmds.text(label="Shot Name", align="left")
    cmds.textField("forgeShotNameField", placeholderText="e.g. SC010_SH020")

    cmds.text(label="Frame Range (from this scene's Range Slider)", align="left")
    default_range, _duration = _scene_frame_range()
    cmds.textField("forgeFrameRangeField", text=default_range)

    cmds.separator(height=8, style="none")
    cmds.button(label="Create Shot", command=_create_shot, height=32)
    cmds.button(label="Reconfigure server/token", command=lambda *_: _reset_settings())

    cmds.showWindow(WINDOW_NAME)
    _refresh_episode_menu()


def _reset_settings():
    _state.config = {"server_url": "", "token": ""}
    if cmds.window(WINDOW_NAME, exists=True):
        cmds.deleteUI(WINDOW_NAME)
    show()
