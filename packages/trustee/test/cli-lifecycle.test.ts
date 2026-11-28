// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-016 QV-17-REQ-030 QV-17-REQ-040 QV-17-REQ-060 QV-17-REQ-080
// Exercises the CLI gaps left by the existing actual-process 2-of-3 DKG/tally journey.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { PROTO_ID, collectSpoilShares, decryptSpoiled, signRecordRaw, verifySig, type MultiSignedRecord, type SignedRecord } from '@quietvote/protocol';
import { main } from '../src/cli.ts';
import { Trustee, tombstonePath, verifyKeycheck, verifyTranscript, type AuditCloseBody, type KeycheckBody, type KeyDestructionBody, type Packet, type Transcript } from '../src/index.ts';
import { Ceremony, PASS, electionFixture, finishTally, verifyAll } from './helpers/harness.ts';

const H = bytesToHex;
const BACKUP_PASS = 'cli-lifecycle-backup-passphrase';
const RESTORED_PASS = 'cli-lifecycle-restored-passphrase';
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const writeJson = (c: Ceremony, name: string, value: unknown): string => {
  const path = join(c.dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
};

function cli(c: Ceremony) {
  const messages: string[] = [];
  const run = async (args: string[], expected = 0, errorCode?: string, passphrase = PASS, i = 1): Promise<Record<string, unknown>> => {
    const out: string[] = [], err: string[] = [];
    const code = await main([...args, '--json'], {
      out: (s) => out.push(s), err: (s) => err.push(s),
      promptSecret: async (q) => q === 'Backup passphrase: ' ? BACKUP_PASS : passphrase,
    }, c.deps.get(i)!, {});
    messages.push(...out, ...err);
    for (const secret of [PASS, BACKUP_PASS, RESTORED_PASS]) assert.equal([...out, ...err].join('').includes(secret), false, 'CLI output leaked a passphrase');
    assert.equal(code, expected, `${args[0]}: ${err.join('\n')}`);
    assert.equal(out.length + err.length, 1, 'exactly one JSON report per command');
    const report = JSON.parse((out[0] ?? err[0])!) as Record<string, unknown>;
    if (errorCode !== undefined) {
      assert.deepEqual(out, []);
      assert.equal(report['ok'], false);
      assert.equal(report['code'], errorCode);
    } else assert.deepEqual(err, []);
    return report;
  };
  const command = (i: number, name: string, args: string[] = [], expected = 0, errorCode?: string) =>
    run([name, '--bundle', c.path(i), ...args], expected, errorCode, PASS, i);
  return { messages, run, command };
}

async function canaries(c: Ceremony): Promise<Buffer[]> {
  const secrets = [Buffer.from(PASS), Buffer.from(BACKUP_PASS), Buffer.from(RESTORED_PASS)];
  for (const i of c.honest()) {
    const t = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
    for (const hex of [t.data.sk_sign, t.data.sk_i, t.data.dealer?.e, ...(t.data.dealer?.coeffs ?? [])]) {
      if (hex !== undefined) secrets.push(Buffer.from(hex), Buffer.from(hexToBytes(hex, 32)));
    }
  }
  return secrets;
}

function noSecrets(c: Ceremony, messages: string[], secrets: Buffer[]): void {
  const check = (bytes: Buffer, where: string): void => {
    for (const secret of secrets) assert.equal(bytes.includes(secret), false, `secret canary leaked in ${where}`);
  };
  check(Buffer.from(messages.join('\n')), 'CLI output');
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) check(readFileSync(path), entry.name);
    }
  };
  walk(c.dir);
}

