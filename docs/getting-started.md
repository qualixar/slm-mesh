# Getting Started

This guide walks you through installing SLM Mesh and sending your first message between two AI coding sessions.

## Prerequisites

- Node.js 20 or later
- An MCP-compatible AI coding agent (Claude Code, Cursor, VS Code, Windsurf, Aider, or Codex)

## Step 1: Install

```bash
npm install -g slm-mesh
```

Or use without installing:

```bash
npx slm-mesh
```

## Step 2: Add to Your AI Agent

### Claude Code

```bash
claude mcp add --scope user slm-mesh -- npx slm-mesh
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "slm-mesh": {
      "command": "npx",
      "args": ["slm-mesh"]
    }
  }
}
```

### VS Code / Windsurf / Other MCP Agents

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "slm-mesh": {
      "command": "npx",
      "args": ["slm-mesh"]
    }
  }
}
```

## Step 3: Open Two Sessions

Open two terminal windows with your AI coding agent. Both sessions automatically:

1. Start the SLM Mesh broker (if not already running)
2. Register as a peer with the broker
3. Get 8 MCP tools for inter-session communication

## Step 4: Discover Peers

In Session A, ask your agent:

> "Use mesh_peers to see who else is working on this machine."

The agent will call `mesh_peers` with scope `machine` and show you Session B.

## Step 5: Send a Message

In Session A:

> "Use mesh_send to tell the other session that I just refactored the auth module."

Session B receives the message in real-time via Unix Domain Socket push. The agent can check with `mesh_inbox`.

## Step 6: Share State

In Session A:

> "Use mesh_state to set the database_version to 42."

In Session B:

> "Use mesh_state to get the database_version."

Both sessions share a key-value scratchpad, namespaced by project.

## Step 7: Lock a File

Before editing a shared file:

> "Use mesh_lock to lock src/auth.ts before I start refactoring it."

Other sessions will see the lock and know not to edit that file.

## What Happens Under the Hood

1. The first MCP server to start checks if a broker is running on localhost:7899.
2. If not, it spawns the broker as a detached background process.
3. The broker creates a SQLite database at `~/.slm-mesh/mesh.db` and generates a bearer token at `~/.slm-mesh/broker.token`.
4. Each MCP server registers with the broker and opens a Unix Domain Socket for real-time push notifications.
5. When a session ends, the MCP server unregisters. The broker cleans up locks and notifies other peers.
6. When no peers remain for 60 seconds, the broker auto-shuts down.

## Using the CLI

You can also interact with the mesh from the command line:

```bash
slm-mesh status             # Check broker health
slm-mesh peers              # List active sessions
slm-mesh send <id> "hello"  # Send a message
slm-mesh broadcast "alert"  # Broadcast to all
slm-mesh state set key val  # Set shared state
slm-mesh lock list           # Show active locks
slm-mesh events              # Show recent events
```

Add `--json` to any command for machine-readable output.

## Next Steps

- [Architecture](architecture.md) — Understand the system design
- [API Reference](api-reference.md) — All 8 MCP tools and 12 broker endpoints
- [CLI Reference](cli-reference.md) — Every command with examples
- [Configuration](configuration.md) — Environment variables and tuning
- [Security](security.md) — Security model and authentication
