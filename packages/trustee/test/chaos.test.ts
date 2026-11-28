// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-080 QV-17-REQ-030
// Simulated interruptions at application persistence boundaries, not OS kills or power-loss durability tests.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, type PathLike } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytesToHex, hexToBytes, jcs, pointToBytes } from '@quietvote/crypto';
import { PROTO_ID, collectSpoilShares, decryptSpoiled, signRecordRaw, verifySig, type MultiSignedRecord, type SignedRecord } from '@quietvote/protocol';
import { Trustee, ledgerPath, readBundle, readLedger, tombstonePath, verifyKeycheck, type AuditCloseBody, type BundleData, type KeycheckBody, type Packet, type TrusteeState } from '../src/index.ts';
import { Ceremony, PASS, electionFixture, finishTally, mkDeps, verifyAll } from './helpers/harness.ts';
import { writePrivateFixture } from './helpers/private-file.ts';

const H = bytesToHex;
const INTERRUPTED = new Error('test-only simulated interruption');
type Phase = 'before' | 'after';
type Save = (options?: { ledger?: boolean }) => Promise<void>;
const prototype = Trustee.prototype as unknown as { save: Save };

function secretsOf(d: Readonly<BundleData>): Buffer[] {
  const hex = [d.sk_sign, d.sk_i, d.own_y, d.dealer?.e, ...(d.dealer?.coeffs ?? []), ...Object.values(d.received)];
  return hex.filter((s): s is string => s !== undefined).flatMap((s) => [Buffer.from(s), Buffer.from(hexToBytes(s, 32))]);
}

function assertNoSecrets(dir: string, secrets: Buffer[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) assertNoSecrets(path, secrets);
    else if (entry.isFile()) {
      const contents = readFileSync(path);
      for (const secret of [Buffer.from(PASS), ...secrets]) assert.equal(contents.includes(secret), false, `plaintext secret in ${entry.name}`);
    }
  }
}

/** Interrupt only the selected instance's save; the original storage implementation still executes for after cuts. */
async function cutSave(t: TestContext, path: string, phase: Phase, operation: () => Promise<unknown>, ordinal = 1): Promise<BundleData> {
  const original = prototype.save;
  let calls = 0, captured: BundleData | undefined;
  const patch = t.mock.method(prototype, 'save', async function(this: Trustee, options?: { ledger?: boolean }) {
    if (this.path !== path || ++calls !== ordinal) return original.call(this, options);
    captured = structuredClone(this.data);
    if (phase === 'after') await original.call(this, options);
    throw INTERRUPTED;
  });
  try {
    await assert.rejects(operation(), (error) => error === INTERRUPTED);
    assert.ok(captured, 'the requested persistence boundary must be reached');
    return captured;
  } finally { patch.mock.restore(); }
}

const packetOf = (value: unknown): Packet | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  if ('bytes' in value && value.bytes instanceof Uint8Array) return value as Packet;
  if ('packet' in value) return packetOf(value.packet);
  return undefined;
};

