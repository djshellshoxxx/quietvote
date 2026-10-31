import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519Keypair, sha256 } from '@quietvote/crypto';
import {
  BoardLog, MemoryBoardStore, buildEntry, bundleToJson, cosignLine, exportBundle, type EntryType, type WitnessPolicy,
} from '@quietvote/board';
import {
  V_IDS, formatReport, hashReport, loadBundle, loadCorpus, runSelfTest, syntheticCanaries, verifyBundle, verifierMain, verifyWithSelfTest,
  type Corpus,
} from '../src/index.ts';
import { buildCorpus } from '../scripts/build-corpus.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-vectors', 'v1');
const rd = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const tiny = (): any => rd('elections/tiny-yesno-3v/bundle.json');
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

test('loader: strict parse, closed member set, board export separated', () => {
  assert.equal(loadBundle('not json').ok, false);
  assert.equal(loadBundle('[]').ok, false);
  assert.equal(loadBundle('{"manifest":1,"manifest":2}').ok, false, 'duplicate keys');
  assert.equal(loadBundle('{"a":1.5}').ok, false, 'floats');
  const extra = loadBundle({ ...tiny(), surprise: 1 });
  assert.ok(!extra.ok && extra.errors.some((e) => e.includes('surprise')));
  assert.equal(loadBundle({ ...tiny(), roll: 'x' }).ok, false);
  const ok = loadBundle(JSON.stringify(tiny()));
  assert.ok(ok.ok && ok.value.board === undefined);
  const bad = loadBundle({ ...tiny(), board: { format: 'nope' } });
  assert.ok(!bad.ok && bad.errors[0]!.startsWith('board export invalid'));
});

test('control election: PASS, V-vocabulary mapped, V4/V13 honestly not_run, report hash recomputes', async () => {
  const r = await verifyBundle(JSON.stringify(tiny()));
  assert.equal(r.verdict, 'PASS');
  for (const id of V_IDS) {
    const want = id === 'V4' || id === 'V13' ? 'not_run' : 'pass';
    assert.equal(r.checks[id].status, want, id);
  }
  assert.equal(r.reportHash, hashReport(r));
  assert.equal(r.reportHash.length, 64);
  assert.equal((await verifyBundle(tiny())).reportHash, r.reportHash, 'deterministic');
  const txt = formatReport(r);
  assert.match(txt, /VERDICT: PASS/);
  assert.match(txt, /Checks NOT run: V4, V13/);
  const mutated = { ...r, verdict: 'FAIL' as const };
  assert.notEqual(hashReport(mutated), r.reportHash);
});

test('canary election and mutants map onto the expected V checks', async () => {
  const c = await verifyBundle(rd('canary/canary-election.json'));
  assert.equal(c.verdict, 'FAIL');
  assert.equal(c.checks.V5.status, 'fail');
  assert.equal(c.checks.V9.status, 'fail');
  assert.equal(c.checks.V1.status, 'pass');
  const wrong = await verifyBundle(rd('mutations/partial-decryption-wrong.json').bundle);
  assert.equal(wrong.checks.V10.status, 'fail');
  const count = await verifyBundle(rd('mutations/count-altered.json').bundle);
  assert.equal(count.checks.V11.status, 'fail');
  assert.equal(count.checks.V10.status, 'pass');
  const man = await verifyBundle(rd('mutations/manifest-field-flip.json').bundle);
  assert.equal(man.verdict, 'FAIL');
  assert.equal(man.checks.V1.status, 'fail');
  const nt = tiny();
  nt.log = nt.log.slice(0, -1);
  const inc = await verifyBundle(nt);
  assert.ok(['INCOMPLETE', 'FAIL'].includes(inc.verdict));
  assert.notEqual(inc.verdict, 'PASS');
});

test('flagged-but-PASS mutants are shown as flagged, not hidden', async () => {
  const r = await verifyBundle(rd('mutations/spoil-wrong-plaintext.json').bundle);
  assert.equal(r.checks.V8.status, 'fail');
  if (r.verdict === 'PASS') assert.match(formatReport(r), /FLAGGED: .*V8/);
});

test('pinned manifest hash overrides the bundle value', async () => {
  const r = await verifyBundle(tiny(), { pinnedManifestHash: '00'.repeat(32) });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.checks.V1.status, 'fail');
});

test('hostile inputs never throw and never pass', async () => {
  for (const x of [null, 1, 'x', [], {}, { manifest: null }, new Uint8Array([0xff, 0xfe]), '{"manifest":{"body":{}},"manifest_hash":"","roll":[],"log":[]}']) {
    const r = await verifyBundle(x as never);
    assert.notEqual(r.verdict, 'PASS');
    assert.equal(r.reportHash, hashReport(r));
  }
});

test('self-test passes on the shipped corpus; control accepted, every canary rejected', async () => {
  const st = await runSelfTest();
  assert.deepEqual(st.failures, []);
  assert.ok(st.ok && st.control);
  assert.equal(st.rejected, st.total);
  assert.ok(st.total >= 25);
  assert.ok(st.cases.some((c) => c.kind === 'canary' && c.id === 'canary-election'));
});

test('self-test catches a broken verifier: an accepted canary or a rejected control fails it', async () => {
  const corpus: Corpus = loadCorpus();
  const valid = { ...corpus, canaries: [{ id: 'actually-valid', expect: {}, bundle: corpus.control.bundle }] };
  const a = await runSelfTest(valid);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some((f) => f.startsWith('actually-valid: ACCEPTED')));
  const broken = JSON.parse(JSON.stringify(corpus.control.bundle));
  broken.manifest_hash = '11'.repeat(32);
  const b = await runSelfTest({ ...corpus, control: { ...corpus.control, bundle: broken }, canaries: corpus.canaries.slice(0, 1) });
  assert.equal(b.control, false);
  assert.equal(b.ok, false);
  const wrongExpectation = { ...corpus, canaries: [{ ...corpus.canaries[0]!, expect: { failed_checks: ['chk.result.rules'] } }] };
  assert.equal((await runSelfTest(wrongExpectation)).ok, false);
});

