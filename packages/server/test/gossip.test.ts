// Checkpoint gossip (QV-09 POST /gossip/checkpoints, QV-18 §9.5-9.6): inbound validation, consistency answers, equivocation
// evidence + fail-closed quarantine, admin clearing, and outbound exchange through the SSRF policy.
import test from 'node:test';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { b64u, checkFork, cosignLine, parseCheckpoint, signCheckpoint, unb64, unb64u, verifyConsistency } from '@quietvote/board';
import { bytesToHex, ed25519Keypair } from '@quietvote/crypto';
import { open as unseal } from '../src/kek.ts';
import type { WebhookRequest, WebhookResponse } from '../src/ssrf.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const admin = kp('gossip', 'admin');
const GP = '/api/v1/gossip/checkpoints';

async function mk(seed: string, server: Record<string, unknown> = {}, entries = 1): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 2, witnessQuorum: 0, server: { adminKeys: [H(admin.publicKey)], ...server } as never });
  await w.start();
  await w.setupOrgAndElection();
  await w.publishManifest();
  if (entries >= 2) await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  if (entries >= 3) await w.ok('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
  return w;
}

/** What an attacker who stole the log key (or a rolled-back operator) can sign. */
async function logKey(w: World): Promise<{ sk: Uint8Array; pk: Uint8Array }> {
  const env = w.server.env;
  const reg = env.control.election(w.electionId)!;
  const rt = (await w.server.pool.get(w.electionId))!;
  const dek = unseal(env.kek, reg.dek_wrapped!, `dek:${w.electionId}`);
  return { sk: unseal(dek, rt.edb.row().log_sk_enc!, 'log_sk'), pk: rt.logPk };
}
const forge = async (w: World, size: number, fill: number): Promise<string> => {
  const k = await logKey(w);
  return signCheckpoint(w.origin, size, new Uint8Array(32).fill(fill), k.sk, k.pk);
};
const latest = async (w: World): Promise<string> => (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
const post = (w: World, note: unknown, extra: Record<string, unknown> = {}) => w.req('POST', GP, { note, ...extra });
const state = async (w: World) => (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;

test('inbound: same / older notes are consistent, older ones come with a verifying proof; rows are bounded and deduped', async () => {
  const w = await mk('g-basic', {}, 3);
  try {
    const cur = await latest(w);
    const curP = parseCheckpoint(cur);
    assert.ok(curP.ok && curP.value.size === 3);
    let r = await post(w, cur);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.consistent, true);
    assert.equal(r.json.relation, 'same');
    assert.equal(r.json.latest_note, cur);
    // an older note we signed
    const cps = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoints?limit=10`)).json.items;
    const old = cps.find((c: { tree_size: number }) => c.tree_size === 1);
    r = await post(w, old.note);
    assert.equal(r.status, 200);
    assert.equal(r.json.relation, 'peer_behind');
    assert.equal(r.json.consistent, true);
    assert.equal(r.json.proof.old_size, 1);
    assert.equal(r.json.proof.new_size, 3);
    assert.ok(verifyConsistency(1, 3, unb64(old.root)!, parseCheckpoint(cur).ok ? (parseCheckpoint(cur) as any).value.root : new Uint8Array(), r.json.proof.path.map((p: string) => unb64(p)!)));
    // extra (garbage) signature lines do not create new rows
    const rt = (await w.server.pool.get(w.electionId))!;
    const before = rt.edb.gossipCount();
    for (let i = 0; i < 5; i++) {
      const extra = cur + `— peer${i} ${Buffer.from(new Uint8Array(40).fill(i + 1)).toString('base64')}\n`;
      assert.equal((await post(w, extra)).status, 200);
    }
    assert.equal(rt.edb.gossipCount(), before, 'rows are keyed by the signed text, not by the note with its extra lines');
    assert.equal((await state(w)).integrity, 'ok');
  } finally {
    await w.stop();
  }
});

test('inbound: strict validation, bounded sizes, no oracle, no quarantine from junk', async () => {
  const w = await mk('g-neg', { rate: { gossip: { limit: 100000, windowSec: 60 } } }, 2);
  try {
    const cur = await latest(w);
    const bad = async (body: unknown, status: number, code?: string, headers?: Record<string, string>) => {
      const r = await w.req('POST', GP, body, headers ? { headers } : {});
      assert.equal(r.status, status, `${JSON.stringify(body).slice(0, 60)} -> ${r.status} ${r.text.slice(0, 120)}`);
      if (code) assert.equal(r.json.code, code);
      return r;
    };
    await bad({}, 400, 'BAD_REQUEST');
    await bad({ note: cur, x: 1 }, 400, 'UNKNOWN_FIELD');
    await bad({ note: 5 }, 400);
    await bad({ note: '' }, 400);
    await bad({ note: 'x'.repeat(8193) }, 400);
    await bad({ note: cur.replace('\n', '\r\n') }, 400);
    await bad({ note: cur + '\u0000' }, 400);
    await bad({ note: cur + '‮' }, 400);
    await bad({ note: cur + 'é\n' }, 400);
    await bad({ note: `${cur}${'— x AAAAAAAAAA\n'.repeat(40)}` }, 400);
    await bad({ note: 'not a note at all, really not' }, 400);
    await bad({ note: cur.split('\n\n')[0] + '\n\n' }, 400); // no signature line
    await bad([cur], 400);
    const raw = await fetch(w.base + GP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"note":' });
    assert.equal(raw.status, 400);
    const ct = await fetch(w.base + GP, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ note: cur }) });
    assert.equal(ct.status, 415);
    const dup = await fetch(w.base + GP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"note":${JSON.stringify(cur)},"note":${JSON.stringify(cur)}}` });
    assert.ok(dup.status >= 400 && dup.status < 500, 'duplicate keys are not accepted');
    assert.equal((await fetch(w.base + GP)).status, 405);
    // unknown or malformed origins answer alike
    const other = signCheckpoint('quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa', 3, new Uint8Array(32), ed25519Keypair().secretKey, ed25519Keypair().publicKey);
    assert.equal((await post(w, other)).status, 404);
    const odd = signCheckpoint('somewhere/else', 3, new Uint8Array(32), ed25519Keypair().secretKey, ed25519Keypair().publicKey);
    assert.equal((await post(w, odd)).status, 404);
    // right origin, wrong key: 422, and nothing is concluded about our log
    const k = ed25519Keypair();
    const wrong = signCheckpoint(w.origin, 99, new Uint8Array(32).fill(7), k.secretKey, k.publicKey);
    const r = await post(w, wrong);
    assert.equal(r.status, 422);
    assert.equal(r.json.reason, 'BAD_SIGNATURE');
    // a valid signature line from the right key name but over another text
    const t = parseCheckpoint(cur);
    assert.ok(t.ok);
    const spliced = cur.split('\n\n')[0]!.replace(/\n(\d+)\n/, '\n$1000\n') + '\n\n' + cur.split('\n\n')[1];
    assert.equal((await post(w, spliced)).status, 422);
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.quarantineReason(), undefined);
    assert.equal(rt.edb.evidenceCount(), 0);
    assert.equal((await state(w)).integrity, 'ok');
    // appends still work
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 201);
  } finally {
    await w.stop();
  }
});

