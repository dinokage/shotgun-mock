"""
Forge Shot Creator -- Blender add-on.

Create a shot in Forge (Symbiosys Technologies' production tracker) from
inside Blender, into an existing Project -> Episode -> Sequence, without
switching to the browser.

Install: Edit -> Preferences -> Add-ons -> Install..., pick this file,
enable "Forge Shot Creator". A "Forge" tab appears in the 3D viewport
sidebar (press N).

Get a token from Forge: Settings -> API Tokens -> Generate Token.

One-directional: this creates a shot in Forge. It never reads or writes
anything back into your Blender scene.
"""

bl_info = {
    "name": "Forge Shot Creator",
    "author": "Symbiosys Technologies",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Forge",
    "description": "Create a Forge shot in an existing Project/Episode/Sequence",
    "category": "Pipeline",
}

import json
import os
import urllib.error
import urllib.request

import bpy

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".forge_dcc_config.json")

# Populated by the Refresh operators below, never by the EnumProperty items
# callbacks themselves -- Blender calls those on every UI redraw, so a
# network request in one would stall the interface. Kept as (id, name)
# pairs; index 0 is always a "-- pick one --" placeholder with an empty id
# so nothing is submitted half-chosen.
_projects = []
_episodes = []
_sequences = []


def _load_config():
    if not os.path.exists(CONFIG_PATH):
        return {"server_url": "", "token": ""}
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except (IOError, ValueError):
        return {"server_url": "", "token": ""}


def _save_config(config):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f)


def _request(method, path, body=None):
    config = _load_config()
    url = config.get("server_url", "").rstrip("/") + "/api" + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + config.get("token", ""))
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
        raise RuntimeError("Couldn't reach Forge: %s" % e.reason)


def _project_items(_self, _context):
    return [("", "-- pick a project --", "")] + [(p["id"], p["name"], "") for p in _projects]


def _episode_items(_self, _context):
    return [("", "-- pick an episode --", "")] + [(e["id"], e["name"], "") for e in _episodes]


def _sequence_items(_self, _context):
    return [("", "-- pick a sequence --", "")] + [(s["id"], s["name"], "") for s in _sequences]


class ForgeSettings(bpy.types.PropertyGroup):
    server_url: bpy.props.StringProperty(name="Server URL", default="")
    token: bpy.props.StringProperty(name="Token", subtype="PASSWORD", default="")
    project: bpy.props.EnumProperty(name="Project", items=_project_items)
    episode: bpy.props.EnumProperty(name="Episode", items=_episode_items)
    sequence: bpy.props.EnumProperty(name="Sequence", items=_sequence_items)
    shot_name: bpy.props.StringProperty(name="Shot Name", default="")


class FORGE_OT_save_settings(bpy.types.Operator):
    bl_idname = "forge.save_settings"
    bl_label = "Save Server/Token"

    def execute(self, context):
        s = context.scene.forge_settings
        _save_config({"server_url": s.server_url.strip(), "token": s.token.strip()})
        self.report({"INFO"}, "Forge settings saved")
        return {"FINISHED"}


class FORGE_OT_refresh_projects(bpy.types.Operator):
    bl_idname = "forge.refresh_projects"
    bl_label = "Refresh Projects"

    def execute(self, context):
        global _projects, _episodes, _sequences
        try:
            _projects = _request("GET", "/projects") or []
        except RuntimeError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        _episodes = []
        _sequences = []
        self.report({"INFO"}, "Loaded %d project(s)" % len(_projects))
        return {"FINISHED"}


class FORGE_OT_refresh_episodes(bpy.types.Operator):
    bl_idname = "forge.refresh_episodes"
    bl_label = "Refresh Episodes"

    def execute(self, context):
        global _episodes, _sequences
        project_id = context.scene.forge_settings.project
        if not project_id:
            self.report({"ERROR"}, "Pick a project first")
            return {"CANCELLED"}
        try:
            _episodes = _request("GET", "/episodes?projectId=" + project_id) or []
        except RuntimeError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        _sequences = []
        self.report({"INFO"}, "Loaded %d episode(s)" % len(_episodes))
        return {"FINISHED"}


class FORGE_OT_refresh_sequences(bpy.types.Operator):
    bl_idname = "forge.refresh_sequences"
    bl_label = "Refresh Sequences"

    def execute(self, context):
        global _sequences
        s = context.scene.forge_settings
        if not s.project or not s.episode:
            self.report({"ERROR"}, "Pick a project and episode first")
            return {"CANCELLED"}
        try:
            _sequences = _request(
                "GET", "/sequences?projectId=%s&episodeId=%s" % (s.project, s.episode)
            ) or []
        except RuntimeError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        self.report({"INFO"}, "Loaded %d sequence(s)" % len(_sequences))
        return {"FINISHED"}


class FORGE_OT_create_shot(bpy.types.Operator):
    bl_idname = "forge.create_shot"
    bl_label = "Create Shot"

    def execute(self, context):
        s = context.scene.forge_settings
        name = s.shot_name.strip()
        if not s.project:
            self.report({"ERROR"}, "Pick a project first")
            return {"CANCELLED"}
        if not name:
            self.report({"ERROR"}, "Enter a shot name")
            return {"CANCELLED"}

        body = {"projectId": s.project, "name": name}
        if s.episode:
            body["episodeId"] = s.episode
        if s.sequence:
            body["sequenceId"] = s.sequence

        try:
            _request("POST", "/shots", body)
        except RuntimeError as e:
            self.report({"ERROR"}, "Couldn't create shot: %s" % e)
            return {"CANCELLED"}

        self.report({"INFO"}, 'Shot "%s" created in Forge' % name)
        s.shot_name = ""
        return {"FINISHED"}


class FORGE_PT_panel(bpy.types.Panel):
    bl_label = "Forge Shot Creator"
    bl_idname = "FORGE_PT_shot_creator"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Forge"

    def draw(self, context):
        layout = self.layout
        s = context.scene.forge_settings
        configured = bool(s.server_url and s.token) or bool(_load_config().get("token"))

        if not configured:
            box = layout.box()
            box.label(text="Connect to Forge")
            box.prop(s, "server_url")
            box.prop(s, "token")
            box.operator("forge.save_settings")
            return

        layout.prop(s, "project")
        layout.operator("forge.refresh_projects", icon="FILE_REFRESH")
        layout.separator()
        layout.prop(s, "episode")
        layout.operator("forge.refresh_episodes", icon="FILE_REFRESH")
        layout.separator()
        layout.prop(s, "sequence")
        layout.operator("forge.refresh_sequences", icon="FILE_REFRESH")
        layout.separator()
        layout.prop(s, "shot_name")
        layout.operator("forge.create_shot", icon="ADD")


classes = (
    ForgeSettings,
    FORGE_OT_save_settings,
    FORGE_OT_refresh_projects,
    FORGE_OT_refresh_episodes,
    FORGE_OT_refresh_sequences,
    FORGE_OT_create_shot,
    FORGE_PT_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.forge_settings = bpy.props.PointerProperty(type=ForgeSettings)
    config = _load_config()
    # Pre-fill the scene property from disk on load so "configured" reflects
    # a saved token immediately, not just one entered this session.
    if bpy.context.scene:
        bpy.context.scene.forge_settings.server_url = config.get("server_url", "")
        bpy.context.scene.forge_settings.token = config.get("token", "")


def unregister():
    del bpy.types.Scene.forge_settings
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
