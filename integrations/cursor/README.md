# SLM Mesh — Cursor Integration

## Setup (30 seconds)

### Step 1: Add MCP Server

Create or edit `.cursor/mcp.json` in your project root:

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

### Step 2: Add Cursor Rules (Optional but Recommended)

Copy `.cursorrules` from this folder to your project root. This teaches Cursor to automatically use SLM Mesh tools for coordination.

### Step 3: Restart Cursor

Restart Cursor or reload the window. SLM Mesh tools will appear in your agent's tool list.

## Available Tools

Once connected, your Cursor agent has access to:

- `mesh_peers` — See other active sessions
- `mesh_send` — Send messages to other sessions
- `mesh_inbox` — Read messages
- `mesh_state` — Shared key-value state
- `mesh_lock` — File locking
- `mesh_events` — Event subscription
- `mesh_summary` — Set your work description
- `mesh_status` — Health check

## Usage in Cursor

Just ask your agent naturally:

> "Check if anyone else is working on this project"
> "Lock auth.ts before I start refactoring"
> "Tell the other session I updated the schema"
> "What messages do I have from other sessions?"

## Demo

[![SLM Mesh Demo](https://img.youtube.com/vi/IDYCTPJLKVs/maxresdefault.jpg)](https://youtu.be/IDYCTPJLKVs)