test('inbound: a link election requires its read key (no existence or tree-size oracle)', async () => {
  const w = await mk('g-link', {}, 1);
  try {
    const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Private', access: 'link' }, w.owner, w.idemKey());
    assert.equal(r.status, 201, r.text);
    const key = r.json.read_key as string;
    const id = r.json.election_id as string;
    const lk = ed25519Keypair();
    const note = signCheckpoint(r.json.origin, 1, new Uint8Array(32), lk.secretKey, lk.publicKey);
    const a = await post(w, note);
    assert.equal(a.status, 403);
    assert.equal(a.json.code, 'READ_KEY_REQUIRED');
    const b = await w.req('POST', GP, { note }, { headers: { 'qv-read-key': key } });
    assert.equal(b.status, 422, 'with the key the note is judged (and rejected: not signed by the log key)');
    void id;
  } finally {
    await w.stop();
  }
});

test('inbound: a validly signed note that forks our history -> 409 EQUIVOCATION, portable evidence, persistent quarantine', async () => {
  const w = await mk('g-fork', {}, 2);
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const forked = await forge(w, 2, 0xab);
    const r = await post(w, forked);
    assert.equal(r.status, 409, r.text);
    assert.equal(r.json.code, 'EQUIVOCATION');
    assert.equal(r.json.evidence.format, 'qv-equivocation/v1');
    assert.equal(r.json.evidence.kind, 'fork');
    assert.equal(r.json.retryable, false);
    assert.match(r.json.incident, /^inc_/);
    // offline-verifiable with nothing but the log public key
    const [a, b] = r.json.evidence.notes as string[];
    assert.ok(checkFork(a!, b!, rt.logPk).ok);
    assert.equal(b, forked);
    assert.equal(a, (rt.edb.store.getCheckpoint(2))!.note, 'our own note is the first half of the evidence');
    // fail closed: no more appends, reads continue
    const app = await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
    assert.equal(app.status, 503);
    assert.equal(app.json.code, 'QUARANTINED');
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/entries?from=0`)).status, 200);
    assert.equal((await state(w)).integrity, 'compromised');
    const ev = (await w.get(`/api/v1/elections/${w.electionId}/log/evidence`)).json;
    assert.equal(ev.items.length, 1);
    assert.equal(ev.integrity, 'compromised');
    assert.equal(ev.items[0].evidence.kind, 'fork');
    // an alert event was written for SSE / webhooks
    assert.ok(rt.edb.eventsAfter(0, 100).some((e) => e.type === 'alert' && JSON.parse(e.data).kind === 'equivocation'));
    // repeating the same evidence adds nothing
    assert.equal((await post(w, forked)).status, 409);
    assert.equal(rt.edb.evidenceCount(), 1);
    // survives a restart of the runtime
    await w.server.pool.closeAll();
    assert.equal((await state(w)).integrity, 'compromised');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
    // and cannot be cleared by an operator: the key signed two roots
    const ack = r.json.incident as string;
    const c = await w.signed('POST', `/api/v1/admin/elections/${w.electionId}/quarantine/clear`, { ack, verified_against: ['witness:w1'] }, admin, w.idemKey());
    assert.equal(c.status, 409);
    assert.equal(c.json.code, 'COMPROMISED');
    const reg = await w.signed('GET', '/api/v1/admin/status', undefined, admin);
    assert.deepEqual(reg.json.quarantined, [w.electionId]);
  } finally {
    await w.stop();
  }
});

test('inbound: a note beyond our tree (rollback) quarantines a live log; clearing needs the incident id, a restored log and witnesses', async () => {
  const w = await mk('g-roll', {}, 2);
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const ahead = await forge(w, 50, 0x11);
    const r = await post(w, ahead);
    assert.equal(r.status, 409);
    assert.equal(r.json.evidence.kind, 'rollback');
    assert.equal(r.json.integrity, 'quarantined');
    assert.equal((await state(w)).integrity, 'quarantined');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
    const ack = r.json.incident as string;
    const path = `/api/v1/admin/elections/${w.electionId}/quarantine/clear`;
    const clear = (body: unknown, key = admin) => w.signed('POST', path, body, key, w.idemKey());
    assert.equal((await clear({ ack: 'inc_wrong', verified_against: ['witness:w1'] })).status, 409);
    assert.equal((await clear({ ack, verified_against: [] })).status, 422);
    assert.equal((await clear({ ack, verified_against: ['witness:nobody'] })).status, 422);
    assert.equal((await clear({ ack, verified_against: ['mirror:xyz'] })).status, 422);
    // the log is still shorter than what our key signed for: restore first
    const c = await clear({ ack, verified_against: ['witness:w1'] });
    assert.equal(c.status, 409);
    assert.match(c.json.detail, /restore/);
    assert.equal(rt.quarantineReason() !== undefined, true);
  } finally {
    await w.stop();
  }
});

test('admin clear: positive path after a (simulated) restore with a real witness cosignature; negative variants', async () => {
  const w = await mk('g-clear', {}, 2);
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const incident = rt.markQuarantine('ROLLBACK_SUSPECTED', 2, 'rollback');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
    const path = `/api/v1/admin/elections/${w.electionId}/quarantine/clear`;
    const body = { ack: incident, verified_against: ['witness:w1'] };
    // authentication and authorization
    assert.equal((await w.req('POST', path, body, { headers: w.idemKey() })).status, 401);
    assert.equal((await w.signed('POST', path, body, w.owner, w.idemKey())).status, 403, 'an org owner is not an instance admin');
    assert.equal((await w.signed('POST', path, body, admin)).status, 400, 'Idempotency-Key is required');
    assert.equal((await w.signed('POST', path, { ...body, extra: 1 }, admin, w.idemKey())).status, 400);
    // no witness has cosigned yet
    const no = await w.signed('POST', path, body, admin, w.idemKey());
    assert.equal(no.status, 409);
    assert.match(no.json.detail, /witness w1 has not cosigned/);
    assert.ok((await w.server.pool.get(w.electionId))!.quarantineReason() !== undefined);
    // the witness cosigns the checkpoint of size 2
    const note = (await latest(w));
    const text = note.slice(0, note.indexOf('\n\n') + 1);
    const wk = w.witnesses[0]!;
    const line = cosignLine('w1', wk.secretKey, wk.publicKey, text, w.nowSec);
    assert.equal((await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, { checkpoint_size: 2, lines: [line] })).status, 200);
    // wrong ack still refused, and refused uniformly
    assert.equal((await w.signed('POST', path, { ack: 'inc_xxxxxxxxxxxx', verified_against: ['witness:w1'] }, admin, w.idemKey())).status, 409);
    const ok = await w.signed('POST', path, body, admin, w.idemKey());
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.quarantined, false);
    // appends work again, integrity is back to ok, status no longer lists it
    assert.equal((await state(w)).integrity, 'ok');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 201);
    assert.deepEqual((await w.signed('GET', '/api/v1/admin/status', undefined, admin)).json.quarantined, []);
    // clearing again: not quarantined any more
    assert.equal((await w.signed('POST', path, body, admin, w.idemKey())).status, 409);
    assert.ok(w.server.env.control.auditRows().some((a) => a.action === 'quarantine.clear'));
  } finally {
    await w.stop();
  }
});

// ------------------------------------------------------------------------------------------------ outbound
const sent: (WebhookRequest & { n: number })[] = [];
const dns = new Map<string, string[]>();
let reply: (r: WebhookRequest, n: number) => WebhookResponse | Error = () => ({ status: 200, truncated: false, body: Buffer.from('{}') });
const transport = async (r: WebhookRequest): Promise<WebhookResponse> => {
  sent.push({ ...r, n: sent.length + 1 });
  const x = reply(r, sent.length);
  if (x instanceof Error) throw x;
  return x;
};
const resolver = async (h: string) => {
  const a = dns.get(h);
  if (!a) throw new Error('ENOTFOUND');
  return a.map((address) => ({ address, family: (address.includes(':') ? 6 : 4) as 4 | 6 }));
};
const peerOpts = (peers: string[]) => ({ gossipPeers: peers, gossipResolver: resolver, gossipTransport: transport });
const json = (o: unknown, status = 200): WebhookResponse => ({ status, truncated: false, body: Buffer.from(JSON.stringify(o)) });

test('outbound: peers are checked with the SSRF policy at start and before every send', async () => {
  for (const bad of ['https://127.0.0.1/', 'https://[::1]/', 'http://peer.example/', 'https://user:pw@peer.example/', 'https://peer.example:22/', 'https://localhost/', 'https://10.1.2.3/', 'https://intranet.internal/', 'https://2130706433/', 'ftp://peer.example/']) {
    await assert.rejects(async () => {
      const w = new World({ seed: 'g-ssrf0', n: 3, t: 2, voters: 1, server: { gossipPeers: [bad] } as never });
      try {
        await w.start();
      } finally {
        rmSync(w.dir, { recursive: true, force: true });
      }
    }, /gossipPeers/, bad);
  }
  await assert.rejects(async () => {
    const w = new World({ seed: 'g-ssrf1', n: 3, t: 2, voters: 1, server: { gossipPeers: Array.from({ length: 17 }, (_, i) => `https://p${i}.example/`) } as never });
    try {
      await w.start();
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  }, /at most 16/);

  sent.length = 0;
  dns.clear();
  dns.set('rebind.example', ['93.184.216.34', '10.0.0.7']);
  dns.set('private.example', ['192.168.1.9']);
  dns.set('v6.example', ['::ffff:127.0.0.1']);
  dns.set('good.example', ['93.184.216.34']);
  const w = await mk('g-ssrf', peerOpts(['https://rebind.example', 'https://private.example', 'https://v6.example', 'https://nxdomain.example']), 2);
  try {
    const g = w.server.gossip;
    await g.runOnce();
    assert.equal(sent.length, 0, 'no request ever reaches a non-public address');
    assert.equal(g.stats.blocked, 4, 'three non-public answers and one DNS failure are refused before any send');
    assert.equal(g.stats.failed, 0);
  } finally {
    await w.stop();
  }
});