test('CLI 3-of-5 drill and transcript export/cosign/verify produce authenticated outputs and typed refusals', async () => {
  const c = new Ceremony({ n: 5, t: 3, seed: 'cli-lifecycle-transcript' });
  await c.setup();
  try {
    const call = cli(c);
    const unavailable = join(c.dir, 'not-ready.json');
    await call.command(1, 'drill', [], 40, 'WRONG_STATE');
    await call.command(1, 'export-transcript', ['--out', unavailable], 40, 'TRANSCRIPT_NOT_READY');
    assert.equal(existsSync(unavailable), false);
    await call.run(['drill', '--bundle', c.path(1)], 50, 'BAD_PASSPHRASE', 'wrong-passphrase');

    // Stop before the library's drill so this success exercises the CLI's actual transition.
    const outcome = await c.runDkg({ drill: false });
    const secrets = await canaries(c);
    await call.command(1, 'drill', [], 40, 'NOT_FINAL');
    const log = join(c.dir, 'final.qvl');
    writeFileSync(log, c.slice());
    for (const i of c.honest()) {
      await call.command(i, 'import', ['--log', log]);
      const output = join(c.dir, `drill-${i}.qvp`);
      const report = await call.command(i, 'drill', ['--out', output]);
      assert.equal(report['state'], 'DRILLED');
      const packet = readJson<Packet['obj']>(output);
      assert.equal(packet.round, 'drill-keycheck');
      assert.equal(packet.from, i);
      assert.equal(packet.records.length, 1);
      const record = packet.records[0] as SignedRecord<KeycheckBody>;
      assert.equal(verifySig(outcome.ctx, 'keycheck', record.body, record.sig, c.manifest.trustees[i - 1]!.sign_pk), true);
      assert.equal(verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(i)!, record.body), true);
      assert.equal(verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(i === 1 ? 2 : 1)!, record.body), false);
      c.push(record);
    }
    const replay = join(c.dir, 'drill-replay.qvp');
    await call.command(1, 'drill', ['--out', replay]);
    assert.deepEqual(readFileSync(replay), readFileSync(join(c.dir, 'drill-1.qvp')));

    let transcriptPath = join(c.dir, 'transcript-1.json');
    await call.command(1, 'export-transcript', ['--out', transcriptPath, '--mode', 'airgap-dkg']);
    const partial = await call.run(['verify-transcript', '--in', transcriptPath]);
    assert.equal(partial['ok'], true);
    assert.equal(partial['complete'], false);
    for (const i of [2, 3, 4, 5]) {
      const next = join(c.dir, `transcript-${i}.json`), prior = readFileSync(transcriptPath);
      const report = await call.command(i, 'cosign-transcript', ['--in', transcriptPath, '--out', next]);
      assert.equal(report['signatures'], i);
      assert.deepEqual(readFileSync(transcriptPath), prior, 'cosigning never changes the input');
      transcriptPath = next;
    }
    const complete = await call.run(['verify-transcript', '--in', transcriptPath]);
    assert.equal(complete['ok'], true);
    assert.equal(complete['complete'], true);
    assert.deepEqual(complete['trusteesSigned'], [1, 2, 3, 4, 5]);
    const transcript = readJson<Transcript>(transcriptPath);
    assert.equal(transcript.t, 3);
    assert.equal(transcript.n, 5);
    assert.equal((await verifyTranscript(transcript)).complete, true);

    const malformed = writeJson(c, 'malformed-transcript.json', {}), refused = join(c.dir, 'refused-transcript.json');
    await call.command(2, 'cosign-transcript', ['--in', malformed, '--out', refused], 20, 'TRANSCRIPT_FORMAT');
    const mismatch = writeJson(c, 'mismatch-transcript.json', { ...transcript, summary_hash: 'ff'.repeat(32) });
    await call.command(2, 'cosign-transcript', ['--in', mismatch, '--out', refused], 60, 'TRANSCRIPT_MISMATCH');
    assert.equal(existsSync(refused), false);
    const tampered = structuredClone(transcript);
    tampered.signatures[0]!.sig.sig = '00'.repeat(64);
    const invalid = writeJson(c, 'invalid-signature.json', tampered);
    const bad = await call.run(['verify-transcript', '--in', invalid], 20);
    assert.equal(bad['ok'], false);
    assert.equal((bad['problems'] as unknown[]).length > 0, true);
    noSecrets(c, call.messages, secrets);
  } finally { c.cleanup(); }
});

