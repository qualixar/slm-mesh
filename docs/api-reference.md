# API Reference

## MCP Tools

These 8 tools are available to AI agents when SLM Mesh is connected as an MCP server.

### mesh_peers

Discover other AI agent sessions on this machine.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `"machine" \| "directory" \| "repo"` | Yes | Discovery scope |

**Returns:** Array of peer objects with id, name, agentType, projectPath, gitRoot, gitBranch, summary, startedAt, status.

### mesh_summary

Set a description of what you are working on. Visible to other agents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `summary` | string (max 500 chars) | Yes | Brief description |

### mesh_send

Send a message to a specific peer or broadcast to all.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string | Yes | Peer ID or `"all"` for broadcast |
| `message` | string (max 64KB) | Yes | Message content |
| `type` | `"text" \| "json" \| "command" \| "alert"` | No | Message type (default: text) |

### mesh_inbox

Read messages from other sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | `"unread" \| "all"` | No | Default: unread |
| `from` | string | No | Filter by sender peer ID |
| `limit` | number | No | Max messages (default: 20) |

**Note:** Fetched messages are automatically marked as read.

### mesh_state

Shared key-value scratchpad accessible by all peers.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"get" \| "set" \| "list" \| "delete"` | Yes | Operation |
| `key` | string | For get/set/delete | State key |
| `value` | string | For set | Value to store |
| `namespace` | string | No | Project scope (default: "default") |

### mesh_lock

Advisory file locking to prevent edit conflicts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"lock" \| "unlock" \| "query"` | Yes | Operation |
| `filePath` | string | For lock/unlock | File to lock |
| `reason` | string | No | Why you are locking |
| `ttlMinutes` | number | No | Auto-expire (default: 10) |

### mesh_events

Read or subscribe to mesh events.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"read" \| "subscribe" \| "unsubscribe"` | No | Default: read |
| `types` | string[] | For subscribe | Event types to watch |
| `since` | string (ISO 8601) | No | Only events after this time |
| `limit` | number | No | Max events (default: 50) |

**Built-in event types:** peer_joined, peer_left, state_changed, file_locked, file_unlocked, message_received.

### mesh_status

Check broker health, peer count, message stats.

No parameters required.

**Returns:** status, version, uptime, pid, port, peer counts, message counts, lock count, event count, database size.

---

## Broker HTTP API

The broker exposes 12 HTTP endpoints on localhost. All endpoints except `/health` require bearer token authentication.

### Authentication

Include the token from `~/.slm-mesh/broker.token` in the Authorization header:

```
Authorization: Bearer <token>
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth required) |
| GET | `/status` | Full stats |
| POST | `/register` | Register new peer |
| POST | `/unregister` | Deregister peer |
| POST | `/heartbeat` | Keep peer alive |
| POST | `/peers` | List peers (with scope filtering) |
| POST | `/summary` | Update peer summary |
| POST | `/send` | Send message (direct or broadcast) |
| POST | `/messages` | Read messages for a peer |
| POST | `/state` | Get/set/list/delete shared state |
| POST | `/lock` | Lock/unlock/query files |
| POST | `/events` | Read/emit events |

### Rate Limiting

All endpoints are rate-limited to 100 requests per peer per 10 seconds. Exceeding the limit returns HTTP 429.

### Body Size

Maximum request body: 1 MB.
