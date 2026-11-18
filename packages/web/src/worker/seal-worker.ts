// Dedicated Worker entry: runs sealBallot off the UI thread (QV-19 §4). Receives and returns JSON-safe data only.
import { sealBallot, type SealRequest } from '../flow/seal.ts';

self.addEventListener('message', (e: MessageEvent<SealRequest>) => {
  (self as unknown as { postMessage(m: unknown): void }).postMessage(sealBallot(e.data));
});
