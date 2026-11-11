// Both import verification phases use this entry, sequentially under the bounded job runner.
// Only decoded entry buffers are transferred for the board phase; no second archive copy is made.
import { parentPort, workerData } from 'node:worker_threads';
import { verifyLog } from '@quietvote/board';
import { parseQvJson } from '@quietvote/crypto';
import { verifyElection } from '@quietvote/protocol';
import type { LogVerificationTask } from './imports.ts';

async function main(): Promise<void> {
  const task = workerData as LogVerificationTask | { kind: 'election'; bytes: Uint8Array };
  if (task.kind === 'log') {
    const verdict = verifyLog(task.bundle, { logPublicKey: task.logPublicKey, witnessPolicy: task.witnessPolicy,
      resolveAuthorKey: (_h, seq) => seq === undefined ? undefined : task.authorKeys[seq],
    });
    const entries = task.bundle.entries;
    const buffers = entries.flatMap((e) => [e.headerBytes.buffer as ArrayBuffer, ...(e.body ? [e.body.buffer as ArrayBuffer] : [])]);
    parentPort!.postMessage({ ok: true, result: { verdict, entries } }, buffers);
    return;
  }
  let input: unknown;
  try {
    input = parseQvJson(task.bytes);
  } catch {
    parentPort!.postMessage({ ok: false });
    return;
  }
  parentPort!.postMessage({ ok: true, result: await verifyElection(input) });
}
void main();
