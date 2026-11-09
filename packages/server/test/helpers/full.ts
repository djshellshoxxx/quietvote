// A complete small election (3 trustees, threshold 2, a few voters) driven over HTTP up to ARCHIVED, plus raw-upload helpers.
import { createHash } from 'node:crypto';
import { signRecord } from '@quietvote/protocol';
import { bytesToHex, type Ed25519Keypair } from '@quietvote/crypto';
import { readTar, signRequest, writeTar } from '../../src/index.ts';
import { World, type Resp } from './world.ts';

const sel = (i: number): Record<string, string[]> => ({ budget: [i % 2 ? 'no' : 'yes'], chair: [['ann', 'bob', 'cy'][i % 3]!] });

export async function fullElection(seed: string, o: { server?: Record<string, unknown>; stopAt?: 'READY' | 'OPEN' | 'ARCHIVED' } = {}): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 4, witnessQuorum: 0, server: o.server as never });
  await w.start();
  await w.setupOrgAndElection();
  await w.registerVoters();
  const m = await w.publishManifest();
  if (m.status !== 201) throw new Error(`manifest ${m.status} ${m.text}`);
  await w.ceremony();
  if (o.stopAt === 'READY') return w;
  await w.open();
  for (let i = 0; i < 4; i++) {
    const r = await w.cast(i, sel(i));
    if (r.status !== 201) throw new Error(`cast ${r.status} ${r.text}`);
  }
  const r2 = await w.cast(1, { budget: ['yes'], chair: ['cy'] });
  if (r2.status !== 201) throw new Error(`recast ${r2.status} ${r2.text}`);
  const sp = await w.spoil(2, { budget: ['no'], chair: ['ann'] }, 'publish');
  if (sp.status !== 201) throw new Error(`spoil ${sp.status} ${sp.text}`);
  if (o.stopAt === 'OPEN') return w;
  const closed = await w.close();
  if (closed.status !== 201) throw new Error(`close ${closed.status} ${closed.text}`);
  for (const j of [1, 3]) {
    const r = await w.trusteeShares(j);
    if (r.status !== 201) throw new Error(`shares ${r.status} ${r.text}`);
    w.tick();
  }
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  const c0 = w.coord[0]!;
  const tr = await w.post('tally_result', c0, signRecord(c0.secretKey, c0.publicKey, w.params.ctx, draft.json.body));
  if (tr.status !== 201) throw new Error(`tally ${tr.status} ${tr.text}`);
  const ac = await w.post('audit_close', c0, w.control('audit-close'));
  if (ac.status !== 201) throw new Error(`audit_close ${ac.status} ${ac.text}`);
  return w;
}

