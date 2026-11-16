// Connected organizer actions over the existing record contracts. The pin comes from
// the organizer, never from the response being checked. Server admission remains final.
import { authorKeyId, checkEntry, type EntryType } from '@quietvote/board';
import { bytesToHex, hexToBytes, jcs, parseQvJson, systemRng, utf8, type Rng } from '@quietvote/crypto';
import {
  PROTO_ID, S, check, logOrigin, manifestHash, manifestSchema, recordDigest, rollRoot, tallySchema,
  validateManifest, verifyElection, verifyMultiSig,
  type ElectionBundle, type Manifest, type MarkerBody, type MultiSignedRecord, type RollCommitBody, type TallyBody,
} from '@quietvote/protocol';
import type { ApiClient } from '../api/client.ts';
import type { AppendResult } from '../api/types.ts';
import type { Signer } from '../key/signer.ts';
import { b64uDecode } from '../util/hex.ts';
import { deriveElectionContext } from './election.ts';
import { prepareEntry } from './entries.ts';
import { signMulti } from './organizer.ts';

export const ADMIN_ACTIONS = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final', 'roll-commit', 'election-open', 'election-close', 'tally'] as const;
export type AdminAction = typeof ADMIN_ACTIONS[number];
export interface AdminSnapshot { election: ElectionBundle; manifest: Manifest; pin: string }
export interface AdminPacket { header: string; body: string }
export const MAX_ADMIN_BYTES = 1024 * 1024;
const MARKERS = ADMIN_ACTIONS.slice(0, 6) as readonly MarkerBody['name'][];
const ENTRY: Record<AdminAction, EntryType> = {
  'dkg-open': 'ceremony_start', 'dkg-r1-open': 'notice', 'dkg-r1-close': 'notice', 'dkg-r2-close': 'notice',
  'dkg-r3-close': 'notice', 'dkg-final': 'joint_key', 'roll-commit': 'roll_commit',
  'election-open': 'election_open', 'election-close': 'election_close', tally: 'tally_result',
};
export class AdminError extends Error {
  readonly code: 'input' | 'pin' | 'state' | 'key' | 'tally' | 'stale';
  constructor(code: AdminError['code']) { super(code); this.code = code; }
}

/** Content evidence only. Board freshness/witness qualification is separate. */
export function adminSnapshot(input: unknown, pin: string, electionId: string): AdminSnapshot {
  if (!/^[0-9a-f]{64}$/.test(pin)) throw new AdminError('pin');
  if (input === null || typeof input !== 'object') throw new AdminError('input');
  let e: ElectionBundle;
  try {
    const text = JSON.stringify(input);
    if (utf8(text).length > 64 * 1024 * 1024) throw new Error('size');
    e = parseQvJson(text) as unknown as ElectionBundle;
  } catch { throw new AdminError('input'); }
  if (!Array.isArray(e.roll) || e.roll.length > 10000 || !Array.isArray(e.log) || e.log.length > 10000 ||
      check(S.multiSigned(manifestSchema()), e.manifest) !== null) throw new AdminError('input');
  const m = e.manifest.body;
  if (!validateManifest(m, m.roll.size ?? e.roll.length).ok || !rollRoot(e.roll).ok) throw new AdminError('input');
  const mh = manifestHash(m);
  if (m.election_id !== electionId || e.manifest_hash !== pin || bytesToHex(mh) !== pin ||
      !verifyMultiSig(mh, e.manifest, m.coordinator.keys, m.coordinator.m)) throw new AdminError('pin');
  let previous = 0;
  for (const row of e.log) {
    if (row === null || typeof row !== 'object' || !Number.isSafeInteger(row.seq) || row.seq <= previous) throw new AdminError('input');
    previous = row.seq;
  }
  return { election: e, manifest: m, pin };
}

