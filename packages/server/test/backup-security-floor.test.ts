// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-011, QV-12-REQ-005
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sha256, utf8 } from '@quietvote/crypto';
import { backupWork } from '../src/admin.ts';
import { BackupError, restoreBackup, verifyBackup } from '../src/offline-backup.ts';
import { seal, open as unseal } from '../src/kek.ts';
import { World } from './helpers/world.ts';

const root = mkdtempSync(join(tmpdir(), 'qv-security-floor-'));
const key = join(root, 'independent-kek.bin');
let w: World;
let original: string;
let serial = 0;
before(async () => {
  w = new World({ seed: 'private-backup-floor', n: 3, t: 2, voters: 2, witnessQuorum: 0, pinnedRoll: true });
  await w.start(); await w.setupOrgAndElection(); await w.publishManifest();
  const rt = (await w.server.pool.get(w.electionId))!;
  const dek = unseal(w.server.env.kek, w.server.env.control.election(w.electionId)!.dek_wrapped!, `dek:${w.electionId}`);
  rt.edb.addInvites([{ invite_id: 'invite-private-canary', code_hash: sha256(utf8('invite-code-canary')), state: 'issued',
    label_enc: seal(dek, utf8('private-label-canary'), 'label'), contact_enc: seal(dek, utf8('private-contact-canary'), 'contact'),
    created_at: w.clock, expires_at: null }]);
  dek.fill(0);
  const control = w.server.env.control;
  control.insertWebhook({ webhook_id: 'hook-canary', org_id: w.orgId, election_id: w.electionId, events: '["entry"]',
    url_enc: seal(w.server.env.kek, utf8('https://example.invalid/private-webhook'), 'webhook:hook-canary:url'),
    secret_enc: seal(w.server.env.kek, utf8('private-hook-secret-canary'), 'webhook:hook-canary:secret') });
  copyFileSync(join(w.dir, 'kek', 'kek.bin'), key); chmodSync(key, 0o600);
  const result = await backupWork(w.server.env, w.server.pool, 'security-floor', 'all', undefined,
    { jobId: 'security-floor', signal: new AbortController().signal, progress: () => {}, tick: async () => {} });
  original = join(w.dir, result.result_ref!);
}, { timeout: 60000 });
after(async () => { await w.stop(); rmSync(root, { recursive: true, force: true }); });

