// SPDX-License-Identifier: AGPL-3.0-or-later
/** The existing standalone verifier's input ceiling, also applied to a fetched status snapshot. */
export const MAX_RECEIPT_BUNDLE_BYTES = 64 * 1024 * 1024;

/** Bound the actual streamed bytes; Content-Length is only an early rejection hint. */
export async function boundedReceiptBundleText(response: Response, signal: AbortSignal, maxBytes = MAX_RECEIPT_BUNDLE_BYTES): Promise<string> {
  signal.throwIfAborted();
  const length = response.headers.get('Content-Length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new Error('receipt status snapshot exceeds its size limit');
  }
  if (response.body === null) throw new Error('receipt status snapshot has no body');
  const reader = response.body.getReader();
  const cancel = (): void => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error('receipt status snapshot exceeds its size limit');
      parts.push(decoder.decode(next.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}
