/**
 * SLM Mesh — Core Type Definitions
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

// --- Branded ID types ---

export type PeerId = string;
export type MessageId = string;
export type EventId = string;

// --- Enums ---

export type PeerStatus = 'active' | 'stale' | 'dead';
export type MessageType = 'text' | 'json' | 'command' | 'alert';
export type AgentType =
  | 'claude-code'
  | 'cursor'
  | 'aider'
  | 'codex'
  | 'windsurf'
  | 'vscode'
  | 'unknown';
export type PeerScope = 'machine' | 'directory' | 'repo';
export type LockAction = 'lock' | 'unlock' | 'query';
export type StateAction = 'get' | 'set' | 'list' | 'delete';
export type EventAction = 'read' | 'subscribe' | 'unsubscribe';

// --- Domain Objects ---

export interface Peer {
  readonly id: PeerId;
  readonly name: string;
  readonly pid: number;
  readonly projectPath: string;
  readonly gitRoot: string | null;
  readonly gitBranch: string | null;
  readonly agentType: AgentType;
  readonly summary: string;
  readonly udsPath: string | null;
  readonly startedAt: string;
  readonly lastHeartbeat: string;
  readonly status: PeerStatus;
}

export interface Message {
  readonly id: MessageId;
  readonly fromPeer: PeerId;
  readonly toPeer: PeerId | null;
  readonly type: MessageType;
  readonly payload: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly delivered: boolean;
}

export interface StateEntry {
  readonly key: string;
  readonly namespace: string;
  readonly value: string;
  readonly updatedBy: PeerId;
  readonly updatedAt: string;
}

export interface Lock {
  readonly filePath: string;
  readonly lockedBy: PeerId;
  readonly lockedAt: string;
  readonly expiresAt: string;
  readonly reason: string;
}

export interface MeshEvent {
  readonly id: EventId;
  readonly type: string;
  readonly payload: string;
  readonly emittedBy: PeerId;
  readonly createdAt: string;
}

// --- Broker Status ---

export interface BrokerStatus {
  readonly status: 'ok';
  readonly version: string;
  readonly uptime: number;
  readonly pid: number;
  readonly port: number;
  readonly peers: {
    readonly active: number;
    readonly stale: number;
    readonly total: number;
  };
  readonly messages: {
    readonly total: number;
    readonly undelivered: number;
  };
  readonly locks: {
    readonly active: number;
  };
  readonly events: {
    readonly total: number;
  };
  readonly db: {
    readonly sizeBytes: number;
    readonly walSizeBytes: number;
  };
}

// --- Push Notifications ---

export interface PushNotification {
  readonly type: 'message' | 'event' | 'peer_update' | 'lock_update' | 'shutdown';
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

// --- API Request/Response ---

export interface ApiResponse<T = unknown> {
  readonly ok: boolean;
  readonly error?: string;
  readonly data?: T;
}

// --- Registration ---

export interface PeerRegistration {
  readonly pid: number;
  readonly projectPath: string;
  readonly gitRoot?: string;
  readonly gitBranch?: string;
  readonly agentType?: AgentType;
  readonly name?: string;
  readonly udsPath?: string;
}

// --- Message Filter ---

export interface MessageFilter {
  readonly filter?: 'unread' | 'all';
  readonly from?: PeerId;
  readonly limit?: number;
}

// --- Event Filter ---

export interface EventFilter {
  readonly types?: string[];
  readonly since?: string;
  readonly limit?: number;
}

// --- DB Row Types (snake_case, matching SQL) ---

export interface PeerRow {
  readonly id: string;
  readonly name: string;
  readonly pid: number;
  readonly project_path: string;
  readonly git_root: string | null;
  readonly git_branch: string | null;
  readonly agent_type: string;
  readonly summary: string;
  readonly uds_path: string | null;
  readonly started_at: string;
  readonly last_heartbeat: string;
  readonly status: string;
}

export interface MessageRow {
  readonly id: string;
  readonly from_peer: string;
  readonly to_peer: string | null;
  readonly type: string;
  readonly payload: string;
  readonly created_at: string;
  readonly read_at: string | null;
  readonly delivered: number; // 0 or 1 — map to boolean
}

export interface StateRow {
  readonly key: string;
  readonly namespace: string;
  readonly value: string;
  readonly updated_by: string;
  readonly updated_at: string;
}

export interface LockRow {
  readonly file_path: string;
  readonly locked_by: string;
  readonly locked_at: string;
  readonly expires_at: string;
  readonly reason: string;
}

export interface EventRow {
  readonly id: string;
  readonly type: string;
  readonly payload: string;
  readonly emitted_by: string;
  readonly created_at: string;
}

// --- Row Mappers (snake_case → camelCase) ---

export function peerFromRow(row: PeerRow): Peer {
  return {
    id: row.id,
    name: row.name,
    pid: row.pid,
    projectPath: row.project_path,
    gitRoot: row.git_root,
    gitBranch: row.git_branch,
    agentType: row.agent_type as AgentType,
    summary: row.summary,
    udsPath: row.uds_path,
    startedAt: row.started_at,
    lastHeartbeat: row.last_heartbeat,
    status: row.status as PeerStatus,
  };
}

export function messageFromRow(row: MessageRow): Message {
  return {
    id: row.id,
    fromPeer: row.from_peer,
    toPeer: row.to_peer,
    type: row.type as MessageType,
    payload: row.payload,
    createdAt: row.created_at,
    readAt: row.read_at,
    delivered: row.delivered === 1,
  };
}

export function stateFromRow(row: StateRow): StateEntry {
  return {
    key: row.key,
    namespace: row.namespace,
    value: row.value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function lockFromRow(row: LockRow): Lock {
  return {
    filePath: row.file_path,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    expiresAt: row.expires_at,
    reason: row.reason,
  };
}

export function eventFromRow(row: EventRow): MeshEvent {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    emittedBy: row.emitted_by,
    createdAt: row.created_at,
  };
}
