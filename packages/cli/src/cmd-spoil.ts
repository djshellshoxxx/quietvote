import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, pointToBytes, type Point } from '@quietvote/crypto';
import {
  adjudicateDkg, analyzeBallotLog, ballotCode, check, collectAlphas, collectSpoilShares, decryptSpoiled, S, verifyKeyconf, verifyMultiSig, verifySig,
  type BallotBody, type CommitBody, type ComplaintBody, type DealingBody, type KeyconfBody, type MarkerBody, type MarkerSeqs, type MultiSignedRecord,
  type SharesBody, type SignedRecord, type SpoilShareBody,
} from '@quietvote/protocol';
import { needFlag, parseArgs, FailError, InputError, UsageError } from './args.ts';
import { electionContext, isHex, pinnedHash, printJson, readJson, type ElectionContext } from './common.ts';
import { EXIT, type Io } from './io.ts';

const H = bytesToHex;
const DKG_MARKERS = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;

interface Derived {
  Y: ReadonlyMap<number, Point>;
  decrypters: Set<number>;
  voter: { seq: number; raw: unknown }[];
  open: number;
  close: number;
}

/**
 * Re-derives what `verifyElection` derived but does not expose: the DKG share public keys Y_j, the key-confirmed decrypter set and
 * the election window. Same record filters as `verifyElection` (schema, author signature, marker multisig); all arithmetic is the
 * protocol's (`adjudicateDkg`, `verifyKeyconf`). `electionContext` has already refused a bundle whose DKG did not verify.
 */
async function deriveFromLog(ec: ElectionContext): Promise<Derived> {
  const { manifest: m, params } = ec;
  const mh = params.mh;
  const trusteeKey = (i: number): string | undefined => m.trustees[i - 1]?.sign_pk;
  const markers = new Map<string, number>();
  const ctxMarkers: { seq: number; rec: MultiSignedRecord<MarkerBody> }[] = [];
  const commits: { seq: number; body: CommitBody }[] = [];
  const dealings: { seq: number; body: DealingBody }[] = [];
  const shares: { seq: number; body: SharesBody }[] = [];
  const complaints: { seq: number; body: ComplaintBody }[] = [];
  const keyconfs: { seq: number; body: KeyconfBody }[] = [];
  const voter: { seq: number; raw: unknown }[] = [];
  const signedBy = <B extends { type: string }>(rec: SignedRecord<B>, author: number): boolean => author <= m.n && verifySig(mh, rec.body.type, rec.body, rec.sig, trusteeKey(author));
  for (const { seq, entry } of ec.bundle.election.log) {
    const o = entry as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null) continue;
    if ('intent' in o) {
      voter.push({ seq, raw: entry });
      continue;
    }
    const body = o.body as { type?: unknown; proto?: unknown } | undefined;
    if (typeof body !== 'object' || body === null || body.proto !== 'qv1-r255-sha2') continue;
    switch (body.type) {
      case 'marker': {
        if (check(S.multiSigned(S.marker), entry) !== null) break;
        const rec = entry as MultiSignedRecord<MarkerBody>;
        if (rec.body.name === 'election-open' || rec.body.name === 'election-close') ctxMarkers.push({ seq, rec });
        else if (verifyMultiSig(mh, rec, m.coordinator.keys, m.coordinator.m) && !markers.has(rec.body.name)) markers.set(rec.body.name, seq);
        break;
      }
      case 'dkg-commit':
        if (check(S.signed(S.dkgCommit), entry) === null && signedBy(entry as SignedRecord<CommitBody>, (entry as SignedRecord<CommitBody>).body.i)) commits.push({ seq, body: (entry as SignedRecord<CommitBody>).body });
        break;
      case 'dkg-dealing':
        if (check(S.signed(S.dkgDealing(m.t)), entry) === null && signedBy(entry as SignedRecord<DealingBody>, (entry as SignedRecord<DealingBody>).body.i)) dealings.push({ seq, body: (entry as SignedRecord<DealingBody>).body });
        break;
      case 'dkg-shares':
        if (check(S.signed(S.dkgShares), entry) === null && signedBy(entry as SignedRecord<SharesBody>, (entry as SignedRecord<SharesBody>).body.i)) shares.push({ seq, body: (entry as SignedRecord<SharesBody>).body });
        break;
      case 'dkg-complaint':
        if (check(S.signed(S.dkgComplaint), entry) === null && signedBy(entry as SignedRecord<ComplaintBody>, (entry as SignedRecord<ComplaintBody>).body.accuser)) complaints.push({ seq, body: (entry as SignedRecord<ComplaintBody>).body });
        break;
      case 'dkg-keyconf':
        if (check(S.signed(S.dkgKeyconf), entry) === null && signedBy(entry as SignedRecord<KeyconfBody>, (entry as SignedRecord<KeyconfBody>).body.j)) keyconfs.push({ seq, body: (entry as SignedRecord<KeyconfBody>).body });
        break;
      default:
    }
  }
  const mk = {} as MarkerSeqs;
  for (const n of DKG_MARKERS) {
    const s = markers.get(n);
    if (s === undefined) throw new FailError(`log lacks the ${n} marker`);
    mk[n] = s;
  }
  const adj = await adjudicateDkg({ mh, n: m.n, t: m.t, markers: mk, commits, dealings, shares, complaints });
  if (!adj.ok) throw new FailError(`DKG adjudication failed: ${adj.error}`);
  const dkg = adj.value;
  if (H(pointToBytes(dkg.K)) !== H(pointToBytes(params.K)) || H(dkg.ctx) !== H(params.ctx)) throw new FailError('re-derived DKG differs from the verified joint key');
  const decrypters = new Set<number>();
  for (const k of keyconfs) {
    const Yj = dkg.Y.get(k.body.j);
    if (!(k.seq > mk['dkg-r3-close'] && k.seq < mk['dkg-final']) || Yj === undefined || decrypters.has(k.body.j)) continue;
    if (verifyKeyconf(dkg.ctx, Yj, k.body)) decrypters.add(k.body.j);
  }
  if (decrypters.size < m.t) throw new FailError(`only ${decrypters.size} key-confirmed trustees, fewer than t=${m.t}`);
  let open: number | undefined;
  let close: number | undefined;
  for (const { seq, rec } of ctxMarkers) {
    if (!verifyMultiSig(dkg.ctx, rec, m.coordinator.keys, m.coordinator.m)) continue;
    if (rec.body.name === 'election-open' && open === undefined) open = seq;
    if (rec.body.name === 'election-close' && close === undefined) close = seq;
  }
  if (open === undefined || close === undefined || !(mk['dkg-final'] < open && open < close)) throw new FailError('log has no valid election-open < election-close window');
  return { Y: dkg.Y, decrypters, voter, open, close };
}

