"""SLM Mesh Python client -- thin HTTP wrapper over the Node.js broker API.

Uses only stdlib (urllib.request, json). Zero external dependencies.
Copyright 2026 Varun Pratap Bhardwaj. MIT License.
Part of the Qualixar research initiative
"""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

from .types import BrokerStatus, Lock, MeshEvent, Message, Peer, StateEntry

# Paths exempt from bearer token authentication
_AUTH_EXEMPT_PATHS: frozenset[str] = frozenset(["/health"])


def _default_token_path() -> str:
    """Return the default broker token file path (~/.slm-mesh/broker.token)."""
    data_dir = os.environ.get("SLM_MESH_DATA_DIR", str(Path.home() / ".slm-mesh"))
    return os.path.join(data_dir, "broker.token")


def _read_token(token_path: str | None = None) -> str | None:
    """Read the bearer token from disk. Returns None if unavailable."""
    path = token_path or _default_token_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            token = f.read().strip()
        return token if token else None
    except (OSError, IOError):
        return None


class SLMMeshError(Exception):
    """Raised when the broker returns an error or is unreachable."""

    def __init__(self, message: str, status_code: int = 0, response: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response or {}


class SLMMeshClient:
    """HTTP client for the SLM Mesh broker.

    Connects to a local broker (default 127.0.0.1:7899) and wraps all
    REST endpoints as typed Python methods.

    Example::

        client = SLMMeshClient()
        print(client.health())
        peers = client.peers()
    """

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 7899,
        timeout: int = 5,
        token_path: str | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self._base_url = f"http://{host}:{port}"
        self._token_path = token_path

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict:
        """Send an HTTP request to the broker and return parsed JSON."""
        url = f"{self._base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body else None
        headers: dict[str, str] = {"Content-Type": "application/json"}

        # Add bearer token for non-exempt paths
        if path not in _AUTH_EXEMPT_PATHS:
            token = _read_token(self._token_path)
            if token:
                headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            try:
                err_data = json.loads(raw_body)
            except (json.JSONDecodeError, ValueError):
                err_data = {}
            msg = err_data.get("error", raw_body or str(exc))
            raise SLMMeshError(msg, status_code=exc.code, response=err_data) from exc
        except urllib.error.URLError as exc:
            raise SLMMeshError(f"Cannot connect to broker at {url}: {exc.reason}") from exc

    # -- Health & Status --

    def health(self) -> dict:
        """Check broker health. Returns dict with status, version, uptime."""
        return self._request("GET", "/health")

    def status(self) -> BrokerStatus:
        """Get full broker status including peer/message/lock counts."""
        data = self._request("GET", "/status")
        return BrokerStatus.from_dict(data)

    # -- Peer Management --

    def register(self, pid: int, project_path: str, agent_type: str = "unknown",
                 name: str = "auto", uds_path: str | None = None) -> dict:
        """Register a peer with the broker."""
        body: dict[str, Any] = {
            "pid": pid, "projectPath": project_path,
            "agentType": agent_type, "name": name,
        }
        if uds_path:
            body["udsPath"] = uds_path
        return self._request("POST", "/register", body)

    def unregister(self, peer_id: str) -> dict:
        """Unregister a peer from the broker."""
        return self._request("POST", "/unregister", {"peerId": peer_id})

    def heartbeat(self, peer_id: str) -> dict:
        """Send a heartbeat for a peer."""
        return self._request("POST", "/heartbeat", {"peerId": peer_id})

    def set_summary(self, peer_id: str, summary: str) -> dict:
        """Update a peer's summary."""
        return self._request("POST", "/summary", {"peerId": peer_id, "summary": summary})

    def peers(self, scope: str = "machine") -> list[Peer]:
        """List connected peers."""
        data = self._request("POST", "/peers", {"scope": scope})
        return [Peer.from_dict(p) for p in data.get("peers", [])]

    # -- Messaging (FIXED: fromPeer/toPeer, not from/to) --

    def send(self, from_peer: str, to_peer: str, payload: str, msg_type: str = "text") -> str:
        """Send a message to a specific peer. Returns message ID."""
        data = self._request("POST", "/send", {
            "fromPeer": from_peer,
            "toPeer": to_peer,
            "payload": payload,
            "type": msg_type,
        })
        return data.get("messageId", "")

    def broadcast(self, from_peer: str, payload: str, msg_type: str = "text") -> list[str]:
        """Broadcast a message to all peers. Returns list of message IDs."""
        data = self._request("POST", "/send", {
            "fromPeer": from_peer,
            "toPeer": "all",
            "payload": payload,
            "type": msg_type,
        })
        return data.get("messageIds", [])

    def inbox(self, peer_id: str, msg_filter: str = "unread", limit: int = 20) -> list[Message]:
        """Retrieve messages for a peer.

        Args:
            peer_id: The peer to check inbox for.
            msg_filter: Filter mode -- 'unread' or 'all'. Named msg_filter to
                avoid shadowing Python's builtin filter() (QA-023).
            limit: Max messages to return.
        """
        data = self._request("POST", "/messages", {
            "peerId": peer_id, "filter": msg_filter, "limit": limit,
        })
        return [Message.from_dict(m) for m in data.get("messages", [])]

    # -- Shared State --

    def state_get(self, key: str, namespace: str = "default") -> StateEntry | None:
        """Get a shared state entry by key."""
        data = self._request("POST", "/state", {
            "action": "get", "key": key, "namespace": namespace,
        })
        entry = data.get("entry")
        return StateEntry.from_dict(entry) if entry else None

    def state_set(self, key: str, value: str, peer_id: str, namespace: str = "default") -> StateEntry:
        """Set a shared state entry."""
        data = self._request("POST", "/state", {
            "action": "set", "key": key, "value": value,
            "peerId": peer_id, "namespace": namespace,
        })
        return StateEntry.from_dict(data.get("entry", {}))

    def state_list(self, namespace: str = "default") -> list[StateEntry]:
        """List all state entries in a namespace."""
        data = self._request("POST", "/state", {"action": "list", "namespace": namespace})
        return [StateEntry.from_dict(e) for e in data.get("entries", [])]

    def state_delete(self, key: str, namespace: str = "default") -> None:
        """Delete a shared state entry."""
        self._request("POST", "/state", {"action": "delete", "key": key, "namespace": namespace})

    # -- File Locking (FIXED: action=lock/unlock/query, not acquire/release/list) --

    def lock(self, file_path: str, peer_id: str, reason: str = "", ttl_minutes: int = 10) -> Lock:
        """Acquire a file lock."""
        data = self._request("POST", "/lock", {
            "action": "lock", "filePath": file_path,
            "peerId": peer_id, "reason": reason, "ttlMinutes": ttl_minutes,
        })
        return Lock.from_dict(data.get("lock", {}))

    def unlock(self, file_path: str, peer_id: str) -> None:
        """Release a file lock."""
        self._request("POST", "/lock", {
            "action": "unlock", "filePath": file_path, "peerId": peer_id,
        })

    def locks(self, file_path: str | None = None) -> list[Lock]:
        """List active locks."""
        body: dict[str, Any] = {"action": "query"}
        if file_path is not None:
            body["filePath"] = file_path
        data = self._request("POST", "/lock", body)
        return [Lock.from_dict(lk) for lk in data.get("locks", [])]

    # -- Events (FIXED: action=read) --

    def events(self, types: list[str] | None = None, since: str | None = None, limit: int = 50) -> list[MeshEvent]:
        """Query the event stream."""
        body: dict[str, Any] = {"action": "read", "limit": limit}
        if types is not None:
            body["types"] = types
        if since is not None:
            body["since"] = since
        data = self._request("POST", "/events", body)
        return [MeshEvent.from_dict(e) for e in data.get("events", [])]
