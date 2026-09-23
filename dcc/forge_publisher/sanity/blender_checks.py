"""
blender_checks.py — Blender equivalents of the Maya sanity checks, using bpy.

Each check replicates the intent of the Maya check using the Blender Python
API (bpy.data, bpy.context, etc.).
"""

import os
import re
from typing import List

from .base_check import SanityCheck, CheckResult

# Guard: bpy is only available inside Blender
try:
    import bpy  # noqa: F401

    _IN_BLENDER = True
except ImportError:
    _IN_BLENDER = False


def _bpy():
    if not _IN_BLENDER:
        raise RuntimeError("This check must be run inside Blender.")
    import bpy as _b

    return _b


# ---------------------------------------------------------------------------
# Blender checks (mirrors of Maya checks)
# ---------------------------------------------------------------------------


class BlenderSceneCollectionStructureCheck(SanityCheck):
    name = "Scene Collection Structure"
    description = "Checks that expected top-level collections exist (Geometry, Cameras, Rigs)."

    EXPECTED = ("Geometry", "Cameras", "Rigs")

    def run(self) -> CheckResult:
        b = _bpy()
        existing = {c.name for c in b.data.collections}
        missing = [n for n in self.EXPECTED if n not in existing]
        if not missing:
            return self.passed("All expected collections found.")
        return self.failed(
            f"Missing collections: {', '.join(missing)}",
            details="Create the missing top-level collections before publishing.",
        )


class BlenderUnwantedObjectsCheck(SanityCheck):
    name = "Unwanted Test Objects"
    description = "Detects objects whose name contains 'tmp', 'test', or 'placeholder'."

    _BAD = re.compile(r"(tmp|test|placeholder|wip)", re.IGNORECASE)

    def run(self) -> CheckResult:
        b = _bpy()
        bad = [o.name for o in b.data.objects if self._BAD.search(o.name)]
        if not bad:
            return self.passed("No unwanted test objects found.")
        return self.failed(
            f"Found {len(bad)} unwanted object(s): {', '.join(bad[:5])}",
            details="\n".join(bad),
        )


class BlenderMissingLinkedLibraryCheck(SanityCheck):
    name = "Missing Linked Libraries"
    description = "Checks that all linked .blend libraries are accessible on disk."

    def run(self) -> CheckResult:
        b = _bpy()
        missing = [
            lib.filepath
            for lib in b.data.libraries
            if not os.path.exists(b.path.abspath(lib.filepath))
        ]
        if not missing:
            return self.passed("All linked libraries found on disk.")
        return self.failed(
            f"{len(missing)} linked library file(s) missing.",
            details="\n".join(missing),
        )


class BlenderFrameRangeCheck(SanityCheck):
    name = "Frame Range"
    description = "Verifies scene frame range matches the shot config."

    def run(self) -> CheckResult:
        import json

        b = _bpy()
        scene = b.context.scene
        actual_start = scene.frame_start
        actual_end = scene.frame_end

        cfg_path = os.environ.get("FORGE_SHOT_CONFIG", "")
        if cfg_path and os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r") as fh:
                    cfg = json.load(fh)
                exp_start = int(cfg.get("frameStart", actual_start))
                exp_end = int(cfg.get("frameEnd", actual_end))
                if actual_start == exp_start and actual_end == exp_end:
                    return self.passed(f"Frame range {actual_start}–{actual_end} matches config.")
                return self.failed(
                    f"Frame range {actual_start}–{actual_end} ≠ expected {exp_start}–{exp_end}."
                )
            except Exception:
                pass

        return self.warning(
            f"Scene range {actual_start}–{actual_end}. No shot config — cannot verify.",
        )


class BlenderFPSCheck(SanityCheck):
    name = "Frame Rate (FPS)"
    description = "Ensures scene FPS is 24 or 25."

    ALLOWED = {24, 25}

    def run(self) -> CheckResult:
        b = _bpy()
        render = b.context.scene.render
        effective_fps = round(render.fps / render.fps_base, 3)
        if effective_fps in {24.0, 25.0} and render.fps_base == 1.0:
            return self.passed(f"Scene FPS is {render.fps}.")
        return self.failed(
            f"Scene FPS is {effective_fps}. Expected 24 or 25.",
            details="Change in Properties -> Output -> Frame Rate.",
        )


class BlenderWhitespaceInFileNameCheck(SanityCheck):
    name = "Whitespace in File Name"
    description = "Fails when the .blend file path contains spaces."

    def run(self) -> CheckResult:
        b = _bpy()
        path = b.data.filepath
        if not path:
            return self.warning("File has not been saved yet.")
        if " " in path:
            return self.failed(f"File path contains spaces: '{path}'")
        return self.passed(f"No spaces in file path: {os.path.basename(path)}")


class BlenderRenderCameraCheck(SanityCheck):
    name = "Render Camera"
    description = "Verifies that a render camera is assigned to the scene."

    def run(self) -> CheckResult:
        b = _bpy()
        camera = b.context.scene.camera
        if camera is None:
            return self.failed("No render camera assigned to scene.")
        return self.passed(f"Render camera: '{camera.name}'")


class BlenderDoubleCollectionCheck(SanityCheck):
    name = "Duplicate Collection Names"
    description = "Warns when two or more collections share the same name."

    def run(self) -> CheckResult:
        b = _bpy()
        import re
        dupe_pattern = re.compile(r"^(.*?)\.\d{3}$")
        dupes = [c.name for c in b.data.collections if dupe_pattern.match(c.name)]
        if not dupes:
            return self.passed("No duplicate collection names.")
        return self.warning(
            f"Duplicate collection names: {', '.join(set(dupes))}",
        )


class BlenderUnusedMaterialsCheck(SanityCheck):
    name = "Unused Materials"
    description = "Warns when materials exist in the file but are not assigned to any object."

    def run(self) -> CheckResult:
        b = _bpy()
        used = {
            slot.material
            for obj in b.data.objects
            for slot in obj.material_slots
            if slot.material
        }
        unused = [m.name for m in b.data.materials if m not in used]
        if not unused:
            return self.passed("No unused materials found.")
        return self.warning(
            f"{len(unused)} unused material(s): {', '.join(unused[:10])}",
        )


class BlenderCacheSetCheck(SanityCheck):
    name = "Cache Collection Absent"
    description = (
        "For layout publish, a 'CACHE' collection should not yet exist."
    )

    def run(self) -> CheckResult:
        b = _bpy()
        if any(c.name.upper() == "CACHE" for c in b.data.collections):
            return self.warning("'CACHE' collection found — unexpected at layout stage.")
        return self.passed("'CACHE' collection absent — correct for layout.")


class BlenderNameConventionCheck(SanityCheck):
    name = "Object Naming Convention"
    description = (
        "Warns when mesh objects don't follow the naming convention "
        "<type>_<name>_<purpose> (e.g. GEO_hero_body)."
    )

    _PATTERN = re.compile(r"^[A-Z]{2,5}_[a-zA-Z0-9]+(_[a-zA-Z0-9]+)*$")

    def run(self) -> CheckResult:
        b = _bpy()
        bad = [
            o.name
            for o in b.data.objects
            if o.type == "MESH" and not self._PATTERN.match(o.name)
        ]
        if not bad:
            return self.passed("All mesh objects follow naming convention.")
        return self.warning(
            f"{len(bad)} mesh object(s) break naming convention.",
            details="\n".join(bad[:30]),
        )
