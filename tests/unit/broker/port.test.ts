/**
 * SLM Mesh — Port discovery and conflict resolution tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { createConfig, type MeshConfig } from '../../../src/config.js';
import {
  discoverPort,
  writePortFile,
  readPortFile,
  removePortFile,
  findAvailablePort,
} from '../../../src/broker/port.js';

describe('port', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slm-port-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean env
    delete process.env['SLM_MESH_PORT'];
  });

  // --- discoverPort ---

  describe('discoverPort', () => {
    it('returns env var when set', () => {
      process.env['SLM_MESH_PORT'] = '9999';
      const config = createConfig({ dataDir: tmpDir });
      expect(discoverPort(config)).toBe(9999);
    });

    it('returns port file value when exists (no env)', () => {
      delete process.env['SLM_MESH_PORT'];
      const portPath = join(tmpDir, 'broker.port');
      writeFileSync(portPath, '8888');
      const config = createConfig({ dataDir: tmpDir, portPath });
      expect(discoverPort(config)).toBe(8888);
    });

    it('returns default 7899 when no env and no port file', () => {
      delete process.env['SLM_MESH_PORT'];
      const config = createConfig({ dataDir: tmpDir, portPath: join(tmpDir, 'nope.port') });
      expect(discoverPort(config)).toBe(7899);
    });
  });

  // --- writePortFile / readPortFile ---

  describe('writePortFile / readPortFile', () => {
    it('round-trips port value', () => {
      const portPath = join(tmpDir, 'broker.port');
      writePortFile(portPath, 4567);
      expect(readPortFile(portPath)).toBe(4567);
    });

    it('readPortFile returns null for missing file', () => {
      expect(readPortFile(join(tmpDir, 'nope.port'))).toBeNull();
    });

    it('readPortFile returns null for invalid content', () => {
      const portPath = join(tmpDir, 'broker.port');
      writeFileSync(portPath, 'garbage');
      expect(readPortFile(portPath)).toBeNull();
    });
  });

  // --- removePortFile ---

  describe('removePortFile', () => {
    it('removes existing port file', () => {
      const portPath = join(tmpDir, 'broker.port');
      writeFileSync(portPath, '1234');
      removePortFile(portPath);
      expect(readPortFile(portPath)).toBeNull();
    });

    it('does not throw for missing file', () => {
      expect(() => removePortFile(join(tmpDir, 'nope.port'))).not.toThrow();
    });
  });

  // --- findAvailablePort ---

  describe('findAvailablePort', () => {
    it('finds an open port', async () => {
      const port = await findAvailablePort(49152, '127.0.0.1', 10);
      expect(port).toBeGreaterThanOrEqual(49152);
      expect(port).toBeLessThanOrEqual(49162);
    });

    it('skips ports in use', async () => {
      // Occupy a port
      const server = createServer();
      const occupied = await new Promise<number>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr !== 'string') {
            resolve(addr.port);
          } else {
            reject(new Error('No address'));
          }
        });
      });

      try {
        const found = await findAvailablePort(occupied, '127.0.0.1', 5);
        // Should get a port > occupied since occupied is taken
        expect(found).toBeGreaterThan(occupied);
      } finally {
        server.close();
      }
    });

    it('throws when all ports exhausted', async () => {
      // Create servers on 3 consecutive ports
      const base = 59100;
      const servers: ReturnType<typeof createServer>[] = [];
      for (let i = 0; i < 3; i++) {
        const srv = createServer();
        await new Promise<void>((resolve) => {
          srv.listen(base + i, '127.0.0.1', () => resolve());
        });
        servers.push(srv);
      }

      try {
        await expect(findAvailablePort(base, '127.0.0.1', 3)).rejects.toThrow(
          /no available port/i,
        );
      } finally {
        for (const srv of servers) {
          srv.close();
        }
      }
    });
  });
});
