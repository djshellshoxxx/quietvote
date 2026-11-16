// N-20 (QV-ADR-027): organizer/admin auth is QV-08 signed requests only. The QV-09 challenge/session bearer path is gone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import * as clientModule from '../src/api/client.ts';
import { createSigner } from '../src/key/signer.ts';

const here = (p: string): string => new URL(p, import.meta.url).pathname;

test('N-20: ApiClient has no session-token or challenge/session methods and no export with those names', () => {
  const proto = Object.getOwnPropertyNames(ApiClient.prototype);
  for (const n of ['setSessionToken', 'authChallenge', 'authSession']) assert.ok(!proto.includes(n), n);
  const inst = new ApiClient() as unknown as Record<string, unknown>;
  assert.ok(!('token' in inst));
  for (const n of ['Challenge', 'Session', 'setSessionToken', 'authChallenge', 'authSession']) assert.ok(!(n in clientModule), n);
  const types = readFileSync(here('../src/api/types.ts'), 'utf8');
  assert.ok(!/export\s+(interface|type)\s+(Challenge|Session)\b/.test(types), 'Challenge/Session types removed');
  assert.ok(!/Bearer/.test(readFileSync(here('../src/api/client.ts'), 'utf8')), 'no Bearer branch in the client');
});

test('N-20: no request ever carries an Authorization: Bearer header (reads, voter calls, signed calls)', async () => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const signer = await createSigner(new Uint8Array(32).fill(5));
  const api = new ApiClient({
    baseUrl: 'https://board.example', sleep: async () => undefined, readKey: 'rk',
    signing: { signer, audience: 'qv:inst@https://board.example' },
    fetch: async (url, init) => {
      seen.push({ url, auth: (init!.headers as Record<string, string>).Authorization });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await api.instance();
  await api.election('e1');
  await api.register('e1', {} as never);
  await api.postEntry('e1', 'h', 'b');
  await api.createElection('o1', 'T', 'key-abcdefgh');
  await api.putDraft('e1', {});
  await api.createInvites('e1', 1, 'key-abcdefgh');
  assert.equal(seen.length, 7);
  for (const s of seen) assert.ok(s.auth === undefined || /^QV-Sig /.test(s.auth), `${s.url}: ${s.auth}`);
  assert.equal(seen.filter((s) => s.auth !== undefined).length, 3, 'exactly the three management calls are signed');
});