function changed(file: 'control' | 'election', change: (db: DatabaseSync) => void, source = original): string {
  const dir = join(root, `snapshot-${++serial}`); cpSync(source, dir, { recursive: true });
  const db = new DatabaseSync(join(dir, file === 'control' ? 'control.sqlite' : `elections-${w.electionId}.sqlite`));
  try { change(db); } finally { db.close(); }
  const path = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { files: { name: string; bytes: number; sha256: string }[] };
  for (const f of manifest.files) {
    const bytes = readFileSync(join(dir, f.name)); f.bytes = bytes.length; f.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(path, JSON.stringify(manifest)); return dir;
}
async function refuses(candidate: string, floor: string): Promise<void> {
  const destination = join(root, `refused-${++serial}`);
  await assert.rejects(restoreBackup(candidate, key, destination, floor), (e: unknown) => e instanceof BackupError && e.code === 'BACKUP_SECURITY_ROLLBACK');
  assert.equal(existsSync(destination), false);
}

test('private restore cannot downgrade the recorded registration scheme', async () => {
  const downgraded = changed('election', (db) => db.exec("UPDATE election SET registration_scheme='legacy-raw-v1'"));
  await refuses(downgraded, original);
});

test('private restore preserves an attached pinned roll beyond request expiry without changing public history', async () => {
  const members = w.voters.map((voter) => Buffer.from(voter.publicKey).toString('hex')).sort();
  const expiredRequests = changed('control', (db) => db.exec('UPDATE idempotency SET expires_at=1; UPDATE replay_nonce SET expires_at=1'));
  const bound = changed('election', (db) => db.exec('UPDATE operation_receipt SET expires_at=1'), expiredRequests);
  const legacy = changed('election', (db) => {
    const pinned = db.prepare('SELECT root,size,keys_json FROM pinned_roll WHERE id=1').get();
    assert.ok(pinned, 'the signed creation supplied the complete membership');
    assert.deepEqual(JSON.parse(pinned['keys_json'] as string), members);
    // Recreate a genuine schema-9 copy: that version could publish a pinned
    // manifest without possessing its full list. Opening it migrates only the
    // disposable verification copy; the source snapshot remains unchanged.
    db.exec('DROP TABLE pinned_roll; DELETE FROM schema_migration WHERE version=10; PRAGMA user_version=9');
  }, bound);
  const currentReport = await verifyBackup(bound, key);
  const legacyReport = await verifyBackup(legacy, key);
  assert.deepEqual(legacyReport.elections, currentReport.elections, 'public log floors alone cannot detect the missing list');
  await refuses(legacy, bound);
  await restoreBackup(bound, key, join(root, 'pinned-membership-added'), legacy);
  const text = JSON.stringify(currentReport);
  assert.equal(text.includes('keys_json'), false);
  assert.equal(text.includes('pinnedRolls'), false);
  for (const member of members) assert.equal(text.includes(member), false, 'private recovery evidence is not added to reports');
});

test('minimum snapshot refuses resurrecting revoked organizer credentials with unchanged public history', async () => {
  const floor = changed('control', (db) => db.exec('UPDATE account_key SET revoked_at=1'));
  assert.deepEqual((await verifyBackup(original, key)).elections, (await verifyBackup(floor, key)).elections);
  await refuses(original, floor);
  const missing = changed('control', (db) => db.exec('DELETE FROM account_key'), floor);
  // An omitted historical author already fails structural authentication, before floor comparison.
  await assert.rejects(restoreBackup(missing, key, join(root, 'missing-author'), floor));
  const report = await restoreBackup(floor, key, join(root, 'revocation-preserved'), floor);
  assert.equal(report.elections.length, 1);
  assert.equal(Object.hasOwn(report, 'security'), false);
});

test('minimum snapshot retains organization suspension and webhook disable/delete evidence', async () => {
  await refuses(original, changed('control', (db) => db.exec("UPDATE org SET status='suspended'")));
  const disabled = changed('control', (db) => db.exec('UPDATE webhook SET disabled_at=1'));
  await refuses(original, disabled);
  const lostDisable = changed('control', (db) => db.exec('DELETE FROM webhook'), disabled);
  await refuses(lostDisable, disabled);
  const floor = changed('control', (db) => db.exec("DELETE FROM webhook; INSERT INTO operator_audit(ts,actor,action,target,detail) VALUES (1,'operator','webhook.delete','hook-canary','{}')"));
  await refuses(original, floor);
  const omitted = changed('control', (db) => db.exec("DELETE FROM operator_audit WHERE action='webhook.delete'"), floor);
  await refuses(omitted, floor);
  await restoreBackup(floor, key, join(root, 'disabled-then-deleted'), disabled);
});

test('minimum snapshot retains live replay and idempotency protection but permits expiry', async () => {
  const expiry = Date.now() + 86400000;
  const floor = changed('control', (db) => {
    db.prepare('INSERT INTO replay_nonce(key_id,nonce,expires_at) VALUES (?,?,?)').run('key-canary', 'nonce-canary', expiry);
    db.prepare('INSERT INTO idempotency(principal,idem_key,method,path,req_sha256,status,response,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('principal-canary', 'request-canary', 'POST', '/orgs', sha256(utf8('request-private-canary')), 201, utf8('response-private-canary'), 1, expiry);
  });
  await refuses(original, floor);
  const noNonce = changed('control', (db) => db.exec("DELETE FROM replay_nonce WHERE key_id='key-canary'"), floor);
  await refuses(noNonce, floor);
  const noRequest = changed('control', (db) => db.exec("DELETE FROM idempotency WHERE principal='principal-canary'"), floor);
  await refuses(noRequest, floor);
  const pending = changed('control', (db) => db.exec("UPDATE idempotency SET status=0 WHERE principal='principal-canary'"), floor);
  await refuses(pending, floor);
  const altered = changed('control', (db) => db.exec("UPDATE idempotency SET response=X'00' WHERE principal='principal-canary'"), floor);
  await refuses(altered, floor);
  const expired = changed('control', (db) => db.exec('UPDATE replay_nonce SET expires_at=1; UPDATE idempotency SET expires_at=1'), floor);
  await restoreBackup(original, key, join(root, 'expired-records-pruned'), expired);
  const text = JSON.stringify(await verifyBackup(floor, key));
  for (const canary of ['nonce-canary', 'request-canary', 'response-private-canary', 'private-contact-canary', 'hook-canary']) assert.equal(text.includes(canary), false);
});

test('minimum snapshot prevents invitation reactivation and resurrection of erased contact data', async () => {
  const closed = changed('election', (db) => db.exec("UPDATE voter_invite SET state='revoked',closed_at=1"));
  await refuses(original, closed);
  const purged = changed('election', (db) => db.exec('UPDATE voter_invite SET label_enc=NULL,contact_enc=NULL'), closed);
  await refuses(closed, purged);
  await refuses(changed('election', (db) => db.exec('UPDATE voter_invite SET closed_at=2'), closed), closed);
  await refuses(changed('election', (db) => db.exec('UPDATE voter_invite SET expires_at=9999999999999'), closed), closed);
  const omitted = changed('election', (db) => db.exec('DELETE FROM voter_invite'), purged);
  await refuses(omitted, purged);
  await restoreBackup(purged, key, join(root, 'purge-preserved'), closed);
});

test('minimum snapshot retains the durable event forwarding cursor', async () => {
  const floor = changed('control', (db) => db.prepare('INSERT OR REPLACE INTO webhook_event_cursor(election_id,event_id) VALUES (?,?)').run(w.electionId, 1));
  const missing = changed('control', (db) => db.exec('DELETE FROM webhook_event_cursor'), floor);
  const older = changed('control', (db) => db.exec('UPDATE webhook_event_cursor SET event_id=0'), floor);
  await refuses(missing, floor); await refuses(older, floor);
  await restoreBackup(floor, key, join(root, 'event-cursor-preserved'), floor);
});

test('minimum snapshot retains unexpired election receipts or their equivalent completed control response', async () => {
  const expiry = Date.now() + 86400000;
  const body = JSON.stringify({ invites: [{ invite_id: 'committed-canary', code_withheld: true }] });
  const requestHash = sha256(utf8('operation-request-canary'));
  const pending = changed('control', (db) => db.prepare('INSERT INTO idempotency(principal,idem_key,method,path,req_sha256,status,response,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('operation-principal', 'operation-key', 'POST', '/invites', requestHash, -1, null, 1, expiry));
  const floor = changed('election', (db) => db.prepare('INSERT INTO operation_receipt(principal,idem_key,method,path,req_sha256,expires_at,status,response,audit_action,audit_detail) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('operation-principal', 'operation-key', 'POST', '/invites', requestHash, expiry, 201, body, null, null), pending);
  const missing = changed('election', (db) => db.exec('DELETE FROM operation_receipt'), floor);
  await refuses(missing, floor);
  const altered = changed('election', (db) => db.exec("UPDATE operation_receipt SET response='{}' WHERE principal='operation-principal'"), floor);
  await refuses(altered, floor);
  const changedGeneration = changed('control', (db) => db.exec("UPDATE idempotency SET expires_at=expires_at+1 WHERE principal='operation-principal'"), floor);
  await refuses(changedGeneration, floor);
  const wrongCompleted = changed('control', (db) => db.exec("UPDATE idempotency SET status=201,response=X'7B7D' WHERE principal='operation-principal'"), floor);
  await refuses(wrongCompleted, floor);
  const promoted = changed('control', (db) => db.prepare("UPDATE idempotency SET status=201,response=? WHERE principal='operation-principal'").run(utf8(body)), missing);
  await restoreBackup(promoted, key, join(root, 'receipt-promoted'), floor);
  const delayed = changed('control', (db) => db.prepare("UPDATE idempotency SET status=201,response=?,expires_at=expires_at+60000 WHERE principal='operation-principal'").run(utf8(body)), floor);
  const redundantRemoved = changed('election', (db) => db.exec("DELETE FROM operation_receipt WHERE principal='operation-principal'"), delayed);
  await restoreBackup(redundantRemoved, key, join(root, 'receipt-delayed-promoted'), floor);
  await restoreBackup(redundantRemoved, key, join(root, 'receipt-completed-redundant'), delayed);
  const wrong = changed('control', (db) => db.exec("UPDATE idempotency SET response=X'7B7D' WHERE principal='operation-principal'"), promoted);
  await refuses(wrong, floor);
  const expired = changed('election', (db) => db.exec('UPDATE operation_receipt SET expires_at=1'), floor);
  await restoreBackup(missing, key, join(root, 'receipt-expired'), expired);
  assert.equal(JSON.stringify(await verifyBackup(floor, key)).includes('committed-canary'), false);
});