function readPacketRecords(path: string): unknown[] {
  const j = readJson(path) as { format?: unknown; round?: unknown; records?: unknown } | null;
  if (typeof j !== 'object' || j === null || j.format !== 'qv-ceremony-packet/v1' || typeof j.round !== 'string' || !Array.isArray(j.records)) {
    throw new InputError(`${path} is not a qv-ceremony-packet/v1 packet`);
  }
  return j.round === 'spoil-share' ? j.records : []; // other rounds are not for this command
}

export async function cmdElectionSpoilCollect(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { election: 'value', code: 'value', packet: 'multi', json: 'bool', 'post-body-out': 'value', 'manifest-hash': 'value' });
  const electionFile = needFlag(p, 'election');
  const code = needFlag(p, 'code');
  if (!isHex(code, 32)) throw new UsageError('--code must be 64 lower-case hex digits');
  const packets = p.all('packet');
  if (packets.length === 0) throw new UsageError('at least one --packet is required');
  const pin = pinnedHash(p);
  const outDir = p.get('post-body-out');

  const ec = await electionContext(electionFile, pin);
  const { manifest, params } = ec;
  const d = await deriveFromLog(ec);
  const an = analyzeBallotLog(params, ec.rollSet, d.voter, d.open, d.close);

  const fail = (why: string): number => {
    if (p.has('json')) printJson(io, { ok: false, code, error: why });
    else io.err(`spoil-collect FAILED: ${why}\n`);
    return EXIT.fail;
  };

  // The code must be a verified, trustees-mode spoil that no cast envelope carries or re-wraps (same gate the trustees apply).
  const castCodes = new Set<string>(an.counted.map((c) => c.code));
  for (const { raw } of d.voter) {
    const e = raw as { intent?: unknown; body?: BallotBody };
    if (e.intent === 'cast' && e.body !== undefined) {
      try {
        castCodes.add(H(ballotCode(params.ctx, e.body)));
      } catch {
        // an undecodable cast cannot carry this code
      }
    }
  }
  if (castCodes.has(code)) return fail('this ballot code was cast; a cast ballot is never decrypted');
  const rec = an.spoiled.get(code);
  if (rec === undefined) return fail('no verified spoil record with this ballot code in the log');
  if (manifest.spoil_trustee_decrypt !== true) return fail('the manifest does not enable trustee spoil decryption');
  if (rec.env.reveal_digest !== '00'.repeat(32)) return fail('this spoil is not in trustees mode (it carries a reveal digest)');
  const mine = new Set<string>();
  collectAlphas(rec.env.body, mine);
  for (const a of mine) if (an.castAlphas.has(a)) return fail('this spoil re-wraps ciphertexts that also appear in a cast envelope (TR-01); refusing');

  const raw: unknown[] = [];
  for (const f of packets) {
    for (const r of readPacketRecords(f)) {
      if ((r as { body?: { code?: unknown } } | null)?.body?.code === code) raw.push(r);
    }
  }
  const col = collectSpoilShares(manifest, params.ctx, code, raw);
  // Per-trustee proof validity: decryptSpoiled with t=1 accepts a set iff every one of its proofs verifies.
  const one = { ...params, manifest: { ...manifest, t: 1 } };
  const good: number[] = [];
  const bad: { j: number; why: string }[] = col.rejected.map((r) => ({ j: r.j ?? 0, why: r.why }));
  for (const [j, set] of [...col.sets].sort((a, b) => a[0] - b[0])) {
    const r = decryptSpoiled(one, d.Y, d.decrypters, { code, body: rec.env.body }, new Map([[j, set]]));
    // One share cannot decode (t >= 2), so "proofs verified but decoding failed" (anything but E_DEC_PROOF) still means this set's proofs are good.
    if (r.ok || r.error !== 'E_DEC_PROOF') good.push(j);
    else bad.push({ j, why: d.decrypters.has(j) ? `share proof invalid (${r.ok ? '' : r.error})` : 'trustee is not a key-confirmed decrypter' });
  }
  const detail = bad.map((b) => `${b.j === 0 ? 'record' : `trustee ${b.j}`}: ${b.why}`);
  if (good.length < manifest.t) return fail(`${good.length} valid share(s), fewer than t=${manifest.t}${detail.length > 0 ? ` (${detail.join('; ')})` : ''}`);
  const out = decryptSpoiled(params, d.Y, d.decrypters, { code, body: rec.env.body }, col.sets);
  if (!out.ok) return fail(`decoding failed: ${out.error}${out.detail === undefined ? '' : ` (${out.detail})`}`);

  const written: string[] = [];
  if (outDir !== undefined) {
    try {
      mkdirSync(outDir, { recursive: true });
      for (const j of good) {
        const rcd = raw.find((r) => (r as SignedRecord<SpoilShareBody>).body?.j === j && collectSpoilShares(manifest, params.ctx, code, [r]).sets.has(j));
        const file = join(outDir, `${code.slice(0, 8)}-${j}.json`);
        writeFileSync(file, JSON.stringify(rcd), { flag: 'wx' });
        written.push(file);
      }
    } catch (e) {
      throw new InputError(`cannot write post bodies to ${outDir}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`);
    }
  }
  const info = { ok: true as const, code, election_id: manifest.election_id, spoil_seq: rec.seq, selections: out.value.selections, valid_shares: good, rejected: bad, post_bodies: written };
  if (p.has('json')) printJson(io, info);
  else {
    const L = [`ballot ${code} (spoil at log seq ${rec.seq}) decrypted from ${good.length} valid share(s) of trustees ${good.join(', ')}:`];
    for (const [cid, sel] of Object.entries(out.value.selections)) L.push(`  ${cid}: ${sel.length === 0 ? '(none)' : sel.join(', ')}`);
    for (const x of detail) L.push(`ignored: ${x}`);
    for (const f of written) L.push(`wrote ${f}`);
    io.out(L.join('\n') + '\n');
  }
  return EXIT.ok;
}
