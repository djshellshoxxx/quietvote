// Application shell, router and views. Framework-free; all logic lives in ../flow and ../key (unit-tested in node).
import { bytesToHex, hexToBytes, systemRng } from '@quietvote/crypto';
import { NO_SUPERSEDES, ballotCode, castDigest, verifyElectionText } from '@quietvote/protocol';
import { ed25519Verify } from '@quietvote/crypto';
import { ApiClient } from '../api/client.ts';
import { ApiError, uxCodeFor } from '../api/errors.ts';
import { BallotController, lastOwnBallotCode } from '../flow/ballot-controller.ts';
import { canAudit, canCast } from '../flow/ballot-machine.ts';
import { bindServerLog, deriveElectionContext, type ElectionContext } from '../flow/election.ts';
import { entryRecord } from '../flow/entries.ts';
import { parseFragment } from '../flow/invite.ts';
import { ORGANIZER_SLOT, createKey, importKeyFile, keySlot, recoveryCodeFor, registrationBody, unlockKey } from '../flow/onboarding.ts';
import { buildManifest, isoUtc, parseRoll, TEMPLATES, type Template } from '../flow/organizer.ts';
import { runPublish, type PublishOutcome } from '../flow/publish-ui.ts';
import type { PublishForm, PublishState } from '../flow/publish.ts';
import { BoardIntegrityError, checkInclusion, parseReceiptFile } from '../flow/receipt.ts';
import { LiveElection } from '../flow/live.ts';
import { BallotIndex } from '../flow/supersede.ts';
import type { ConnStatus } from '../net/sse.ts';
import { inlineSealer, type Sealer } from '../flow/seal.ts';
import { createTranslator, offeredLocales, negotiateLocale, SOURCE_ONLY, type LocaleDef, type MessageKey, type Translator, type Args } from '../i18n/index.ts';
import { formatDeadline } from '../i18n/datetime.ts';
import { KeyError } from '../key/keystore.ts';
import { checkPassphrase, generatePassphrase } from '../key/passphrase.ts';
import type { Signer } from '../key/signer.ts';
import type { DeviceStorage } from '../key/storage.ts';
import { LockTimer } from '../key/lock.ts';
import { ballotCodeDisplay, electionIdOf, sameElectionId, spokenForm } from '../util/crockford.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';
import { Announcer, add, clear, h, nextId, type Child } from './dom.ts';
import { electionPath, parseRoute, type Route } from './route.ts';

export interface AppEnv {
  root: HTMLElement;
  storage: DeviceStorage;
  build: { version: string; id: string };
  sealer?: Sealer;
  apiBase?: string;
  /** Locale tables, loaded lazily by main.ts (i18n/runtime.ts). Defaults to English only. */
  locales?: readonly LocaleDef[];
}

interface Loaded {
  apiId: string;
  api: ApiClient;
  ctx?: ElectionContext;
  ctxError?: string;
  origin: string;
  logPk: Uint8Array;
  title: string;
  records: { seq: number; record: unknown }[];
  /** Live update connection (SSE), started when the election is first opened. */
  live?: LiveElection;
  /** Incremental index of ballots, for receipt standing. */
  ballots?: BallotIndex;
}

