"""
maya_checks.py — All Maya sanity checks for the Forge publisher.

Checks are grouped by pipeline stage:
  - Layout (07_layout)
  - Animation (08_animation, which adds extra checks on top of layout checks)

Each class is a concrete SanityCheck that queries the Maya scene via
``maya.cmds`` (or ``pymel.core`` / ``maya.api`` where appropriate) and
returns a CheckResult.

Design notes
------------
* Checks never *fix* anything — they only diagnose.
* Checks that require project-specific context (e.g. expected frame range)
  read that context from environment variables or from the Forge shot config
  JSON (``FORGE_SHOT_CONFIG`` env var pointing to a JSON file).
* Where a check genuinely cannot verify without live project data it returns
  WARNING rather than FAILED so the pipeline is not blocked by config gaps.
"""

import os
import re
import json
from typing import Optional

from .base_check import SanityCheck, CheckResult, CheckStatus

# ---------------------------------------------------------------------------
# Guard: import maya.cmds only when running inside Maya
# ---------------------------------------------------------------------------
try:
    import maya.cmds as cmds  # noqa: F401
    import maya.mel as mel  # noqa: F401

    _IN_MAYA = True
except ImportError:
    _IN_MAYA = False


def _cmds():
    """Return maya.cmds, raising a helpful error when not in Maya."""
    if not _IN_MAYA:
        raise RuntimeError("This check must be run inside Autodesk Maya.")
    import maya.cmds as _c

    return _c


def _load_shot_config() -> dict:
    """Load the per-shot config JSON injected by the launcher, if available."""
    path = os.environ.get("FORGE_SHOT_CONFIG", "")
    if path and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return {}


# ===========================================================================
# 07_layout checks
# ===========================================================================


class SceneCollectionStructureCheck(SanityCheck):
    name = "Scene Collection Structure"
    description = (
        "Verifies that the expected top-level group nodes exist in the scene "
        "( geometry_grp, camera_grp, rig_grp )."
    )

    EXPECTED_GROUPS = ("geometry_grp", "camera_grp", "rig_grp")

    def run(self) -> CheckResult:
        c = _cmds()
        missing = [g for g in self.EXPECTED_GROUPS if not c.objExists(g)]
        if not missing:
            return self.passed("All expected top-level groups found.")
        return self.failed(
            f"Missing groups: {', '.join(missing)}",
            details="Create the missing top-level organisational groups before publishing.",
        )


