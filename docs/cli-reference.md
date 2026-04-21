# CLI Reference

All commands support `--json` for machine-readable output.

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON (no formatting, no branding) |
| `--version` | Print version |
| `--help` | Print help |

## Commands

### slm-mesh (no args)

Auto-start broker and print status. Zero-config entry point.

### slm-mesh start

Start the broker in the foreground. Usually not needed — the broker auto-starts.

### slm-mesh stop

Stop the running broker gracefully (SIGTERM).

```bash
slm-mesh stop
# Broker (PID 12345) stopped.
```

### slm-mesh status

Show broker health, peer counts, message stats, lock counts.

```bash
slm-mesh status
# SLM Mesh v1.2.6 | Part of the Qualixar research initiative
#
# Status:    ok
# Uptime:    3,600s
# Peers:     3 active, 0 stale
# Messages:  42 total, 2 undelivered
# Locks:     1 active
# Events:    156 total
```

### slm-mesh peers

List all active AI agent sessions.

```bash
slm-mesh peers
# ID            NAME           AGENT        PROJECT              SUMMARY
# abc-123       peer-abc123    claude-code  /Users/.../my-app    Refactoring auth
# def-456       peer-def456    cursor       /Users/.../my-app    Writing tests
```

### slm-mesh send \<peerId\> \<message\>

Send a direct message to a specific peer.

```bash
slm-mesh send abc-123 "I just updated the database schema"
```

Options:
| Option | Description |
|--------|-------------|
| `--from <id>` | Sender peer ID (default: "cli") |

### slm-mesh broadcast \<message\>

Send a message to all active peers.

```bash
slm-mesh broadcast "Server IP changed to 10.0.0.5"
```

### slm-mesh state get \<key\>

Read a shared state value.

```bash
slm-mesh state get server_ip
# 10.0.0.5
```

### slm-mesh state set \<key\> \<value\>

Write a shared state value.

```bash
slm-mesh state set server_ip 10.0.0.5
```

### slm-mesh lock list

Show all active file locks.

```bash
slm-mesh lock list
# FILE          LOCKED BY      REASON            EXPIRES
# /src/auth.ts  peer-abc123    refactoring auth  8 minutes
```

### slm-mesh events

Show recent mesh events.

```bash
slm-mesh events
# TIME                  TYPE           DETAILS
# 2026-04-08 10:30:01   peer_joined    peer-abc123 (claude-code)
# 2026-04-08 10:30:15   file_locked    /src/auth.ts by peer-abc123
# 2026-04-08 10:31:02   state_changed  server_ip = 10.0.0.5
```

### slm-mesh version

Print the SLM Mesh version.

### slm-mesh clean

Find and kill zombie SLM Mesh processes, clean stale socket files.

```bash
slm-mesh clean
# Killed 2 zombie processes
# Cleaned 3 stale sockets
```
