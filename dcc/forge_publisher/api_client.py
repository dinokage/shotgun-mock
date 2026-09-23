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
        Maps to: GET /api/dcc/shots
        """
        params: Dict[str, str] = {}
        if episode_no:
            params["episode"] = episode_no
        if seq_no:
            params["seq"] = seq_no
        if shot_no:
            params["shot"] = shot_no
        return self._get("dcc/shots", params=params)

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
        Maps to: POST /api/versions
        """
        payload = {
            "entityId": shot_id,
            "entityType": "shot",
            "versionNumber": version_label,
            "mediaUrl": media_url,
            "notes": notes,
            # Extra DCC metadata stored in notes until a proper field exists
        }
        return self._post("versions", payload)

    def update_shot_status(self, shot_id: str, status: str) -> Dict:
        """
        Update a shot's internalReviewStatus.
        Maps to: PUT /api/shots/:id  (partial update)
        """
        return self._put(f"shots/{shot_id}", {"internalReviewStatus": status})

    def run_remote_sanity(self, shot_id: str, publish_type: str) -> Dict:
        """
        Request the server to run / store a sanity check result set.
        Maps to: POST /api/sanity/check
        """
        return self._post(
            "sanity/check", {"shotId": shot_id, "publishType": publish_type}
        )

    def get_sanity_results(
        self, shot_id: Optional[str] = None, limit: int = 50
    ) -> List[Dict]:
        """
        Retrieve recent sanity check results.
        Maps to: GET /api/sanity/results
        """
        params: Dict[str, Any] = {"limit": limit}
        if shot_id:
            params["shotId"] = shot_id
        return self._get("sanity/results", params=params)

    def dcc_publish(self, payload: Dict) -> Dict:
        """
        Full DCC publish: create version + update shot status atomically.
        Maps to: POST /api/dcc/publish
        """
        return self._post("dcc/publish", payload)

    # ------------------------------------------------------------------
    # Convenience context manager support
    # ------------------------------------------------------------------

    def __enter__(self):
        self.login()
        return self

    def __exit__(self, *_):
        pass
