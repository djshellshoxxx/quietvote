// Authenticated, independently cosigned log evidence for production UI fixtures.
import { bytesToHex } from '@quietvote/crypto';
import { type ElectionBundle } from '@quietvote/protocol';
import { buildBoard, typeAndAuthor, isoSec, witnessKeys, type Head } from '../../../protocol/test/helpers/board.ts';
import { kp, type Sim } from '../../../protocol/test/helpers/sim.ts';

export function fixtureWitnesses(seed: string) {
  return witnessKeys(seed).slice(0, 2).map((k, i) => ({ name: `w${i + 1}`, pk: bytesToHex(k.publicKey) }));
}
export function witnessedBoard(sim: Sim, bundle: ElectionBundle, extraAuthor?: ReturnType<typeof kp>): unknown {
  const seed = sim.manifest.title.replace('Test election ', '');
  const keys = witnessKeys(seed).slice(0, 2);
  const cos = (ts: number) => keys.map((key, i) => ({ name: `w${i + 1}`, key, ts }));
  const marker = (name: string) => bundle.log.find((r) => (r.entry as any).body?.name === name)!.seq;
  const open = marker('election-open'), close = marker('election-close'), size = bundle.log.at(-1)!.seq + 1;
  const start = isoSec(sim.manifest.voting_open), end = isoSec(sim.manifest.voting_close);
  const heads: Head[] = [
    { size: open, cosigs: cos(start - 3600) },
    { size: close, cosigs: cos(start + 3600) },
    { size: close + 1, cosigs: cos(end + 60) },
    ...(size > close + 1 ? [{ size, cosigs: cos(end + 120) }] : []),
  ];
  return buildBoard(sim, bundle, heads, { logKey: kp(seed, 'log'), author: (rec, manifest) => extraAuthor && rec.body?.type === 'tally-aggregate' ? ['tally_aggregate', extraAuthor] : typeAndAuthor(sim, rec, manifest) }).json;
}
