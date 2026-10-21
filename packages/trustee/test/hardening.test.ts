import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, jcs, sha256, utf8, ed25519Keypair } from '@quietvote/crypto';
import { PROTO_ID, ballotCode, signRecordRaw, type BallotBody, type MultiSignedRecord } from '@quietvote/protocol';
import {
  OVERRIDE_NO_LEDGER, OVERRIDE_UNWITNESSED, Trustee, assertPassphraseStrength, estimateEntropyBits, ledgerPath, tombstonePath, trusteeMain,
  type AuditCloseBody,
} from '../src/index.ts';
import { Ceremony, PASS, electionFixture, mkDeps } from './helpers/harness.ts';

const H = bytesToHex;
const codeOf = (ctx: Uint8Array, e: { body: BallotBody }): string => H(ballotCode(ctx, e.body));

// ------------------------------------------------------------------ T1 / T3: log evidence and witnessing

test('T1: cast then spoil of an identical body: dropping the cast from the supplied log is refused; a bare log without evidence is refused', async () => {
  const fx = await electionFixture({ n: 4, t: 3, seed: 'hard-t1', spoilDecrypt: true, close: false });
  const c = fx.c;
  try {
    const o = fx.outcome;
    const b = c.build(o, 0, { budget: ['yes'] }, 1);
    const code = c.spoil(o, 0, b);
    c.castBuilt(o, 0, b);
    c.marker('election-close');
    await c.syncAll();
    const full = c.bundle();
    // the cast envelope (same body as the spoil) is the one to hide
    const castSeq = c.log.find((e) => (e.entry as { intent?: string; body: BallotBody }).intent === 'cast' && codeOf(o.ctx, e.entry as { body: BallotBody }) === code)!.seq;
    const stripped = { ...full, log: full.log.filter((e) => e.seq !== castSeq) };
    await assert.rejects(c.act(1, (t) => t.releaseSpoil(stripped, [code])), (e: { code?: string }) => e.code === 'LOG_EVIDENCE_INVALID', 'cast omitted from the log');
    // no log evidence at all (the old behaviour accepted this and released a cast ballot when the cast was dropped)
    const bare = { ...stripped } as Record<string, unknown>;
    delete bare['log_evidence'];
    await assert.rejects(c.act(1, (t) => t.releaseSpoil(bare, [code])), (e: { code?: string }) => e.code === 'LOG_EVIDENCE_REQUIRED');
    await assert.rejects(c.act(1, (t) => t.releaseSpoil(c.bundle({ evidence: false }), [code])), (e: { code?: string }) => e.code === 'LOG_EVIDENCE_REQUIRED');
    await assert.rejects(c.act(1, (t) => t.releaseTally(c.bundle({ evidence: false }))), (e: { code?: string }) => e.code === 'LOG_EVIDENCE_REQUIRED');
    // the honest bundle shows the cast: refused as cast
    await assert.rejects(c.act(1, (t) => t.releaseSpoil(full, [code])), (e: { code?: string }) => e.code === 'BALLOT_WAS_CAST');
    // the evidence is also tampered with (entry dropped from the export): the log-signed head no longer matches
    const ev = full.log_evidence as { board: { entries: { seq: number }[] } };
    const board = JSON.parse(JSON.stringify(ev.board)) as typeof ev.board;
    board.entries = board.entries.filter((e) => e.seq !== castSeq);
    await assert.rejects(c.act(1, (t) => t.releaseSpoil({ ...stripped, log_evidence: { board } }, [code])), (e: { code?: string }) => e.code === 'LOG_EVIDENCE_INVALID', 'export edited too');
    assert.equal((await c.act(1, async (x) => x)).data.out.spoil, undefined, 'nothing was released');
  } finally {
    c.cleanup();
  }
});