test('a failing self-test forces FAIL even when the bundle itself passes', async () => {
  const skipped = await verifyWithSelfTest(JSON.stringify(tiny()), { skipSelfTest: true });
  assert.equal(skipped.verdict, 'PASS');
  assert.ok(skipped.caveats.some((c) => c.includes('self-test skipped')));
  assert.equal(skipped.selfTest, undefined);
  const corpus = loadCorpus();
  const rigged: Corpus = { ...corpus, canaries: [{ id: 'actually-valid', expect: {}, bundle: corpus.control.bundle }] };
  const r = await verifyWithSelfTest(JSON.stringify(tiny()), { corpus: rigged });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.selfTest?.ok, false);
  assert.match(formatReport(r), /self-test: FAILED/);
});

test('synthetic canaries are deterministic and cover malformed text', () => {
  const a = syntheticCanaries(tiny());
  const b = syntheticCanaries(tiny());
  assert.deepEqual(a, b);
  assert.ok(a.some((x) => x.id === 'synthetic/duplicate-key'));
});

test('corpus.json is in sync with test-vectors (regenerate with scripts/build-corpus.ts)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  assert.equal(readFileSync(join(here, '..', 'canary', 'corpus.json'), 'utf8'), buildCorpus());
});

// ---------------------------------------------------------------- board composition

const sk = (label: string): { secretKey: Uint8Array; publicKey: Uint8Array } => ed25519Keypair(sha256(utf8(`vec-tiny/${label}`)));
const COORD = sk('coord');
const LOGK = sk('log');
const W = [ed25519Keypair(sha256(utf8('w1'))), ed25519Keypair(sha256(utf8('w2')))];
const ORIGIN = 'quietvote/v1/abcdefghijklmnopqrstuvwxyz';
const NOW = 1_800_000_000;

function makeBoard(opts: { witnessed: boolean; badAuthor?: boolean }): unknown {
  const policy: WitnessPolicy = opts.witnessed
    ? { quorum: 2, noneAcknowledged: false, witnesses: [{ name: 'w1', alg: 'ed25519', publicKey: W[0]!.publicKey }, { name: 'w2', alg: 'ed25519', publicKey: W[1]!.publicKey }] }
    : { quorum: 0, noneAcknowledged: true, witnesses: [] };
  const store = new MemoryBoardStore();
  const log = new BoardLog({ origin: ORIGIN, store, secretKey: LOGK.secretKey, publicKey: LOGK.publicKey, clock: () => NOW, allowUnverifiedSignatures: true });
  let n = 0;
  const add = (type: EntryType, who = COORD): void => {
    n++;
    const e = buildEntry({ origin: ORIGIN, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce: sha256(utf8(`n${n}`)).slice(0, 16), createdAt: NOW, body: utf8(`b${n}`), refs: [] });
    const r = log.append(e.headerBytes, e.body);
    assert.ok(r.ok, type);
  };
  const witness = (): void => {
    const note = log.checkpoint();
    assert.ok(note.ok);
    if (!note.ok) return;
    if (!opts.witnessed) return;
    const text = note.value.slice(0, note.value.indexOf('\n\n') + 1);
    log.attachCosignatures(log.size, W.map((w, i) => cosignLine(`w${i + 1}`, w.secretKey, w.publicKey, text, NOW)), policy);
  };
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit'] as EntryType[]) add(t);
  witness();
  add('election_open');
  add('ballot', opts.badAuthor ? ed25519Keypair(sha256(utf8('stranger'))) : COORD);
  witness();
  for (const t of ['election_close', 'tally_aggregate', 'tally_result', 'audit_close'] as EntryType[]) add(t);
  witness();
  if (!opts.witnessed) log.checkpoint();
  const b = exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 'test', policy: { logPublicKey: LOGK.publicKey, witnessPolicy: policy } });
  return JSON.parse(JSON.stringify(bundleToJson(b)));
}

// Board export with protocol-conformant log checks: see logcheck.test.ts (log layer through the verifier).

test('board layer is skipped (not trusted) when the manifest does not verify', async () => {
  const t = tiny();
  t.manifest_hash = '00'.repeat(32);
  const r = await verifyBundle({ ...t, board: makeBoard({ witnessed: true }) });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.board, undefined);
  assert.equal(r.checks.V4.status, 'not_run');
});

// ---------------------------------------------------------------- qv-verify entry

test('qv-verify main: exit codes and output', async () => {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (s: string) => void out.push(s), err: (s: string) => void err.push(s) };
  const f = join(ROOT, 'elections', 'tiny-yesno-3v', 'bundle.json');
  assert.equal(await verifierMain([f, '--skip-selftest'], io), 0);
  assert.match(out.join(''), /VERDICT: PASS/);
  assert.equal(await verifierMain([join(ROOT, 'canary', 'canary-election.json'), '--skip-selftest', '--json'], io), 1);
  assert.equal(JSON.parse(out.at(-1)!).verdict, 'FAIL');
  assert.equal(await verifierMain([], io), 2);
  assert.equal(await verifierMain(['--bogus'], io), 2);
  assert.equal(await verifierMain(['/nonexistent/bundle.json'], io), 4);
  assert.equal(await verifierMain(['--selftest'], io), 0);
});