test('simulated keygen interruption leaves either no bundle or an authenticated existing identity', async (t) => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qv-chaos-keygen-')));
  try {
    for (const phase of ['before', 'after'] as const) {
      const path = join(dir, `${phase}.qvtb`), deps = mkDeps(`chaos-keygen-${phase}`);
      const captured = await cutSave(t, path, phase, () => Trustee.keygen(path, PASS, deps));
      assertNoSecrets(dir, secretsOf(captured));
      if (phase === 'before') {
        assert.equal(existsSync(path), false);
        assert.equal((await Trustee.keygen(path, PASS, deps)).state, 'KEYS_READY');
      } else {
        assert.equal((await Trustee.open(path, PASS, deps)).signPk, captured.sign_pk);
        await assert.rejects(Trustee.keygen(path, PASS, deps), { code: 'BUNDLE_EXISTS', exitCode: 40 });
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('simulated before/after-save interruptions recover join, imports, all DKG rounds and drill', { timeout: 120_000 }, async (t) => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'chaos-dkg', voters: 3 });
  const initial = new Map<string, Buffer>(), original = prototype.save;
  // Retain genuine sealed KEYS_READY fixtures so join itself can be interrupted without editing a vault's plaintext.
  const observe = t.mock.method(prototype, 'save', async function(this: Trustee, options?: { ledger?: boolean }) {
    await original.call(this, options);
    if (this.state === 'KEYS_READY') initial.set(this.path, readFileSync(this.path));
  });
  try { await c.setup(); } finally { observe.mock.restore(); }
  const secrets: Buffer[] = [];
  try {
    for (const i of [1, 2]) {
      writePrivateFixture(c.path(i), initial.get(c.path(i))!);
      const before = readFileSync(c.path(i)), phase = i === 1 ? 'before' : 'after';
      const interrupted = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      const captured = await cutSave(t, c.path(i), phase, () => interrupted.join(c.mrec, H(c.mh), 'c1'));
      secrets.push(...secretsOf(captured));
      if (phase === 'before') assert.deepEqual(readFileSync(c.path(i)), before);
      const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
      if (phase === 'before') await reopened.join(c.mrec, H(c.mh), 'c1');
      else await assert.rejects(reopened.join(c.mrec, H(c.mh), 'c1'), { code: 'WRONG_STATE', exitCode: 40 });
      assert.equal(reopened.state, 'ACCEPTED');
    }
    const step = async (state: TrusteeState, operation: (x: Trustee, i: number) => Promise<unknown>): Promise<void> => {
      for (const i of c.honest()) {
        const before = readFileSync(c.path(i)), old = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        const oldState = old.state, phase = i === 1 ? 'before' : 'after';
        let captured: BundleData | undefined;
        if (i <= 2) {
          captured = await cutSave(t, c.path(i), phase, () => operation(old, i));
          secrets.push(...secretsOf(captured));
          assertNoSecrets(c.dir, secrets);
          if (phase === 'before') assert.deepEqual(readFileSync(c.path(i)), before, `${state}: pre-save bytes preserved`);
        }
        // Never reuse the interrupted object; these cuts model process loss rather than a handled I/O error.
        const reopened = await Trustee.open(c.path(i), PASS, c.deps.get(i)!);
        if (i <= 2) assert.equal(reopened.state, phase === 'before' ? oldState : state);
        const result = await operation(reopened, i);
        assert.equal(reopened.state, state);
        const packet = packetOf(result);
        if (packet !== undefined) {
          if (i === 2) {
            const persisted = Object.values(captured!.out).flat();
            for (const record of packet.obj.records) assert.equal(persisted.some((r) => Buffer.from(jcs(r)).equals(Buffer.from(jcs(record)))), true, `${packet.round}: re-served record was committed before interruption`);
          }
          const repeat = packetOf(await c.act(i, (x) => operation(x, i)))!;
          assert.deepEqual(repeat.bytes, packet.bytes, `${packet.round}: replay bytes`);
          c.post(packet);
        } else if (state === 'KEY_DERIVED') {
          assert.deepEqual(reopened.data.derived, captured?.derived ?? reopened.data.derived);
        }
      }
    };
    c.marker('dkg-open');
    await step('ACCEPTED', (x) => x.importLog(c.slice()));
    await step('COMMITTED', (x) => x.commit());
    c.marker('dkg-r1-open'); await c.syncAll();
    await step('R1_DONE', (x) => x.reveal());
    c.marker('dkg-r1-close'); await c.syncAll();
    await step('R2_DONE', (x) => x.shares());
    c.marker('dkg-r2-close'); await c.syncAll();
    await step('VERIFIED', (x) => x.verify());
    c.marker('dkg-r3-close');
    const outcome = await c.adjudicate(); c.ctx = outcome.ctx;
    await c.syncAll();
    await step('KEY_DERIVED', (x) => x.finalize());
    await step('CONFIRMED', (x, i) => x.confirm([i === 1 ? 2 : 1]));
    c.marker('dkg-final', { qmask: outcome.qmask, K: H(pointToBytes(outcome.K)) }); await c.syncAll();
    await step('DRILLED', (x) => x.drill());
    for (const entry of c.log) {
      const record = entry.entry as SignedRecord<KeycheckBody>;
      if (record.body?.type === 'keycheck') assert.equal(verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(record.body.j)!, record.body), true);
    }
    c.openElection();
    await step('STANDBY', (x) => x.importLog(c.slice()));
    for (const i of c.honest()) {
      const d = (await Trustee.open(c.path(i), PASS, c.deps.get(i)!)).data;
      assert.equal(d.derived?.K, H(pointToBytes(outcome.K)));
      assert.equal(d.dealer, undefined);
      assert.equal(d.own_y, undefined);
      assert.deepEqual(d.received, {});
    }
    assertNoSecrets(c.dir, secrets);
  } finally { c.cleanup(); }
});

