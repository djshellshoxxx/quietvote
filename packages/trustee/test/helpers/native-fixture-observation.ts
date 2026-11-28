// SPDX-License-Identifier: AGPL-3.0-or-later
// Matches the bounded, test-only heartbeat pattern in the server fixture observer.
import { performance } from 'node:perf_hooks';

const PHASES = [
  'audit-cast-rewrap-keygen', 'audit-before-open-keygen',
  'board-export-keygen', 'board-tally-export-keygen',
  'ceremony-honest-keygen', 'ceremony-bad-share-keygen',
] as const;
export type NativeFixturePhase = typeof PHASES[number];

export interface NativeFixtureObservation {
  phase: NativeFixturePhase;
  diagnostic(message: string): void;
}

/** Test-only monotonic timing. The returned function stops the heartbeat. */
export interface NativeFixtureTiming {
  now(): number;
  heartbeat(callback: () => void): () => void;
}

const timing: NativeFixtureTiming = {
  now: () => performance.now(),
  heartbeat(callback) {
    const timer = setInterval(callback, 100);
    timer.unref();
    return () => clearInterval(timer);
  },
};

/** Observe the fixture call, without attributing the delay to a native startup stage.
 * Only fixed labels and timing counters are serialized; results and errors are never inspected.
 * A broken diagnostic sink cannot replace the operation's original result or error.
 */
export async function observeNativeFixture<T>(
  observation: NativeFixtureObservation,
  operation: () => Promise<T>,
  clock: NativeFixtureTiming = timing,
): Promise<T> {
  const { phase } = observation;
  // Runtime misuse cannot turn a caller-provided label into a diagnostic log sink.
  if (!PHASES.includes(phase)) return operation();
  const started = clock.now();
  let previous = started;
  let largestGap = 0;
  let samples = 0;
  const stop = clock.heartbeat(() => {
    const current = clock.now();
    largestGap = Math.max(largestGap, current - previous);
    previous = current;
    samples++;
  });
  try { return await operation(); }
  finally {
    stop();
    const finished = clock.now();
    // Include a terminal stall after the last sample, including when no callback ran.
    largestGap = Math.max(largestGap, finished - previous);
    const counters = {
      phase,
      elapsed_ms: Math.max(0, Math.round(finished - started)),
      heartbeat_samples: samples,
      largest_callback_gap_ms: Math.max(0, Math.round(largestGap)),
    };
    try { observation.diagnostic(JSON.stringify(counters)); }
    catch { /* Diagnostic emission must preserve the fixture's original result/error. */ }
  }
}
