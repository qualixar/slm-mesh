# SLM Mesh — Windsurf Integration

## Setup (30 seconds)

### Step 1: Add MCP Server

Add to your Windsurf MCP configuration:

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

### Step 2: Add Windsurf Rules (Optional but Recommended)

Copy `.windsurfrules` from this folder to your project root. This teaches Windsurf's Cascade to use SLM Mesh for multi-session coordination.

### Step 3: Restart Windsurf

Reload the window. SLM Mesh tools are now available to Cascade.

## Usage

Ask Cascade naturally:

> "Who else is working on this machine?"
> "Lock the config file before I edit it"
> "Broadcast that I just updated the API schema"
> "Check my inbox for messages from other sessions"

## Demo

[![SLM Mesh Demo](https://img.youtube.com/vi/IDYCTPJLKVs/maxresdefault.jpg)](https://youtu.be/IDYCTPJLKVs)
