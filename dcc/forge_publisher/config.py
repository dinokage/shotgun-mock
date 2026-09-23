"""
config.py — Reads Forge connection settings from environment variables or a
local prefs JSON file (~/.forge/prefs.json).

Priority order (highest first):
  1. Environment variables  (FORGE_URL, FORGE_EMAIL, FORGE_PASSWORD)
  2. ~/.forge/prefs.json
  3. Hard-coded defaults (localhost dev server)
"""

import os
import json
from pathlib import Path

_PREFS_PATH = Path.home() / ".forge" / "prefs.json"


def _load_prefs() -> dict:
    """Load preferences from the JSON prefs file if it exists."""
    if _PREFS_PATH.exists():
        try:
            with open(_PREFS_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _prefs() -> dict:
    """Cached prefs — loaded once per process."""
    if not hasattr(_prefs, "_cache"):
        _prefs._cache = _load_prefs()
    return _prefs._cache


def get_forge_url() -> str:
    return os.environ.get("FORGE_URL") or _prefs().get("url", "http://localhost:4000")


def get_forge_email() -> str:
    return os.environ.get("FORGE_EMAIL") or _prefs().get("email", "")


def get_forge_password() -> str:
    return os.environ.get("FORGE_PASSWORD") or _prefs().get("password", "")


def get_forge_api_token() -> str:
    """Optional pre-issued API token — skips email/password login when set."""
    return os.environ.get("FORGE_API_TOKEN") or _prefs().get("api_token", "")


def save_prefs(url: str, email: str, password: str, api_token: str = "") -> None:
    """Persist connection settings to ~/.forge/prefs.json."""
    _PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {"url": url, "email": email, "password": password}
    if api_token:
        data["api_token"] = api_token
    with open(_PREFS_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    # Invalidate cached prefs
    if hasattr(_prefs, "_cache"):
        del _prefs._cache


def get_shot_config_path() -> str:
    """
    Path to a per-shot JSON config file injected by the render farm / launcher.
    Expected keys: episodeNo, seqNo, shotNo, frameStart, frameEnd, fps.
    """
    return os.environ.get("FORGE_SHOT_CONFIG", "")
