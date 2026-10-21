// Adversarial tests from the web-verifier audit (docs/audit/web-verifier.md).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import { buildSite, csp, headersFile } from '../src/build/site.ts';
import { bindServerLog, deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { parseFragment, safeBoardOrigin } from '../src/flow/invite.ts';
import { allowedWorkerUrl } from '../src/worker/worker-sealer.ts';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';

test('WV-3: a malformed percent escape in the invite fragment cannot throw (crafted link must not break routing)', () => {
  assert.doesNotThrow(() => parseFragment('#board=%E0%A4%A'));
  assert.doesNotThrow(() => parseFragment('#board=%'));
  assert.equal(parseFragment('#board=%E0%A4%A').board, undefined);
  assert.equal(parseFragment('#board=https%3A%2F%2Fboard.example').board, 'https://board.example');
});

test('invite fragment: only well-formed tokens, read keys and https board origins are accepted', () => {
  assert.equal(parseFragment('#inv=short').token, undefined);
  assert.equal(parseFragment(`#inv=${b64uEncode(new Uint8Array(16).fill(7))}`).token?.length, 16);
  assert.equal(parseFragment('#read=<script>').readKey, undefined);
  for (const u of ['javascript:alert(1)', 'data:text/html,x', 'http://evil.example', 'https://u:p@evil.example', 'ftp://x', 'not a url']) {
    assert.equal(safeBoardOrigin(u), undefined, u);
  }
  assert.equal(safeBoardOrigin('https://board.example/path?q=1'), 'https://board.example');
  assert.equal(b64uDecode('a+b/'), undefined);
});

test('WV-4: the log key and origin must come from the signature-verified manifest, not from the server answer', async () => {
  const sim = await sharedSim();
  const board = new FakeBoard(sim);
  const api = new ApiClient({ fetch: board.fetch, sleep: async () => undefined });
  const el = await api.election(board.apiId);
  const all = await api.allEntries(board.apiId);
  const r = await deriveElectionContext(all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) })));
  assert.ok(r.ok);
  const m = r.value.manifest;
  const honest = bindServerLog(m, { logPkB64u: el.log_pk, origin: el.origin });
  assert.ok(honest.ok, honest.ok ? '' : honest.detail);
  // A server that substitutes its own log key (so it can mint receipts for ballots it drops) is rejected.
  const evilKey = b64uEncode(new Uint8Array(32).fill(9));
  const swapped = bindServerLog(m, { logPkB64u: evilKey, origin: el.origin });
  assert.equal(swapped.ok, false);
  const zero = bindServerLog(m, { logPkB64u: 'not-base64!', origin: el.origin });
  assert.equal(zero.ok, false);
  const wrongOrigin = bindServerLog(m, { logPkB64u: el.log_pk, origin: 'quietvote/v1/other' });
  assert.equal(wrongOrigin.ok, false);
});

test('WV-5: CSP origins are validated: no directive injection through connect origins', () => {
  for (const bad of [
    "https://a.example; script-src-elem *", 'https://a.example" onload="x', "https://a.example 'unsafe-inline'", '*', 'http://a.example',
    'https://a.example/path', 'javascript:', 'https://', 'https://a.example\nX: y',
  ]) {
    assert.throws(() => csp([bad]), /origin/i, bad);
    assert.throws(() => headersFile([bad]), /origin/i, bad);
  }
  assert.ok(csp(['https://board.example', 'https://b.example:8443', 'http://localhost:8080']).header.includes('https://b.example:8443'));
});

test('WV-5: build rejects a hostile connect origin before writing any page', async () => {
  const d = mkdtempSync(join(tmpdir(), 'qvS-'));
  await assert.rejects(buildSite(d, { connectOrigins: ['https://x.example; script-src *'] }), /origin/i);
});

test('verifier.html: inline script cannot break out of its element (no </script, <script or <!-- in script text)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'qvV2-'));
  await buildSite(d);
  const html = readFileSync(join(d, 'verifier.html'), 'utf8');
  const script = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)![1]!;
  assert.ok(!/<\/script/i.test(script) && !/<script/i.test(script) && !script.includes('<!--'), 'script text is HTML-parser safe');
});

test('built assets: no network sinks to foreign hosts, no localStorage/sessionStorage/cookie use, no sourcemaps', async () => {
  const d = mkdtempSync(join(tmpdir(), 'qvA2-'));
  await buildSite(d);
  for (const f of readdirSync(join(d, 'assets'))) {
    assert.ok(!f.endsWith('.map'), f);
    if (!f.endsWith('.js')) continue;
    const js = readFileSync(join(d, 'assets', f), 'utf8');
    assert.ok(!/document\.cookie|localStorage|sessionStorage|sendBeacon|XMLHttpRequest|WebSocket|importScripts/.test(js), `${f} uses a banned browser API`);
  }
});

test('worker URL policy admits only same-origin /assets/*.js', () => {
  const o = 'https://vote.example';
  assert.ok(allowedWorkerUrl('/assets/seal-worker.abc123.js', o));
  for (const u of ['https://evil.example/assets/x.js', '/assets/../x.js', '/other/x.js', '/assets/x.html', 'data:text/javascript,1', 'blob:https://vote.example/1', '//evil.example/assets/x.js']) {
    assert.equal(allowedWorkerUrl(u, o), false, u);
  }
});

test('source lint: no secret-bearing console logging in src (seed, passphrase, token, xi, nonce key)', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const src = join(import.meta.dirname, '..', 'src');
  for (const f of walk(src).filter((x) => x.endsWith('.ts') && !x.includes('/build/'))) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/console\.(log|info|debug|warn|error)/.test(text), `${f}: console output in browser code`);
  }
});
