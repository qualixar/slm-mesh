# Troubleshooting

## Common Issues

### "Broker not running" or connection refused

**Symptom:** MCP tools return errors, CLI says broker is not running.

**Fix:**
```bash
# Check if broker is running
slm-mesh status

# If not, start it manually
slm-mesh start

# Or just run any MCP command — it auto-starts the broker
```

### Port already in use

**Symptom:** Broker fails to start with "EADDRINUSE" error.

**Fix:** The broker automatically tries ports 7899-7909. If all are busy:
```bash
# Find what's using the port
lsof -i :7899

# Kill the old process, or set a different port
SLM_MESH_PORT=8899 slm-mesh start
```

### Stale broker process

**Symptom:** `slm-mesh status` says broker is running but nothing works.

**Fix:**
```bash
slm-mesh clean    # Kills zombie processes and cleans stale sockets
slm-mesh start    # Restart fresh
```

### MCP server disconnects immediately

**Symptom:** Agent loses SLM Mesh tools after a few seconds.

**Fix:** Check that the broker is accessible:
```bash
curl http://127.0.0.1:7899/health
# Should return: {"status":"ok","version":"1.0.0",...}
```

If it works via curl but not via MCP, check your MCP configuration syntax.

### "Peer not found or inactive"

**Symptom:** Sending a message returns this error.

**Causes:**
1. The target peer closed their session
2. The target peer's heartbeat expired (crash without clean exit)
3. You are using an old peer ID

**Fix:** Call `mesh_peers` to get fresh peer IDs.

### File lock stuck

**Symptom:** A file lock persists after the session that created it ended.

**Fix:** Locks auto-expire after the TTL (default: 10 minutes). If you need to clear immediately:
```bash
# Via CLI (if you know the peer ID)
slm-mesh lock list    # Find the lock
# The lock will expire on its own

# Or restart the broker (clears all state)
slm-mesh stop && slm-mesh start
```

### High memory usage from SLM processes

**Symptom:** Python processes consuming gigabytes of memory.

**Note:** This is a SuperLocalMemory issue, not SLM Mesh. If SLM auto-observe hooks are triggering many embedding workers:
```bash
# Disable SLM hooks temporarily
touch ~/.superlocalmemory/.hooks-disabled

# Kill existing workers
pkill -f "embedding_worker"
```

### Bearer token errors (401)

**Symptom:** CLI or MCP tools return "Unauthorized" errors.

**Cause:** The broker token was regenerated (broker restarted) but the client cached the old token.

**Fix:** The CLI and MCP server read the token from disk on each request, so this should auto-resolve. If not:
```bash
# Check the token file exists
cat ~/.slm-mesh/broker.token

# Restart your AI agent session to force re-registration
```

## Diagnostic Commands

```bash
# Full system check
slm-mesh status --json

# Check active peers
slm-mesh peers --json

# Check active locks
slm-mesh lock list --json

# Check recent events
slm-mesh events --json

# Clean up zombie processes
slm-mesh clean
```

## Log Files

Broker logs are at `~/.slm-mesh/broker.log`. They include:
- Startup and shutdown events
- Peer registration and deregistration
- Error details
- Heartbeat failures

```bash
tail -f ~/.slm-mesh/broker.log
```

## Getting Help

Open an issue at [github.com/qualixar/slm-mesh/issues](https://github.com/qualixar/slm-mesh/issues).
