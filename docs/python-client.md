# Python Client

SLM Mesh includes a zero-dependency Python client that wraps the broker HTTP API.

## Installation

```bash
pip install slm-mesh
```

## Quick Start

```python
from slm_mesh import SLMMeshClient

client = SLMMeshClient()

# Register as a peer
result = client.register(pid=12345, project_path="/my/project")
my_id = result["peerId"]

# List other peers
peers = client.peers()
for peer in peers:
    print(f"{peer.name} ({peer.agent_type}) — {peer.summary}")

# Send a message
client.send(my_id, peers[0].id, "Auth module refactored")

# Read messages
messages = client.inbox(my_id)
for msg in messages:
    print(f"From {msg.from_peer}: {msg.payload}")

# Shared state
client.state_set("db_version", "42", my_id)
value = client.state_get("db_version")

# File locking
client.lock("/src/auth.ts", my_id, reason="refactoring")
locks = client.locks()
client.unlock("/src/auth.ts", my_id)

# Unregister when done
client.unregister(my_id)
```

## API

### SLMMeshClient(host, port, token_path)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `host` | str | `"127.0.0.1"` | Broker host |
| `port` | int | `7899` | Broker port |
| `token_path` | str | `~/.slm-mesh/broker.token` | Path to auth token |

### Methods

| Method | Description |
|--------|-------------|
| `health()` | Check broker health |
| `status()` | Get broker stats (returns `BrokerStatus`) |
| `register(pid, project_path, ...)` | Register as a peer |
| `unregister(peer_id)` | Deregister |
| `heartbeat(peer_id)` | Send heartbeat |
| `set_summary(peer_id, summary)` | Update your summary |
| `peers(scope)` | List peers (returns `list[Peer]`) |
| `send(from_id, to_id, payload)` | Send direct message |
| `broadcast(from_id, payload)` | Broadcast to all |
| `inbox(peer_id, msg_filter, limit)` | Read messages (returns `list[Message]`) |
| `state_get(key, namespace)` | Get shared state |
| `state_set(key, value, peer_id)` | Set shared state |
| `state_list(namespace)` | List all state entries |
| `state_delete(key, namespace)` | Delete state entry |
| `lock(file_path, peer_id, reason, ttl)` | Lock a file |
| `unlock(file_path, peer_id)` | Unlock a file |
| `locks()` | List all locks |
| `events(types, since, limit)` | Read events |

### Data Types

All response objects are frozen dataclasses:

- `Peer` — id, name, pid, projectPath, agentType, summary, startedAt, status
- `Message` — id, fromPeer, toPeer, type, payload, createdAt, readAt, delivered
- `StateEntry` — key, namespace, value, updatedBy, updatedAt
- `Lock` — filePath, lockedBy, lockedAt, expiresAt, reason
- `MeshEvent` — id, type, payload, emittedBy, createdAt
- `BrokerStatus` — status, version, uptime, pid, port, peers, messages, locks, events

## Requirements

- Python 3.10+
- Zero external dependencies (stdlib only)
- The Node.js broker must be running (auto-started by any MCP connection or `slm-mesh start`)
