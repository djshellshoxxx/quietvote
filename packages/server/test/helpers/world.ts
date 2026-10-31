// Test harness: an HTTP client playing organizer, trustees and voters against a real server instance.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEntry, b64u, unb64u, type EntryType } from '@quietvote/board';
import {
  baseMul, bytesToHex, ed25519Keypair, ed25519Sign, encryptShare as _e, jcs, parseQvJson, pointToBytes, polyEval, sha256, streamRng, utf8,
  type Ed25519Keypair, type Rng, type Scalar,
} from '@quietvote/crypto';
import {
  PROTO_ID, NO_SUPERSEDES, adjudicateDkg, analyzeBallotLog, buildBallot, checkDealing, dkgDeal, dkgFinalShare, dkgKeyconf, dkgMakeShares,
  dkgReceiveShare, makeCast, makeSpoil, manifestHash, rollRoot, shareToHex, signRecord, signRecordRaw, trusteeDecryptTally, trusteeDecryptSpoiled,
  type DealerSecret, type ElectionParams, type Manifest, type ManifestContest, type ParsedDealing, type Selections, type SpoilMode,
} from '@quietvote/protocol';
import { buildServer, signRequest, type QuietVoteServer } from '../../src/index.ts';
import type { ServerOptions } from '../../src/config.ts';

void _e; void baseMul; void pointToBytes; void ed25519Sign;
const H = bytesToHex;
export const kp = (seed: string, label: string): Ed25519Keypair => ed25519Keypair(sha256(utf8(`${seed}/${label}`)));

export const T_SETUP = Date.UTC(2026, 9, 25, 10, 0, 0);
export const T_VOTING = Date.UTC(2026, 10, 1, 10, 0, 0);

export interface Resp<T = any> {
  status: number;
  headers: Headers;
  json: T;
  text: string;
}

export function contests(): ManifestContest[] {
  const o = (...ids: string[]): { id: string; label: string }[] => ids.map((id) => ({ id, label: id.toUpperCase() }));
  return [
    { id: 'budget', title: 'Adopt the budget?', method: 'yes-no', options: o('yes', 'no'), selection_limit: 1, min_selections: 0,
      rule: { type: 'threshold', num: 1, den: 2, basis: 'yes+no', strict: true }, tie_break: { type: 'status-quo', option: 'no' } },
    { id: 'chair', title: 'Chair', method: 'single-choice', options: o('ann', 'bob', 'cy'), selection_limit: 1, min_selections: 0, tie_break: { type: 'lexicographic' } },
  ];
}

export interface WorldOpts {
  seed: string;
  n: number;
  t: number;
  voters: number;
  witnessQuorum?: number;
  spoilTrustees?: boolean;
  server?: Partial<ServerOptions>;
}

export class World {
  clock = T_SETUP;
  dir = mkdtempSync(join(tmpdir(), 'qv-'));
  logs: string[] = [];
  server!: QuietVoteServer;
  base = '';
  o: WorldOpts;
  rng: Rng;
  owner: Ed25519Keypair;
  coord: Ed25519Keypair[];
  trustees: Ed25519Keypair[];
  voters: Ed25519Keypair[];
  orgId = '';
  electionId = '';
  origin = '';
  logPkHex = '';
  manifest!: Manifest;
  mh!: Uint8Array;
  params!: ElectionParams;
  tkeys = new Map<number, { s: Scalar; Y: ReturnType<typeof baseMul> }>();
  Y!: Map<number, ReturnType<typeof baseMul>>;
  Q: number[] = [];
  rollHex: string[] = [];
  last = new Map<string, string>();
  audience = '';
  witnesses: Ed25519Keypair[] = [];

  constructor(o: WorldOpts) {
    this.o = o;
    this.rng = streamRng(o.seed);
    this.owner = kp(o.seed, 'owner');
    this.coord = [1, 2, 3].map((i) => kp(o.seed, `coord${i}`));
    this.trustees = Array.from({ length: o.n }, (_, i) => kp(o.seed, `trustee${i + 1}`));
    this.voters = Array.from({ length: o.voters }, (_, i) => kp(o.seed, `voter${i}`));
    this.witnesses = [kp(o.seed, 'w1')];
  }

  get nowSec(): number {
    return Math.floor(this.clock / 1000);
  }
  tick(sec = 3): void {
    this.clock += sec * 1000;
  }

