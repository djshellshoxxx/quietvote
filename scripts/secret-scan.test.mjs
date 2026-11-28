// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { decodeGitPath, detectLine, LIMITS, parseHistory, scanHistory, scanTree, validateAllowlist, valueHash } from './secret-scan.mjs';

const scanner = resolve(import.meta.dirname, 'secret-scan.mjs');
const token = () => 'gh' + 'p_' + 'a'.repeat(36);
const secret = () => '12'.repeat(32);
function write(root, path, data) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); }
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, 'fixture Git command must succeed');
  return result.stdout.trim();
}
function repo(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qv-secret-scan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']); git(root, ['config', 'user.name', 'Scanner Fixture']); git(root, ['config', 'user.email', 'scanner@example.invalid']);
  write(root, 'scripts/secret-scan-allowlist.json', JSON.stringify({ version: 1, entries: [] }));
  for (const [path, data] of Object.entries(files)) write(root, path, data);
  return root;
}
function run(root, ...args) {
  const result = spawnSync(process.execPath, [scanner, '--root', root, '--json', ...args], { encoding: 'utf8', timeout: 20_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined, 'scanner process must finish');
  assert.equal(result.stderr, '', 'scanner must not print raw diagnostics to stderr');
  return { code: result.status, raw: result.stdout, report: JSON.parse(result.stdout) };
}
function allow(root, entries) { write(root, 'scripts/secret-scan-allowlist.json', JSON.stringify({ version: 1, entries })); }
const fixtureException = (path, value = secret()) => ({ path, rule: 'HEX_SECRET', sha256: valueHash(value), reason: 'Synthetic fixed test value, reviewed for this exact fixture.' });

test('clean tree scans tracked and untracked text deterministically and respects Git ignored files', (t) => {
  const root = repo(t, { 'tracked.md': 'Public documentation.\n', '.gitignore': 'ignored.txt\n', 'ignored.txt': token(), 'untracked.txt': 'Also scanned.\n' });
  git(root, ['add', 'tracked.md']);
  const first = run(root), second = run(root);
  assert.equal(first.code, 0); assert.equal(first.raw, second.raw);
  assert.equal(first.report.complete, true); assert.equal(first.report.counts.files, 4);
});

test('fake token planted under a test directory fails and neither format echoes its value', (t) => {
  const value = token(), root = repo(t, { 'packages/crypto/test/planted.ts': `// secret-scan: ignore\nconst harmless = '${value}';\n` });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.deepEqual(result.report.findings, [{ path: 'packages/crypto/test/planted.ts', line: 2, rule: 'TOKEN_PREFIX' }]);
  assert.ok(!result.raw.includes(value));
  const text = spawnSync(process.execPath, [scanner, '--root', root], { encoding: 'utf8' });
  assert.equal(text.status, 1); assert.ok(!(text.stdout + text.stderr).includes(value));
  assert.ok(!result.raw.includes('harmless'));
});

test('private PEM headers, recognizable tokens and assigned secret hex are detected with closed findings', (t) => {
  const pem = '-----BEGIN ' + 'PRIVATE KEY-----';
  const root = repo(t, { 'secrets.txt': `${pem}\n${token()}\nSEED=${secret()}\n` });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.deepEqual(result.report.findings.map((row) => row.rule), ['PRIVATE_KEY_PEM', 'TOKEN_PREFIX', 'HEX_SECRET']);
  for (const row of result.report.findings) assert.deepEqual(Object.keys(row).sort(), ['line', 'path', 'rule']);
  for (const value of [pem, token(), secret()]) assert.ok(!result.raw.includes(value));
});

test('hex assignment detector covers names, JSON, typed declarations, decoder wrappers and env syntax', () => {
  for (const name of ['secret', 'privateKey', 'seedHex', 'auth_token', 'password', 'apiKey', 'APIKey', 'APIKEY', 'PRIVATEKEY', 'SECRETKEY', 'signing-key', 'sk', 'KEK', 'dek', 'key', 'voter_secret_hex']) {
    for (const line of [`${name}=${secret()}`, `"${name}": "${secret()}"`, `const ${name}: string = '${secret()}';`, `const ${name} = hexToBytes('${secret()}', 32);`, `const ${name} = Buffer.from('${secret()}', 'hex');`]) {
      assert.equal(detectLine(line).filter((row) => row.rule === 'HEX_SECRET').length, 1, `name category ${name}`);
    }
  }
  for (const name of ['publicKey', 'sign_pk', 'manifest_hash', 'secret_hash', 'root', 'fingerprint', 'signature', 'checksum', 'leafDigest']) {
    assert.deepEqual(detectLine(`${name} = '${secret()}'`), [], name);
  }
  assert.deepEqual(detectLine(`seed = '${secret()}00'`), []);
});

test('split-line decoder literals retain their value line and history sees unchanged declaration context', (t) => {
  const root = repo(t, { 'key.ts': `const seed = hexToBytes(\n  '${secret()}', 32);\n` });
  const current = run(root);
  assert.equal(current.code, 1); assert.equal(current.report.findings[0].line, 2);
  write(root, 'key.ts', "const seed = hexToBytes(\n  'placeholder', 32);\n"); commit(root);
  write(root, 'key.ts', `const seed = hexToBytes(\n  '${secret()}', 32);\n`); const added = commit(root);
  rmSync(join(root, 'key.ts')); commit(root);
  const history = run(root, '--history');
  assert.equal(history.code, 1);
  assert.ok(history.report.findings.some((row) => row.commit === added && row.line === 2 && row.rule === 'HEX_SECRET'));
});

test('a newly secret assignment name is detected when its literal is unchanged hunk context', (t) => {
  const root = repo(t, { 'key.ts': `const publicKey =\n  '${secret()}';\n` }); commit(root);
  write(root, 'key.ts', `const secretKey =\n  '${secret()}';\n`); const changed = commit(root);
  const result = run(root, '--history');
  assert.equal(result.code, 1); assert.ok(result.report.findings.some((row) => row.commit === changed && row.line === 2));
});

test('exact fixture exception does not permit changed value or changed path', (t) => {
  const path = 'test-vectors/fixed.json', root = repo(t, { [path]: JSON.stringify({ seed: secret() }) });
  allow(root, [fixtureException(path)]);
  assert.equal(run(root).code, 0);
  write(root, path, JSON.stringify({ seed: '34'.repeat(32) }));
  assert.equal(run(root).code, 1);
  write(root, path, JSON.stringify({ seed: secret() }));
  renameSync(join(root, path), join(root, 'test-vectors/copied.json'));
  assert.equal(run(root).code, 1);
});

test('allowlist rejects wildcard, unknown keys, duplicate tuples and unbound non-hex exceptions', () => {
  const entry = fixtureException('tests/fixed.json');
  for (const entries of [[{ ...entry, path: 'tests/*' }], [{ ...entry, prefix: true }], [entry, entry], [{ ...entry, rule: 'TOKEN_PREFIX' }], [{ ...entry, commit: 'HEAD' }]]) {
    assert.throws(() => validateAllowlist({ version: 1, entries }), { message: 'ALLOWLIST_INVALID' });
  }
  assert.equal(validateAllowlist({ version: 1, entries: [{ ...entry, rule: 'TOKEN_PREFIX', commit: 'a'.repeat(40) }] }).length, 1);
});

test('a commit-bound exception cannot suppress a present-tree token', (t) => {
  const path = 'tests/fixed.txt', root = repo(t, { [path]: token() });
  allow(root, [{ path, rule: 'TOKEN_PREFIX', sha256: valueHash(token()), commit: 'a'.repeat(40), reason: 'Historical synthetic token, exact immutable commit only.' }]);
  assert.equal(run(root).code, 1);
});

test('binary files and symlinks are explicitly reported without following links', (t) => {
  const root = repo(t, { 'asset.bin': Buffer.from([0, 255, 1]), 'ordinary.txt': 'text\n' });
  if (process.platform !== 'win32') symlinkSync('ordinary.txt', join(root, 'linked.txt'));
  const result = run(root);
  assert.equal(result.code, 0);
  assert.ok(result.report.excluded.some((row) => row.path === 'asset.bin' && row.reason === 'binary_nul'));
  if (process.platform !== 'win32') assert.ok(result.report.excluded.some((row) => row.path === 'linked.txt' && row.reason === 'symlink'));
});

test('missing tracked files, invalid text and bounds refuse an incomplete pass', (t) => {
  const root = repo(t, { 'tracked.txt': 'fine\n' });
  git(root, ['add', 'tracked.txt']); rmSync(join(root, 'tracked.txt'));
  const missing = run(root);
  assert.equal(missing.code, 2); assert.equal(missing.report.complete, false); assert.equal(missing.report.error.code, 'READ_FAILED');
  write(root, 'tracked.txt', Buffer.from([255]));
  assert.equal(run(root).report.error.code, 'TEXT_ENCODING');
  write(root, 'tracked.txt', 'x'.repeat(100));
  assert.throws(() => scanTree(root, [], { ...LIMITS, lineBytes: 20 }), { message: 'LINE_LIMIT' });
  assert.throws(() => scanTree(root, [], { ...LIMITS, fileBytes: 20 }), { message: 'FILE_LIMIT' });
});

test('tracked files and the allowlist replaced by a FIFO refuse without waiting for a writer', { skip: process.platform === 'win32' }, (t) => {
  for (const path of ['tracked.txt', 'scripts/secret-scan-allowlist.json']) {
    const root = repo(t, { 'tracked.txt': 'ordinary tracked text\n' });
    git(root, ['add', path]);
    rmSync(join(root, path));
    const fifo = spawnSync('mkfifo', [join(root, path)], { encoding: 'utf8', timeout: 5_000 });
    assert.equal(fifo.error, undefined, 'FIFO fixture creation must finish');
    assert.equal(fifo.status, 0, 'FIFO fixture creation must succeed');
    const result = spawnSync(process.execPath, [scanner, '--root', root, '--json'], {
      encoding: 'utf8', timeout: 3_000, maxBuffer: 64 * 1024,
    });
    assert.equal(result.error, undefined, 'nonregular input must be refused before any blocking read');
    assert.equal(result.status, 2);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.complete, false);
    assert.equal(report.error.code, path === 'tracked.txt' ? 'NOT_REGULAR_FILE' : 'ALLOWLIST_INVALID');
  }
});

