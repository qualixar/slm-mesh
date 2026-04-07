# Changelog

All notable changes to SLM Mesh will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
