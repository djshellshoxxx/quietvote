import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TargetRejected, httpsTransport, isPublicIp, parseTargetUrl, validateTarget, type Resolved } from '../src/ssrf.ts';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    if (e instanceof TargetRejected) return e.code;
    throw e;
  }
  return 'OK';
};
const acode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof TargetRejected) return e.code;
    throw e;
  }
  return 'OK';
};

test('isPublicIp: blocked IPv4 ranges', () => {
  for (const ip of [
    '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.255.255.254', '169.254.169.254', '169.254.0.1',
    '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.5', '192.168.0.1', '192.168.255.255', '198.18.0.1', '198.19.255.255', '198.51.100.7',
    '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
  ]) assert.equal(isPublicIp(ip), false, ip);
});

test('isPublicIp: public IPv4 addresses next to blocked ranges are allowed', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '9.255.255.255', '11.0.0.1', '100.63.255.255', '100.128.0.1', '126.255.255.255', '128.0.0.1', '169.253.255.255', '169.255.0.1', '172.15.255.255', '172.32.0.1', '192.167.255.255', '192.169.0.1', '198.17.255.255', '198.20.0.1', '223.255.255.255'])
    assert.equal(isPublicIp(ip), true, ip);
});

test('isPublicIp: IPv6 loopback, unspecified, ULA, link-local, multicast, mapped, NAT64, 6to4, Teredo, documentation', () => {
  for (const ip of [
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'fec0::1', 'ff02::1', 'ff00::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.1.2.3',
    '::ffff:169.254.169.254', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b::a00:1', '64:ff9b:1::1', '2002:7f00:1::1', '2002:a9fe:a9fe::1', '2001::1', '2001:db8::1',
    '2001:10::1', '2001:2::1', '100::1', '3fff::1', '0:0:0:0:0:0:0:1', '1::1',
  ]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) assert.equal(isPublicIp(ip), true, ip);
});

test('isPublicIp: garbage is never public', () => {
  for (const ip of ['', 'localhost', '256.1.1.1', '1.2.3', '1.2.3.4.5', '01.02.03.04x', '::g', ':::', '1:2:3:4:5:6:7:8:9', 'example.com', '[::1]']) assert.equal(isPublicIp(ip), false, ip);
});

test('parseTargetUrl: scheme, credentials, port, length and shape', () => {
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com/qv')), 'OK');
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com:8443/qv?x=1')), 'OK');
  assert.equal(code(() => parseTargetUrl('http://hooks.example.com/')), 'URL_NOT_HTTPS');
  assert.equal(code(() => parseTargetUrl('ftp://hooks.example.com/')), 'URL_NOT_HTTPS');
  assert.equal(code(() => parseTargetUrl('file:///etc/passwd')), 'URL_NOT_HTTPS');
  assert.equal(code(() => parseTargetUrl('javascript:alert(1)')), 'URL_NOT_HTTPS');
  assert.equal(code(() => parseTargetUrl('https://user:pw@hooks.example.com/')), 'URL_CREDENTIALS');
  assert.equal(code(() => parseTargetUrl('https://user@hooks.example.com/')), 'URL_CREDENTIALS');
  for (const p of [22, 25, 80, 3306, 5432, 6379, 8080, 9200, 65535]) assert.equal(code(() => parseTargetUrl(`https://hooks.example.com:${p}/`)), 'URL_PORT', String(p));
  assert.equal(code(() => parseTargetUrl('')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('not a url')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com/' + 'a'.repeat(2100))), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com/a b')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com\\@127.0.0.1/')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://hooks.example.com/\r\nHost: evil')), 'URL_INVALID');
});

test('parseTargetUrl: IP literals in every spelling are canonicalised and blocked', () => {
  for (const u of [
    'https://127.0.0.1/', 'https://127.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://0x7f.0.0.1/', 'https://017700000001/', 'https://0177.0.0.1/',
    'https://10.0.0.1/', 'https://169.254.169.254/latest/meta-data/', 'https://192.168.1.1:8443/', 'https://0.0.0.0/', 'https://[::1]/', 'https://[::]/',
    'https://[::ffff:127.0.0.1]/', 'https://[::ffff:7f00:1]/', 'https://[fe80::1]/', 'https://[fd00::1]/', 'https://[0:0:0:0:0:ffff:a00:1]/', 'https://100.64.0.1/',
  ]) assert.equal(code(() => parseTargetUrl(u)), 'TARGET_BLOCKED', u);
  // public literals are acceptable (the certificate must still match, which an IP rarely does)
  assert.equal(code(() => parseTargetUrl('https://8.8.8.8/')), 'OK');
  assert.equal(code(() => parseTargetUrl('https://[2606:4700:4700::1111]/')), 'OK');
});