test('T3: the witnessed gate is computed from cosigned tree heads; no caller flag, forged or missing cosignatures do not count', async () => {
  const fx = await electionFixture({ n: 3, t: 2, seed: 'hard-t3', witnessQuorum: 2 });
  const c = fx.c;
  try {
    const unw = c.bundle({ witnessed: false });
    await assert.rejects(c.act(1, (t) => t.releaseTally(unw)), { code: 'NOT_WITNESSED' });
    // a caller-supplied boolean is not trusted any more
    await assert.rejects(c.act(1, (t) => t.releaseTally(unw, { witnessed: true } as never)), { code: 'NOT_WITNESSED' });
    // cosignatures by keys that are not the manifest's witnesses do not count
    c.witnessKeys.splice(0, 3, ...[1, 2, 3].map((k) => ed25519Keypair(sha256(utf8(`rogue-witness-${k}`)))));
    await assert.rejects(c.act(1, (t) => t.releaseTally(c.bundle())), { code: 'NOT_WITNESSED' });
  } finally {
    c.cleanup();
  }
  const fy = await electionFixture({ n: 3, t: 2, seed: 'hard-t3b', witnessQuorum: 2 });
  try {
    const p = await fy.c.act(2, (t) => t.releaseTally(fy.c.bundle()));
    assert.equal(p.round, 'tally-share');
    assert.equal((await fy.c.act(2, async (x) => x)).data.overrides.length, 0);
    await fy.c.act(1, (t) => t.releaseTally(fy.c.bundle({ witnessed: false }), { override: OVERRIDE_UNWITNESSED }));
    assert.equal((await fy.c.act(1, async (x) => x)).data.overrides.length, 1);
  } finally {
    fy.c.cleanup();
  }
});

// ------------------------------------------------------------------ T2: restore cannot roll back a release

test('T2: restoring an older backup cannot reset the spoil replay guard or re-issue a different tally share', async () => {
  const fx = await electionFixture({ n: 4, t: 3, seed: 'hard-t2', spoilDecrypt: true, close: false });
  const c = fx.c;
  try {
    const d = c.build(fx.outcome, 0, { budget: ['yes'] }, 1);
    const code = c.spoil(fx.outcome, 0, d);
    c.marker('election-close');
    await c.syncAll();
    const bk = join(c.dir, 'bk.qvtb');
    const bpass = 'backup passphrase for hardening';
    const t0 = await c.act(1, async (x) => x);
    await t0.backup(bk, bpass);
    const sameKey = join(c.dir, 'bk-samepass.qvtb');
    await t0.backup(sameKey, PASS); // an older copy sealed under the live passphrase, to copy back over the live bundle later
    await c.act(1, (t) => t.releaseSpoil(c.bundle(), [code]));
    const tally = await c.act(1, (t) => t.releaseTally(c.bundle()));
    // restore the pre-release backup next to the live one
    const to = join(c.dir, 'restored.qvtb');
    const r = await Trustee.restore(bk, bpass, to, 'restored bundle passphrase!', c.deps.get(1)!);
    await assert.rejects(r.releaseSpoil(c.bundle(), [code]), { code: 'SPOIL_REPLAY' });
    assert.equal(H((await r.releaseTally(c.bundle())).bytes), H(tally.bytes), 'same election bundle: idempotent cached share');
    // the older file copied over the live bundle is caught when the live bundle is opened next
    writeFileSync(c.path(1), readFileSync(sameKey), { mode: 0o600 });
    const live = await c.act(1, async (x) => x);
    await assert.rejects(live.releaseSpoil(c.bundle(), [code]), { code: 'SPOIL_REPLAY' });
    assert.equal(live.state, 'RELEASED');
    // with no ledger to consult a restore of a key-holding backup needs the typed confirmation, which is logged
    const t1 = await c.act(2, async (x) => x);
    const bk2 = join(c.dir, 'bk2.qvtb');
    await t1.backup(bk2, bpass);
    const ledger = ledgerPath(c.path(2));
    writeFileSync(ledger, '');
    const moved = join(c.dir, 'moved.releases');
    await assert.rejects(Trustee.restore(bk2, bpass, join(c.dir, 'r2.qvtb'), 'restored bundle passphrase!', c.deps.get(2)!), { code: 'LEDGER_CORRUPT' });
    (await import('node:fs')).renameSync(ledger, moved);
    await assert.rejects(Trustee.restore(bk2, bpass, join(c.dir, 'r2.qvtb'), 'restored bundle passphrase!', c.deps.get(2)!), { code: 'NO_RELEASE_LEDGER' });
    await assert.rejects(Trustee.restore(bk2, bpass, join(c.dir, 'r2.qvtb'), 'restored bundle passphrase!', c.deps.get(2)!, { override: 'yes' }), { code: 'NO_RELEASE_LEDGER' });
    const r2 = await Trustee.restore(bk2, bpass, join(c.dir, 'r2.qvtb'), 'restored bundle passphrase!', c.deps.get(2)!, { override: OVERRIDE_NO_LEDGER });
    assert.equal(r2.data.overrides.length, 1);
  } finally {
    c.cleanup();
  }
});

