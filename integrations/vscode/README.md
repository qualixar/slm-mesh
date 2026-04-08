# SLM Mesh — VS Code Integration

## Setup (30 seconds)

### For Claude Code in VS Code

```bash
claude mcp add --scope user slm-mesh -- npx slm-mesh
```

Done. Every Claude Code session in VS Code now has mesh tools.

### For GitHub Copilot / Other MCP Agents in VS Code

Add to your VS Code MCP settings (`.vscode/mcp.json`):

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

## Claude Code Skills

If using Claude Code, copy the `skills/` folder from the repo root into your project's `.claude/commands/` directory for slash command support:

```bash
# From your project root
mkdir -p .claude/commands
cp node_modules/slm-mesh/skills/*.md .claude/commands/
```

This gives you:
- `/mesh-peers` — Discover other sessions
- `/mesh-send` — Send messages
- `/mesh-lock` — Lock/unlock files
- `/mesh-status` — Full dashboard
- `/mesh-sync` — All-in-one sync

## Demo

[![SLM Mesh Demo](https://img.youtube.com/vi/IDYCTPJLKVs/maxresdefault.jpg)](https://youtu.be/IDYCTPJLKVs)
