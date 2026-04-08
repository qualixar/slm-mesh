# mesh-peers

Discover other AI agent sessions running on this machine. Shows who else is working, what they're doing, and which files they've locked.

## Usage
/mesh-peers
/mesh-peers directory
/mesh-peers repo

## Instructions

Use the `mesh_peers` MCP tool to discover other active AI agent sessions.

1. Call `mesh_peers` with the requested scope:
   - No argument or "machine" → scope: "machine" (all sessions on this machine)
   - "directory" → scope: "directory" (same project directory only)
   - "repo" → scope: "repo" (same git repository only)

2. Display the results in a clear table showing:
   - Peer name and ID
   - Agent type (Claude Code, Cursor, Aider, etc.)
   - Project path
   - Summary (what they're working on)
   - Status

3. Also call `mesh_lock` with action "query" to show any active file locks.

4. If no peers are found, let the user know they're the only active session.

Format the output as a clean, readable summary — not raw JSON.
