import { startApp } from './ui/app.ts';
import { IdbStorage } from './key/storage.ts';
import { workerSealer } from './worker/worker-sealer.ts';
import { loadLocaleDefs } from './i18n/runtime.ts';

const meta = (n: string): string => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? '';
const root = document.getElementById('app');
if (root === null || typeof crypto === 'undefined' || crypto.subtle === undefined || typeof indexedDB === 'undefined') {
  const p = document.createElement('p');
  p.textContent = 'This browser can’t vote here. Use a newer browser or the command-line voter.';
  (root ?? document.body).append(p);
} else {
  const wurl = meta('qv-worker');
  const sealer = wurl ? workerSealer(wurl) : undefined;
  // Translated tables are separate chunks and are fetched only for locales that have review records (none yet).
  void loadLocaleDefs().then((locales) => startApp({ root, storage: new IdbStorage(), build: { version: meta('qv-version'), id: meta('qv-build') }, locales, ...(sealer ? { sealer } : {}) }));
}
