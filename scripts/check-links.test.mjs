// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for scripts/check-links.mjs against temporary repository fixtures. No repository files are changed.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { slugify } from './check-links.mjs';

const checker = resolve(import.meta.dirname, 'check-links.mjs');

function run(files, ...args) {
  const root = mkdtempSync(join(tmpdir(), 'qv-check-links-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const result = spawnSync(process.execPath, [checker, '--root', root, ...args], { encoding: 'utf8' });
    assert.equal(result.error, undefined, result.error?.message);
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('clean tree passes: file, directory, fragment, image and root-absolute links', () => {
  const result = run({
    'README.md': '# Title\n\n[a](docs/a.md) [dir](docs/) [frag](docs/a.md#second-heading) ![img](docs/pic.png) [root](/docs/a.md)\n[self](#title)\n',
    'docs/a.md': '# A\n\n## Second heading\n\n[up](../README.md#title)\n',
    'docs/pic.png': 'x',
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /none broken/);
});

test('broken file link is reported as file:line -> target', () => {
  const result = run({ 'README.md': 'ok\n\nsee [missing](docs/missing.md)\n', 'docs/a.md': '# A\n' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3 -> docs\/missing\.md/);
});

test('links resolve relative to the linking file, not the repo root', () => {
  const result = run({ 'docs/sub/a.md': '[x](b.md) [y](../c.md)\n', 'docs/sub/b.md': '# B\n', 'docs/c.md': '# C\n', 'README.md': '# R\n' });
  assert.equal(result.code, 0, result.stderr);
  const bad = run({ 'docs/sub/a.md': '[x](docs/c.md)\n', 'docs/c.md': '# C\n' });
  assert.equal(bad.code, 1);
});

test('broken fragment is reported; GitHub slug rules and duplicate headings are honoured', () => {
  const files = {
    'docs/a.md': '# Title\n\n## 5.1 Dependency rules (enforced)\n\n## Same\n\n## Same\n\n## `code` & *Emph*: Q?\n',
    'README.md': [
      '[ok1](docs/a.md#51-dependency-rules-enforced)',
      '[ok2](docs/a.md#same-1)',
      '[ok3](docs/a.md#code--emph-q)',
      '[bad](docs/a.md#nope)',
      '[badself](#also-nope)',
      '',
    ].join('\n'),
  };
  const result = run(files, '--json');
  assert.equal(result.code, 1);
  const broken = JSON.parse(result.stdout).broken;
  assert.deepEqual(broken.map((b) => `${b.line}:${b.target}`), ['4:docs/a.md#nope', '5:#also-nope']);
  assert.equal(slugify('5.1 Dependency rules (enforced)'), '51-dependency-rules-enforced');
});

test('explicit <a id> anchors and line anchors on source files are accepted', () => {
  const result = run({
    'README.md': '[x](docs/a.md#custom) [y](src/x.ts#L10-L20)\n',
    'docs/a.md': '# A\n\n<a id="custom"></a>\n',
    'src/x.ts': 'x\n',
  });
  assert.equal(result.code, 0, result.stderr);
});

test('links inside fenced code blocks and inline code are ignored', () => {
  const result = run({
    'README.md': [
      '```md',
      '[nope](missing-1.md)',
      '```',
      '~~~',
      '[nope](missing-2.md)',
      '~~~',
      'inline `[nope](missing-3.md)` code and ``[x](missing-4.md)`` too',
      '[real](missing-5.md)',
      '',
    ].join('\n'),
  }, '--json');
  const broken = JSON.parse(result.stdout).broken;
  assert.deepEqual(broken.map((b) => b.target), ['missing-5.md']);
  assert.equal(broken[0].line, 8);
});

test('a longer fence is not closed by a shorter one', () => {
  const result = run({ 'README.md': '````\n```\n[nope](missing.md)\n```\n````\n[ok](README.md)\n' });
  assert.equal(result.code, 0, result.stderr);
});

test('http(s) links are syntax-checked only and never fetched', () => {
  const ok = run({ 'README.md': '[a](https://example.invalid/never-fetched) <https://example.invalid/b> [m](mailto:a@example.invalid)\n' });
  assert.equal(ok.code, 0, ok.stderr);
  const bad = run({ 'README.md': '[a](https://)\n' });
  assert.equal(bad.code, 1);
});

test('reference-style definitions are checked; undefined array-style brackets are not flagged', () => {
  const result = run({ 'README.md': 'P[i][j] and [text][ref]\n\n[ref]: docs/missing.md\n[ok]: README.md\n' }, '--json');
  const broken = JSON.parse(result.stdout).broken;
  assert.deepEqual(broken.map((b) => `${b.line}:${b.target}`), ['3:docs/missing.md']);
});

test('wiki links [[Page Name]] resolve to Page-Name.md; fragments, display text and missing pages are handled', () => {
  const result = run({
    'wiki/Home.md': '# Home\n\n[[Voter Guide]] [[Read this|Voter Guide]] [[Voter Guide#faq]] [[voter guide]]\n',
    'wiki/Voter-Guide.md': '# Voter Guide\n\n## FAQ\n',
    'wiki/Other.md': '[[Missing Page]] [[Voter Guide#nope]] [tail](Voter-Guide) [bad](Nothing)\n',
  }, '--json');
  const broken = JSON.parse(result.stdout).broken;
  assert.deepEqual(broken.map((b) => b.target), ['Missing Page', 'Voter Guide#nope', 'Nothing']);
  assert.ok(broken.every((b) => b.file === 'wiki/Other.md'));
});

test('wiki link syntax in code fences is ignored', () => {
  const result = run({ 'wiki/Home.md': '# H\n\n```\n[[Page Name]]\n```\n' });
  assert.equal(result.code, 0, result.stderr);
});

test('only the specified Markdown locations are scanned', () => {
  const result = run({
    'README.md': '# R\n',
    'node_modules/x/README.md': '[bad](nope.md)\n',
    'src/notes.md': '[bad](nope.md)\n',
    'packages/p/NOTES.md': '[bad](nope.md)\n',
    'packages/p/sub/DEEP.md': '[bad](nope.md)\n',
    'test-vectors/v1/README.md': '[bad](nope.md)\n',
    'verifier-py/NOTES.md': '[bad](nope.md)\n',
  }, '--json');
  const files = JSON.parse(result.stdout).broken.map((b) => b.file).sort();
  assert.deepEqual(files, ['packages/p/NOTES.md', 'test-vectors/v1/README.md', 'verifier-py/NOTES.md']);
});

test('targets escaping the repository root and raw HTML href/src are checked', () => {
  const result = run({ 'README.md': '[x](../../etc/passwd) <a href="gone.md">g</a> <img src="gone.png">\n' }, '--json');
  const broken = JSON.parse(result.stdout).broken;
  assert.equal(broken.length, 3);
});

test('usage errors exit 2', () => {
  assert.equal(spawnSync(process.execPath, [checker, '--nope'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [checker, '--root', '/nonexistent-qv-dir'], { encoding: 'utf8' }).status, 2);
});