  async start(): Promise<void> {
    this.server = buildServer({
      dataDir: this.dir, now: () => this.clock, logSink: (l) => this.logs.push(l), minFreeBytes: 0, minBallotIntervalSec: 2, auditWindowSec: 0,
      // The e2e flow does seconds of client-side proof work between requests (slow on CI runners); with the 5 s default the server
      // may close the idle keep-alive socket just as undici reuses it (ECONNRESET). Test-only; production default is unchanged.
      keepAliveTimeoutMs: 30_000,
      witnesses: [{ name: 'w1', publicKey: H(this.witnesses[0]!.publicKey) }],
      rate: {
        read: { limit: 100000, windowSec: 60 }, proof: { limit: 100000, windowSec: 60 }, writeKey: { limit: 100000, windowSec: 60 },
        writePre: { limit: 100000, windowSec: 60 }, auth: { limit: 100000, windowSec: 60 }, manage: { limit: 100000, windowSec: 60 },
        export: { limit: 100000, windowSec: 60 }, gossip: { limit: 100000, windowSec: 60 }, inviteFail: { limit: 100000, windowSec: 60 },
      },
      ...this.o.server,
    });
    const a = await this.server.start();
    this.base = a.url;
    this.audience = `qv:${(await this.get('/api/v1/instance')).json.instance_id}@http://localhost`;
  }

  async stop(): Promise<void> {
    await this.server.stop();
    rmSync(this.dir, { recursive: true, force: true });
  }