test('simulated tally/spoil cuts preserve authenticated release ledgers and one-shot guards', { timeout: 180_000 }, async (t) => {
  const f = await electionFixture({ n: 5, t: 3, seed: 'chaos-releases', spoilDecrypt: true, close: false });
  const c = f.c, secrets: Buffer[] = [];
  try {
    const built = c.build(f.outcome, 0, { budget: ['yes'] }, 1), code = c.spoil(f.outcome, 0, built);
    c.marker('election-close'); await c.syncAll();
    // Freeze this authenticated snapshot before finishTally appends a later record to the harness log.
    const election = structuredClone(c.bundle()), tallyRecords: unknown[] = [];
    const cuts = [{ ordinal: 1, phase: 'before' }, { ordinal: 1, phase: 'after' }, { ordinal: 2, phase: 'before' }, { ordinal: 2, phase: 'after' }] as const;
    for (const [index, cut] of cuts.entries()) {
      const i = index + 1, path = c.path(i), deps = c.deps.get(i)!;
      const interrupted = await Trustee.open(path, PASS, deps);
      const captured = await cutSave(t, path, cut.phase, () => interrupted.releaseTally(election), cut.ordinal);
      secrets.push(...secretsOf(captured)); assertNoSecrets(c.dir, secrets);
      const raw = await readBundle(path, PASS, deps);
      assert.equal(raw.state, cut.ordinal === 1 && cut.phase === 'before' ? 'STANDBY' : cut.ordinal === 2 && cut.phase === 'after' ? 'RELEASED' : 'TALLYING');
      const resumed = await Trustee.open(path, PASS, deps), packet = await resumed.releaseTally(election);
      if (cut.ordinal === 2 && cut.phase === 'after') assert.deepEqual(packet.obj.records, [captured.out.release]);
      assert.deepEqual((await c.act(i, (x) => x.releaseTally(election))).bytes, packet.bytes);
      tallyRecords.push(...packet.obj.records);
    }

    // The RNG fault happens only after the real ledger contains the release and before resealing the bundle.
    const ledgerCut = async (i: number, containsRelease: (records: unknown[]) => boolean, operation: (x: Trustee) => Promise<unknown>): Promise<unknown[]> => {
      const path = c.path(i), deps = c.deps.get(i)!, rng = deps.rng;
      const interrupted = await Trustee.open(path, PASS, deps);
      secrets.push(...secretsOf(interrupted.data));
      let fired = false;
      deps.rng = { bytes(n) {
        const records = existsSync(ledgerPath(path)) ? (JSON.parse(readFileSync(ledgerPath(path), 'utf8')) as { records: unknown[] }).records : [];
        if (containsRelease(records)) { fired = true; throw INTERRUPTED; }
        return rng.bytes(n);
      } };
      try { await assert.rejects(operation(interrupted), (error) => error === INTERRUPTED); }
      finally { deps.rng = rng; }
      assert.equal(fired, true);
      await assert.rejects(operation(interrupted), { code: 'BUNDLE_REOPEN_REQUIRED', exitCode: 40 });
      const records = await readLedger(ledgerPath(path)); assert.ok(records);
      assertNoSecrets(c.dir, secrets);
      return records;
    };
    const isTally = (r: unknown): boolean => (r as { body?: { type?: unknown } })?.body?.type === 'tally-share';
    const records = await ledgerCut(5, (r) => r.some(isTally), (x) => x.releaseTally(election));
    assert.equal((await readBundle(c.path(5), PASS, c.deps.get(5)!)).out.release, undefined);
    const ledgerBefore = readFileSync(ledgerPath(c.path(5)));
    const recovered = await c.act(5, (x) => x.releaseTally(election));
    assert.deepEqual(recovered.obj.records, records.filter(isTally));
    assert.deepEqual(readFileSync(ledgerPath(c.path(5))), ledgerBefore);
    tallyRecords.push(...recovered.obj.records);
    const tally = finishTally(c, f.outcome, tallyRecords);
    assert.deepEqual(tally.rejected, []);
    assert.equal(tally.counts?.get('budget')?.get('yes'), f.expectedYes);
    assert.equal(tally.counts?.get('budget')?.get('no'), f.expectedNo);
    assert.equal((await verifyAll(c)).verdict, 'PASS');

    for (const [i, phase] of [[1, 'before'], [2, 'after']] as const) {
      const path = c.path(i), interrupted = await Trustee.open(path, PASS, c.deps.get(i)!);
      const before = readFileSync(path), ledger = readFileSync(ledgerPath(path));
      const captured = await cutSave(t, path, phase, () => interrupted.releaseSpoil(election, [code]));
      secrets.push(...secretsOf(captured));
      if (phase === 'before') {
        assert.deepEqual(readFileSync(path), before);
        assert.deepEqual(readFileSync(ledgerPath(path)), ledger);
        await c.act(i, (x) => x.releaseSpoil(election, [code]));
      } else assert.deepEqual((await readBundle(path, PASS, c.deps.get(i)!)).out.spoil?.[code], captured.out.spoil?.[code]);
      await assert.rejects(c.act(i, (x) => x.releaseSpoil(election, [code])), { code: 'SPOIL_REPLAY', exitCode: 60 });
    }
    const isSpoil = (r: unknown): boolean => (r as { body?: { code?: unknown } })?.body?.code === code;
    const oldSealed = readFileSync(c.path(3));
    await ledgerCut(3, (r) => r.some(isSpoil), (x) => x.releaseSpoil(election, [code]));
    assert.deepEqual(readFileSync(c.path(3)), oldSealed);
    assert.equal((await readBundle(c.path(3), PASS, c.deps.get(3)!)).out.spoil?.[code], undefined);
    await assert.rejects(c.act(3, (x) => x.releaseSpoil(election, [code])), { code: 'SPOIL_REPLAY', exitCode: 60 });
    const spoilRecords: unknown[] = [];
    for (const i of [1, 2, 3]) spoilRecords.push(...(await readLedger(ledgerPath(c.path(i))))!.filter(isSpoil));
    const shares = collectSpoilShares(c.manifest, f.outcome.ctx, code, spoilRecords);
    assert.deepEqual(shares.rejected, []);
    const result = decryptSpoiled(c.params(f.outcome), f.outcome.Y, new Set(f.outcome.Q), { code, body: built.body }, shares.sets);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value.selections, { budget: ['yes'] });
    assertNoSecrets(c.dir, secrets);
  } finally { c.cleanup(); }
});

