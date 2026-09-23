"""
api_client.py — ForgeAPIClient wraps all REST calls to the Forge production
tracking portal.

Usage:
    from forge_publisher.api_client import ForgeAPIClient
    from forge_publisher.config import get_forge_url, get_forge_email, get_forge_password

    client = ForgeAPIClient(get_forge_url(), get_forge_email(), get_forge_password())
    client.login()
    shots = client.get_shots("EP01", "SQ010", "SH010")
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional

try:
    import requests
    from requests import Session, Response
except ImportError:
    raise ImportError(
        "The 'requests' library is required. Install it with: pip install requests"
    )

log = logging.getLogger(__name__)


class ForgeAPIError(Exception):
    """Raised when the Forge API returns an error response."""

    def __init__(self, status_code: int, message: str):
        super().__init__(f"Forge API error {status_code}: {message}")
        self.status_code = status_code
        self.message = message


class ForgeAPIClient:
    """
    Thin HTTP client for the Forge production tracking portal.

    Authentication supports two modes:
      1. Email + password login (session cookie via POST /api/auth/login)
      2. Pre-issued API token (Authorization: Bearer <token>)

    The token takes priority when provided.
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        api_token: str = "",
        timeout: int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.api_token = api_token
        self.timeout = timeout
        self.session: Session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self._logged_in = False

        if self.api_token:
            self.session.headers["Authorization"] = f"Bearer {self.api_token}"
            self._logged_in = True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _url(self, path: str) -> str:
        return f"{self.base_url}/api/{path.lstrip('/')}"

    def _handle(self, resp: Response) -> Any:
        if not resp.ok:
            try:
                body = resp.json()
                msg = body.get("error") or body.get("message") or resp.text
            except Exception:
                msg = resp.text
            raise ForgeAPIError(resp.status_code, msg)
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        resp = self.session.get(self._url(path), params=params, timeout=self.timeout)
        return self._handle(resp)

    def _post(self, path: str, payload: dict) -> Any:
        resp = self.session.post(
            self._url(path), data=json.dumps(payload), timeout=self.timeout
        )
        return self._handle(resp)

    def _put(self, path: str, payload: dict) -> Any:
        resp = self.session.put(
            self._url(path), data=json.dumps(payload), timeout=self.timeout
        )
        return self._handle(resp)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def login(self) -> bool:
        """
        Authenticate with email + password.
        Returns True on success, False on failure.
        Skipped when an api_token was already provided.
        """
        if self._logged_in:
            return True
        try:
            self._post("auth/login", {"email": self.email, "password": self.password})
            self._logged_in = True
            log.info("Forge login successful for %s", self.email)
            return True
        except ForgeAPIError as exc:
            log.error("Forge login failed: %s", exc)
            return False

    def get_shots(
        self,
        episode_no: str = "",
        seq_no: str = "",
        shot_no: str = "",
    ) -> List[Dict]:
        """
        Search shots by episode / sequence / shot number fragments.
        Maps to: GET /api/shots (episode/seq/shot are optional filters on
        the same endpoint the web app uses, not a separate DCC-only route --
        there was never a /api/dcc namespace on the server).
        """
        params: Dict[str, str] = {}
        if episode_no:
            params["episode"] = episode_no
        if seq_no:
            params["seq"] = seq_no
        if shot_no:
            params["shot"] = shot_no
        return self._get("shots", params=params)

    def create_version(
        self,
        shot_id: str,
        publish_type: str,
        media_url: str,
        sanity_results: List[Dict],
        version_label: str = "v001",
        notes: str = "",
    ) -> Dict:
        """
        Create a Version record for a shot.
        Maps to: POST /api/versions, then PUT /api/versions/:id for notes --
        confirmed live against the real server that POST silently ignores a
        `notes` field in its body (only entityId/entityType/versionNumber/
        mediaUrl/taskId are read on create; notes is only ever set through
        the PATCHABLE_FIELDS on PUT /:id). Passing notes to POST looked like
        it worked -- no error -- but every publish note was actually being
        thrown away.
        """
        payload = {
            "entityId": shot_id,
            "entityType": "shot",
            "versionNumber": version_label,
            "mediaUrl": media_url,
        }
        created = self._post("versions", payload)
        if notes:
            created = self._put(f"versions/{created['id']}", {"notes": notes})
        return created

    def update_shot_status(self, shot_id: str, status: str) -> Dict:
        """
        Update a shot's internalReviewStatus.
        Maps to: PUT /api/shots/:id  (partial update)
        """
        return self._put(f"shots/{shot_id}", {"internalReviewStatus": status})

    @staticmethod
    def _to_validation_log(sanity_results: List[Dict]) -> List[Dict]:
        """
        Convert this package's CheckResult.to_dict() shape
        ({name, description, status, message, details}) into the shape
        PublishLog.validation_log actually validates server-side
        ({name, passed: bool, detail?}) -- see
        artifacts/api-server/src/routes/publishing.ts's
        validateValidationLog().
        """
        return [
            {
                "name": c.get("name", ""),
                "passed": c.get("status") == "passed",
                "detail": c.get("message", "") or "",
            }
            for c in sanity_results
        ]

    def run_remote_sanity(
        self, shot_id: str, publish_type: str, sanity_results: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Log a sanity-check result set against a shot, independent of an
        actual publish (e.g. an artist running checks before they're ready
        to publish). There is no /api/sanity namespace on the server --
        publish_logs.validation_log is the one place check results are
        persisted, so this writes a PublishLog row with no version attached.
        Maps to: POST /api/publish-logs
        """
        return self._post(
            "publish-logs",
            {
                "publishKind": "shot",
                "entityType": "shot",
                "entityId": shot_id,
                "status": "validating",
                "validationLog": self._to_validation_log(sanity_results or []),
            },
        )

    def get_sanity_results(
        self, shot_id: Optional[str] = None, limit: int = 50
    ) -> List[Dict]:
        """
        Retrieve recent publish-log entries (each carries its own
        validationLog) for a shot.
        Maps to: GET /api/publish-logs
        """
        params: Dict[str, Any] = {"limit": limit, "entityType": "shot"}
        if shot_id:
            params["entityId"] = shot_id
        return self._get("publish-logs", params=params)

    def dcc_publish(self, payload: Dict) -> Dict:
        """
        Full DCC publish: create a Version, update the shot's review status,
        then log the sanity-check results that gated it. There is no atomic
        composite endpoint on the server for this (no /api/dcc namespace
        exists) -- these are three real, already-working calls composed
        here instead of one fabricated POST /api/dcc/publish.

        Expects the payload shape publish.py's publish_shot() builds:
        shotId, publishType, filePath, versionLabel, sanityResults, notes.
        `shotId` must already be a resolved Forge shot id (publish_shot()
        resolves it via get_shots() before calling this).
        """
        shot_id = payload["shotId"]
        version = self.create_version(
            shot_id=shot_id,
            publish_type=payload.get("publishType", ""),
            media_url=payload.get("filePath", ""),
            sanity_results=payload.get("sanityResults", []),
            version_label=payload.get("versionLabel", "v001"),
            notes=payload.get("notes", ""),
        )
        self.update_shot_status(shot_id, "pending")
        log_entry = self._post(
            "publish-logs",
            {
                "publishKind": "shot",
                "entityType": "shot",
                "entityId": shot_id,
                "versionId": version.get("id"),
                "status": "success",
                "notes": payload.get("notes", ""),
                "validationLog": self._to_validation_log(payload.get("sanityResults", [])),
            },
        )
        return {"version": version, "publishLog": log_entry}

    # ------------------------------------------------------------------
    # Convenience context manager support
    # ------------------------------------------------------------------

    def __enter__(self):
        self.login()
        return self

    def __exit__(self, *_):
        pass
