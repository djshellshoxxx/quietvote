// Independent supplemental-author review: actual signed evidence, caller trust and role limits.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { bytesToHex } from '@quietvote/crypto';
import { PROTO_ID, signRecord, type ElectionBundle } from '@quietvote/protocol';
import { hashReport, verifyBundle } from '../src/verify.ts';
import { verifyWithSelfTest } from '../src/main.ts';
import { parseAuthorKeyInput, verifyPublicBundleText } from '../../web/src/flow/verification.ts';
import { buildLogView, controlRecord, type EntryOverride } from '../../protocol/test/vecgen/logboard.ts';
import { isoSec, witnessKeys, type Head } from '../../protocol/test/helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, publishTally, setup } from '../../protocol/test/helpers/sim.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
async function makeFixture(quorum = 2) {
  const seed = `fresh-author-pin-${quorum}`;
  const witnesses = witnessKeys(seed).slice(0, 2);
  const sim = await setup({ seed, n: 2, t: 2, voters: 3, boundLog: true, witnessQuorum: quorum,
    witnesses: witnesses.map((key, i) => ({ name: `w${i + 1}`, pk: bytesToHex(key.publicKey) })),
    contests: defaultContests().filter((c) => c.id === 'budget') });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: [i === 2 ? 'no' : 'yes'] });
  closeElection(sim); publishTally(sim, [1, 2]);
  const extra = kp(seed, 'supplemental-author');
  const pin = bytesToHex(extra.publicKey);
  const base = bundleOf(sim) as ElectionBundle;
  // The aggregate evidence precedes the final result in the board grammar.
  const tally = base.log.at(-1)!;
  const seq = tally.seq;
  const record = signRecord(extra.secretKey, extra.publicKey, sim.mh, { proto: PROTO_ID, type: 'server-evidence', purpose: 'fresh review' });
  const bundle: ElectionBundle = { ...base, log: [...base.log.slice(0, -1), { seq, entry: record }, { ...tally, seq: seq + 1 }] };
  const cos = (ts: number) => quorum === 0 ? [] : witnesses.map((key, i) => ({ name: `w${i + 1}`, key, ts }));
  const view = (content = bundle, overrides: ReadonlyMap<number, EntryOverride> = new Map()) => {
    const start = isoSec(sim.manifest.voting_open), end = isoSec(sim.manifest.voting_close);
    const heads: Head[] = [
      { size: sim.openSeq!, cosigs: cos(start - 3600) },
      { size: sim.closeSeq!, cosigs: cos(start + 3600) },
      { size: sim.closeSeq! + 1, cosigs: cos(end + 60) },
      { size: content.log.at(-1)!.seq + 1, cosigs: cos(end + 120) },
    ];
    const over = new Map<number, EntryOverride>([[seq, { type: 'tally_aggregate', author: extra }], ...overrides]);
    const board = buildLogView(sim, content, heads, kp(seed, 'log'), over).json as any;
    board.policy.witness_policy = { quorum, none_acknowledged: quorum === 0,
      witnesses: witnesses.map((key, i) => ({ name: `w${i + 1}`, alg: 'ed25519', pk_b64: Buffer.from(key.publicKey).toString('base64') })) };
    return { ...content, board };
  };
  return { sim, bundle, extra, pin, view };
}
let fixture: ReturnType<typeof makeFixture> | undefined;
const world = () => fixture ??= makeFixture();

test('fresh author pins: signed supplemental evidence requires caller trust through self-test wrapper and public helper', async () => {
  const { pin, view } = await world();
  const input = view();
  assert.equal((await verifyBundle(input)).verdict, 'FAIL');
  assert.equal((await verifyBundle(input, { extraAuthorKeys: [pin] })).verdict, 'PASS');
  const text = JSON.stringify(input);
  assert.equal((await verifyWithSelfTest(text, { extraAuthorKeys: [pin], skipSelfTest: true })).verdict, 'PASS');
  assert.equal((await verifyPublicBundleText(text, { extraAuthorKeys: [pin] })).verdict, 'PASS');
  const checked = await verifyWithSelfTest(text, { extraAuthorKeys: [pin] });
  assert.equal(checked.verdict, 'PASS');
  assert.equal(checked.selfTest?.ok, true);
  const rejectedCanary = await verifyWithSelfTest(text, { extraAuthorKeys: [pin], corpusText: '{' });
  assert.equal(rejectedCanary.verdict, 'FAIL');
  assert.equal(rejectedCanary.chk['chk.board.append_only'], 'pass');
  assert.equal(rejectedCanary.selfTest?.ok, false);
  assert.equal(rejectedCanary.reportHash, hashReport(rejectedCanary));
});

test('fresh author pins: bundle and board metadata cannot supply trusted author keys', async () => {
  const { pin, view } = await world();
  const input = { ...view(), extraAuthorKeys: [pin], extra_author_keys: [pin],
    options: { extraAuthorKeys: [pin] }, log_evidence: { extraAuthorKeys: [pin] },
    server: { signing_key: pin }, info: { signing_key: pin } };
  input.board.extraAuthorKeys = [pin];
  const text = JSON.stringify(input);
  assert.equal((await verifyWithSelfTest(text, { skipSelfTest: true })).verdict, 'FAIL');
  assert.equal((await verifyPublicBundleText(text)).verdict, 'FAIL');
});

