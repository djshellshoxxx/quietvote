import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, hexToBytes, pointToBytes } from '@quietvote/crypto';
import { computeR1, markerSeq, takeDkg } from '../src/ceremonylog.ts';
import type { Packet } from '../src/trustee.ts';
import { Ceremony, electionFixture, finishTally, verifyAll, type Options } from './helpers/harness.ts';

const H = bytesToHex;

async function ceremony(o: Options, opts?: Parameters<Ceremony['runDkg']>[0]) {
  const c = new Ceremony(o);
  await c.setup();
  const outcome = await c.runDkg(opts);
  return { c, outcome };
}

test('honest 3-of-5: every device derives the same key, fingerprint, share key; R1 survivors equal the adjudicator', async () => {
  const { c, outcome } = await ceremony({ n: 5, t: 3, seed: 'honest' });
  try {
    assert.deepEqual(outcome.Q, [1, 2, 3, 4, 5]);
    const fps = new Set<string>();
    for (const i of c.honest()) {
      const t = await c.act(i, async (x) => x);
      const d = t.data.derived!;
      assert.equal(d.K, H(pointToBytes(outcome.K)));
      assert.equal(d.Yj, H(pointToBytes(outcome.Y.get(i)!)));
      assert.equal(d.ctx, H(outcome.ctx));
      fps.add(d.fp_words.join(' ') + d.fp_hex);
      assert.equal(t.state, 'STANDBY');
      assert.equal(t.data.sk_i !== undefined, true);
      // hygiene: nothing but sk_i/sign key left of the round secrets (QV-17 §6.3)
      assert.equal(t.data.dealer, undefined);
      assert.equal(t.data.own_y, undefined);
      assert.deepEqual(t.data.received, {});
    }
    assert.equal(fps.size, 1);
    const r1 = computeR1(c.mh, 3, 5, { r1open: markerSeq(c.log, 'dkg-r1-open')!, r1close: markerSeq(c.log, 'dkg-r1-close')! }, takeDkg(c.log));
    assert.deepEqual(r1.R1, outcome.R1);
  } finally {
    c.cleanup();
  }
});

const scenarios: { name: string; o: Partial<Options>; Q: number[]; honestState?: Record<number, string> }[] = [
  { name: 'bad share 2 -> 4 (dealer disqualified after the honest complaint)', o: { malicious: { 2: { badShareTo: [4] } } }, Q: [1, 3, 4, 5] },
  { name: 'equivocating commitment (two different commits)', o: { malicious: { 3: { equivocateCommit: true } } }, Q: [1, 2, 4, 5] },
  { name: 'commitment that does not match the later dealing', o: { malicious: { 5: { commitMismatch: true } } }, Q: [1, 2, 3, 4] },
  { name: 'absent trustee', o: { malicious: { 4: { absent: true } } }, Q: [1, 2, 3, 5] },
  { name: 'trustee that commits but never reveals', o: { malicious: { 1: { noReveal: true } } }, Q: [2, 3, 4, 5] },
  { name: 'false complaint (accuser, not the honest accused, is removed)', o: { malicious: { 2: { falseComplaintAgainst: [1] } } }, Q: [1, 3, 4, 5] },
  { name: 'two malicious at once (t = 3 of 5 still completes)', o: { malicious: { 2: { badShareTo: [3] }, 5: { absent: true } } }, Q: [1, 3, 4] },
];
for (const sc of scenarios) {
  test(`malicious DKG: ${sc.name}`, async () => {
    const { c, outcome } = await ceremony({ n: 5, t: 3, seed: `m-${sc.name}`, ...sc.o });
    try {
      assert.deepEqual(outcome.Q, sc.Q);
      for (const i of c.honest()) {
        const t = await c.act(i, async (x) => x);
        if (sc.Q.includes(i)) {
          assert.equal(t.data.derived!.K, H(pointToBytes(outcome.K)), `T${i} key`);
          assert.deepEqual(t.data.derived!.Q, sc.Q);
        } else assert.ok(['DISQUALIFIED', 'ABORTED'].includes(t.state), `T${i} state ${t.state}`);
      }
      // the honest recipient of the bad share filed a complaint
      if (sc.o.malicious?.[2]?.badShareTo !== undefined) {
        const victim = sc.o.malicious[2].badShareTo[0]!;
        const t = await c.act(victim, async (x) => x);
        assert.equal(t.data.out.complaints.length, 1);
        assert.equal(t.data.out.complaints[0]!.body.accused, 2);
      }
    } finally {
      c.cleanup();
    }
  });
}

