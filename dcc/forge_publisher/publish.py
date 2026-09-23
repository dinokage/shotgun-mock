"""
publish.py — Orchestrates sanity checks and the DCC publish flow.

Public API:
    run_sanity_checks(publish_type, dcc="maya") -> List[(SanityCheck, CheckResult)]
    publish_shot(episode_no, seq_no, shot_no, publish_type, cache, file_path, version_label) -> dict
"""

import os
import logging
from typing import Callable, Dict, List, Optional, Tuple

from .sanity.base_check import SanityCheck, CheckResult, CheckStatus
from .sanity.registry import get_check_classes
from .config import (
    get_forge_url,
    get_forge_email,
    get_forge_password,
    get_forge_api_token,
)
from .api_client import ForgeAPIClient, ForgeAPIError

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------
CheckPair = Tuple[SanityCheck, CheckResult]
ProgressCallback = Callable[[str, CheckResult], None]


# ---------------------------------------------------------------------------
# Sanity runner
# ---------------------------------------------------------------------------


def run_sanity_checks(
    publish_type: str,
    dcc: str = "maya",
    progress_cb: Optional[ProgressCallback] = None,
) -> List[CheckPair]:
    """
    Instantiate and run all checks registered for *publish_type* in *dcc*.

    Args:
        publish_type: Pipeline stage key, e.g. "07_layout" or "08_animation".
        dcc:          "maya" or "blender".
        progress_cb:  Optional callback invoked after each check with
                      (check_name, CheckResult). Used by the UI to update
                      the list widget in real time.

    Returns:
        List of (SanityCheck instance, CheckResult) pairs, in run order.
    """
    classes = get_check_classes(publish_type, dcc)
    results: List[CheckPair] = []

    for cls in classes:
        check = cls()
        log.debug("Running check: %s", check.name)
        try:
            result = check.run()
        except Exception as exc:
            result = CheckResult(
                CheckStatus.FAILED,
                f"Check raised an exception: {exc}",
                details=str(exc),
            )
        results.append((check, result))
        if progress_cb:
            try:
                progress_cb(check.name, result)
            except Exception:
                pass  # never let a UI callback crash the checks

    return results


def all_checks_passed_or_warned(results: List[CheckPair]) -> bool:
    """Return True only when every check is PASSED or WARNING (no FAILUREs)."""
    for _, result in results:
        if result.status == CheckStatus.FAILED:
            return False
    return True


# ---------------------------------------------------------------------------
# Publish orchestration
# ---------------------------------------------------------------------------


def publish_shot(
    episode_no: str,
    seq_no: str,
    shot_no: str,
    publish_type: str,
    cache: bool = False,
    file_path: str = "",
    version_label: str = "v001",
    sanity_results: Optional[List[CheckPair]] = None,
    dcc: str = "maya",
    notes: str = "",
) -> Dict:
    """
    Full publish flow:
      1. Run sanity checks (if not already supplied).
      2. Abort if any check FAILED.
      3. POST to /api/dcc/publish — creates a Version + updates shot status.

    Args:
        episode_no:     Episode identifier (e.g. "EP01").
        seq_no:         Sequence identifier (e.g. "SQ010").
        shot_no:        Shot identifier (e.g. "SH010").
        publish_type:   Pipeline stage key (e.g. "07_layout").
        cache:          Whether to also publish a geometry cache.
        file_path:      Local path of the Maya/Blender scene file being published.
        version_label:  Version string (e.g. "v003").
        sanity_results: Pre-run check results; if None, checks are run now.
        dcc:            "maya" or "blender".
        notes:          Optional publish notes.

    Returns:
        The result dict from ForgeAPIClient.dcc_publish() (a Version plus
        the PublishLog entry it created).

    Raises:
        RuntimeError:   When any check FAILs (publish blocked), or when the
                        episode/seq/shot fragments don't resolve to exactly
                        one shot.
        ForgeAPIError:  On API communication errors.
    """
    # 1. Run checks if needed
    if sanity_results is None:
        sanity_results = run_sanity_checks(publish_type, dcc)

    # 2. Gate on failures
    if not all_checks_passed_or_warned(sanity_results):
        failed_names = [
            chk.name
            for chk, res in sanity_results
            if res.status == CheckStatus.FAILED
        ]
        raise RuntimeError(
            f"Publish blocked — {len(failed_names)} check(s) failed: "
            + ", ".join(failed_names)
        )

    # 3. Build sanity payload
    sanity_payload = [
        {
            "name": chk.name,
            "description": chk.description,
            **res.to_dict(),
        }
        for chk, res in sanity_results
    ]

    # 4. Auto-detect file path if not supplied
    if not file_path:
        if dcc == "maya":
            try:
                import maya.cmds as cmds

                file_path = cmds.file(q=True, sceneName=True) or ""
            except Exception:
                pass
        elif dcc == "blender":
            try:
                import bpy

                file_path = bpy.data.filepath or ""
            except Exception:
                pass

    # 5. Authenticate and resolve the shot
    client = ForgeAPIClient(
        get_forge_url(),
        get_forge_email(),
        get_forge_password(),
        api_token=get_forge_api_token(),
    )

    if not client.login():
        raise ForgeAPIError(401, "Could not authenticate with the Forge portal.")

    # episode_no/seq_no/shot_no are the human-readable fragments an artist
    # types in the launcher UI (e.g. "EP01"/"SQ010"/"SH010") -- every real
    # API call below (create_version, update_shot_status, publish-logs)
    # needs the shot's actual id, so this has to resolve one before it can
    # do anything else. This step never existed before: the old code built
    # a payload straight from the fragments and posted it to a
    # /api/dcc/publish endpoint that was never actually implemented.
    matches = client.get_shots(episode_no, seq_no, shot_no)
    if len(matches) == 0:
        raise RuntimeError(
            f"No shot found matching {episode_no}/{seq_no}/{shot_no} -- "
            "check the episode/sequence/shot codes and try again."
        )
    if len(matches) > 1:
        raise RuntimeError(
            f"{len(matches)} shots matched {episode_no}/{seq_no}/{shot_no} -- "
            "be more specific."
        )
    shot_id = matches[0]["id"]

    payload = {
        "shotId": shot_id,
        "publishType": publish_type,
        "cache": cache,
        "filePath": file_path,
        "versionLabel": version_label,
        "sanityResults": sanity_payload,
        "notes": notes,
        "dcc": dcc,
    }

    log.info(
        "Publishing shot %s/%s/%s [%s] as %s",
        episode_no,
        seq_no,
        shot_no,
        publish_type,
        version_label,
    )
    response = client.dcc_publish(payload)
    log.info("Publish successful: %s", response)
    return response
