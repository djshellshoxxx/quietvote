// SPDX-License-Identifier: AGPL-3.0-or-later
// Unsigned coordinator proposals from an authenticated public snapshot. No signing, POST or policy changes.
import { writeFileSync } from 'node:fs';
import { bytesToHex } from '@quietvote/crypto';
import {
  PROTO_ID, CONTROL_ACTIONS, CONTROL_REASONS, CONTROL_ENTRY, S, adjudicateDkg, check, manifestHash, rollRoot, verifyKeyconf, verifyMultiSig, verifySig,
  type CommitBody, type ComplaintBody, type DealingBody, type KeyconfBody, type MarkerBody, type MarkerName,
  type MarkerSeqs, type MultiSignedRecord, type RollCommitBody, type Schema, type SharesBody, type SignedRecord,
} from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { pinnedHash, printJson } from './common.ts';
import { prepareElectionArchive } from './cmd-prepare.ts';
import { EXIT, type Io } from './io.ts';

const DKG = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;
const KINDS = [...DKG, 'roll-commit', 'election-open', 'election-close', ...CONTROL_ACTIONS] as const;
type Kind = typeof KINDS[number];
const ENTRY: Record<Kind, string> = {
  'dkg-open': 'ceremony_start', 'dkg-r1-open': 'notice', 'dkg-r1-close': 'notice', 'dkg-r2-close': 'notice',
  'dkg-r3-close': 'notice', 'dkg-final': 'joint_key', 'roll-commit': 'roll_commit',
  'election-open': 'election_open', 'election-close': 'election_close',
  pause: 'notice', resume: 'notice', invalidate: 'notice', 'security-notice': 'notice',
  'audit-close': 'audit_close', cancel: 'election_cancel', abort: 'ceremony_abort',
};