test('honest trustee wrongly accused is disqualified-free; false accuser is the one removed (evidence in events)', async () => {
  const { c, outcome } = await ceremony({ n: 4, t: 3, seed: 'falsec', malicious: { 4: { falseComplaintAgainst: [2] } } });
  try {
    assert.deepEqual(outcome.Q, [1, 2, 3]);
    assert.ok(outcome.events.some((e) => e.who === 4 && e.detail.includes('false complaint')));
    assert.equal((await c.act(2, async (x) => x)).state, 'STANDBY');
  } finally {
    c.cleanup();
  }
});

test('ceremony cannot complete below the threshold: honest devices abort (QV-17-REQ-014)', async () => {
  const c = new Ceremony({ n: 3, t: 3, seed: 'quorum', malicious: { 3: { absent: true } } });
  await c.setup();
  try {
    c.marker('dkg-open');
    await c.eachHonest((_i, t) => t.commit());
    await c.eachScripted((s) => s.commit());
    c.marker('dkg-r1-open');
    await c.eachHonest((_i, t) => t.reveal());
    c.marker('dkg-r1-close');
    await c.eachHonest((_i, t) => t.shares());
    c.marker('dkg-r2-close');
    await c.eachHonest(async (_i, t) => (await t.verify()).packet);
    c.marker('dkg-r3-close');
    await c.sync(1);
    await assert.rejects(c.act(1, (t) => t.finalize()), { code: 'E_DKG_QUORUM' });
    assert.equal((await c.act(1, async (x) => x)).state, 'ABORTED');
    // restart generates a fresh signing key and wipes ceremony state
    const before = (await c.act(1, async (x) => x)).signPk;
    const r = await c.act(1, (t) => t.restart());
    assert.notEqual(r.sign_pk, before);
    const t1 = await c.act(1, async (x) => x);
    assert.equal(t1.state, 'KEYS_READY');
    assert.equal(t1.data.log.length, 0);
  } finally {
    c.cleanup();
  }
});

test('out-of-order and out-of-window calls are refused; missed deadlines disqualify', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'order' });
  await c.setup();
  try {
    await assert.rejects(c.act(1, (t) => t.commit()), { code: 'NOT_OPEN' });
    c.marker('dkg-open');
    await c.sync(1);
    await assert.rejects(c.act(1, (t) => t.reveal()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (t) => t.shares()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (t) => t.finalize()), { code: 'WRONG_STATE' });
    await assert.rejects(c.act(1, (t) => t.drill()), { code: 'WRONG_STATE' });
    // T2 never commits; r1-open opens: its commit window is gone
    c.post(await c.act(1, (t) => t.commit()));
    await c.sync(3);
    c.post(await c.act(3, (t) => t.commit()));
    c.marker('dkg-r1-open');
    await c.sync(2);
    // importing the r1-open marker already shows T2 that it missed the window (the log is truth)
    assert.equal((await c.act(2, async (x) => x)).state, 'DISQUALIFIED');
    await assert.rejects(c.act(2, (t) => t.commit()), { code: 'WRONG_STATE' });
    // T1 tries to reveal before its commit is on the imported log? it is: fine. T3 has not imported r1-open yet.
    await assert.rejects(c.act(3, (t) => t.reveal()), { code: 'NOT_OPEN' });
    // reveal after r1-close is too late
    await c.sync(1);
    c.post(await c.act(1, (t) => t.reveal()));
    c.marker('dkg-r1-close');
    await c.sync(3);
    assert.equal((await c.act(3, async (x) => x)).state, 'DISQUALIFIED');
  } finally {
    c.cleanup();
  }
});

test('confirm needs a comparison with another qualified trustee and matching words', async () => {
  const { c } = await ceremony({ n: 3, t: 2, seed: 'sas' }, { confirm: false });
  try {
    await assert.rejects(c.act(1, (t) => t.confirm([])), { code: 'SAS_REQUIRED' });
    await assert.rejects(c.act(1, (t) => t.confirm([1])), { code: 'BAD_COMPARISON' });
    await assert.rejects(c.act(1, (t) => t.confirm([9])), { code: 'BAD_COMPARISON' });
    await assert.rejects(c.act(1, (t) => t.confirm([2], ['bad', 'words', 'here', 'now', 'ok', 'so'])), { code: 'SAS_MISMATCH' });
    const words = (await c.act(1, async (x) => x)).data.derived!.fp_words;
    const p = await c.act(1, (t) => t.confirm([2], words.map((w) => w.toUpperCase())));
    assert.equal(p.round, 'r4-keyconf');
    assert.equal((await c.act(1, async (x) => x)).state, 'CONFIRMED');
    // the sk_xport key is gone after confirmation
    assert.equal((await c.act(1, async (x) => x)).data.dealer, undefined);
  } finally {
    c.cleanup();
  }
});

