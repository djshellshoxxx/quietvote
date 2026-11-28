// Advisory result copy (QV-07-REQ-017). Call only after the existing result-verification gate succeeds.
import type { Translator } from '../i18n/index.ts';
import { h } from './dom.ts';

export function smallRollDisclosure(rollSize: number, tr: Translator): HTMLElement | null {
  if (!Number.isSafeInteger(rollSize) || rollSize < 0 || rollSize >= 10) return null;
  return h('p', { class: 'result-disclosure banner' }, tr.t('qv.results.disclosure.smallRoll'));
}

/** The caller places this in the affected option's row. It reveals only that option's selection bit. */
export function optionDisclosure(count: number, counted: number, tr: Translator): HTMLElement | null {
  if (!Number.isSafeInteger(counted) || counted <= 0 || (count !== 0 && count !== counted)) return null;
  return h('div', { class: 'option-disclosure' },
    h('p', {}, h('strong', {}, tr.t('qv.results.disclosure.scope')), ': ', tr.t('qv.results.disclosure.unanimous')),
    h('p', {}, tr.t(count === 0 ? 'qv.results.disclosure.none' : 'qv.results.disclosure.all')));
}
