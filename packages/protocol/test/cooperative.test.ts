import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { verifyElection, verifyElectionText, VerificationSchedulingError } from '../src/index.ts';

const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const good = read('test-vectors/v1/elections/tiny-yesno-3v/bundle.json');

test('cooperative execution preserves every report byte in the shared corpus and malformed/unsupported inputs', async () => {
  const cases: unknown[] = [read('test-vectors/v1/canary/canary-election.json'), null, {}, { ...good, manifest: { ...good.manifest, body: { ...good.manifest.body, proto: 'unsupported' } } }];
  for (const name of readdirSync(new URL('../../../test-vectors/v1/elections/', import.meta.url)).sort()) cases.push(read(`test-vectors/v1/elections/${name}/bundle.json`));
  for (const name of readdirSync(new URL('../../../test-vectors/v1/mutations/', import.meta.url)).sort()) cases.push(read(`test-vectors/v1/mutations/${name}`).bundle);
  for (const input of cases) {
    const progress: string[] = [];
    const expected = JSON.stringify(await verifyElection(input));
    const actual = await verifyElection(input, { cooperative: { checkpoint: async (p) => { progress.push(p.stage); } } });
    assert.equal(JSON.stringify(actual), expected);
    assert.ok(progress.length > 0, 'cooperative hooks must execute');
    assert.equal(progress.at(-1), 'complete');
  }
  for (const text of ['{', '{"x":1,"x":2}', 'null']) {
    assert.equal(JSON.stringify(await verifyElectionText(text, { cooperative: { checkpoint: async () => {} } })), JSON.stringify(await verifyElectionText(text)));
  }
});

test('cancellation before parsing, in a suspended ballot batch, and before return never produces a report; retry is independent', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(verifyElectionText('{', { cooperative: { signal: before.signal, checkpoint: () => {} } }), { name: 'AbortError' });
  const controller = new AbortController();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let settled = false;
  const run = verifyElection(good, { cooperative: { signal: controller.signal, checkpoint: async (p) => {
    if (p.stage === 'ballots' && p.completed === 1) { started(); await pending; }
  } } });
  void run.then(() => { settled = true; }, () => { settled = true; });
  // A broken hook must fail this test rather than leaving an unresolved gate.
  await Promise.race([entered, run.then(() => { throw new Error('verification completed without a ballot checkpoint'); })]);
  assert.equal(settled, false);
  const retry = await verifyElection(good);
  controller.abort(); release();
  await assert.rejects(run, { name: 'AbortError' });
  assert.equal(JSON.stringify(await verifyElection(good, { cooperative: { checkpoint: async () => {} } })), JSON.stringify(retry));
  const atReturn = new AbortController();
  await assert.rejects(verifyElection(good, { cooperative: { signal: atReturn.signal, checkpoint: (p) => { if (p.stage === 'complete') atReturn.abort(); } } }), { name: 'AbortError' });
});

test('a failed scheduling callback rejects instead of turning into a protocol verdict', async () => {
  for (const stage of ['manifest', 'ballots', 'complete']) {
    await assert.rejects(verifyElection(good, { cooperative: { checkpoint: (p) => { if (p.stage === stage) throw new Error('scheduler failed'); } } }), { name: 'VerificationSchedulingError' });
  }
  await assert.rejects(verifyElectionText('{', { cooperative: { checkpoint: async () => { throw new Error('scheduler failed'); } } }), { name: 'VerificationSchedulingError' });
});

test('default verification still reports hostile object getter errors without throwing', async () => {
  const input = { get roll() { throw new VerificationSchedulingError(true); } };
  const report = await verifyElection(input);
  assert.equal(report.verdict, 'FAIL');
  assert.equal(report.findings[0]?.code, 'E_SCHEMA');
});

test('cooperative log-evidence completion preserves honest and adversarial reports', async () => {
  for (const prefix of ['', 'adv-']) {
    const input = read(`test-vectors/v1/elections/log-layer-4v/${prefix}bundle.json`);
    const log = { board: read(`test-vectors/v1/elections/log-layer-4v/${prefix}board.json`) };
    const expected = await verifyElection(input, { log });
    assert.notEqual(expected.checks['chk.board.append_only'], 'not_run');
    assert.equal(JSON.stringify(await verifyElection(input, { log, cooperative: { checkpoint: async () => {} } })), JSON.stringify(expected));
  }
  const input = read('test-vectors/v1/elections/log-layer-4v/bundle.json');
  const log = { board: read('test-vectors/v1/elections/log-layer-4v/adv-board.json') };
  const expected = await verifyElection(input, { log });
  assert.equal(expected.verdict, 'FAIL');
  assert.equal(expected.checks['chk.board.append_only'], 'fail');
  assert.equal(JSON.stringify(await verifyElection(input, { log, cooperative: { checkpoint: async () => {} } })), JSON.stringify(expected));
});

test('large synthetic proof sequence yields in ballot order without changing any report byte', async () => {
  const input = structuredClone(good);
  const ballot = input.log.find((e: any) => e.entry.intent === 'cast');
  for (let i = 0; i < 80; i++) input.log.push({ seq: input.log.at(-1).seq + 1, entry: structuredClone(ballot.entry) });
  const expected = JSON.stringify(await verifyElection(input));
  const completed: number[] = [];
  const actual = await verifyElection(input, { cooperative: { checkpoint: async (p) => {
    if (p.stage === 'ballots') completed.push(p.completed);
    await new Promise<void>((resolve) => setImmediate(resolve));
  } } });
  assert.equal(JSON.stringify(actual), expected);
  const ballots = input.log.filter((e: any) => 'intent' in e.entry).length;
  assert.deepEqual(completed, Array.from({ length: ballots + 1 }, (_, i) => i));
});
