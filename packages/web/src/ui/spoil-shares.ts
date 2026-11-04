// Audit view of trustee-opened test (spoiled) ballots (QV-ADR-020). Every share shown here was verified in this page with the
// protocol functions (flow/spoil-shares.ts); the server's list is only a source of candidates. DOM text via textContent only.
import { hexToBytes } from '@quietvote/crypto';
import type { ApiClient } from '../api/client.ts';
import type { ElectionContext } from '../flow/election.ts';
import {
  MAX_SHARE_BYTES, deriveSpoilTargets, loadSpoilStatuses, parseShareInput, submitShares,
  type InvalidShare, type ShareReason, type SpoilStatus, type SpoilTargets, type SubmitOutcome,
} from '../flow/spoil-shares.ts';
import type { Args, MessageKey, Translator } from '../i18n/index.ts';
import { ballotCodeDisplay } from '../util/crockford.ts';
import { add, clear, h, nextId, type Announcer } from './dom.ts';

export interface SpoilViewDeps {
  tr: Translator;
  say: Announcer;
  api: ApiClient;
  apiId: string;
  ctx: ElectionContext;
  /** The loaded log entries (index 0 is the manifest). */
  records: () => readonly { seq: number; record: unknown }[];
  /** The full committed voter list as hex keys (the page already pages through it for the results verification). */
  roll: () => Promise<string[]>;
  /** False once the route changed, so a late response does not repaint a page the user left. */
  current: () => boolean;
}

/** Twelve verification outcomes, two texts: "not for a test ballot that can be opened" or "failed verification". The exact reason stays in the flow. */
const OTHER: readonly ShareReason[] = ['wrong-election', 'wrong-spoil', 'unknown-code', 'not-trustees-mode', 'cast-code'];

