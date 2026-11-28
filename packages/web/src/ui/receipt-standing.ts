// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CheckedReceiptStanding } from '../flow/receipt-standing.ts';
import type { Translator } from '../i18n/index.ts';
import { h, nextId } from './dom.ts';

/** One result belongs to the exact code shown by its enclosing inclusion result. No cached-log or ownership claims. */
export function receiptStandingPanel(result: CheckedReceiptStanding, code: string, tr: Translator): HTMLElement {
  const heading = nextId('receipt-standing');
  const panel = h('section', { class: `qv-standing ${result.state}`, 'aria-labelledby': heading, 'data-ballot-code': code },
    h('h2', { id: heading }, tr.t('qv.receipt.standing.title')));
  if (result.state === 'unverified') {
    const reason = result.reason === 'anchor' ? 'qv.receipt.standing.pinHint' : result.reason === 'anchor-mismatch' ? 'qv.receipt.standing.anchorMismatch' :
      result.reason === 'incomplete' ? 'qv.receipt.standing.incomplete' : 'qv.receipt.standing.refused';
    panel.append(h('p', {}, tr.t('qv.receipt.standing.unknown')), h('p', { class: 'hint' }, tr.t(reason)));
  } else {
    const message = result.state === 'superseded' ? tr.t('qv.receipt.standing.superseded', { seq: result.bySeq }) :
      tr.t(result.state === 'counted' ? 'qv.receipt.standing.counted' : 'qv.receipt.standing.excluded');
    panel.append(h('p', {}, message));
    if (result.state === 'superseded') panel.append(h('p', {}, tr.t('qv.receipt.standing.replacementCode', { code: result.byCode })));
    panel.append(h('p', { class: 'hint' }, tr.t('qv.receipt.standing.snapshot', { size: result.snapshot.size, root: result.snapshot.root })),
      h('p', { class: 'hint' }, result.snapshot.origin), h('p', { class: 'hint' }, tr.t('qv.receipt.standing.pin'), ': ', result.snapshot.manifestHash));
    for (const caveat of result.caveats) panel.append(h('p', { class: 'hint' }, caveat));
  }
  panel.append(h('p', { class: 'hint' }, tr.t('qv.receipt.standing.scope')));
  return panel;
}
