// Regression tests for the 2026-10-21 security review (docs/reports/security-review-2026-10-21.md). Each test reproduced its
// finding before the fix (it failed on the unfixed code) and pins the fixed behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MerkleTree, buildEntry, cosignLine, hashLeaf, signCheckpoint } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, utf8 } from '@quietvote/crypto';
import { auditLog } from '../src/admin.ts';
import type { ElectionRuntime } from '../src/election.ts';
import { open as unseal } from '../src/kek.ts';
import { signRequest } from '../src/index.ts';
import type { JobCtl } from '../src/jobs.ts';
import { TargetRejected, parseTargetUrl, validateTarget } from '../src/ssrf.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;

// ------------------------------------------------------------------------------------------------ SR-1 signed-request replay
test('SR-1: a future-dated signed request cannot be replayed after its nonce record expires (nonce kept until ts + window)', async () => {
  const w = new World({ seed: 'sr-replay', n: 3, t: 2, voters: 1, witnessQuorum: 0 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const path = `/api/v1/orgs/${w.orgId}/webhooks`;
    const ts = w.nowSec + 120; // inside the +-120 s window (client clock ahead)
    const auth = signRequest(w.owner.secretKey, w.owner.publicKey, 'GET', path, w.audience, new Uint8Array(0), ts, new Uint8Array(16).fill(0x42));
    const send = () => fetch(w.base + path, { headers: { authorization: auth } });
    assert.equal((await send()).status, 200);
    const again = await send();
    assert.equal(again.status, 401, 'immediate replay is refused');
    // 130 s later the timestamp is still inside the window (|now - ts| = 10 s); the nonce must still be remembered
    w.tick(130);
    const late = await send();
    assert.equal(late.status, 401, 'replay after the old nonce expiry (now + 125 s) must still be refused');
    assert.equal(((await late.json()) as { reason?: string }).reason, 'REPLAY');
    // once the timestamp itself has left the window the request is stale anyway
    w.tick(120);
    assert.equal((await send()).status, 401);
  } finally {
    await w.stop();
  }
});

// ------------------------------------------------------------------------------------------------ SR-2 quarantine clear TOCTOU
test('SR-2: fork evidence recorded while a quarantine clear is in progress is not cleared away (re-checked after the re-open)', async () => {
  const admin = kp('sr-clear', 'admin');
  const w = new World({ seed: 'sr-clear', n: 3, t: 2, voters: 2, witnessQuorum: 0, server: { adminKeys: [H(admin.publicKey)] } as never });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.publishManifest();
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const rt0 = (await w.server.pool.get(w.electionId))!;
    const incident = rt0.markQuarantine('ROLLBACK_SUSPECTED', 2, 'rollback');
    // the witness cosigns our checkpoint of size 2, so the clear would otherwise succeed
    const note = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
    const text = note.slice(0, note.indexOf('\n\n') + 1);
    const wk = w.witnesses[0]!;
    const line = cosignLine('w1', wk.secretKey, wk.publicKey, text, w.nowSec);
    assert.equal((await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, { checkpoint_size: 2, lines: [line] })).status, 200);
    // a note our log key signed for a different root at size 2 (key compromise / equivocation)
    const env = w.server.env;
    const reg = env.control.election(w.electionId)!;
    const dek = unseal(env.kek, reg.dek_wrapped!, `dek:${w.electionId}`);
    const sk = unseal(dek, rt0.edb.row().log_sk_enc!, 'log_sk');
    const forked = signCheckpoint(w.origin, 2, new Uint8Array(32).fill(0xab), sk, rt0.logPk);
    // the fork note arrives through the public gossip endpoint while the clear is re-opening the log
    const pool = w.server.pool;
    const evict = pool.evict.bind(pool);
    let armed = true;
    pool.evict = async (id: string) => {
      await evict(id);
      if (armed) {
        armed = false;
        const g = await w.req('POST', '/api/v1/gossip/checkpoints', { note: forked });
        assert.equal(g.status, 409, g.text);
      }
    };
    const c = await w.signed('POST', `/api/v1/admin/elections/${w.electionId}/quarantine/clear`, { ack: incident, verified_against: ['witness:w1'] }, admin, w.idemKey());
    pool.evict = evict;
    assert.equal(armed, false, 'the race was exercised');
    const rt = (await pool.get(w.electionId))!;
    assert.equal(rt.edb.hasPermanentEvidence(), true);
    assert.notEqual(c.status, 200, `clear must not succeed over fork evidence: ${c.text}`);
    assert.equal(c.json.code, 'COMPROMISED');
    assert.ok(rt.quarantineReason() !== undefined, 'the election stays quarantined');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
  } finally {
    await w.stop();
  }
});

