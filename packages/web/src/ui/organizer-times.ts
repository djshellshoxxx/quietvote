// Organizer wall-clock entry only. Published suite-v1 manifests keep their existing UTC fields.
import { offsetText, zonedLocalToUtc } from '../i18n/datetime.ts';
import type { MessageKey, Translator } from '../i18n/index.ts';
import { clear, h, nextId } from './dom.ts';

export function organizerTimes(d: { tr: Translator; current(): boolean; changed(): void }): {
  element: HTMLElement;
  read(): { opensIso: string; closesIso: string } | undefined;
} {
  const t = d.tr.t.bind(d.tr);
  const zone = h('input', { type: 'text', value: Intl.DateTimeFormat().resolvedOptions().timeZone, autocomplete: 'off', spellcheck: false }) as HTMLInputElement;
  const field = (label: MessageKey, input: HTMLElement, ...extra: HTMLElement[]): HTMLElement => {
    input.id = nextId('time');
    return h('div', { class: 'field' }, h('label', { for: input.id }, t(label)), input, ...extra);
  };
  const time = (label: 'qv.org.opens' | 'qv.org.closes') => {
    const input = h('input', { type: 'datetime-local', step: 60 }) as HTMLInputElement;
    const detail = h('div', { id: nextId('time-detail') });
    input.setAttribute('aria-describedby', detail.id);
    let offset: number | undefined;
    const read = (required = true): string | undefined => {
      if (!d.current()) return;
      clear(detail);
      input.setAttribute('aria-invalid', 'false');
      if (!input.value && !required) return;
      let result: ReturnType<typeof zonedLocalToUtc> | undefined;
      try {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input.value)) throw new Error();
        const date = new Date(`${input.value}:00Z`);
        if (date.toISOString().slice(0, 16) !== input.value) throw new Error();
        result = zonedLocalToUtc({ y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes() }, zone.value.trim());
      } catch { /* Invalid calendar fields or IANA zone are displayed without coercion. */ }
      let instant: string | undefined;
      if (!result) detail.append(h('p', { class: 'error' }, t('qv.org.invalidDate')));
      else if (result.kind === 'ok') instant = result.instant;
      else if (result.kind === 'gap') {
        detail.append(h('p', { class: 'error' }, t('qv.org.dstGap', { zone: zone.value, suggestion: result.suggestions.join(' / ') })));
        for (const value of result.suggestions) detail.append(h('button', { type: 'button', onclick: () => {
          if (!d.current()) return;
          input.value = value.replace(' ', 'T'); edit(); input.focus();
        } }, value));
      } else {
        const name = nextId('offset');
        const choices = h('fieldset', {}, h('legend', {}, t(label)), h('p', {}, t('qv.org.dstFold', { zone: zone.value, offsets: result.candidates.map((c) => offsetText(c.offsetMinutes)) })));
        for (const candidate of result.candidates) choices.append(h('label', { class: 'choice' }, h('input', { type: 'radio', name, checked: offset === candidate.offsetMinutes, onchange: () => {
          if (!d.current()) return;
          offset = candidate.offsetMinutes; d.changed(); read(); detail.querySelector<HTMLInputElement>('input:checked')?.focus();
        } }), ' ', offsetText(candidate.offsetMinutes)));
        detail.append(choices);
        instant = result.candidates.find((c) => c.offsetMinutes === offset)?.instant;
      }
      input.setAttribute('aria-invalid', String(instant === undefined));
      if (instant) detail.append(h('p', { class: 'hint' }, t('qv.org.instant', { utc: instant })));
      return instant;
    };
    const edit = (): void => { if (d.current()) { offset = undefined; d.changed(); read(false); } };
    input.addEventListener('input', edit);
    return { element: field(label, input, detail), read, edit };
  };
  const opens = time('qv.org.opens'), closes = time('qv.org.closes');
  zone.addEventListener('input', () => { opens.edit(); closes.edit(); });
  return {
    element: h('div', {}, field('qv.org.zone', zone), opens.element, closes.element),
    read: () => {
      const opensIso = opens.read(), closesIso = closes.read();
      return opensIso && closesIso ? { opensIso, closesIso } : undefined;
    },
  };
}