test('CLI and Git failures report fixed codes without echoing untrusted arguments or diagnostics', (t) => {
  const root = repo(t), value = token();
  const badArg = run(root, '--' + value);
  assert.equal(badArg.code, 2); assert.equal(badArg.report.error.code, 'USAGE'); assert.ok(!badArg.raw.includes(value));
  write(root, '.git/config', '[' + value + '\n');
  const badGit = run(root);
  assert.equal(badGit.code, 2); assert.equal(badGit.report.error.code, 'GIT_FAILED'); assert.ok(!badGit.raw.includes(value));
});

function commit(root, message = 'fixture') { git(root, ['add', '-A']); git(root, ['commit', '-qm', message]); return git(root, ['rev-parse', 'HEAD']); }

test('history retains a deleted token on a merged side branch after that branch is deleted', (t) => {
  const root = repo(t, { 'readme.txt': 'clean\n' }); commit(root);
  const main = git(root, ['branch', '--show-current']);
  git(root, ['checkout', '-qb', 'side']);
  write(root, 'tests/deleted.txt', token()); const introduced = commit(root);
  rmSync(join(root, 'tests/deleted.txt')); commit(root);
  git(root, ['checkout', '-q', main]); git(root, ['merge', '--no-ff', '-qm', 'merge fixture', 'side']); git(root, ['branch', '-D', 'side']);
  assert.equal(run(root).code, 0);
  const result = run(root, '--history');
  assert.equal(result.code, 1);
  assert.ok(result.report.findings.some((row) => row.path === 'tests/deleted.txt' && row.commit === introduced));
  assert.ok(!result.raw.includes(token()));
  assert.equal(run(root, '--history').raw, result.raw);
});

