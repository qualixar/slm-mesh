"""Immutable dataclasses for SLM Mesh API responses.

All types are frozen -- no mutation after creation.
Field names match the broker's JSON response format (camelCase).
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json


@dataclass(frozen=True)
class Peer:
    """A registered peer (AI agent) on the mesh."""

    id: str
    name: str
    pid: int = 0
    project_path: str = ""
    git_root: str | None = None
    git_branch: str | None = None
    agent_type: str = "unknown"
    summary: str = ""
    uds_path: str | None = None
    started_at: str = ""
    last_heartbeat: str = ""
    status: str = "active"

    @staticmethod
    def from_dict(data: dict) -> Peer:
        return Peer(
            id=data.get("id", ""),
            name=data.get("name", ""),
            pid=data.get("pid", 0),
            project_path=data.get("projectPath", data.get("project_path", "")),
            git_root=data.get("gitRoot", data.get("git_root")),
            git_branch=data.get("gitBranch", data.get("git_branch")),
            agent_type=data.get("agentType", data.get("agent_type", "unknown")),
            summary=data.get("summary", ""),
            uds_path=data.get("udsPath", data.get("uds_path")),
            started_at=data.get("startedAt", data.get("started_at", "")),
            last_heartbeat=data.get("lastHeartbeat", data.get("last_heartbeat", "")),
            status=data.get("status", "active"),
        )


@dataclass(frozen=True)
class Message:
    """A message sent between peers."""

    id: str
    from_peer: str
    to_peer: str | None
    msg_type: str = "text"
    payload: str = ""
    created_at: str = ""
    read_at: str | None = None
    delivered: bool = False

    @staticmethod
    def from_dict(data: dict) -> Message:
        return Message(
            id=data.get("id", ""),
            from_peer=data.get("fromPeer", data.get("from_peer", "")),
            to_peer=data.get("toPeer", data.get("to_peer")),
            msg_type=data.get("type", data.get("msg_type", "text")),
            payload=data.get("payload", ""),
            created_at=data.get("createdAt", data.get("created_at", "")),
            read_at=data.get("readAt", data.get("read_at")),
            delivered=data.get("delivered", False),
        )


@dataclass(frozen=True)
class StateEntry:
    """A key-value entry in shared mesh state."""

    key: str
    value: str
    namespace: str = "default"
    updated_by: str = ""
    updated_at: str = ""

    @staticmethod
    def from_dict(data: dict) -> StateEntry:
        return StateEntry(
            key=data.get("key", ""),
            value=data.get("value", ""),
            namespace=data.get("namespace", "default"),
            updated_by=data.get("updatedBy", data.get("updated_by", "")),
            updated_at=data.get("updatedAt", data.get("updated_at", "")),
        )


@dataclass(frozen=True)
class Lock:
    """A file lock held by a peer."""

    file_path: str
    locked_by: str
    locked_at: str = ""
    expires_at: str = ""
    reason: str = ""

    @staticmethod
    def from_dict(data: dict) -> Lock:
        return Lock(
            file_path=data.get("filePath", data.get("file_path", "")),
            locked_by=data.get("lockedBy", data.get("locked_by", "")),
            locked_at=data.get("lockedAt", data.get("locked_at", "")),
            expires_at=data.get("expiresAt", data.get("expires_at", "")),
            reason=data.get("reason", ""),
        )


@dataclass(frozen=True)
class MeshEvent:
    """An event from the mesh event stream."""

    id: str
    event_type: str
    payload: str = "{}"
    emitted_by: str = ""
    created_at: str = ""

    @staticmethod
    def from_dict(data: dict) -> MeshEvent:
        raw_payload = data.get("payload", "{}")
        payload_str = json.dumps(raw_payload) if isinstance(raw_payload, dict) else str(raw_payload)
        return MeshEvent(
            id=data.get("id", ""),
            event_type=data.get("type", data.get("event_type", "")),
            payload=payload_str,
            emitted_by=data.get("emittedBy", data.get("emitted_by", "")),
            created_at=data.get("createdAt", data.get("created_at", "")),
        )


@dataclass(frozen=True)
class PeerStats:
    """Peer count breakdown."""
    active: int = 0
    stale: int = 0
    total: int = 0

@dataclass(frozen=True)
class MessageStats:
    """Message count breakdown."""
    total: int = 0
    undelivered: int = 0

@dataclass(frozen=True)
class BrokerStatus:
    """Full status of the SLM Mesh broker."""

    status: str = ""
    version: str = ""
    uptime: int = 0
    pid: int = 0
    port: int = 0
    peers: PeerStats = field(default_factory=PeerStats)
    messages: MessageStats = field(default_factory=MessageStats)
    locks_active: int = 0
    events_total: int = 0

    @staticmethod
    def from_dict(data: dict) -> BrokerStatus:
        peers_data = data.get("peers", {})
        msgs_data = data.get("messages", {})
        locks_data = data.get("locks", {})
        events_data = data.get("events", {})
        return BrokerStatus(
            status=data.get("status", ""),
            version=data.get("version", ""),
            uptime=data.get("uptime", 0),
            pid=data.get("pid", 0),
            port=data.get("port", 0),
            peers=PeerStats(
                active=peers_data.get("active", 0) if isinstance(peers_data, dict) else 0,
                stale=peers_data.get("stale", 0) if isinstance(peers_data, dict) else 0,
                total=peers_data.get("total", 0) if isinstance(peers_data, dict) else 0,
            ),
            messages=MessageStats(
                total=msgs_data.get("total", 0) if isinstance(msgs_data, dict) else 0,
                undelivered=msgs_data.get("undelivered", 0) if isinstance(msgs_data, dict) else 0,
            ),
            locks_active=locks_data.get("active", 0) if isinstance(locks_data, dict) else 0,
            events_total=events_data.get("total", 0) if isinstance(events_data, dict) else 0,
        )
