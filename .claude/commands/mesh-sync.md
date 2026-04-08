# mesh-sync

One command to sync with the mesh — set your summary, check messages, see peers, and check locks. The daily standup for AI agents.

## Usage
/mesh-sync
/mesh-sync <summary of what you're working on>

## Instructions

This is the all-in-one mesh coordination command. Execute these steps in order:

1. **Set summary** (if provided): Call `mesh_summary` with the user's description of what they're working on. If no summary provided, use a brief description based on the current project context.

2. **Check inbox**: Call `mesh_inbox` to read any unread messages from other sessions.

3. **Discover peers**: Call `mesh_peers` with scope "machine" to see who else is active.

4. **Check locks**: Call `mesh_lock` with action "query" to see which files are locked.

5. **Present a clean summary:**

```
Mesh Sync Complete
━━━━━━━━━━━━━━━━━
Your status: "Working on auth refactoring"

Unread messages (2):
  - peer-def: "Database schema updated to v2.1"
  - peer-ghi: "Don't touch src/config.ts"

Active peers (3):
  - peer-abc (claude-code) — "Frontend routing"
  - peer-def (cursor) — "Database migration"
  - peer-ghi (aider) — "Config refactor"

Locked files:
  - src/config.ts → peer-ghi (7m remaining)
```

6. If there are important messages (alerts, warnings about files you're working on), highlight them prominently.

Examples:
- `/mesh-sync` → syncs with default context-based summary
- `/mesh-sync refactoring the auth module to use JWT` → sets specific summary then syncs
