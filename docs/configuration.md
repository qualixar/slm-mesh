# Configuration

SLM Mesh works with zero configuration. All settings have sensible defaults.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SLM_MESH_PORT` | `7899` | Broker HTTP port. If busy, tries next ports up to +10. |
| `SLM_MESH_DATA_DIR` | `~/.slm-mesh/` | Data directory for database, PID file, token, logs, sockets. |
| `SLM_MESH_HOST` | `127.0.0.1` | Broker bind address. Only `127.0.0.1`, `localhost`, and `::1` are allowed. |
| `SLM_MESH_HEARTBEAT_MS` | `15000` | How often MCP servers send heartbeats (milliseconds). |
| `SLM_MESH_STALE_MS` | `30000` | Time without heartbeat before a peer is marked stale. |
| `SLM_MESH_DEAD_MS` | `60000` | Time without heartbeat before a stale peer is removed. |
| `SLM_MESH_LOCK_TTL_MIN` | `10` | Default lock expiration (minutes). |

## Data Directory Structure

```
~/.slm-mesh/
├── mesh.db          # SQLite database (WAL mode)
├── mesh.db-wal      # WAL journal (auto-managed)
├── mesh.db-shm      # Shared memory (auto-managed)
├── broker.pid       # Broker process ID
├── port             # Actual port (if different from default)
├── broker.token     # Bearer auth token (0o600 permissions)
├── broker.log       # Broker log output
└── peers/           # UDS socket files (one per peer)
    ├── <uuid>.sock
    └── ...
```

## SQLite Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Journal mode | WAL | Concurrent readers + single writer |
| Busy timeout | 5000ms | Wait for locks instead of failing |
| Cache size | 64MB | In-memory page cache |
| Journal size limit | 64MB | Prevent unbounded WAL growth |
| mmap size | 128MB | Memory-mapped I/O for reads |

## Tuning for High-Peer Scenarios

If running many concurrent sessions (20+):

- Increase `SLM_MESH_HEARTBEAT_MS` to `30000` to reduce broker load
- The SQLite WAL mode handles concurrent reads efficiently
- Message TTL cleanup runs every heartbeat interval (prunes messages >24h, events >48h)
- Each peer uses one UDS connection (~negligible memory)

## Port Conflict Resolution

If port 7899 is busy, the broker tries ports 7900, 7901, ..., up to 7909. The actual port is written to `~/.slm-mesh/port` so MCP servers and CLI can discover it.
