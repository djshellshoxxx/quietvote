// Deterministic Node self-test inputs derived from immutable v1 log-layer fixtures.
// This helper is build/test-only: the distributed corpus contains plain bundles, not executable mutations.
import { readFileSync } from 'node:fs';
import type { ElectionBundle } from '@quietvote/protocol';
import type { CorpusCase } from '../src/canary.ts';

interface BoardJson {
  entries: { seq: number; header_b64u: string; body_b64u: string | null }[];
  checkpoints: string[];
  policy: {
    log_pk_b64: string;
    witness_policy: { quorum: number; none_acknowledged: boolean; witnesses: { name: string; alg: string; pk_b64: string }[] };
  };
  [key: string]: unknown;
}
export type BoardCanaryBundle = ElectionBundle & { board: BoardJson };
interface LogVectors {
  vectors: { id: string; input: { board?: { replace?: { checkpoints?: string[] } } } }[];
}

const root = new URL('../../../test-vectors/v1/elections/log-layer-4v/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, root), 'utf8')) as T;

/** The original signed records and heads, with the export's policy copied from its signed manifest. */
export function boardCanaryControl(): BoardCanaryBundle {
  const bundle = read<ElectionBundle>('bundle.json');
  const board = read<BoardJson>('board.json');
  const bb = bundle.manifest.body.bb;
  if (bb.witnesses === undefined || bb.witnesses.length < bb.witness_quorum || bb.witness_quorum === 0) {
    throw new Error('board canary fixture must have manifest witness anchors and a positive quorum');
  }
  // The frozen export was authored for protocol-layer tests, whose witness anchors come from the manifest.
  // The composed verifier also checks the board layer, so supply the same anchors in its export policy.
  board.policy.witness_policy = {
    quorum: bb.witness_quorum, none_acknowledged: false,
    witnesses: bb.witnesses.map((w) => ({ name: w.name, alg: 'ed25519', pk_b64: Buffer.from(w.pk, 'hex').toString('base64') })),
  };
  return { ...bundle, board };
}

export function boardCanaries(): CorpusCase[] {
  const control = boardCanaryControl();
  const ballotSeqs = control.log.filter(({ entry }) => (entry as { body?: { type?: string } }).body?.type === 'ballot').map(({ seq }) => seq);
  const first = control.board.entries.findIndex((e) => e.seq === ballotSeqs[0]);
  const second = control.board.entries.findIndex((e) => e.seq === ballotSeqs[1]);
  if (first < 0 || second < 0 || first === second) throw new Error('board canary fixture must have two ballot entries');

  const dropped = structuredClone(control);
  dropped.board.entries.splice(first, 1);
  const reordered = structuredClone(control);
  [reordered.board.entries[first], reordered.board.entries[second]] = [reordered.board.entries[second]!, reordered.board.entries[first]!];
  const forked = structuredClone(control);
  const checkpoints = read<LogVectors>('vectors.json').vectors.find((v) => v.id === 'equivocation-two-roots-same-size')?.input.board?.replace?.checkpoints;
  if (checkpoints === undefined || checkpoints.length !== control.board.checkpoints.length + 1
    || !control.board.checkpoints.every((note, i) => checkpoints[i] === note)) {
    throw new Error('board canary fixture must append one signed fork to the original checkpoints');
  }
  forked.board.checkpoints = checkpoints;

  const source = 'elections/log-layer-4v (derived; export witness policy from signed manifest)';
  // Fixed expectations: do not ask the verifier to generate its own oracle. Invalid roots also prevent
  // the existing witness/time gates from passing; these are the actual complete named failure sets.
  const treeChecks = ['chk.board.append_only', 'chk.board.witness', 'chk.time.window'];
  return [
    { id: 'board-ballot-entry-dropped', source, expect: { verdict: 'FAIL', failed_checks: [...treeChecks], codes: ['E_LOG_BINDING', 'E_LOG_FORK'] }, bundle: dropped },
    { id: 'board-ballot-entries-reordered', source, expect: { verdict: 'FAIL', failed_checks: [...treeChecks], codes: ['E_LOG_ORDER', 'E_LOG_FORK'] }, bundle: reordered },
    { id: 'board-checkpoint-fork', source, expect: { verdict: 'FAIL', failed_checks: ['chk.board.append_only', 'chk.board.witness'], codes: ['E_LOG_FORK', 'QV_BOARD_FORK'] }, bundle: forked },
  ];
}