test('CLI 3-of-5 spoil release, restore and destroy preserve release guards and verify cryptographically', async () => {
  const f = await electionFixture({ n: 5, t: 3, seed: 'cli-lifecycle-release', spoilDecrypt: true, close: false });
  const c = f.c;
  try {
    const call = cli(c), secrets = await canaries(c);
    const built = c.build(f.outcome, 0, { budget: ['yes'] }, 1), code = c.spoil(f.outcome, 0, built);
    c.marker('election-close');
    const log = join(c.dir, 'closed.qvl');
    writeFileSync(log, c.slice());
    for (const i of c.honest()) await call.command(i, 'import', ['--log', log]);
    const election = writeJson(c, 'election.json', c.bundle());
    const backup = join(c.dir, 'before-release.qvtb');
    await call.command(1, 'backup', ['--to', backup]);
    const backupBytes = readFileSync(backup);
    const refused = join(c.dir, 'refused.qvp');
    await call.command(1, 'spoil-release', ['--election', election, '--codes', 'not-a-code', '--out', refused], 2, 'BAD_SPOIL_REQUEST');
    await call.command(1, 'spoil-release', ['--election', election, '--codes', 'ff'.repeat(32), '--out', refused], 60, 'NOT_SPOILED');
    const noEvidence = writeJson(c, 'no-evidence.json', c.bundle({ evidence: false }));
    await call.command(1, 'spoil-release', ['--election', noEvidence, '--codes', code, '--out', refused], 60, 'LOG_EVIDENCE_REQUIRED');
    assert.equal(existsSync(refused), false);

    const spoilRecords: unknown[] = [], tallyRecords: unknown[] = [];
    for (const i of [1, 2, 3]) {
      const output = join(c.dir, `spoil-${i}.qvp`);
      await call.command(i, 'spoil-release', ['--election', election, '--codes', code, '--out', output]);
      const packet = readJson<Packet['obj']>(output);
      assert.equal(packet.round, 'spoil-share');
      assert.equal(packet.from, i);
      assert.equal(packet.records.length, 1);
      spoilRecords.push(...packet.records);
    }
    const shares = collectSpoilShares(c.manifest, f.outcome.ctx, code, spoilRecords);
    assert.deepEqual(shares.rejected, []);
    assert.deepEqual([...shares.sets.keys()], [1, 2, 3]);
    const decrypted = decryptSpoiled(c.params(f.outcome), f.outcome.Y, new Set(f.outcome.Q), { code, body: built.body }, shares.sets);
    assert.equal(decrypted.ok, true);
    if (decrypted.ok) assert.deepEqual(decrypted.value.selections, { budget: ['yes'] });
    await call.command(1, 'spoil-release', ['--election', election, '--codes', code, '--out', refused], 60, 'SPOIL_REPLAY');
    assert.equal(existsSync(refused), false);

    for (const i of [1, 2, 3]) {
      const output = join(c.dir, `tally-${i}.qvp`);
      await call.command(i, 'tally-release', ['--election', election, '--out', output]);
      tallyRecords.push(...readJson<Packet['obj']>(output).records);
    }
    const tally = finishTally(c, f.outcome, tallyRecords);
    assert.deepEqual(tally.rejected, []);
    assert.deepEqual(tally.valid, [1, 2, 3]);
    assert.equal(tally.counts?.get('budget')?.get('yes'), f.expectedYes);
    assert.equal(tally.counts?.get('budget')?.get('no'), f.expectedNo);
    assert.equal((await verifyAll(c)).verdict, 'PASS');

    const restored = join(c.dir, 'restored.qvtb');
    await call.run(['restore', '--from', backup, '--bundle', restored], 0, undefined, RESTORED_PASS);
    assert.deepEqual(readFileSync(backup), backupBytes, 'restore keeps the source backup unchanged');
    const status = await call.run(['status', '--bundle', restored], 0, undefined, RESTORED_PASS);
    assert.equal(status['state'], 'RELEASED', 'older backup adopts authenticated release history');
    assert.equal(status['sign_pk'], c.manifest.trustees[0]!.sign_pk);
    await call.run(['status', '--bundle', restored], 50, 'BAD_PASSPHRASE');
    await call.run(['restore', '--from', backup, '--bundle', restored], 40, 'BUNDLE_EXISTS', RESTORED_PASS);
    await call.run(['spoil-release', '--bundle', restored, '--election', election, '--codes', code, '--out', refused], 60, 'SPOIL_REPLAY', RESTORED_PASS);
    const again = join(c.dir, 'restored-tally.qvp');
    await call.run(['tally-release', '--bundle', restored, '--election', election, '--out', again], 0, undefined, RESTORED_PASS);
    assert.deepEqual(readFileSync(again), readFileSync(join(c.dir, 'tally-1.qvp')));

    c.deps.get(1)!.now = () => new Date('2026-12-02T00:00:00Z');
    const body: AuditCloseBody = { proto: PROTO_ID, type: 'audit-close', ctx: H(f.outcome.ctx), closed_at: '2026-11-09T00:00:00Z' };
    const close: MultiSignedRecord<AuditCloseBody> = { body, sigs: [signRecordRaw(c.coord.secretKey, c.coord.publicKey, f.outcome.ctx, 'audit-close', body)] };
    const closeFile = writeJson(c, 'audit-close.json', close);
    const before = readFileSync(restored);
    await call.run(['destroy', '--bundle', restored, '--audit-close', closeFile, '--confirm', 'wrong title'], 10, 'CONFIRMATION_MISMATCH', RESTORED_PASS);
    const forged = structuredClone(close);
    forged.sigs[0]!.sig = '00'.repeat(64);
    const forgedFile = writeJson(c, 'forged-close.json', forged);
    await call.run(['destroy', '--bundle', restored, '--audit-close', forgedFile, '--confirm', c.manifest.title], 60, 'NO_AUDIT_CLOSE', RESTORED_PASS);
    assert.deepEqual(readFileSync(restored), before);
    assert.deepEqual(readFileSync(backup), backupBytes);
    const destroyed = await call.run(['destroy', '--bundle', restored, '--audit-close', closeFile, '--confirm', c.manifest.title], 0, undefined, RESTORED_PASS);
    assert.deepEqual(destroyed['backups_removed'], [backup]);
    assert.deepEqual(destroyed['backups_missing'], []);
    assert.equal(existsSync(restored), false);
    assert.equal(existsSync(backup), false);
    assert.equal(existsSync(tombstonePath(restored)), true);
    const attestation = readJson<SignedRecord<KeyDestructionBody>>(destroyed['attestation'] as string);
    assert.equal(attestation.body.ctx, H(f.outcome.ctx));
    assert.equal(attestation.body.j, 1);
    assert.equal(verifySig(f.outcome.ctx, 'key-destruction', attestation.body, attestation.sig, c.manifest.trustees[0]!.sign_pk), true);
    await call.run(['status', '--bundle', restored], 40, 'DESTROYED', RESTORED_PASS);
    await call.run(['restore', '--from', backup, '--bundle', restored], 40, 'DESTROYED', RESTORED_PASS);
    noSecrets(c, call.messages, secrets);
  } finally { c.cleanup(); }
});