export async function cmdElectionDraftRecord(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'manifest-hash': 'value', kind: 'value', reason: 'value', out: 'value', json: 'bool' });
  const [path] = needPositional(p, 1, 'election draft-record <archive.qvb>');
  const pin = pinnedHash(p), kindArg = needFlag(p, 'kind'), out = needFlag(p, 'out');
  if (pin === undefined) throw new UsageError('--manifest-hash is required');
  if (!KINDS.includes(kindArg as Kind)) throw new UsageError(`--kind must be one of ${KINDS.join(', ')}`);
  const kind = kindArg as Kind;
  const isControl = (CONTROL_ACTIONS as readonly string[]).includes(kind);
  const reason = p.get('reason');
  if (reason !== undefined && (!isControl || !(CONTROL_REASONS as readonly string[]).includes(reason))) {
    throw new UsageError('--reason requires a control action and a catalog code');
  }
  const { content, controlSeq } = prepareElectionArchive(path!, pin);
  const m = content.manifest.body, mh = manifestHash(m);
  if (isControl) {
    if (controlSeq >= Number.MAX_SAFE_INTEGER) throw new FailError('control sequence is exhausted');
    const body = { proto: PROTO_ID, type: 'control', action: kind, control_seq: controlSeq + 1, ...(reason === undefined ? {} : { reason }) };
    try { writeFileSync(out, JSON.stringify(body) + '\n', { flag: 'wx', mode: 0o600 }); }
    catch { throw new InputError('cannot create output; existing files are never overwritten'); }
    printJson(io, { file: out, kind, entry_type: CONTROL_ENTRY[kind], manifest_hash: pin, control_seq: body.control_seq,
      signed: false, admitted: false, board_structure_verified: true, witness_quorum_verified: false, freshness_verified: false });
    return EXIT.ok;
  }
  const markers = new Map<MarkerName, { seq: number; rec: MultiSignedRecord<MarkerBody> }>();
  const rolls: { seq: number; body: RollCommitBody }[] = [];
  const commits: { seq: number; body: CommitBody }[] = [], dealings: { seq: number; body: DealingBody }[] = [];
  const shares: { seq: number; body: SharesBody }[] = [], complaints: { seq: number; body: ComplaintBody }[] = [];
  const keyconfs: { seq: number; body: KeyconfBody }[] = [];
  const trustee = <B extends { type: string }>(raw: unknown, seq: number, schema: Schema, index: (body: B) => number): { seq: number; body: B } => {
    if (check(S.signed(schema), raw) !== null) throw new FailError('malformed trustee record in archive');
    const rec = raw as SignedRecord<B>, key = m.trustees[index(rec.body) - 1]?.sign_pk;
    if (key === undefined || !verifySig(mh, rec.body.type, rec.body, rec.sig, key)) throw new FailError('unauthenticated trustee record in archive');
    return { seq, body: rec.body };
  };
  for (const { seq, entry } of content.log) {
    const type = (entry as { body?: { type?: unknown } })?.body?.type;
    switch (type) {
      case 'marker': {
        if (check(S.multiSigned(S.marker), entry) !== null) throw new FailError('malformed coordinator marker');
        const rec = entry as MultiSignedRecord<MarkerBody>, b = rec.body;
        if (markers.has(b.name)) throw new FailError('duplicate coordinator marker');
        if (b.name !== 'election-open' && (b.manifest_hash !== undefined || b.joint_key_seq !== undefined || b.roll_commit_seq !== undefined)) throw new FailError('binding fields on a non-open marker');
        if (b.name !== 'election-open' && b.name !== 'election-close' && !verifyMultiSig(mh, rec, m.coordinator.keys, m.coordinator.m)) throw new FailError('coordinator marker lacks valid quorum signatures');
        markers.set(b.name, { seq, rec });
        break;
      }
      case 'roll-commit': {
        if (check(S.multiSigned(S.rollCommit), entry) !== null || !verifyMultiSig(mh, entry as MultiSignedRecord<RollCommitBody>, m.coordinator.keys, m.coordinator.m)) throw new FailError('invalid roll commitment');
        rolls.push({ seq, body: (entry as MultiSignedRecord<RollCommitBody>).body });
        break;
      }
      case 'dkg-commit': commits.push(trustee<CommitBody>(entry, seq, S.dkgCommit, (b) => b.i)); break;
      case 'dkg-dealing': dealings.push(trustee<DealingBody>(entry, seq, S.dkgDealing(m.t), (b) => b.i)); break;
      case 'dkg-shares': shares.push(trustee<SharesBody>(entry, seq, S.dkgShares, (b) => b.i)); break;
      case 'dkg-complaint': complaints.push(trustee<ComplaintBody>(entry, seq, S.dkgComplaint, (b) => b.accuser)); break;
      case 'dkg-keyconf': keyconfs.push(trustee<KeyconfBody>(entry, seq, S.dkgKeyconf, (b) => b.j)); break;
      case 'control': {
        // prepareElectionArchive already authenticates these controls through verifyLogStructure.
        const action = (entry as { body: { action: string } }).body.action;
        if (['abort', 'cancel', 'invalidate', 'audit-close'].includes(action)) throw new FailError('terminal control is present; no lifecycle proposal is generated');
        break;
      }
    }
  }
  let previous = -1, phaseCount = 0;
  for (const name of DKG) {
    const marker = markers.get(name);
    if (!marker) break;
    if (marker.seq <= previous) throw new FailError('DKG markers are out of order');
    previous = marker.seq;
    phaseCount++;
  }
  if (DKG.slice(phaseCount).some((name) => markers.has(name))) throw new FailError('DKG marker sequence has a gap');
  const rr = rollRoot(content.roll);
  if (!rr.ok) throw new FailError('invalid voter roll');
  const root = bytesToHex(rr.value);
  if ((m.roll.root !== undefined && m.roll.root !== root) || (m.roll.size !== undefined && m.roll.size !== content.roll.length)) throw new FailError('voter roll differs from the pinned manifest');
  if (rolls.some((r) => r.body.root !== root || r.body.size !== content.roll.length) || rolls.length > 1) throw new FailError('conflicting or duplicate roll commitment');

  let body: MarkerBody | RollCommitBody;
  const dkgIndex = DKG.indexOf(kind as typeof DKG[number]);
  if (dkgIndex >= 0 && dkgIndex < 5) {
    if (phaseCount !== dkgIndex || rolls.length || markers.has('election-open') || markers.has('election-close')) throw new FailError('requested marker is not the next ceremony phase');
    body = { proto: PROTO_ID, type: 'marker', name: kind as MarkerName };
  } else {
    if (phaseCount < 5 || (kind === 'dkg-final' ? phaseCount !== 5 : phaseCount !== 6)) throw new FailError('requested lifecycle action requires the completed preceding ceremony phases');
    const finalSeq = markers.get('dkg-final')?.seq ?? (content.log.at(-1)?.seq ?? 0) + 1;
    const mk = Object.fromEntries(DKG.map((name) => [name, name === 'dkg-final' ? finalSeq : markers.get(name)!.seq])) as MarkerSeqs;
    const adj = await adjudicateDkg({ mh, n: m.n, t: m.t, markers: mk, commits, dealings, shares, complaints });
    if (!adj.ok) throw new FailError(`DKG adjudication failed: ${adj.error}`);
    const dkg = adj.value, confirmed = new Set<number>();
    for (const kc of keyconfs) {
      if (kc.seq <= mk['dkg-r3-close'] || kc.seq >= finalSeq) continue;
      const y = dkg.Y.get(kc.body.j);
      if (y !== undefined) {
        if (!verifyKeyconf(dkg.ctx, y, kc.body)) throw new FailError('invalid timely trustee key confirmation proof');
        confirmed.add(kc.body.j);
      }
    }
    if (confirmed.size < m.t) throw new FailError('fewer than t timely verified trustee key confirmations');
    const final = markers.get('dkg-final');
    if (final && final.rec.body.qmask !== undefined && (final.rec.body.qmask !== dkg.qmask || final.rec.body.K !== bytesToHex(dkg.K.toBytes()))) throw new FailError('dkg-final differs from the independently recomputed outcome');
    const open = markers.get('election-open'), close = markers.get('election-close');
    for (const marker of [open, close]) {
      if (marker && !verifyMultiSig(dkg.ctx, marker.rec, m.coordinator.keys, m.coordinator.m)) throw new FailError('election marker lacks context-bound quorum signatures');
    }
    const roll = rolls[0];
    if (roll && (!final || roll.seq <= final.seq)) throw new FailError('roll commitment precedes the final joint key');
    if (open && (!final || !roll || open.seq <= roll.seq || open.rec.body.manifest_hash !== pin || open.rec.body.joint_key_seq !== final.seq || open.rec.body.roll_commit_seq !== roll.seq)) throw new FailError('election-open binding does not match the authenticated history');
    if (close && (!open || close.seq <= open.seq)) throw new FailError('election-close is out of order');
    if (kind === 'dkg-final') {
      if (roll || open || close) throw new FailError('ceremony already advanced beyond dkg-final');
      body = { proto: PROTO_ID, type: 'marker', name: 'dkg-final', qmask: dkg.qmask, K: bytesToHex(dkg.K.toBytes()) };
    } else if (kind === 'roll-commit') {
      if (roll || open || close) throw new FailError('roll is already committed or the election has opened');
      body = { proto: PROTO_ID, type: 'roll-commit', root, size: content.roll.length };
      if (check(S.rollCommit, body) !== null) throw new FailError('voter roll cannot form a protocol roll commitment');
    } else if (kind === 'election-open') {
      if (!roll || open || close) throw new FailError('opening requires one committed roll and no prior open/close marker');
      body = { proto: PROTO_ID, type: 'marker', name: 'election-open', manifest_hash: pin, joint_key_seq: final!.seq, roll_commit_seq: roll.seq };
    } else {
      if (!open || close) throw new FailError('closing requires an open election with no prior close marker');
      body = { proto: PROTO_ID, type: 'marker', name: 'election-close' };
    }
  }
  try { writeFileSync(out, JSON.stringify(body) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { throw new InputError('cannot create output; existing files are never overwritten'); }
  printJson(io, {
    file: out, kind, entry_type: ENTRY[kind], manifest_hash: pin, signed: false, admitted: false,
    board_structure_verified: true, witness_quorum_verified: false, freshness_verified: false,
    ...(kind === 'roll-commit' ? { roll_source: m.roll.root === undefined ? 'uncommitted-proposal' : 'pinned-manifest' } : {}),
  });
  return EXIT.ok;
}
