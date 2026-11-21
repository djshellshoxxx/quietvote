import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { receiptToJson, signPromise, signCheckpoint } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { LOGK, qv, spawnQv, tmp, writeJson } from './helpers.ts';

test('verify-receipt distinguishes a signed promise from inclusion and binds external anchors', async () => {
  const dir = tmp();
  try {
    const origin = 'quietvote/v1/abcdefghijklmnopqrstuvwxyz';
    const hash = new Uint8Array(32).fill(7);
    const signed = signPromise(LOGK.secretKey, origin, 0, hash, 1800000000);
    signed.inclusion = { treeSize: 1, path: [], checkpointNote: signCheckpoint(origin, 1, hash, LOGK.secretKey, LOGK.publicKey) };
    const receipt = receiptToJson(signed);
    const path = writeJson(dir, 'receipt.json', receipt);
    const leaf = Buffer.from(receipt.leaf_hash, 'base64').toString('hex');
    const args = ['verify-receipt', path, '--log-key', bytesToHex(LOGK.publicKey), '--origin', receipt.origin, '--leaf-hash', leaf, '--json'];
    const good = await qv(args);
    assert.equal(good.code, 0, good.err);
    assert.equal(JSON.parse(good.out).inclusion, 'VERIFIED');
    assert.equal(spawnQv(args).code, 0);
    for (const [flag, bad] of [['--log-key', '11'.repeat(32)], ['--origin', 'quietvote/v1/wrong'], ['--leaf-hash', '22'.repeat(32)]]) {
      const changed = [...args]; changed[changed.indexOf(flag!) + 1] = bad!;
      assert.equal((await qv(changed)).code, 1);
    }
    const invalidProof = structuredClone(receipt);
    invalidProof.inclusion!.path = [Buffer.alloc(32).toString('base64')];
    writeJson(dir, 'receipt.json', invalidProof);
    assert.equal((await qv(args)).code, 1);
    const promise = signPromise(LOGK.secretKey, receipt.origin, receipt.seq, Buffer.from(leaf, 'hex'), receipt.sequenced_at);
    writeJson(dir, 'receipt.json', receiptToJson(promise));
    const pending = await qv(args);
    assert.equal(pending.code, 3, pending.err);
    assert.equal(JSON.parse(pending.out).inclusion, 'INCOMPLETE');
    const mutated = receiptToJson(promise); mutated.promise_sig = Buffer.alloc(64).toString('base64');
    writeJson(dir, 'receipt.json', mutated);
    assert.equal((await qv(args)).code, 1);
    writeJson(dir, 'receipt.json', null);
    assert.equal((await qv(args)).code, 4);
    assert.equal((await qv(['verify-receipt', path])).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
