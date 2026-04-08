/**
 * SLM Mesh -- MCP Server
 * Exposes 8 tools to AI agents via the Model Context Protocol.
 * Communicates with the broker over HTTP.
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import { VERSION, PRODUCT_NAME, createConfig } from '../config.js';
import type { MeshConfig } from '../config.js';
import { ensureBroker } from '../broker/ensure.js';
import { brokerRequest } from './broker-client.js';
import { detectAgentType } from './agent-detect.js';
import { log, logError } from '../util/logger.js';
import { createPeerListener, type PeerListener } from './peer-listener.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Server Instructions ---

const INSTRUCTIONS = `You are connected to the SLM Mesh peer-to-peer network \u2014 part of the Qualixar ecosystem, powered by SuperLocalMemory.

Other AI agent sessions on this machine can discover you and communicate with you in real-time.

ON START: Call mesh_summary to describe what you're working on.
ON MESSAGE: When you receive a pushed message, respond promptly using mesh_send.
BEFORE EDITING: Call mesh_lock action="query" to check if another session has the file locked.
SHARE CONFIG: Use mesh_state to share server IPs, API keys, or status flags across sessions.

8 tools: mesh_peers, mesh_summary, mesh_send, mesh_inbox, mesh_state, mesh_lock, mesh_events, mesh_status

${PRODUCT_NAME} v${VERSION} | qualixar.com | Powered by SuperLocalMemory`;

// --- Types ---

/** @internal Exported for testing */
export interface ServerState {
  readonly peerId: string;
  readonly peerName: string;
  readonly brokerPort: number;
  readonly config: MeshConfig;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  peerListener: PeerListener | null;
}

// --- Tool Result Helpers ---

/** @internal Exported for testing */
export function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** @internal Exported for testing */
export function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}

// --- Safe Broker Request ---

