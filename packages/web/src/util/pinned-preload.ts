// QV-ADR-027 W15 (option A): lazy chunks are pinned by `<link rel="modulepreload" integrity>` in index.html (build/site.ts).
// HTML Standard, "fetch a single module script" (html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script;
// checked in the whatwg/html `source` at main a0442320781555c99544448e30134662bfc39190 on 2026-11-11, see NOTES.md): a successful
// integrity-checked preload SETS the document's module map entry (keyed by URL and module type, not integrity), so a later
// import() of the same URL reuses those checked bytes; a FAILED fetch (an integrity mismatch is a network error) REMOVES the
// entry, so a later import() would fetch the URL again with only import-map integrity (none here). Chromium 153 was observed to
// keep the failure (e2e mutation, 2026-11-11), but a conformant browser need not. So before each lazy import() the app re-requests every integrity
// preload through a fresh modulepreload link and imports only if all of them load: a hit in the module map is instant, a removed
// entry is refetched WITH the same integrity, and a tampered chunk fires `error`, so import() is never reached.
type LinkLike = { rel: string; href: string; integrity: string; crossOrigin: string | null; addEventListener(t: 'load' | 'error', f: () => void): void; remove(): void };
type DocLike = {
  querySelectorAll(sel: string): ArrayLike<{ getAttribute(n: string): string | null }>;
  createElement(tag: 'link'): LinkLike;
  head: { append(n: LinkLike): void };
};

const checked = new Map<string, Promise<void>>();

function recheck(doc: DocLike, href: string, integrity: string): Promise<void> {
  let p = checked.get(href);
  if (p === undefined) {
    // An empty href fires no event (HTML: the fetch steps return early); refuse instead of waiting forever.
    p = href === '' || integrity === '' ? Promise.reject(new Error('modulepreload without href or integrity')) : new Promise<void>((resolve, reject) => {
      const l = doc.createElement('link');
      l.rel = 'modulepreload'; l.integrity = integrity; l.crossOrigin = 'anonymous';
      l.addEventListener('load', () => { l.remove(); resolve(); });
      l.addEventListener('error', () => { l.remove(); reject(new Error(`integrity-pinned module failed to load: ${href}`)); });
      l.href = href;
      doc.head.append(l);
    });
    checked.set(href, p);
  }
  return p;
}

/** Resolves only when every integrity-pinned modulepreload of the page is in the module map; rejects if any failed. */
export function pinnedPreloads(doc: DocLike | undefined = (globalThis as unknown as { document?: DocLike }).document): Promise<void> {
  if (doc === undefined) return Promise.resolve(); // node tests/tooling: no module map, no import of built chunks
  const links = Array.from(doc.querySelectorAll('link[rel="modulepreload"][integrity]'));
  return Promise.all(links.map((l) => recheck(doc, l.getAttribute('href') ?? '', l.getAttribute('integrity') ?? ''))).then(() => undefined);
}

/** Tests only. */
export const resetPinnedPreloads = (): void => { checked.clear(); };
