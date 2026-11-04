// Build entry of verifier.html's one inline script. The same bytes run as the page and, via a blob: URL of that script's own
// text, as its verification Worker (B3-26), so the page's CSP hash covers every verdict-deciding line.
import { startPage } from './page.ts';
import { runVerifyWorker, type WorkerScope } from './worker-main.ts';

if (typeof document === 'undefined') runVerifyWorker(self as unknown as WorkerScope);
else startPage();
