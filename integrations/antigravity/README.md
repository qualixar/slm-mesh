# SLM Mesh — Antigravity Integration

## Setup (30 seconds)

### Step 1: Add MCP Server

Add to your Antigravity MCP configuration (`.mcp.json` in project root):

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

### Step 2: Restart Antigravity

Reload the window or restart the agent. SLM Mesh tools will appear in the agent's available tools.

## Usage

Ask the agent naturally:

> "Use mesh_peers to see who else is on this machine"
> "Lock auth.ts before editing"
> "Broadcast that the database schema changed"
> "Check my inbox"

## Cross-Agent Communication

Antigravity can communicate with Claude Code, Cursor, Windsurf, and any other MCP-compatible agent through SLM Mesh. Different AI models, same mesh.

## Demo

[![SLM Mesh Demo](https://img.youtube.com/vi/IDYCTPJLKVs/maxresdefault.jpg)](https://youtu.be/IDYCTPJLKVs)
