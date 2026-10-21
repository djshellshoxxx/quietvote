import {
  QvCryptoError, baseMul, bytesToHex, decProve, decVerify, ed25519Keypair, elgamalEncrypt, hexToBytes, hsNz, jcs, parseQvJson,
  pointFromBytes, pointToBytes, polyEval, scalarFromBytes, scalarToBytes, sha256, utf8, wipe, type Ciphertext, type Point,
  type Scalar,
} from '@quietvote/crypto';
import {
  PROTO_ID, S, adjudicateDkg, analyzeBallotLog, check, dkgDeal, dkgFinalShare, dkgKeyconf, dkgMakeComplaint, dkgMakeShares,
  dkgReceiveShare, ballotCode, manifestHash, rollRoot, shareToHex, signRecord, trusteeDecryptSpoiled, trusteeDecryptTally, validateManifest, verifyElection,
  verifyMultiSig, verifySig, countedRoot, obj, hex as hexS, int, lit, str, arr,
  type Aggregate, type BallotBody, type ComplaintBody, type DealerSecret, type KeyconfBody, type LogEntry,
  type Manifest, type MarkerSeqs, type MultiSignedRecord, type ParsedDealing, type SignedRecord,
} from '@quietvote/protocol';
import {
  encodeBundle, readBundle, tombstonePath, writeBundle,
  type BundleData, type CompromiseBody, type KeyDestructionBody, type KeycheckBody, type SpoilShareBody, type TallyShareBody, type VaultDeps,
} from './bundle.ts';
import { computeR1, markerBody, markerSeq, mergeEntries, takeDkg, uniqueBy, type ImportReport } from './ceremonylog.ts';
import { TrusteeError } from './errors.ts';
import { exists, atomicWrite, shred } from './fsutil.ts';
import { fingerprintOf } from './fingerprint.ts';
import { assertTransition, PRE_STANDBY, type TrusteeState } from './machine.ts';
import { assertPassphraseStrength } from './passphrase.ts';
import { makeTranscript, signTranscript, buildCore, type CeremonyMode, type Transcript } from './transcript.ts';

const H = bytesToHex;
const sc = (h: string): Scalar => scalarFromBytes(hexToBytes(h, 32));
const hx = (s: Scalar): string => H(scalarToBytes(s));
const PT = (h: string): Point => pointFromBytes(hexToBytes(h, 32), { nonIdentity: true });

/** Upper bound on ballot codes per spoil request (bounds the work a requester can force per call). */
export const MAX_SPOIL_REQUEST = 64;
export const PACKET_FORMAT = 'qv-ceremony-packet/v1';
export const LOG_FORMAT = 'qv-ceremony-log/v1';
export const OVERRIDE_UNWITNESSED = 'RELEASE-WITHOUT-WITNESSED-CHECKPOINT';

export type PacketRound = 'r1-commit' | 'r1-dealing' | 'r2-shares' | 'r3-complaints' | 'r4-keyconf' | 'drill-keycheck' | 'tally-share' | 'spoil-share' | 'compromise-report';
export interface Packet {
  round: PacketRound;
  /** Canonical bytes (QV-JSON) ready to write as a `.qvp` file. */
  bytes: Uint8Array;
  obj: { format: typeof PACKET_FORMAT; manifest_hash: string; ceremony_id: string; round: PacketRound; from: number; records: unknown[] };
}

export interface AuditCloseBody {
  proto: string;
  type: 'audit-close';
  ctx: string;
  closed_at: string;
}
const auditCloseSchema = S.multiSigned(obj({ proto: lit(PROTO_ID), type: lit('audit-close'), ctx: hexS(32), closed_at: str(40) }));

export interface Status {
  state: TrusteeState;
  trustee_id?: number;
  election_id?: string;
  ceremony_id?: string;
  sign_pk: string;
  markers: string[];
  next_action: string;
  fingerprint?: { words: string[]; hex: string };
  backups: number;
  backup_made: boolean;
  qualified?: number[];
}

/** The public ciphertext the fire drill decrypts is recomputed locally from (K, ctx): no external ciphertext is ever accepted. */
export function drillCiphertext(K: Point, ctx: Uint8Array): Ciphertext {
  const r = hsNz('enc-nonce', ctx, utf8('qv-trustee/keycheck-v1'));
  return elgamalEncrypt(K, 1, r);
}
const DRILL = { cid: '~keycheck', oid: 'drill' };

export function verifyKeycheck(ctx: Uint8Array, K: Point, Yj: Point, body: KeycheckBody): boolean {
  try {
    const ct = drillCiphertext(K, ctx);
    return decVerify({ ctx, ...DRILL, j: body.j, Yj, A: ct.A, B: ct.B, M: PT(body.M) }, { c: sc(body.c), s: sc(body.s) });
  } catch {
    return false;
  }
}

const tallyShareSchema = obj({
  proto: lit(PROTO_ID), type: lit('tally-share'), ctx: hexS(32), j: int(1, 32), n_counted: int(0, 1 << 20), counted_root: hexS(32),
  shares: arr(obj({ contest: str(64), opt: str(66), M: hexS(32), c: hexS(32), s: hexS(32) }), 1, 4096),
});
export const tallyShareRecordSchema = S.signed(tallyShareSchema);
const spoilShareSchema = obj({
  proto: lit(PROTO_ID), type: lit('spoil-share'), ctx: hexS(32), j: int(1, 32), code: hexS(32), spoil_seq: int(0, 1 << 30),
  shares: arr(obj({ contest: str(64), opt: str(66), M: hexS(32), c: hexS(32), s: hexS(32) }), 1, 4096),
});
export const spoilShareRecordSchema = S.signed(spoilShareSchema);

type Dep = VaultDeps;

export class Trustee {
  readonly path: string;
  private readonly pass: string;
  private d: BundleData;
  private readonly deps: Dep;

  private constructor(path: string, pass: string, d: BundleData, deps: Dep) {
    this.path = path;
    this.pass = pass;
    this.d = d;
    this.deps = deps;
  }

  // ------------------------------------------------------------------ lifecycle

  /** Creates a fresh per-election Ed25519 identity (QV-17-REQ-031) in a sealed bundle (state KEYS_READY). */
  static async keygen(path: string, pass: string, deps: Dep): Promise<Trustee> {
    assertPassphraseStrength(pass, deps.allowWeak === true);
    if ((await exists(path)) || (await exists(tombstonePath(path)))) throw new TrusteeError('STATE', 'BUNDLE_EXISTS', 'refusing to overwrite an existing bundle or tombstone');
    const kp = ed25519Keypair(deps.rng.bytes(32));
    const t = new Trustee(path, pass, Trustee.blank(kp.secretKey, kp.publicKey, deps), deps);
    await t.save();
    return t;
  }

