// QV-ADR-027 regression tests (AI-assisted, unaudited):
//  - B2-07 rollback anchor: control.sqlite floor (option A) plus a gossip poll before a reopened log signs again (option B, "take max");
//    a DB behind the anchor opens quarantined (read-only) and never continues.
//  - B2-12 keyless runtimes never sign: duplicates on IMPORTED mirrors and reloaded ARCHIVED elections get 503 LOG_UNAVAILABLE (option A).
//  - B2-16 C-lite: the control `reason` is a QV-07 §15.2 catalog code, never free text.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseCheckpoint, signCheckpoint, verifyLogSignature } from '@quietvote/board';
import { bytesToHex, ed25519Keypair } from '@quietvote/crypto';
import { PROTO_ID } from '@quietvote/protocol';
import { open as unseal } from '../src/kek.ts';
import { CONTROL_REASONS } from '../src/records.ts';
import type { WebhookRequest, WebhookResponse } from '../src/ssrf.ts';
import { exportQvb, fullElection, importAndWait } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const admin = kp('adr027', 'admin');
const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.stop().catch(() => undefined);
});

async function mk(seed: string, server: Record<string, unknown> = {}, entries = 1): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 2, witnessQuorum: 0, server: { adminKeys: [H(admin.publicKey)], ...server } as never });
  await w.start();
  worlds.push(w);
  await w.setupOrgAndElection();
  await w.publishManifest();
  if (entries >= 2) await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  if (entries >= 3) await w.ok('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
  return w;
}

