// Worker mode of the standalone verifier's single inline script (QV-19 §7, audit B3-26). verifier.html starts a blob: Worker
// from its own inline script text (`document.currentScript.textContent`), whose SHA-256 is the page's CSP script hash, so the
// worker runs exactly the bytes the user compared; there is no separately fetched worker file. In a Worker global (no
// `document`) entry.ts calls this instead of starting the page. Protocol (see bundle.ts `WorkerToMain`): worker -> page
// `ready` once loaded; page -> worker one `{ text, anchor }` job; worker -> page `progress` phases, then exactly one `result`
// or `error`. One job per worker: the page terminates it afterwards (and on Cancel). No network or storage APIs.
import { verifyBundle, type VerifyJob, type WorkerToMain } from './bundle.ts';

export interface WorkerScope {
  postMessage(m: unknown): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
}

export function runVerifyWorker(scope: WorkerScope): void {
  const post = (m: WorkerToMain): void => scope.postMessage(m);
  let started = false;
  scope.addEventListener('message', (e) => {
    if (started) return;
    started = true;
    const job = e.data as Partial<VerifyJob> | null;
    if (typeof job !== 'object' || job === null || typeof job.text !== 'string' || typeof job.anchor !== 'string') {
      post({ type: 'error', detail: 'malformed verification job' });
      return;
    }
    verifyBundle({ text: job.text, anchor: job.anchor }, (phase) => post({ type: 'progress', phase })).then(
      (result) => {
        try {
          post({ type: 'result', result });
        } catch {
          post({ type: 'error', detail: 'verification report could not be sent to the page' });
        }
      },
      (err: unknown) => post({ type: 'error', detail: err instanceof Error && err.message ? err.message : 'verification failed' }),
    );
  });
  post({ type: 'ready' });
}