/** Self-filling panel: returns at once; the list and the upload box fill in as the shares are fetched and verified. */
export function spoilSharesPanel(d: SpoilViewDeps): HTMLElement {
  const t = (k: MessageKey, a?: Args): string => d.tr.t(k, a);
  const root = h('section', { class: 'spoil-shares' });
  const list = h('div', { 'aria-busy': 'true' });
  const result = h('div', { role: 'status', class: 'hint' });
  const decodedSeen = new Set<string>();
  let targets: SpoilTargets | undefined;
  let first = true;

  const reasonText = (r: ShareReason): string => t(OTHER.includes(r) ? 'qv.spoil.reason.other' : 'qv.spoil.reason.invalid');
  const invalidLine = (x: InvalidShare): string => t('qv.spoil.bad', { j: x.j ?? '?', reason: reasonText(x.reason) });
  const statusText = (s: SpoilStatus): string => {
    const a = { have: s.valid.length, need: s.need };
    return s.kind === 'waiting' ? t('qv.spoil.waiting', a) : s.kind === 'decoded' ? t('qv.spoil.decoded', a) : t('qv.spoil.invalid', a);
  };

  const selectionsTable = (selections: Record<string, string[]>, labelledBy: string): HTMLElement => {
    const labelOf = (cid: string, oid: string): string => d.ctx.manifest.contests.find((c) => c.id === cid)?.options.find((o) => o.id === oid)?.label ?? oid;
    const rows = d.ctx.manifest.contests.map((c) => {
      const chosen = Object.prototype.hasOwnProperty.call(selections, c.id) ? selections[c.id]! : [];
      return h('tr', {}, h('th', { scope: 'row' }, c.title), h('td', {}, chosen.length === 0 ? '\u2013' : chosen.map((o) => labelOf(c.id, o)).join(', ')));
    });
    return h('table', { 'aria-labelledby': labelledBy }, h('tbody', {}, ...rows));
  };

  const item = (s: SpoilStatus): HTMLElement => {
    let code = s.code;
    try {
      code = ballotCodeDisplay(hexToBytes(s.code, 32), true);
    } catch {
      // keep the raw hex
    }
    const hid = nextId('spoil');
    const li = h('li', {}, h('h3', { id: hid }, t('qv.spoil.code', { code })), h('p', {}, statusText(s)));
    if (s.kind === 'decoded') li.append(selectionsTable(s.selections, hid));
    if (s.kind !== 'waiting' && s.invalid.length > 0) li.append(h('ul', {}, ...s.invalid.map((x) => h('li', {}, invalidLine(x)))));
    return li;
  };

  const refresh = async (): Promise<void> => {
    list.setAttribute('aria-busy', 'true');
    clear(list);
    list.append(h('p', {}, t('qv.shell.loading')));
    try {
      if (targets === undefined) {
        const r = deriveSpoilTargets(d.ctx, d.records(), await d.roll());
        if (!d.current()) return;
        if (!r.ok) {
          clear(list);
          list.append(h('p', {}, t('qv.spoil.unavailable')));
          list.setAttribute('aria-busy', 'false');
          return;
        }
        targets = r.value;
      }
      const statuses = await loadSpoilStatuses(d.api, d.apiId, targets);
      if (!d.current()) return;
      clear(list);
      if (statuses.length === 0) list.append(h('p', {}, t('qv.spoil.none')));
      else list.append(h('ul', { class: 'plain' }, ...statuses.map(item)));
      const fresh = statuses.filter((s) => s.kind === 'decoded' && !decodedSeen.has(s.code));
      for (const s of fresh) decodedSeen.add(s.code);
      if (!first && fresh.length > 0) d.say.say(statusText(statuses.find((s) => s.code === fresh[0]!.code)!));
      else if (statuses.length === 0) d.say.say(t('qv.spoil.none'));
      first = false;
    } catch {
      if (!d.current()) return;
      clear(list);
      list.append(h('p', { role: 'alert', class: 'error' }, t('qv.err.E-API-UNAVAILABLE.body')));
      d.say.say(t('qv.err.E-API-UNAVAILABLE.body'), true);
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  };

  const outcomeLine = (o: SubmitOutcome): string => {
    switch (o.kind) {
      case 'accepted': case 'duplicate': return t('qv.spoil.out.accepted', { j: o.j });
            case 'rejected-local': return t('qv.spoil.out.local', { reason: reasonText(o.reason) });
      case 'rejected-server': return o.status === 0 ? t('qv.err.E-NET-OFFLINE.title') : t('qv.spoil.out.server', { status: o.status });
    }
  };

  const textId = nextId('spoil-text');
  const fileId = nextId('spoil-file');
  const text = h('textarea', { id: textId, rows: 6, spellcheck: false, autocomplete: 'off', dir: 'ltr' }) as HTMLTextAreaElement;
  const file = h('input', { id: fileId, type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  const showResult = (lines: string[], urgent = false): void => {
    clear(result);
    result.append(h('ul', { class: 'plain' }, ...lines.map((l) => h('li', {}, l))));
    d.say.say(lines[0] ?? '', urgent);
  };
  const send = async (): Promise<void> => {
    if (targets === undefined) return;
    let input = text.value.trim();
    const f = file.files?.[0];
    if (input === '' && f !== undefined) {
      if (f.size > MAX_SHARE_BYTES * 4) return showResult([t('qv.spoil.add.unreadable')], true);
      input = (await f.text()).trim();
    }
    if (input === '') return showResult([t('qv.spoil.add.unreadable')], true);
    const records = parseShareInput(input);
    if (records === undefined) return showResult([t('qv.spoil.add.unreadable')], true);
    try {
      const out = await submitShares(d.api, d.apiId, targets, records);
      if (!d.current()) return;
      showResult(out.map(outcomeLine), out.some((o) => o.kind === 'rejected-local' || o.kind === 'rejected-server'));
      if (out.some((o) => o.kind === 'accepted')) { text.value = ''; file.value = ''; await refresh(); }
    } catch {
      showResult([t('qv.err.E-NET-OFFLINE.title')], true);
    }
  };

  const form = h('form', { class: 'spoil-add', onsubmit: (e: Event) => { e.preventDefault(); void send(); } },
    h('h2', {}, t('qv.spoil.add.title')),
    h('div', { class: 'field' }, h('label', { for: textId }, t('qv.spoil.add.title')), text),
    h('div', { class: 'field' }, h('label', { for: fileId }, t('qv.spoil.add.file')), file),
    h('button', { type: 'submit', class: 'btn primary' }, t('qv.spoil.add.send')));

  add(root, [h('h1', { tabindex: -1, class: 'step-heading' }, t('qv.spoil.title')), list,
    h('button', { type: 'button', class: 'btn', onclick: () => { void refresh(); } }, t('qv.spoil.refresh')), form, result]);
  void refresh().then(() => { if (targets === undefined) form.setAttribute('hidden', ''); });
  return root;
}
