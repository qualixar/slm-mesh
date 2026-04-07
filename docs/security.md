# Security

SLM Mesh is designed for single-machine use by a single user. The security model prioritizes simplicity and defense-in-depth.

## Threat Model

**In scope:** Protection against accidental cross-session interference, runaway agents, and basic local process impersonation.

**Out of scope:** Protection against a malicious actor with root access to the machine. If an attacker has root, they can read any file and intercept any local traffic.

## Authentication

### Bearer Token

On startup, the broker generates a cryptographically random 32-byte token (hex-encoded, 64 characters) and writes it to `~/.slm-mesh/broker.token` with `0o600` permissions (owner-only read/write).

All HTTP requests to the broker (except `GET /health`) must include:

```
Authorization: Bearer <token>
```

The MCP server and CLI read the token from disk. The token is regenerated on every broker restart.

### Why Not mTLS?

The broker runs on localhost only. TLS adds certificate management complexity with no security benefit for loopback traffic. The bearer token prevents unauthorized local processes from accessing the API.

## Network Security

- **Localhost binding** — The broker binds to `127.0.0.1`. It is architecturally impossible to bind to `0.0.0.0` — the config validator rejects any host that is not `127.0.0.1`, `localhost`, or `::1`.
- **No network exposure** — No port is opened to the network. All communication is local.
- **No telemetry** — Nothing is sent to any external server.

## Input Validation

| Input | Validation |
|-------|-----------|
| Peer ID | Must be UUID v4 format |
| Message payload | Max 64 KB |
| Summary text | Max 500 characters |
| HTTP body | Max 1 MB |
| Socket paths | Validated against expected directories |
| Broker host | Only localhost variants accepted |

## Rate Limiting

All endpoints are rate-limited to 100 requests per peer per 10-second window. Exceeding the limit returns HTTP 429.

## Process Security

- **No shell injection** — All child process spawning uses `execFileSync` with argument arrays, never shell strings.
- **PID file locking** — Exclusive-create flag (`wx`) prevents PID file race conditions.
- **Socket permissions** — UDS sockets are created in directories with `0o700` permissions.
- **Log permissions** — Broker log file created with `0o600`.

## Data Security

- **Local storage only** — All data stays in `~/.slm-mesh/` on the local filesystem.
- **No encryption at rest** — SQLite database is not encrypted. This is intentional — the threat model assumes the local user is trusted.
- **TTL cleanup** — Messages older than 24 hours and events older than 48 hours are automatically pruned.

## File Permissions Summary

| File | Permissions | Purpose |
|------|-------------|---------|
| `~/.slm-mesh/` | `0o700` | Data directory |
| `~/.slm-mesh/peers/` | `0o700` | UDS socket directory |
| `~/.slm-mesh/broker.token` | `0o600` | Auth token |
| `~/.slm-mesh/broker.log` | `0o600` | Log file |
| `~/.slm-mesh/mesh.db` | `0o600` | Database |

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly by opening a GitHub issue with the `security` label, or contact the maintainer directly.
