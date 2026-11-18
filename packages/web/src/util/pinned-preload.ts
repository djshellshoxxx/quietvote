/// <reference lib="dom.iterable" />
// QV-ADR-027 W15: the trusted build's HTML pins every permitted lazy module and its dependencies.
// A successful modulepreload populates the document module map; import() then reuses those bytes.
// A failed preload may be removed from that map, so never reach import() after a failed check.
// https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script
// An ES module instance and its cache belong to one document/realm, including back-forward cache restores.
let ready: Promise<void> | undefined;

/** Recheck the immutable build pins once per document; missing or failed pins keep lazy imports closed. */
export async function pinnedPreloads(doc: Document | undefined = globalThis.document): Promise<void> {
  // Node source tests/tooling have no browser module map.
  if (!doc) return;
  return ready ??= new Promise<void>((resolve, reject) => {
    const links = doc.querySelectorAll<HTMLLinkElement>('link[rel=modulepreload]');
    let pending = links.length;
    if (!pending) throw Error();
    for (const pin of links) {
      const link = pin.cloneNode() as HTMLLinkElement;
      if (!link.getAttribute('href') || !link.integrity || !link.relList.supports(link.rel)) throw Error();
      link.onload = () => { if (--pending === 0) resolve(); };
      link.onerror = reject;
      doc.head.append(link);
    }
  });
}
