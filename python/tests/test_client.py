"""Tests for SLM Mesh Python client.

Uses only stdlib unittest with mocks — no pytest, no real broker needed.
"""

from __future__ import annotations

import io
import json
import unittest
from http.client import HTTPResponse
from unittest.mock import MagicMock, patch

from slm_mesh.client import SLMMeshClient, SLMMeshError
from slm_mesh.types import (
    BrokerStatus,
    Lock,
    MeshEvent,
    Message,
    Peer,
    StateEntry,
)


def _mock_response(data: dict, status: int = 200) -> MagicMock:
    """Create a mock urllib response that behaves as a context manager."""
    body = json.dumps(data).encode("utf-8")
    mock = MagicMock()
    mock.read.return_value = body
    mock.status = status
    mock.__enter__ = lambda s: s
    mock.__exit__ = MagicMock(return_value=False)
    return mock


class TestClientInit(unittest.TestCase):
    """Test client initialization."""

    def test_default_host_and_port(self) -> None:
        client = SLMMeshClient()
        self.assertEqual(client.host, "127.0.0.1")
        self.assertEqual(client.port, 7899)
        self.assertEqual(client._base_url, "http://127.0.0.1:7899")

    def test_custom_host_and_port(self) -> None:
        client = SLMMeshClient(host="10.0.0.5", port=8080, timeout=10)
        self.assertEqual(client.host, "10.0.0.5")
        self.assertEqual(client.port, 8080)
        self.assertEqual(client.timeout, 10)
        self.assertEqual(client._base_url, "http://10.0.0.5:8080")


class TestRequestBuilder(unittest.TestCase):
    """Test that _request builds correct URLs and payloads."""

    def setUp(self) -> None:
        self.client = SLMMeshClient()

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_get_request_builds_correct_url(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"status": "ok"})

        self.client._request("GET", "/health")

        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        self.assertEqual(req.full_url, "http://127.0.0.1:7899/health")
        self.assertEqual(req.method, "GET")
        self.assertIsNone(req.data)

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_post_request_sends_json_body(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"ok": True})

        self.client._request("POST", "/send", {"from": "a", "to": "b", "payload": "hi"})

        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        self.assertEqual(req.method, "POST")
        sent_body = json.loads(req.data.decode("utf-8"))
        self.assertEqual(sent_body["from"], "a")
        self.assertEqual(sent_body["to"], "b")
        self.assertEqual(sent_body["payload"], "hi")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_request_sets_content_type(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({})

        self.client._request("GET", "/health")

        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        self.assertEqual(req.get_header("Content-type"), "application/json")


class TestHealth(unittest.TestCase):
    """Test health endpoint."""

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_health_returns_dict(self, mock_urlopen: MagicMock) -> None:
        expected = {"status": "ok", "version": "1.0.0", "uptime": 123.4}
        mock_urlopen.return_value = _mock_response(expected)

        client = SLMMeshClient()
        result = client.health()

        self.assertEqual(result, expected)


class TestStatus(unittest.TestCase):
    """Test status endpoint."""

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_status_returns_broker_status(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "status": "running",
            "version": "1.0.0",
            "uptime": 500,
            "pid": 12345,
            "port": 7899,
            "peers": {"active": 3, "stale": 0, "total": 3},
            "messages": {"total": 42, "undelivered": 2},
            "locks": {"active": 1},
            "events": {"total": 100},
        }
        mock_urlopen.return_value = _mock_response(raw)

        client = SLMMeshClient()
        result = client.status()

        self.assertIsInstance(result, BrokerStatus)
        self.assertEqual(result.status, "running")
        self.assertEqual(result.peers.active, 3)
        self.assertEqual(result.messages.total, 42)
        self.assertEqual(result.pid, 12345)


class TestPeers(unittest.TestCase):
    """Test peers endpoint."""

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_peers_returns_list(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "peers": [
                {"id": "p1", "name": "agent-a", "role": "coder", "status": "active"},
                {"id": "p2", "name": "agent-b", "role": "reviewer", "status": "active"},
            ],
        }
        mock_urlopen.return_value = _mock_response(raw)

        client = SLMMeshClient()
        result = client.peers()

        self.assertEqual(len(result), 2)
        self.assertIsInstance(result[0], Peer)
        self.assertEqual(result[0].id, "p1")
        self.assertEqual(result[1].name, "agent-b")


class TestMessaging(unittest.TestCase):
    """Test send, broadcast, and inbox endpoints."""

    def setUp(self) -> None:
        self.client = SLMMeshClient()

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_send_returns_message_id(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"ok": True, "messageId": "msg-123"})

        msg_id = self.client.send(from_peer="a", to_peer="b", payload="hello")

        self.assertEqual(msg_id, "msg-123")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_broadcast_returns_message_ids(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response(
            {"ok": True, "messageIds": ["msg-1", "msg-2"]}
        )

        ids = self.client.broadcast(from_peer="a", payload="announce")

        self.assertEqual(ids, ["msg-1", "msg-2"])

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_inbox_returns_messages(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "messages": [
                {
                    "id": "m1",
                    "fromPeer": "agent-a",
                    "toPeer": "agent-b",
                    "payload": "hi",
                    "type": "text",
                    "createdAt": "2026-04-07T10:00:00Z",
                    "readAt": None,
                    "delivered": 1,
                },
            ],
        }
        mock_urlopen.return_value = _mock_response(raw)

        messages = self.client.inbox(peer_id="agent-b")

        self.assertEqual(len(messages), 1)
        self.assertIsInstance(messages[0], Message)
        self.assertEqual(messages[0].from_peer, "agent-a")
        self.assertEqual(messages[0].payload, "hi")


class TestSharedState(unittest.TestCase):
    """Test state get/set/list/delete endpoints."""

    def setUp(self) -> None:
        self.client = SLMMeshClient()

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_state_get_returns_entry(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "entry": {
                "key": "file",
                "value": "main.py",
                "namespace": "default",
                "peerId": "a",
                "updatedAt": "2026-04-07T10:00:00Z",
            },
        }
        mock_urlopen.return_value = _mock_response(raw)

        entry = self.client.state_get(key="file")

        self.assertIsNotNone(entry)
        self.assertIsInstance(entry, StateEntry)
        self.assertEqual(entry.key, "file")
        self.assertEqual(entry.value, "main.py")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_state_get_returns_none_when_missing(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"ok": True, "entry": None})

        entry = self.client.state_get(key="nonexistent")

        self.assertIsNone(entry)

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_state_set_returns_entry(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "entry": {"key": "k", "value": "v", "namespace": "default", "peerId": "a"},
        }
        mock_urlopen.return_value = _mock_response(raw)

        entry = self.client.state_set(key="k", value="v", peer_id="a")

        self.assertIsInstance(entry, StateEntry)
        self.assertEqual(entry.value, "v")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_state_list_returns_entries(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "entries": [
                {"key": "a", "value": "1", "namespace": "default"},
                {"key": "b", "value": "2", "namespace": "default"},
            ],
        }
        mock_urlopen.return_value = _mock_response(raw)

        entries = self.client.state_list()

        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0].key, "a")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_state_delete_succeeds(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"ok": True})

        # Should not raise
        self.client.state_delete(key="k")