  async req(method: string, path: string, body?: unknown, o: { key?: Ed25519Keypair; headers?: Record<string, string>; raw?: Uint8Array; nonce?: Uint8Array; ts?: number } = {}): Promise<Resp> {
    const bytes = o.raw ?? (body === undefined ? new Uint8Array(0) : utf8(JSON.stringify(body)));
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (bytes.length > 0) headers['content-type'] = 'application/json';
    if (o.key) {
      headers['authorization'] = signRequest(o.key.secretKey, o.key.publicKey, method, path, this.audience, bytes, o.ts ?? this.nowSec, o.nonce ?? this.rng.bytes(16));
    }
    const r = await fetch(this.base + path, { method, headers, ...(bytes.length ? { body: Buffer.from(bytes) } : {}) });
    const text = await r.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: r.status, headers: r.headers, json, text };
  }
  get(path: string, headers?: Record<string, string>): Promise<Resp> {
    return this.req('GET', path, undefined, headers ? { headers } : {});
  }
  signed(method: string, path: string, body?: unknown, key = this.owner, extra: Record<string, string> = {}): Promise<Resp> {
    return this.req(method, path, body, { key, headers: extra });
  }
  idemKey(): Record<string, string> {
    return { 'idempotency-key': H(this.rng.bytes(12)) };
  }

  // ---- entries
  entry(type: EntryType, who: Ed25519Keypair, rec: unknown, origin = this.origin) {
    return buildEntry({ origin, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce: this.rng.bytes(16), createdAt: this.nowSec, body: jcs(rec) });
  }
  async post(type: EntryType, who: Ed25519Keypair, rec: unknown, election = this.electionId, origin = this.origin): Promise<Resp> {
    const e = this.entry(type, who, rec, origin);
    return this.submit(e.headerBytes, e.body, election);
  }
  async submit(header: Uint8Array, body: Uint8Array, election = this.electionId): Promise<Resp> {
    return this.req('POST', `/api/v1/elections/${election}/log/entries`, { header: b64u(header), body: b64u(body) });
  }
  async ok(type: EntryType, who: Ed25519Keypair, rec: unknown): Promise<Resp> {
    const r = await this.post(type, who, rec);
    if (r.status !== 201 && r.status !== 200) throw new Error(`${type} rejected: ${r.status} ${r.text}`);
    this.tick();
    return r;
  }
  async fetchLog(type?: string): Promise<{ seq: number; type: string; rec: any }[]> {
    const out: { seq: number; type: string; rec: any }[] = [];
    let from = 0;
    for (;;) {
      const r = await this.get(`/api/v1/elections/${this.electionId}/log/entries?from=${from}&limit=1000${type ? `&type=${type}` : ''}`);
      for (const e of r.json.entries) out.push({ seq: e.seq, type: e.type, rec: e.body_b64u ? parseQvJson(unb64u(e.body_b64u)!) : null });
      if (r.json.next_from === null) break;
      from = r.json.next_from;
    }
    return out;
  }

  // ---- multi-signed coordinator records (2 of 3)
  multi<B extends { type: string }>(scope: Uint8Array, body: B, signers = [0, 1]): { body: B; sigs: { key: string; sig: string }[] } {
    return { body, sigs: signers.map((i) => signRecordRaw(this.coord[i]!.secretKey, this.coord[i]!.publicKey, scope, body.type, body)) };
  }
  marker(name: string, scope: Uint8Array, extra: Record<string, unknown> = {}) {
    return this.multi(scope, { proto: PROTO_ID, type: 'marker', name, ...extra } as { type: string });
  }
  control(action: string, reason?: string) {
    return this.multi(this.mh, { proto: PROTO_ID, type: 'control', action, ...(reason ? { reason } : {}) } as { type: string });
  }

  // ---- setup stages
  async setupOrgAndElection(): Promise<void> {
    const o = this.owner;
    const body = { name: 'Riverside Co-op', owner_key: { pk: b64u(o.publicKey), alg: 'ed25519' } };
    // org registration is signed by the owner key itself (proof of possession)
    let r = await this.req('POST', '/api/v1/orgs', body, { key: o, headers: this.idemKey() });
    if (r.status !== 201) throw new Error(`org: ${r.status} ${r.text}`);
    this.orgId = r.json.org_id;
    r = await this.signed('POST', `/api/v1/orgs/${this.orgId}/elections`, { title: 'Annual meeting' }, o, this.idemKey());
    if (r.status !== 201) throw new Error(`election: ${r.status} ${r.text}`);
    this.electionId = r.json.election_id;
    this.origin = r.json.origin;
    this.logPkHex = r.json.log_pk_hex;
  }

  async registerVoters(): Promise<void> {
    const inv = await this.signed('POST', `/api/v1/elections/${this.electionId}/invites`, { count: this.voters.length }, this.owner, this.idemKey());
    if (inv.status !== 201) throw new Error(`invites ${inv.status} ${inv.text}`);
    const codes: { code: string }[] = inv.json.invites;
    for (let i = 0; i < this.voters.length; i++) {
      const v = this.voters[i]!;
      const pop = ed25519Sign(v.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${this.electionId}\0`), ...v.publicKey]));
      const r = await this.req('POST', `/api/v1/elections/${this.electionId}/registrations`, { invite_code: codes[i]!.code, pk: b64u(v.publicKey), alg: 'ed25519', pop: b64u(pop) });
      if (r.status !== 201) throw new Error(`register ${i}: ${r.status} ${r.text}`);
    }
    this.rollHex = this.voters.map((v) => H(v.publicKey)).sort();
  }

  buildManifest(): Manifest {
    const m: Manifest = {
      proto: PROTO_ID, type: 'manifest', election_id: this.electionId, title: 'Annual meeting', created: '2026-10-21T12:00:00Z',
      voting_open: '2026-11-01T09:00:00Z', voting_close: '2026-11-08T21:00:00Z', clock_skew_s: 300, contests: contests(),
      roll: { scheme: 'ed25519-roll-v1', weights: 'uniform' },
      trustees: this.trustees.map((k, i) => ({ index: i + 1, name: `T${i + 1}`, sign_pk: H(k.publicKey) })),
      n: this.o.n, t: this.o.t, coordinator: { keys: this.coord.map((k) => H(k.publicKey)), m: 2 },
      ballots: { max_per_voter: 4, max_spoils_per_voter: 4 }, bb: { log_id: H(sha256(utf8('log')).slice(0, 32)), log_pk: this.logPkHex, witness_quorum: this.o.witnessQuorum ?? 0 },
      privacy_ack: true,
      ...(this.o.spoilTrustees ? { spoil_trustee_decrypt: true } : {}),
    };
    return m;
  }

  async publishManifest(): Promise<Resp> {
    this.manifest = this.buildManifest();
    this.mh = manifestHash(this.manifest);
    const rec = this.multi(this.mh, this.manifest as unknown as { type: string });
    const r = await this.post('manifest', this.owner, rec);
    this.tick();
    return r;
  }

  private signT<B extends { type: string }>(i: number, body: B) {
    const k = this.trustees[i - 1]!;
    return signRecord(k.secretKey, k.publicKey, this.mh, body);
  }

  /** Runs the full DKG over HTTP, then roll commit. Leaves the election READY. */
  async ceremony(): Promise<void> {
    const { n, t } = this.o;
    const c0 = this.coord[0]!;
    await this.ok('ceremony_start', c0, this.marker('dkg-open', this.mh));
    const secrets = new Map<number, DealerSecret>();
    const deals = new Map<number, ReturnType<typeof dkgDeal>>();
    for (let i = 1; i <= n; i++) {
      const d = dkgDeal(this.mh, i, t, this.rng);
      secrets.set(i, d.secret);
      deals.set(i, d);
      await this.ok('dkg_round1', this.trustees[i - 1]!, this.signT(i, d.commit));
    }
    await this.ok('notice', c0, this.marker('dkg-r1-open', this.mh));
    for (let i = 1; i <= n; i++) await this.ok('dkg_round1', this.trustees[i - 1]!, this.signT(i, deals.get(i)!.body));
    await this.ok('notice', c0, this.marker('dkg-r1-close', this.mh));
    const parsed = new Map<number, ParsedDealing>();
    for (const e of await this.fetchLog('dkg_round1')) {
      if (e.rec.body.type === 'dkg-dealing') {
        const r = checkDealing(this.mh, t, e.rec.body);
        if (r.ok) parsed.set(r.value.i, r.value);
      }
    }
    for (let i = 1; i <= n; i++) {
      const pkg = await dkgMakeShares(this.mh, secrets.get(i)!, parsed, this.rng);
      await this.ok('dkg_round2', this.trustees[i - 1]!, this.signT(i, pkg));
    }
    await this.ok('notice', c0, this.marker('dkg-r2-close', this.mh));
    const shareLog = await this.fetchLog('dkg_round2');
    const received = new Map<number, Map<number, Scalar>>();
    for (let j = 1; j <= n; j++) {
      const mine = new Map<number, Scalar>([[j, polyEval(secrets.get(j)!.coeffs, j)]]);
      received.set(j, mine);
      for (const e of shareLog) {
        const i = e.rec.body.i as number;
        if (i === j) continue;
        const ent = e.rec.body.shares.find((s: { j: number }) => s.j === j);
        const r = await dkgReceiveShare(this.mh, j, secrets.get(j)!.e, parsed.get(i)!, ent);
        if (!r.ok) throw new Error('share failed');
        mine.set(i, r.y);
      }
    }
    await this.ok('notice', c0, this.marker('dkg-r3-close', this.mh));
    // every party adjudicates from the public log
    const log = await this.fetchLog();
    const mk: Record<string, number> = {};
    const take = (type: string) => log.filter((e) => e.rec?.body?.type === type).map((e) => ({ seq: e.seq, body: e.rec.body }));
    for (const e of log) if (e.rec?.body?.type === 'marker') mk[e.rec.body.name] = e.seq;
    mk['dkg-final'] = Number.MAX_SAFE_INTEGER;
    const adj = await adjudicateDkg({ mh: this.mh, n, t, markers: mk as never, commits: take('dkg-commit') as never, dealings: take('dkg-dealing') as never, shares: take('dkg-shares') as never, complaints: take('dkg-complaint') as never });
    if (!adj.ok) throw new Error(`dkg: ${adj.error}`);
    const { Q, ctx, Y } = adj.value;
    this.Q = Q;
    this.Y = Y;
    for (const j of Q) {
      const f = dkgFinalShare(Q, received.get(j)!, Y.get(j)!);
      if (!f.ok) throw new Error('final share');
      this.tkeys.set(j, { s: f.value, Y: Y.get(j)! });
      await this.ok('key_confirm', this.trustees[j - 1]!, this.signT(j, dkgKeyconf(ctx, j, Y.get(j)!, f.value, this.rng)));
    }
    await this.ok('joint_key', c0, this.marker('dkg-final', this.mh, { qmask: adj.value.qmask, K: H(adj.value.K.toBytes()) }));
    this.params = { manifest: this.manifest, mh: this.mh, K: adj.value.K, ctx };
    const rr = rollRoot(this.rollHex);
    if (!rr.ok) throw new Error('roll');
    await this.ok('roll_commit', c0, this.multi(this.mh, { proto: PROTO_ID, type: 'roll-commit', root: H(rr.value), size: this.rollHex.length } as { type: string }));
  }

  async open(override?: Record<string, unknown>): Promise<Resp> {
    this.clock = T_VOTING;
    return this.post('election_open', this.coord[0]!, this.openMarker({ ...(await this.openBinding()), ...override }));
  }
  /** QV-ADR-015: election-open binds (manifest_hash, joint_key_seq, roll_commit_seq); override fields to craft bad refs. */
  async openBinding(): Promise<{ manifest_hash: string; joint_key_seq: number; roll_commit_seq: number }> {
    const log = await this.fetchLog();
    return {
      manifest_hash: H(this.mh),
      joint_key_seq: log.find((e) => e.rec?.body?.name === 'dkg-final')!.seq,
      roll_commit_seq: log.find((e) => e.rec?.body?.type === 'roll-commit')!.seq,
    };
  }
  openMarker(binding?: Record<string, unknown>) {
    return this.marker('election-open', this.params.ctx, Object.fromEntries(Object.entries(binding ?? {}).filter(([, v]) => v !== undefined)));
  }
  async close(): Promise<Resp> {
    this.tick();
    return this.post('election_close', this.coord[0]!, this.marker('election-close', this.params.ctx));
  }

  // ---- voting
  voterIdx(i: number): Ed25519Keypair {
    return this.voters[i]!;
  }
  build(i: number, sel: Selections, supersedes?: string) {
    const v = this.voters[i]!;
    const sup = supersedes ?? this.last.get(H(v.publicKey)) ?? NO_SUPERSEDES;
    const r = buildBallot(this.params, v.secretKey, v.publicKey, sup, sel, this.rng, 0);
    if (!r.ok) throw new Error(`build ${r.error}`);
    return r.value;
  }
  async cast(i: number, sel: Selections): Promise<Resp> {
    const v = this.voters[i]!;
    const b = this.build(i, sel);
    const r = await this.post('ballot', v, makeCast(this.params, v.secretKey, b));
    if (r.status === 201) this.last.set(H(v.publicKey), H(b.code));
    this.tick();
    return r;
  }
  async spoil(i: number, sel: Selections, mode: SpoilMode = 'publish'): Promise<Resp> {
    const v = this.voters[i]!;
    const r = await this.post('ballot_audit', v, makeSpoil(this.params, v.secretKey, this.build(i, sel), mode));
    this.tick();
    return r;
  }

  // ---- tally
  async analysis() {
    const log = await this.fetchLog();
    const open = log.find((e) => e.rec?.body?.name === 'election-open')!.seq;
    const close = log.find((e) => e.rec?.body?.name === 'election-close')?.seq ?? (1 << 30);
    const env = log.filter((e) => e.rec && 'intent' in e.rec).map((e) => ({ seq: e.seq, raw: e.rec }));
    return analyzeBallotLog(this.params, new Set(this.rollHex), env, open, close);
  }
  /** A trustee-signed spoil-share record for `code` (QV-ADR-020); `tweak` mutates the body before signing. */
  async spoilShareRecord(j: number, code: string, tweak?: (b: any) => void, signer = j, ctx = this.params.ctx) {
    const an = await this.analysis();
    const rec = an.spoiled.get(code)!;
    const k = this.tkeys.get(j)!;
    const r = trusteeDecryptSpoiled(this.params, { j, sj: k.s, Yj: k.Y }, rec, this.rng);
    if (!r.ok) throw new Error(`trustee ${j}: ${r.error}`);
    const shares = [...r.value].map(([key, sp]) => {
      const [contest, opt] = key.split('/') as [string, string];
      return { contest, opt, ...(({ M, c, s }) => ({ M, c, s }))(shareToHex(j, sp)) };
    });
    const body: any = { proto: PROTO_ID, type: 'spoil-share', ctx: H(this.params.ctx), j, code, spoil_seq: rec.seq, shares };
    tweak?.(body);
    const tk = this.trustees[signer - 1]!;
    return signRecord(tk.secretKey, tk.publicKey, ctx, body);
  }
  postSpoilShare(rec: unknown): Promise<Resp> {
    return this.req('POST', `/api/v1/elections/${this.electionId}/spoil-shares`, rec);
  }
  async trusteeShares(j: number): Promise<Resp> {
    const log = await this.fetchLog();
    const open = log.find((e) => e.rec?.body?.name === 'election-open')!.seq;
    const close = log.find((e) => e.rec?.body?.name === 'election-close')!.seq;
    const env = log.filter((e) => e.rec && 'intent' in e.rec).map((e) => ({ seq: e.seq, raw: e.rec }));
    const an = analyzeBallotLog(this.params, new Set(this.rollHex), env, open, close);
    const k = this.tkeys.get(j)!;
    const r = trusteeDecryptTally(this.params, { j, sj: k.s, Yj: k.Y }, an.counted, undefined, this.rollHex.length, this.rng);
    if (!r.ok) throw new Error(`trustee ${j}: ${r.error}`);
    const shares = [...r.value].map(([key, sp]) => {
      const [contest, opt] = key.split('/') as [string, string];
      return { contest, opt, ...(({ M, c, s }) => ({ M, c, s }))(shareToHex(j, sp)) };
    });
    const body = { proto: PROTO_ID, type: 'dec-shares', j, shares };
    const tk = this.trustees[j - 1]!;
    return this.post('decryption_share', tk, signRecord(tk.secretKey, tk.publicKey, this.params.ctx, body));
  }
}