const dbFile = (w: World): string => join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
const SUFFIXES = ['', '-wal', '-shm'];
function snapshot(file: string, tag: string): string {
  for (const s of SUFFIXES) if (existsSync(file + s)) copyFileSync(file + s, `${file}.${tag}${s}`);
  return tag;
}
function restore(file: string, tag: string): void {
  for (const s of SUFFIXES) {
    rmSync(file + s, { force: true });
    if (existsSync(`${file}.${tag}${s}`)) copyFileSync(`${file}.${tag}${s}`, file + s);
  }
}
const state = async (w: World) => (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
const cpSize = async (w: World): Promise<number> => {
  const p = parseCheckpoint((await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text);
  assert.ok(p.ok);
  return p.value.size;
};
async function logKey(w: World): Promise<{ sk: Uint8Array; pk: Uint8Array }> {
  const env = w.server.env;
  const reg = env.control.election(w.electionId)!;
  const rt = (await w.server.pool.get(w.electionId))!;
  const dek = unseal(env.kek, reg.dek_wrapped!, `dek:${w.electionId}`);
  return { sk: unseal(dek, rt.edb.row().log_sk_enc!, 'log_sk'), pk: rt.logPk };
}

// ------------------------------------------------------------------------------------------------ B2-07 option A (local floor)

test('B2-07: restoring an older election DB is detected on open: quarantined, read-only, no second root for a signed size', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-restore', {}, 1);
  const id = w.electionId;
  const file = dbFile(w);
  const env = w.server.env;
  assert.equal(env.control.logAnchor(id)?.size, 1, 'the first signed checkpoint is anchored');
  await w.server.pool.closeAll();
  const old = snapshot(file, 'old');
  await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  assert.equal(env.control.logAnchor(id)?.size, 2, 'anchor raised with the new checkpoint');
  const signed2 = parseCheckpoint((await w.get(`/api/v1/elections/${id}/log/checkpoint`)).text);
  assert.ok(signed2.ok && signed2.value.size === 2);
  await w.server.pool.closeAll();
  const fresh = snapshot(file, 'new');
  restore(file, old); // operator restores yesterday's DB

  const st = await state(w);
  assert.equal(st.integrity, 'quarantined');
  const rt = (await w.server.pool.get(id))!;
  assert.match(rt.quarantineReason() ?? '', /^ROLLBACK: tree size 1 is behind the trusted anchor size 2/);
  // never continue: no append, so no second checkpoint at size 2 (the B2-07 PoC signed one)
  const cancel = await w.post('election_cancel', w.coord[0]!, w.control('cancel'));
  assert.equal(cancel.status, 503, cancel.text);
  assert.equal(cancel.json.code, 'QUARANTINED');
  const again = await w.post('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  assert.equal(again.status, 503);
  assert.equal(rt.edb.store.getCheckpoint(2), undefined, 'no checkpoint of size 2 exists in the restored DB');
  assert.equal(await cpSize(w), 1);
  assert.equal((await w.get(`/api/v1/elections/${id}/log/entries?from=0`)).status, 200, 'reads continue');
  // the registry flag is set (admin status) and the operator cannot clear it while the DB is behind
  const s = await w.signed('GET', '/api/v1/admin/status', undefined, admin);
  assert.deepEqual(s.json.quarantined, [id]);
  const incident = `inc_${createHash('sha256').update(rt.quarantineReason()!).digest('base64url').slice(0, 12)}`;
  const c = await w.signed('POST', `/api/v1/admin/elections/${id}/quarantine/clear`, { ack: incident, verified_against: ['witness:w1'] }, admin, w.idemKey());
  assert.equal(c.status, 409, c.text);
  assert.match(c.json.detail, /behind the rollback anchor.*restore the newer database first/);
  // a restart does not forget it (the anchor is not in the election DB)
  await w.server.pool.closeAll();
  assert.equal((await state(w)).integrity, 'quarantined');

  // recovery: restore the newer DB; the log reproduces the anchor and continues
  await w.server.pool.closeAll();
  restore(file, fresh);
  assert.notEqual((await state(w)).integrity, 'quarantined');
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
  const next = await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
  assert.equal(next.status, 201, next.text);
  assert.equal(env.control.logAnchor(id)?.size, 3);
  assert.deepEqual((await w.signed('GET', '/api/v1/admin/status', undefined, admin)).json.quarantined, []);
});

test('B2-07: a same-size DB with a different history is quarantined; the anchor is never lowered or overwritten', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-fork', {}, 2);
  const id = w.electionId;
  const env = w.server.env;
  const a = env.control.logAnchor(id)!;
  assert.equal(a.size, 2);
  assert.equal(env.control.raiseLogAnchor(id, 1, new Uint8Array(32)), 'kept', 'a smaller size never lowers the anchor');
  assert.equal(env.control.raiseLogAnchor(id, 2, new Uint8Array(32).fill(7)), 'conflict', 'same size, other root: reported, not stored');
  assert.deepEqual(env.control.logAnchor(id), a);
  assert.throws(() => env.control.raiseLogAnchor(id, -1, a.root), /bad anchor/);
  assert.throws(() => env.control.raiseLogAnchor(id, 3, new Uint8Array(31)), /bad anchor/);
  // simulate an anchor recorded for another history of size 2 (e.g. the DB of a forked/replaced log)
  env.control.db.prepare('UPDATE election_registry SET anchor_root=? WHERE election_id=?').run(new Uint8Array(32).fill(9), id);
  await w.server.pool.closeAll();
  const rt = (await w.server.pool.get(id))!;
  assert.match(rt.quarantineReason() ?? '', /^ROLLBACK: tree root at size 2 differs from the trusted anchor/);
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
  assert.equal(new Uint8Array(env.control.logAnchor(id)!.root)[0], 9, 'a quarantined log never re-anchors');
});

test('B2-07: crash window and first use: a DB ahead of (or without) an anchor re-anchors on open and stays healthy', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-reanchor', {}, 2);
  const id = w.electionId;
  const env = w.server.env;
  const rt0 = (await w.server.pool.get(id))!;
  const root1 = rt0.log.root(1);
  // pre-migration election: no anchor recorded (trust on first use)
  env.control.db.prepare('UPDATE election_registry SET anchor_size=NULL, anchor_root=NULL WHERE election_id=?').run(id);
  await w.server.pool.closeAll();
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
  assert.equal(env.control.logAnchor(id)?.size, 2);
  // crash after the election-DB commit, before the anchor write: anchor one checkpoint behind the DB
  env.control.db.prepare('UPDATE election_registry SET anchor_size=1, anchor_root=? WHERE election_id=?').run(root1, id);
  await w.server.pool.closeAll();
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
  assert.equal(env.control.logAnchor(id)?.size, 2, 'raised to the newest stored checkpoint');
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 201);
});

test('B2-07: if the anchor cannot be persisted the new checkpoint is not released; the reload re-anchors from the DB', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-anchorfail', {}, 2);
  const id = w.electionId;
  const control = w.server.env.control;
  const orig = control.raiseLogAnchor;
  control.raiseLogAnchor = () => {
    throw new Error('disk I/O error');
  };
  let r;
  try {
    r = await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
  } finally {
    control.raiseLogAnchor = orig;
  }
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.code, 'LOG_UNAVAILABLE');
  assert.equal(r.json.receipt, undefined, 'no receipt released');
  assert.equal(control.logAnchor(id)?.size, 2);
  // the poisoned runtime is reloaded on the next access and anchors what the DB committed
  assert.equal(await cpSize(w), 3);
  assert.equal(control.logAnchor(id)?.size, 3);
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
});

// ------------------------------------------------------------------------------------------------ B2-07 option B (gossip poll, take max)

