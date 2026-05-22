# Multi-Machine SLM Mesh Setup

**Real-time AI agent coordination across machines on your LAN.**

This guide shows you how to set up SLM Mesh so that agents on different computers can discover, message, and coordinate with each other.

---

## Machine Roles

Every machine in the mesh has one of three roles. Set it with `SLM_MESH_ROLE`:

| Role | `SLM_MESH_ROLE` | `SLM_MESH_HOST` | What it does |
|------|----------------|-----------------|--------------|
| **Hub (Broker)** | `broker` | `0.0.0.0` | Runs the broker. All other machines connect to this one. Pick ONE hub per mesh. |
| **Client (Peer)** | `client` | Hub machine's IP | Connects to the hub. Never spawns a local broker. Fails fast if hub is unreachable. |
| **Standalone** | `broker` (default) | `127.0.0.1` | Local-only. No cross-machine coordination. |

> **`auto` (default):** If `SLM_MESH_HOST` is localhost → broker mode. If it's a remote IP → client mode.
> Setting `SLM_MESH_ROLE` explicitly is recommended for multi-machine setups to avoid ambiguity.

---

## Overview

SLM Mesh v1.3.1 introduces **cross-machine peer coordination** using:

1. **WebSocket Transport** — Authenticated remote connections (port 7900, configurable)
2. **mDNS Discovery** — Brokers advertise themselves on the LAN; clients auto-discover
3. **Shared Secret Auth** — Bearer token for all remote connections
4. **Peer Routing** — Direct peerId-based message delivery across machines

All agents on M4 and M5 can:
- Discover each other
- Send targeted messages
- Broadcast to all
- Share state
- Coordinate file locks
- Subscribe to events

---

## Requirements

- **Same Local Network** — M4 and M5 on same WiFi or Ethernet (no internet routing needed)
- **No Firewall Blocking** — Port 7900 (or your custom `SLM_MESH_WS_PORT`) open between machines
- **Same Shared Secret** — All machines must use identical `SLM_MESH_SHARED_SECRET`
- **Broker Machine** — One machine (M4) runs the broker in "remote enabled" mode

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Local Network (LAN)                         │
│                                                                  │
│  ┌──────────────────────────┐      ┌──────────────────────────┐ │
│  │         M4 (Broker)      │      │      M5 (Client)         │ │
│  │                          │      │                          │ │
│  │  ┌────────────────────┐  │      │  ┌────────────────────┐  │ │
│  │  │ Broker (HTTP)      │  │      │  │ MCP Agent 1        │  │ │
│  │  │ 0.0.0.0:7899       │  │      │  │ WS→M4:7900         │  │ │
│  │  └────────────────────┘  │      │  └────────────────────┘  │ │
│  │           ▲               │      │           │              │ │
│  │           │               │      │           │              │ │
│  │  ┌────────┴────────────┐  │      │  ┌────────▼────────────┐ │ │
│  │  │ WS Server           │◄─┼──────┤─►│ Hello: {peerId,     │  │ │
│  │  │ 0.0.0.0:7900        │  │      │  │ sharedSecret}       │  │ │
│  │  │ (port 7900)         │  │      │  └────────────────────┘  │ │
│  │  └─────────────────────┘  │      │                          │ │
│  │           ▲                │      │  ┌────────────────────┐  │ │
│  │           │                │      │  │ MCP Agent 2        │  │ │
│  │  ┌────────┴────────────┐   │      │  │ WS→M4:7900         │  │ │
│  │  │ mDNS Advertiser     │   │      │  └────────────────────┘  │ │
│  │  │ _slm-mesh._tcp.local│   │      │                          │ │
│  │  │ M4.local:7900       │   │      │                          │ │
│  │  └─────────────────────┘   │      │                          │ │
│  │                            │      │                          │ │
│  └──────────────────────────┘      └──────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. M4 broker starts with `isRemoteEnabled=true`, listens on `0.0.0.0:7900`
2. M4 advertises itself via mDNS: `_slm-mesh._tcp.local`
3. M5 auto-discovers M4 via mDNS (or manual config)
4. M5 agents send hello message with their peerId to M4's WS server
5. M4 registers peerId → WS client mapping
6. Any agent can send to any peerId; M4 routes via WebSocket

