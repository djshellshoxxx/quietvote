// Adversarial regression tests from the trustee audit (docs/audit/trustee.md, IDs TR-xx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { bytesToHex } from '@quietvote/crypto';
import { ballotCode, makeSpoil, type BallotBody } from '@quietvote/protocol';
import { Trustee, TrusteeError } from '../src/index.ts';
import { Ceremony, PASS, electionFixture } from './helpers/harness.ts';

const H = bytesToHex;
const rejects = async (p: Promise<unknown>, code: string): Promise<void> => {
  await assert.rejects(p, (e: unknown) => e instanceof TrusteeError && e.code === code, code);
};

test('TR-01: a cast ballot re-wrapped as a trustee-mode spoil under a new code (same ciphertexts) is never decrypted', async () => {
  const fx = await electionFixture({ n: 4, t: 3, seed: 'audit-tr01', spoilDecrypt: true, close: false });
  const c = fx.c;
  try {
    const o = fx.outcome;
    const p = c.params(o);
    // voter 0 casts a fresh ballot (counted) ...
    const b = c.build(o, 0, { budget: ['no'] }, 7);
    const body = b.body;
    // ... then (malicious client / coercer holding the voter key) re-wraps the SAME ciphertexts and proofs under a different
    // `supersedes`: a different ballot code, still a valid, voter-signed, trustee-mode spoil record.
    c.castBuilt(o, 0, b);
    const forged: BallotBody = { ...body, supersedes: 'ff'.repeat(32) };
    const code = ballotCode(p.ctx, forged);
    c.push(makeSpoil(p, c.voters[0]!.secretKey, { ...b, body: forged, code }, 'trustees'));
    c.marker('election-close');
    await c.syncAll();
    assert.notEqual(H(code), H(b.code));
    // Refused either by the relay's own ciphertext check (CIPHERTEXT_WAS_CAST) or, once the protocol log analysis excludes a
    // re-wrapped spoil (CP-01, PR crypto-protocol), earlier as NOT_SPOILED: both mean nothing is decrypted.
    await assert.rejects(c.act(1, (t) => t.releaseSpoil(c.bundle(), [H(code)])), (e: unknown) => e instanceof TrusteeError && ['CIPHERTEXT_WAS_CAST', 'NOT_SPOILED'].includes(e.code));
    // nothing was recorded as released
    const t = await Trustee.open(c.path(1), PASS, c.deps.get(1)!);
    assert.equal(t.data.out.spoil?.[H(code)], undefined);
  } finally {
    c.cleanup();
  }
});

test('TR-02: tally release before the trustee imported election-open is refused cleanly (WRONG_STATE), then works after import', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'audit-tr02', voters: 6 });
  await c.setup();
  try {
    const o = await c.runDkg({ drill: false }); // trustees stay in CONFIRMED, never see election-open
    c.openElection();
    ['yes', 'no', 'yes', 'yes', 'no', 'yes'].forEach((v, k) => c.cast(o, k, { budget: [v] }));
    c.marker('election-close');
    const before = await Trustee.open(c.path(1), PASS, c.deps.get(1)!);
    assert.equal(before.state, 'CONFIRMED');
    await rejects(c.act(1, (t) => t.releaseTally(c.bundle())), 'WRONG_STATE');
    assert.equal((await Trustee.open(c.path(1), PASS, c.deps.get(1)!)).state, 'CONFIRMED', 'refusal changes no state');
    await c.sync(1); // import the public log slice: now the trustee knows the election opened
    const pk = await c.act(1, (t) => t.releaseTally(c.bundle()));
    assert.equal(pk.round, 'tally-share');
    assert.equal((await Trustee.open(c.path(1), PASS, c.deps.get(1)!)).state, 'RELEASED');
  } finally {
    c.cleanup();
  }
});

test('vault: header tampering (work factor, salt, nonce) and truncation lock the bundle; nothing is decrypted', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'audit-vault' });
  await c.setup();
  try {
    const p = c.path(1);
    const deps = c.deps.get(1)!;
    const raw = readFileSync(p);
    const cases: [string, (g: Buffer) => Buffer, string[]][] = [
      ['logN', (g) => { g[8] = g[8]! + 1; return g; }, ['BAD_PASSPHRASE']],
      ['logN too high', (g) => { g[8] = 30; return g; }, ['BUNDLE_FORMAT']],
      ['salt', (g) => { g[12] = g[12]! ^ 1; return g; }, ['BAD_PASSPHRASE']],
      ['payload nonce', (g) => { g[9 + 16 + 12 + 48 + 3] = g[9 + 16 + 12 + 48 + 3]! ^ 1; return g; }, ['BAD_PASSPHRASE']],
      ['truncated', (g) => g.subarray(0, 60), ['BUNDLE_FORMAT']],
      ['magic', (g) => { g[0] = 0; return g; }, ['BUNDLE_FORMAT']],
    ];
    for (const [name, f, codes] of cases) {
      writeFileSync(p, f(Buffer.from(raw)), { mode: 0o600 });
      await assert.rejects(Trustee.open(p, PASS, deps), (e: unknown) => e instanceof TrusteeError && codes.includes(e.code), name);
    }
    writeFileSync(p, raw, { mode: 0o600 });
    assert.equal((await Trustee.open(p, PASS, deps)).state, 'ACCEPTED');
  } finally {
    c.cleanup();
  }
});

test('malicious coordinator: a bundle sealed under another passphrase/file swapped in is refused; a foreign election bundle cannot be released', async () => {
  const fx = await electionFixture({ n: 3, t: 2, seed: 'audit-swap' });
  const g = await electionFixture({ n: 3, t: 2, seed: 'audit-swap-other' });
  try {
    // the other election's (valid, verifiable) bundle is refused by every share of this one
    await rejects(fx.c.act(1, (t) => t.releaseTally(g.c.bundle())), 'WRONG_ELECTION');
    await rejects(fx.c.act(1, (t) => t.releaseSpoil(g.c.bundle(), ['ab'.repeat(32)])), 'WRONG_ELECTION');
    // same manifest, swapped manifest_hash field only
    await rejects(fx.c.act(1, (t) => t.releaseTally({ ...fx.c.bundle(), manifest_hash: H(g.c.mh) })), 'WRONG_ELECTION');
    // garbage shapes
    for (const junk of [null, 42, 'x', {}, { manifest: fx.c.mrec, roll: 'no', log: [] }]) await rejects(fx.c.act(1, (t) => t.releaseTally(junk)), 'BUNDLE_FORMAT');
    // still releasable afterwards: refusals did not consume the one-shot release
    assert.equal((await fx.c.act(1, (t) => t.releaseTally(fx.c.bundle()))).round, 'tally-share');
  } finally {
    fx.c.cleanup();
    g.c.cleanup();
  }
});