test('fresh author pins: a supplemental signer cannot acquire manifest, marker, trustee, voter or control authority', async () => {
  const { pin, extra, sim, bundle, view } = await world();
  const first = (predicate: (entry: any) => boolean) => bundle.log.find((row) => predicate(row.entry))!.seq;
  for (const seq of [0, sim.openSeq!, first((entry) => entry.body?.type === 'dkg-keyconf'), first((entry) => entry.intent === 'cast')]) {
    const report = await verifyBundle(view(bundle, new Map([[seq, { author: extra }]])), { extraAuthorKeys: [pin] });
    assert.equal(report.verdict, 'FAIL', `supplemental signer at ${seq}`);
    assert.ok(report.findings.some((finding) => finding.code === 'E_LOG_BINDING' && finding.cls === 'F'));
  }
  const seq = bundle.log.at(-1)!.seq + 1;
  const control = { ...bundle, log: [...bundle.log, { seq, entry: controlRecord(sim, 'witness-waiver') }] };
  const report = await verifyBundle(view(control, new Map([[seq, { type: 'notice', author: extra }]])), { extraAuthorKeys: [pin] });
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.findings.some((finding) => finding.code === 'E_LOG_BINDING' && finding.cls === 'F'));
});

test('fresh author pins: trusted extra authors never substitute for witness evidence', async () => {
  const { pin, view } = await makeFixture(0);
  const input = view();
  const report = await verifyBundle(input, { extraAuthorKeys: [pin] });
  assert.equal(report.verdict, 'INCOMPLETE');
  assert.equal(report.chk['chk.board.append_only'], 'pass');
  assert.equal(report.chk['chk.board.witness'], 'not_run');
  assert.equal((await verifyPublicBundleText(JSON.stringify(input), { extraAuthorKeys: [pin] })).verdict, 'INCOMPLETE');
  assert.equal((await verifyBundle(input, { extraAuthorKeys: [pin], allowNoLog: true })).verdict, 'PASS');
});

test('fresh author pins: UI parser accepts independent key lists and rejects malformed or excessive input', async () => {
  const { pin } = await world();
  assert.deepEqual(parseAuthorKeyInput(` \n${pin}\t${pin}\n`), [pin]);
  assert.deepEqual(parseAuthorKeyInput(' \t\n'), []);
  for (const value of [pin.toUpperCase(), pin.slice(1), pin + '0', 'g'.repeat(64), `${pin},${pin}`, ' '.repeat(2081), Array(33).fill(pin).join('\n')]) {
    assert.throws(() => parseAuthorKeyInput(value));
  }
});

test('fresh author pins: actual CLI parsing rejects invalid keys before I/O and forwards repeated valid keys', async () => {
  const { pin, view } = await world();
  const dir = mkdtempSync(join(tmpdir(), 'qv-fresh-author-pin-'));
  try {
    const file = join(dir, 'election.json');
    writeFileSync(file, JSON.stringify(view()));
    const malformed = [[], [''], [pin.slice(1)], [pin + '0'], [pin + '\n'], [pin.toUpperCase()], ['g'.repeat(64)], ['--json'], [pin, '--extra-author-key', 'bad']];
    for (const entry of [[join(root, 'packages/cli/bin/qv.ts'), 'verify'], [join(root, 'packages/verifier/src/bin.ts')]]) {
      const run = (args: string[]) => spawnSync(process.execPath, [...entry, ...args], { cwd: root, encoding: 'utf8', timeout: 90_000 });
      for (const value of malformed) {
        const result = run([join(dir, 'does-not-exist.json'), '--extra-author-key', ...value]);
        assert.equal(result.status, 2, `${entry[0]} ${JSON.stringify(value)}: ${result.stdout}\n${result.stderr}`);
      }
      const tooMany = run([join(dir, 'does-not-exist.json'), ...Array.from({ length: 33 }, () => ['--extra-author-key', pin]).flat()]);
      assert.equal(tooMany.status, 2, tooMany.stderr);
      const absent = run([file, '--json', '--skip-selftest']);
      assert.equal(absent.status, 1, absent.stderr);
      for (const args of [
        ['--extra-author-key', pin, file, '--extra-author-key', pin, '--json', '--skip-selftest'],
        [file, `--extra-author-key=${pin}`, '--json', '--skip-selftest'],
      ]) {
        const result = run(args);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const report = JSON.parse(result.stdout);
        assert.equal(report.verdict, 'PASS');
        assert.equal(report.chk['chk.board.append_only'], 'pass');
        assert.equal(report.chk['chk.board.witness'], 'pass');
        assert.ok(!report.caveats.some((caveat: string) => caveat.includes('CONTENT-ONLY')));
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
