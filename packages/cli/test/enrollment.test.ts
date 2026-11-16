import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex } from '@quietvote/crypto';
import { World, kp } from '../../server/test/helpers/world.ts';
import { qv, writeJson } from './helpers.ts';

test('shipped CLI enrolls with invite from file and preserves unknown-scheme refusal', async () => {
  const w = new World({ seed: 'cli-enrollment', n: 3, t: 2, voters: 0 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const invite = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(invite.status, 201);
    const code: string = invite.json.invites[0].code, key = kp('cli-enrollment', 'voter');
    const keyfile = writeJson(w.dir, 'enroll-key.json', { format: 'qv-voter-key/v1', seed: bytesToHex(key.secretKey), public_key: bytesToHex(key.publicKey) });
    const invitefile = join(w.dir, 'invite.txt'); writeFileSync(invitefile, code + '\n', { mode: 0o600 });
    const args = ['online', 'enroll', '--server', w.base, '--id', w.electionId, '--key', keyfile, '--invite-file', invitefile, '--json'];
    const result = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/qv.ts', import.meta.url)), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', (d) => out += d); child.stderr.on('data', (d) => err += d);
      child.on('error', reject); child.on('close', (code) => resolve({ code, out, err }));
    });
    assert.equal(result.code, 0, result.err); assert.equal(JSON.parse(result.out).status, 'approved');
    assert.ok(!result.out.includes(code) && !result.err.includes(code));
    const rt = (await w.server.pool.get(w.electionId))!; assert.equal(rt.edb.voterCount(), 1);
    const retry = await qv(args); assert.equal(retry.code, 0, retry.err); assert.equal(rt.edb.voterCount(), 1);
    rt.edb.db.exec("UPDATE election SET registration_scheme='legacy-raw-v1'");
    const refused = await qv(args.map((v) => v === invitefile ? join(w.dir, 'absent-secret-file') : v));
    assert.equal(refused.code, 1); assert.match(refused.err, /hashed-pop-v1/);
    assert.doesNotMatch(refused.err, /cannot read/); assert.equal(rt.edb.voterCount(), 1);
  } finally { await w.stop(); }
});
