import { parseQvJson } from '@quietvote/crypto';
import { b64uDecode } from '../util/hex.ts';
// The console prepares public packets for explicit review and sends only exact
// reviewed bytes. No trustee secrets, retained organizer unlock or automatic retries.
import type { ApiClient } from '../api/client.ts';
import { ADMIN_ACTIONS, AdminError, MAX_ADMIN_BYTES, adminSnapshot, coSignAdminPacket, prepareAdminAction, reviewSavedAdminPacket, submitAdminPacket, trusteePacket, type AdminAction, type AdminPacket, type AdminSnapshot } from '../flow/admin.ts';
import { ORGANIZER_SLOT, unlockKey } from '../flow/onboarding.ts';
import type { KeystoreDeps } from '../key/keystore.ts';
import type { DeviceStorage } from '../key/storage.ts';
import type { Signer } from '../key/signer.ts';
import type { MessageKey, Translator } from '../i18n/index.ts';
import { add, clear, h, nextId, type Announcer } from './dom.ts';

const ACTION_KEYS: Record<AdminAction, MessageKey> = {
  'dkg-open': 'qv.admin.dkgOpen', 'dkg-r1-open': 'qv.admin.r1Open', 'dkg-r1-close': 'qv.admin.r1Close',
  'dkg-r2-close': 'qv.admin.r2Close', 'dkg-r3-close': 'qv.admin.r3Close', 'dkg-final': 'qv.admin.final',
  'roll-commit': 'qv.admin.roll', 'election-open': 'qv.org.open', 'election-close': 'qv.org.close', tally: 'qv.admin.tally',
};
export interface AdminViewDeps {
  tr: Translator; say: Announcer; api: Pick<ApiClient, 'exportJson' | 'tallyDraft' | 'postEntry'>; apiId: string;
  storage: DeviceStorage; keyDeps: () => KeystoreDeps; current: () => boolean;
  download: (name: string, text: string) => void;
  error: (e: unknown) => HTMLElement;
  unlock?: (passphrase: string) => Promise<Signer>;
}