const sent: WebhookRequest[] = [];
let reply: (r: WebhookRequest) => WebhookResponse | Error = () => new Error('unset');
const peerOpts = {
  gossipPeers: ['https://peer.example'],
  gossipResolver: async (h: string) => (h === 'peer.example' ? [{ address: '93.184.216.34', family: 4 as const }] : Promise.reject(new Error('ENOTFOUND'))),
  gossipTransport: async (r: WebhookRequest): Promise<WebhookResponse> => {
    sent.push(r);
    const x = reply(r);
    if (x instanceof Error) throw x;
    return x;
  },
};
const json = (o: unknown, status = 200): WebhookResponse => ({ status, truncated: false, body: Buffer.from(JSON.stringify(o)) });

test('B2-07: a reopened log polls the peers before it signs; a newer head signed by our key quarantines it and raises the anchor', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-boot', peerOpts, 2);
  const id = w.electionId;
  const env = w.server.env;
  assert.equal(sent.length, 0, 'a runtime that started empty does not poll');
  // whole-disk restore: control.sqlite and the election DB are both old, but a witness/peer holds a newer head our key signed
  const k = await logKey(w);
  const ahead = signCheckpoint(w.origin, 40, new Uint8Array(32).fill(0x33), k.sk, k.pk);
  await w.server.pool.closeAll();
  sent.length = 0;
  reply = () => json({ latest_note: ahead, consistent: false });
  const r = await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
  assert.equal(sent.length, 1, 'one exchange before the first signature');
  assert.deepEqual(JSON.parse(sent[0]!.body.toString()).note.split('\n')[1], '2', 'our latest (size 2) note was offered');
  assert.equal(r.status, 503, r.text);
  assert.equal(r.json.code, 'QUARANTINED');
  assert.equal(await cpSize(w), 2, 'nothing new was signed');
  assert.equal(env.control.logAnchor(id)?.size, 40, 'take max: the anchor follows the newest log-signed head');
  // even if the election DB's own quarantine marker is lost (restored again), the anchor keeps the log read-only
  (await w.server.pool.get(id))!.edb.setQuarantine(null);
  await w.server.pool.closeAll();
  reply = () => new Error('peer down');
  const rt = (await w.server.pool.get(id))!;
  assert.match(rt.quarantineReason() ?? '', /^ROLLBACK: tree size 2 is behind the trusted anchor size 40/);
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
});

test('B2-07: an unreachable or consistent peer does not block; the poll runs once per open; junk never raises the anchor', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-boot2', peerOpts, 2);
  const id = w.electionId;
  const env = w.server.env;
  await w.server.pool.closeAll();
  sent.length = 0;
  reply = () => new Error('ECONNREFUSED');
  const f0 = w.server.gossip.stats.failed;
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 201);
  assert.equal(sent.length, 1);
  assert.equal(w.server.gossip.stats.failed, f0 + 1);
  assert.equal(env.control.logAnchor(id)?.size, 3, 'the local floor still advances');
  await w.server.pool.closeAll();
  sent.length = 0;
  // a peer answering with a note signed by somebody else, or with our own current note, changes nothing
  const other = ed25519Keypair();
  reply = () => json({ latest_note: signCheckpoint(w.origin, 99, new Uint8Array(32).fill(1), other.secretKey, other.publicKey) });
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-close', w.mh))).status, 201);
  assert.equal(sent.length, 1);
  assert.equal(env.control.logAnchor(id)?.size, 4);
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
  // no second poll on the same runtime
  assert.equal((await w.post('notice', w.coord[0]!, w.control('security-notice'))).status, 201);
  assert.equal(sent.length, 1, 'later appends on the same runtime do not poll again');
  assert.equal((await w.server.pool.get(id))!.quarantineReason(), undefined);
});

// ------------------------------------------------------------------------------------------------ B2-12 keyless runtimes never sign