class TestLocking(unittest.TestCase):
    """Test lock/unlock/locks endpoints."""

    def setUp(self) -> None:
        self.client = SLMMeshClient()

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_lock_returns_lock_object(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "lock": {
                "filePath": "src/app.ts",
                "peerId": "a",
                "reason": "editing",
                "acquiredAt": "2026-04-07T10:00:00Z",
                "expiresAt": "2026-04-07T10:10:00Z",
            },
        }
        mock_urlopen.return_value = _mock_response(raw)

        lock = self.client.lock(file_path="src/app.ts", peer_id="a", reason="editing")

        self.assertIsInstance(lock, Lock)
        self.assertEqual(lock.file_path, "src/app.ts")
        self.assertEqual(lock.reason, "editing")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_unlock_succeeds(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response({"ok": True})

        self.client.unlock(file_path="src/app.ts", peer_id="a")

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_locks_returns_list(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "locks": [
                {"filePath": "a.ts", "peerId": "p1"},
                {"filePath": "b.ts", "peerId": "p2"},
            ],
        }
        mock_urlopen.return_value = _mock_response(raw)

        result = self.client.locks()

        self.assertEqual(len(result), 2)
        self.assertIsInstance(result[0], Lock)


class TestEvents(unittest.TestCase):
    """Test events endpoint."""

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_events_returns_list(self, mock_urlopen: MagicMock) -> None:
        raw = {
            "ok": True,
            "events": [
                {
                    "id": "e1",
                    "type": "message",
                    "payload": '{"messageId": "m1"}',
                    "emittedBy": "a",
                    "createdAt": "2026-04-07T10:00:00Z",
                },
            ],
        }
        mock_urlopen.return_value = _mock_response(raw)

        client = SLMMeshClient()
        events = client.events(types=["message"], limit=10)

        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], MeshEvent)
        self.assertEqual(events[0].event_type, "message")
        self.assertIn("messageId", events[0].payload)


class TestErrorHandling(unittest.TestCase):
    """Test error scenarios."""

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_connection_error_raises_slm_mesh_error(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        client = SLMMeshClient()

        with self.assertRaises(SLMMeshError) as ctx:
            client.health()
        self.assertIn("Cannot connect", str(ctx.exception))

    @patch("slm_mesh.client.urllib.request.urlopen")
    def test_http_error_raises_slm_mesh_error(self, mock_urlopen: MagicMock) -> None:
        error_body = json.dumps({"error": "not found"}).encode()
        http_error = urllib.error.HTTPError(
            url="http://127.0.0.1:7899/health",
            code=404,
            msg="Not Found",
            hdrs={},  # type: ignore[arg-type]
            fp=io.BytesIO(error_body),
        )
        mock_urlopen.side_effect = http_error

        client = SLMMeshClient()

        with self.assertRaises(SLMMeshError) as ctx:
            client.health()
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("not found", str(ctx.exception))


class TestDataclasses(unittest.TestCase):
    """Test that dataclasses are frozen (immutable)."""

    def test_peer_is_frozen(self) -> None:
        peer = Peer(id="p1", name="agent")
        with self.assertRaises(AttributeError):
            peer.name = "changed"  # type: ignore[misc]

    def test_message_is_frozen(self) -> None:
        msg = Message(id="m1", from_peer="a", to_peer="b", payload="hi")
        with self.assertRaises(AttributeError):
            msg.payload = "changed"  # type: ignore[misc]

    def test_lock_is_frozen(self) -> None:
        lock = Lock(file_path="f.ts", locked_by="p1")
        with self.assertRaises(AttributeError):
            lock.locked_by = "changed"  # type: ignore[misc]

    def test_broker_status_from_dict(self) -> None:
        raw = {"status": "ok", "version": "1.0.0", "uptime": 10, "peers": {"active": 5, "stale": 0, "total": 5}}
        bs = BrokerStatus.from_dict(raw)
        self.assertEqual(bs.peers.active, 5)
        self.assertEqual(bs.version, "1.0.0")


# Required for: python -m unittest discover
import urllib.error

if __name__ == "__main__":
    unittest.main()
