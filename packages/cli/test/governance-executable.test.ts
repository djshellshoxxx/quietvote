import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, ftruncateSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { bytesToHex, ed25519Keypair, jcs, sha256, utf8 } from '@quietvote/crypto';
import { groupPolicyTemplate, type GroupRulesBody, type GroupRulesEnvelope } from '@quietvote/protocol';

const BIN = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const key = (name: string) => ed25519Keypair(sha256(utf8(`governance-cli-independent/${name}`)));
const identity = key('identity'), stewards = [key('a'), key('b'), key('c')], outsider = key('outsider');
const identityHex = bytesToHex(identity.publicKey);
const temp = () => mkdtempSync(join(tmpdir(), 'qv-governance-cli-'));
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function put(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return path;
}
function keyFile(dir: string, name: string, pair = identity): string {
  return put(dir, name, { format: 'qv-voter-key/v1', public_key: bytesToHex(pair.publicKey), seed: bytesToHex(pair.secretKey) });
}
function run(args: string[], code: number, input?: string) {
  // An unrelated working directory verifies module-relative executable startup.
  const r = spawnSync(process.execPath, [BIN, 'governance', ...args], { cwd: tmpdir(), encoding: 'utf8', input, timeout: 30_000 });
  assert.equal(r.error, undefined, `${args.slice(0, 2)} must not block`);
  assert.equal(r.status, code, `${args.slice(0, 2)}: ${r.stderr}\n${r.stdout}`);
  return r;
}
function setup(dir: string) {
  const policy = put(dir, 'policy.json', groupPolicyTemplate('foundation'));
  const body = join(dir, 'body.json');
  const prepared = run(['prepare', 'genesis', '--policy', policy, '--identity-key', identityHex,
    ...stewards.flatMap(s => ['--steward-key', bytesToHex(s.publicKey)]), '--out', body], 0);
  const hash = JSON.parse(prepared.stdout).rules_hash as string;
  const pins = ['--identity-key', identityHex, '--genesis-hash', hash];
  const keys = [keyFile(dir, 'identity.key'), ...stewards.map((s, i) => keyFile(dir, `steward${i}.key`, s))];
  return { policy, body, hash, pins, keys };
}
function completeGenesis(dir: string) {
  const f = setup(dir);
  let record = f.body;
  for (let i = 0; i < 3; i++) {
    const out = join(dir, `signed${i}.json`);
    const r = run(['sign', i === 0 ? '--body' : '--record', record, ...f.pins, '--rules-hash', f.hash, '--key', f.keys[i]!, '--out', out], 0);
    assert.equal(JSON.parse(r.stdout).quorum, i === 2);
    record = out;
  }
  const history = join(dir, 'history.json');
  run(['export', '--record', record, ...f.pins, '--out', history], 0);
  return { ...f, record, history };
}

