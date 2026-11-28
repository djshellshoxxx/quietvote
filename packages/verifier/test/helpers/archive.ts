// SPDX-License-Identifier: AGPL-3.0-or-later
// Test-only signed election and the current reference-server archive layout.
import { createHash } from 'node:crypto';
import { b64u, parseCheckpoint, writeTar } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { PROTO_ID, signRecord, type ElectionBundle } from '@quietvote/protocol';
import { buildLogView, type EntryOverride } from '../../../protocol/test/vecgen/logboard.ts';
import { isoSec, witnessKeys, type Head } from '../../../protocol/test/helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, publishTally, setup } from '../../../protocol/test/helpers/sim.ts';

export type Files = Map<string, Uint8Array>;
export const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
export const jsonBytes = (value: unknown): Uint8Array => encode(JSON.stringify(value));
export const jsonFile = (files: Files, name: string): any => JSON.parse(new TextDecoder().decode(files.get(name)!));
export const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

export function seal(files: Files): Uint8Array {
  const copy = new Map(files);
  copy.delete('SHA256SUMS');
  copy.set('SHA256SUMS', encode([...copy].sort(([a], [b]) => a < b ? -1 : 1).map(([name, bytes]) => `${digest(bytes)}  ${name}`).join('\n') + '\n'));
  return writeTar([...copy].map(([name, data]) => ({ name, data })));
}

export function archiveFiles(content: ElectionBundle, board: Record<string, unknown>, metadata: Record<string, unknown> = {}): Files {
  const entries = encode((board['entries'] as unknown[]).map((row) => JSON.stringify(row)).join('\n') + '\n');
  const files: Files = new Map([
    ['log/entries.jsonl', entries], ['election.json', jsonBytes(content)],
    ['witness/policy.json', jsonBytes(board['policy'])], ['redactions.json', jsonBytes(board['redactions'])],
    ['bundle.json', jsonBytes({ ...Object.fromEntries(['format', 'origin', 'created_at', 'tree_size', 'root_b64', 'generator', 'spec'].map((key) => [key, board[key]])),
      entries_sha256: digest(entries), log_pk_b64u: b64u(Buffer.from((board['policy'] as { log_pk_b64: string }).log_pk_b64, 'base64')), ...metadata })],
    ['README.txt', encode('Test fixture, not a real election.\n')],
  ]);
  for (const note of board['checkpoints'] as string[]) {
    const parsed = parseCheckpoint(note);
    if (!parsed.ok) throw new Error('fixture checkpoint is invalid');
    files.set(`log/checkpoints/${parsed.value.size}.txt`, encode(note));
  }
  return files;
}

export function resealEntries(files: Files): void {
  const meta = jsonFile(files, 'bundle.json');
  meta.entries_sha256 = digest(files.get('log/entries.jsonl')!);
  files.set('bundle.json', jsonBytes(meta));
}

/** Cryptography is real. The optional supplemental author must still be pinned by the verifier caller. */
export async function archiveFixture(options: { supplemental?: boolean; tally?: boolean } = {}) {
  const seed = `archive-reader-${options.supplemental === true}`;
  const witnesses = witnessKeys(seed).slice(0, 2);
  const sim = await setup({ seed, n: 2, t: 2, voters: 3, boundLog: true, witnessQuorum: 2,
    witnesses: witnesses.map((key, i) => ({ name: `w${i + 1}`, pk: bytesToHex(key.publicKey) })),
    contests: defaultContests().filter((contest) => contest.id === 'budget') });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: [i === 2 ? 'no' : 'yes'] });
  closeElection(sim);
  if (options.tally !== false) publishTally(sim, [1, 2]);
  let content: ElectionBundle = bundleOf(sim);
  const extra = kp(seed, 'supplemental-author');
  const overrides = new Map<number, EntryOverride>();
  if (options.supplemental === true) {
    const tally = content.log.at(-1)!;
    const entry = signRecord(extra.secretKey, extra.publicKey, sim.mh, { proto: PROTO_ID, type: 'server-evidence', purpose: 'archive test' });
    content = { ...content, log: [...content.log.slice(0, -1), { seq: tally.seq, entry }, { ...tally, seq: tally.seq + 1 }] };
    overrides.set(tally.seq, { type: 'tally_aggregate', author: extra });
  }
  const cos = (ts: number) => witnesses.map((key, i) => ({ name: `w${i + 1}`, key, ts }));
  const start = isoSec(sim.manifest.voting_open), end = isoSec(sim.manifest.voting_close);
  const heads: Head[] = [
    { size: sim.openSeq!, cosigs: cos(start - 3600) },
    { size: sim.closeSeq!, cosigs: cos(start + 3600) },
    { size: sim.closeSeq! + 1, cosigs: cos(end + 60) },
  ];
  if (options.tally !== false) heads.push({ size: content.log.at(-1)!.seq + 1, cosigs: cos(end + 120) });
  const board = buildLogView(sim, content, heads, kp(seed, 'log'), overrides).json;
  board['policy'] = { log_pk_b64: Buffer.from(kp(seed, 'log').publicKey).toString('base64'), witness_policy: {
    quorum: 2, none_acknowledged: false, witnesses: witnesses.map((key, i) => ({ name: `w${i + 1}`, alg: 'ed25519', pk_b64: Buffer.from(key.publicKey).toString('base64') })),
  } };
  const files = archiveFiles(content, board, { server_pk_b64u: b64u(extra.publicKey), organizer_pk_b64u: b64u(extra.publicKey) });
  return { content, board, files, bytes: seal(files), pin: content.manifest_hash, extraPin: bytesToHex(extra.publicKey),
    manifestSigner: sim.coord[0]!, full: { ...content, board } };
}