  private static blank(sk: Uint8Array, pk: Uint8Array, deps: Dep): BundleData {
    return {
      bundle_version: 1, created_at: deps.now().toISOString(), backup_epoch: 0, state: 'KEYS_READY', sk_sign: H(sk), sign_pk: H(pk),
      log: [], received: {}, out: { complaints: [], compromise: [] }, sas: [], backups: [], overrides: [], events: [],
    };
  }

  static async open(path: string, pass: string, deps: Dep): Promise<Trustee> {
    const d = await readBundle(path, pass, deps);
    return new Trustee(path, pass, d, deps);
  }

  /** Re-seals a backup file as a working bundle at `to` (QV-17 §6.4). Refuses to resurrect a destroyed share. */
  static async restore(from: string, fromPass: string, to: string, toPass: string, deps: Dep): Promise<Trustee> {
    if (await exists(tombstonePath(to))) throw new TrusteeError('STATE', 'DESTROYED', 'a destruction tombstone exists for the target');
    if (await exists(to)) throw new TrusteeError('STATE', 'BUNDLE_EXISTS', 'target exists');
    assertPassphraseStrength(toPass, deps.allowWeak === true);
    const d = await readBundle(from, fromPass, deps);
    if (d.state === 'DESTROYED' || d.state === 'DESTROYING') throw new TrusteeError('STATE', 'DESTROYED', 'backup is of a destroyed share');
    d.events.push({ t: deps.now().toISOString(), note: `restored from backup epoch ${d.backup_epoch}` });
    const t = new Trustee(to, toPass, d, deps);
    await t.save();
    return t;
  }

  get data(): Readonly<BundleData> {
    return this.d;
  }
  get state(): TrusteeState {
    return this.d.state;
  }
  get signPk(): string {
    return this.d.sign_pk;
  }

  private async save(): Promise<void> {
    await writeBundle(this.path, this.d, this.pass, this.deps);
  }
  private note(s: string): void {
    this.d.events.push({ t: this.deps.now().toISOString(), note: s });
  }
  private go(to: TrusteeState): void {
    assertTransition(this.d.state, to);
    this.d.state = to;
  }
  private need(...states: TrusteeState[]): void {
    if (!states.includes(this.d.state)) throw new TrusteeError('STATE', 'WRONG_STATE', `state ${this.d.state}; this step needs ${states.join('|')}`);
  }
  private mf(): { m: Manifest; mh: Uint8Array; i: number } {
    const { manifest, trustee_id } = this.d;
    if (manifest === undefined || trustee_id === undefined) throw new TrusteeError('STATE', 'NOT_JOINED', 'run join first');
    return { m: manifest.body, mh: manifestHash(manifest.body), i: trustee_id };
  }
  private sign<B extends { type: string }>(scope: Uint8Array, body: B): SignedRecord<B> {
    const sk = hexToBytes(this.d.sk_sign, 32);
    try {
      return signRecord(sk, hexToBytes(this.d.sign_pk, 32), scope, body);
    } finally {
      wipe(sk);
    }
  }
  private packet(round: PacketRound, records: unknown[]): Packet {
    const mf = this.mf();
    const o = { format: PACKET_FORMAT, manifest_hash: H(mf.mh), ceremony_id: this.d.ceremony_id!, round, from: mf.i, records } as const;
    return { round, bytes: jcs(o), obj: { ...o, records } };
  }
  private markers(): string[] {
    const names = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final', 'election-open', 'election-close'] as const;
    return names.filter((n) => markerSeq(this.d.log, n) !== undefined);
  }
  private ctxBytes(): Uint8Array | undefined {
    return this.d.derived === undefined ? undefined : hexToBytes(this.d.derived.ctx, 32);
  }

  // ------------------------------------------------------------------ join / import

