"""
blender_panel.py — Blender N-panel equivalent of the Maya "Shot Publish"
tool (see ui/maya_shotpublish.py), built entirely on Blender's own Python
API: bpy.types.Panel / Operator / PropertyGroup / UIList.

Why native bpy instead of a Qt dialog like the Maya tool: Blender does not
ship PySide/PyQt, and building Qt against Blender's own bundled Python
interpreter is a per-version compile that has to be redone on every Blender
update -- most studio pipelines avoid it for exactly that maintenance cost.
bpy is Blender's own fully documented, open-source Python API
(https://docs.blender.org/api/current/) and is the toolkit Blender is
actually built to be extended with, so this reproduces the same
Episode/Seq/Shot fields, Publish Type dropdown, Cache checkbox, read-only
Owner field, per-check status list, and Sanity Check / Publish buttons as
native Blender UI instead.

Install: put this file (and the forge_publisher package it imports) on
Blender's addon path, then enable "Forge Shot Publish" in
Edit > Preferences > Add-ons. For quick iteration, open it in Blender's Text
Editor and click "Run Script" instead -- register() runs either way.

Usage once enabled: 3D Viewport > N-panel (press N) > "Forge" tab.
"""

import getpass

import bpy

from ..sanity.base_check import CheckStatus
from ..sanity.registry import get_check_classes
from ..publish import run_sanity_checks, all_checks_passed_or_warned, publish_shot
from ..config import get_forge_email

bl_info = {
    "name": "Forge Shot Publish",
    "author": "Symbiosys Technologies",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Forge",
    "description": "Pre-publish sanity checks and shot publish for the Forge pipeline",
    "category": "Pipeline",
}

_STATUS_ICONS = {
    CheckStatus.PENDING: "RADIOBUT_OFF",
    CheckStatus.RUNNING: "SORTTIME",
    CheckStatus.PASSED: "CHECKMARK",
    CheckStatus.WARNING: "ERROR",
    CheckStatus.FAILED: "CANCEL",
}

_PUBLISH_TYPES = [
    ("07_layout", "07_layout", "Layout publish"),
    ("08_animation", "08_animation", "Animation publish"),
]

# (SanityCheck, CheckResult) pairs from the most recent run, keyed by scene
# name. Kept in memory rather than serialized onto the scene: Publish always
# runs in the same Blender session right after Sanity Check, and the check
# objects/results aren't JSON-safe (unlike the Maya tool, there's no need to
# survive a file reload between the two steps).
_LAST_RESULTS = {}


def _current_owner():
    """Best-effort artist identity for the read-only Owner field, matching
    the studio's existing Maya tool's "firstname.employeeid"-style display."""
    email = get_forge_email()
    if email and "@" in email:
        return email.split("@", 1)[0]
    try:
        return getpass.getuser()
    except Exception:
        return ""


def _populate_checks(props):
    props.check_results.clear()
    for cls in get_check_classes(props.publish_type, dcc="blender"):
        item = props.check_results.add()
        item.check_name = cls.name
        item.status = CheckStatus.PENDING.value
    props.checks_passed = False
    props.active_index = 0


def _on_publish_type_updated(self, context):
    # Switching publish type invalidates any prior run -- it's a different
    # check set, same as the Maya tool resetting on type change.
    _populate_checks(self)
    _LAST_RESULTS.pop(context.scene.name, None)


class FORGE_CheckResultItem(bpy.types.PropertyGroup):
    check_name: bpy.props.StringProperty(name="Check")
    status: bpy.props.StringProperty(default=CheckStatus.PENDING.value)
    message: bpy.props.StringProperty(default="")


class FORGE_SceneProps(bpy.types.PropertyGroup):
    episode_no: bpy.props.StringProperty(name="Episode No")
    seq_no: bpy.props.StringProperty(name="Seq No")
    shot_no: bpy.props.StringProperty(name="Shot No")
    publish_type: bpy.props.EnumProperty(
        name="Publish Type", items=_PUBLISH_TYPES, default="07_layout", update=_on_publish_type_updated
    )
    use_cache: bpy.props.BoolProperty(name="Cache", default=False)
    check_results: bpy.props.CollectionProperty(type=FORGE_CheckResultItem)
    active_index: bpy.props.IntProperty(default=0)
    checks_passed: bpy.props.BoolProperty(default=False)


