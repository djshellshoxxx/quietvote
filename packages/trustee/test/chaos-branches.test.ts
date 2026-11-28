// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-080 QV-17-REQ-030
// Application-level interruptions on refusal/complaint branches, not OS kills or power-loss tests.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { baseMul, bytesToHex, hexToBytes, pointToBytes } from '@quietvote/crypto';
import { verifySig } from '@quietvote/protocol';
import { Trustee, ledgerPath, type BundleData } from '../src/index.ts';
import { Ceremony, PASS, analysisOf, electionFixture } from './helpers/harness.ts';

const H = bytesToHex, INTERRUPTED = new Error('test-only branch interruption');
type Phase = 'before' | 'after';
type Save = (options?: { ledger?: boolean }) => Promise<void>;
const prototype = Trustee.prototype as unknown as { save: Save };

function secretsOf(d: Readonly<BundleData>): Buffer[] {
  return [d.sk_sign, d.sk_i, d.own_y, d.dealer?.e, ...(d.dealer?.coeffs ?? []), ...Object.values(d.received)]
    .filter((s): s is string => s !== undefined).flatMap((s) => [Buffer.from(s), Buffer.from(hexToBytes(s, 32))]);
}
function noSecrets(dir: string, secrets: Buffer[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) noSecrets(path, secrets);
    else if (e.isFile()) for (const s of [Buffer.from(PASS), ...secrets]) assert.equal(readFileSync(path).includes(s), false, `secret canary in ${e.name}`);
  }
}
async function cut(t: TestContext, c: Ceremony, i: number, phase: Phase, operation: (x: Trustee) => Promise<unknown>, secrets: Buffer[], ordinal = 1): Promise<BundleData> {
  const path = c.path(i), before = readFileSync(path), original = prototype.save;
  const interrupted = await Trustee.open(path, PASS, c.deps.get(i)!);
  secrets.push(...secretsOf(interrupted.data));
  let captured: BundleData | undefined, calls = 0;
  const patch = t.mock.method(prototype, 'save', async function(this: Trustee, options?: { ledger?: boolean }) {
    if (this.path !== path || ++calls !== ordinal) return original.call(this, options);
    captured = structuredClone(this.data);
    if (phase === 'after') await original.call(this, options);
    throw INTERRUPTED;
  });
  try { await assert.rejects(operation(interrupted), (error) => error === INTERRUPTED); }
  finally { patch.mock.restore(); }
  assert.ok(captured, 'requested branch cut must be reached');
  secrets.push(...secretsOf(captured)); noSecrets(c.dir, secrets);
  if (phase === 'before' && ordinal === 1) assert.deepEqual(readFileSync(path), before);
  return captured;
}

/** Real DKG to R2 close; an omitted package was genuinely generated but not posted to the public fixture log. */
async function toVerification(c: Ceremony, omitted = new Set<number>()): Promise<void> {
  c.marker('dkg-open'); await c.eachHonest((_i, x) => x.commit()); await c.eachScripted((x) => x.commit());
  c.marker('dkg-r1-open'); await c.eachHonest((_i, x) => x.reveal()); await c.eachScripted((x) => x.reveal());
  c.marker('dkg-r1-close');
  await c.eachHonest(async (i, x) => { const packet = await x.shares(); return omitted.has(i) ? undefined : packet; });
  await c.eachScripted((x) => x.shares());
  c.marker('dkg-r2-close'); await c.syncAll();
}

test('complaint verification and COMPLAINING finalization survive both save cuts with genuine proofs', { timeout: 120_000 }, async (t) => {
  const c = new Ceremony({ n: 5, t: 3, seed: 'chaos-complaining', malicious: { 2: { badShareTo: [1, 3] } } });
  await c.setup(); const secrets: Buffer[] = [];
  try {
    await toVerification(c);
    for (const [i, phase] of [[1, 'before'], [3, 'after']] as const) {
      const captured = await cut(t, c, i, phase, (x) => x.verify(), secrets);
      assert.equal(captured.state, 'COMPLAINING'); assert.equal(captured.out.complaints.length, 1);
      const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      assert.equal(reopened.state, phase === 'before' ? 'R2_DONE' : 'COMPLAINING');
      const result = await reopened.verify(); assert.deepEqual(result.complaints, [2]);
      if (phase === 'after') assert.deepEqual(result.packet.obj.records, captured.out.complaints);
      for (const record of reopened.data.out.complaints) assert.equal(verifySig(c.mh, 'dkg-complaint', record.body, record.sig, c.manifest.trustees[i - 1]!.sign_pk), true);
      assert.deepEqual((await c.act(i, (x) => x.verify())).packet.bytes, result.packet.bytes);
      c.post(result.packet);
    }
    for (const i of [4, 5]) { await c.sync(i); c.post((await c.act(i, (x) => x.verify())).packet); }
    await c.eachScripted((x) => x.verify()); c.marker('dkg-r3-close');
    const outcome = await c.adjudicate(); c.ctx = outcome.ctx;
    assert.deepEqual(outcome.Q, [1, 3, 4, 5], 'real complaint adjudication excludes the bad dealer');
    await c.syncAll();
    for (const [i, phase] of [[1, 'before'], [3, 'after']] as const) {
      const captured = await cut(t, c, i, phase, (x) => x.finalize(), secrets);
      const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      assert.equal(reopened.state, phase === 'before' ? 'COMPLAINING' : 'KEY_DERIVED');
      const result = await reopened.finalize(); assert.deepEqual(result.qualified, outcome.Q);
      assert.equal(reopened.data.derived?.K, H(pointToBytes(outcome.K)));
      assert.deepEqual(reopened.data.derived, captured.derived);
      assert.deepEqual((await c.act(i, (x) => x.finalize())).fingerprint, result.fingerprint);
    }
    noSecrets(c.dir, secrets);
  } finally { c.cleanup(); }
});

