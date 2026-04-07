# slm-mesh (Python)

Python client for [SLM Mesh](https://github.com/qualixar/slm-mesh) — peer-to-peer communication for AI coding agents.

Part of the [Qualixar](https://qualixar.com) ecosystem.

## Install

```bash
pip install slm-mesh
```

## Quick Start

```python
from slm_mesh import SLMMeshClient

client = SLMMeshClient()  # connects to localhost:7899

# Check broker health
print(client.health())

# List connected peers
peers = client.peers()

# Send a message
msg_id = client.send(from_peer="agent-a", to_peer="agent-b", payload="hello")

# Read inbox
messages = client.inbox(peer_id="agent-b")

# Shared state
client.state_set(key="current_file", value="main.py", peer_id="agent-a")
entry = client.state_get(key="current_file")

# File locking
lock = client.lock(file_path="src/app.ts", peer_id="agent-a")
client.unlock(file_path="src/app.ts", peer_id="agent-a")

# Event stream
events = client.events(types=["message", "lock"], limit=10)
```

## Requirements

- Python 3.10+
- Zero external dependencies (stdlib only)
- SLM Mesh broker running on localhost (Node.js)

## License

MIT