test('simulated destruction cuts resume saved intent and public records or return terminal refusal', { timeout: 120_000 }, async (t) => {
  const f = await electionFixture({ n: 5, t: 3, seed: 'chaos-destroy' });
  const c = f.c, secrets: Buffer[] = [];
  try {
    const body: AuditCloseBody = { proto: PROTO_ID, type: 'audit-close', ctx: H(f.outcome.ctx), closed_at: '2026-11-09T00:00:00Z' };
    const close: MultiSignedRecord<AuditCloseBody> = { body, sigs: [signRecordRaw(c.coord.secretKey, c.coord.publicKey, f.outcome.ctx, 'audit-close', body)] };
    for (const i of c.honest()) {
      const path = c.path(i), deps = c.deps.get(i)!;
      deps.now = () => new Date('2026-12-02T00:00:00Z');
      const interrupted = await Trustee.open(path, PASS, deps), before = readFileSync(path);
      secrets.push(...secretsOf(interrupted.data));
      const destroy = (x: Trustee) => x.destroy(close, c.manifest.title);
      if (i <= 2) {
        await cutSave(t, path, i === 1 ? 'before' : 'after', () => destroy(interrupted));
        if (i === 1) assert.deepEqual(readFileSync(path), before);
        else assert.equal((await readBundle(path, PASS, deps)).state, 'DESTROYING');
        assert.equal(existsSync(`${path}.attestation.json`), false);
        assert.equal(existsSync(tombstonePath(path)), false);
      } else {
        const target = i === 3 ? `${path}.attestation.json` : i === 4 ? tombstonePath(path) : path;
        const op = i === 5 ? 'unlink' : 'rename';
        let fired = false;
        const rename = fs.rename, unlink = fs.unlink;
        const patch = op === 'rename'
          ? t.mock.method(fs, 'rename', async (source: PathLike, destination: PathLike) => { await rename(source, destination); if (destination === target) { fired = true; throw INTERRUPTED; } })
          : t.mock.method(fs, 'unlink', async (file: PathLike) => { await unlink(file); if (file === target) { fired = true; throw INTERRUPTED; } });
        syncBuiltinESMExports();
        try { await assert.rejects(destroy(interrupted), (error) => error === INTERRUPTED); }
        finally { patch.mock.restore(); syncBuiltinESMExports(); }
        assert.equal(fired, true);
        assert.equal(existsSync(`${path}.attestation.json`), true);
        assert.equal(existsSync(tombstonePath(path)), i >= 4);
        assert.equal(existsSync(path), i !== 5);
      }
      assertNoSecrets(c.dir, secrets);
      if (i !== 5) {
        const saved = (await readBundle(path, PASS, deps)).out.attestation;
        const resumed = await Trustee.open(path, PASS, deps), result = await destroy(resumed);
        assert.equal(resumed.state, 'DESTROYED');
        if (saved !== undefined) assert.deepEqual(result.attestation, saved);
      }
      assert.equal(existsSync(path), false);
      assert.equal(existsSync(tombstonePath(path)), true);
      const attestation = JSON.parse(readFileSync(`${path}.attestation.json`, 'utf8')) as SignedRecord<{ type: string }>;
      assert.equal(verifySig(f.outcome.ctx, 'key-destruction', attestation.body, attestation.sig, c.manifest.trustees[i - 1]!.sign_pk), true);
      await assert.rejects(Trustee.open(path, PASS, deps), { code: 'DESTROYED', exitCode: 40 });
      await assert.rejects(Trustee.keygen(path, PASS, deps), { code: 'BUNDLE_EXISTS', exitCode: 40 });
    }
    assertNoSecrets(c.dir, secrets);
  } finally { c.cleanup(); }
});