// ------------------------------------------------------------------------------------------------ SR-3 self-audit snapshot
test('SR-3: the self-audit judges the tree it recomputed, not entries/checkpoints appended while it yielded (no false quarantine)', async () => {
  const origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa';
  const author = ed25519Keypair(new Uint8Array(32).fill(1));
  const logKey = ed25519Keypair(new Uint8Array(32).fill(2));
  const tree = new MerkleTree();
  const entries: { headerBytes: Uint8Array; body: Uint8Array; leafHash: Uint8Array }[] = [];
  const cps: { size: number; root: Uint8Array; note: string }[] = [];
  let n = 0;
  const add = (): void => {
    const e = buildEntry({ origin, type: 'notice', secretKey: author.secretKey, publicKey: author.publicKey, nonce: utf8(`nonce-${String(n++).padStart(10, '0')}`), createdAt: 1_800_000_000, body: utf8('{}') });
    entries.push({ headerBytes: e.headerBytes, body: e.body, leafHash: hashLeaf(e.headerBytes) });
    tree.appendLeaf(e.headerBytes);
  };
  const checkpoint = (): void => {
    const root = tree.root();
    cps.push({ size: tree.size, root, note: signCheckpoint(origin, tree.size, root, logKey.secretKey, logKey.publicKey) });
  };
  for (let i = 0; i < 600; i++) add();
  checkpoint();
  const rt = {
    origin, logPk: logKey.publicKey,
    log: { get size() { return tree.size; }, root: (s?: number) => tree.root(s) },
    edb: { store: { getEntry: (i: number) => entries[i], listCheckpoints: () => [...cps] } },
  } as unknown as ElectionRuntime;
  // a live election keeps appending (and signing checkpoints) while the audit job yields
  const ctl: JobCtl = { jobId: 'j', progress: () => undefined, tick: async () => { add(); add(); checkpoint(); } };
  const r = await auditLog(rt, ctl);
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
  assert.equal(r.tree_size, 600);
  // a checkpoint beyond the current log is still a failure (rollback), as is a wrong root
  cps.push({ size: tree.size + 5, root: tree.root(), note: signCheckpoint(origin, tree.size + 5, tree.root(), logKey.secretKey, logKey.publicKey) });
  const bad = await auditLog(rt);
  assert.equal(bad.ok, false);
  assert.ok(bad.failures.some((f) => f.rule === 'CHECKPOINT_ROOT'));
});

// ------------------------------------------------------------------------------------------------ SR-4 SSRF static policy
test('SR-4: host names with empty labels (e.g. "localhost..") are refused by the static policy, before any DNS', async () => {
  for (const u of ['https://localhost../', 'https://a..example.com/', 'https://example.com../', 'https://.example.com/']) {
    assert.throws(() => parseTargetUrl(u), (e: unknown) => e instanceof TargetRejected && e.code === 'TARGET_BLOCKED', u);
  }
  // a single trailing dot (fully qualified name) stays accepted
  assert.equal(parseTargetUrl('https://example.com./').host, 'example.com');
  const t = await validateTarget('https://hooks.example.com./x', async () => [{ address: '93.184.216.34', family: 4 }]);
  assert.equal(t.ip, '93.184.216.34');
});