test('outbound: exchange pins the validated address, sends only the public note, never follows redirects, bounds the answer', async () => {
  sent.length = 0;
  dns.clear();
  dns.set('good.example', ['93.184.216.34']);
  const w = await mk('g-out', peerOpts(['https://good.example/base/']), 3);
  try {
    const g = w.server.gossip;
    const rt = (await w.server.pool.get(w.electionId))!;
    const mine = rt.edb.store.latestCheckpoint()!.note;
    // a link election is never pushed to peers
    // 1. a consistent peer
    reply = () => json({ latest_note: mine, consistent: true, relation: 'same', tree_size: 3 });
    await g.runOnce();
    assert.equal(sent.length, 1);
    const q = sent[0]!;
    assert.equal(q.url.href, 'https://good.example/base/api/v1/gossip/checkpoints');
    assert.equal(q.ip, '93.184.216.34');
    assert.equal(q.timeoutMs, 5000);
    assert.equal(q.captureBody, true);
    assert.deepEqual(JSON.parse(q.body.toString()), { note: mine });
    assert.equal(q.headers['Content-Type'], 'application/json');
    assert.ok(!Object.keys(q.headers).some((h) => /authorization|cookie|read-key/i.test(h)));
    assert.equal(g.stats.ok, 1);
    assert.equal(rt.quarantineReason(), undefined);
    // 2. redirect / error statuses are failures, nothing is followed or recorded
    for (const status of [301, 302, 307, 308, 404, 429, 500]) {
      reply = () => ({ status, truncated: false, body: Buffer.from('{}') });
      const f = g.stats.failed;
      await g.runOnce();
      assert.equal(g.stats.failed, f + 1, `status ${status}`);
    }
    // 3. garbage answers
    for (const body of [Buffer.from('not json'), Buffer.from('{"latest_note":42}'), Buffer.from('[]'), Buffer.from('{"latest_note":"x"}'), Buffer.alloc(0)]) {
      reply = () => ({ status: 200, truncated: false, body });
      await g.runOnce();
    }
    reply = () => ({ status: 200, truncated: true });
    await g.runOnce();
    assert.ok(g.stats.badResponses >= 5);
    assert.equal(rt.quarantineReason(), undefined, 'junk from a peer never changes our state');
    // 4. a 409 whose evidence is signed by somebody else is ignored
    const other = ed25519Keypair();
    const fake = signCheckpoint(w.origin, 99, new Uint8Array(32).fill(3), other.secretKey, other.publicKey);
    reply = () => json({ code: 'EQUIVOCATION', evidence: { format: 'qv-equivocation/v1', kind: 'fork', notes: [fake, fake, fake] } }, 409);
    await g.runOnce();
    assert.equal(rt.quarantineReason(), undefined);
    assert.equal(rt.edb.evidenceCount(), 0);
    // 5. a peer that shows us a note OUR key signed beyond our tree: rollback -> quarantine
    const ahead = await forge(w, 40, 0x22);
    reply = () => json({ latest_note: ahead, consistent: false });
    await g.runOnce();
    assert.ok(rt.quarantineReason() !== undefined);
    assert.equal(rt.edb.evidenceCount(), 1);
    assert.equal(g.stats.evidence, 1);
    assert.equal((await state(w)).integrity, 'quarantined');
  } finally {
    await w.stop();
  }
});

