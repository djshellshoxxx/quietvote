import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import { bytesToHex } from '@quietvote/crypto';
import { NO_SUPERSEDES } from '@quietvote/protocol';
import { buildSite } from '../src/build/site.ts';
import { requestFor, sealBallot, type SealResponse } from '../src/flow/seal.ts';
import { sharedSim } from './helpers/fake-board.ts';

test('built module Worker resolves manifested shared assets and seals exactly like the source', { timeout: 15_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qv-built-worker-'));
  let worker: Worker | undefined;
  try {
    const built = await buildSite(dir);
    // Node exercises the actual emitted ES modules in a separate realm. The hosted browser journey independently checks CSP.
    await writeFile(join(dir, 'package.json'), '{"type":"module"}\n');
    const workerAsset = built.assets.find((asset) => /^seal-worker\.[0-9a-f]{12}\.js$/.test(basename(asset.path)));
    assert.ok(workerAsset, 'the actual hashed Worker entry is emitted');
    const workerSource = await readFile(join(dir, workerAsset.path), 'utf8');
    const imports = [...workerSource.matchAll(/(?:from|import)["']\.\/([^"']+)["']/g)].map((match) => match[1]!);
    assert.ok(imports.length > 0, 'the Worker shares emitted modules instead of embedding a second crypto implementation');
    for (const name of imports) {
      const asset = built.assets.find((entry) => entry.path === `assets/${name}`);
      assert.ok(asset, `shared Worker asset ${name} is in the manifest`);
      const bytes = await readFile(join(dir, asset.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assert.equal(createHash('sha384').update(bytes).digest('hex'), asset.sha384);
    }
    const bootstrap = `
      import { parentPort, workerData } from 'node:worker_threads';
      globalThis.self = {
        addEventListener(type, listener) {
          if (type !== 'message') throw new Error('unexpected Worker event');
          parentPort.on('message', data => listener({ data }));
        },
        postMessage(data) { parentPort.postMessage(data); }
      };
      await import(workerData);
      parentPort.postMessage('ready');
    `;
    worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`), {
      workerData: pathToFileURL(join(dir, workerAsset.path)).href,
    });
    assert.deepEqual(await once(worker, 'message'), ['ready']);
    const sim = await sharedSim();
    const request = requestFor(sim.params!, {
      voterPk: bytesToHex(sim.voters[0]!.publicKey), nonceKey: '11'.repeat(32),
      supersedes: NO_SUPERSEDES, selections: { budget: ['yes'], board: ['p', 'q'] },
      attempt: 1, rho: '22'.repeat(32),
    });
    const expected = sealBallot(request);
    assert.equal(expected.ok, true, 'source control seals a valid self-checked ballot');
    const received = once(worker, 'message');
    worker.postMessage(request);
    const [actual] = await received as [SealResponse];
    assert.deepEqual(actual, expected, 'compiled Worker preserves ciphertexts, proofs, code and secret randomness for identical inputs');
  } finally {
    await worker?.terminate();
    await rm(dir, { recursive: true, force: true });
  }
});
