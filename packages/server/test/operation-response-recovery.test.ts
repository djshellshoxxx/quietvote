import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, renameSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { bytesToHex } from '@quietvote/crypto';
import { DATA_LOCK_NAME } from '../src/data-lock.ts';
import { ElectionDb } from '../src/electiondb.ts';
import { keyIdOf } from '../src/auth.ts';
import { ApiError } from '../src/problem.ts';
import { World, kp } from './helpers/world.ts';

type CrashInfo = { dir: string; orgId: string; electionId: string; clock: number; path: string; body: Record<string, unknown>; headers: Record<string, string> };
const admin = kp('operation-crash', 'admin');

for (const withPeers of [false, true]) {
  test(`startup anchor recovery: untouched empty draft stays lazy ${withPeers ? 'with configured peers' : 'without peers'}`, async () => {
    let peerCalls = 0;
    const w = new World({ seed: `empty-draft-recovery-${withPeers}`, n: 3, t: 2, voters: 2, server: withPeers ? {
      gossipPeers: ['https://peer.example'],
      gossipResolver: async () => { peerCalls++; return [{ address: '93.184.216.34', family: 4 }]; },
      gossipTransport: async () => { peerCalls++; throw new Error('empty draft has no signed checkpoint to send'); },
    } : {} });
    await w.start();
    try {
      await w.setupOrgAndElection();
      assert.equal(w.server.pool.openCount(), 0);
      assert.equal(w.server.env.control.runtimeAnchor(w.electionId), undefined);
      await w.server.stop(); await w.start();
      assert.equal(w.server.pool.openCount(), 0, 'response recovery must not open untouched empty drafts');
      assert.equal(w.server.env.control.runtimeAnchor(w.electionId), undefined, 'lazy recovery does not create signing authority');
      assert.equal(peerCalls, 0);

      const rt = (await w.server.pool.get(w.electionId))!;
      assert.equal(rt.log.size, 0);
      if (withPeers) {
        assert.throws(() => rt.assertHealthy(), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === 'LOG_UNAVAILABLE');
        assert.equal(rt.log.checkpoint().ok, false, 'a reopened empty draft cannot sign a checkpoint to authorize itself');
        const refused = await w.publishManifest();
        assert.equal(refused.status, 503, refused.text);
        assert.equal(refused.json.code, 'LOG_UNAVAILABLE');
        await assert.rejects(w.server.pool.remove(w.electionId), (error: unknown) => error instanceof ApiError && error.code === 'LOG_UNAVAILABLE');
        assert.ok(w.server.env.control.election(w.electionId)?.dek_wrapped);
        assert.equal(rt.log.size, 0);
        assert.equal(peerCalls, 0, 'no signed checkpoint exists for the configured gossip contract');
      } else {
        assert.doesNotThrow(() => rt.assertHealthy());
        const published = await w.publishManifest();
        assert.equal(published.status, 201, published.text);
        assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 1);
        assert.equal(rt.log.getReceipt(0).ok, true);
      }
    } finally { await w.stop(); }
  });
}