test('history covers branch-only, remote-only and tag-only commits while excluding tree checkpoint refs', (t) => {
  const root = repo(t, { 'readme.txt': 'clean\n' }); commit(root);
  const main = git(root, ['branch', '--show-current']), expected = [];
  for (const kind of ['branch', 'remote', 'tag']) {
    git(root, ['checkout', '--orphan', `isolated-${kind}`, main]);
    write(root, `${kind}.txt`, token()); expected.push(commit(root));
    git(root, ['checkout', '-q', main]);
    if (kind !== 'branch') {
      git(root, ['update-ref', kind === 'remote' ? 'refs/remotes/fixture/only' : 'refs/tags/fixture-only', expected.at(-1)]);
      git(root, ['branch', '-D', `isolated-${kind}`]);
    }
  }
  git(root, ['update-ref', 'refs/checkpoints/local-tree', git(root, ['rev-parse', 'HEAD^{tree}'])]);
  const result = run(root, '--history');
  assert.equal(result.code, 1);
  for (const id of expected) assert.ok(result.report.findings.some((row) => row.commit === id));
});

test('Git quoted paths and hunk line numbers survive real history scans', (t) => {
  const names = process.platform === 'win32' ? ['with space.txt', 'unicode-é.txt'] : ['with space.txt', 'with\ttab.txt', 'with\nline.txt', 'quote"name.txt', 'unicode-é.txt'];
  const root = repo(t); for (const name of names) write(root, name, `first\nsecond\n${token()}\n`);
  commit(root);
  const result = run(root, '--history');
  assert.equal(result.code, 1);
  assert.deepEqual(result.report.findings.map((row) => row.path).sort(), names.sort());
  assert.ok(result.report.findings.every((row) => row.line === 3));
  assert.equal(decodeGitPath('"a/caf\\303\\251.txt"'), 'a/café.txt');
  assert.throws(() => decodeGitPath('"a/bad\\777.txt"'), { message: 'GIT_PATH' });
  assert.throws(() => decodeGitPath('"a/bad\\q.txt"'), { message: 'GIT_PATH' });
});

