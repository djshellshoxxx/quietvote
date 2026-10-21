// Main-thread side of the sealing Worker. `new Worker(url)` is a Trusted Types sink under `require-trusted-types-for 'script'`,
// so the URL goes through the single `qv-default` policy, which only admits same-origin /assets/ script URLs.
import type { SealRequest, SealResponse, Sealer } from '../flow/seal.ts';

interface TT {
  createPolicy(name: string, rules: { createScriptURL?: (s: string) => string }): { createScriptURL(s: string): unknown };
}

export function allowedWorkerUrl(u: string, origin: string): boolean {
  try {
    const url = new URL(u, origin);
    return url.origin === origin && /^\/assets\/[A-Za-z0-9._-]+\.js$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function workerSealer(workerUrl: string): Sealer | undefined {
  if (typeof Worker === 'undefined') return undefined;
  const tt = (globalThis as unknown as { trustedTypes?: TT }).trustedTypes;
  let url: unknown = workerUrl;
  if (tt) {
    const policy = tt.createPolicy('qv-default', { createScriptURL: (s) => { if (!allowedWorkerUrl(s, location.origin)) throw new TypeError('worker url not allowed'); return s; } });
    url = policy.createScriptURL(workerUrl);
  }
  return {
    seal(req: SealRequest): Promise<SealResponse> {
      return new Promise((resolve) => {
        const w = new Worker(url as string, { type: 'module' });
        w.onmessage = (e: MessageEvent<SealResponse>): void => { w.terminate(); resolve(e.data); };
        w.onerror = (): void => { w.terminate(); resolve({ ok: false, error: 'worker failed' }); };
        w.postMessage(req);
      });
    },
  };
}
