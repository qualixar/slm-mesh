# Changelog

All notable changes to SLM Mesh will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-05-21

### Added

- **Multi-Machine Mesh** — Agents across different machines can now coordinate in real-time
- **WebSocket Push Transport** — Remote peer connections via authenticated WebSocket on port 7900
- **mDNS Auto-Discovery** — Brokers on LAN auto-advertise and are auto-discovered by remote clients
- **Cross-Machine Peer Routing** — `sendToPeer(peerId)` delivers messages to peers on remote machines
- **Shared Secret Authentication** — Bearer token for WebSocket connections (`SLM_MESH_SHARED_SECRET` env var)
- **Environment Variables** — `SLM_MESH_HOST`, `SLM_MESH_SHARED_SECRET`, `SLM_MESH_WS_PORT`, `SLM_MESH_DISCOVERY`
- **Integration Tests** — Tests for WsPushClient hello handshake, peerId registration, and cleanup

### Changed

- Broker now starts WebSocket server alongside HTTP server for remote connections
- `WsServer` interface extended with `sendToPeer(peerId, data)` for targeted delivery
- Handlers updated to support both UDS (local) and WebSocket (remote) push channels
- README updated with "Multi-Machine Setup" section and quick-start guide

### Fixed

- WsPushClient properly closes WebSocket connections on shutdown
- Peer disconnect events properly clean up peerId → clientId mappings
- Hello message registration ensures remote peers are routable

### Security

- All remote connections require shared secret authentication
- mDNS only advertises on LAN (localhost discovery within private networks)
- No WAN exposure — WebSocket server doesn't bind to public IPs by default

## [1.0.0] - 2026-04-08

### Added

- **Peer Discovery** — Auto-detect all running AI agent sessions on your machine with machine/directory/repo scoping
- **Direct Messaging** — Point-to-point structured message delivery between sessions with queryable history
- **Broadcast** — One-to-all message delivery for config changes, alerts, and coordination
- **Shared State** — Key-value scratchpad accessible by all peers, namespaced by project
- **File Coordination** — Advisory file locks prevent two agents from editing the same file, with auto-expire
- **Event Bus** — Pub/sub event system for peer_joined, peer_left, state_changed, and custom events
- **8 MCP Tools** — mesh_peers, mesh_summary, mesh_send, mesh_inbox, mesh_state, mesh_lock, mesh_events, mesh_status
- **Full CLI** — start, stop, status, peers, send, broadcast, state, lock, events commands with --json mode
- **Python Client** — Zero-dependency HTTP client wrapping the broker API
- **Agent Detection** — Auto-detect Claude Code, Cursor, Aider, Codex, Windsurf via process tree inspection
- **Auto-Lifecycle** — Broker auto-starts on first use, auto-stops when no peers remain
- **Pluggable Adapters** — BackendAdapter interface for custom storage backends (SQLite default)
- **SLM Memory Bridge** — Optional SuperLocalMemory integration for cross-session recall
- **Real-time Push** — Sub-100ms message delivery via Unix Domain Sockets
- **Security** — localhost-only, no cloud, no telemetry, no dangerous flags required

### Architecture

- Broker + MCP Server + CLI — three components, zero external dependencies beyond Node.js
- SQLite with WAL mode for concurrent access
- UDS push for real-time notifications
- MIT license

[1.0.0]: https://github.com/qualixar/slm-mesh/releases/tag/v1.0.0