export async function exportQvb(w: World, id = w.electionId): Promise<Uint8Array> {
  const r = await fetch(`${w.base}/api/v1/elections/${id}/export.qvb`);
  if (r.status !== 200) throw new Error(`export ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export interface UploadOpts {
  query?: string;
  key?: Ed25519Keypair | null;
  headers?: Record<string, string>;
  idem?: string | null;
  ts?: number;
  nonce?: Uint8Array;
  contentType?: string;
}
/** POST /imports with a signed request over the raw bytes. */
export async function upload(w: World, bytes: Uint8Array, o: UploadOpts = {}): Promise<Resp> {
  const path = `/api/v1/imports${o.query ?? `?org_id=${w.orgId}`}`;
  const headers: Record<string, string> = { 'content-type': o.contentType ?? 'application/x-tar', ...(o.headers ?? {}) };
  if (o.idem !== null) headers['idempotency-key'] = o.idem ?? bytesToHex(w.rng.bytes(12));
  const key = o.key === undefined ? w.owner : o.key;
  if (key) headers['authorization'] = signRequest(key.secretKey, key.publicKey, 'POST', path, w.audience, bytes, o.ts ?? w.nowSec, o.nonce ?? w.rng.bytes(16));
  const r = await fetch(w.base + path, { method: 'POST', headers, body: Buffer.from(bytes) });
  const text = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: r.status, headers: r.headers, json, text };
}

export async function waitJob(w: World, jobId: string, key = w.owner, timeoutMs = 120_000): Promise<any> {
  const t0 = Date.now();
  for (;;) {
    const r = await w.signed('GET', `/api/v1/jobs/${jobId}`, undefined, key);
    if (r.status !== 200) throw new Error(`job ${r.status} ${r.text}`);
    if (r.json.state === 'done' || r.json.state === 'failed') return r.json;
    if (Date.now() - t0 > timeoutMs) throw new Error('job timeout');
    await new Promise((res) => setTimeout(res, 25));
  }
}

/** Uploads and waits; returns the finished job. */
export async function importAndWait(w: World, bytes: Uint8Array, o: UploadOpts = {}, waitKey = w.owner): Promise<any> {
  const r = await upload(w, bytes, o);
  if (r.status !== 202) throw new Error(`upload ${r.status} ${r.text}`);
  return { ...(await waitJob(w, r.json.job_id, waitKey)), _first: r.json };
}

type Files = Map<string, Uint8Array>;
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Applies `edit` to the bundle files and re-seals the archive (SHA256SUMS, and bundle.json entries_sha256 unless asked not to). */
export function rewrite(tar: Uint8Array, edit: (f: Files) => void, o: { reseal?: boolean } = {}): Uint8Array {
  const f: Files = new Map(readTar(tar));
  edit(f);
  if (o.reseal !== false) {
    if (f.has('bundle.json') && f.has('log/entries.jsonl')) {
      try {
        const bj = JSON.parse(dec(f.get('bundle.json')!));
        bj.entries_sha256 = sha(f.get('log/entries.jsonl')!);
        f.set('bundle.json', enc(JSON.stringify(bj)));
      } catch {
        /* a deliberately broken bundle.json stays broken */
      }
    }
    f.delete('SHA256SUMS');
    const sums = [...f].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, d]) => `${sha(d)}  ${n}`).join('\n') + '\n';
    f.set('SHA256SUMS', enc(sums));
  }
  return writeTar([...f].map(([name, data]) => ({ name, data })));
}

export const entryLines = (f: Files): any[] => dec(f.get('log/entries.jsonl')!).trim().split('\n').map((l) => JSON.parse(l));
export const setEntryLines = (f: Files, lines: unknown[]): void => void f.set('log/entries.jsonl', enc(lines.map((l) => JSON.stringify(l)).join('\n') + '\n'));

/** Hand-built (possibly hostile) ustar archives. */
export function rawTar(files: { name: string; data: Uint8Array; type?: number; prefix?: string; badSum?: boolean; sizeLie?: number }[], o: { noEnd?: boolean; trailing?: Uint8Array; truncate?: number } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const f of files) {
    const h = new Uint8Array(512);
    h.set(enc(f.name), 0);
    h.set(enc('0000644\0'), 100);
    h.set(enc('0000000\0'), 108);
    h.set(enc('0000000\0'), 116);
    h.set(enc((f.sizeLie ?? f.data.length).toString(8).padStart(11, '0') + '\0'), 124);
    h.set(enc('00000000000\0'), 136);
    h.fill(0x20, 148, 156);
    h[156] = f.type ?? 0x30;
    h.set(enc('ustar\0'), 257);
    h.set(enc('00'), 263);
    if (f.prefix) h.set(enc(f.prefix), 345);
    let sum = 0;
    for (const b of h) sum += b;
    if (f.badSum) sum += 7;
    h.set(enc(sum.toString(8).padStart(6, '0') + '\0 '), 148);
    parts.push(h, f.data, new Uint8Array((512 - (f.data.length % 512)) % 512));
  }
  if (!o.noEnd) parts.push(new Uint8Array(1024));
  if (o.trailing) parts.push(o.trailing);
  let out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  if (o.truncate !== undefined) out = out.subarray(0, o.truncate);
  return out;
}