---

## Setup (Step-by-Step)

### Step 1: Identify Your Machines

- **M4** (broker) — The "hub." Runs SLM Mesh in remote mode. IP: `192.168.1.100` (example)
- **M5** (client) — Connects to M4's broker. IP: `192.168.1.101` (example)

Find your IPs:
```bash
# macOS / Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig
```

### Step 2: Generate a Shared Secret

On M4, generate a secret (random string):
```bash
openssl rand -hex 32
# Output: 7f8a9c3e2b1d4f6a9e5c8b2a1d3f4e6c
```

Use this same secret on all machines (M4, M5, etc.).

### Step 3: Start Broker on M4

```bash
export SLM_MESH_HOST=0.0.0.0
export SLM_MESH_SHARED_SECRET=7f8a9c3e2b1d4f6a9e5c8b2a1d3f4e6c
npx slm-mesh start
```

**Output:**
```
[slm-mesh] Broker started on 0.0.0.0:7899 (PID 12345)
[slm-mesh] WebSocket push server on 0.0.0.0:7900
[slm-mesh] mDNS discovery active — other machines on LAN can find this broker
```

The broker is now:
- **HTTP API** on port 7899 (localhost only)
- **WebSocket** on port 7900 (remote access)
- **mDNS advertised** as `M4._slm-mesh._tcp.local` (or your hostname)

### Step 4: Connect M5 Agents

On M5, add SLM Mesh to your MCP config with the shared secret and M4's IP:

**Claude Code:**
```bash
# Set the environment variables
export SLM_MESH_HOST=192.168.1.100        # M4's IP
export SLM_MESH_SHARED_SECRET=7f8a9c3e2b1d4f6a9e5c8b2a1d3f4e6c

# Add MCP
claude mcp add --scope user slm-mesh -- npx slm-mesh
```

**Cursor / VS Code / Windsurf:**

Add to `.cursor/mcp.json` or `.vscode/extensions.json`:
```json
{
  "mcpServers": {
    "slm-mesh": {
      "command": "npx",
      "args": ["slm-mesh"],
      "env": {
        "SLM_MESH_HOST": "192.168.1.100",
        "SLM_MESH_SHARED_SECRET": "7f8a9c3e2b1d4f6a9e5c8b2a1d3f4e6c"
      }
    }
  }
}
```

When you start an agent on M5, it will:
1. Auto-discover M4 (or connect to the IP you provided)
2. Send a hello message with its peerId
3. Receive real-time push notifications from M4

### Step 5: Test Connectivity

On M5 in any agent:
```
> /mesh-peers
Peers on this machine: 1
  - agent-id-xyz (Cursor editor)

Peers on LAN: 1
  - peer-on-M4 (Claude Code)
```

Send a message from M5 to M4:
```
> /mesh-send <peer-id-from-M4> "Hello from M5!"
```

On M4, the agent should receive:
```
[slm-mesh] New message from M5-agent-xyz: "Hello from M5!"
```

---

## Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `SLM_MESH_ROLE` | `auto` | Machine role: `broker` (hub, spawns broker), `client` (peer, connects to hub, never spawns), `auto` (infers from `SLM_MESH_HOST`) |
| `SLM_MESH_HOST` | `127.0.0.1` | Broker bind address. `0.0.0.0` = listen on all interfaces (hub). Remote IP = connect to that hub (client). |
| `SLM_MESH_SHARED_SECRET` | — | Bearer token for all remote connections. **Required** when role is `client` or `SLM_MESH_HOST` is not localhost. Must be identical on all machines. |
| `SLM_MESH_PORT` | `7899` | HTTP API port for the broker. |
| `SLM_MESH_WS_PORT` | `7900` | WebSocket push port. Must be reachable from client machines. |
| `SLM_MESH_DISCOVERY` | `on` | mDNS auto-discovery on LAN. Set `off` to disable. |
| `SLM_MESH_DATA_DIR` | `~/.slm-mesh` | Where broker stores its DB, PID file, and peer registry. |