class FORGE_OT_run_sanity_checks(bpy.types.Operator):
    bl_idname = "forge.run_sanity_checks"
    bl_label = "Sanity Check"
    bl_description = "Run all pre-publish sanity checks for the selected publish type"

    def execute(self, context):
        props = context.scene.forge_shot_publish
        results = run_sanity_checks(props.publish_type, dcc="blender")
        _LAST_RESULTS[context.scene.name] = results

        by_name = {chk.name: res for chk, res in results}
        for item in props.check_results:
            res = by_name.get(item.check_name)
            if res is None:
                continue
            item.status = res.status.value
            item.message = res.message

        ok = all_checks_passed_or_warned(results)
        props.checks_passed = ok
        if ok:
            self.report({"INFO"}, "All sanity checks passed.")
        else:
            failed = [chk.name for chk, res in results if res.status == CheckStatus.FAILED]
            self.report({"ERROR"}, f"{len(failed)} check(s) failed: {', '.join(failed)}")
        return {"FINISHED"}


class FORGE_OT_publish(bpy.types.Operator):
    bl_idname = "forge.publish_shot"
    bl_label = "Publish"
    bl_description = "Publish this shot to the Forge portal"

    @classmethod
    def poll(cls, context):
        props = context.scene.forge_shot_publish
        return bool(props.checks_passed and props.episode_no and props.seq_no and props.shot_no)

    def execute(self, context):
        props = context.scene.forge_shot_publish
        sanity_results = _LAST_RESULTS.get(context.scene.name)
        if not sanity_results:
            self.report({"ERROR"}, "Run Sanity Check again before publishing.")
            return {"CANCELLED"}

        try:
            result = publish_shot(
                episode_no=props.episode_no,
                seq_no=props.seq_no,
                shot_no=props.shot_no,
                publish_type=props.publish_type,
                cache=props.use_cache,
                sanity_results=sanity_results,
                dcc="blender",
            )
        except Exception as exc:
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}

        version_label = result.get("version", {}).get("versionNumber", "")
        self.report(
            {"INFO"}, f"Published {props.episode_no}/{props.seq_no}/{props.shot_no} as {version_label}."
        )
        return {"FINISHED"}


class FORGE_UL_check_list(bpy.types.UIList):
    def draw_item(self, context, layout, data, item, icon, active_data, active_propname, index):
        row = layout.row(align=True)
        status = CheckStatus(item.status) if item.status else CheckStatus.PENDING
        row.label(text="", icon=_STATUS_ICONS.get(status, "RADIOBUT_OFF"))
        row.label(text=item.check_name)


class FORGE_PT_shot_publish(bpy.types.Panel):
    bl_label = "Shot Publish"
    bl_idname = "FORGE_PT_shot_publish"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Forge"

    def draw(self, context):
        layout = self.layout
        props = context.scene.forge_shot_publish

        col = layout.column(align=True)
        col.prop(props, "episode_no")
        col.prop(props, "seq_no")
        col.prop(props, "shot_no")

        row = layout.row(align=True)
        row.prop(props, "publish_type", text="")
        row.prop(props, "use_cache")

        layout.label(text=f"Owner: {_current_owner()}")

        layout.template_list(
            "FORGE_UL_check_list", "", props, "check_results", props, "active_index", rows=10
        )

        row = layout.row(align=True)
        row.operator(FORGE_OT_run_sanity_checks.bl_idname, text="Sanity Check")
        row.operator(FORGE_OT_publish.bl_idname, text="Publish")


_classes = (
    FORGE_CheckResultItem,
    FORGE_SceneProps,
    FORGE_OT_run_sanity_checks,
    FORGE_OT_publish,
    FORGE_UL_check_list,
    FORGE_PT_shot_publish,
)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.forge_shot_publish = bpy.props.PointerProperty(type=FORGE_SceneProps)
    for scene in bpy.data.scenes:
        _populate_checks(scene.forge_shot_publish)


def unregister():
    del bpy.types.Scene.forge_shot_publish
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