export function adminPanel(d: AdminViewDeps): { element: HTMLElement; invalidate: () => void } {
  const t = (key: MessageKey): string => d.tr.t(key);
  const root = h('section', {}), result = h('div', {}), preview = h('pre', { tabindex: 0, dir: 'ltr', class: 'admin-packet' });
  const pin = h('input', { type: 'text', spellcheck: false, autocomplete: 'off', maxlength: 64, dir: 'ltr' }) as HTMLInputElement;
  const pass = h('input', { type: 'password', autocomplete: 'current-password' }) as HTMLInputElement;
  const action = h('select', {}, ...ADMIN_ACTIONS.map((a) => h('option', { value: a }, t(ACTION_KEYS[a])))) as HTMLSelectElement;
  const file = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  const field = (key: MessageKey, input: HTMLElement): HTMLElement => { const id = nextId('admin'); input.id = id; return h('div', { class: 'field' }, h('label', { for: id }, t(key)), input); };
  let revision = 0, busy = false, packet: AdminPacket | undefined, snapshot: AdminSnapshot | undefined, attempted = false, quorum = false;
  const update = (): void => {
    for (const control of [pin, action, file, prepare, relay, cosign, restore, refresh]) {
      if (busy || packet) control.setAttribute('disabled', ''); else control.removeAttribute('disabled');
    }
    if (busy || !packet || !quorum) send.setAttribute('disabled', ''); else send.removeAttribute('disabled');
    if (busy || !packet) save.setAttribute('disabled', ''); else save.removeAttribute('disabled');
    if (busy || attempted) discard.setAttribute('disabled', ''); else discard.removeAttribute('disabled');
    root.setAttribute('aria-busy', String(busy));
  };
  const invalidate = (): void => { revision++; pass.value = ''; };
  const status = (key: MessageKey, urgent = false): void => {
    clear(result); result.append(h('p', { class: urgent ? 'error' : 'hint' }, t(key))); d.say.say(t(key), urgent);
  };
  for (const control of [pin, action, file]) control.addEventListener('input', () => { invalidate(); snapshot = undefined; });
  file.addEventListener('change', () => { invalidate(); snapshot = undefined; });
  const load = async (): Promise<AdminSnapshot> => adminSnapshot(await d.api.exportJson(d.apiId), pin.value.trim().toLowerCase(), d.apiId);
  const run = async (fn: (current: () => boolean) => Promise<void>): Promise<void> => {
    if (busy || !d.current()) return;
    busy = true; update(); const at = revision;
    const current = (): boolean => d.current() && revision === at;
    try { await fn(current); }
    catch (e) { if (current()) { clear(result); if (e instanceof AdminError) status('qv.admin.refused', true); else { result.append(d.error(e)); } } }
    finally { busy = false; update(); }
  };
  const setPacket = (p: AdminPacket, record: unknown, ready = true): void => { packet = p; attempted = false; quorum = ready; preview.textContent = JSON.stringify(record, null, 2); status(ready ? 'qv.admin.review' : 'qv.admin.partial'); };
  const refresh = h('button', { type: 'button', class: 'btn', onclick: () => { void run(async (current) => {
    if (packet) return;
    const s = await load(); if (!current()) return; snapshot = s;
    preview.textContent = JSON.stringify({ title: s.manifest.title, manifest_hash: s.pin,
      records: s.election.log.length, events: s.election.log.flatMap(({ seq, entry }) => {
        const b = (entry as { body?: { type?: string; name?: string } } | undefined)?.body;
        return b?.type === 'marker' || b?.type === 'roll-commit' || b?.type === 'tally' ? [{ seq, event: b.name ?? b.type }] : [];
      }) }, null, 2);
    status('qv.admin.loaded');
  }); } }, t('qv.spoil.refresh'));
  const prepare = h('button', { type: 'button', class: 'btn', onclick: () => { void run(async (current) => {
    if (packet) return;
    const phrase = pass.value; pass.value = '';
    const s = await load(); if (!current()) return; snapshot = s;
    const a = action.value as AdminAction;
    const tally = a === 'tally' ? await d.api.tallyDraft(d.apiId) : undefined;
    if (!current()) return;
    const signer = await (d.unlock ? d.unlock(phrase) : unlockKey({ storage: d.storage, slot: ORGANIZER_SLOT, passphrase: phrase, rewrap: false, deps: d.keyDeps() }).then((k) => k.signer));
    try {
      if (!current()) return;
      const prepared = await prepareAdminAction({ snapshot: s, action: a, signer, tally, current });
      if (current()) setPacket(prepared.packet, prepared.record, prepared.quorum);
    } finally { signer.lock(); }
  }); } }, t('qv.admin.prepare'));
  const relay = h('button', { type: 'button', class: 'btn', onclick: () => { void run(async (current) => {
    if (packet) return;
    const chosen = file.files?.[0]; if (!chosen || chosen.size > MAX_ADMIN_BYTES) throw new AdminError('input');
    const text = await chosen.text(); if (!current()) return;
    const s = await load(); if (!current()) return; snapshot = s;
    const p = trusteePacket(text, s); setPacket(p, parseQvJson(b64uDecode(p.body)!));
  }); } }, t('qv.admin.relay'));
  const cosign = h('button', { type: 'button', class: 'btn', onclick: () => { void run(async (current) => {
    if (packet) return;
    const phrase = pass.value; pass.value = '';
    const chosen = file.files?.[0]; if (!chosen || chosen.size > MAX_ADMIN_BYTES) throw new AdminError('input');
    const text = await chosen.text(); if (!current()) return;
    const s = await load(); if (!current()) return; snapshot = s;
    const signer = await (d.unlock ? d.unlock(phrase) : unlockKey({ storage: d.storage, slot: ORGANIZER_SLOT, passphrase: phrase, rewrap: false, deps: d.keyDeps() }).then((k) => k.signer));
    try {
      if (!current()) return;
      const signed = await coSignAdminPacket({ snapshot: s, text, signer, current });
      if (current()) setPacket(signed.packet, signed.record, signed.quorum);
    } finally { signer.lock(); }
  }); } }, t('qv.admin.cosign'));
  const restore = h('button', { type: 'button', class: 'btn', onclick: () => { void run(async (current) => {
    if (packet) return;
    const chosen = file.files?.[0]; if (!chosen || chosen.size > MAX_ADMIN_BYTES) throw new AdminError('input');
    const text = await chosen.text(); if (!current()) return;
    const s = await load(); if (!current()) return; snapshot = s;
    const saved = await reviewSavedAdminPacket(text, s);
    if (current()) setPacket(saved.packet, saved.record, saved.quorum);
  }); } }, t('qv.admin.restore'));
  const send = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => { void run(async (current) => {
    if (!packet || !snapshot || !quorum) return;
    // Downloadable packet remains intact until an accepted response, including
    // network ambiguity and explicit retry. Preparing replacement bytes is blocked.
    attempted = true;
    try {
      await submitAdminPacket(d.api, d.apiId, packet, snapshot);
      if (!current()) return;
      packet = undefined; attempted = false; preview.textContent = ''; status('qv.admin.accepted');
    } catch { if (current()) status('qv.admin.uncertain', true); }
  }); } }, t('qv.admin.submit'));
  const save = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { if (packet) d.download(`quietvote-${d.apiId}-packet.json`, JSON.stringify(packet)); } }, t('qv.admin.save'));
  const discard = h('button', { type: 'button', class: 'btn', onclick: () => { if (busy || attempted) return; packet = undefined; preview.textContent = ''; invalidate(); update(); } }, t('qv.key.cancel'));
  add(root, [h('h1', { tabindex: -1, class: 'step-heading' }, t('qv.nav.admin')), h('p', {}, t('qv.admin.help')),
    field('qv.admin.pin', pin), refresh, field('qv.admin.action', action), field('qv.key.passphrase', pass), prepare,
    field('qv.admin.file', file), relay, cosign, restore, preview, h('div', { class: 'row' }, save, send, discard), result]);
  update();
  return { element: root, invalidate };
}
