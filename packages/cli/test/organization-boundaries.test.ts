// @verifies QV-08-REQ-019
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { bytesToHex } from '@quietvote/crypto';
import { World } from '../../server/test/helpers/world.ts';
import { qv, writePrivateFixture, writePrivateJson } from './helpers.ts';

test('organization CLI preserves maximum-length multibyte inputs and refuses a second organization for the same owner', async () => {
  const name = 'é'.repeat(120), token = '密'.repeat(200);
  const w = new World({ seed: 'cli-organization-boundary-review', n: 3, t: 2, voters: 1,
    server: { registrationMode: 'token', registrationTokens: [token] } });
  w.clock = Date.now();
  await w.start();
  try {
    const key = writePrivateJson(w.dir, 'owner.key', { format: 'qv-voter-key/v1',
      public_key: bytesToHex(w.owner.publicKey), seed: bytesToHex(w.owner.secretKey) });
    const tokenFile = join(w.dir, 'registration-token.txt');
    writePrivateFixture(tokenFile, token);
    const auth = ['--server', w.base, '--audience', w.audience, '--key', key, '--json'];
    const create = ['online', 'org-create', ...auth, '--name', name, '--registration-token-file', tokenFile,
      '--idempotency-key', 'organization-boundary-first'];
    const invoke = (argv: string[]) => qv(argv, { rng: w.rng });
    const first = await invoke(create);
    assert.equal(first.code, 0, first.err);
    const organization = JSON.parse(first.out) as { org_id: string; name: string };
    assert.equal(organization.name, name, 'name spelling survives UTF-8 request and response encoding');
    assert.equal((first.out + first.err).includes(token), false);

    const duplicate = await invoke(create.map(value => value === 'organization-boundary-first'
      ? 'organization-boundary-second' : value));
    assert.equal(duplicate.code, 1, 'a new idempotency key cannot register the same owner again');
    assert.equal(duplicate.out, '');

    const replay = await invoke(create);
    assert.equal(replay.code, 0, replay.err);
    assert.equal((JSON.parse(replay.out) as { org_id: string }).org_id, organization.org_id);
    const inspect = await invoke(['online', 'org-inspect', ...auth, '--org', organization.org_id]);
    assert.equal(inspect.code, 0, inspect.err);
    assert.equal((JSON.parse(inspect.out) as { name: string }).name, name);
    assert.equal((replay.out + replay.err + inspect.out + inspect.err).includes(token), false);
  } finally { await w.stop(); }
});