test('parseTargetUrl: local-looking names are blocked without DNS', () => {
  for (const h of ['localhost', 'LOCALHOST', 'localhost.', 'foo.localhost', 'printer.local', 'db.internal', 'nas.lan', 'x.home.arpa', 'intranet', 'metadata', 'a.b.localdomain', 'evil.onion'])
    assert.equal(code(() => parseTargetUrl(`https://${h}/`)), 'TARGET_BLOCKED', h);
});

test('parseTargetUrl: malformed numeric hosts are rejected by the URL parser', () => {
  assert.equal(code(() => parseTargetUrl('https://1.2.3.999/')), 'URL_INVALID');
  assert.equal(code(() => parseTargetUrl('https://host.12345/')), 'URL_INVALID');
});

test('validateTarget: every resolved address must be public; mixed answers and resolver failures are rejected', async () => {
  const mk = (...addrs: string[]) => async (): Promise<Resolved[]> => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  const ok = await validateTarget('https://hooks.example.com/x', mk('93.184.216.34', '2606:2800:220:1::1'));
  assert.equal(ok.ip, '93.184.216.34');
  assert.equal(ok.family, 4);
  assert.equal(ok.port, 443);
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('10.0.0.5'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('127.0.0.1'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('169.254.169.254'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('::1'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('::ffff:10.0.0.1'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('93.184.216.34', '192.168.0.9'))), 'TARGET_BLOCKED'); // one bad record poisons the set
  assert.equal(await acode(validateTarget('https://a.example.com/', mk('2606:4700::1', 'fd00::5'))), 'TARGET_BLOCKED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk())), 'DNS_FAILED');
  assert.equal(await acode(validateTarget('https://a.example.com/', async () => { throw new Error('ENOTFOUND'); })), 'DNS_FAILED');
  assert.equal(await acode(validateTarget('https://a.example.com/', mk(...Array.from({ length: 40 }, (_, i) => `93.184.216.${i + 1}`)))), 'DNS_FAILED');
  // static rejections happen before any lookup
  let looked = 0;
  const spy = async (): Promise<Resolved[]> => (looked++, [{ address: '93.184.216.34', family: 4 }]);
  for (const u of ['http://a.example.com/', 'https://127.0.0.1/', 'https://localhost/', 'https://a.example.com:22/', 'https://u:p@a.example.com/']) await acode(validateTarget(u, spy));
  assert.equal(looked, 0);
  // IP literals do not consult DNS either
  assert.equal((await validateTarget('https://8.8.8.8/', spy)).ip, '8.8.8.8');
  assert.equal(looked, 0);
});

// ---------------------------------------------------------------------------------------------- real TLS transport

let dir = '';
let cert = '';
let key = '';
let haveOpenssl = true;
let srv: Server | undefined;
let port = 0;
const hits: { url: string; method: string; headers: Record<string, string | string[] | undefined>; body: string }[] = [];
let mode: 'ok' | 'redirect' | 'hang' | 'big' | 'slowbody' = 'ok';

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'qv-tls-'));
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=pinned.example',
      '-addext', 'subjectAltName=DNS:pinned.example,DNS:localhost,IP:127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'),
    ], { stdio: 'ignore' });
  } catch {
    haveOpenssl = false;
    return;
  }
  cert = readFileSync(join(dir, 'c.pem'), 'utf8');
  key = readFileSync(join(dir, 'k.pem'), 'utf8');
  srv = createServer({ cert, key }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => {
      hits.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (mode === 'redirect') {
        res.writeHead(302, { Location: 'https://127.0.0.1:1/internal' });
        res.end();
      } else if (mode === 'hang') {
        /* never answer */
      } else if (mode === 'big') {
        res.writeHead(200, { 'Content-Length': String(5_000_000) });
        res.write(Buffer.alloc(100_000, 0x61));
        const t = setInterval(() => res.write(Buffer.alloc(100_000, 0x61)), 5);
        res.on('close', () => clearInterval(t));
      } else if (mode === 'slowbody') {
        res.writeHead(200);
        res.write('x');
        /* headers arrive, body never completes */
      } else {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      }
    });
  });
  await new Promise<void>((r) => srv!.listen(0, '127.0.0.1', r));
  port = (srv.address() as { port: number }).port;
});
after(async () => {
  srv?.closeAllConnections();
  await new Promise<void>((r) => (srv ? srv.close(() => r()) : r()));
  rmSync(dir, { recursive: true, force: true });
});