export function startApp(env: AppEnv): void {
  const defs = env.locales ?? SOURCE_ONLY;
  const locale = negotiateLocale({ query: new URLSearchParams(location.search).get('lang') ?? undefined, browser: navigator.languages, offered: offeredLocales(defs).map((l) => l.tag) });
  const tr: Translator = createTranslator(locale, { defs });
  const t = (k: MessageKey, a?: Args): string => tr.t(k, a);
  document.documentElement.lang = locale;
  document.documentElement.dir = tr.dir;

  const polite = h('div', { id: 'live-polite', role: 'status', 'aria-live': 'polite', class: 'sr-only' });
  const urgent = h('div', { id: 'live-urgent', role: 'alert', class: 'sr-only' });
  const say = new Announcer(polite, urgent);
  const main = h('main', { id: 'main', tabindex: -1 });
  const nav = h('nav', { 'aria-label': t('qv.shell.nav') });
  const sealer = env.sealer ?? inlineSealer;
  const signers = new Map<string, Signer>();
  const loaded = new Map<string, Loaded>();
  const timer = new LockTimer(Date.now());

  /** The open ballot session (if any): auto-lock drops its randomness and unsubmitted sealed ballot, then repaints (W4). */
  let ballotLock: (() => void) | undefined;
  const lockAll = (): void => {
    for (const s of signers.values()) s.lock();
    signers.clear();
    ballotLock?.();
  };
  document.addEventListener('visibilitychange', () => {
    timer.setHidden(document.hidden, Date.now());
    if (!document.hidden && timer.shouldLock(Date.now())) lockAll();
  });
  setInterval(() => {
    if (timer.shouldLock(Date.now()) && signers.size > 0) {
      lockAll();
      say.say(t('qv.key.locked'));
    }
  }, 15_000);
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => timer.touch(Date.now()), { passive: true });

  /** Clears this device's keys and receipts; a failure is announced (E-KEY-STORAGE), never reported as cleared (W9). */
  const clearDevice = async (): Promise<boolean> => {
    try {
      await env.storage.clearAll();
    } catch {
      say.say(t('qv.err.E-KEY-STORAGE.title'), true);
      return false;
    }
    lockAll();
    say.say(t('qv.device.cleared'));
    return true;
  };
  const link = (href: string, text: string, cls = ''): HTMLElement =>
    h('a', { href, class: cls, onclick: (e: Event) => { e.preventDefault(); go(href); } }, text);
  const STEPS: MessageKey[] = ['qv.step.check', 'qv.step.key', 'qv.step.choose', 'qv.step.send'];
  const stepper = (n: number): HTMLElement => h('p', { class: 'step' }, t('qv.step.of', { current: n, total: 4, name: t(STEPS[n - 1]!) }));
  const more = (...kids: Child[]): HTMLElement => h('details', {}, h('summary', {}, t('qv.vote.moreDetails')), ...kids);
  const heading = (text: string, lvl = 1): HTMLElement => h(`h${lvl}`, { tabindex: -1, class: 'step-heading' }, text);
  const btn = (text: string, on: () => void, o: { primary?: boolean; disabled?: boolean; id?: string } = {}): HTMLElement =>
    h('button', { type: 'button', class: o.primary ? 'btn primary' : 'btn', onclick: on, disabled: o.disabled === true, id: o.id }, text);
  const field = (label: string, input: HTMLElement, hint?: string): HTMLElement => {
    const id = nextId('f');
    input.id = id;
    const wrap = h('div', { class: 'field' }, h('label', { for: id }, label));
    if (hint) {
      const hid = `${id}-hint`;
      wrap.append(h('p', { id: hid, class: 'hint' }, hint));
      input.setAttribute('aria-describedby', hid);
    }
    wrap.append(input);
    return wrap;
  };
  const codeEl = (text: string): HTMLElement => h('bdi', { dir: 'ltr', class: 'code' }, ...text.split('-').map((g, i, a) => h('span', {}, h('span', { 'aria-hidden': 'true' }, g + (i < a.length - 1 ? '-' : '')), h('span', { class: 'sr-only' }, [...g].join(' ') + (i < a.length - 1 ? ', ' : ''))))); // spoken form as real text (aria-label on a span is ignored)
  const copyBtn = (text: string): HTMLElement =>
    btn(t('qv.shell.copy'), () => {
      navigator.clipboard.writeText(text).then(() => say.say(t('qv.shell.copied')), () => say.say(t('qv.shell.copyFailed'), true));
    });
  const errorBox = (ux: string, extra: Args = {}, ref?: string): HTMLElement => {
    const k = (s: string): MessageKey => `qv.err.${ux}.${s}` as MessageKey;
    const box = h('div', { class: 'error', role: 'alert' });
    try {
      add(box, [h('h2', {}, t(k('title'), extra)), h('p', {}, t(k('body'), extra))]);
    } catch {
      add(box, [h('h2', {}, t('qv.err.E-GEN-UNKNOWN.title')), h('p', {}, t('qv.err.E-GEN-UNKNOWN.body'))]);
    }
    if (ref) box.append(h('p', { class: 'hint' }, t('qv.err.reference', { code: ux, request: ref })));
    return box;
  };
  const download = (name: string, text: string, type = 'application/json'): void => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  /** Set by views that can refresh themselves in place when live data arrives (receipt standing, results). */
  let repaint: (() => void) | undefined;
  const liveLine = h('p', { class: 'qv-live', id: 'qv-live' });
  const liveText = (s: ConnStatus): string => {
    switch (s.state) {
      case 'connecting': return t('qv.live.connecting');
      case 'live': return t('qv.live.live');
      case 'reconnecting': return t('qv.live.reconnecting', { seconds: Math.max(1, Math.ceil((s.waitMs ?? 1000) / 1000)) });
      case 'failed': return t('qv.live.failed');
      default: return '';
    }
  };
  let liveState: ConnStatus['state'] = 'closed';
  let liveId: string | undefined;
  const stopLive = (): void => {
    for (const L of loaded.values()) {
      L.live?.close();
      delete L.live;
    }
    liveId = undefined;
    liveState = 'closed';
    liveLine.textContent = '';
  };
  /** Starts (once per election) the SSE connection; events only trigger a re-read of the signed log. */
  function startLive(L: Loaded): void {
    if (L.live !== undefined) return;
    if (liveId !== undefined && liveId !== L.apiId) stopLive();
    liveId = L.apiId;
    const live = new LiveElection(L, {
      onStatus: (st) => {
        const prev = liveState;
        liveState = st.state;
        if (loaded.get(L.apiId)?.live !== live) return;
        liveLine.textContent = liveText(st);
        if (st.state === 'failed' || (st.state === 'live' && prev === 'reconnecting')) say.say(liveText(st));
      },
      onChange: () => {
        if (repaint !== undefined) {
          repaint();
          say.say(t('qv.live.updated'));
        }
      },
      onAlert: () => say.say(t('qv.live.alert'), true),
      onError: () => { if (loaded.get(L.apiId)?.live === live) { liveLine.textContent = t('qv.live.failed'); say.say(t('qv.live.failed')); } },
    });
    L.live = live;
    live.start();
  }

  function render(title: string, ...kids: Child[]): void {
    repaint = undefined;
    document.title = t('qv.shell.titleNoElection', { step: title });
    clear(main);
    add(main, kids);
    const hd = main.querySelector('.step-heading') as HTMLElement | null;
    (hd ?? main).focus();
    window.scrollTo(0, 0);
  }

  function go(path: string): void {
    history.pushState({}, '', path);
    void route();
  }
  window.addEventListener('popstate', () => void route());

  async function load(id: string, readKey?: string): Promise<Loaded> {
    const cached = loaded.get(id);
    if (cached) return cached;
    const api = new ApiClient({ baseUrl: env.apiBase ?? '', readKey });
    const el = await api.election(id);
    const all = await api.allEntries(id);
    const records = all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
    const r = await deriveElectionContext(records);
    const L: Loaded = { apiId: id, api, origin: el.origin, logPk: new Uint8Array(32), title: el.title ?? '', records };
    if (r.ok) {
      // Receipts and checkpoints are checked against the manifest's log key and origin, not the server's claim (WV-4).
      const bound = bindServerLog(r.value.manifest, { logPkB64u: el.log_pk, origin: el.origin });
      if (bound.ok) {
        L.ctx = r.value;
        L.logPk = bound.logPk;
        L.origin = bound.origin;
      } else L.ctxError = bound.detail;
    } else L.ctxError = r.detail;
    loaded.set(id, L);
    return L;
  }

  async function route(): Promise<void> {
    const r: Route = parseRoute(location.pathname);
    if (r.name !== 'election') stopLive();
    nav.replaceChildren(link('/', t('qv.nav.home')), link('/new', t('qv.nav.create')), link('/verify', t('qv.nav.verify')), link('/help', t('qv.shell.helpLink')));
    try {
      if (r.name === 'home') return home();
      if (r.name === 'help') return helpView();
      if (r.name === 'verify') return verifyView();
      if (r.name === 'create') return await createView();
      if (r.name === 'election') return await electionView(r);
      render('404', heading(t('qv.election.notFound')));
    } catch (e) {
      const ux = e instanceof ApiError && e.code === 'NOT_FOUND' ? null : uxCodeFor(e);
      render('Error', ux === null ? heading(t('qv.election.notFound')) : errorBox(ux, {}, e instanceof ApiError ? e.requestId : undefined));
    }
  }

  // ---------------------------------------------------------------- views
  function home(): void {
    const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: false });
    const err = h('p', { class: 'hint', role: 'alert' });
    render(t('qv.nav.home'), heading(t('qv.home.title')), h('p', {}, t('qv.home.intro')),
      h('section', { 'aria-labelledby': 'how-h' }, h('h2', { id: 'how-h' }, t('qv.how.title')), h('ol', {}, h('li', {}, t('qv.how.s1')), h('li', {}, t('qv.how.s2')), h('li', {}, t('qv.how.s3')))), h('p', {}, t('qv.home.haveLink')),
      field(t('qv.home.openId'), input, t('qv.home.openIdHint')), err,
      btn(t('qv.home.open'), () => {
        try {
          const u = new URL((input as HTMLInputElement).value, location.href);
          const m = /^\/e\/[a-z2-7]{26}/.exec(u.pathname);
          if (!m) throw new Error('x');
          go(u.pathname + u.hash);
        } catch {
          err.textContent = t('qv.home.badLink');
        }
      }, { primary: true }));
  }

  function helpView(): void {
    const contrast = h('input', { type: 'checkbox', onchange: (e: Event) => document.documentElement.toggleAttribute('data-contrast', (e.target as HTMLInputElement).checked) });
    render(t('qv.help.title'), heading(t('qv.help.title')), h('p', {}, t('qv.help.keyboard')), h('p', {}, t('qv.help.screenReader')),
      h('label', {}, contrast, ' ', t('qv.help.contrast')), h('p', { class: 'hint' }, t('qv.help.contrastHelp')),
      h('h2', {}, t('qv.help.about')), h('p', {}, t('qv.help.aboutBody')), h('h2', {}, t('qv.help.howVerifier')), h('p', {}, t('qv.help.howVerifierBody')),
      h('h2', {}, t('qv.help.report')), h('p', {}, t('qv.help.reportBody')), h('p', {}, t('qv.phish.neverask')));
  }

  function guaranteePanel(L: Loaded | undefined): HTMLElement {
    const m = L?.ctx?.manifest;
    const t_ = m?.t ?? 3, n_ = m?.n ?? 5;
    const names = m?.trustees.map((x) => x.name) ?? [];
    const ncs: MessageKey[] = ['qv.privacy.nc2', 'qv.privacy.nc3', 'qv.privacy.nc4', 'qv.privacy.nc5', 'qv.privacy.nc6', 'qv.privacy.nc7'];
    return h('section', { 'aria-labelledby': 'g-h' },
      h('h2', { id: 'g-h' }, t('qv.privacy.headline')),
      h('p', {}, t('qv.privacy.g1')), h('p', {}, t('qv.privacy.g2', { t: t_, n: n_, trustee_names: names })),
      h('p', {}, t('qv.privacy.g3')), h('p', {}, t('qv.privacy.g4')), h('p', {}, t('qv.privacy.public')),
      h('h3', {}, t('qv.privacy.notclaimed.head')),
      h('ul', {}, h('li', {}, t('qv.privacy.nc1', { t: t_ })), ...ncs.map((k) => h('li', {}, t(k)))),
      h('p', {}, t('qv.privacy.review', { status: 'other' })),
      h('details', {}, h('summary', {}, t('qv.privacy.why')), h('p', {}, t('qv.privacy.whyBody'))));
  }

  function electionHeader(L: Loaded): HTMLElement {
    const idText = L.ctx ? electionIdOf(hexToBytes(L.ctx.manifestHashHex, 32)) : '';
    return h('header', { class: 'election-head' }, h('p', {}, L.ctx?.manifest.title ?? L.title),
      idText ? h('p', {}, t('qv.shell.electionId'), ': ', codeEl(idText), ' ', copyBtn(idText)) : null);
  }

  async function electionView(r: Extract<Route, { name: 'election' }>): Promise<void> {
    const frag = parseFragment(location.hash);
    const L = await load(r.id, frag.readKey);
    startLive(L);
    const sub = r.view;
    const tabs = h('ul', { class: 'tabs' }, ...(['overview', 'rules', 'key', 'vote', 'receipt', 'results'] as const).map((v) =>
      h('li', {}, link(electionPath(r.id, v === 'overview' ? '' : v) + (frag.token ? location.hash : ''), t(({ overview: 'qv.nav.home', rules: 'qv.nav.rules', key: 'qv.key.title', vote: 'qv.nav.vote', receipt: 'qv.nav.receipt', results: 'qv.nav.results' } as const)[v])))));
    const head = [electionHeader(L), tabs, liveLine];
    if (L.ctx === undefined) return render('Election', ...head, errorBox('E-ORG-MANIFEST', { detail: L.ctxError ?? '' }));
    const ctx = L.ctx;
    const settings = await env.storage.getSettings();
    if (sub === 'overview') {
      const fmt = (iso: string): string => { const d = formatDeadline(iso, Intl.DateTimeFormat().resolvedOptions().timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone, locale); return d.electionTime; };
      const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: false });
      const confirmed = settings.confirmed[r.id] === true;
      const msg = h('div', { role: 'status' });
      const setC = async (v: boolean): Promise<void> => { await env.storage.putSettings({ ...settings, confirmed: { ...settings.confirmed, [r.id]: v } }); };
      return render(ctx.manifest.title, ...head, stepper(1), heading(ctx.manifest.title), h('p', {}, t('qv.election.invited')),
        h('p', {}, t('qv.election.opens', { when: fmt(ctx.manifest.voting_open) })), h('p', {}, t('qv.election.closes', { when: fmt(ctx.manifest.voting_close) })),
        h('p', {}, t('qv.election.contests', { count: ctx.manifest.contests.length }), ' · ', t('qv.election.roll', { count: ctx.rollSize })),
        confirmed ? h('p', {}, t('qv.election.v1.confirmed')) : h('section', {}, h('p', {}, t('qv.election.v1.ask')),
          field(t('qv.election.v1.typeIt'), typed),
          h('div', { class: 'row' },
            btn(t('qv.election.v1.match'), async () => {
              const v = (typed as HTMLInputElement).value.trim();
              if (v !== '' && !sameElectionId(v, electionIdOf(hexToBytes(ctx.manifestHashHex, 32)))) { clear(msg); msg.append(h('p', { class: 'error' }, t('qv.phish.mismatch'))); say.say(t('qv.phish.mismatch'), true); return; }
              await setC(true); go(location.pathname + location.hash);
            }, { primary: true }),
            btn(t('qv.election.v1.mismatch'), () => { clear(msg); msg.append(h('p', { class: 'error' }, t('qv.phish.mismatch'))); say.say(t('qv.phish.mismatch'), true); }),
            btn(t('qv.election.v1.none'), () => go(electionPath(r.id, 'rules') + location.hash))), msg),
        h('p', {}, link(electionPath(r.id, 'rules') + location.hash, t('qv.nav.rules'))));
    }
    if (sub === 'rules') return render(t('qv.nav.rules'), ...head, stepper(1), heading(t('qv.nav.rules')), h('p', {}, t('qv.vote.privacyNote')), more(guaranteePanel(L)), link(electionPath(r.id, 'key') + location.hash, t('qv.shell.continue'), 'btn primary'));
    if (sub === 'key') return keyView(L, ctx, head, frag.token);
    if (sub === 'vote') return voteView(L, ctx, head);
    if (sub === 'receipt') return await receiptView(L, ctx, head);
    if (sub === 'results') return await resultsView(L, ctx, head);
    return render('Admin', ...head, heading(t('qv.nav.admin')), h('p', {}, t('qv.org.nopeek')), h('p', {}, t('qv.org.export')));
  }

  function keyView(L: Loaded, ctx: ElectionContext, head: Child[], token: Uint8Array | undefined): void {
    const slot = keySlot(L.apiId);
    const status = h('div', { role: 'status', class: 'hint' });
    const out = h('div', {});
    const pass = h('input', { type: 'password', autocomplete: 'new-password', spellcheck: false, autocapitalize: 'off', autocorrect: 'off' }) as HTMLInputElement;
    const show = h('input', { type: 'checkbox', onchange: () => (pass.type = (show as HTMLInputElement).checked ? 'text' : 'password') });
    const file = h('input', { type: 'file', accept: '.qvkey,application/json' }) as HTMLInputElement;
    const mode = { v: 'create' };
    const showErr = (e: unknown): void => {
      const ux = e instanceof KeyError && e.code === 'E_KEY_LOCKED' ? 'E-KEY-LOCKED' : 'E-KEY-STORAGE';
      clear(status); status.append(errorBox(ux));
    };
    const finish = async (signer: Signer, created?: { keyFile: string; container: Parameters<typeof recoveryCodeFor>[0] }): Promise<void> => {
      signers.set(L.apiId, signer);
      if (token) {
        try {
          await L.api.register(L.apiId, await registrationBody({ apiElectionId: L.apiId, token, signer }));
        } catch (e) {
          // 409: this key or invite was already registered (same link used again): fine. Anything else is shown, not hidden.
          if (!(e instanceof ApiError && e.status === 409)) {
            clear(out);
            add(out, [errorBox(uxCodeFor(e), {}, e instanceof ApiError ? e.requestId : undefined)]);
            return;
          }
        }
      }
      clear(out);
      add(out, [h('p', {}, t('qv.key.registered')), created ? h('div', {}, btn(t('qv.key.download'), () => download(`voting-key-${L.apiId.slice(0, 6)}.qvkey`, created.keyFile)),
        btn(t('qv.key.showRecovery'), async () => { try { const c = await recoveryCodeFor(created.container, pass.value); clear(out); add(out, [h('h2', {}, t('qv.key.recoveryHead')), h('p', {}, t('qv.key.recoveryHelp')), codeEl(c), btn(t('qv.key.recoveryHide'), () => go(electionPath(L.apiId, 'vote')))]); } catch (e) { showErr(e); } })) : null,
        link(electionPath(L.apiId, 'vote'), t('qv.nav.vote'), 'btn primary')]);
    };
    const act = h('div', {});
    const renderForm = async (): Promise<void> => {
      const have = await env.storage.getKey(slot);
      clear(act);
      if (have) {
        add(act, [field(t('qv.key.passphrase'), pass), h('label', {}, show, ' ', t('qv.key.show')),
          btn(t('qv.key.unlock'), async () => { try { clear(status); status.textContent = t('qv.key.working'); const u = await unlockKey({ storage: env.storage, slot, passphrase: pass.value }); status.textContent = ''; await finish(u.signer); } catch (e) { showErr(e); } }, { primary: true })]);
        return;
      }
      const gen = btn(t('qv.key.generate'), () => { pass.value = generatePassphrase(systemRng); (show as HTMLInputElement).checked = true; pass.type = 'text'; status.textContent = t('qv.key.generated', { words: pass.value }); });
      add(act, [h('fieldset', {}, h('legend', {}, t('qv.key.title')),
        h('label', {}, h('input', { type: 'radio', name: 'm', checked: true, onchange: () => (mode.v = 'create') }), ' ', t('qv.key.optCreate')), h('br'),
        h('label', {}, h('input', { type: 'radio', name: 'm', onchange: () => (mode.v = 'import') }), ' ', t('qv.key.optImport')), h('br'),
        h('label', {}, h('input', { type: 'radio', name: 'm', onchange: () => { mode.v = 'cli'; status.textContent = t('qv.key.cliHelp'); } }), ' ', t('qv.key.optCli'))),
        field(t('qv.key.chooseFile'), file), field(t('qv.key.passphrase'), pass, t('qv.key.passphraseHint')), h('label', {}, show, ' ', t('qv.key.show')), gen,
        btn(t('qv.key.create'), async () => {
          try {
            if (mode.v === 'cli') return;
            if (mode.v === 'import') {
              const f = file.files?.[0];
              if (!f) { status.textContent = t('qv.key.importMissing'); return; }
              await importKeyFile({ storage: env.storage, slot, text: await f.text(), passphrase: pass.value });
              const u = await unlockKey({ storage: env.storage, slot, passphrase: pass.value });
              return await finish(u.signer);
            }
            const chk = checkPassphrase(pass.value);
            if (!chk.ok) { status.textContent = t(`qv.key.pp.${chk.problems[0] ?? 'tooShort'}` as MessageKey); return; }
            status.textContent = t('qv.key.working');
            const k = await createKey({ storage: env.storage, slot, passphrase: pass.value });
            const persisted = await env.storage.requestPersistence();
            const u = await unlockKey({ storage: env.storage, slot, passphrase: pass.value });
            status.textContent = `${t('qv.key.fingerprint', { words: k.fingerprint.join(' ') })} ${k.atFloor ? t('qv.key.floorWarn') : ''} ${persisted ? '' : t('qv.key.persistDenied')}`;
            await finish(u.signer, { keyFile: k.keyFileText, container: k.container });
          } catch (e) { showErr(e); }
        }, { primary: true })]);
    };
    render(t('qv.key.title'), ...head, stepper(2), heading(t('qv.key.title')), h('p', {}, t('qv.vote.keyWhat')), h('p', {}, t('qv.key.backup')), more(h('p', {}, t('qv.key.local')), h('p', {}, t('qv.key.residual')), h('p', {}, t('qv.device.shared'))),
      token ? null : h('p', { class: 'hint' }, t('qv.key.noInvite')), act, status, out,
      btn(t('qv.key.forget'), () => { void clearDevice().then((ok) => { if (ok) void renderForm(); }); }));
    void renderForm();
    void ctx;
  }

  function voteView(L: Loaded, ctx: ElectionContext, head: Child[]): void {
    const signer = signers.get(L.apiId);
    if (!signer) return render(t('qv.nav.vote'), ...head, heading(t('qv.nav.vote')), h('p', {}, t('qv.key.locked')), link(electionPath(L.apiId, 'key') + location.hash, t('qv.key.unlock'), 'btn primary'));
    const pkHex = bytesToHex(signer.publicKey);
    const supersedes = lastOwnBallotCode(L.records, pkHex, bytesToHex(ctx.params.ctx), (env) => ed25519Verify(signer.publicKey, hexToBytes(env.sig, 64), castDigest(ctx.params.ctx, ballotCode(ctx.params.ctx, env.body))));
    const ctl = new BallotController({ ctx, apiElectionId: L.apiId, origin: L.origin, signer, api: L.api, sealer, storage: env.storage, rng: systemRng, logPk: L.logPk, supersedes: supersedes || NO_SUPERSEDES, clientBuild: env.build.id });
    const draw = (): void => {
      const s = ctl.state;
      ballotLock = (): void => { const before = ctl.state; ctl.lockSession(); if (ctl.state !== before) draw(); };
      const area = h('div', {});
      if (s.kind === 'selecting') {
        const sel: Record<string, string[]> = { ...s.selections };
        const groups = ctx.manifest.contests.map((c) => {
          const multi = c.method === 'approval' || c.method === 'k-of-n';
          const max = c.selection_limit ?? c.options.length;
          const counter = h('p', { class: 'hint', 'aria-live': 'off' });
          const upd = (): void => { counter.textContent = multi ? t('qv.ballot.counter', { selected: (sel[c.id] ?? []).length, max }) : ''; };
          const fs = h('fieldset', {}, h('legend', {}, c.title), h('p', { class: 'hint' }, c.method === 'k-of-n' ? t('qv.ballot.chooseUpTo', { k: max }) : multi ? t('qv.ballot.chooseAny') : t('qv.ballot.chooseOne')));
          for (const o of c.options) {
            const inp = h('input', { type: multi ? 'checkbox' : 'radio', name: c.id, value: o.id, checked: (sel[c.id] ?? []).includes(o.id), onchange: (e: Event) => {
              const el = e.target as HTMLInputElement;
              if (multi) { const cur = new Set(sel[c.id] ?? []); if (el.checked) { if (cur.size >= max) { el.checked = false; say.say(t('qv.err.E-VOT-OVERVOTE.body', { k: max, x: cur.size + 1 }), true); return; } cur.add(o.id); } else cur.delete(o.id); sel[c.id] = [...cur]; } else sel[c.id] = [o.id];
              upd();
            } });
            fs.append(h('label', { class: 'choice' }, inp, ' ', o.label));
          }
          upd();
          fs.append(counter);
          return fs;
        });
        add(area, [...groups, btn(t('qv.ballot.review'), () => { ctl.select(sel); ctl.review(); draw(); }, { primary: true })]);
      } else if (s.kind === 'reviewing') {
        const tbl = h('table', {}, h('caption', {}, t('qv.ballot.reviewTitle')), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('qv.audit.contest')), h('th', { scope: 'col' }, t('qv.audit.choice')))),
          h('tbody', {}, ...ctx.manifest.contests.map((c) => h('tr', {}, h('th', { scope: 'row' }, c.title), h('td', {}, (s.selections[c.id] ?? []).map((id) => c.options.find((o) => o.id === id)?.label ?? id).join(', ') || t('qv.ballot.noChoice'))))));
        tbl.setAttribute('translate', 'no');
        add(area, [h('p', {}, t('qv.ballot.reviewPrivate')), tbl, h('div', { class: 'row' }, btn(t('qv.shell.back'), () => { ctl.edit(); draw(); }), btn(t('qv.ballot.seal'), async () => { const p = ctl.seal(); draw(); await p; draw(); }, { primary: true })), h('p', { class: 'hint' }, t('qv.ballot.sealHelp'))]);
      } else if (s.kind === 'sealing') add(area, [h('p', { role: 'status' }, t('qv.ballot.sealing')), h('progress', { 'aria-label': t('qv.a11y.working') })]);
      else if (s.kind === 'sealed') {
        const disp = ctl.codeDisplay ?? '';
        const castB = btn(t('qv.ballot.cast'), async () => { const p = ctl.cast(); draw(); await p; draw(); }, { primary: true, disabled: !canCast(s), id: 'cast-btn' });
        const testB = btn(t('qv.ballot.test'), async () => { const p = ctl.audit({ post: (document.getElementById('post-chk') as HTMLInputElement | null)?.checked ?? true, publishReveal: (document.getElementById('rev-chk') as HTMLInputElement | null)?.checked ?? false }); draw(); await p; draw(); }, { disabled: !canAudit(s), id: 'test-btn' });
        add(area, [h('p', {}, t('qv.ballot.codeHelp')), h('p', {}, t('qv.ballot.code'), ': ', codeEl(disp), ' ', copyBtn(disp)),
          h('details', {}, h('summary', {}, t('qv.ballot.readSlowly')), h('p', {}, spokenForm(disp))),
          h('h2', {}, t('qv.ballot.choose')), h('p', {}, t('qv.vote.codeWhat')),
          h('div', { class: 'row equal' }, h('div', {}, castB, h('p', { class: 'hint' }, t('qv.ballot.castHelp'))), h('div', {}, testB, h('p', { class: 'hint' }, t('qv.ballot.testHelp')))),
          h('h3', {}, t('qv.vote.doubleCheck')), h('p', {}, t('qv.vote.optional')), h('p', {}, t('qv.audit.why')),
          h('p', {}, t('qv.audit.public')),
          h('label', {}, h('input', { type: 'checkbox', id: 'post-chk', checked: true }), ' ', t('qv.audit.postOpt')), h('br'),
          h('label', {}, h('input', { type: 'checkbox', id: 'rev-chk' }), ' ', t('qv.audit.publishReveal'))]);
        // The code is in the DOM now; only then do the buttons become usable (REQ-011).
        queueMicrotask(() => { ctl.codeRendered(); (castB as HTMLButtonElement).disabled = false; (testB as HTMLButtonElement).disabled = false; say.say(t('qv.ballot.sealedAnnounce')); (castB as HTMLElement).focus(); });
      } else if (s.kind === 'casting' || s.kind === 'auditing') add(area, [h('p', { role: 'status' }, s.kind === 'casting' ? t('qv.ballot.casting') : t('qv.ballot.testing')), h('progress', { 'aria-label': t('qv.a11y.working') })]);
      else if (s.kind === 'audited') {
        const a = ctl.lastAudit;
        add(area, [h('h2', { tabindex: -1, class: 'step-heading' }, t('qv.audit.title')), h('p', {}, t('qv.audit.why')), h('h3', {}, t('qv.audit.autoChecks')), h('ul', {}, ...(a?.result.checks ?? []).map((c) => h('li', {}, `${t(({ context: 'qv.audit.check.code', code: 'qv.audit.check.code', proofs: 'qv.audit.check.proofs', plaintext: 'qv.audit.check.plain' } as const)[c.id])}: ${c.ok ? t('qv.verify.status.pass') : t('qv.verify.status.fail')}`))),
          h('p', {}, t('qv.audit.sameSoftware')), a?.posted ? h('p', {}, t('qv.audit.posted')) : h('p', {}, t('qv.audit.notPosted')),
          h('fieldset', {}, h('legend', {}, t('qv.audit.matchQ')), h('label', {}, h('input', { type: 'radio', name: 'mq', onchange: () => { ctl.confirmMatch(true); } }), ' ', t('qv.audit.matchYes')), h('br'), h('label', {}, h('input', { type: 'radio', name: 'mq', onchange: () => { ctl.confirmMatch(false); } }), ' ', t('qv.audit.matchNo'))),
          h('p', {}, t(a?.result.ok ? 'qv.audit.ok' : 'qv.audit.mismatch')),
          btn(t('qv.audit.download'), () => a && download('qv-audit.json', a.text)), h('p', {}, t('qv.audit.secondDeviceHelp')),
          btn(t('qv.ballot.newSeal'), () => { ctl.newSeal(); draw(); }, { primary: true }), h('p', { class: 'hint' }, t('qv.ballot.newCodeDifferent'))]);
      } else if (s.kind === 'cast') {
        const rep = ctl.lastCast;
        const titleKey: MessageKey = s.outcome === 'ACCEPTED_RECORDED' ? 'qv.receipt.title' : s.outcome === 'PENDING_UNCONFIRMED' ? 'qv.receipt.pendingTitle' : s.outcome === 'AFTER_CLOSE' ? 'qv.receipt.afterCloseTitle' : s.outcome === 'DUPLICATE_IGNORED' ? 'qv.receipt.dupTitle' : s.outcome === 'SUPERSEDED' ? 'qv.receipt.supersededTitle' : 'qv.receipt.rejectedTitle';
        add(area, [h('h2', { tabindex: -1, class: 'step-heading' }, t(titleKey)), rep?.codeDisplay ? h('p', {}, t('qv.ballot.code'), ': ', codeEl(rep.codeDisplay)) : null,
          rep?.seq !== undefined && s.outcome === 'ACCEPTED_RECORDED' ? h('p', {}, t('qv.receipt.logged', { time: new Date().toLocaleString(locale), seq: rep.seq })) : null,
          h('p', {}, t('qv.receipt.proves')), h('p', {}, t('qv.receipt.doesnt')), h('p', {}, t('qv.receipt.shared')),
          rep?.error ? errorBox(rep.error.ux, {}, rep.error.requestId) : null,
          rep?.receipt ? btn(t('qv.receipt.save'), () => download(`qv-receipt-${L.apiId.slice(0, 6)}.json`, JSON.stringify(rep.receipt, null, 2))) : null,
          btn(t('qv.receipt.clearDevice'), () => { void clearDevice(); }), link(electionPath(L.apiId, 'receipt'), t('qv.receipt.checkNow'))]);
      } else add(area, [errorBox(s.error.startsWith('E-') ? s.error : 'E-GEN-UNKNOWN'), s.retryCast ? btn(t('qv.ballot.cast'), async () => { const p = ctl.cast(); draw(); await p; draw(); }, { primary: true }) : btn(t('qv.ballot.newSeal'), () => { ctl.newSeal(); draw(); })]);
      render(t('qv.nav.vote'), ...head, stepper(s.kind === 'selecting' || s.kind === 'reviewing' || s.kind === 'sealing' ? 3 : 4), heading(t('qv.ballot.title')), h('p', {}, t('qv.vote.privacyNote')), area, more(h('p', {}, t('qv.ballot.revoteNote')), guaranteePanel(L)));
      const nh = area.querySelector('.step-heading') as HTMLElement | null;
      nh?.focus();
    };
    draw();
  }

  async function receiptView(L: Loaded, ctx: ElectionContext, head: Child[]): Promise<void> {
    const stored = await env.storage.getReceipts(L.apiId);
    const out = h('div', { role: 'status' });
    const check = async (seq: number, leafB64u: string): Promise<void> => {
      try {
        const leaf = b64uDecode(leafB64u);
        if (!leaf) throw new Error('bad receipt');
        const r = await checkInclusion({ api: L.api, apiElectionId: L.apiId, logPk: L.logPk, leafHash: leaf, seq, pinned: await env.storage.getHead(L.apiId) });
        clear(out);
        if (r.state === 'included') { await env.storage.putHead({ ...r.head, electionId: L.apiId }); out.append(h('p', {}, t('qv.receipt.included', { seq: r.seq, size: r.treeSize })), h('p', {}, t('qv.receipt.consistent'))); } else out.append(h('p', {}, t('qv.receipt.notFound')));
      } catch (e) {
        clear(out);
        out.append(errorBox(e instanceof BoardIntegrityError ? e.code : uxCodeFor(e)));
        say.say(t('qv.err.E-GEN-UNKNOWN.title'), true);
      }
    };
    const file = h('input', { type: 'file', accept: 'application/json', onchange: async (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; const p = f ? parseReceiptFile(await f.text()) : undefined; if (p) { await check(p.seq, p.leaf_hash); addStanding(p.seq, p.ballot_code); } } });
    // Standing: is this receipt still the voter's newest ballot? Derived from the public log we hold; refreshed in place on live updates.
    const standings: { seq: number; code: string; el: HTMLElement }[] = [];
    const standingText = (seq: number, code: string): { text: string; kind: string; note?: string } => {
      const cur = L.ctx;
      if (cur === undefined) return { text: t('qv.receipt.standing.unknown'), kind: 'unknown' };
      L.ballots ??= new BallotIndex(cur.params.ctx);
      L.ballots.update(L.records);
      const st = L.ballots.standing(seq, code, { openSeq: cur.openSeq, closeSeq: cur.closeSeq, maxPerVoter: cur.manifest.ballots.max_per_voter });
      switch (st.state) {
        case 'current': return { text: t('qv.receipt.standing.current'), kind: 'current' };
        case 'superseded': return { text: t('qv.receipt.standing.superseded', { seq: st.bySeq }), kind: 'superseded', note: t('qv.receipt.standing.supersededNote') };
        case 'mismatch': return { text: t('qv.receipt.standing.mismatch'), kind: 'mismatch' };
        default: return { text: t('qv.receipt.standing.unknown'), kind: 'unknown' };
      }
    };
    const paintStanding = (x: { seq: number; code: string; el: HTMLElement }): void => {
      const r = standingText(x.seq, x.code);
      clear(x.el);
      x.el.className = `qv-standing ${r.kind}`;
      add(x.el, [h('strong', {}, t('qv.receipt.standing.title'), ': '), r.text, r.note ? h('span', { class: 'hint' }, ' ', r.note) : null]);
    };
    const addStanding = (seq: number, code: string): void => {
      const el = h('p', {});
      const x = { seq, code, el };
      standings.push(x);
      paintStanding(x);
      standingBox.append(el);
    };
    const standingBox = h('div', {});
    const items = stored.map((s) => {
      const f = parseReceiptFile(s.json);
      const el = h('span', {});
      if (f) standings.push({ seq: f.seq, code: s.code, el });
      return h('li', {}, codeEl(ballotCodeDisplay(hexToBytes(s.code, 32), true)), ' ', btn(t('qv.receipt.check'), () => { if (f) void check(f.seq, f.leaf_hash); }), h('div', {}, el));
    });
    for (const x of standings) paintStanding(x);
    render(t('qv.nav.receipt'), ...head, heading(t('qv.receipt.checkTitle')), h('p', {}, t('qv.receipt.proves')), field(t('qv.receipt.orFile'), file), standingBox,
      h('h2', {}, t('qv.receipt.stored')), stored.length === 0 ? h('p', {}, t('qv.receipt.none')) : h('ul', {}, ...items), out);
    repaint = () => { for (const x of standings) paintStanding(x); };
    void ctx;
  }

  async function resultsView(L: Loaded, ctx: ElectionContext, head: Child[]): Promise<void> {
    if (!ctx.tally) {
      render(t('qv.results.title'), ...head, heading(t('qv.results.title')), h('p', {}, t('qv.results.notYet')));
      // the tally can arrive while the page is open (live): then draw it without a reload
      repaint = () => { if (L.ctx?.tally) void resultsView(L, L.ctx, head); };
      return;
    }
    // The chart code is a separate chunk, fetched only when a tally exists. Without it the table below still shows every number.
    const charts = await import('./charts.ts').catch(() => undefined);
    const sections = (): HTMLElement[] => {
      const cur = L.ctx ?? ctx;
      const tally = cur.tally ?? ctx.tally!;
      return tally.results.map((res) => {
        const c = cur.manifest.contests.find((x) => x.id === res.contest);
        const opts = tally.contests.find((x) => x.id === res.contest)?.options ?? [];
        const label = (id: string): string => c?.options.find((o) => o.id === id)?.label ?? id;
        const text = opts.map((o) => `${label(o.id)} ${o.T}`).join(', ');
        const winners = res.outcome.kind === 'winners' ? res.outcome.winners ?? [] : [];
        return h('section', {}, h('h2', {}, c?.title ?? res.contest),
          charts ? charts.renderBarChart({ t, rtl: tr.dir === 'rtl' }, c?.title ?? res.contest, { options: opts.map((o) => ({ id: o.id, label: label(o.id), count: o.T })), winners }) : null,
          h('table', {}, h('caption', {}, c?.title ?? res.contest), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('qv.results.option')), h('th', { scope: 'col' }, t('qv.results.count')))),
            h('tbody', {}, ...opts.map((o) => h('tr', {}, h('th', { scope: 'row' }, label(o.id)), h('td', {}, String(o.T)))))),
          h('p', {}, t('qv.results.summary', { text })), h('p', {}, t('qv.results.participation', { count: res.participation })),
          h('p', {}, t('qv.results.quorum', { met: String(res.quorum_met) })),
          h('p', {}, res.outcome.kind === 'winners' ? t('qv.results.outcome.winners', { names: winners.map(label) }) : t(`qv.results.outcome.${res.outcome.kind}` as MessageKey)));
      });
    };
    render(t('qv.results.title'), ...head, heading(t('qv.results.title')), ...sections(), h('details', {}, h('summary', {}, t('qv.results.how')), h('p', {}, t('qv.results.howBody')), link('/verify', t('qv.nav.verify'))));
  }

  function verifyView(): void {
    const file = h('input', { type: 'file', accept: 'application/json' }) as HTMLInputElement;
    const anchor = h('input', { type: 'text', autocomplete: 'off', spellcheck: false }) as HTMLInputElement;
    const out = h('div', { role: 'status' });
    render(t('qv.nav.verify'), heading(t('qv.verify.title')), h('p', {}, t('qv.phish.verifierwarn')), field(t('qv.verify.file'), file), field(t('qv.verify.anchor'), anchor, t('qv.verify.anchorHint')),
      btn(t('qv.verify.run'), async () => {
        const f = file.files?.[0];
        if (!f) return;
        clear(out); out.textContent = t('qv.verify.running');
        const text = await f.text();
        const rep = await verifyElectionText(text);
        let mism = false;
        try { const mh = (JSON.parse(text) as { manifest_hash: string }).manifest_hash; mism = anchor.value.trim() !== '' && !sameElectionId(anchor.value, electionIdOf(hexToBytes(mh, 32))); } catch { /* shown by verdict */ }
        clear(out);
        const rows = Object.entries(rep.checks);
        const pass = rows.filter(([, v]) => v === 'pass').length;
        add(out, [mism ? errorBox('E-VER-ANCHOR') : null, h('h2', {}, t(`qv.verify.verdict.${rep.verdict}` as MessageKey)), h('p', {}, t('qv.verify.itemized', { passed: pass, total: rows.length })),
          h('ul', {}, ...rows.map(([k, v]) => h('li', {}, `${t(`qv.verify.chk.${k}` as MessageKey)}: ${t(`qv.verify.status.${v}` as MessageKey)}`))), h('p', {}, t('qv.verify.counts', { cast: rep.counts.cast, counted: rep.counts.counted, spoiled: rep.counts.spoiled })), h('p', {}, t('qv.verify.scope')),
          btn(t('qv.verify.download'), () => download('qv-verify-report.json', JSON.stringify(rep, null, 2)))]);
        say.say(t(`qv.verify.verdict.${rep.verdict}` as MessageKey));
      }, { primary: true }), out);
  }

  async function createView(): Promise<void> {
    const out = h('div', { role: 'status' });
    const title = h('input', { type: 'text' }) as HTMLInputElement;
    const tpl = h('select', {}, ...TEMPLATES.map((x) => h('option', { value: x }, t(`qv.org.tpl.${x}` as MessageKey)))) as HTMLSelectElement;
    const q = h('input', { type: 'text' }) as HTMLInputElement;
    const opts = h('textarea', { rows: 4 }) as HTMLTextAreaElement;
    const rollT = h('textarea', { rows: 6, spellcheck: false }) as HTMLTextAreaElement;
    const trustees = h('textarea', { rows: 3, spellcheck: false }) as HTMLTextAreaElement;
    const tt = h('input', { type: 'number', min: 1, value: 2 }) as HTMLInputElement;
    const logPk = h('input', { type: 'text', spellcheck: false }) as HTMLInputElement;
    const opens = h('input', { type: 'datetime-local' }) as HTMLInputElement;
    const closes = h('input', { type: 'datetime-local' }) as HTMLInputElement;
    const org = await env.storage.getKey(ORGANIZER_SLOT);
    // Set by a successful preview; the publish section uses it. The state of a failed publish is kept here, in memory only.
    let prepared: { form: PublishForm; rollHex: string[] } | undefined;
    let pubState: PublishState | undefined;
    const publishBox = h('div', {});
    const publishSection = (): HTMLElement => {
      const orgIn = h('input', { type: 'text', autocomplete: 'off', spellcheck: false }) as HTMLInputElement;
      const pw = h('input', { type: 'password', autocomplete: 'current-password', spellcheck: false, autocapitalize: 'off', autocorrect: 'off' }) as HTMLInputElement;
      const pubOut = h('div', { role: 'status' });
      const pubBtn = btn(t('qv.org.publish'), async () => {
        const prep = prepared;
        if (!prep) return;
        const button = pubBtn as HTMLButtonElement;
        clear(pubOut);
        button.disabled = true;
        add(pubOut, [h('p', {}, t('qv.org.publishing'))]);
        let o: PublishOutcome;
        try {
          o = await runPublish({ orgId: orgIn.value, passphrase: pw.value, form: prep.form, rollHex: prep.rollHex, prior: pubState, storage: env.storage, apiBase: env.apiBase ?? '', origin: location.origin });
        } finally {
          pw.value = '';
        }
        clear(pubOut);
        if (o.kind === 'published') {
          pubState = o.state;
          add(pubOut, [h('p', {}, t('qv.org.published', { id: o.electionId })), h('h2', {}, t('qv.org.inviteList')), h('p', {}, t('qv.org.publishInvites')),
            h('ul', {}, ...o.invites.map((i) => h('li', {}, codeEl(i.code ?? ''))))]);
          say.say(t('qv.org.published', { id: o.electionId }));
          return;
        }
        button.disabled = false;
        if (o.kind === 'noOrg') return void add(pubOut, [h('p', { class: 'error' }, t('qv.org.orgRequired'))]);
        if (o.kind === 'noKey') return void add(pubOut, [h('p', { class: 'error' }, t('qv.org.publishNoKey'))]);
        if (o.kind === 'locked') return void add(pubOut, [errorBox(o.ux)]);
        if (o.kind === 'failed') {
          if (o.state !== undefined) pubState = o.state;
          add(pubOut, [errorBox(o.ux, { detail: o.detail }, o.ref), h('p', {}, t('qv.org.publishResume'))]);
          say.say(t('qv.org.publishResume'), true);
        }
      }, { primary: true });
      return h('section', { 'aria-labelledby': 'pub-h' }, h('h2', { id: 'pub-h' }, t('qv.org.publish')), h('p', {}, t('qv.org.publishHelp')),
        field(t('qv.org.orgId'), orgIn, t('qv.org.orgIdHint')), field(t('qv.key.passphrase'), pw), pubBtn, pubOut);
    };
    render(t('qv.nav.create'), heading(t('qv.org.title')), h('p', {}, t('qv.org.keyHelp')), org ? null : h('p', {}, t('qv.org.keyTitle')),
      field(t('qv.org.name'), title), field(t('qv.org.template'), tpl), field(t('qv.org.question'), q), field(t('qv.org.options'), opts),
      field(t('qv.org.opens'), opens), field(t('qv.org.closes'), closes), field(t('qv.org.roll'), rollT, t('qv.org.rollHelp')),
      field(t('qv.org.trustees'), trustees, 'name, signing key hex'), field(t('qv.org.threshold'), tt), field('Log public key (hex)', logPk),
      h('p', {}, t('qv.org.translateWarn')), h('p', {}, t('qv.org.freeze')),
      btn(t('qv.org.freezeConfirm'), () => {
        clear(out);
        clear(publishBox);
        prepared = undefined;
        pubState = undefined;
        const roll = parseRoll(rollT.value);
        if (roll.errors.length) return void add(out, [h('ul', { role: 'alert' }, ...roll.errors.map((e) => h('li', {}, t('qv.org.rollRow', { row: e.row, problem: t(e.problem === 'dup' ? 'qv.org.rollDup' : e.problem === 'badHex' ? 'qv.org.rollBadHex' : 'qv.org.rollBadKey') }))))]);
        const tl = trustees.value.split(/\r?\n/).filter(Boolean).map((l) => { const [n, k] = l.split(','); return { name: (n ?? '').trim(), signPkHex: (k ?? '').trim().toLowerCase() }; });
        const opensIso = isoUtc(opens.value);
        const closesIso = isoUtc(closes.value);
        if (opensIso === undefined || closesIso === undefined) return void add(out, [errorBox('E-ORG-MANIFEST', { detail: 'invalid date' })]);
        const form: PublishForm = { title: title.value, contests: [{ template: tpl.value as Template, question: q.value, options: opts.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean), k: 1 }],
          opensIso: opensIso, closesIso: closesIso, maxBallots: 8, quorumCount: 0, trustees: tl, t: Number(tt.value) };
        const res = buildManifest({ ...form, coordinatorPkHex: '00'.repeat(32), logPkHex: logPk.value.trim(), origin: location.origin, rollHex: roll.keys, electionIdHex: bytesToHex(systemRng.bytes(16)) });
        if (!res.ok) return void add(out, [errorBox(res.code, { detail: res.detail })]);
        prepared = { form, rollHex: roll.keys };
        add(publishBox, [publishSection()]);
        add(out, [h('p', {}, t('qv.org.rollSummary', { count: roll.keys.length, root: roll.rootHex ?? '' }))]);
      }, { primary: true }), out, publishBox);
  }

  // ---------------------------------------------------------------- shell
  const skip = h('a', { href: '#main', class: 'skip', onclick: (e: Event) => { e.preventDefault(); main.focus(); } }, t('qv.shell.skip'));
  const header = h('header', {}, h('p', { class: 'brand' }, t('qv.app.name')), nav, h('p', {}, link('/help', t('qv.shell.helpLink')), ' · ', link('/e', t('qv.shell.privacyLink'))));
  const footer = h('footer', {}, h('p', {}, t('qv.shell.footer.build', { version: env.build.version, build: env.build.id })), h('p', {}, h('a', { href: '/verify' }, t('qv.shell.footer.verifyPage'))));
  clear(env.root);
  add(env.root, [skip, h('p', { class: 'banner', role: 'note' }, t('qv.banner.experimental')), header, main, footer, polite, urgent,
    h('noscript', {}, t('qv.shell.noscript'))]);
  void route();
  void b64uEncode;
}