/** @internal Exported for testing */
export async function safeBrokerCall<T>(port: number, path: string, body?: unknown): Promise<T> {
  try {
    return await brokerRequest<T>(port, path, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Broker unavailable: ${msg}`);
  }
}

// --- Tool Registration ---

/** @internal Exported for testing */
export function registerTools(mcp: McpServer, state: ServerState): void {
  const { brokerPort } = state;

  // 1. mesh_peers -- Discover other agents
  mcp.registerTool(
    'mesh_peers',
    {
      title: 'List Mesh Peers',
      description: 'Discover other AI agents connected to the SLM Mesh network. Returns active peers with their names, agent types, and what they are working on.',
      inputSchema: {
        scope: z.enum(['machine', 'directory', 'repo'])
          .describe('Scope of peer discovery: machine (all), directory (same project), repo (same git repo)'),
      },
    },
    async ({ scope }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/peers', {
          scope,
          projectPath: process.cwd(),
          excludeId: state.peerId,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 2. mesh_summary -- Set work description
  mcp.registerTool(
    'mesh_summary',
    {
      title: 'Set Work Summary',
      description: 'Set a summary of what you are currently working on. This is visible to other agents on the mesh so they know your context.',
      inputSchema: {
        summary: z.string().min(1).max(1000)
          .describe('Brief description of your current work (visible to other agents)'),
      },
    },
    async ({ summary }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/summary', {
          peerId: state.peerId,
          summary,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 3. mesh_send -- Send a message
  mcp.registerTool(
    'mesh_send',
    {
      title: 'Send Message',
      description: 'Send a message to another agent on the mesh. Use peer ID from mesh_peers, or "all" to broadcast to everyone.',
      inputSchema: {
        to: z.string().min(1)
          .describe('Peer ID of the recipient, or "all" to broadcast'),
        message: z.string().min(1)
          .describe('Message text to send'),
        type: z.enum(['text', 'json', 'command', 'alert']).optional()
          .describe('Message type (default: text)'),
      },
    },
    async ({ to, message, type }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/send', {
          fromPeer: state.peerId,
          toPeer: to,
          payload: message,
          type: type ?? 'text',
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 4. mesh_inbox -- Check messages
  mcp.registerTool(
    'mesh_inbox',
    {
      title: 'Check Inbox',
      description: 'Check your incoming messages from other agents. Call periodically to stay in sync with your peers.',
      inputSchema: {
        filter: z.enum(['unread', 'all']).optional()
          .describe('Filter messages (default: unread)'),
        from: z.string().optional()
          .describe('Filter by sender peer ID'),
        limit: z.number().int().min(1).max(100).optional()
          .describe('Max messages to return (default: 20)'),
      },
    },
    async ({ filter, from, limit }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/messages', {
          peerId: state.peerId,
          filter: filter ?? 'unread',
          from,
          limit: limit ?? 20,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 5. mesh_state -- Shared key-value state
  mcp.registerTool(
    'mesh_state',
    {
      title: 'Shared State',
      description: 'Read or write shared state across agent sessions. Use for sharing config values, API endpoints, status flags, etc.',
      inputSchema: {
        action: z.enum(['get', 'set', 'list', 'delete'])
          .describe('Action to perform on shared state'),
        key: z.string().optional()
          .describe('State key (required for get, set, delete)'),
        value: z.string().optional()
          .describe('State value (required for set)'),
        namespace: z.string().optional()
          .describe('Namespace to isolate state (default: "default")'),
      },
    },
    async ({ action, key, value, namespace }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/state', {
          action,
          key,
          value,
          namespace: namespace ?? 'default',
          peerId: state.peerId,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 6. mesh_lock -- Distributed file locking
  mcp.registerTool(
    'mesh_lock',
    {
      title: 'File Lock',
      description: 'Acquire, release, or query distributed file locks. ALWAYS query before editing shared files to avoid conflicts with other agents.',
      inputSchema: {
        action: z.enum(['lock', 'unlock', 'query'])
          .describe('Lock action: lock (acquire), unlock (release), query (check status)'),
        filePath: z.string().optional()
          .describe('Absolute path to the file (required for lock/unlock, optional for query to list all)'),
        reason: z.string().optional()
          .describe('Why you need this lock (shown to other agents)'),
        ttlMinutes: z.number().int().min(1).max(60).optional()
          .describe('Lock duration in minutes (default: 10, max: 60)'),
      },
    },
    async ({ action, filePath, reason, ttlMinutes }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/lock', {
          action,
          filePath,
          reason,
          ttlMinutes,
          peerId: state.peerId,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 7. mesh_events -- Event stream
  mcp.registerTool(
    'mesh_events',
    {
      title: 'Mesh Events',
      description: 'Read, subscribe to, or unsubscribe from mesh events. Events include peer joins/leaves, file locks, state changes, and messages.',
      inputSchema: {
        action: z.enum(['read', 'subscribe', 'unsubscribe']).optional()
          .describe('Event action (default: read)'),
        types: z.array(z.string()).optional()
          .describe('Event types to filter/subscribe (e.g., ["peer_joined", "file_locked"])'),
        since: z.string().optional()
          .describe('ISO timestamp to read events after'),
        limit: z.number().int().min(1).max(200).optional()
          .describe('Max events to return (default: 50)'),
      },
    },
    async ({ action, types, since, limit }) => {
      try {
        const result = await safeBrokerCall(brokerPort, '/events', {
          action: action ?? 'read',
          types,
          since,
          limit: limit ?? 50,
          peerId: state.peerId,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // 8. mesh_status -- Health check
  mcp.registerTool(
    'mesh_status',
    {
      title: 'Mesh Status',
      description: 'Check the health and status of the SLM Mesh broker. Shows peer counts, message stats, lock counts, and uptime.',
    },
    async () => {
      try {
        const result = await safeBrokerCall(brokerPort, '/status');
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// --- Heartbeat ---

/** @internal Exported for testing */
export function startHeartbeat(state: ServerState): void {
  state.heartbeatTimer = setInterval(async () => {
    try {
      const result = await brokerRequest<{ ok: boolean; error?: string }>(
        state.brokerPort, '/heartbeat', { peerId: state.peerId },
      );
      // If broker doesn't recognize us (peer was cleaned up), re-register
      if (!result.ok && result.error === 'Peer not found') {
        log('Peer expired — re-registering with broker');
        const reg = await brokerRequest<{ ok: boolean; peerId: string; name: string }>(
          state.brokerPort, '/register', {
            pid: process.pid,
            projectPath: process.cwd(),
            agentType: 'unknown',
            udsPath: state.peerListener?.socketPath,
          },
        );
        if (reg.ok) {
          // Update state with new peer ID (mutable for this recovery case)
          (state as { peerId: string }).peerId = reg.peerId;
          (state as { peerName: string }).peerName = reg.name;
          log(`Re-registered as ${reg.name} (${reg.peerId})`);
        }
      }
    } catch {
      // API-021: Heartbeat failed — broker may have crashed. Attempt respawn.
      logError('Heartbeat failed — attempting broker respawn');
      /* v8 ignore start -- heartbeat respawn only fires on broker crash */
      try {
        const scriptDir = dirname(fileURLToPath(import.meta.url));
        const brokerScript = join(scriptDir, '..', 'broker', 'broker-entry.js');
        const newPort = await ensureBroker(state.config, brokerScript);
        (state as { brokerPort: number }).brokerPort = newPort;
        log(`Broker respawned on port ${newPort}`);
      } catch (respawnErr) {
        logError('Broker respawn failed', respawnErr);
      }
      /* v8 ignore stop */
    }
  }, state.config.heartbeatIntervalMs);
  state.heartbeatTimer.unref();
}

// --- Cleanup ---

/** @internal Exported for testing */
export let cleaningUp = false;

/** @internal Exported for testing */
export function resetCleaningUp(): void {
  cleaningUp = false;
}

/** @internal Exported for testing */
export async function cleanup(state: ServerState): Promise<void> {
  if (cleaningUp) return; // Guard against double cleanup (e.g., SIGINT + SIGTERM)
  cleaningUp = true;

  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  // Stop UDS peer listener
  if (state.peerListener) {
    await state.peerListener.stop();
    state.peerListener = null;
  }

  try {
    await brokerRequest(state.brokerPort, '/unregister', {
      peerId: state.peerId,
    });
  } catch {
    // Broker may already be gone
  }
}

// --- Main Entry Point ---

export async function startMcpServer(configOverrides?: Partial<MeshConfig>): Promise<void> {
  const config = createConfig(configOverrides);

  // 1. Create MCP server
  const mcp = new McpServer(
    { name: 'slm-mesh', version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  // 2. Ensure broker is running (auto-spawn if needed)
  // Resolve broker entry point — broker.js is in the same dist/ directory
  // QA-019: Renamed from __dirname to avoid shadowing Node.js CJS convention
  const mcpDir = dirname(fileURLToPath(import.meta.url));
  const brokerScript = join(mcpDir, 'broker.js');
  const brokerPort = await ensureBroker(config, brokerScript);

  // 3. Detect agent type
  const agentType = detectAgentType();
  log(`Detected agent: ${agentType}`);

  // 4. Create a temporary peer ID for UDS listener (will be replaced by broker-assigned ID)
  const tempPeerId = crypto.randomUUID();

  // 5. Create UDS peer listener for push notifications
  const listener = createPeerListener(tempPeerId, config, /* v8 ignore next */ (notification) => {
    log(`Push notification received: ${JSON.stringify(notification)}`); /* v8 ignore next */
  });
  await listener.start();

  // 6. Register with broker (include udsPath for push delivery)
  const registration = await safeBrokerCall<{ ok: boolean; peerId: string; name: string }>(
    brokerPort,
    '/register',
    {
      pid: process.pid,
      projectPath: process.cwd(),
      agentType,
      udsPath: listener.socketPath,
    },
  );

  /* v8 ignore next 4 -- only when broker explicitly rejects registration */
  if (!registration.ok) {
    await listener.stop();
    throw new Error('Failed to register with broker');
  }

  log(`Registered as ${registration.name} (${registration.peerId})`);

  // 7. Set up state
  const state: ServerState = {
    peerId: registration.peerId,
    peerName: registration.name,
    brokerPort,
    config,
    heartbeatTimer: null,
    peerListener: listener,
  };

  // 6. Register tools
  registerTools(mcp, state);

  // 7. Start heartbeat
  startHeartbeat(state);

  // 8. Connect transport
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  log(`${PRODUCT_NAME} MCP server running on stdio (peer: ${state.peerName})`);

  // 9. Cleanup on exit
  /* v8 ignore start -- signal handler closures */
  const doCleanup = () => void cleanup(state);
  /* v8 ignore stop */
  process.on('SIGINT', doCleanup);
  process.on('SIGTERM', doCleanup);
}
