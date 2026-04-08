# mesh-status

Show the full SLM Mesh health dashboard — peers, messages, locks, events, broker stats.

## Usage
/mesh-status

## Instructions

Get a complete overview of the SLM Mesh state by calling multiple tools:

1. Call `mesh_status` to get broker health, uptime, and counts.

2. Call `mesh_peers` with scope "machine" to list all active sessions.

3. Call `mesh_lock` with action "query" to show active file locks.

4. Call `mesh_inbox` to check for unread messages.

5. Present everything in a clean dashboard format:

```
SLM Mesh Dashboard
━━━━━━━━━━━━━━━━━━
Broker: running (uptime: Xm)
Peers:  X active, X stale
Messages: X total, X unread
Locks: X active
Events: X total

Active Peers:
  - peer-abc (claude-code) — "Working on auth"
  - peer-def (cursor) — "Writing tests"

File Locks:
  - src/auth.ts → peer-abc (expires in 8m)

Unread Messages:
  - From peer-def: "Don't touch database.ts"
```

6. If broker is not running, inform the user and suggest `slm-mesh start`.