const baseReq = (host: string, extra: Record<string, unknown> = {}) => ({
  url: new URL(`https://${host}:${port}/hook?a=1`), ip: '127.0.0.1', family: 4 as const, headers: { 'Content-Type': 'application/json', 'QV-Webhook-Id': 'x' },
  body: Buffer.from('{"a":1}'), timeoutMs: 2000, maxResponseBytes: 1024, ...extra,
});

test('transport: POSTs to the pinned address, verifies the certificate against the URL host, sends SNI/Host of the URL', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'ok';
  hits.length = 0;
  const tr = httpsTransport({ ca: cert });
  // "pinned.example" does not resolve in DNS at all: success proves the connection used the supplied address, not a lookup
  const r = await tr(baseReq('pinned.example'));
  assert.deepEqual(r, { status: 200, truncated: false });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.method, 'POST');
  assert.equal(hits[0]!.url, '/hook?a=1');
  assert.equal(hits[0]!.body, '{"a":1}');
  assert.equal(hits[0]!.headers['host'], `pinned.example:${port}`);
  assert.equal(hits[0]!.headers['qv-webhook-id'], 'x');
  assert.equal(hits[0]!.headers['content-length'], '7');
});

test('transport: certificate for a different name is refused even though the pinned address answers', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  hits.length = 0;
  const tr = httpsTransport({ ca: cert });
  await assert.rejects(tr(baseReq('other.example')), /altname|certificate|Hostname|Host:/i);
  assert.equal(hits.length, 0);
});

test('transport: untrusted issuer is refused (no ca override)', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  hits.length = 0;
  await assert.rejects(httpsTransport()(baseReq('pinned.example')), /self[- ]signed|certificate|unable to verify/i);
  assert.equal(hits.length, 0);
});

test('transport: redirects are not followed; 3xx is reported as-is', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'redirect';
  hits.length = 0;
  const r = await httpsTransport({ ca: cert })(baseReq('pinned.example'));
  assert.equal(r.status, 302);
  assert.equal(hits.length, 1); // the Location (an internal address) was never requested
  mode = 'ok';
});

test('transport: a server that never answers is cut off at the deadline', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'hang';
  const t0 = Date.now();
  await assert.rejects(httpsTransport({ ca: cert })(baseReq('pinned.example', { timeoutMs: 250 })), /timeout/);
  assert.ok(Date.now() - t0 < 2000);
  mode = 'ok';
});

test('transport: headers arrive but the body stalls: deadline still applies', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'slowbody';
  const t0 = Date.now();
  const r = await httpsTransport({ ca: cert })(baseReq('pinned.example', { timeoutMs: 300 })).then((x) => x, (e: Error) => e);
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(r instanceof Error || (r as { status: number }).status === 200);
  mode = 'ok';
});

test('transport: oversized response is truncated after maxResponseBytes and the connection is dropped', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'big';
  const t0 = Date.now();
  const r = await httpsTransport({ ca: cert })(baseReq('pinned.example', { maxResponseBytes: 2048, timeoutMs: 5000 }));
  assert.equal(r.status, 200);
  assert.equal(r.truncated, true);
  assert.ok(Date.now() - t0 < 3000);
  mode = 'ok';
});

test('transport: maxResponseBytes 0 does not read the body at all', async (t) => {
  if (!haveOpenssl) return t.skip('openssl not available');
  mode = 'big';
  const r = await httpsTransport({ ca: cert })(baseReq('pinned.example', { maxResponseBytes: 0 }));
  assert.deepEqual(r, { status: 200, truncated: false });
  mode = 'ok';
});

test('transport: connection refused is an error, not a hang', async () => {
  const r = baseReq('pinned.example');
  r.url = new URL('https://pinned.example:1/');
  await assert.rejects(httpsTransport()(r));
});
