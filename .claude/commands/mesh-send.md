# mesh-send

Send a message to other AI agent sessions. Broadcast to all or send to a specific peer.

## Usage
/mesh-send <message>
/mesh-send <peer-id> <message>

## Instructions

Send a message to other active sessions via the SLM Mesh.

1. If only a message is provided (no peer ID), broadcast to ALL active peers using `mesh_send` with `to: "all"`.

2. If a peer ID is provided before the message, send a direct message to that specific peer using `mesh_send` with `to: "<peer-id>"`.

3. Before sending, call `mesh_peers` to verify there are active peers to receive the message.

4. After sending, confirm delivery with the message ID(s) returned.

5. If no peers are found, inform the user that no one is listening and suggest they open another session.

Examples:
- `/mesh-send auth module refactored` → broadcasts "auth module refactored" to all peers
- `/mesh-send peer-abc123 please don't touch database.ts` → direct message to peer-abc123