test('non-hex historical exceptions require the exact immutable introducing commit', (t) => {
  const path = 'tests/history.txt', root = repo(t, { [path]: token() }); const first = commit(root);
  rmSync(join(root, path)); commit(root);
  allow(root, [{ path, rule: 'TOKEN_PREFIX', sha256: valueHash(token()), commit: first, reason: 'Synthetic token in the exact historical fixture commit.' }]);
  assert.equal(run(root, '--history').code, 0);
  write(root, path, token()); const second = commit(root);
  const result = run(root, '--history');
  assert.equal(result.code, 1); assert.ok(result.report.findings.some((row) => row.commit === second));
});

test('a shallow repository refuses history scanning', (t) => {
  const root = repo(t, { 'readme.txt': 'clean\n' }); commit(root); write(root, 'next.txt', 'also clean'); commit(root);
  const shallow = mkdtempSync(join(tmpdir(), 'qv-secret-shallow-'));
  t.after(() => rmSync(shallow, { recursive: true, force: true }));
  git(root, ['clone', '--quiet', '--no-local', '--depth=1', root, shallow]);
  const result = run(shallow, '--history');
  assert.equal(result.code, 2); assert.equal(result.report.error.code, 'SHALLOW_HISTORY'); assert.equal(result.report.complete, false);
});

test('history reports binary exclusions and handles empty files and missing final newlines', (t) => {
  const root = repo(t, { 'asset.bin': Buffer.from([0, 255, 1]), 'empty.txt': '', 'no-final-newline.txt': token() }); commit(root);
  const result = run(root, '--history');
  assert.equal(result.code, 1);
  assert.ok(result.report.excluded.some((row) => row.path === 'asset.bin' && row.reason === 'binary_nul'));
  assert.ok(result.report.findings.some((row) => row.path === 'no-final-newline.txt' && row.line === 1));
});

test('a Git binary attribute cannot hide a subsequently deleted plaintext token', (t) => {
  const root = repo(t, { '.gitattributes': 'hidden.txt -diff\n', 'hidden.txt': token() }); commit(root);
  rmSync(join(root, 'hidden.txt')); commit(root);
  const result = run(root, '--history');
  assert.equal(result.code, 1);
  assert.ok(result.report.findings.some((row) => row.path === 'hidden.txt'));
  assert.ok(!result.report.excluded.some((row) => row.path === 'hidden.txt'));
  assert.ok(!result.raw.includes(token()));
});

test('malformed or truncated patches, unknown formats and bounds cannot yield a partial pass', async (t) => {
  const header = `\0QV-SCAN:${'a'.repeat(40)}\0\ndiff --git a/file.txt b/file.txt\n--- /dev/null\n+++ b/file.txt\n`;
  const patch = header + `@@ -0,0 +1 @@\n+${token()}\n`;
  assert.equal(parseHistory(patch).status, 'fail');
  assert.throws(() => parseHistory(header + '@@ -0,0 +1,2 @@\n+only one\n'), { message: 'GIT_TRUNCATED' });
  assert.throws(() => parseHistory(header + 'unrecognized patch format\n'), { message: 'GIT_FORMAT' });
  assert.throws(() => parseHistory(patch, [], { ...LIMITS, totalBytes: 10 }), { message: 'INPUT_LIMIT' });
  assert.throws(() => parseHistory(patch, [], { ...LIMITS, findings: 0 }), { message: 'FINDING_LIMIT' });
  const root = repo(t, { 'readme.txt': 'clean\n' }); commit(root);
  await assert.rejects(scanHistory(root, [], { ...LIMITS, totalBytes: 10 }), { message: 'INPUT_LIMIT' });
});

test('dedicated workflow gates docs-only PRs and scans full history nightly without privileged events or dependencies', () => {
  const workflow = readFileSync(new URL('../.github/workflows/secret-scan.yml', import.meta.url), 'utf8');
  const events = workflow.split(/^on:\n/m)[1]?.split(/^\S/m)[0];
  assert.ok(events);
  for (const event of ['pull_request', 'push', 'merge_group', 'schedule', 'workflow_dispatch']) assert.match(events, new RegExp('^  ' + event + ':$', 'm'));
  assert.doesNotMatch(workflow, /paths(?:-ignore)?:|pull_request_target|continue-on-error|npm (?:ci|install)|secrets\./);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.match(workflow, /^          fetch-depth: 0$/m);
  assert.match(workflow, /^        run: node scripts\/secret-scan\.mjs --json$/m);
  assert.match(workflow, /^        if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'$/m);
  assert.match(workflow, /^        run: node scripts\/secret-scan\.mjs --history --json$/m);
  const actions = [...workflow.matchAll(/uses: ([^\s]+)/g)].map((match) => match[1]);
  assert.equal(actions.length, 2);
  for (const action of actions) assert.match(action, /^actions\/(?:checkout|setup-node)@[a-f0-9]{40}$/);
});