test('actual governance CLI prepares, co-signs, exports and verifies genesis then keeps an amendment pending', () => {
  const dir = temp();
  try {
    const f = completeGenesis(dir);
    const body = json(f.body) as GroupRulesBody;
    assert.equal(f.hash, bytesToHex(sha256(new Uint8Array([...utf8('QV-rules/1'), ...jcs(body)]))));
    const complete = json(f.record) as GroupRulesEnvelope;
    assert.equal(complete.sigs.length, 3);
    assert.deepEqual(complete.sigs.map(s => s.key), complete.sigs.map(s => s.key).sort());
    const verified = JSON.parse(run(['verify', f.history, ...f.pins, '--json'], 0).stdout);
    assert.equal(verified.scope, 'signed-group-rules');
    assert.equal(verified.status, 'VERIFIED');
    assert.equal(verified.election_authorized, false);
    assert.equal(verified.active_rules_hash, f.hash);
    const draft = groupPolicyTemplate('foundation');
    draft.policy.decision_classes.ordinary.quorum_bp = 2400;
    const policy = put(dir, 'changed-policy.json', draft), amendedBody = join(dir, 'amended-body.json');
    const amend = JSON.parse(run(['prepare', 'amendment', '--policy', policy, '--history', f.history,
      ...f.pins, '--decision-class', 'rules', '--out', amendedBody], 0).stdout);
    assert.equal(amend.version, 2);
    assert.equal(Object.hasOwn(json(amendedBody), 'ratification'), false, 'candidate hash precedes the ratifying election');
    let amendedRecord = amendedBody;
    for (let i = 0; i < 2; i++) {
      const out = join(dir, `amend-signed${i}.json`);
      const r = run(['sign', i === 0 ? '--body' : '--record', amendedRecord, ...f.pins, '--history', f.history,
        '--rules-hash', amend.rules_hash, '--key', f.keys[i + 1]!, '--out', out], 0);
      assert.equal(JSON.parse(r.stdout).quorum, i === 1);
      amendedRecord = out;
    }
    // The pointer is deliberately outside the signed body; it never proves a vote.
    const withPointer = put(dir, 'amend-pointer.json', { ...json(amendedRecord), ratification: { manifest_hash: 'ab'.repeat(32) } });
    const malformedPointer = put(dir, 'amend-pointer-array.json', { ...json(amendedRecord), ratification: { manifest_hash: ['ab'.repeat(32)] } });
    run(['sign', '--record', malformedPointer, ...f.pins, '--history', f.history,
      '--rules-hash', amend.rules_hash, '--key', '/missing-secret-key', '--out', join(dir, 'bad-pointer.json')], 4);
    const history2 = join(dir, 'history2.json');
    const exported = JSON.parse(run(['export', '--history', f.history, '--record', withPointer, ...f.pins, '--out', history2], 3).stdout);
    assert.equal(exported.status, 'INCOMPLETE');
    assert.equal(exported.active_version, 1);
    assert.equal(exported.pending_ratifications.length, 1);
    assert.equal(JSON.parse(run(['verify', history2, ...f.pins], 3).stdout).election_authorized, false);
    run(['prepare', 'amendment', '--policy', policy, '--history', history2, ...f.pins,
      '--decision-class', 'rules', '--out', join(dir, 'third.json')], 1);
    assert.equal(existsSync(join(dir, 'third.json')), false);
    if (process.platform !== 'win32') for (const file of [f.body, f.record, f.history, amendedBody, history2]) assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('independent pins, prior signatures and key authority are checked before signing or exporting', () => {
  const dir = temp();
  try {
    const f = completeGenesis(dir), out = join(dir, 'refused.json');
    const signed = json(f.record) as GroupRulesEnvelope;
    const sign = ['sign', '--record', f.record, ...f.pins, '--rules-hash', f.hash, '--key', f.keys[1]!, '--out', out];
    run(sign, 1); // duplicate signer
    run(sign.map(v => v === f.keys[1] ? keyFile(dir, 'outsider.key', outsider) : v), 1);
    const tamper = structuredClone(signed); tamper.sigs[0]!.sig = '00'.repeat(64);
    const bad = put(dir, 'bad-sig.json', tamper);
    run(sign.map(v => v === f.record ? bad : v === f.keys[1] ? '/missing-secret-key' : v), 1);
    const unsorted = put(dir, 'unsorted.json', { ...signed, sigs: [...signed.sigs].reverse() });
    run(sign.map(v => v === f.record ? unsorted : v), 1);
    const duplicate = put(dir, 'duplicate.json', { ...signed, sigs: [signed.sigs[0], signed.sigs[0]] });
    run(sign.map(v => v === f.record ? duplicate : v), 1);
    run(['sign', '--body', f.body, ...f.pins, '--rules-hash', '00'.repeat(32), '--key', '/missing-secret-key', '--out', out], 1);
    run(['sign', '--body', f.body, '--identity-key', identityHex, '--genesis-hash', '00'.repeat(32), '--rules-hash', f.hash, '--key', '/missing-secret-key', '--out', out], 1);
    const partial = put(dir, 'partial.json', { ...signed, sigs: [signed.sigs[0]] });
    run(['export', '--record', partial, ...f.pins, '--out', out], 1);
    assert.equal(existsSync(out), false);
    const hostile = put(dir, 'self-authorized.json', { ...json(f.history), verifyRatification: true });
    assert.equal(JSON.parse(run(['verify', hostile, ...f.pins], 1).stdout).status, 'INVALID');
    run(['verify', f.history, ...f.pins, '--approve-ratification', 'ab'.repeat(32)], 2);
    run(['verify', f.history, '--identity-key', bytesToHex(outsider.publicKey), '--genesis-hash', f.hash], 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a replacement steward set cannot authorize itself or bypass the protected amendment class', () => {
  const dir = temp();
  try {
    const f = completeGenesis(dir), draft = groupPolicyTemplate('foundation');
    draft.policy.stewards.approval = { k: 1, n: 1 };
    const policy = put(dir, 'new-policy.json', draft), body = join(dir, 'replace.json');
    const options = ['prepare', 'amendment', '--policy', policy, '--history', f.history, ...f.pins,
      '--steward-key', bytesToHex(outsider.publicKey), '--out', body];
    run([...options, '--decision-class', 'rules'], 1);
    const prepared = JSON.parse(run([...options, '--decision-class', 'entrenched'], 0).stdout);
    const outsiderFile = keyFile(dir, 'outsider.key', outsider);
    run(['sign', '--body', body, ...f.pins, '--history', f.history, '--rules-hash', prepared.rules_hash,
      '--key', outsiderFile, '--out', join(dir, 'self-authorized.json')], 1);
    run(['sign', '--body', body, ...f.pins, '--history', f.history, '--rules-hash', prepared.rules_hash,
      '--key', f.keys[0]!, '--out', join(dir, 'identity-override.json')], 1);
    const valid = JSON.parse(run(['sign', '--body', body, ...f.pins, '--history', f.history, '--rules-hash', prepared.rules_hash,
      '--key', f.keys[1]!, '--out', join(dir, 'old-steward.json')], 0).stdout);
    assert.equal(valid.steward_threshold, 2);
    assert.equal(valid.quorum, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('strict documents and bounded file inputs reject duplicate JSON, pipes, oversized files and links without overwriting', () => {
  const dir = temp();
  try {
    const f = setup(dir), out = join(dir, 'out.json');
    const base = ['sign', '--body', f.body, ...f.pins, '--rules-hash', f.hash, '--key', f.keys[0]!, '--out', out];
    const duplicateJson = join(dir, 'duplicate.json');
    writeFileSync(duplicateJson, '{"version":1,"version":2}');
    run(base.map(v => v === f.body ? duplicateJson : v), 4);
    const wrongType = put(dir, 'wrong-type.json', { ...json(f.body), version: true });
    run(base.map(v => v === f.body ? wrongType : v), 4);
    const unknown = put(dir, 'unknown.json', { ...json(f.body), override: true });
    run(base.map(v => v === f.body ? unknown : v), 4);
    const huge = join(dir, 'huge.json'), fd = openSync(huge, 'wx');
    try { ftruncateSync(fd, 128 * 1024 + 1); } finally { closeSync(fd); }
    for (const file of [huge, dir]) run(base.map(v => v === f.body ? file : v), 4);
    if (process.platform !== 'win32') {
      const fifo = join(dir, 'fifo'); execFileSync('mkfifo', [fifo]);
      run(base.map(v => v === f.body ? fifo : v), 4);
      const link = join(dir, 'body-link'); symlinkSync(f.body, link);
      run(base.map(v => v === f.body ? link : v), 4);
      chmodSync(f.keys[0]!, 0o644);
      run(base, 4);
      chmodSync(f.keys[0]!, 0o600);
    }
    run(base, 0);
    const original = readFileSync(out);
    run(base, 4);
    assert.deepEqual(readFileSync(out), original);
    if (process.platform !== 'win32') {
      const link = join(dir, 'out-link'); symlinkSync(out, link);
      run(base.map(v => v === out ? link : v), 4);
      assert.deepEqual(readFileSync(out), original);
    }
    const keyMalformed = put(dir, 'bad-key.json', { format: 'qv-voter-key/v1', seed: bytesToHex(identity.secretKey), public_key: identityHex, 'secret-sentinel': 'private-sentinel' });
    const badKey = run(base.map(v => v === f.keys[0] ? keyMalformed : v === out ? join(dir, 'other.json') : v), 4);
    assert.ok(!badKey.stdout.includes('private-sentinel') && !badKey.stderr.includes('private-sentinel'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('actual protected QVKEY1 keys sign with private passphrase input and never emit secrets', () => {
  const dir = temp();
  try {
    const f = setup(dir), protectedKey = join(dir, 'protected.json');
    const seed = join(dir, 'seed.bin'), password = join(dir, 'password.txt');
    writeFileSync(seed, identity.secretKey, { mode: 0o600 });
    writeFileSync(password, 'Governance private fixture password\n', { mode: 0o600 });
    const created = spawnSync(process.execPath, [BIN, 'keygen', '--seed-file', seed, '--passphrase-file', password,
      '--out', protectedKey, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    assert.equal(created.status, 0, created.stderr);
    const result = run(['sign', '--body', f.body, ...f.pins, '--rules-hash', f.hash, '--key', protectedKey,
      '--passphrase-file', password, '--out', join(dir, 'protected-signed.json')], 0);
    assert.equal(JSON.parse(result.stdout).identity_signed, true);
    assert.equal(JSON.parse(result.stdout).quorum, false);
    const wrong = join(dir, 'wrong.txt'); writeFileSync(wrong, 'Wrong governance password\n', { mode: 0o600 });
    const rejected = run(['sign', '--body', f.body, ...f.pins, '--rules-hash', f.hash, '--key', protectedKey,
      '--passphrase-file', wrong, '--out', join(dir, 'wrong-signed.json')], 4);
    const output = result.stdout + result.stderr + rejected.stdout + rejected.stderr;
    assert.ok(!output.includes(bytesToHex(identity.secretKey)));
    assert.ok(!output.includes('Governance private fixture password'));
    assert.ok(!output.includes('Wrong governance password'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
