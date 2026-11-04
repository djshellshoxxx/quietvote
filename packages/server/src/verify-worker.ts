// Worker thread entry for import proof verification (B2-02): `verifyElection` is CPU-bound and never yields, so it runs here, off the
// server's event loop, under a wall-clock budget enforced (and terminated) by the parent (`verifyElectionOffThread` in imports.ts).
// Input: the raw bytes of election.json (strict QV-JSON). Output: one message, the verification report or a failure marker.
import { parentPort, workerData } from 'node:worker_threads';
import { parseQvJson } from '@quietvote/crypto';
import { verifyElection } from '@quietvote/protocol';

async function main(): Promise<void> {
  let input: unknown;
  try {
    input = parseQvJson(workerData as Uint8Array);
  } catch {
    parentPort!.postMessage({ ok: false });
    return;
  }
  parentPort!.postMessage({ ok: true, report: await verifyElection(input) });
}
void main();