test('CLI abort clears ceremony secrets and restart creates a fresh identity without reusing the old manifest', async () => {
  const c = new Ceremony({ n: 5, t: 3, seed: 'cli-lifecycle-abort' });
  await c.setup();
  try {
    const call = cli(c), oldKey = c.manifest.trustees[0]!.sign_pk;
    await call.command(1, 'restart', [], 40, 'WRONG_STATE');
    c.marker('dkg-open');
    const log = join(c.dir, 'open.qvl');
    writeFileSync(log, c.slice());
    await call.command(1, 'import', ['--log', log]);
    await call.command(1, 'commit', ['--out', join(c.dir, 'commit.qvp')]);
    const secrets = await canaries(c);
    const aborted = await call.command(1, 'abort', ['--reason', 'operator ended this rehearsal']);
    assert.equal(aborted['state'], 'ABORTED');
    const stopped = await Trustee.open(c.path(1), PASS, c.deps.get(1)!);
    assert.equal(stopped.data.dealer, undefined);
    assert.equal(stopped.data.sk_i, undefined);
    assert.equal(stopped.data.derived, undefined);
    assert.deepEqual(stopped.data.received, {});
    assert.equal(stopped.data.out.commit, undefined);
    assert.equal(stopped.data.out.dealing, undefined);
    await call.command(1, 'commit', [], 40, 'WRONG_STATE');
    await call.command(1, 'abort', ['--reason', 'again'], 40, 'WRONG_STATE');
    const restarted = await call.command(1, 'restart');
    assert.equal(restarted['state'], 'KEYS_READY');
    assert.match(restarted['sign_pk'] as string, /^[0-9a-f]{64}$/);
    assert.notEqual(restarted['sign_pk'], oldKey);
    const fresh = await Trustee.open(c.path(1), PASS, c.deps.get(1)!);
    assert.equal(fresh.data.manifest, undefined);
    assert.equal(fresh.data.ceremony_id, undefined);
    assert.equal(fresh.data.sk_i, undefined);
    assert.deepEqual(fresh.data.log, []);
    secrets.push(Buffer.from(fresh.data.sk_sign), Buffer.from(hexToBytes(fresh.data.sk_sign, 32)));
    const manifest = writeJson(c, 'old-manifest.json', c.mrec);
    await call.command(1, 'join', ['--manifest', manifest, '--manifest-hash', H(c.mh)], 20, 'NOT_A_TRUSTEE');
    assert.equal((await call.command(1, 'status'))['state'], 'KEYS_READY');
    // No second server ceremony or protocol restart policy is introduced by this local-identity check.
    noSecrets(c, call.messages, secrets);
  } finally { c.cleanup(); }
});