test('missed commit, dealing and share windows persist DISQUALIFIED across before/after import cuts', async (t) => {
  for (const state of ['ACCEPTED', 'COMMITTED', 'R1_DONE'] as const) {
    const c = new Ceremony({ n: 3, t: 2, seed: `chaos-deadline-${state}` });
    await c.setup(); const secrets: Buffer[] = [];
    try {
      c.marker('dkg-open'); await c.syncAll();
      if (state !== 'ACCEPTED') await c.eachHonest((_i, x) => x.commit());
      c.marker('dkg-r1-open');
      if (state === 'R1_DONE') await c.eachHonest((_i, x) => x.reveal());
      if (state !== 'ACCEPTED') c.marker('dkg-r1-close');
      if (state === 'R1_DONE') c.marker('dkg-r2-close');
      for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
        await cut(t, c, i, phase, (x) => x.importLog(c.slice()), secrets);
        const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        assert.equal(reopened.state, phase === 'before' ? state : 'DISQUALIFIED');
        await reopened.importLog(c.slice()); assert.equal(reopened.state, 'DISQUALIFIED');
        for (const operation of [(x: Trustee) => x.commit(), (x: Trustee) => x.reveal(), (x: Trustee) => x.shares()]) await assert.rejects(c.act(i, operation), { code: 'WRONG_STATE', exitCode: 40 });
      }
      noSecrets(c.dir, secrets);
    } finally { c.cleanup(); }
  }
});

test('finalization disqualification and quorum abort preserve their committed refusal states', { timeout: 120_000 }, async (t) => {
  for (const kind of ['disqualified', 'quorum'] as const) {
    const c = kind === 'quorum'
      ? new Ceremony({ n: 3, t: 3, seed: 'chaos-quorum', malicious: { 3: { absent: true } } })
      : new Ceremony({ n: 5, t: 3, seed: 'chaos-final-disqualification' });
    await c.setup(); const secrets: Buffer[] = [];
    try {
      await toVerification(c, kind === 'disqualified' ? new Set([1, 2]) : new Set());
      await c.eachHonest(async (_i, x) => (await x.verify()).packet); await c.eachScripted((x) => x.verify());
      c.marker('dkg-r3-close'); await c.syncAll();
      if (kind === 'disqualified') assert.deepEqual((await c.adjudicate()).Q, [3, 4, 5]);
      const state = kind === 'quorum' ? 'ABORTED' : 'DISQUALIFIED', code = kind === 'quorum' ? 'E_DKG_QUORUM' : 'DISQUALIFIED';
      for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
        const captured = await cut(t, c, i, phase, (x) => x.finalize(), secrets); assert.equal(captured.state, state);
        const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        assert.equal(reopened.state, phase === 'before' ? 'VERIFIED' : state);
        await assert.rejects(reopened.finalize(), { code: phase === 'before' ? code : 'WRONG_STATE', exitCode: phase === 'before' ? 20 : 40 });
        assert.equal((await Trustee.open(c.path(i), PASS, c.deps.get(i)!)).state, state);
        assert.equal(reopened.data.sk_i, undefined); assert.equal(reopened.data.out.release, undefined);
        await assert.rejects(c.act(i, (x) => x.commit()), { code: 'WRONG_STATE', exitCode: 40 });
      }
      noSecrets(c.dir, secrets);
    } finally { c.cleanup(); }
  }
});