function manifestRecords(s: AdminSnapshot): { markers: Map<string, number>; roll?: { seq: number; body: RollCommitBody } } {
  const markers = new Map<string, number>();
  let roll: { seq: number; body: RollCommitBody } | undefined;
  const mh = hexToBytes(s.pin, 32), m = s.manifest;
  for (const { seq, entry } of s.election.log) {
    const r = entry as MultiSignedRecord<MarkerBody | RollCommitBody> | undefined;
    if (r?.body?.type === 'marker' && MARKERS.includes(r.body.name)) {
      if (check(S.multiSigned(S.marker), r) !== null || !verifyMultiSig(mh, r, m.coordinator.keys, m.coordinator.m) || markers.has(r.body.name)) throw new AdminError('state');
      markers.set(r.body.name, seq);
    }
    if (r?.body?.type === 'roll-commit') {
      if (roll || check(S.multiSigned(S.rollCommit), r) !== null || !verifyMultiSig(mh, r, m.coordinator.keys, m.coordinator.m)) throw new AdminError('state');
      roll = { seq, body: r.body };
    }
  }
  let previous = -1, missing = false;
  for (const name of MARKERS) {
    const seq = markers.get(name);
    if (seq === undefined) { missing = true; continue; }
    if (missing || seq <= previous) throw new AdminError('state');
    previous = seq;
  }
  return { markers, ...(roll ? { roll } : {}) };
}

/** Builds only existing coordinator actions; never accepts arbitrary text to sign. */
export async function prepareAdminAction(i: {
  snapshot: AdminSnapshot; action: AdminAction; signer: Signer;
  tally?: unknown; rng?: Rng; now?: number; current?: () => boolean;
}): Promise<{ packet: AdminPacket; record: unknown }> {
  const { action, signer } = i;
  // Detached checked data also prevents mutation during asynchronous verification.
  const s = adminSnapshot(i.snapshot.election, i.snapshot.pin, i.snapshot.manifest.election_id);
  const m = s.election.manifest.body, mh = hexToBytes(s.pin, 32), pk = bytesToHex(signer.publicKey);
  if (!ADMIN_ACTIONS.includes(action) || !m.coordinator.keys.includes(pk) || m.coordinator.m !== 1) throw new AdminError('key');
  const current = (): void => { if (i.current?.() === false) throw new AdminError('stale'); };
  current();
  const state = manifestRecords(s);
  const records = [{ seq: 0, record: s.election.manifest }, ...s.election.log.map((e) => ({ seq: e.seq, record: e.entry }))];
  let scope = mh;
  let body: MarkerBody | RollCommitBody | TallyBody;
  if (MARKERS.includes(action as MarkerBody['name'])) {
    if (MARKERS.find((n) => !state.markers.has(n)) !== action) throw new AdminError('state');
    if (action === 'dkg-final') {
      const context = await deriveElectionContext(records, s.pin, s.election.roll.length, { allowMissingFinal: true });
      if (!context.ok || context.value.decrypters.size < m.t) throw new AdminError('state');
    }
    body = { proto: PROTO_ID, type: 'marker', name: action as MarkerBody['name'] };
  } else if (action === 'roll-commit') {
    const root = rollRoot(s.election.roll);
    if (state.roll || !state.markers.has('dkg-final') || !root.ok ||
        (m.roll.root !== undefined && (bytesToHex(root.value) !== m.roll.root || s.election.roll.length !== m.roll.size))) throw new AdminError('state');
    body = { proto: PROTO_ID, type: 'roll-commit', root: bytesToHex(root.value), size: s.election.roll.length };
  } else {
    const context = await deriveElectionContext(records, s.pin, s.election.roll.length);
    if (!context.ok) throw new AdminError('state');
    const c = context.value;
    scope = c.params.ctx;
    const now = i.now ?? Math.floor(Date.now() / 1000);
    if (action === 'election-open') {
      if (c.phase !== 'ready' || !state.roll || now < Date.parse(m.voting_open) / 1000 - m.clock_skew_s) throw new AdminError('state');
      const rr = rollRoot(s.election.roll);
      if (!rr.ok || state.roll.body.root !== bytesToHex(rr.value) || state.roll.body.size !== s.election.roll.length) throw new AdminError('state');
      body = { proto: PROTO_ID, type: 'marker', name: 'election-open', manifest_hash: s.pin,
        joint_key_seq: state.markers.get('dkg-final')!, roll_commit_seq: state.roll.seq };
    } else if (action === 'election-close') {
      if (c.phase !== 'open' || now < Date.parse(m.voting_close) / 1000) throw new AdminError('state');
      body = { proto: PROTO_ID, type: 'marker', name: 'election-close' };
    } else {
      if (c.phase !== 'closed' || check(tallySchema(), i.tally) !== null) throw new AdminError('tally');
      body = parseQvJson(jcs(i.tally)) as unknown as TallyBody;
      if (body.ctx !== bytesToHex(scope)) throw new AdminError('tally');
    }
  }
  current();
  const record = action === 'tally'
    ? { body, sig: { key: pk, sig: bytesToHex(await signer.sign(recordDigest(scope, body.type, body))) } }
    : await signMulti(signer, scope, body);
  current();
  if (action === 'tally') {
    const report = await verifyElection({ ...s.election, log: [...s.election.log, { seq: (s.election.log.at(-1)?.seq ?? 0) + 1, entry: record }] });
    if (report.verdict !== 'PASS' || report.checks['chk.tally.aggregate'] !== 'pass' || report.checks['chk.tally.decrypt'] !== 'pass' || report.checks['chk.result.rules'] !== 'pass') throw new AdminError('tally');
  }
  current();
  const prepared = await prepareEntry({ signer, origin: logOrigin(m), type: ENTRY[action], record, rng: i.rng ?? systemRng, now: i.now ?? Math.floor(Date.now() / 1000) });
  current();
  return { packet: { header: prepared.headerB64u, body: prepared.bodyB64u }, record };
}