test('B2-12: duplicates on a reloaded ARCHIVED election and on an IMPORTED mirror get 503 LOG_UNAVAILABLE, never a zero-seed receipt', { timeout: 240_000 }, async () => {
  const A = await fullElection('adr027-keyless');
  worlds.push(A);
  const id = A.electionId;
  assert.equal((await A.get(`/api/v1/elections/${id}/state`)).json.phase, 'ARCHIVED');
  const entries = (await A.get(`/api/v1/elections/${id}/log/entries?from=0&limit=1000`)).json.entries as { header_b64u: string; body_b64u: string }[];
  const e1 = entries[1]!;
  const resubmit = (w: World) => w.req('POST', `/api/v1/elections/${id}/log/entries`, { header: e1.header_b64u, body: e1.body_b64u });
  const zero = ed25519Keypair(new Uint8Array(32)).publicKey;
  // after a reload the ARCHIVED runtime has no log key (erased at audit_close)
  await A.server.pool.closeAll();
  const rtA = (await A.server.pool.get(id))!;
  assert.equal(rtA.log.canSign, false);
  const d = await resubmit(A);
  assert.equal(d.status, 503, d.text);
  assert.equal(d.json.code, 'LOG_UNAVAILABLE');
  assert.equal(d.json.receipt, undefined);
  assert.equal(rtA.log.size, entries.length, 'nothing appended');
  // reads still serve the genuinely signed checkpoint (and nothing verifies under the zero-seed key)
  const note = parseCheckpoint((await A.get(`/api/v1/elections/${id}/log/checkpoint`)).text);
  assert.ok(note.ok && verifyLogSignature(note.value, rtA.logPk) && !verifyLogSignature(note.value, zero));

  // IMPORTED mirror: never had the key
  const B = new World({ seed: 'adr027-mirror', n: 3, t: 2, voters: 1, server: { adminKeys: [H(admin.publicKey)] } as never });
  await B.start();
  worlds.push(B);
  await B.setupOrgAndElection();
  const job = await importAndWait(B, await exportQvb(A));
  assert.equal(job.state, 'done', JSON.stringify(job));
  const rtB = (await B.server.pool.get(id))!;
  assert.equal(rtB.imported, true);
  assert.equal(rtB.log.canSign, false);
  const m = await resubmit(B);
  assert.equal(m.status, 503, m.text);
  assert.equal(m.json.code, 'LOG_UNAVAILABLE');
  assert.equal(m.json.receipt, undefined);
  // a non-duplicate append to the mirror is still refused by phase (unchanged contract)
  const late = await B.post('notice', A.coord[0]!, A.control('security-notice'), id, A.origin);
  assert.ok(late.status === 409 || late.status === 503, `${late.status} ${late.text}`);
  // and the mirror never records an anchor for a log it does not own
  assert.equal(B.server.env.control.logAnchor(id), undefined);
});

// ------------------------------------------------------------------------------------------------ B2-16 C-lite

test('B2-16: CONTROL_REASONS is exactly the QV-07 §15.2 catalog', () => {
  const doc = readFileSync(new URL('../../../docs/07-threat-model-security.md', import.meta.url), 'utf8');
  const head = doc.indexOf('### 15.2 Reason codes');
  const sec = doc.slice(head).split('\n')[1]!; // the catalog line itself (the amendment note below it repeats `OTHER`)
  const codes = [...sec.matchAll(/`([A-Z][A-Z_]+)`/g)].map((m) => m[1]);
  assert.deepEqual(codes, [...CONTROL_REASONS]);
});

test('B2-16: a control record reason must be a catalog code; free text is refused and leaves no trace in the log', { timeout: 60_000 }, async () => {
  const w = await mk('adr027-reason', {}, 2); // CEREMONY: notices are accepted
  const size = async () => (await w.get(`/api/v1/elections/${w.electionId}`)).json.tree_size as number;
  const n0 = await size();
  const raw = (reason: unknown) => w.multi(w.mh, { proto: PROTO_ID, type: 'control', action: 'security-notice', reason } as { type: string });
  for (const bad of [42, true, ['AVAILABILITY'], { code: 'AVAILABILITY' }]) {
    const r = await w.post('notice', w.coord[0]!, raw(bad));
    assert.equal(r.status, 422, `${JSON.stringify(bad)}: ${r.text}`);
  }
  for (const bad of ['maintenance', 'x'.repeat(300), 'availability', 'OTHER: server moved to new host', ' AVAILABILITY', '']) {
    const r = await w.post('notice', w.coord[0]!, w.control('security-notice', bad === '' ? undefined : bad));
    if (bad === '') {
      assert.equal(r.status, 201, 'no reason at all is still accepted');
      continue;
    }
    assert.equal(r.status, 422, `${JSON.stringify(bad.slice(0, 20))}: ${r.status} ${r.text}`);
    assert.match(r.text, /E_SCHEMA/);
  }
  const n1 = await size();
  assert.equal(n1, n0 + 1, 'only the reason-less notice was appended');
  for (const good of ['AVAILABILITY', 'OTHER', 'BOARD_ROLLBACK']) {
    const r = await w.post('notice', w.coord[0]!, w.control('security-notice', good));
    assert.equal(r.status, 201, `${good}: ${r.text}`);
  }
  assert.equal(await size(), n1 + 3);
  const log = await w.fetchLog('notice');
  assert.deepEqual(log.map((e) => e.rec.body.reason).filter((x) => x !== undefined), ['AVAILABILITY', 'OTHER', 'BOARD_ROLLBACK']);
});
