// Independent P1 review: caller authority, supplied evidence and interrupted layers.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { verifyElection, type ElectionBundle } from '@quietvote/protocol';
import { verifyBundle } from '../src/verify.ts';
import { buildBoard } from './helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, publishTally, setup } from './helpers/sim.ts';

const fixture = new URL('../../../test-vectors/v1/elections/log-layer-4v/', import.meta.url);
const read = (name: string): any => JSON.parse(readFileSync(new URL(name, fixture), 'utf8'));
const complete = (): any => {
  const input = { ...read('bundle.json'), board: read('board.json') };
  // The protocol-only corpus intentionally leaves its self-attested policy copy
  // empty. Supply matching transport metadata for the wrapper's second layer;
  // signatures, trusted manifest policy and checkpoint bytes remain unchanged.
  const bb = input.manifest.body.bb;
  input.board.policy.witness_policy = { quorum: bb.witness_quorum, none_acknowledged: false,
    witnesses: bb.witnesses.map((w: { name: string; pk: string }) =>
      ({ name: w.name, alg: 'ed25519', pk_b64: Buffer.from(w.pk, 'hex').toString('base64') })) };
  return input;
};
const root = fileURLToPath(new URL('../../../', import.meta.url));

test('fresh P1: public defaults require log evidence; input flags and truthy options grant no opt-out', async () => {
  const bare = read('bundle.json');
  assert.equal((await verifyElection(bare)).verdict, 'INCOMPLETE');
  const wrapped = await verifyBundle(bare);
  assert.equal(wrapped.verdict, 'INCOMPLETE');
  assert.equal(wrapped.checks.V14.status, 'pass'); // complete tally, incomplete log assurance
  assert.equal(wrapped.checks.V4.status, 'not_run');
  for (const value of [1, 'true', {}, []]) {
    assert.notEqual((await verifyElection(bare, { allowNoLog: value as any })).verdict, 'PASS');
    assert.notEqual((await verifyBundle(bare, { allowNoLog: value as any })).verdict, 'PASS');
  }
  const injected = { ...bare, allowNoLog: true, allow_no_log: true, contentOnly: true,
    options: { allowNoLog: true }, opts: { allowNoLog: true } };
  assert.notEqual((await verifyElection(injected)).verdict, 'PASS');
  assert.notEqual((await verifyBundle(injected)).verdict, 'PASS');
  for (const report of [await verifyElection(bare, { allowNoLog: true }), await verifyBundle(bare, { allowNoLog: true })]) {
    assert.equal(report.verdict, 'PASS');
    assert.ok(report.caveats.some((c) => c.includes('CONTENT-ONLY')));
  }
});

test('fresh P1: malformed or redacted supplied board cannot use the absent-log opt-out', async () => {
  for (const board of [null, {}, false]) {
    const report = await verifyBundle({ ...read('bundle.json'), board }, { allowNoLog: true });
    assert.equal(report.verdict, 'FAIL');
    assert.equal((await verifyElection(read('bundle.json'), { log: { board }, allowNoLog: true })).verdict, 'FAIL');
  }
  for (const log of [{}, { board: undefined }]) {
    assert.notEqual((await verifyElection(read('bundle.json'), { log: log as any, allowNoLog: true })).verdict, 'PASS');
  }
  const input = complete();
  input.board.entries[17].body_b64u = null;
  input.board.redactions = [{ seq: 17, redacted_at: input.board.created_at, reason: 'review' }];
  const partial = await verifyBundle(input, { allowNoLog: true });
  assert.equal(partial.board?.integrity, 'PARTIAL');
  assert.equal(partial.verdict, 'INCOMPLETE');
  assert.equal(partial.chk['chk.board.append_only'], 'not_run');
});

test('fresh P1: export policy cannot replace the signed witness requirement', async () => {
  const input = complete();
  input.board.policy.witness_policy = { quorum: 0, none_acknowledged: true, witnesses: [] };
  input.board.checkpoints = input.board.checkpoints.map((note: string) => {
    const [body, signatures] = note.split('\n\n');
    const logLine = signatures!.split('\n').find((line) => line.startsWith(`— ${input.board.origin} `));
    assert.ok(logLine);
    return `${body}\n\n${logLine}\n`;
  });
  for (const allowNoLog of [false, true]) {
    const report = await verifyBundle(input, { allowNoLog });
    assert.equal(report.verdict, 'FAIL');
    assert.ok(report.findings.some((f) => f.code === 'E_LOG_WITNESS' && f.cls === 'F'));
  }
  const intact = await verifyBundle(complete());
  assert.equal(intact.verdict, 'PASS');
  assert.equal(intact.checks.V4.status, 'pass');
});

test('fresh P1: a genuinely signed zero-witness election needs explicit content-only mode', async () => {
  const seed = 'fresh-p1-zero-witness';
  const sim = await setup({ seed, n: 2, t: 2, voters: 3, boundLog: true, witnessQuorum: 0,
    contests: defaultContests().filter((c) => c.id === 'budget') });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: [i === 2 ? 'no' : 'yes'] });
  closeElection(sim);
  publishTally(sim, [1, 2]);
  const bundle = bundleOf(sim) as ElectionBundle;
  const board = buildBoard(sim, bundle, [{ size: bundle.log.at(-1)!.seq + 1 }], {
    logKey: kp(seed, 'log'), witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
  }).json;
  assert.equal((await verifyBundle({ ...bundle, board })).verdict, 'INCOMPLETE');
  const allowed = await verifyBundle({ ...bundle, board }, { allowNoLog: true });
  assert.equal(allowed.verdict, 'PASS');
  assert.equal(allowed.chk['chk.board.append_only'], 'pass');
  assert.equal(allowed.chk['chk.board.witness'], 'not_run');
  assert.ok(allowed.caveats.some((c) => c.includes('CONTENT-ONLY')));
});

