import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { buildEntry, hashLeaf, MerkleTree, signCheckpoint, verifyLog, type LogBundle } from '@quietvote/board';
import { ed25519Keypair, jcs } from '@quietvote/crypto';
import { runVerificationWorker, verifyLogOffThread } from '../src/imports.ts';

const worker = (src: string): Worker => new Worker(new URL(`data:text/javascript,${encodeURIComponent(src)}`));
for (const [name, src, rule] of [
  ['crash', 'throw new Error("synthetic crash")', 'PROTOCOL_VERIFY'],
  ['early exit', 'process.exit(0)', 'PROTOCOL_VERIFY'],
  ['timeout', 'for (;;) {}', 'IMPORT_TIMEOUT'],
] as const) {
  test(`verification worker ${name} settles only after termination`, async () => {
    const w = worker(src);
    await assert.rejects(runVerificationWorker(w, name === 'timeout' ? 10 : 10_000), { rule });
    assert.equal(w.threadId, -1);
  });
}
test('verification worker abort and successful result both wait for termination', async () => {
  const abort = new AbortController();
  const w = worker('for (;;) {}');
  const promise = runVerificationWorker(w, 10_000, abort.signal);
  const reason = new Error('synthetic cancellation');
  abort.abort(reason);
  await assert.rejects(promise, (e) => e === reason);
  assert.equal(w.threadId, -1);
  const success = worker('import { parentPort } from "node:worker_threads"; parentPort.postMessage({ok:true,result:42}); setInterval(() => {},1000);');
  assert.equal(await runVerificationWorker(success, 10_000), 42);
  assert.equal(success.threadId, -1);
});

test('board worker preserves complete reports, decoded bytes and author refusal', async () => {
  const key = ed25519Keypair(new Uint8Array(32).fill(7));
  const origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa';
  const entries = Array.from({ length: 32 }, (_, seq) => {
    const nonce = new Uint8Array(16); nonce[0] = seq;
    const e = buildEntry({ origin, type: seq === 0 ? 'manifest' : 'notice', ...key, nonce, createdAt: 0, body: jcs({ synthetic: seq }) });
    return { seq, headerBytes: e.headerBytes, body: e.body };
  });
  const policy = { logPublicKey: key.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } };
  const base: LogBundle = { format: 'qv-bundle/v1', spec: 'QV-18', origin, createdAt: 0, generator: 'synthetic',
    treeSize: entries.length, root: MerkleTree.fromLeafHashes(entries.map((e) => hashLeaf(e.headerBytes))).root(),
    entries, policy, checkpoints: [], receipts: [], redactions: [] };
  base.checkpoints.push(signCheckpoint(origin, entries.length, base.root, key.secretKey, key.publicKey));
  for (const mutation of ['unchanged', 'body', 'author', 'signature', 'checkpoint'] as const) {
    const bundle = structuredClone(base);
    if (mutation === 'body') bundle.entries[1]!.body![0] = bundle.entries[1]!.body![0]! ^ 1;
    if (mutation === 'signature') {
      const h = bundle.entries[1]!.headerBytes; h[h.length - 1] = h[h.length - 1]! ^ 1;
    }
    if (mutation === 'checkpoint') bundle.checkpoints.push('malformed checkpoint');
    const keys = bundle.entries.map(() => mutation === 'author' ? undefined : key.publicKey);
    const expected = verifyLog(bundle, { ...policy, resolveAuthorKey: (_h, seq) => keys[seq] });
    if (mutation === 'unchanged') assert.equal(expected.integrity, 'VERIFIED');
    else assert.equal(expected.integrity, 'FAILED');
    const bytes = structuredClone(bundle.entries);
    const buffer = bundle.entries[0]!.headerBytes.buffer;
    const pending = verifyLogOffThread({ kind: 'log', bundle, ...policy, authorKeys: keys }, 30_000);
    assert.equal(buffer.byteLength, 0, 'decoded entries move to the worker without a byte copy');
    assert.deepEqual(await pending, expected);
    assert.deepEqual(bundle.entries, bytes, 'entries return intact for exact protocol correspondence and publication');
    if (mutation === 'author') assert.ok(expected.failures.some((f) => f.rule === 'QV_BOARD_AUTHOR_UNRESOLVED'));
  }
});
