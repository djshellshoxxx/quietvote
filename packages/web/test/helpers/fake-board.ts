// An in-process stand-in for the QuietVote board API (QV-09 subset), backed by a real protocol simulation, a real Merkle
// tree and real signed checkpoints/receipts. Used by unit tests (via FakeBoard.fetch) and by the browser e2e stub server.
import {
  MerkleTree, authorKeyId, bodyDigest, decodeHeader, encodeHeader, hashLeaf, signCheckpoint, signPromise, signedBytes,
  b64 as stdB64, type EntryHeader,
} from '@quietvote/board';
import { bytesToHex, ed25519Sign, jcs, parseQvJson, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import { logOrigin, signRecordRaw, verifyEnvelope, type ElectionBundle } from '@quietvote/protocol';
import { b64uDecode, b64uEncode } from '../../src/util/hex.ts';
import { kp, setup, defaultContests, bundleOf, type Sim, type SimOpts } from '../../../protocol/test/helpers/sim.ts';
import type { FetchLike } from '../../src/api/client.ts';

export type Fault = 'network' | 'timeout' | '503' | '429' | '500' | 'bad-body' | 'drop-response' | 'wrong-phase';

export interface StoredEntry {
  seq: number;
  headerBytes: Uint8Array;
  body: Uint8Array;
  leaf: Uint8Array;
  record: unknown;
}

export class FakeBoard {
  readonly sim: Sim;
  readonly apiId: string;
  readonly origin: string;
  readonly entries: StoredEntry[] = [];
  readonly tree = new MerkleTree();
  readonly logKey: Ed25519Keypair;
  readonly noteBySize = new Map<number, string>();
  closed = false;
  /** Faults consumed one per POST /log/entries. */
  faults: Fault[] = [];
  /** If true, appends return `sequenced` (promise only) and checkpoints are issued on demand. */
  lazyCheckpoints = false;
  requests: { method: string; url: string; body?: string; headers: Record<string, string> }[] = [];
  /** Hooks for tamper tests. */
  tamper: { inclusionPath?: boolean; rollbackTo?: number; forkRoot?: boolean } = {};
  private readonly author: Ed25519Keypair;

  constructor(sim: Sim, apiId = 'aaaaaaaaaaaaaaaaaaaaaaaaaa') {
    this.sim = sim;
    this.apiId = apiId;
    this.origin = logOrigin(sim.manifest); // as the real server: quietvote/v1/<base32 election_id> (QV-18 X-21)
    this.logKey = kp(sim.manifest.title.replace('Test election ', ''), 'log');
    this.author = kp('fake-board', 'author');
    const b = bundleOf(sim);
    this.appendRecord(b.manifest, 'manifest');
    for (const e of sim.log) this.appendRecord(e.entry, 'notice');
    this.checkpoint();
  }

  private appendRecord(record: unknown, type: EntryHeader['type']): StoredEntry {
    const body = jcs(record);
    const unsigned: EntryHeader = {
      v: 1, origin: this.origin, type, author: authorKeyId('ed25519', this.author.publicKey), authorAlg: 'ed25519',
      authorNonce: new Uint8Array(16).fill(this.entries.length & 0xff), createdAt: 1_790_000_000, bodyLen: body.length,
      bodyDigest: bodyDigest(body), refs: [], sig: new Uint8Array(0),
    };
    const headerBytes = encodeHeader({ ...unsigned, sig: ed25519Sign(this.author.secretKey, signedBytes(unsigned)) });
    return this.store({ seq: this.entries.length, headerBytes, body, leaf: hashLeaf(headerBytes), record });
  }
  private store(e: StoredEntry): StoredEntry {
    this.entries.push(e);
    this.tree.appendLeafHash(e.leaf);
    return e;
  }

  /** Issues (and remembers) a signed checkpoint for the current size. */
  checkpoint(): string {
    const size = this.tree.size;
    const root = this.tamper.forkRoot ? new Uint8Array(32).fill(7) : this.tree.root();
    const note = signCheckpoint(this.origin, size, root, this.logKey.secretKey, this.logKey.publicKey);
    this.noteBySize.set(size, note);
    return note;
  }

  /** Coordinator closes the election (ctx-scoped marker) and ballots stop being accepted. */
  close(): void {
    const body = { proto: 'qv1-r255-sha2', type: 'marker', name: 'election-close' };
    const c = this.sim.coord[0]!;
    this.appendRecord({ body, sigs: [signRecordRaw(c.secretKey, c.publicKey, this.sim.params!.ctx, 'marker', body)] }, 'notice');
    this.closed = true;
    this.checkpoint();
  }

  /** A bundle a verifier can check (the board's current log). */
  bundle(): ElectionBundle {
    const b = bundleOf(this.sim);
    return { ...b, log: this.entries.slice(1).map((e) => ({ seq: e.seq, entry: e.record })) };
  }

  logPkB64u(): string {
    return b64uEncode(this.logKey.publicKey);
  }

  private json(status: number, v: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(v), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers } });
  }
  private problem(status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
    return this.json(status, { type: `urn:quietvote:problem:${code}`, status, code, detail: extra.detail ?? code, retryable: status >= 500 || status === 429, request_id: 'req_fake', ...extra }, headers);
  }

  /** The `fetch` the ApiClient uses. */
  readonly fetch: FetchLike = async (input, init) => {
    const url = new URL(input, 'http://board.test');
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const rec: FakeBoard['requests'][number] = { method: init?.method ?? 'GET', url: url.pathname + url.search, headers };
    if (typeof init?.body === 'string') rec.body = init.body;
    this.requests.push(rec);
    return this.route(rec.method, url, init);
  };

  private async route(method: string, url: URL, init?: RequestInit): Promise<Response> {
    const p = url.pathname;
    const base = `/api/v1/elections/${this.apiId}`;
    if (p === '/api/v1/instance') return this.json(200, { instance_id: 'inst_fake', api_versions: ['1.0'], server_version: '0.0.0', protocol_suites: ['qv1-r255-sha2'], registration_mode: 'token', logging: { ip: false, user_agent: false } });
    if (p === base && method === 'GET') {
      return this.json(200, { election_id: this.apiId, origin: this.origin, log_pk: this.logPkB64u(), state: this.closed ? 'CLOSED' : 'OPEN', title: this.sim.manifest.title });
    }
    if (p === `${base}/state`) return this.json(200, { election_id: this.apiId, phase: this.closed ? 'CLOSED' : 'OPEN', tree_size: this.tree.size, witnessed: false, manifest_hash: bytesToHex(this.sim.mh), integrity: 'unwitnessed' });
    if (p === `${base}/roll`) return this.json(200, { items: this.sim.rollHex.map((pk, i) => ({ voter_kid: pk.slice(0, 16), pk: b64uEncode(hex(pk)), alg: 'ed25519', status: 'committed', roll_index: i })), next_cursor: null, roll_size: this.sim.rollHex.length, roll_root: this.sim.manifest.roll.root });
    if (p === `${base}/log/entries` && method === 'GET') {
      const from = Number(url.searchParams.get('from') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 1000);
      const slice = this.entries.slice(from, from + limit);
      const end = from + slice.length;
      return this.json(200, { entries: slice.map((e) => this.view(e)), from, next_from: end < this.entries.length ? end : null, tree_size: this.tree.size });
    }
    const one = /^\/api\/v1\/elections\/[a-z2-7]{26}\/log\/entries\/(\d+)$/.exec(p);
    if (one) {
      const e = this.entries[Number(one[1])];
      return e ? this.json(200, this.view(e)) : this.problem(404, 'NOT_FOUND');
    }
    if (p === `${base}/log/checkpoint`) {
      let size = this.tree.size;
      if (this.tamper.rollbackTo !== undefined) size = this.tamper.rollbackTo;
      const note = this.noteBySize.get(size) ?? (size === this.tree.size ? this.checkpoint() : undefined);
      if (this.tree.size > 0 && this.noteBySize.get(this.tree.size) === undefined) this.checkpoint();
      return note ? new Response(note, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) : this.problem(503, 'LOG_UNAVAILABLE');
    }
    if (p === `${base}/log/proof/inclusion`) {
      const seq = Number(url.searchParams.get('seq'));
      const size = Number(url.searchParams.get('tree_size') ?? this.tree.size);
      if (!Number.isInteger(seq) || seq >= size || size > this.tree.size) return this.problem(seq >= this.tree.size ? 404 : 400, seq >= this.tree.size ? 'NOT_FOUND' : 'BAD_REQUEST');
      const path = this.tree.inclusionProof(seq, size).map((h) => stdB64(h));
      if (this.tamper.inclusionPath && path.length > 0) path[0] = stdB64(new Uint8Array(32).fill(1));
      return this.json(200, { seq, leaf_hash: b64uEncode(this.entries[seq]!.leaf), tree_size: size, path });
    }
    if (p === `${base}/log/proof/consistency`) {
      const o = Number(url.searchParams.get('old'));
      const n = Number(url.searchParams.get('new') ?? this.tree.size);
      if (!(o <= n && n <= this.tree.size)) return this.problem(400, 'BAD_REQUEST');
      return this.json(200, { old_size: o, new_size: n, path: this.tree.consistencyProof(o, n).map((h) => stdB64(h)) });
    }
    if (p === `${base}/export.json`) return this.json(200, this.bundle());
    if (p === `${base}/log/entries` && method === 'POST') return this.append(init);
    return this.problem(404, 'NOT_FOUND');
  }

  private view(e: StoredEntry): unknown {
    return { seq: e.seq, type: 'notice', leaf_hash: b64uEncode(e.leaf), header_b64u: b64uEncode(e.headerBytes), body_b64u: b64uEncode(e.body) };
  }

  private append(init?: RequestInit): Response | Promise<Response> {
    const fault = this.faults.shift();
    if (fault === 'network') throw new TypeError('fetch failed');
    if (fault === 'timeout') return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    if (fault === '503') return this.problem(503, 'LOG_UNAVAILABLE');
    if (fault === '500') return this.problem(500, 'INTERNAL');
    if (fault === 'bad-body') return new Response('<html>oops</html>', { status: 502 });
    if (fault === '429') return this.problem(429, 'RATE_LIMITED', {}, { 'Retry-After': '1' });
    if (fault === 'wrong-phase' || this.closed) return this.problem(409, 'WRONG_PHASE', { detail: 'Election closed; ballots are no longer accepted.' });
    let sub: { header?: string; body?: string };
    try {
      sub = JSON.parse(String(init?.body)) as typeof sub;
    } catch {
      return this.problem(400, 'MALFORMED_ENTRY');
    }
    const hb = typeof sub.header === 'string' ? b64uDecode(sub.header) : undefined;
    const bb = typeof sub.body === 'string' ? b64uDecode(sub.body) : undefined;
    if (!hb || !bb) return this.problem(400, 'MALFORMED_ENTRY');
    const h = decodeHeader(hb);
    if (!h.ok) return this.problem(400, 'MALFORMED_ENTRY');
    const dup = this.entries.find((e) => bytesToHex(e.headerBytes) === bytesToHex(hb));
    if (dup) return this.receipt(dup, 200, fault);
    let record: unknown;
    try {
      record = parseQvJson(bb);
    } catch {
      return this.problem(422, 'ENTRY_INVALID', { reason: 'E_PARSE' });
    }
    const v = verifyEnvelope(this.sim.params!, new Set(this.sim.rollHex), record);
    if (!v.ok) return this.problem(v.error === 'E_VOTER_NOT_ELIGIBLE' ? 403 : 422, v.error === 'E_VOTER_NOT_ELIGIBLE' ? 'AUTHOR_NOT_AUTHORIZED' : 'ENTRY_INVALID', { reason: v.error });
    const wantType = v.value.intent === 'cast' ? 'ballot' : 'ballot_audit';
    if (h.value.type !== wantType) return this.problem(422, 'ENTRY_INVALID', { reason: 'E_STRUCTURE' });
    if (bytesToHex(h.value.author) !== bytesToHex(authorKeyId('ed25519', hex(v.value.voter)))) return this.problem(403, 'AUTHOR_NOT_AUTHORIZED');
    const e = this.store({ seq: this.entries.length, headerBytes: hb, body: bb, leaf: hashLeaf(hb), record });
    if (!this.lazyCheckpoints) this.checkpoint();
    return this.receipt(e, 201, fault);
  }

  private receipt(e: StoredEntry, status: number, fault: Fault | undefined): Response {
    const r = signPromise(this.logKey.secretKey, this.origin, e.seq, e.leaf, 1_790_000_000);
    const view: Record<string, unknown> = {
      origin: this.origin, seq: e.seq, leaf_hash: b64uEncode(e.leaf), promise: { sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline },
      promise_sig: b64uEncode(r.promiseSig),
    };
    let st = 'sequenced';
    const note = this.noteBySize.get(this.tree.size);
    if (!this.lazyCheckpoints && note !== undefined) {
      st = 'included';
      const path = this.tree.inclusionProof(e.seq, this.tree.size).map((h) => stdB64(h));
      if (this.tamper.inclusionPath && path.length > 0) path[0] = stdB64(new Uint8Array(32).fill(1));
      view.inclusion = { seq: e.seq, leaf_hash: b64uEncode(e.leaf), tree_size: this.tree.size, path, checkpoint_note: note };
    }
    if (fault === 'drop-response') throw new TypeError('connection reset');
    return this.json(status, { status: st, receipt: view });
  }
}

const hex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
void utf8;

export const TEST_CONTESTS = (): SimOpts['contests'] => {
  const c = defaultContests();
  return [c[0]!, { ...c[3]!, id: 'board', options: c[3]!.options.slice(0, 3), selection_limit: 2 }];
};

let cached: Promise<Sim> | undefined;
/** One shared 3-voter simulation (DKG n=3 t=2) for the whole test run. */
export function sharedSim(): Promise<Sim> {
  cached ??= setup({ seed: 'web-e2e', n: 3, t: 2, voters: 4, contests: TEST_CONTESTS()!, minCounted: 3 });
  return cached;
}