// ------------------------------------------------------------------ T4 / T5 / T9: destroy and backup

const closeRec = (c: Ceremony, closed_at: string): MultiSignedRecord<AuditCloseBody> => {
  const body: AuditCloseBody = { proto: PROTO_ID, type: 'audit-close', ctx: H(c.ctx!), closed_at };
  return { body, sigs: [signRecordRaw(c.coord.secretKey, c.coord.publicKey, c.ctx!, 'audit-close', body)] };
};

test('T4: destroy parses closed_at strictly and needs election-close and closed_at after the voting close', async () => {
  const fx = await electionFixture({ n: 3, t: 2, seed: 'hard-t4' });
  const c = fx.c;
  try {
    const deps = c.deps.get(1)!;
    deps.now = () => new Date('2026-12-02T00:00:00Z');
    const title = c.manifest.title;
    for (const bad of ['garbage', '', 'NaN', '2026-13-45T99:00:00Z', '2026-11-09']) {
      const t = await c.act(1, async (x) => x);
      await assert.rejects(t.destroy(closeRec(c, bad), title), (e: { code?: string }) => e.code === 'NO_AUDIT_CLOSE', `closed_at ${JSON.stringify(bad)}`);
    }
    const t = await c.act(1, async (x) => x);
    await assert.rejects(t.destroy(closeRec(c, '2026-11-02T00:00:00Z'), title), { code: 'AUDIT_BEFORE_CLOSE' });
    assert.ok(existsSync(c.path(1)));
  } finally {
    c.cleanup();
  }
  const fy = await electionFixture({ n: 3, t: 2, seed: 'hard-t4b', close: false });
  try {
    fy.c.deps.get(1)!.now = () => new Date('2026-12-02T00:00:00Z');
    const t = await fy.c.act(1, async (x) => x);
    await assert.rejects(t.destroy(closeRec(fy.c, '2026-11-09T00:00:00Z'), fy.c.manifest.title), { code: 'NO_ELECTION_CLOSE' });
    assert.ok(existsSync(fy.c.path(1)));
  } finally {
    fy.c.cleanup();
  }
});

test('T5: backup refuses an existing destination and any path that is the bundle, tombstone, attestation or ledger (also via symlink)', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t5' });
  await c.setup();
  try {
    const t = await c.act(1, async (x) => x);
    const bp = 'backup passphrase for hardening';
    const p = c.path(1);
    const existing = join(c.dir, 'existing.qvtb');
    writeFileSync(existing, 'precious');
    await assert.rejects(t.backup(existing, bp), { code: 'BUNDLE_EXISTS' });
    assert.equal(readFileSync(existing, 'utf8'), 'precious');
    for (const dest of [tombstonePath(p), `${p}.attestation.json`, ledgerPath(p), join(c.dir, '.', 't1.qvtb'), join(c.dir, 'sub', '..', 't1.qvtb')]) {
      await assert.rejects(t.backup(dest, bp), (e: { code?: string }) => e.code === 'BACKUP_SAME_FILE' || e.code === 'BUNDLE_EXISTS', dest);
      assert.ok(!existsSync(dest) || dest.endsWith('t1.qvtb'));
    }
    const link = join(c.dir, 'link.qvtb');
    symlinkSync(p, link);
    await assert.rejects(t.backup(link, bp), (e: { code?: string }) => e.code === 'BACKUP_SAME_FILE' || e.code === 'BUNDLE_EXISTS');
    assert.equal((await c.act(1, async (x) => x)).data.backups.length, 0);
  } finally {
    c.cleanup();
  }
});

