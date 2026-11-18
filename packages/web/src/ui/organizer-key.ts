// Organizer keys reuse the voter key container and KDF; no signer is retained by this panel.
import { bytesToHex } from '@quietvote/crypto';
import { ORGANIZER_SLOT, KeySlotOccupiedError, createKey, importKeyFile, unlockKey } from '../flow/onboarding.ts';
import type { Translator } from '../i18n/index.ts';
import { KeyError, serializeContainer, type KeystoreDeps } from '../key/keystore.ts';
import { checkPassphrase } from '../key/passphrase.ts';
import type { DeviceStorage } from '../key/storage.ts';
import { add, clear, h, nextId } from './dom.ts';

export interface OrganizerKeyPanel {
  element: HTMLElement;
  lock(): void;
}

export function organizerKeyPanel(d: {
  tr: Translator;
  storage: DeviceStorage;
  deps: () => KeystoreDeps;
  hasKey: boolean;
  current: () => boolean;
  ready: (publicKey: string) => void;
  error: (e: unknown) => HTMLElement;
  download: (text: string) => void;
}): OrganizerKeyPanel {
  const t = d.tr.t.bind(d.tr);
  const root = h('section', { 'aria-busy': 'false' });
  const out = h('div', {});
  const backup = h('div', {});
  const pass = h('input', { type: 'password', autocomplete: 'current-password', spellcheck: false, autocapitalize: 'off', autocorrect: 'off' }) as HTMLInputElement;
  const file = h('input', { type: 'file', accept: '.qvkey,application/json' }) as HTMLInputElement;
  const field = (label: string, input: HTMLElement): HTMLElement => {
    const id = nextId('organizer'); input.id = id;
    return h('div', { class: 'field' }, h('label', { for: id }, label), input);
  };
  let exists = d.hasKey;
  let busy = false;
  let generation = 0;
  const controls: HTMLButtonElement[] = [];
  const lock = (): void => { generation++; pass.value = ''; file.value = ''; clear(out); clear(backup); };
  const action = (label: string, kind: 'create' | 'import' | 'unlock'): HTMLElement => {
    const button = h('button', { type: 'button', class: 'btn', onclick: async () => {
      if (busy || !d.current() || ((kind === 'create' || kind === 'import') && exists)) return;
      busy = true;
      const run = generation;
      const password = pass.value;
      pass.value = '';
      const selected = file.files?.[0];
      for (const b of controls) b.disabled = true;
      file.disabled = true; pass.disabled = true;
      root.setAttribute('aria-busy', 'true');
      clear(out); out.append(h('p', {}, t('qv.key.working')));
      try {
        if (kind === 'create') {
          const policy = checkPassphrase(password);
          if (!policy.ok) {
            clear(out);
            out.append(h('p', {}, t(({ tooShort: 'qv.key.pp.tooShort', commonPattern: 'qv.key.pp.commonPattern', repetitive: 'qv.key.pp.repetitive' } as const)[policy.problems[0] ?? 'tooShort'])));
            return;
          }
        }
        // Recheck storage after entering the single-flight section: never overwrite a saved key.
        if (kind !== 'unlock' && await d.storage.getKey(ORGANIZER_SLOT) !== undefined) {
          // A different tab may finish before this preflight or during derivation.
          // Both paths must offer read-only unlock of the installed key.
          throw new KeySlotOccupiedError('organizer key already exists');
        }
        let publicKey: Uint8Array;
        let fingerprint: string[];
        if (kind === 'create') {
          const key = await createKey({ storage: d.storage, slot: ORGANIZER_SLOT, passphrase: password, deps: d.deps(), onlyIfAbsent: true, canInstall: () => d.current() && run === generation });
          ({ publicKey, fingerprint } = key); exists = true;
        } else if (kind === 'import') {
          if (!selected) { clear(out); out.append(h('p', {}, t('qv.key.importMissing'))); return; }
          if (selected.size > 64 * 1024) throw new Error('key file too large');
          ({ publicKey, fingerprint } = await importKeyFile({ storage: d.storage, slot: ORGANIZER_SLOT, text: await selected.text(), passphrase: password, deps: d.deps(), onlyIfAbsent: true, canInstall: () => d.current() && run === generation }));
          exists = true;
        } else {
          // Fingerprint inspection is read-only; signing flows retain their existing rewrap policy.
          const key = await unlockKey({ storage: d.storage, slot: ORGANIZER_SLOT, passphrase: password, deps: d.deps(), rewrap: false });
          publicKey = key.signer.publicKey.slice(); fingerprint = key.fingerprint;
          key.signer.lock();
        }
        if (!d.current() || run !== generation) return;
        const container = await d.storage.getKey(ORGANIZER_SLOT);
        if (!d.current() || run !== generation) return;
        clear(out); clear(backup);
        out.append(h('p', {}, t('qv.key.fingerprint', { words: fingerprint.join(' ') })), h('p', {}, t('qv.org.publicKey')), h('code', {}, bytesToHex(publicKey)));
        if (container && container.m <= d.deps().floor.m) out.append(h('p', {}, t('qv.key.floorWarn')));
        if (container) backup.append(h('button', { type: 'button', class: 'btn', onclick: () => d.download(serializeContainer(container)) }, t('qv.key.download')));
        d.ready(bytesToHex(publicKey));
      } catch (e) {
        if (d.current() && run === generation) {
          clear(out);
          if (e instanceof KeySlotOccupiedError) { exists = true; out.append(h('p', {}, t('qv.key.locked'))); }
          else if (e instanceof KeyError && e.code === 'E_KEY_CANCELLED') out.append(h('p', {}, t('qv.key.costCancelled')));
          else if (e instanceof KeyError && e.code === 'E_KEY_LOCKED') out.append(h('p', {}, t('qv.err.E-KEY-LOCKED.title')));
          else out.append(d.error(e));
        }
      } finally {
        busy = false; pass.value = ''; file.value = '';
        if (d.current()) {
          for (let i = 0; i < controls.length; i++) controls[i]!.disabled = exists ? i < 2 : i === 2;
          file.disabled = exists; pass.disabled = false;
          root.setAttribute('aria-busy', 'false');
        }
      }
    } }, label) as HTMLButtonElement;
    controls.push(button);
    button.disabled = kind === 'unlock' ? !exists : exists;
    return button;
  };
  file.disabled = exists;
  add(root, [h('h2', {}, t('qv.org.keyTitle')), h('p', {}, t('qv.org.keyHelp')), h('p', {}, t('qv.org.keySetupHelp')),
    field(t('qv.key.passphrase'), pass), field(t('qv.org.keyFile'), file),
    action(t('qv.key.create'), 'create'), action(t('qv.org.importKey'), 'import'), action(t('qv.key.unlock'), 'unlock'), out, backup]);
  return { element: root, lock };
}
