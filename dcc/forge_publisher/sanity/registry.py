"""
registry.py — Maps publish types to their ordered list of sanity check classes.

Usage:
    from forge_publisher.sanity.registry import PUBLISH_TYPE_CHECKS
    checks = [cls() for cls in PUBLISH_TYPE_CHECKS["07_layout"]]
"""

from .maya_checks import (
    # Layout checks
    SceneCollectionStructureCheck,
    UnwantedReferenceCheck,
    InvalidReferenceFileCheck,
    FrameRangeCheck,
    CheckRigPathCheck,
    AudioNamingConventionsCheck,
    CurrentTimeUnitCheck,
    CheckMeshKeysCheck,
    CameraNamespaceCheck,
    AnimaticsExistsCheck,
    WhitespaceInFileNameCheck,
    AnimaticsPathExistsCheck,
    ReferenceFromCorrectDriveCheck,
    NamespaceExistsCheck,
    MultipleHideLayerCheck,
    ImportedReferenceCheck,
    CheckRefFilepathCheck,
    CamViewUnwantedReferencesCheck,
    DoubleNamespaceCheck,
    CheckRenderLayersCheck,
    CacheSetDoesNotExistCheck,
    CheckPropPathCheck,
    CheckSetPathCheck,
    # Animation-only checks
    CheckImportedTransformsCheck,
    CheckTransformNodeKeysCheck,
    CheckLayoutStatusCheck,
)

# ---------------------------------------------------------------------------
# Layout publish (07_layout) — full check list
# ---------------------------------------------------------------------------
LAYOUT_CHECKS = [
    SceneCollectionStructureCheck,
    UnwantedReferenceCheck,
    InvalidReferenceFileCheck,
    FrameRangeCheck,
    CheckRigPathCheck,
    AudioNamingConventionsCheck,
    CurrentTimeUnitCheck,
    CheckMeshKeysCheck,
    CameraNamespaceCheck,
    AnimaticsExistsCheck,
    WhitespaceInFileNameCheck,
    AnimaticsPathExistsCheck,
    ReferenceFromCorrectDriveCheck,
    NamespaceExistsCheck,
    MultipleHideLayerCheck,
    ImportedReferenceCheck,
    CheckRefFilepathCheck,
    CamViewUnwantedReferencesCheck,
    DoubleNamespaceCheck,
    CheckRenderLayersCheck,
    CacheSetDoesNotExistCheck,
    CheckPropPathCheck,
    CheckSetPathCheck,
]

# ---------------------------------------------------------------------------
# Animation publish (08_animation) — layout checks + animation-specific
# ---------------------------------------------------------------------------
ANIMATION_CHECKS = [
    # Shared with layout
    CameraNamespaceCheck,
    UnwantedReferenceCheck,
    InvalidReferenceFileCheck,
    FrameRangeCheck,
    CurrentTimeUnitCheck,
    WhitespaceInFileNameCheck,
    ReferenceFromCorrectDriveCheck,
    NamespaceExistsCheck,
    DoubleNamespaceCheck,
    CheckRenderLayersCheck,
    CheckRefFilepathCheck,
    MultipleHideLayerCheck,
    # Animation-specific
    CheckImportedTransformsCheck,
    CheckTransformNodeKeysCheck,
    CheckLayoutStatusCheck,
]

# ---------------------------------------------------------------------------
# Master registry — add new publish types here
# ---------------------------------------------------------------------------
PUBLISH_TYPE_CHECKS: dict = {
    "07_layout": LAYOUT_CHECKS,
    "08_animation": ANIMATION_CHECKS,
}

# Blender registry (loaded lazily to avoid bpy import errors in Maya)
def get_blender_checks(publish_type: str) -> list:
    """Return Blender check classes for the given publish type."""
    from .blender_checks import (
        BlenderSceneCollectionStructureCheck,
        BlenderUnwantedObjectsCheck,
        BlenderMissingLinkedLibraryCheck,
        BlenderFrameRangeCheck,
        BlenderFPSCheck,
        BlenderWhitespaceInFileNameCheck,
        BlenderRenderCameraCheck,
        BlenderDoubleCollectionCheck,
        BlenderUnusedMaterialsCheck,
        BlenderCacheSetCheck,
        BlenderNameConventionCheck,
    )

    BLENDER_LAYOUT = [
        BlenderSceneCollectionStructureCheck,
        BlenderUnwantedObjectsCheck,
        BlenderMissingLinkedLibraryCheck,
        BlenderFrameRangeCheck,
        BlenderFPSCheck,
        BlenderWhitespaceInFileNameCheck,
        BlenderRenderCameraCheck,
        BlenderDoubleCollectionCheck,
        BlenderCacheSetCheck,
        BlenderNameConventionCheck,
    ]

    BLENDER_ANIMATION = [
        BlenderUnwantedObjectsCheck,
        BlenderFrameRangeCheck,
        BlenderFPSCheck,
        BlenderWhitespaceInFileNameCheck,
        BlenderRenderCameraCheck,
        BlenderDoubleCollectionCheck,
        BlenderUnusedMaterialsCheck,
    ]

    blender_registry = {
        "07_layout": BLENDER_LAYOUT,
        "08_animation": BLENDER_ANIMATION,
    }

    return blender_registry.get(publish_type, BLENDER_LAYOUT)


def get_check_classes(publish_type: str, dcc: str = "maya") -> list:
    """
    Convenience function — returns the check class list for a given
    publish type and DCC application.

    Args:
        publish_type: e.g. "07_layout", "08_animation"
        dcc: "maya" | "blender"
    """
    if dcc == "blender":
        return get_blender_checks(publish_type)
    return PUBLISH_TYPE_CHECKS.get(publish_type, LAYOUT_CHECKS)