**Hub machine (one per mesh):**
```bash
export SLM_MESH_ROLE=broker
export SLM_MESH_HOST=0.0.0.0
export SLM_MESH_SHARED_SECRET=your-secret
npx slm-mesh
```

**Client machine (all other machines) — MCP config:**
```json
{
  "mcpServers": {
    "slm-mesh": {
      "command": "npx",
      "args": ["slm-mesh"],
      "env": {
        "SLM_MESH_ROLE": "client",
        "SLM_MESH_HOST": "192.168.1.100",
        "SLM_MESH_SHARED_SECRET": "your-secret"
      }
    }
  }
}
```

---

## Security Model

### Authentication

- **Shared Secret** — All remote connections require the bearer token (`SLM_MESH_SHARED_SECRET`)
- **Per-Connection** — Every WebSocket client sends hello with its peerId; M4 validates the shared secret
- **No Passwords** — Bearer token is the only credential (not SSH keys or passwords)

### Network Isolation

- **LAN Only** — Broker binds to `0.0.0.0` but expects clients on the same local network
- **No WAN Exposure** — Broker does not open to the internet. Use a VPN if you need remote machines
- **Firewall Required** — Your router's firewall protects the LAN by default

### Recommended for Untrusted Networks

If M4 and M5 are on different LANs (e.g., office + home):

1. **VPN** — Use ZeroTier, Tailscale, or WireGuard to create a virtual LAN
   ```bash
   # On M4 (within VPN)
   export SLM_MESH_HOST=0.0.0.0
   npx slm-mesh start
   
   # On M5 (within VPN)
   export SLM_MESH_HOST=10.0.0.1  # M4's VPN IP
   claude mcp add --scope user slm-mesh -- npx slm-mesh
   ```

2. **SSH Port Forward** (if VPN unavailable)
   ```bash
   # On M5, forward port 7900 to M4 over SSH
   ssh -L 7900:localhost:7900 user@M4
   
   # Then set SLM_MESH_HOST=localhost on M5
   export SLM_MESH_HOST=localhost
   ```

---

## mDNS Discovery (How It Works)

When `SLM_MESH_DISCOVERY=true`, the broker advertises itself on the LAN using **Bonjour/Avahi**:

```bash
# View advertised service
dns-sd -B _slm-mesh._tcp local.

# Output:
# DATE_TIME Browsing for _slm-mesh._tcp
# DATE_TIME Flags: ...
# DATE_TIME M4 _slm-mesh._tcp. local.
```