test('fresh P1: board-layer exception cannot return PASS or expose private exception text', () => {
  const target = new URL('../src/verify.ts', import.meta.url).href;
  const script = `
    import {mock} from 'node:test';
    import {readFileSync} from 'node:fs';
    const original=await import('@quietvote/board');
    mock.module('@quietvote/board',{exports:{...original,verifyLog(){throw new Error('private-review-sentinel');}}});
    const {verifyBundle}=await import(${JSON.stringify(target)});
    const base=${JSON.stringify(fileURLToPath(fixture))};
    const input={...JSON.parse(readFileSync(base+'bundle.json','utf8')),board:JSON.parse(readFileSync(base+'board.json','utf8'))};
    const bb=input.manifest.body.bb;
    input.board.policy.witness_policy={quorum:bb.witness_quorum,none_acknowledged:false,
      witnesses:bb.witnesses.map(w=>({name:w.name,alg:'ed25519',pk_b64:Buffer.from(w.pk,'hex').toString('base64')}))};
    const results=[];
    for(const allowNoLog of [false,true]) results.push(await verifyBundle(input,{allowNoLog}));
    console.log(JSON.stringify(results));
  `;
  const stdout = execFileSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8', timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const reports = JSON.parse(stdout) as Array<{ verdict: string; chk: Record<string, string> }>;
  assert.equal(reports.length, 2);
  for (const report of reports) {
    assert.equal(report.verdict, 'INCOMPLETE');
    assert.equal(report.chk['chk.board.append_only'], 'not_run');
    assert.equal(report.chk['chk.board.witness'], 'not_run');
  }
  assert.ok(!stdout.includes('private-review-sentinel'));
});

test('fresh P1: interrupted witness layer cannot exploit the signed zero-witness opt-out', () => {
  const logModule = new URL('../../protocol/src/logcheck.ts', import.meta.url).href;
  const simModule = new URL('./helpers/sim.ts', import.meta.url).href;
  const boardModule = new URL('./helpers/board.ts', import.meta.url).href;
  const script = `
    import {mock} from 'node:test';
    const original=await import(${JSON.stringify(logModule)});
    mock.module(${JSON.stringify(logModule)},{exports:{...original,verifyWitnessing(){throw new Error('private-review-sentinel');}}});
    const {setup,castBallot,closeElection,publishTally,bundleOf,defaultContests,kp}=await import(${JSON.stringify(simModule)});
    const {buildBoard}=await import(${JSON.stringify(boardModule)});
    const {verifyElection}=await import('@quietvote/protocol');
    const seed='fresh-p1-zero-fault';
    const sim=await setup({seed,n:2,t:2,voters:3,boundLog:true,witnessQuorum:0,contests:defaultContests().filter(c=>c.id==='budget')});
    for(let i=0;i<3;i++)castBallot(sim,i,{budget:[i===2?'no':'yes']});
    closeElection(sim);publishTally(sim,[1,2]);
    const bundle=bundleOf(sim);
    const board=buildBoard(sim,bundle,[{size:bundle.log.at(-1).seq+1}],{logKey:kp(seed,'log'),witnessPolicy:{quorum:0,noneAcknowledged:true,witnesses:[]}}).json;
    console.log(JSON.stringify(await verifyElection(bundle,{log:{board},allowNoLog:true})));
  `;
  const stdout = execFileSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script],
    { cwd: root, encoding: 'utf8', timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const report = JSON.parse(stdout) as { verdict: string; checks: Record<string, string> };
  assert.equal(report.verdict, 'INCOMPLETE');
  assert.equal(report.checks['chk.board.append_only'], 'not_run');
  assert.equal(report.checks['chk.board.witness'], 'not_run');
  assert.equal(report.checks['chk.tally.decrypt'], 'pass');
  assert.ok(!stdout.includes('private-review-sentinel'));
});

test('fresh P1: both shipped CLI entrypoints preserve scoped PASS and INCOMPLETE exits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-fresh-p1-'));
  try {
    const bare = join(dir, 'bare.json'), valid = join(dir, 'valid.json'), malformed = join(dir, 'malformed.json');
    writeFileSync(bare, JSON.stringify(read('bundle.json')));
    writeFileSync(valid, JSON.stringify(complete()));
    writeFileSync(malformed, JSON.stringify({ ...read('bundle.json'), board: {} }));
    const cases: Array<{ file: string; args: string[]; exit: number; verdict: string }> = [
      { file: bare, args: [], exit: 3, verdict: 'INCOMPLETE' },
      { file: bare, args: ['--content-only'], exit: 0, verdict: 'PASS' },
      { file: malformed, args: ['--content-only'], exit: 1, verdict: 'FAIL' },
      { file: valid, args: [], exit: 0, verdict: 'PASS' },
    ];
    for (const entry of [
      [join(root, 'packages/cli/bin/qv.ts'), 'verify'],
      [join(root, 'packages/verifier/src/bin.ts')],
    ]) {
      for (const item of cases) {
        // Canary functionality is independently qualified; this probe isolates
        // the actual public parser, option forwarding, report and exit mapping.
        const result = spawnSync(process.execPath, [...entry, item.file, '--json', '--skip-selftest', ...item.args],
          { cwd: root, encoding: 'utf8', timeout: 90_000 });
        assert.equal(result.status, item.exit, `${entry[0]} ${item.verdict}: ${result.stdout}\n${result.stderr}`);
        const report = JSON.parse(result.stdout);
        assert.equal(report.verdict, item.verdict);
        if (item.args.includes('--content-only') && item.verdict === 'PASS') {
          assert.ok(report.caveats.some((c: string) => c.includes('CONTENT-ONLY')));
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