test('outbound: a peer-reported fork (409) built from notes our key signed is judged against our own tree', async () => {
  sent.length = 0;
  dns.clear();
  dns.set('good.example', ['93.184.216.34']);
  const w = await mk('g-out2', peerOpts(['https://good.example']), 2);
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const forked = await forge(w, 2, 0x5a);
    reply = () => json({ code: 'EQUIVOCATION', evidence: { format: 'qv-equivocation/v1', kind: 'fork', notes: [forked] } }, 409);
    await w.server.gossip.runOnce();
    assert.equal(rt.edb.evidenceCount(), 1);
    assert.equal(rt.edb.hasPermanentEvidence(), true);
    assert.ok(rt.quarantineReason() !== undefined);
  } finally {
    await w.stop();
  }
});

test('outbound: link and draft elections are not pushed; imported-free runs do nothing without peers', async () => {
  sent.length = 0;
  dns.clear();
  dns.set('good.example', ['93.184.216.34']);
  const w = await mk('g-out3', peerOpts(['https://good.example']), 2);
  try {
    // a draft (no entries) and a link draft next to the public election
    assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Draft' }, w.owner, w.idemKey())).status, 201);
    assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Hidden', access: 'link' }, w.owner, w.idemKey())).status, 201);
    reply = () => json({});
    await w.server.gossip.runOnce();
    assert.equal(sent.length, 1, 'only the public, started election is pushed');
    w.server.gossip.stop();
    await w.server.gossip.runOnce();
    assert.equal(sent.length, 1, 'a stopped service sends nothing');
  } finally {
    await w.stop();
  }
});

test('outbound: the interval timer runs rounds on its own and stops with the server', async () => {
  sent.length = 0;
  dns.clear();
  dns.set('good.example', ['93.184.216.34']);
  reply = () => json({});
  const w = await mk('g-timer', { ...peerOpts(['https://good.example']), gossipIntervalMs: 40 }, 2);
  try {
    const t0 = Date.now();
    while (sent.length < 2 && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.length >= 2);
  } finally {
    await w.stop();
  }
  const n = sent.length;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, n, 'no rounds after stop');
});

void b64u; void unb64u;