test('explicit abort cuts retain old encrypted state or durably remove ceremony secrets and cached outputs', { timeout: 120_000 }, async (t) => {
  for (const state of ['COMMITTED', 'KEY_DERIVED'] as const) {
    const c = new Ceremony({ n: 3, t: 2, seed: `chaos-abort-${state}` });
    await c.setup(); const secrets: Buffer[] = [];
    try {
      if (state === 'KEY_DERIVED') await c.runDkg({ confirm: false });
      else { c.marker('dkg-open'); await c.eachHonest((_i, x) => x.commit()); }
      for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
        const old = await Trustee.open(c.path(i), PASS, c.deps.get(i)!); assert.equal(old.state, state);
        assert.ok(state === 'COMMITTED' ? old.data.dealer?.coeffs?.length : old.data.sk_i, 'fixture contains the secret material being removed');
        await cut(t, c, i, phase, (x) => x.abort('operator ended rehearsal'), secrets);
        const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        assert.equal(reopened.state, phase === 'before' ? state : 'ABORTED');
        if (phase === 'before') await reopened.abort('operator ended rehearsal');
        else await assert.rejects(reopened.abort('again'), { code: 'WRONG_STATE', exitCode: 40 });
        assert.equal(reopened.state, 'ABORTED'); assert.equal(reopened.signPk, old.signPk); assert.equal(reopened.data.sk_sign, old.data.sk_sign);
        for (const field of ['dealer', 'own_y', 'sk_i', 'derived', 'transcript_hash'] as const) assert.equal(reopened.data[field], undefined);
        assert.deepEqual(reopened.data.received, {});
        for (const field of ['commit', 'dealing', 'shares', 'keyconf', 'keycheck'] as const) assert.equal(reopened.data.out[field], undefined);
        assert.deepEqual(reopened.data.out.complaints, []);
        await assert.rejects(c.act(i, (x) => x.drill()), { code: 'WRONG_STATE', exitCode: 40 });
      }
      noSecrets(c.dir, secrets);
    } finally { c.cleanup(); }
  }
});

test('restart cuts retain the old identity before save and exactly the committed new identity after save', async (t) => {
  for (const state of ['ABORTED', 'DISQUALIFIED'] as const) {
    const c = new Ceremony({ n: 3, t: 2, seed: `chaos-restart-${state}` });
    await c.setup(); const secrets: Buffer[] = [];
    try {
      c.marker('dkg-open'); await c.eachHonest((_i, x) => x.commit());
      if (state === 'ABORTED') for (const i of [1, 2]) await c.act(i, (x) => x.abort('operator ended rehearsal'));
      else { c.marker('dkg-r1-open'); c.marker('dkg-r1-close'); await c.syncAll(); }
      for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
        const oldKey = (await Trustee.open(c.path(i), PASS, c.deps.get(i)!)).signPk;
        const captured = await cut(t, c, i, phase, (x) => x.restart(), secrets);
        assert.equal(captured.state, 'KEYS_READY'); assert.notEqual(captured.sign_pk, oldKey);
        const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        assert.equal(reopened.state, phase === 'before' ? state : 'KEYS_READY');
        if (phase === 'before') { assert.equal(reopened.signPk, oldKey); await reopened.restart(); assert.notEqual(reopened.signPk, oldKey); secrets.push(...secretsOf(reopened.data)); }
        else { assert.equal(reopened.signPk, captured.sign_pk); assert.equal(reopened.data.sk_sign, captured.sk_sign); }
        const sealed = readFileSync(c.path(i));
        await assert.rejects(c.act(i, (x) => x.restart()), { code: 'WRONG_STATE', exitCode: 40 });
        assert.deepEqual(readFileSync(c.path(i)), sealed, 'retry must not rotate the committed identity again');
        assert.equal(reopened.data.manifest, undefined); assert.equal(reopened.data.ceremony_id, undefined); assert.equal(reopened.data.sk_i, undefined);
        assert.deepEqual(reopened.data.log, []);
      }
      // Local identity reset only; no second server ceremony or protocol restart policy.
      noSecrets(c.dir, secrets);
    } finally { c.cleanup(); }
  }
});

test('rejected aggregate rollback survives both second-save cuts and remains a typed refusal', { timeout: 120_000 }, async (t) => {
  const f = await electionFixture({ n: 3, t: 2, seed: 'chaos-tally-rollback' });
  const c = f.c, secrets: Buffer[] = [];
  try {
    const { aggs } = analysisOf(c, f.outcome), claimed = new Map([...aggs].map(([id, options]) => [id, new Map(options)]));
    const options = claimed.get('budget')!, original = options.get('yes')!;
    options.set('yes', { ...original, A: original.A.add(baseMul(1n)) });
    const election = c.bundle(), refuse = (x: Trustee) => x.releaseTally(election, { claimed });
    for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
      const captured = await cut(t, c, i, phase, refuse, secrets, 2); assert.equal(captured.state, 'STANDBY');
      const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      assert.equal(reopened.state, phase === 'before' ? 'TALLYING' : 'STANDBY');
      await assert.rejects(refuse(reopened), { code: 'AGGREGATE_MISMATCH', exitCode: 60 });
      const final = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      assert.equal(final.state, 'STANDBY'); assert.equal(final.data.out.release, undefined);
      assert.equal(readdirSync(c.dir).includes(ledgerPath(c.path(i)).split(/[\\/]/).at(-1)!), false, 'refusal must not publish a release ledger');
    }
    noSecrets(c.dir, secrets);
  } finally { c.cleanup(); }
});
