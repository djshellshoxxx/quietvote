// SPDX-License-Identifier: AGPL-3.0-or-later
// Local high-water evidence is independent of election.sqlite, but not of a whole-disk rollback.
import { BoardLog } from '@quietvote/board';
import type { ControlDb, RuntimeAnchor } from './controldb.ts';
import type { ElectionDb } from './electiondb.ts';

export function anchorMatches(anchor: RuntimeAnchor | undefined, origin: string, logPk: Uint8Array, log: Pick<BoardLog, 'size' | 'root'>): boolean {
  return anchor === undefined || (anchor.conflicted === 0 && anchor.origin === origin && Buffer.from(anchor.log_pk).equals(logPk) &&
    anchor.tree_size <= log.size && Buffer.from(anchor.root).equals(log.root(anchor.tree_size)));
}

/** The event bridge must not expose a committed checkpoint before its independent floor is durable. */
export function anchoredEvents(control: ControlDb, db: ElectionDb): boolean {
  const row = db.row();
  if (row.imported === 1) return true; // A mirror never asserts ownership of another log's signing history.
  const anchor = control.runtimeAnchor(row.election_id);
  const size = db.store.size();
  if (size === 0) return anchor === undefined || (anchor.tree_size === 0 && anchor.conflicted === 0);
  if (!anchor || anchor.tree_size !== size) return false;
  const log = new BoardLog({ origin: row.origin, store: db.store, publicKey: row.log_pk, clock: () => 0 });
  return log.status.state === 'ok' && anchorMatches(anchor, row.origin, row.log_pk, log);
}