test('T9: a failed save after the backup was written removes the backup and leaves no trace of it', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t9' });
  await c.setup();
  try {
    const t = await c.act(1, async (x) => x);
    (t as unknown as { save: () => Promise<void> }).save = async () => {
      throw new Error('disk full');
    };
    const dest = join(c.dir, 'bk.qvtb');
    await assert.rejects(t.backup(dest, 'backup passphrase for hardening'), /disk full/);
    assert.ok(!existsSync(dest), 'orphan backup removed');
    assert.equal(t.data.backups.length, 0);
    assert.equal(t.data.backup_epoch, 0);
  } finally {
    c.cleanup();
  }
});

// ------------------------------------------------------------------ T6 / T8 / T11: CLI

function cli(c: Ceremony) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s), promptSecret: async () => PASS };
  const d = mkDeps('hard-cli');
  return { out, err, run: (a: string[], env: Record<string, string | undefined> = {}) => trusteeMain([...a, '--json'], io, d, env), c };
}

test('T6: --out can never be the bundle, a backup, the tombstone or an existing file', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t6' });
  await c.setup();
  try {
    const { run, err } = cli(c);
    const b = c.path(1);
    const before = readFileSync(b);
    assert.equal(await run(['report-compromise', '--bundle', b, '--severity', 'suspected', '--out', b]), 60);
    assert.match(err.pop()!, /OUT_PATH_PROTECTED/);
    assert.deepEqual(readFileSync(b), before, 'sealed bundle untouched');
    assert.equal(await run(['report-compromise', '--bundle', b, '--severity', 'suspected', '--out', join(c.dir, 'x', '..', 't1.qvtb')]), 60);
    const bk = join(c.dir, 'bk.qvtb');
    writeFileSync(join(c.dir, 'bp.txt'), 'backup passphrase for hardening\n', { mode: 0o600 });
    assert.equal(await run(['backup', '--bundle', b, '--to', bk, '--backup-passphrase-file', join(c.dir, 'bp.txt')]), 0);
    const bkBytes = readFileSync(bk);
    assert.equal(await run(['report-compromise', '--bundle', b, '--severity', 'suspected', '--out', bk]), 60);
    assert.deepEqual(readFileSync(bk), bkBytes);
    const other = join(c.dir, 'other.txt');
    writeFileSync(other, 'mine');
    assert.equal(await run(['report-compromise', '--bundle', b, '--severity', 'suspected', '--out', other]), 60);
    assert.match(err.pop()!, /OUT_EXISTS/);
    assert.equal(readFileSync(other, 'utf8'), 'mine');
    const fresh = join(c.dir, 'fresh.qvp');
    assert.equal(await run(['report-compromise', '--bundle', b, '--severity', 'suspected', '--out', fresh]), 0);
    assert.ok(existsSync(fresh));
  } finally {
    c.cleanup();
  }
});

test('T8: passphrase files go through the 0600 check', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t8' });
  await c.setup();
  try {
    const { run, err } = cli(c);
    const pf = join(c.dir, 'pass.txt');
    writeFileSync(pf, `${PASS}\n`, { mode: 0o600 });
    assert.equal(await run(['status', '--bundle', c.path(1), '--passphrase-file', pf]), 0);
    if (process.platform !== 'win32') {
      chmodSync(pf, 0o644);
      assert.equal(await run(['status', '--bundle', c.path(1), '--passphrase-file', pf]), 60);
      assert.match(err.pop()!, /BAD_PERMISSIONS/);
      assert.equal(await run(['status', '--bundle', c.path(1)], { QV_TRUSTEE_PASSPHRASE_FILE: pf }), 60);
    }
  } finally {
    c.cleanup();
  }
});

