// SPDX-License-Identifier: AGPL-3.0-or-later
import { performance } from 'node:perf_hooks';

export type NativeFixturePhase = 'voter-key' | 'invite';

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

/** Observe one fixture call, without inferring which native startup stage ran.
 * Only fixed phase names and timing counters are serialized. The operation's
 * result/error is never inspected, and an unavailable diagnostic sink must not
 * replace that result/error. Production deadlines and native helpers are untouched.
 */
export async function observeNativeFixture<T>(
  phase: NativeFixturePhase,
  operation: () => Promise<T>,
  diagnostic: (message: string) => void,
  clock: NativeFixtureTiming = timing,
): Promise<T> {
  // Keep even accidental runtime misuse from turning a phase label into a log sink.
  if (phase !== 'voter-key' && phase !== 'invite') return operation();
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
    // Include an unsampled terminal stall, including when no heartbeat ever ran.
    largestGap = Math.max(largestGap, finished - previous);
    const observation = {
      phase,
      elapsed_ms: Math.max(0, Math.round(finished - started)),
      heartbeat_samples: samples,
      largest_callback_gap_ms: Math.max(0, Math.round(largestGap)),
    };
    try { diagnostic(JSON.stringify(observation)); }
    catch { /* Test observation must preserve the fixture's original result/error. */ }
  }
}