class UnwantedReferenceCheck(SanityCheck):
    name = "Unwanted Reference Nodes"
    description = (
        "Checks for reference nodes whose namespace contains 'tmp', 'test', "
        "'placeholder', or 'WIP' — these should not reach layout publish."
    )

    _BAD_PATTERNS = re.compile(r"(tmp|test|placeholder|wip)", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                ns = c.referenceQuery(ref, namespace=True) or ""
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if self._BAD_PATTERNS.search(ns) or self._BAD_PATTERNS.search(fn):
                    bad.append(f"{ref} ({fn})")
            except Exception:
                pass
        if not bad:
            return self.passed("No unwanted reference nodes found.")
        return self.failed(
            f"Found {len(bad)} unwanted reference(s): {', '.join(bad[:3])}{'…' if len(bad) > 3 else ''}",
            details="\n".join(bad),
        )


class InvalidReferenceFileCheck(SanityCheck):
    name = "Invalid Reference Files"
    description = "Checks that all referenced files exist on disk."

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        missing = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and not os.path.exists(fn):
                    missing.append(fn)
            except Exception:
                pass
        if not missing:
            return self.passed("All reference files exist on disk.")
        return self.failed(
            f"{len(missing)} reference file(s) missing from disk.",
            details="\n".join(missing),
        )


class FrameRangeCheck(SanityCheck):
    name = "Frame Range"
    description = (
        "Verifies that the scene's playback start/end matches the shot's "
        "expected frame range from the Forge shot config."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        actual_start = int(c.playbackOptions(q=True, minTime=True))
        actual_end = int(c.playbackOptions(q=True, maxTime=True))
        cfg = _load_shot_config()

        if not cfg:
            return self.warning(
                f"Scene frame range is {actual_start}–{actual_end}. "
                "No shot config found — cannot verify against expected range.",
                details="Set FORGE_SHOT_CONFIG env var to the path of the shot JSON config.",
            )

        expected_start = int(cfg.get("frameStart", actual_start))
        expected_end = int(cfg.get("frameEnd", actual_end))

        if actual_start == expected_start and actual_end == expected_end:
            return self.passed(
                f"Frame range {actual_start}–{actual_end} matches shot config."
            )
        return self.failed(
            f"Frame range mismatch: scene is {actual_start}–{actual_end}, "
            f"expected {expected_start}–{expected_end}.",
            details="Update the scene playback range to match the shot's edit.",
        )


class CheckRigPathCheck(SanityCheck):
    name = "Rig File Paths"
    description = (
        "Ensures all rig references resolve from the approved pipeline drive "
        "(e.g. /prod/ or P:/)."
    )

    # Regex for acceptable rig-path roots — customise per facility
    _GOOD_ROOT = re.compile(r"^(/prod/|[Pp]:/|//server/)", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and "rig" in fn.lower() and not self._GOOD_ROOT.match(fn):
                    bad.append(fn)
            except Exception:
                pass
        if not bad:
            return self.passed("All rig references point to approved pipeline paths.")
        return self.failed(
            f"{len(bad)} rig reference(s) from unapproved path(s).",
            details="\n".join(bad),
        )


class AudioNamingConventionsCheck(SanityCheck):
    name = "Audio Naming Conventions"
    description = (
        "Checks that audio node names and referenced .wav/.aiff files follow "
        "the convention EP##_SQ###_SH###_audio.*"
    )

    _PATTERN = re.compile(
        r"EP\d{2,3}_SQ\d{3}_SH\d{3}_audio\.(wav|aiff|aif|mp3)$", re.IGNORECASE
    )

    def run(self) -> CheckResult:
        c = _cmds()
        audio_nodes = c.ls(type="audio") or []
        if not audio_nodes:
            return self.passed("No audio nodes in scene.")
        bad = []
        for node in audio_nodes:
            fn = c.getAttr(f"{node}.filename") or ""
            if fn and not self._PATTERN.search(os.path.basename(fn)):
                bad.append(f"{node}: {os.path.basename(fn)}")
        if not bad:
            return self.passed("All audio files follow naming conventions.")
        return self.warning(
            f"{len(bad)} audio file(s) break naming convention.",
            details="\n".join(bad),
        )


class CurrentTimeUnitCheck(SanityCheck):
    name = "Current Time Unit"
    description = (
        "Verifies scene FPS matches the facility standard: "
        "'pal' (25 fps) or 'film' (24 fps)."
    )

    ALLOWED = {"pal", "film"}  # 25 fps and 24 fps respectively

    def run(self) -> CheckResult:
        c = _cmds()
        unit = c.currentUnit(q=True, time=True)
        if unit in self.ALLOWED:
            fps_label = "25 fps" if unit == "pal" else "24 fps"
            return self.passed(f"Time unit is '{unit}' ({fps_label}).")
        return self.failed(
            f"Time unit is '{unit}'. Expected 'pal' (25 fps) or 'film' (24 fps).",
            details="Change via: maya.cmds.currentUnit(time='pal')",
        )


class CheckMeshKeysCheck(SanityCheck):
    name = "Mesh Keyframes"
    description = (
        "Warns when mesh transform nodes in the scene have keyframes "
        "(layout should use references, not direct animation on geometry)."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        meshes = c.ls(type="mesh") or []
        keyed = []
        for mesh in meshes:
            parent = (c.listRelatives(mesh, parent=True) or [None])[0]
            if parent and c.keyframe(parent, q=True, keyframeCount=True):
                keyed.append(parent)
        if not keyed:
            return self.passed("No unexpected keyframes found on mesh transforms.")
        return self.warning(
            f"{len(keyed)} mesh transform(s) have keyframes.",
            details="\n".join(keyed[:20]),
        )


class CameraNamespaceCheck(SanityCheck):
    name = "Camera Namespace"
    description = (
        "Verifies that all renderable cameras live under a 'cam' namespace "
        "(e.g. cam:renderCam)."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        cameras = c.ls(type="camera") or []
        # Exclude Maya's built-in persp/top/front/side cameras
        built_in = {"perspShape", "topShape", "frontShape", "sideShape"}
        render_cams = [
            cam
            for cam in cameras
            if cam not in built_in and c.getAttr(f"{cam}.renderable")
        ]
        bad = [cam for cam in render_cams if ":cam:" not in cam and not cam.startswith("cam:")]
        if not bad:
            return self.passed("All renderable cameras are in the 'cam' namespace.")
        return self.failed(
            f"Renderable camera(s) outside 'cam' namespace: {', '.join(bad)}",
            details="Move cameras into a namespace called 'cam'.",
        )


class AnimaticsExistsCheck(SanityCheck):
    name = "Animatics Reference Exists"
    description = "Checks that an animatics reference node is present in the scene."

    _ANIMATIC_PATTERN = re.compile(r"animatic", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                ns = c.referenceQuery(ref, namespace=True) or ""
                if self._ANIMATIC_PATTERN.search(fn) or self._ANIMATIC_PATTERN.search(ns):
                    return self.passed(f"Animatics reference found: {ref}")
            except Exception:
                pass
        return self.warning(
            "No animatics reference found in scene.",
            details="Import or reference the animatics cut for this shot.",
        )


class WhitespaceInFileNameCheck(SanityCheck):
    name = "Whitespace in File Name"
    description = "Fails when the current Maya scene file path contains spaces."

    def run(self) -> CheckResult:
        c = _cmds()
        scene_path = c.file(q=True, sceneName=True) or ""
        if not scene_path:
            return self.warning(
                "Scene has not been saved yet — cannot check file name.",
                details="Save the scene before publishing.",
            )
        if " " in scene_path:
            return self.failed(
                f"Scene file path contains spaces: '{scene_path}'",
                details="Rename the file and all parent directories to remove spaces.",
            )
        return self.passed(f"No spaces in scene path: {os.path.basename(scene_path)}")


class AnimaticsPathExistsCheck(SanityCheck):
    name = "Animatics File Path Exists"
    description = "Verifies that the referenced animatics file actually exists on disk."

    _ANIMATIC_PATTERN = re.compile(r"animatic", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if self._ANIMATIC_PATTERN.search(fn):
                    if os.path.exists(fn):
                        return self.passed(f"Animatics file exists: {fn}")
                    else:
                        return self.failed(
                            f"Animatics file not found on disk: {fn}",
                            details="Ensure the animatics file is accessible from this machine.",
                        )
            except Exception:
                pass
        return self.warning("No animatics reference to verify path for.")


class ReferenceFromCorrectDriveCheck(SanityCheck):
    name = "Reference Drive"
    description = (
        "Ensures all references resolve from an approved network drive "
        "(configurable via FORGE_APPROVED_DRIVES env var, default: P:/, /prod/)."
    )

    def _approved_roots(self):
        env = os.environ.get("FORGE_APPROVED_DRIVES", "")
        if env:
            return [r.strip() for r in env.split(";") if r.strip()]
        return ["/prod/", "P:/", "//server/", "\\\\server\\"]

    def run(self) -> CheckResult:
        c = _cmds()
        approved = self._approved_roots()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and not any(
                    fn.lower().startswith(root.lower()) for root in approved
                ):
                    bad.append(fn)
            except Exception:
                pass
        if not bad:
            return self.passed("All references resolve from approved drives.")
        return self.failed(
            f"{len(bad)} reference(s) from unapproved drives.",
            details="\n".join(bad),
        )


class NamespaceExistsCheck(SanityCheck):
    name = "Required Namespaces"
    description = "Checks that the expected namespaces (cam, char, env) exist."

    REQUIRED = ("cam", "char", "env")

    def run(self) -> CheckResult:
        c = _cmds()
        existing = set(c.namespaceInfo(listOnlyNamespaces=True, recurse=True) or [])
        missing = [ns for ns in self.REQUIRED if ns not in existing]
        if not missing:
            return self.passed("All required namespaces exist.")
        return self.warning(
            f"Missing namespace(s): {', '.join(missing)}",
            details="Create the missing namespaces or check that the relevant references are loaded.",
        )


class MultipleHideLayerCheck(SanityCheck):
    name = "Multiple Hide Layers"
    description = "Warns when more than one display layer is hidden."

    def run(self) -> CheckResult:
        c = _cmds()
        layers = c.ls(type="displayLayer") or []
        hidden = [
            lyr
            for lyr in layers
            if lyr != "defaultLayer" and not c.getAttr(f"{lyr}.visibility")
        ]
        if len(hidden) <= 1:
            return self.passed(f"{len(hidden)} hidden display layer(s) — acceptable.")
        return self.warning(
            f"{len(hidden)} display layers are hidden: {', '.join(hidden)}",
            details="Verify that layers are hidden intentionally before publishing.",
        )


class ImportedReferenceCheck(SanityCheck):
    name = "Imported References"
    description = "Detects nodes that originated from a reference that was imported."

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        orphaned = [
            r for r in refs 
            if r not in ("sharedReferenceNode", "_UNKNOWN_REF_NODE_")
            and not c.referenceQuery(r, isLoaded=True)
            and not c.referenceQuery(r, filename=True, unresolvedName=True)
        ]
        if not orphaned:
            return self.passed("No imported (orphaned) reference nodes found.")
        return self.warning(
            f"{len(orphaned)} node(s) appear to be imported from references.",
            details="\n".join(orphaned[:30]),
        )


class CheckRefFilepathCheck(SanityCheck):
    name = "Reference File Paths"
    description = "Verifies reference paths follow the pipeline naming convention."

    # Expected pattern: /<project>/<episode>/<seq>/<asset_or_shot>/…
    _PIPELINE_RE = re.compile(
        r"(EP\d{2,3}|ep\d{2,3}).*?(SQ\d{3}|sq\d{3})", re.IGNORECASE
    )

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and not self._PIPELINE_RE.search(fn):
                    bad.append(fn)
            except Exception:
                pass
        if not bad:
            return self.passed("All reference paths follow pipeline naming.")
        return self.warning(
            f"{len(bad)} reference path(s) do not match pipeline convention.",
            details="\n".join(bad),
        )


class CamViewUnwantedReferencesCheck(SanityCheck):
    name = "Camera View Unwanted References"
    description = (
        "Checks that no placeholder or animatics references appear in the "
        "camera's near-clip or image-plane stack."
    )

    _BAD = re.compile(r"(placeholder|tmp|WIP|animatic)", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        image_planes = c.ls(type="imagePlane") or []
        bad = []
        for ip in image_planes:
            fn = c.getAttr(f"{ip}.imageName") or ""
            if self._BAD.search(fn):
                bad.append(f"{ip}: {fn}")
        if not bad:
            return self.passed("No unwanted references in camera image planes.")
        return self.warning(
            f"{len(bad)} image plane(s) reference unwanted files.",
            details="\n".join(bad),
        )


class DoubleNamespaceCheck(SanityCheck):
    name = "Double Namespace"
    description = "Detects nodes with two or more namespace levels (e.g. a:b:node)."

    def run(self) -> CheckResult:
        c = _cmds()
        all_nodes = c.ls() or []
        # Match names with at least two ':' separators
        double_ns = [n for n in all_nodes if n.count(":") >= 2]
        if not double_ns:
            return self.passed("No double-namespaced nodes found.")
        return self.failed(
            f"{len(double_ns)} node(s) have double namespaces.",
            details="\n".join(double_ns[:30]),
        )


class CheckRenderLayersCheck(SanityCheck):
    name = "Render Layer Names"
    description = (
        "Ensures render layer names follow the convention: "
        "rl_<description> (e.g. rl_beauty, rl_shadow)."
    )

    _PATTERN = re.compile(r"^rl_[a-zA-Z0-9_]+$")

    def run(self) -> CheckResult:
        c = _cmds()
        layers = c.ls(type="renderLayer") or []
        bad = [
            lyr
            for lyr in layers
            if lyr != "defaultRenderLayer" and not self._PATTERN.match(lyr)
        ]
        if not bad:
            return self.passed("All render layers follow naming convention.")
        return self.warning(
            f"Render layer(s) with non-standard names: {', '.join(bad)}",
            details="Rename layers to follow the 'rl_<description>' convention.",
        )


class CacheSetDoesNotExistCheck(SanityCheck):
    name = "Cache Set Absent"
    description = (
        "For layout publish, the 'cache_SET' object set should not yet exist "
        "(it belongs to the animation stage)."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        if c.objExists("cache_SET"):
            return self.warning(
                "'cache_SET' found in scene — this is unexpected at layout stage.",
                details="Remove or rename the cache_SET if this is a layout publish.",
            )
        return self.passed("'cache_SET' does not exist — correct for layout.")


class CheckPropPathCheck(SanityCheck):
    name = "Prop Reference Paths"
    description = "Verifies prop references point to the approved asset library path."

    _PROP_RE = re.compile(r"prop", re.IGNORECASE)
    _APPROVED = re.compile(r"(asset_lib|assets)", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and self._PROP_RE.search(fn) and not self._APPROVED.search(fn):
                    bad.append(fn)
            except Exception:
                pass
        if not bad:
            return self.passed("All prop references use the approved asset library path.")
        return self.warning(
            f"{len(bad)} prop reference(s) from non-standard paths.",
            details="\n".join(bad),
        )


class CheckSetPathCheck(SanityCheck):
    name = "Set / Environment Reference Paths"
    description = "Verifies environment/set references point to the approved library."

    _SET_RE = re.compile(r"(set_|_set|environment|env_)", re.IGNORECASE)
    _APPROVED = re.compile(r"(asset_lib|environments|sets)", re.IGNORECASE)

    def run(self) -> CheckResult:
        c = _cmds()
        refs = c.ls(type="reference") or []
        bad = []
        for ref in refs:
            try:
                fn = c.referenceQuery(ref, filename=True, withoutCopyNumber=True) or ""
                if fn and self._SET_RE.search(fn) and not self._APPROVED.search(fn):
                    bad.append(fn)
            except Exception:
                pass
        if not bad:
            return self.passed("All set/environment references use approved paths.")
        return self.warning(
            f"{len(bad)} set/environment reference(s) from non-standard paths.",
            details="\n".join(bad),
        )


# ===========================================================================
# 08_animation additional checks
# ===========================================================================


class CheckImportedTransformsCheck(SanityCheck):
    name = "Imported Transforms"
    description = (
        "Detects transform nodes that have been imported into the scene "
        "rather than kept as live references."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        transforms = c.ls(type="transform") or []
        # Imported transforms are NOT referenced (isNodeReferenced == False)
        # but have a non-default, non-built-in history
        imported = [
            t
            for t in transforms
            if not c.referenceQuery(t, isNodeReferenced=True)
            and t not in ("persp", "top", "front", "side", "world", "geometry_grp", "camera_grp", "rig_grp")
            and ":" not in t  # namespaced nodes are usually from references
        ]
        if len(imported) == 0:
            return self.passed("No imported transforms detected.")
        if len(imported) <= 5:
            return self.warning(
                f"{len(imported)} non-referenced transform(s) found: {', '.join(imported)}",
                details="Verify these are intentional (e.g. custom control rig nodes).",
            )
        return self.failed(
            f"{len(imported)} imported transforms detected — scene may have stale geometry.",
            details="\n".join(imported[:30]),
        )


class CheckTransformNodeKeysCheck(SanityCheck):
    name = "Transform Node Keyframes"
    description = (
        "Ensures transform nodes are properly keyframed: "
        "checks that the main animation controls have at least one keyframe."
    )

    def run(self) -> CheckResult:
        c = _cmds()
        # Check referenced character transforms for any keys
        ref_transforms = [
            n
            for n in (c.ls(type="transform") or [])
            if c.referenceQuery(n, isNodeReferenced=True)
        ]
        keyed_count = sum(
            1
            for t in ref_transforms
            if c.keyframe(t, q=True, keyframeCount=True)
        )
        if keyed_count == 0 and ref_transforms:
            return self.warning(
                "No keyframes found on any referenced transform nodes.",
                details="Ensure character/prop rigs have animation before publishing.",
            )
        if not ref_transforms:
            return self.warning(
                "No referenced transform nodes found to check for keyframes.",
                details="Ensure character references are loaded.",
            )
        return self.passed(
            f"{keyed_count} of {len(ref_transforms)} referenced transforms have keyframes."
        )


class CheckLayoutStatusCheck(SanityCheck):
    name = "Layout Task Status"
    description = (
        "Queries the Forge portal to confirm that the layout task for this shot "
        "is in 'approved' or 'done' status before animation publish is allowed."
    )

    def run(self) -> CheckResult:
        from forge_publisher.config import (
            get_forge_url,
            get_forge_email,
            get_forge_password,
            get_forge_api_token,
            get_shot_config_path,
        )

        cfg = _load_shot_config()
        if not cfg:
            return self.warning(
                "No shot config found — cannot verify layout status.",
                details="Set FORGE_SHOT_CONFIG to a valid shot config JSON path.",
            )

        episode_no = cfg.get("episodeNo", "")
        seq_no = cfg.get("seqNo", "")
        shot_no = cfg.get("shotNo", "")

        if not (episode_no and seq_no and shot_no):
            return self.warning(
                "Shot config is missing episodeNo/seqNo/shotNo fields.",
            )

        try:
            from forge_publisher.api_client import ForgeAPIClient

            client = ForgeAPIClient(
                get_forge_url(),
                get_forge_email(),
                get_forge_password(),
                api_token=get_forge_api_token(),
            )
            if not client.login():
                return self.warning(
                    "Could not authenticate with Forge portal to check layout status.",
                )
            shots = client.get_shots(episode_no, seq_no, shot_no)
            if not shots:
                return self.warning(
                    f"Shot not found in Forge: {episode_no}/{seq_no}/{shot_no}",
                )
            shot = shots[0]
            status = shot.get("internalReviewStatus", "")
            # The real internalReviewStatus value set is "pending" |
            # "approved" | "rejected" | "changes-requested" |
            # "not-submitted" (see Shot.internalReviewStatus in
            # lib/db/schema.prisma) -- "done" was never a real value here,
            # so that branch could never actually pass.
            if status == "approved":
                return self.passed(f"Layout status is '{status}' — animation publish allowed.")
            return self.failed(
                f"Layout task status is '{status}' — must be 'approved' before animating.",
                details="Get the layout task approved by a lead before starting animation.",
            )
        except Exception as exc:
            return self.warning(
                f"Could not check layout status: {exc}",
                details="Verify FORGE_URL, FORGE_EMAIL, FORGE_PASSWORD are correct.",
            )