  /**
   * Binds this identity to an election: the manifest hash must match the out-of-band value, m coordinator signatures must
   * verify and this identity's key must be the one the manifest lists (QV-17 §7).
   */
  async join(manifest: MultiSignedRecord<Manifest>, manifestHashHex: string, ceremonyId: string): Promise<void> {
    if (this.d.state !== 'KEYS_READY') throw new TrusteeError('STATE', 'WRONG_STATE', `state ${this.d.state}`);
    const v = validateManifest(manifest.body, manifest.body.roll.size ?? 0);
    if (!v.ok) throw new TrusteeError('VERIFY', 'MANIFEST_INVALID', `${v.error} ${v.detail ?? ''}`);
    const mh = manifestHash(v.value.manifest);
    if (H(mh) !== manifestHashHex) throw new TrusteeError('VERIFY', 'MANIFEST_HASH', 'manifest does not match the out-of-band hash');
    const m = v.value.manifest;
    if (!Array.isArray(manifest.sigs) || !verifyMultiSig(mh, manifest, m.coordinator.keys, m.coordinator.m)) throw new TrusteeError('VERIFY', 'MANIFEST_SIG', 'fewer than m valid coordinator signatures');
    const idx = m.trustees.findIndex((x) => x.sign_pk === this.d.sign_pk);
    if (idx < 0) throw new TrusteeError('VERIFY', 'NOT_A_TRUSTEE', 'this key is not listed in the manifest');
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(ceremonyId)) throw new TrusteeError('USAGE', 'BAD_CEREMONY_ID');
    this.d.manifest = manifest;
    this.d.manifest_hash = manifestHashHex;
    this.d.election_id = m.election_id;
    this.d.trustee_id = idx + 1;
    this.d.ceremony_id = ceremonyId;
    this.go('ACCEPTED');
    this.note(`joined election ${m.election_id} as T${idx + 1}`);
    await this.save();
  }

  /** Imports a public log slice (`.qvl`); every entry is validated against the manifest before it is kept. */
  async importLog(bytes: Uint8Array): Promise<ImportReport> {
    const { m, mh } = this.mf();
    let j: unknown;
    try {
      j = parseQvJson(bytes);
    } catch {
      throw new TrusteeError('VERIFY', 'LOG_PARSE', 'not valid QV-JSON');
    }
    const o = j as { format?: unknown; manifest_hash?: unknown; entries?: unknown };
    if (o.format !== 'qv-ceremony-log/v1' || o.manifest_hash !== this.d.manifest_hash || !Array.isArray(o.entries)) throw new TrusteeError('VERIFY', 'LOG_FORMAT', 'wrong format or wrong election');
    const entries: LogEntry[] = [];
    for (const e of o.entries as { seq?: unknown; entry?: unknown }[]) {
      if (typeof e?.seq !== 'number') throw new TrusteeError('VERIFY', 'LOG_FORMAT', 'entry without seq');
      entries.push({ seq: e.seq, entry: e.entry });
    }
    const rep = mergeEntries(m, mh, this.ctxBytes(), this.d.log, entries);
    if (rep.rejected.some((r) => r.why.startsWith('LOG_FORK'))) throw new TrusteeError('VERIFY', 'LOG_FORK', rep.rejected.map((r) => `${r.seq}:${r.why}`).join('; '));
    this.observe();
    await this.save();
    return rep;
  }

  /** Re-derives what the log says about this trustee (QV-17 §12.3: the log is truth). */
  private observe(): void {
    const s = this.d.state;
    const L = this.d.log;
    const seen = (n: Parameters<typeof markerSeq>[1]): boolean => markerSeq(L, n) !== undefined;
    const dq = (why: string): void => {
      this.go('DISQUALIFIED');
      this.note(`disqualified: ${why}`);
    };
    if (s === 'ACCEPTED' && seen('dkg-r1-open')) dq('missed commit window');
    else if (s === 'COMMITTED' && seen('dkg-r1-close')) dq('missed dealing window');
    else if (s === 'R1_DONE' && seen('dkg-r2-close')) dq('missed shares window');
    if ((s === 'CONFIRMED' || s === 'DRILLED') && this.d.derived !== undefined) {
      const open = markerSeq(L, 'election-open');
      if (open !== undefined) this.go('STANDBY');
    }
  }

  // ------------------------------------------------------------------ DKG rounds

  /** R1a: commit. Persists the polynomial before any output exists (crash-safe, never re-randomised after this point). */
  async commit(): Promise<Packet> {
    const { m, mh, i } = this.mf();
    if (this.d.out.commit !== undefined) return this.packet('r1-commit', [this.d.out.commit]);
    this.need('ACCEPTED');
    if (markerSeq(this.d.log, 'dkg-open') === undefined) throw new TrusteeError('STATE', 'NOT_OPEN', 'no dkg-open marker imported yet');
    if (markerSeq(this.d.log, 'dkg-r1-open') !== undefined) {
      this.go('DISQUALIFIED');
      await this.save();
      throw new TrusteeError('STATE', 'MISSED_DEADLINE', 'commit window is closed');
    }
    const dl = dkgDeal(mh, i, m.t, this.deps.rng);
    this.d.dealer = { coeffs: dl.secret.coeffs.map(hx), e: hx(dl.secret.e) };
    this.d.out.commit = this.sign(mh, dl.commit);
    this.d.out.dealing = this.sign(mh, dl.body);
    this.go('COMMITTED');
    await this.save();
    return this.packet('r1-commit', [this.d.out.commit]);
  }

  /** R1b: reveal the dealing once the coordinator has opened R1 and our commit is on the log. */
  async reveal(): Promise<Packet> {
    const { i } = this.mf();
    if (this.d.state !== 'COMMITTED') {
      if (this.d.out.dealing !== undefined && this.d.state !== 'ACCEPTED' && this.d.state !== 'DISQUALIFIED' && this.d.state !== 'ABORTED') return this.packet('r1-dealing', [this.d.out.dealing]);
      this.need('COMMITTED');
    }
    const open = markerSeq(this.d.log, 'dkg-r1-open');
    if (open === undefined) throw new TrusteeError('STATE', 'NOT_OPEN', 'dkg-r1-open not imported yet');
    if (markerSeq(this.d.log, 'dkg-r1-close') !== undefined) {
      this.go('DISQUALIFIED');
      await this.save();
      throw new TrusteeError('STATE', 'MISSED_DEADLINE', 'dealing window is closed');
    }
    const mine = this.d.out.commit!;
    const posted = takeDkg(this.d.log).commits.some((c) => c.body.i === i && c.seq < open && c.body.h === mine.body.h);
    if (!posted) throw new TrusteeError('STATE', 'COMMIT_NOT_ON_LOG', 'our commit is not on the imported log before dkg-r1-open; import the latest log');
    this.go('R1_DONE');
    await this.save();
    return this.packet('r1-dealing', [this.d.out.dealing!]);
  }

  /** R2: encrypted shares for every other R1 survivor. Drops the polynomial once the package is persisted. */
  async shares(): Promise<Packet> {
    const { m, mh, i } = this.mf();
    if (this.d.out.shares !== undefined) return this.packet('r2-shares', [this.d.out.shares]);
    this.need('R1_DONE');
    const r1c = markerSeq(this.d.log, 'dkg-r1-close');
    const r2c = markerSeq(this.d.log, 'dkg-r2-close');
    const r1o = markerSeq(this.d.log, 'dkg-r1-open');
    if (r1c === undefined || r1o === undefined) throw new TrusteeError('STATE', 'NOT_OPEN', 'dkg-r1-close not imported yet');
    if (r2c !== undefined) {
      this.go('DISQUALIFIED');
      await this.save();
      throw new TrusteeError('STATE', 'MISSED_DEADLINE', 'shares window is closed');
    }
    const r1 = computeR1(mh, m.t, m.n, { r1open: r1o, r1close: r1c }, takeDkg(this.d.log));
    if (!r1.R1.includes(i)) {
      this.go('DISQUALIFIED');
      this.note(`not in R1: ${r1.out.get(i) ?? 'unknown'}`);
      await this.save();
      throw new TrusteeError('VERIFY', 'NOT_IN_R1', r1.out.get(i));
    }
    const dealer = this.d.dealer;
    if (dealer?.coeffs === undefined || dealer.e === undefined) throw new TrusteeError('VERIFY', 'NO_SECRET', 'polynomial missing from bundle');
    const secret: DealerSecret = { i, t: m.t, coeffs: dealer.coeffs.map(sc), e: sc(dealer.e) };
    const body = await dkgMakeShares(mh, secret, r1.parsed, this.deps.rng);
    this.d.own_y = hx(polyEval(secret.coeffs, i));
    delete dealer.coeffs;
    this.d.out.shares = this.sign(mh, body);
    this.go('R2_DONE');
    await this.save();
    return this.packet('r2-shares', [this.d.out.shares]);
  }

  /** R3: decrypt and check every share addressed to us; complain about bad ones (the share stays confidential until then). */
  async verify(): Promise<{ packet: Packet; complaints: number[]; received: number[] }> {
    const { m, mh, i } = this.mf();
    const mk = (n: 'dkg-r1-open' | 'dkg-r1-close' | 'dkg-r2-close'): number | undefined => markerSeq(this.d.log, n);
    const res = (): { packet: Packet; complaints: number[]; received: number[] } => ({
      packet: this.packet('r3-complaints', this.d.out.complaints),
      complaints: this.d.out.complaints.map((c) => c.body.accused),
      received: Object.keys(this.d.received).map(Number).sort((a, b) => a - b),
    });
    if (this.d.state !== 'R2_DONE') {
      if (['VERIFIED', 'COMPLAINING', 'KEY_DERIVED', 'CONFIRMED', 'DRILLED', 'STANDBY', 'TALLYING', 'RELEASED'].includes(this.d.state)) return res();
      this.need('R2_DONE');
    }
    const r1o = mk('dkg-r1-open'), r1c = mk('dkg-r1-close'), r2c = mk('dkg-r2-close');
    if (r1o === undefined || r1c === undefined || r2c === undefined) throw new TrusteeError('STATE', 'NOT_OPEN', 'dkg-r2-close not imported yet');
    const rec = takeDkg(this.d.log);
    const r1 = computeR1(mh, m.t, m.n, { r1open: r1o, r1close: r1c }, rec);
    const pkgs = uniqueBy(rec.shares, (s) => s > r1c && s < r2c).map;
    const e = sc(this.d.dealer!.e!);
    const Emine = r1.parsed.get(i)?.E;
    if (Emine === undefined) throw new TrusteeError('VERIFY', 'NOT_IN_R1');
    let complained = false;
    for (const j of r1.R1) {
      if (j === i) continue;
      const pkg = pkgs.get(j);
      const ent = pkg?.shares.find((s) => s.j === i);
      if (pkg === undefined || ent === undefined) continue; // missing/malformed packages are disqualified by the adjudicator, no complaint needed
      const dealing: ParsedDealing = r1.parsed.get(j)!;
      const r = await dkgReceiveShare(mh, i, e, dealing, ent);
      if (r.ok) {
        this.d.received[String(j)] = hx(r.y);
        continue;
      }
      if (r.reason === 'decode') continue;
      try {
        const body: ComplaintBody = dkgMakeComplaint(mh, i, e, Emine, j, ent, this.deps.rng);
        this.d.out.complaints.push(this.sign(mh, body));
        complained = true;
        this.note(`complaint against T${j} (${r.reason})`);
      } catch (err) {
        if (!(err instanceof QvCryptoError)) throw err;
      }
    }
    this.go(complained ? 'COMPLAINING' : 'VERIFIED');
    await this.save();
    return res();
  }

  /**
   * R4: adjudicate from the public log, derive sk_i = sum of shares from the qualified set, check it against the public
   * Y_j, and compute the fingerprint. Secrets other than sk_i and sign key are dropped here (QV-17 §6.3).
   */
  async finalize(): Promise<{ fingerprint: { words: string[]; hex: string }; qualified: number[]; events: { who: number; detail: string }[] }> {
    const { m, mh, i } = this.mf();
    if (this.d.derived !== undefined && this.d.state !== 'ABORTED') {
      return { fingerprint: { words: this.d.derived.fp_words, hex: this.d.derived.fp_hex }, qualified: this.d.derived.Q, events: [] };
    }
    this.need('VERIFIED', 'COMPLAINING');
    const names = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close'] as const;
    const mk: Partial<MarkerSeqs> = {};
    for (const n of names) {
      const s = markerSeq(this.d.log, n);
      if (s === undefined) throw new TrusteeError('STATE', 'NOT_OPEN', `${n} not imported yet`);
      mk[n] = s;
    }
    mk['dkg-final'] = markerSeq(this.d.log, 'dkg-final') ?? this.d.log.reduce((a, e) => Math.max(a, e.seq), 0) + 2 ** 30;
    const rec = takeDkg(this.d.log);
    const adj = await adjudicateDkg({ mh, n: m.n, t: m.t, markers: mk as MarkerSeqs, commits: rec.commits, dealings: rec.dealings, shares: rec.shares, complaints: rec.complaints });
    if (!adj.ok) {
      this.go('ABORTED');
      this.note(`ceremony cannot complete: ${adj.error} ${adj.detail ?? ''}`);
      await this.save();
      throw new TrusteeError('VERIFY', adj.error, adj.detail);
    }
    const o = adj.value;
    if (!o.Q.includes(i)) {
      this.go('DISQUALIFIED');
      await this.save();
      throw new TrusteeError('VERIFY', 'DISQUALIFIED', o.events.filter((e) => e.who === i).map((e) => e.detail).join('; '));
    }
    const ys = new Map<number, Scalar>();
    for (const q of o.Q) {
      const y = q === i ? this.d.own_y : this.d.received[String(q)];
      if (y === undefined) throw new TrusteeError('VERIFY', 'MISSING_SHARE', `no verified share from T${q}`);
      ys.set(q, sc(y));
    }
    const fin = dkgFinalShare(o.Q, ys, o.Y.get(i)!);
    if (!fin.ok) throw new TrusteeError('VERIFY', fin.error, fin.detail);
    const fp = fingerprintOf(o.K, o.ctx, mh);
    this.d.sk_i = hx(fin.value);
    this.d.derived = { Yj: H(pointToBytes(o.Y.get(i)!)), K: H(pointToBytes(o.K)), ctx: H(o.ctx), qmask: o.qmask, Q: o.Q, fp_words: fp.words, fp_hex: fp.hex };
    this.d.transcript_hash = H(o.transcriptHash);
    this.d.received = {};
    delete this.d.own_y;
    this.go('KEY_DERIVED');
    await this.save();
    return { fingerprint: fp, qualified: o.Q, events: o.events.map((e) => ({ who: e.who, detail: e.detail })) };
  }

  /** The trustee attests that they compared the check words with other trustees, then the key confirmation is signed. */
  async confirm(comparedWith: number[], words?: string[]): Promise<Packet> {
    const { mh, i } = this.mf();
    if (this.d.out.keyconf !== undefined) return this.packet('r4-keyconf', [this.d.out.keyconf]);
    this.need('KEY_DERIVED');
    const dv = this.d.derived!;
    const uniq = [...new Set(comparedWith)];
    if (uniq.length === 0) throw new TrusteeError('DECLINED', 'SAS_REQUIRED', 'compare the check words with at least one other trustee');
    if (uniq.some((x) => x === i || !dv.Q.includes(x))) throw new TrusteeError('USAGE', 'BAD_COMPARISON', 'compared-with must be other qualified trustees');
    if (words !== undefined && words.map((w) => w.toLowerCase()).join(' ') !== dv.fp_words.join(' ')) throw new TrusteeError('DECLINED', 'SAS_MISMATCH', 'typed check words differ from this device');
    if (markerSeq(this.d.log, 'dkg-final') !== undefined) throw new TrusteeError('STATE', 'MISSED_DEADLINE', 'dkg-final is already on the log');
    const body: KeyconfBody = dkgKeyconf(this.ctxBytes()!, i, PT(dv.Yj), sc(this.d.sk_i!), this.deps.rng);
    this.d.out.keyconf = this.sign(mh, body);
    this.d.sas.push({ compared_with: uniq.sort((a, b) => a - b), at: this.deps.now().toISOString() });
    if (this.d.dealer !== undefined) {
      delete this.d.dealer.e; // sk_xport is no longer needed (QV-17 §6.3)
      delete this.d.dealer;
    }
    this.go('CONFIRMED');
    await this.save();
    return this.packet('r4-keyconf', [this.d.out.keyconf]);
  }

  /** Fire drill (QV-17-REQ-016): partial decryption of the locally recomputed public test ciphertext, nothing else. */
  async drill(): Promise<Packet> {
    const { i } = this.mf();
    if (this.d.out.keycheck !== undefined) return this.packet('drill-keycheck', [this.d.out.keycheck]);
    this.need('CONFIRMED');
    const dv = this.d.derived!;
    const fin = markerBody(this.d.log, 'dkg-final');
    if (fin === undefined) throw new TrusteeError('STATE', 'NOT_FINAL', 'dkg-final not imported yet');
    if ((fin.K !== undefined && fin.K !== dv.K) || (fin.qmask !== undefined && fin.qmask !== dv.qmask)) throw new TrusteeError('REFUSED', 'KEY_MISMATCH', 'dkg-final marker differs from our own derivation');
    const ctx = this.ctxBytes()!;
    const ct = drillCiphertext(PT(dv.K), ctx);
    const { M, proof } = decProve({ ctx, ...DRILL, j: i, Yj: PT(dv.Yj), A: ct.A, B: ct.B }, sc(this.d.sk_i!), this.deps.rng);
    const body: KeycheckBody = { proto: PROTO_ID, type: 'keycheck', ctx: dv.ctx, j: i, M: H(pointToBytes(M)), c: hx(proof.c), s: hx(proof.s) };
    this.d.out.keycheck = this.sign(ctx, body);
    this.go('DRILLED');
    await this.save();
    return this.packet('drill-keycheck', [this.d.out.keycheck]);
  }

  // ------------------------------------------------------------------ tally

  /**
   * Shared gate for every release (tally and spoil): full log verification, key binding, election window and witnessed
   * checkpoint, then the trustee's own recomputation of the ballot analysis. Nothing supplied by the caller is decrypted.
   */
  private async verifiedElection(electionBundle: unknown, opts: { witnessed?: boolean; override?: string }, what: string) {
    const { m, mh, i } = this.mf();
    const dv = this.d.derived;
    if (dv === undefined || this.d.sk_i === undefined) throw new TrusteeError('STATE', 'NO_KEY', 'no election share in this bundle');
    const ctx = this.ctxBytes()!;
    const b = electionBundle as { manifest?: MultiSignedRecord<Manifest>; manifest_hash?: string; roll?: string[]; log?: { seq: number; entry: unknown }[] } | null;
    if (typeof b !== 'object' || b === null || b.manifest === undefined || !Array.isArray(b.roll) || !Array.isArray(b.log)) throw new TrusteeError('VERIFY', 'BUNDLE_FORMAT', 'election bundle must be {manifest, manifest_hash, roll, log}');
    if (b.manifest_hash !== this.d.manifest_hash || H(jcs(b.manifest.body)) !== H(jcs(m))) throw new TrusteeError('REFUSED', 'WRONG_ELECTION', 'bundle manifest differs from the one this share belongs to');

    // 1. full log verification (tally records are stripped: a bogus coordinator tally must not block honest trustees)
    const stripped = { ...b, log: b.log.filter((e) => (e.entry as { body?: { type?: string } } | null)?.body?.type !== 'tally') };
    const rep = await verifyElection(stripped);
    if (rep.findings.some((f) => f.code === 'E_BELOW_FLOOR')) throw new TrusteeError('REFUSED', 'PRIVACY_MIN', 'fewer counted voters than the manifest privacy floor');
    if (rep.verdict === 'FAIL') {
      const f = rep.findings.find((x) => x.cls === 'F');
      throw new TrusteeError('VERIFY', 'LOG_VERIFICATION_FAILED', f === undefined ? undefined : `${f.code}: ${f.detail}`);
    }
    // 2. our own key must be the key the log commits to
    const names = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;
    const log: LogEntry[] = [];
    const mr = mergeEntries(m, mh, ctx, log, b.log);
    void mr;
    const mk: Partial<MarkerSeqs> = {};
    for (const n of names) {
      const s = markerSeq(log, n);
      if (s === undefined) throw new TrusteeError('VERIFY', 'LOG_VERIFICATION_FAILED', `missing marker ${n}`);
      mk[n] = s;
    }
    const rec = takeDkg(log);
    const adj = await adjudicateDkg({ mh, n: m.n, t: m.t, markers: mk as MarkerSeqs, commits: rec.commits, dealings: rec.dealings, shares: rec.shares, complaints: rec.complaints });
    if (!adj.ok) throw new TrusteeError('VERIFY', adj.error, adj.detail);
    if (H(adj.value.ctx) !== dv.ctx || H(pointToBytes(adj.value.K)) !== dv.K || H(pointToBytes(adj.value.Y.get(i) ?? baseMul(1n))) !== dv.Yj) {
      throw new TrusteeError('REFUSED', 'KEY_MISMATCH', 'the log commits to a different joint key / share key than this bundle holds');
    }
    // 3. election window
    const open = markerSeq(log, 'election-open');
    const close = markerSeq(log, 'election-close');
    if (open === undefined || close === undefined || !(mk['dkg-final']! < open && open < close)) throw new TrusteeError('REFUSED', 'ELECTION_NOT_CLOSED', 'no valid election-open < election-close in the log');
    // 4. witnessed checkpoint (QV-17-REQ-041)
    if (m.bb.witness_quorum > 0 && opts.witnessed !== true) {
      if (opts.override !== OVERRIDE_UNWITNESSED) throw new TrusteeError('REFUSED', 'NOT_WITNESSED', `the checkpoint is not witnessed to quorum ${m.bb.witness_quorum}`);
      this.d.overrides.push({ what: `${what} without witnessed checkpoint`, at: this.deps.now().toISOString() });
    }
    // 5. recompute the counted set and the aggregates ourselves
    const p = { manifest: m, mh, K: adj.value.K, ctx };
    const rollSet = new Set(b.roll);
    if (!rollRoot(b.roll).ok) throw new TrusteeError('VERIFY', 'LOG_VERIFICATION_FAILED', 'roll invalid');
    const voter = b.log.filter((e) => typeof e.entry === 'object' && e.entry !== null && 'intent' in e.entry).map((e) => ({ seq: e.seq, raw: e.entry }));
    const an = analyzeBallotLog(p, rollSet, voter, open, close);
    return { p, an, dv, i, ctx, sk: sc(this.d.sk_i), rollSize: b.roll.length, voter };
  }

  /**
   * QV-17-REQ-040: verifies the election log, recomputes the aggregate ciphertexts itself and releases a signed partial
   * decryption of exactly those. There is no parameter through which a ciphertext can be supplied.
   */
  async releaseTally(electionBundle: unknown, opts: { claimed?: ReadonlyMap<string, ReadonlyMap<string, Aggregate>>; witnessed?: boolean; override?: string } = {}): Promise<Packet> {
    const { i } = this.mf();
    if (this.d.out.release !== undefined) return this.packet('tally-share', [this.d.out.release]);
    this.need('CONFIRMED', 'DRILLED', 'STANDBY', 'TALLYING');
    const { p, an, dv, ctx, sk, rollSize } = await this.verifiedElection(electionBundle, opts, 'released tally share');
    if (this.d.state !== 'TALLYING') {
      this.go('TALLYING');
      await this.save();
    }
    const res = trusteeDecryptTally(p, { j: i, sj: sk, Yj: PT(dv.Yj) }, an.counted, opts.claimed, rollSize, this.deps.rng);
    if (!res.ok) {
      this.go('STANDBY');
      await this.save();
      if (res.error === 'E_BELOW_FLOOR') throw new TrusteeError('REFUSED', 'PRIVACY_MIN', res.detail);
      throw new TrusteeError('REFUSED', res.error === 'E_TRUSTEE_REFUSE' ? 'AGGREGATE_MISMATCH' : res.error, res.detail);
    }
    const shares: TallyShareBody['shares'] = [];
    for (const [k, sp] of res.value) {
      const [contest, opt] = k.split('/') as [string, string];
      const x = shareToHex(i, sp);
      shares.push({ contest, opt, M: x.M, c: x.c, s: x.s });
    }
    const body: TallyShareBody = { proto: PROTO_ID, type: 'tally-share', ctx: dv.ctx, j: i, n_counted: an.counted.length, counted_root: H(countedRoot(an.counted)), shares };
    this.d.out.release = this.sign(ctx, body);
    this.go('RELEASED');
    await this.save();
    return this.packet('tally-share', [this.d.out.release]);
  }

  // ------------------------------------------------------------------ spoil decryption (QV-ADR-020 "trustees" mode)

  /**
   * QV-16 §5.13.4 / QV-ADR-020: releases a signed, proof-carrying partial decryption of spoiled ballots named by code.
   * Same gate as the tally (verified log, key binding, closed election, witnessed checkpoint). The caller supplies only
   * ballot codes: the ciphertext is always taken from the trustee's own analysis of the log. Refused, atomically for the
   * whole request, unless every code is (a) a verified spoil record in trustee mode (`reveal_digest` = 0, manifest
   * `spoil_trustee_decrypt`), (b) never cast (no cast envelope anywhere in the log carries it, even an invalid one, and it
   * is not in the counted set) and (c) not already released by this share (SPOIL_REPLAY).
   */
  async releaseSpoil(electionBundle: unknown, codes: readonly string[], opts: { witnessed?: boolean; override?: string } = {}): Promise<Packet> {
    this.mf();
    this.need('CONFIRMED', 'DRILLED', 'STANDBY', 'TALLYING', 'RELEASED');
    if (codes.length === 0 || codes.length > MAX_SPOIL_REQUEST || new Set(codes).size !== codes.length) throw new TrusteeError('USAGE', 'BAD_SPOIL_REQUEST', `1..${MAX_SPOIL_REQUEST} distinct ballot codes required`);
    for (const c of codes) if (!/^[0-9a-f]{64}$/.test(c)) throw new TrusteeError('USAGE', 'BAD_SPOIL_REQUEST', 'ballot code must be 64 lowercase hex characters');
    const done = this.d.out.spoil ?? {};
    // Replay is rejected before any log work: a code is released at most once per share.
    for (const c of codes) if (done[c] !== undefined) throw new TrusteeError('REFUSED', 'SPOIL_REPLAY', `ballot ${c} was already released by this share`);
    const { p, an, dv, i, ctx, sk, voter } = await this.verifiedElection(electionBundle, opts, 'released spoil share');
    if (p.manifest.spoil_trustee_decrypt !== true) throw new TrusteeError('REFUSED', 'SPOIL_MODE_OFF', 'the manifest does not enable trustee spoil decryption');
    const castCodes = new Set<string>(an.counted.map((c) => c.code));
    for (const { raw } of voter) {
      const e = raw as { intent?: unknown; body?: BallotBody };
      if (e.intent === 'cast' && e.body !== undefined) {
        try {
          castCodes.add(H(ballotCode(p.ctx, e.body)));
        } catch {
          // an undecodable cast cannot carry a requested code; the schema check in the verified analysis already flagged it
        }
      }
    }
    const key = { j: i, sj: sk, Yj: PT(dv.Yj) };
    const records: SignedRecord<SpoilShareBody>[] = [];
    for (const c of codes) {
      if (castCodes.has(c)) throw new TrusteeError('REFUSED', 'BALLOT_WAS_CAST', `ballot ${c} was cast; a cast ballot is never decrypted`);
      const rec = an.spoiled.get(c);
      if (rec === undefined) throw new TrusteeError('REFUSED', 'NOT_SPOILED', `no verified spoil record with ballot code ${c}`);
      const res = trusteeDecryptSpoiled(p, key, rec, this.deps.rng);
      if (!res.ok) throw new TrusteeError('REFUSED', res.error === 'E_TRUSTEE_REFUSE' ? 'NOT_TRUSTEE_MODE' : res.error, res.detail);
      const shares: SpoilShareBody['shares'] = [];
      for (const [k, sp] of res.value) {
        const [contest, opt] = k.split('/') as [string, string];
        const x = shareToHex(key.j, sp);
        shares.push({ contest, opt, M: x.M, c: x.c, s: x.s });
      }
      records.push(this.sign(ctx, { proto: PROTO_ID, type: 'spoil-share', ctx: dv.ctx, j: key.j, code: c, spoil_seq: rec.seq, shares }));
    }
    // Persist the replay guard before the shares leave this function.
    const out = (this.d.out.spoil ??= {});
    for (const r of records) out[r.body.code] = r;
    this.note(`released spoil shares for ${codes.length} ballot(s)`);
    await this.save();
    return this.packet('spoil-share', records);
  }

  // ------------------------------------------------------------------ backup / destroy / misc

  /** Writes a second encrypted copy of the bundle under `backupPass` (QV-17 §6.4). Opt-in, local only, counted in the transcript. */
  async backup(dest: string, backupPass: string): Promise<{ epoch: number }> {
    if (dest === this.path) throw new TrusteeError('USAGE', 'BACKUP_SAME_FILE');
    this.need(...(['KEYS_READY', ...PRE_STANDBY, 'STANDBY', 'TALLYING', 'RELEASED', 'AUDIT_WAIT', 'DISQUALIFIED', 'ABORTED'] as TrusteeState[]));
    assertPassphraseStrength(backupPass, this.deps.allowWeak === true);
    this.d.backup_epoch += 1;
    this.d.backups.push({ path: dest, at: this.deps.now().toISOString(), epoch: this.d.backup_epoch });
    this.note(`backup made (epoch ${this.d.backup_epoch})`);
    await writeBundle(dest, this.d, backupPass, this.deps);
    await this.save();
    return { epoch: this.d.backup_epoch };
  }

  /**
   * Post-audit destruction (QV-17 §11.2): verifies the coordinator-signed audit-close, requires the typed election title,
   * signs the attestation with sk_sign, then overwrites and removes the bundle and any known local backups. A tombstone
   * (public data only) keeps the command idempotent. Physical erasure of flash media is NOT guaranteed.
   */
  async destroy(auditClose: unknown, typedTitle: string): Promise<{ attestation: SignedRecord<KeyDestructionBody>; attestationPath: string; backupsRemoved: string[]; backupsMissing: string[]; reminders: string[] }> {
    const mfm = this.d.manifest;
    if (this.d.state === 'DESTROYED') throw new TrusteeError('STATE', 'DESTROYED');
    if (mfm !== undefined && typedTitle !== mfm.body.title) throw new TrusteeError('DECLINED', 'CONFIRMATION_MISMATCH', 'type the exact election title to confirm');
    const dv = this.d.derived;
    if (this.d.state !== 'DESTROYING' && this.d.state !== 'AUDIT_WAIT') {
      if (dv !== undefined) {
        const e = check(auditCloseSchema, auditClose);
        if (e !== null) throw new TrusteeError('REFUSED', 'NO_AUDIT_CLOSE', `audit-close record invalid: ${e}`);
        const ac = auditClose as MultiSignedRecord<AuditCloseBody>;
        const m = mfm!.body;
        if (ac.body.ctx !== dv.ctx || !verifyMultiSig(this.ctxBytes()!, ac, m.coordinator.keys, m.coordinator.m)) throw new TrusteeError('REFUSED', 'NO_AUDIT_CLOSE', 'audit-close lacks m valid coordinator signatures for this election');
        if (Date.parse(ac.body.closed_at) > this.deps.now().getTime()) throw new TrusteeError('REFUSED', 'AUDIT_WINDOW_OPEN', 'audit-close is dated in the future');
      } else if (!['KEYS_READY', 'ABORTED', 'DISQUALIFIED'].includes(this.d.state)) {
        throw new TrusteeError('REFUSED', 'NO_AUDIT_CLOSE', 'destroy a ceremony in progress only after abort');
      }
      if (this.d.state === 'RELEASED' || this.d.state === 'STANDBY' || this.d.state === 'CONFIRMED' || this.d.state === 'DRILLED' || this.d.state === 'KEYS_READY' || this.d.state === 'ABORTED' || this.d.state === 'DISQUALIFIED') this.go('AUDIT_WAIT');
      else throw new TrusteeError('STATE', 'WRONG_STATE', `cannot destroy from ${this.d.state}`);
    }
    if (this.d.state === 'AUDIT_WAIT') this.go('DESTROYING');
    if (this.d.out.attestation === undefined) {
      const scope = this.ctxBytes() ?? (mfm === undefined ? new Uint8Array(32) : manifestHash(mfm.body));
      const body: KeyDestructionBody = {
        proto: PROTO_ID, type: 'key-destruction', ctx: dv?.ctx ?? '00'.repeat(32), j: this.d.trustee_id ?? 0, destroyed_at: this.deps.now().toISOString(),
        method: 'overwrite+unlink of the encrypted bundle and known backups; passphrase and recipient to be destroyed by the trustee',
        statement: 'Self-attested: I have destroyed my election key share. This cannot be proven.',
      };
      this.d.out.attestation = this.sign(scope, body);
    }
    await this.save();
    const att = this.d.out.attestation;
    const attestationPath = `${this.path}.attestation.json`;
    await atomicWrite(attestationPath, jcs(att), 0o644);
    const removed: string[] = [];
    const missing: string[] = [];
    const rnd = (n: number): Uint8Array => this.deps.rng.bytes(n);
    for (const b of this.d.backups) (await shred(b.path, rnd)) ? removed.push(b.path) : missing.push(b.path);
    const tomb = { format: 'qv-share-destroyed/v1', election_id: this.d.election_id ?? '', trustee_id: this.d.trustee_id ?? 0, destroyed_at: att.body.destroyed_at, attestation_sha256: H(sha256(jcs(att))) };
    await atomicWrite(tombstonePath(this.path), jcs(tomb), 0o644);
    await shred(this.path, rnd);
    const reminders = [
      'Shred the passphrase card and delete any password-manager entry for this bundle.',
      'File deletion does not guarantee erasure of flash/SSD blocks; destroying the passphrase makes residual blocks useless.',
      ...(missing.length > 0 ? [`Backups not found at recorded paths (check manually): ${missing.join(', ')}`] : []),
      'Copies you did not register with this tool (USB sticks, mnemonic shares) must be destroyed by hand.',
    ];
    this.d = { ...this.d, state: 'DESTROYED' };
    return { attestation: att, attestationPath, backupsRemoved: removed, backupsMissing: missing, reminders };
  }

  /** Signed compromise report (QV-17-REQ-051); accepted in any state, does not change the state machine. */
  async reportCompromise(severity: CompromiseBody['severity'], affects: CompromiseBody['affects']): Promise<Packet> {
    const { mh, i } = this.mf();
    const body: CompromiseBody = { proto: PROTO_ID, type: 'trustee-compromise-report', manifest_hash: H(mh), j: i, severity, reported_at: this.deps.now().toISOString(), affects };
    const rec = this.sign(mh, body);
    this.d.out.compromise.push(rec);
    await this.save();
    return this.packet('compromise-report', [rec]);
  }

  /** Abort a ceremony in progress: all round secrets are wiped from the bundle. */
  async abort(reason: string): Promise<void> {
    if (!PRE_STANDBY.includes(this.d.state)) throw new TrusteeError('STATE', 'WRONG_STATE', `cannot abort from ${this.d.state}`);
    this.wipeCeremony();
    this.go('ABORTED');
    this.note(`aborted: ${reason}`);
    await this.save();
  }

  /** New ceremony: fresh signing key (QV-17-REQ-052), everything election-specific cleared. Prior public data stays in the log. */
  async restart(): Promise<{ sign_pk: string }> {
    this.need('ABORTED', 'DISQUALIFIED');
    if (this.d.state === 'DISQUALIFIED') this.go('ABORTED');
    this.wipeCeremony();
    const kp = ed25519Keypair(this.deps.rng.bytes(32));
    const keep = { backup_epoch: this.d.backup_epoch, backups: this.d.backups, created_at: this.d.created_at };
    this.d = { ...Trustee.blank(kp.secretKey, kp.publicKey, this.deps), ...keep, state: 'ABORTED' };
    this.go('KEYS_READY');
    this.note('restarted with fresh signing key');
    await this.save();
    return { sign_pk: this.d.sign_pk };
  }

  private wipeCeremony(): void {
    delete this.d.dealer;
    delete this.d.own_y;
    delete this.d.sk_i;
    this.d.received = {};
  }

  // ------------------------------------------------------------------ transcript / status

  async exportTranscript(mode: CeremonyMode, env: { network: 'online' | 'offline'; role?: 'trustee' } = { network: 'offline' }): Promise<Transcript> {
    const { mh, i } = this.mf();
    const mrec = this.d.manifest!;
    const r = await makeTranscript(mrec, this.d.log, this.d.ceremony_id!, mode);
    if (!r.ok) throw new TrusteeError('STATE', 'TRANSCRIPT_NOT_READY', r.error);
    return this.cosign(r.transcript, mh, i, env);
  }

  /** Verifies that the given transcript equals our own view, then adds our signature (trustee, with self-reported environment). */
  async cosignTranscript(t: Transcript, env: { network: 'online' | 'offline' } = { network: 'offline' }): Promise<Transcript> {
    const { mh, i } = this.mf();
    const mine = await buildCore(this.d.manifest!, t.log, this.d.ceremony_id!, t.mode);
    if (!mine.ok || mine.hash !== t.summary_hash) throw new TrusteeError('REFUSED', 'TRANSCRIPT_MISMATCH', 'transcript does not match what this device derived');
    if (this.d.derived !== undefined && (mine.core.ctx !== this.d.derived.ctx || mine.core.joint_key !== this.d.derived.K)) throw new TrusteeError('REFUSED', 'TRANSCRIPT_MISMATCH', 'transcript key differs from our share');
    return this.cosign(t, mh, i, env);
  }

  private cosign(t: Transcript, mh: Uint8Array, i: number, env: { network: 'online' | 'offline' }): Transcript {
    const sk = hexToBytes(this.d.sk_sign, 32);
    try {
      const sas = this.d.sas[this.d.sas.length - 1];
      return signTranscript(t, sk, hexToBytes(this.d.sign_pk, 32), mh, {
        role: 'trustee', signer: `T${i}`,
        self_reported: { network: env.network, storage: 'passphrase', backup_made: this.d.backups.length > 0 },
        ...(sas === undefined ? {} : { sas: { compared_with: sas.compared_with, result: 'match' as const } }),
        events: this.d.events.slice(-20),
      });
    } finally {
      wipe(sk);
    }
  }

  status(): Status {
    const d = this.d;
    const next: Record<TrusteeState, string> = {
      KEYS_READY: 'give your public key to the organizer; then join <manifest>', ACCEPTED: 'commit (after dkg-open is imported)', COMMITTED: 'reveal (after dkg-r1-open)',
      R1_DONE: 'shares (after dkg-r1-close)', R2_DONE: 'verify (after dkg-r2-close)', COMPLAINING: 'finalize (after dkg-r3-close)', VERIFIED: 'finalize (after dkg-r3-close)',
      KEY_DERIVED: 'compare the check words with another trustee, then confirm', CONFIRMED: 'drill (after dkg-final)', DRILLED: 'wait for election-open',
      STANDBY: 'tally release (after election-close)', TALLYING: 'tally release', RELEASED: 'wait for audit-close, then destroy', AUDIT_WAIT: 'destroy',
      DESTROYING: 'destroy (resume)', DESTROYED: 'nothing: share destroyed', ABORTED: 'restart', DISQUALIFIED: 'abort, then restart or destroy',
    };
    return {
      state: d.state, sign_pk: d.sign_pk, markers: this.markers(), next_action: next[d.state], backups: d.backups.length, backup_made: d.backups.length > 0,
      ...(d.trustee_id === undefined ? {} : { trustee_id: d.trustee_id }), ...(d.election_id === undefined ? {} : { election_id: d.election_id }),
      ...(d.ceremony_id === undefined ? {} : { ceremony_id: d.ceremony_id }),
      ...(d.derived === undefined ? {} : { fingerprint: { words: d.derived.fp_words, hex: d.derived.fp_hex }, qualified: d.derived.Q }),
    };
  }

  /** Test/diagnostic helper: serialized plaintext (never written by the tool except inside the sealed bundle). */
  debugPlaintext(): Uint8Array {
    return encodeBundle(this.d);
  }
}

