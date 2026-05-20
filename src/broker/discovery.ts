/**
 * SLM Mesh — mDNS Discovery (Bonjour)
 * Announces the broker on LAN and discovers other brokers.
 * Apple-native Bonjour protocol. Zero-config.
 * Part of the Qualixar research initiative
 */

import { log, logError } from '../util/logger.js';

export interface DiscoveredBroker {
  host: string;
  port: number;
  wsPort: number;
  name: string;
}

export interface DiscoveryService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getDiscoveredBrokers(): DiscoveredBroker[];
  onDiscover(callback: (broker: DiscoveredBroker) => void): void;
}

// Inline types for bonjour (no @types/bonjour available)
interface BonjourService {
  name: string;
  host?: string;
  port: number;
  addresses?: string[];
  txt?: Record<string, string>;
  stop(): void;
}
interface BonjourBrowser {
  on(event: 'up', cb: (svc: BonjourService) => void): void;
  on(event: 'down', cb: (svc: BonjourService) => void): void;
  stop(): void;
}
interface BonjourInstance {
  publish(opts: Record<string, unknown>): BonjourService;
  find(opts: Record<string, unknown>): BonjourBrowser;
  destroy(): void;
}

const SERVICE_TYPE = '_slm-mesh._tcp';

export function createDiscovery(
  _host: string,
  httpPort: number,
  wsPort: number,
): DiscoveryService {
  let bonjourInstance: BonjourInstance | null = null;
  let service: BonjourService | null = null;
  let browser: BonjourBrowser | null = null;
  const discovered: DiscoveredBroker[] = [];
  const callbacks: Array<(broker: DiscoveredBroker) => void> = [];

  async function start(): Promise<void> {
    try {
      const BonjourClass = (await import('bonjour')).default;
      bonjourInstance = BonjourClass() as unknown as BonjourInstance;

      service = bonjourInstance.publish({
        name: `SLM-Mesh-${httpPort}`,
        type: SERVICE_TYPE,
        port: httpPort,
        txt: { wsPort: String(wsPort), version: '1.3.0' },
      });

      browser = bonjourInstance.find({ type: SERVICE_TYPE });
      browser.on('up', (svc: BonjourService) => {
        const broker: DiscoveredBroker = {
          host: svc.host ?? svc.addresses?.[0] ?? 'unknown',
          port: svc.port,
          wsPort: parseInt(svc.txt?.wsPort ?? '0', 10) || svc.port + 1,
          name: svc.name,
        };
        const existingIdx = discovered.findIndex(
          (d) => d.host === broker.host && d.port === broker.port,
        );
        if (existingIdx >= 0) {
          discovered[existingIdx] = broker;
        } else {
          discovered.push(broker);
        }
        for (const cb of callbacks) cb(broker);
        log(`Discovered broker: ${broker.name} at ${broker.host}:${broker.port}`);
      });

      browser.on('down', (svc: BonjourService) => {
        const host = svc.host ?? svc.addresses?.[0] ?? 'unknown';
        const idx = discovered.findIndex((d) => d.host === host && d.port === svc.port);
        if (idx >= 0) discovered.splice(idx, 1);
      });

      log(`mDNS discovery started for ${SERVICE_TYPE}`);
    } catch (err) {
      logError('mDNS discovery failed to start', err);
    }
  }

  async function stop(): Promise<void> {
    try {
      service?.stop();
      browser?.stop();
      bonjourInstance?.destroy();
    } catch { /* best effort */ }
    discovered.length = 0;
  }

  function getDiscoveredBrokers(): DiscoveredBroker[] {
    return [...discovered];
  }

  function onDiscover(callback: (broker: DiscoveredBroker) => void): void {
    callbacks.push(callback);
  }

  return { start, stop, getDiscoveredBrokers, onDiscover };
}