**M5 auto-discovers:**
1. Queries mDNS for `_slm-mesh._tcp.local`
2. Receives response: `M4.local:7900` (M4's hostname + port)
3. Resolves hostname to IP: `192.168.1.100`
4. Connects to `192.168.1.100:7900` with shared secret

**To disable discovery:**
```bash
export SLM_MESH_DISCOVERY=false
# M5 must manually set SLM_MESH_HOST=<M4-IP>
```

---

## Troubleshooting

### "Connection refused" on M5

**Symptom:** M5 agents can't connect to M4

**Solutions:**
1. Verify M4 broker is running:
   ```bash
   slm-mesh status
   # Should show: "Broker is running on port 7899"
   ```

2. Verify WebSocket port is open:
   ```bash
   # On M4
   lsof -i :7900
   # Should show slm-mesh process
   ```

3. Verify firewall allows port 7900:
   ```bash
   # Temporarily disable firewall to test
   sudo ufw disable  # Ubuntu
   sudo defaults write com.apple.alf globalstate -int 0  # macOS
   ```

4. Verify correct IP on M5:
   ```bash
   # Ping M4 from M5
   ping 192.168.1.100
   # If timeout, check network connectivity
   ```

### "Authentication failed" on M5

**Symptom:** M5 agents connect but immediately disconnect

**Solutions:**
1. Verify shared secret is identical:
   ```bash
   echo $SLM_MESH_SHARED_SECRET  # On M4
   echo $SLM_MESH_SHARED_SECRET  # On M5
   # Should print the same value
   ```

2. Verify WS port is correct:
   ```bash
   echo $SLM_MESH_WS_PORT  # Should be 7900 on both
   ```

### mDNS discovery not working

**Symptom:** M5 can't auto-discover M4

**Solutions:**
1. Verify mDNS is enabled:
   ```bash
   export SLM_MESH_DISCOVERY=true  # On M4
   ```

2. Manually specify IP instead:
   ```bash
   export SLM_MESH_HOST=192.168.1.100  # On M5
   ```

3. Check if mDNS service is running:
   ```bash
   # macOS
   dns-sd -B _services._dns-sd._udp local.
   
   # Linux
   avahi-browse -l
   ```

### "Port already in use"

**Symptom:** Broker fails to start on port 7900

**Solutions:**
1. Use a different port:
   ```bash
   export SLM_MESH_WS_PORT=8900  # On M4
   export SLM_MESH_WS_PORT=8900  # On M5 (must match)
   ```

2. Kill the process using port 7900:
   ```bash
   lsof -i :7900
   kill -9 <PID>
   ```

---

## Best Practices

### For Production Multi-Machine Setups

1. **Use VPN for remote machines** — Don't expose port 7900 to the internet
2. **Rotate shared secret regularly** — Use a secret manager (1Password, Vault) to store it
3. **Monitor broker logs** — Check for failed auth attempts
4. **One broker per site** — Don't run multiple brokers on the same LAN
5. **Restart broker after network changes** — If your IP changes, restart to re-advertise mDNS

### For Development

1. **Same network** — Use a shared WiFi network (5GHz preferred for speed)
2. **Test with /mesh-peers** — Verify discovery before heavy use
3. **Check logs** — Run broker in foreground (`npx slm-mesh start`) to see connection events
4. **Incremental setup** — Start with M4 + M5, then add M6, M7, etc.

---

## Examples

### Example 1: Two-Machine Dev Environment

**M4 (Mac Studio, local hub):**
```bash
export SLM_MESH_HOST=0.0.0.0
export SLM_MESH_SHARED_SECRET=dev-secret-12345
npx slm-mesh start
```

**M5 (MacBook Pro, remote):**
```bash
export SLM_MESH_HOST=192.168.1.50  # M4's IP
export SLM_MESH_SHARED_SECRET=dev-secret-12345
claude mcp add --scope user slm-mesh -- npx slm-mesh
```

All Claude Code sessions on M5 now coordinate with M4 agents.

### Example 2: Three-Machine Team

**M4 (Team Lead's MacBook):**
```bash
npx slm-mesh start  # auto-detects local IP, enables discovery
```

**M5 (Engineer A's MacBook):**
```bash
claude mcp add --scope user slm-mesh -- npx slm-mesh
# Auto-discovers M4 via mDNS
```

**M6 (Engineer B's Windows PC):**
```bash
Set-Item -Path env:SLM_MESH_HOST -Value 192.168.1.X  # M4's IP
npx slm-mesh  # Via WSL or native Node
```

All three can message each other and share state.

### Example 3: Cross-Office Setup (VPN)

**M4 (Office A, behind ZeroTier VPN):**
```bash
export SLM_MESH_HOST=0.0.0.0
export SLM_MESH_SHARED_SECRET=prod-secret-xyz
npx slm-mesh start
```

**M5 (Office B, behind ZeroTier VPN):**
```bash
export SLM_MESH_HOST=10.0.0.1  # M4's VPN IP
export SLM_MESH_SHARED_SECRET=prod-secret-xyz
npx slm-mesh  # Via MCP
```

All agents across offices coordinate securely.

---

## Performance

- **Latency** — WebSocket push is <100ms (LAN-bound)
- **Throughput** — Tested with 1000+ concurrent messages (broker load <5% CPU)
- **Scaling** — Per-machine scalability (localhost is single-threaded; use multiple brokers for 100+ peers)

---

## See Also

- [README.md](../README.md) — Overview and single-machine setup
- [Security](../README.md#security) — Security model details
- [Architecture](../README.md#architecture) — System design

---

**Questions?** Open an issue on [GitHub](https://github.com/qualixar/slm-mesh).