test('every command is idempotent: re-running after a crash yields byte-identical packets', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'idem', voters: 5 });
  await c.setup();
  try {
    const same = async (i: number, f: Parameters<Ceremony['act']>[1]): Promise<void> => {
      const a = (await c.act(i, f)) as { bytes: Uint8Array } | { packet: { bytes: Uint8Array } };
      const b = (await c.act(i, f)) as typeof a;
      const ba = 'bytes' in a ? a.bytes : a.packet.bytes;
      const bb = 'bytes' in b ? b.bytes : b.packet.bytes;
      assert.equal(H(ba), H(bb));
      c.post(('bytes' in a ? a : a.packet) as Packet);
    };
    c.marker('dkg-open');
    await c.syncAll();
    for (const i of c.honest()) await same(i, (t) => t.commit());
    c.marker('dkg-r1-open');
    await c.syncAll();
    for (const i of c.honest()) await same(i, (t) => t.reveal());
    c.marker('dkg-r1-close');
    await c.syncAll();
    for (const i of c.honest()) await same(i, (t) => t.shares());
    c.marker('dkg-r2-close');
    await c.syncAll();
    for (const i of c.honest()) await same(i, (t) => t.verify());
    c.marker('dkg-r3-close');
    const o = await c.adjudicate();
    c.ctx = o.ctx;
    await c.syncAll();
    for (const i of c.honest()) {
      const a = await c.act(i, (t) => t.finalize());
      const b = await c.act(i, (t) => t.finalize());
      assert.deepEqual(a.fingerprint, b.fingerprint);
    }
    for (const i of c.honest()) await same(i, (t) => t.confirm([i === 1 ? 2 : 1]));
    c.marker('dkg-final', { qmask: o.qmask, K: H(pointToBytes(o.K)) });
    await c.syncAll();
    for (const i of c.honest()) await same(i, (t) => t.drill());
  } finally {
    c.cleanup();
  }
});

test('log import: forged / wrongly-signed / foreign entries are rejected, forks are fatal', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'import' });
  await c.setup();
  try {
    c.marker('dkg-open');
    await c.sync(1);
    c.post(await c.act(1, (t) => t.commit()));
    const good = c.log.slice();
    // a commit "from" T2 signed by T1's key
    const forged = JSON.parse(JSON.stringify(good[1]!.entry)) as { body: { i: number } };
    forged.body.i = 2;
    c.log.push({ seq: 99, entry: forged });
    const rep = await c.sync(2);
    await c.sync(1);
    assert.equal(rep.rejected.length, 1);
    assert.match(rep.rejected[0]!.why, /signature/);
    c.log.pop();
    // fork at a known seq
    const other = new Ceremony({ n: 3, t: 2, seed: 'import' });
    await other.setup();
    other.marker('dkg-open');
    other.marker('dkg-r1-open');
    await assert.rejects(
      (async () => {
        const t = await other.act(1, async (x) => x);
        void t;
        return c.act(1, (x) => x.importLog(other.slice()));
      })(),
      { code: 'LOG_FORK' },
    );
    other.cleanup();
    // wrong election
    const b = new Ceremony({ n: 3, t: 2, seed: 'another' });
    await b.setup();
    await assert.rejects(c.act(1, (x) => x.importLog(b.slice())), { code: 'LOG_FORMAT' });
    b.cleanup();
  } finally {
    c.cleanup();
  }
});

test('full election: threshold decryption by the honest quorum verifies end to end', async () => {
  const f = await electionFixture({ n: 5, t: 3, seed: 'e2e' });
  try {
    const recs: unknown[] = [];
    for (const i of [1, 3, 5]) recs.push((await f.c.act(i, (t) => t.releaseTally(f.c.bundle()))).obj.records[0]);
    const r = finishTally(f.c, f.outcome, recs);
    assert.ok(r.counts, r.error);
    assert.equal(r.counts!.get('budget')!.get('yes'), f.expectedYes);
    assert.equal(r.counts!.get('budget')!.get('no'), f.expectedNo);
    const rep = await verifyAll(f.c);
    assert.equal(rep.verdict, 'PASS', JSON.stringify(rep.findings));
    assert.equal((await f.c.act(1, async (x) => x)).state, 'RELEASED');
    // releasing again returns the identical record (idempotent)
    const again = await f.c.act(1, (t) => t.releaseTally(f.c.bundle()));
    assert.equal(H(again.bytes), H((await f.c.act(1, (t) => t.releaseTally(f.c.bundle()))).bytes));
  } finally {
    f.c.cleanup();
  }
});

void hexToBytes;