// ---------------------------------------------------------------------------------------------- coordinator-side helpers

/** Collects verified `tally-share` records into the ShareSets that `decryptAggregates`/`buildTally` consume. */
export function collectTallyShares(
  m: Manifest,
  ctx: Uint8Array,
  records: readonly unknown[],
): { sets: Map<number, Map<string, { M: Point; c: Scalar; s: Scalar }>>; rejected: { j?: number; why: string }[] } {
  const sets = new Map<number, Map<string, { M: Point; c: Scalar; s: Scalar }>>();
  const rejected: { j?: number; why: string }[] = [];
  for (const raw of records) {
    const e = check(tallyShareRecordSchema, raw);
    if (e !== null) {
      rejected.push({ why: `schema: ${e}` });
      continue;
    }
    const rec = raw as SignedRecord<TallyShareBody>;
    const j = rec.body.j;
    if (rec.body.ctx !== H(ctx) || j > m.n) {
      rejected.push({ j, why: 'wrong ctx or index' });
      continue;
    }
    if (!verifySigForTrustee(m, ctx, rec)) {
      rejected.push({ j, why: 'bad signature' });
      continue;
    }
    if (sets.has(j)) {
      rejected.push({ j, why: 'duplicate' });
      continue;
    }
    try {
      const mp = new Map<string, { M: Point; c: Scalar; s: Scalar }>();
      for (const s of rec.body.shares) mp.set(`${s.contest}/${s.opt}`, { M: PT(s.M), c: sc(s.c), s: sc(s.s) });
      sets.set(j, mp);
    } catch {
      rejected.push({ j, why: 'undecodable share' });
    }
  }
  return { sets, rejected };
}

function verifySigForTrustee(m: Manifest, ctx: Uint8Array, rec: SignedRecord<TallyShareBody>): boolean {
  return verifySig(ctx, 'tally-share', rec.body, rec.sig, m.trustees[rec.body.j - 1]?.sign_pk);
}
