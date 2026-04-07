/**
 * SLM Mesh — MemoryBridge Interface
 * Defines the contract for integrating with external memory systems.
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import type { Message, StateEntry, MeshEvent } from '../types.js';

export interface MemoryBridge {
  /** Called when a new message is sent/received in the mesh. */
  onMessage(msg: Message): Promise<void>;

  /** Called when shared state changes. */
  onStateChange(entry: StateEntry): Promise<void>;

  /** Called when a system event is emitted. */
  onEvent(event: MeshEvent): Promise<void>;

  /** Query the memory system for relevant context. */
  recall(query: string): Promise<string[]>;

  /** Returns true if the underlying memory system is available. */
  isAvailable(): boolean;
}