test('T11: malformed manifest, claimed aggregates or JSON are reported as errors (exit 2/20), never raw exceptions', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t11' });
  await c.setup();
  try {
    const { run, err } = cli(c);
    const kg = join(c.dir, 'k.qvtb');
    assert.equal(await run(['keygen', '--bundle', kg]), 0);
    const w = (name: string, text: string): string => {
      const p = join(c.dir, name);
      writeFileSync(p, text);
      return p;
    };
    assert.equal(await run(['join', '--bundle', kg, '--manifest', w('m1.json', JSON.stringify({ body: { title: 'x' }, sigs: [] })), '--manifest-hash', '00'.repeat(32)]), 20);
    assert.match(err.pop()!, /MANIFEST_INVALID/);
    assert.equal(await run(['join', '--bundle', kg, '--manifest', w('m2.json', '{not json'), '--manifest-hash', '00'.repeat(32)]), 20);
    assert.match(err.pop()!, /BAD_JSON/);
    assert.equal(await run(['join', '--bundle', kg, '--manifest', w('m3.json', 'null'), '--manifest-hash', '00'.repeat(32)]), 20);
    assert.equal(await run(['join', '--bundle', kg, '--manifest', join(c.dir, 'missing.json'), '--manifest-hash', '00'.repeat(32)]), 2);
    // --claimed that is not an aggregate list (checked before anything else is read)
    const t1 = c.path(1);
    assert.equal(await run(['tally-release', '--bundle', t1, '--election', w('e.json', '{}'), '--claimed', w('c1.json', '{"contests":5}')]), 20);
    assert.match(err.pop()!, /BAD_CLAIMED/);
    assert.equal(await run(['tally-release', '--bundle', t1, '--election', w('e.json', '{}'), '--claimed', w('c2.json', JSON.stringify({ contests: [{ id: 'a', options: [{ id: 'y', A: 'zz', B: 'zz' }] }] }))]), 20);
    assert.match(err.pop()!, /BAD_CLAIMED/);
  } finally {
    c.cleanup();
  }
});

// ------------------------------------------------------------------ T7: passphrase estimator

test('T7: repeated characters get no unbounded credit', () => {
  for (const weak of ['a'.repeat(50), 'a'.repeat(200), 'ab'.repeat(40), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'x7'.repeat(60), `${'q'.repeat(30)}Z9!${'q'.repeat(30)}`]) {
    assert.ok(estimateEntropyBits(weak) < 60, `${weak.slice(0, 12)}.. scored ${estimateEntropyBits(weak)}`);
    assert.throws(() => assertPassphraseStrength(weak), { code: 'WEAK_PASSPHRASE' });
  }
  for (const ok of ['t7#Qm2$vL9x!pZ4k', 'N3b-4Rp-Y8w-Kd5-Hs6-A2', 'xK9#mQ2$vL7!pR4zT8&wY5*']) assert.doesNotThrow(() => assertPassphraseStrength(ok), ok);
});

// ------------------------------------------------------------------ T10 / T12: state checks

test('T10: cached packets are only served in states where they are legitimate; abort clears them', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t10' });
  await c.setup();
  try {
    c.marker('dkg-open');
    await c.sync(1);
    await c.act(1, (t) => t.commit());
    const same = await c.act(1, (t) => t.commit()); // idempotent while COMMITTED
    assert.equal(same.round, 'r1-commit');
    await c.act(1, (t) => t.abort('test'));
    const t = await c.act(1, async (x) => x);
    assert.equal(t.state, 'ABORTED');
    assert.equal(t.data.out.commit, undefined);
    assert.equal(t.data.out.dealing, undefined);
    await assert.rejects(c.act(1, (x) => x.commit()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (x) => x.reveal()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (x) => x.shares()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (x) => x.confirm([2])), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (x) => x.drill()), { code: 'WRONG_STATE' });
  } finally {
    c.cleanup();
  }
});

test('T12: tally release needs STANDBY/TALLYING/RELEASED and fails on state before any log work', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'hard-t12', voters: 4 });
  await c.setup();
  try {
    await c.runDkg({ drill: false }); // stops at CONFIRMED, before election-open
    const t = await c.act(1, async (x) => x);
    assert.equal(t.state, 'CONFIRMED');
    await assert.rejects(c.act(1, (x) => x.releaseTally({ garbage: true })), (e: { code?: string; kind?: string }) => e.code === 'WRONG_STATE' && e.kind === 'STATE');
  } finally {
    c.cleanup();
  }
});

void jcs;