test('startup anchor recovery: a nonempty log without an anchor still opens and restores its signing floor', async () => {
  const w = new World({ seed: 'nonempty-missing-anchor-recovery', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    assert.equal((await w.publishManifest()).status, 201);
    const rt = (await w.server.pool.get(w.electionId))!;
    const first = rt.edb.store.getEntry(0)!;
    const root = rt.log.root();
    assert.equal(rt.edb.hasAppendCompletions(), false, 'this recovery is triggered by the missing anchor alone');
    // Models an existing nonempty election after the additive control-schema upgrade.
    w.server.env.control.db.prepare('DELETE FROM runtime_anchor WHERE election_id=?').run(w.electionId);
    await w.server.stop(); await w.start();
    assert.equal(w.server.pool.openCount(), 1, 'nonempty missing-anchor recovery must run during startup');
    const anchor = w.server.env.control.runtimeAnchor(w.electionId);
    assert.ok(anchor);
    assert.equal(anchor.tree_size, 1);
    assert.deepEqual(anchor.root, root);
    const recovered = (await w.server.pool.get(w.electionId))!;
    assert.doesNotThrow(() => recovered.assertHealthy());
    assert.equal(recovered.log.getReceipt(0).ok, true);
    const duplicate = await w.submit(first.headerBytes, first.body!);
    assert.equal(duplicate.status, 200, duplicate.text);
    assert.equal(recovered.log.size, 1);
  } finally { await w.stop(); }
});

test('startup anchor recovery: an existing floor ahead of an empty log still opens and refuses signing or deletion', async () => {
  const w = new World({ seed: 'empty-log-ahead-anchor-recovery', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const reg = w.server.env.control.election(w.electionId)!;
    const path = join(w.dir, reg.db_path), old = join(w.dir, 'empty-election.sqlite');
    rt.edb.db.prepare('VACUUM INTO ?').run(old);
    assert.equal((await w.publishManifest()).status, 201);
    const floor = w.server.env.control.runtimeAnchor(w.electionId)!;
    assert.equal(floor.tree_size, 1);
    await w.server.stop(); copyFileSync(old, path); await w.start();
    assert.equal(w.server.pool.openCount(), 1, 'an empty log must not bypass a retained newer anchor');
    assert.deepEqual(w.server.env.control.runtimeAnchor(w.electionId), floor);
    const restored = (await w.server.pool.get(w.electionId))!;
    assert.equal(restored.log.size, 0);
    assert.throws(() => restored.assertHealthy(), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === 'QUARANTINED');
    assert.equal(restored.log.checkpoint().ok, false);
    const refused = await w.publishManifest();
    assert.equal(refused.status, 503, refused.text);
    assert.equal(refused.json.code, 'QUARANTINED');
    await assert.rejects(w.server.pool.remove(w.electionId), (error: unknown) => error instanceof ApiError && error.code === 'QUARANTINED');
    assert.ok(existsSync(path));
    assert.ok(w.server.env.control.election(w.electionId)?.dek_wrapped);
  } finally { await w.stop(); }
});

async function crashed(mode: 'create' | 'invites' | 'clear'): Promise<{ w: World; info: CrashInfo }> {
  const info = await new Promise<CrashInfo>((resolve, reject) => {
    execFile(process.execPath, ['--max-old-space-size=256', fileURLToPath(new URL('./helpers/operation-crash.ts', import.meta.url)), mode],
      { timeout: 30_000 }, (error, stdout, stderr) => {
        if (!error || error.code !== 74) return reject(new Error(`child did not reach commit boundary: ${String(error)} ${stderr}`));
        try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
      });
  });
  const w = new World({ seed: 'operation-crash', n: 3, t: 2, voters: 2, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  rmSync(w.dir, { recursive: true });
  w.dir = info.dir; w.orgId = info.orgId; w.electionId = info.electionId; w.clock = info.clock;
  w.rng.bytes(4096); // The child already used signed request nonces from this deterministic stream.
  rmdirSync(join(w.dir, DATA_LOCK_NAME)); // The private fixture's sole owner has exited.
  return { w, info };
}
for (const mode of ['create', 'invites', 'clear'] as const) {
  test(`process exit after ${mode} commit recovers its redacted original result and audit exactly once at startup`, async () => {
    const { w, info } = await crashed(mode);
    w.tick(60); // Promotion may happen later than the original marker generation.
    await w.start();
    try {
      const ctl = w.server.env.control;
      assert.equal(w.server.pool.openCount(), 0, 'response-only startup recovery does not open election runtimes');
      const cached = ctl.db.prepare('SELECT status,response FROM idempotency WHERE idem_key=?').get(info.headers['idempotency-key']!)!;
      assert.equal(cached.status, mode === 'clear' ? 200 : 201, 'startup itself must reconcile the committed result');
      const original = JSON.parse(Buffer.from(cached.response as Uint8Array).toString());
      const election = mode === 'create' ? String(original.election_id) : w.electionId;
      const rt = (await w.server.pool.get(election))!;
      const receipt = rt.edb.operationReceipt(mode === 'clear' ? keyIdOf(admin.publicKey) : keyIdOf(w.owner.publicKey), info.headers['idempotency-key']!)!;
      const raw = JSON.stringify(receipt);
      assert.doesNotMatch(raw, /PRIVATE_LABEL_CANARY|PRIVATE_CONTACT_CANARY|read_key|"code":/);
      if (mode === 'create') {
        assert.equal(ctl.countElections(w.orgId), 2);
        assert.equal(original.read_key, undefined);
        assert.equal(rt.edb.row().access, 'link');
        assert.ok(rt.edb.row().read_key_hash);
      } else if (mode === 'invites') {
        assert.equal(rt.edb.inviteCount(), 2);
        assert.deepEqual(original.invites.map((v: Record<string, unknown>) => Object.keys(v).sort()), [['code_withheld', 'invite_id'], ['code_withheld', 'invite_id']]);
        assert.ok(original.invites.every((v: { code_withheld: boolean }) => v.code_withheld));
      } else {
        assert.equal(rt.edb.row().quarantine, null);
        assert.equal(ctl.election(election)!.quarantine, null);
        assert.equal(rt.edb.eventsAfter(0, 30).filter((row) => JSON.parse(row.data).kind === 'quarantine_cleared').length, 1);
      }
      const replay = await w.signed('POST', info.path, info.body, mode === 'clear' ? admin : w.owner, info.headers);
      assert.equal(replay.status, cached.status, replay.text);
      assert.equal(replay.headers.get('idempotent-replay'), 'true');
      assert.deepEqual(replay.json, original);
      const mismatch = await w.signed('POST', info.path, mode === 'create' ? { ...info.body, title: 'Different' } : mode === 'invites' ? { count: 1 } : { ...info.body, ack: 'inc_different' }, mode === 'clear' ? admin : w.owner, info.headers);
      assert.equal(mismatch.status, 422, mismatch.text);
      await w.server.stop(); await w.start();
      const again = await w.signed('POST', info.path, info.body, mode === 'clear' ? admin : w.owner, info.headers);
      assert.deepEqual(again.json, original);
      if (mode !== 'invites') {
        assert.equal(Number(w.server.env.control.db.prepare('SELECT COUNT(*) AS n FROM operator_audit WHERE action=? AND target=?').get(mode === 'create' ? 'election.create' : 'quarantine.clear', election)!.n), 1);
      }
    } finally { await w.stop(); }
  });
}

test('failure after committed election initialization retains its binding and recovers on same-process retry', async () => {
  const w = new World({ seed: 'receipt-after-commit', n: 3, t: 2, voters: 2 });
  await w.start();
  const tx = ElectionDb.prototype.tx;
  try {
    await w.setupOrgAndElection();
    const headers = w.idemKey(), path = `/api/v1/orgs/${w.orgId}/elections`, body = { title: 'Committed initialization' };
    ElectionDb.prototype.tx = function <T>(fn: () => T): T {
      const result = tx.call(this, fn) as T;
      if (this.operationReceipt(keyIdOf(w.owner.publicKey), headers['idempotency-key']!)) throw new Error('injected after election commit');
      return result;
    };
    assert.equal((await w.signed('POST', path, body, w.owner, headers)).status, 500);
    ElectionDb.prototype.tx = tx;
    const ctl = w.server.env.control;
    assert.equal(ctl.countElections(w.orgId), 2, 'committed election must not be crypto-erased after a completion failure');
    const made = ctl.listElections(w.orgId, undefined, undefined, 10).find((row) => row.title === body.title)!;
    assert.ok(made.dek_wrapped);
    w.tick(60);
    const replay = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(replay.status, 201, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(replay.json.election_id, made.election_id);
    assert.equal(ctl.countElections(w.orgId), 2);
    assert.equal(Number(ctl.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='election.create' AND target=?").get(made.election_id)!.n), 1);
  } finally { ElectionDb.prototype.tx = tx; await w.stop(); }
});

test('receipt failure rolls back invitation rows and election initialization; no guessed response is promoted', async () => {
  const w = new World({ seed: 'receipt-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  const store = ElectionDb.prototype.storeOperationReceipt;
  try {
    await w.setupOrgAndElection();
    ElectionDb.prototype.storeOperationReceipt = function (...args) { store.apply(this, args); throw new Error('injected after receipt insert'); };
    const rt = (await w.server.pool.get(w.electionId))!;
    const invites = w.idemKey(), creation = w.idemKey();
    assert.equal((await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 2 }, w.owner, invites)).status, 500);
    assert.equal(rt.edb.inviteCount(), 0);
    assert.equal(rt.edb.operationReceipt(keyIdOf(w.owner.publicKey), invites['idempotency-key']!), undefined);
    assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Rollback' }, w.owner, creation)).status, 500);
    assert.equal(w.server.env.control.countElections(w.orgId), 1);
    ElectionDb.prototype.storeOperationReceipt = store;
    await w.server.stop(); await w.start();
    const retry = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 2 }, w.owner, invites);
    assert.equal(retry.status, 409);
    assert.equal(retry.json.reason, 'IDEMPOTENCY_INTERRUPTED');
    assert.equal((await w.server.pool.get(w.electionId))!.edb.inviteCount(), 0);
  } finally { ElectionDb.prototype.storeOperationReceipt = store; await w.stop(); }
});

test('quarantine flag, clear event and response receipt roll back together', async () => {
  const w = new World({ seed: 'quarantine-receipt-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const incident = rt.markQuarantine('TEST_INCIDENT', 0, 'quarantine');
    const before = rt.edb.eventsAfter(0, 20);
    assert.throws(() => rt.clearForcedQuarantine(() => { throw new Error('injected receipt failure'); }), /injected/);
    assert.match(rt.edb.row().quarantine!, new RegExp(incident));
    assert.deepEqual(rt.edb.eventsAfter(0, 20), before);
    assert.equal(rt.poisoned, true);
    await w.server.stop(); await w.start();
    assert.match((await w.server.pool.get(w.electionId))!.quarantineReason()!, new RegExp(incident));
  } finally { await w.stop(); }
});

test('recovery binds principal, key, method, path, request hash and marker generation', async () => {
  const w = new World({ seed: 'receipt-binding', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!, ctl = w.server.env.control;
    const receipt = rt.edb.operationReceipts(w.clock)[0]!;
    const restore = () => ctl.db.prepare('UPDATE idempotency SET status=-1,response=NULL,method=?,path=?,req_sha256=?,expires_at=? WHERE principal=? AND idem_key=?')
      .run(receipt.method, receipt.path, receipt.req_sha256, receipt.expires_at, receipt.principal, receipt.idem_key);
    for (const [column, value] of [['method', 'DELETE'], ['path', '/api/v1/orgs/other/elections'], ['req_sha256', new Uint8Array(32)], ['expires_at', receipt.expires_at + 1]] as const) {
      restore();
      ctl.db.prepare(`UPDATE idempotency SET ${column}=? WHERE principal=? AND idem_key=?`).run(value, receipt.principal, receipt.idem_key);
      w.server.pool.recoverResponse(receipt.principal, receipt.idem_key);
      assert.equal(ctl.idem(receipt.principal, receipt.idem_key)!.status, -1, column);
    }
    restore();
    w.server.pool.recoverResponse('different-principal', receipt.idem_key);
    w.server.pool.recoverResponse(receipt.principal, 'different-key');
    assert.equal(ctl.idem(receipt.principal, receipt.idem_key)!.status, -1);
    w.clock = receipt.expires_at;
    w.server.pool.recoverResponse(receipt.principal, receipt.idem_key);
    assert.equal(ctl.idem(receipt.principal, receipt.idem_key)!.status, -1, 'expired receipts cannot revive a key');
    // Reusing the same bytes/key in a later generation must not adopt the old result.
    ctl.storeIdem(receipt.principal, receipt.idem_key, receipt.method, receipt.path, receipt.req_sha256, -1, null);
    w.server.pool.recoverResponse(receipt.principal, receipt.idem_key);
    assert.equal(ctl.idem(receipt.principal, receipt.idem_key)!.status, -1);
  } finally { await w.stop(); }
});

for (const mode of ['missing', 'symlink', 'identity'] as const) {
  test(`startup leaves a committed response pending when its election storage has ${mode} damage`, async () => {
    const w = new World({ seed: `receipt-storage-${mode}`, n: 3, t: 2, voters: 2 });
    await w.start();
    try {
      await w.setupOrgAndElection();
      const rt = (await w.server.pool.get(w.electionId))!;
      const receipt = rt.edb.operationReceipts(w.clock)[0]!;
      w.server.env.control.db.prepare('UPDATE idempotency SET status=-1,response=NULL WHERE principal=? AND idem_key=?').run(receipt.principal, receipt.idem_key);
      const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path), retained = join(w.dir, 'retained.sqlite');
      await w.server.stop();
      if (mode === 'identity') {
        const db = new DatabaseSync(path);
        try { db.prepare('UPDATE election SET org_id=?').run('different-org'); } finally { db.close(); }
      } else {
        renameSync(path, retained);
        if (mode === 'symlink') symlinkSync(retained, path);
      }
      await w.start();
      assert.equal(w.server.env.control.idem(receipt.principal, receipt.idem_key)!.status, -1);
      assert.equal(w.server.pool.openCount(), 0);
      assert.ok(w.logs.some((line) => line.includes('election_recovery_pending')));
      if (mode === 'missing') assert.equal(existsSync(path), false, 'recovery must never create a missing election file');
      await w.server.stop();
      if (mode === 'identity') {
        const db = new DatabaseSync(path);
        try { db.prepare('UPDATE election SET org_id=?').run(w.orgId); } finally { db.close(); }
      } else {
        if (mode === 'symlink') unlinkSync(path);
        renameSync(retained, path);
      }
      await w.start();
      assert.equal(w.server.env.control.idem(receipt.principal, receipt.idem_key)!.status, 201);
      assert.equal(w.server.pool.openCount(), 0);
    } finally { await w.stop(); }
  });
}
