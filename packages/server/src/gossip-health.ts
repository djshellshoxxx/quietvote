// Operational contact health, separate from cryptographic fork evidence and election integrity.
import { createHash } from 'node:crypto';
import type { Env } from './env.ts';

export const gossipPeerId = (peer: string): string => createHash('sha256').update(peer.replace(/\/+$/, '')).digest('hex');

export function gossipHealthStatus(env: Env): Record<string, unknown> {
  const ids = new Set(env.cfg.gossipPeers.map(gossipPeerId));
  const rows = env.control.gossipHealth();
  const staleAfter = Math.max(3 * (env.cfg.gossipIntervalMs || 60_000), 2 * env.cfg.gossipTimeoutMs);
  const now = env.nowMs();
  const peers = rows.filter((row) => ids.has(row.peer_id)).map((row) => {
    const stale = row.last_success_at === null || now < row.last_success_at || now - row.last_success_at > staleAfter;
    return { ...row, stale, healthy: !stale && row.consecutive_failures === 0 };
  });
  const sweep = rows.find((row) => row.peer_id === 'scheduler') ?? null;
  return { configured_peers: ids.size, healthy_peers: peers.filter((row) => row.healthy).length,
    stale_peers: peers.filter((row) => row.stale).length, stale_after_ms: staleAfter,
    scheduler_enabled: ids.size > 0 && env.cfg.gossipIntervalMs > 0, peers, sweep };
}