/** Parse a public qv-trustee export-entry packet; never handles secret trustee bundles. */
export function trusteePacket(text: string, snapshot: AdminSnapshot): AdminPacket {
  const s = adminSnapshot(snapshot.election, snapshot.pin, snapshot.manifest.election_id);
  if (utf8(text).length > MAX_ADMIN_BYTES) throw new AdminError('input');
  let packet: AdminPacket;
  try { packet = parseQvJson(text) as unknown as AdminPacket; } catch { throw new AdminError('input'); }
  if (packet === null || typeof packet !== 'object' || Object.keys(packet).sort().join(',') !== 'body,header' || typeof packet.header !== 'string' || typeof packet.body !== 'string') throw new AdminError('input');
  const header = b64uDecode(packet.header), body = b64uDecode(packet.body);
  if (!header || !body) throw new AdminError('input');
  const keys = new Map(s.manifest.trustees.map((t) => {
    const key = hexToBytes(t.sign_pk, 32); return [bytesToHex(authorKeyId('ed25519', key)), key];
  }));
  const checked = checkEntry(header, body, logOrigin(s.manifest), (h) => keys.get(bytesToHex(h.author)), 0);
  if (!checked.ok || !(['dkg_round1', 'dkg_round2', 'dkg_complaint', 'key_confirm', 'decryption_share'] as string[]).includes(checked.value.type)) throw new AdminError('input');
  return { header: packet.header, body: packet.body };
}

/** Single POST only. Callers retain this public packet if delivery is uncertain. */
export async function submitAdminPacket(client: Pick<ApiClient, 'postEntry'>, id: string, packet: AdminPacket): Promise<AppendResult> {
  const result = await client.postEntry(id, packet.header, packet.body);
  if (result?.status !== 'included' && result?.status !== 'sequenced') throw new AdminError('input');
  return result;
}
