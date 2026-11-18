// Bounded synthetic diagnostic; optional argv[2] selects a checkout for before/after measurements.
// Run sequentially on an otherwise quiet runner. RSS is whole-process high-water, not allocation attribution.
import { performance } from 'node:perf_hooks';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../../..', import.meta.url)));
const load = (path: string) => import(pathToFileURL(join(root, path)).href);
const { verifyBundle, verifyLogOffThread, commitImport } = await load('packages/server/src/imports.ts');
const { fullElection, exportQvb } = await load('packages/server/test/helpers/full.ts');
const { World } = await load('packages/server/test/helpers/world.ts');
const { buildEntry, hashLeaf, MerkleTree, signCheckpoint, verifyLog } = await load('packages/board/src/index.ts');
const { ed25519Keypair, jcs } = await load('packages/crypto/src/index.ts');
const measurement = async (run: () => Promise<unknown>) => {
  await new Promise<void>((r) => setImmediate(r));
  const start = performance.now(), elu = performance.eventLoopUtilization();
  let last = start, lag = 0;
  const timer = setInterval(() => { const now = performance.now(); lag = Math.max(lag, now - last - 5); last = now; }, 5);
  try {
    await run();
    const wallMs = performance.now() - start;
    await new Promise<void>((r) => setTimeout(r, 6));
    return { wallMs: +wallMs.toFixed(2), mainActiveMs: +performance.eventLoopUtilization(elu).active.toFixed(2),
      maxTimerLagMs: +lag.toFixed(2), processPeakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(2) };
  } finally { clearInterval(timer); }
};
const source = await fullElection('import-bench');
const target = new World({ seed: 'import-bench-target', n: 3, t: 2, voters: 1 });
try {
  await target.start(); await target.setupOrgAndElection();
  const tar = await exportQvb(source);
  const stages: unknown[] = [];
  let previous = performance.now(), previousElu = performance.eventLoopUtilization();
  let verified;
  const total = await measurement(async () => {
    previous = performance.now(); previousElu = performance.eventLoopUtilization();
    verified = await verifyBundle(target.server.env, tar, undefined, async () => { await new Promise<void>((r) => setImmediate(r)); }, (progress: number) => {
      const now = performance.now(), elu = performance.eventLoopUtilization();
      stages.push({ progress, wallMs: +(now - previous).toFixed(2), mainActiveMs: +(elu.active - previousElu.active).toFixed(2) });
      previous = now; previousElu = elu;
    });
  });
  const commit = await measurement(() => commitImport.length === 7
    ? commitImport(target.server.env, target.server.pool, verified, target.orgId, 'public', null, async () => { await new Promise<void>((r) => setImmediate(r)); })
    : commitImport(target.server.env, verified, target.orgId, 'public', null, async () => { await new Promise<void>((r) => setImmediate(r)); }));
  console.log(JSON.stringify({ commit, node: process.version, bytes: tar.length, pipeline: total, stages }));
} finally { await source.stop(); await target.stop(); }
const key = ed25519Keypair(new Uint8Array(32).fill(7));
const origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa';
for (const count of [128, 512]) {
  const entries = Array.from({ length: count }, (_, seq) => {
    const nonce = new Uint8Array(16); new DataView(nonce.buffer).setUint32(0, seq);
    const e = buildEntry({ origin, type: seq === 0 ? 'manifest' : 'notice', ...key, nonce, createdAt: 0, body: jcs({ synthetic: seq }) });
    return { seq, headerBytes: e.headerBytes, body: e.body };
  });
  const policy = { logPublicKey: key.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } };
  const rootHash = MerkleTree.fromLeafHashes(entries.map((e) => hashLeaf(e.headerBytes))).root();
  const bundle = { format: 'qv-bundle/v1', spec: 'QV-18', origin, createdAt: 0, generator: 'synthetic', treeSize: count,
    root: rootHash, entries, policy, checkpoints: [signCheckpoint(origin, count, rootHash, key.secretKey, key.publicKey)], receipts: [], redactions: [] };
  const metrics = await measurement(async () => {
    const result = verifyLogOffThread ? await verifyLogOffThread({ kind: 'log', bundle, ...policy, authorKeys: entries.map(() => key.publicKey) }, 30_000)
      : verifyLog(bundle, { ...policy, resolveAuthorKey: () => key.publicKey });
    if (result.integrity !== 'VERIFIED') throw new Error('synthetic board control failed verification');
  });
  console.log(JSON.stringify({ stage: 'board', entries: count, worker: !!verifyLogOffThread, ...metrics }));
}
