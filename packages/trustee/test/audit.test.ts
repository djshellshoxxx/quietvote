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

/**
 * Two election bundles that each pass every release gate but count different ballot sets: the trustee imported the log up to the
 * last cast ballot; A closes at seq S, B posts one more cast at S and closes at S+1. Used by TR-03 (concurrency) and TR-04 (fork).
 */
async function forkedElection(seed: string) {
  const c = new Ceremony({ n: 3, t: 2, seed, voters: 7 });
  await c.setup();
  const o = await c.runDkg();
  ['yes', 'yes', 'no', 'yes', 'no', 'yes'].forEach((v, k) => c.cast(o, k, { budget: [v] }));
  await c.syncAll();
  const base = { log: [...c.log], seq: c.seq };
  c.marker('election-close');
  const a = c.bundle();
  const aLog = [...c.log];
  c.log = [...base.log];
  c.seq = base.seq;
  c.cast(o, 6, { budget: ['no'] });
  c.marker('election-close');
  const b = c.bundle();
  return { c, a, b, aLog, closeSeq: base.seq + 1 };
}

test('TR-03: a second Trustee (second process) on the same bundle cannot release a tally share over a different counted set', async () => {
  const { c, a, b } = await forkedElection('audit-tr03');
  try {
    const t1 = await c.act(1, async (x) => x);
    const t2 = await c.act(1, async (x) => x); // opened before t1 released: stale in-memory copy
    await t1.releaseTally(a);
    await rejects(t2.releaseTally(b), 'BUNDLE_CHANGED');
    // nothing about b was written: only the first release is on disk and in the public ledger
    const live = await c.act(1, async (x) => x);
    assert.equal(live.state, 'RELEASED');
    await rejects(live.releaseTally(b), 'RELEASE_CONFLICT');
    const ledger = JSON.parse(readFileSync(`${c.path(1)}.releases`, 'utf8')) as { records: unknown[] };
    assert.equal(ledger.records.length, 1);
    // a held lock (another process inside its write section) blocks every write; the operation leaves no trace
    const t3 = await c.act(2, async (x) => x);
    writeFileSync(`${c.path(2)}.lock`, '12345\n', { flag: 'wx' });
    await rejects(t3.releaseTally(a), 'BUNDLE_LOCKED');
    (await import('node:fs')).unlinkSync(`${c.path(2)}.lock`);
    assert.equal((await c.act(2, async (x) => x)).data.out.release, undefined);
    // racing in one event loop: exactly one of two concurrent releases succeeds
    const [x, y] = await Promise.allSettled([(await c.act(2, async (q) => q)).releaseTally(a), (await c.act(2, async (q) => q)).releaseTally(b)]);
    assert.equal([x, y].filter((r) => r.status === 'fulfilled').length, 1);
  } finally {
    c.cleanup();
  }
});

test('TR-04: an election bundle whose log differs from the trustee\'s imported log at a known seq is refused (LOG_FORK)', async () => {
  const { c, a, b, aLog, closeSeq } = await forkedElection('audit-tr04');
  try {
    c.log = aLog; // the trustee imports the honest close at closeSeq
    await c.sync(1);
    assert.ok((await c.act(1, async (x) => x)).data.log.some((e) => e.seq === closeSeq));
    await rejects(c.act(1, (t) => t.releaseTally(b)), 'LOG_FORK');
    await rejects(c.act(1, (t) => t.releaseSpoil(b, ['00'.repeat(32)])), 'LOG_FORK');
    // an entry the trustee knows is missing from the presented log (with later entries present) is a fork too
    const known = (await c.act(1, async (x) => x)).data.log.filter((e) => e.seq < closeSeq).at(-1)!.seq; // e.g. election-open
    await rejects(c.act(1, (t) => t.releaseTally({ ...a, log: a.log.filter((e) => e.seq !== known) })), 'LOG_FORK');
    assert.equal((await c.act(1, async (x) => x)).data.out.release, undefined, 'refusal does not consume the release');
    assert.equal((await c.act(1, (t) => t.releaseTally(a))).round, 'tally-share');
  } finally {
    c.cleanup();
  }
});
