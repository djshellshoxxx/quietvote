// QV-ADR-027 N-20 (D-84): QV-08 `QV-Sig` signed requests are the only organizer/admin authentication. The QV-09 challenge/session
// bearer (`/auth/challenge`, `/auth/session`, `Authorization: Bearer qvs_…`) is retired, so the client has no code for it and no
// request it makes ever carries a bearer credential.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { sha256, utf8 } from '@quietvote/crypto';
import { ApiClient } from '../src/api/client.ts';
import { createSigner } from '../src/key/signer.ts';

const SRC = join(import.meta.dirname, '..', 'src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('N-20: the API client exposes no session/challenge methods', () => {
  const proto = ApiClient.prototype as unknown as Record<string, unknown>;
  for (const m of ['authChallenge', 'authSession', 'setSessionToken']) assert.equal(proto[m], undefined, m);
});

test('N-20: web sources never call /auth/* nor build a Bearer header', () => {
  for (const f of files(SRC)) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/\/auth\/(challenge|session)/.test(s), `${f} references a retired /auth route`);
    assert.ok(!/Bearer\s*\$\{|['"`]Bearer /.test(s), `${f} builds a bearer credential`);
  }
});

test('N-20: unsigned calls carry no Authorization; management calls carry QV-Sig only', async () => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const signer = await createSigner(sha256(utf8('n20-organizer')), { preferWebCrypto: false });
  try {
    const api = new ApiClient({
      baseUrl: 'https://board.example', sleep: async () => undefined,
      signing: { signer, audience: 'qv:inst@https://board.example', now: () => 1_800_000_000, nonce: () => new Uint8Array(16).fill(3) },
      fetch: async (url, init) => {
        seen.push({ url, auth: (init!.headers as Record<string, string>).Authorization });
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    await api.instance();
    await api.state('e1');
    await api.register('e1', { invite_code: 'x'.repeat(43), pk: 'y'.repeat(43), alg: 'ed25519', pop: 'z'.repeat(86) });
    await api.postEntry('e1', 'aGVhZA', 'Ym9keQ');
    await api.createElection('o1', 'T', 'idem-key-1');
    await api.putDraft('e1', {});
    await api.createInvites('e1', 1, 'idem-key-2');
    assert.equal(seen.length, 7);
    for (const r of seen.slice(0, 4)) assert.equal(r.auth, undefined, r.url);
    for (const r of seen.slice(4)) assert.match(r.auth ?? '', /^QV-Sig keyid=/, r.url);
    assert.ok(seen.every((r) => !r.url.includes('/auth/')));
  } finally {
    signer.lock();
  }
});
