// Standalone offline verifier page (QV-19 §7). No network code at all: reads a bundle chosen by the user and runs the
// shared protocol verifier. Everything is rendered with textContent.
// B3-26: verification runs in a dedicated Worker started from a blob: URL of this page's own inline script text (see
// worker-main.ts / entry.ts), so the CSP script hash covers the worker too; phase progress goes to the polite live region and
// a Cancel button is offered. Without a usable Worker (old browser, blocked policy) the same code runs on the main thread as
// before. See src/verifier/controller.ts for the invariants.
import { createTranslator, type MessageKey } from '../i18n/index.ts';
import { verificationSummary } from '../flow/verification.ts';
import { verifyBundle, type BundleResult, type Phase } from './bundle.ts';
import { startVerification, type Engine, type Running, type WorkerLike } from './controller.ts';

const t = createTranslator('en').t;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

/** 64 MiB, the same bound as packages/verifier's loader: a hostile file must not hang the tab. Checked before reading. */
const MAX_BYTES = 64 * 1024 * 1024;

// English-only page (translated catalogs are stubbed out of this build); like the page's static HTML copy, these live here.
const PHASE_TEXT: Record<Exclude<Phase, 'done'>, string> = {
  parsing: 'Reading the election bundle…',
  verifying: 'Checking signatures, proofs and the count. A large election can take several minutes.',
};
const CANCELLED = 'Checks cancelled: no result';
const CANCELLED_BODY = 'Nothing was verified. Run the checks again to get a verdict.';
const IN_THREAD_NOTE = 'Running inside this page: it may stop responding until the checks finish.';

/** Label for a check or status key; an unknown key (newer protocol than catalog) shows the raw key instead of aborting the page. */
function label(prefix: string, k: string): string {
  try {
    return t(`${prefix}${k}` as MessageKey);
  } catch {
    return k;
  }
}

/** Any failure to produce a report is shown as FAIL, never as a blank or "running" page that could be read as "nothing wrong". */
function showFailure(out: HTMLElement, detail: string): void {
  out.replaceChildren(el('h2', t('qv.verify.verdict.FAIL')), el('p', detail));
  $('live').textContent = t('qv.verify.verdict.FAIL');
}

function showCancelled(out: HTMLElement): void {
  out.replaceChildren(el('h2', CANCELLED), el('p', CANCELLED_BODY));
  $('live').textContent = CANCELLED;
}

function showProgress(out: HTMLElement, phase: Exclude<Phase, 'done'>, engine: Engine): void {
  const bar = document.createElement('progress');
  bar.setAttribute('aria-label', t('qv.verify.running'));
  const kids = [el('p', t('qv.verify.running')), bar, el('p', PHASE_TEXT[phase])];
  if (engine === 'main-thread') kids.push(el('p', IN_THREAD_NOTE));
  out.replaceChildren(...kids);
  out.dataset.engine = engine;
  $('live').textContent = PHASE_TEXT[phase];
}

interface TT {
  createPolicy(name: string, rules: { createScriptURL: (s: string) => string }): { createScriptURL(s: string): unknown };
}
/** This page's own inline script text, captured while it runs. Its SHA-256 is the `script-src` hash of the page policy. */
let ownSource: string | undefined;
let workerUrl: { href: string; url: unknown } | undefined;

/**
 * Starts a classic Worker from a blob: URL of `ownSource`: the identical hash-pinned bytes, never a fetched or generated
 * script. One blob URL per page (it is not revoked: each run starts a fresh worker from it). `new Worker(url)` is a Trusted
 * Types sink where the common header requires it; the `qv-default` policy here admits only that exact blob URL.
 */
function createVerifyWorker(): WorkerLike | undefined {
  if (ownSource === undefined || ownSource === '' || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  if (!workerUrl) {
    const href = URL.createObjectURL(new Blob([ownSource], { type: 'text/javascript' }));
    let url: unknown = href;
    const tt = (globalThis as unknown as { trustedTypes?: TT }).trustedTypes;
    if (tt) url = tt.createPolicy('qv-default', { createScriptURL: (s) => { if (s !== href) throw new TypeError('worker url not allowed'); return s; } }).createScriptURL(href);
    workerUrl = { href, url };
  }
  return new Worker(workerUrl.url as string) as unknown as WorkerLike;
}

let current: Running | undefined;
let seq = 0;

function setCancelVisible(visible: boolean): void {
  ($('cancel') as HTMLButtonElement).hidden = !visible;
}

async function run(): Promise<void> {
  const token = ++seq;
  current?.cancel(); // a new run supersedes one still in flight; its outcome is discarded below
  current = undefined;
  setCancelVisible(false);
  const out = $('out');
  delete out.dataset.engine;
  out.replaceChildren(el('p', t('qv.verify.running')));
  const f = ($('file') as HTMLInputElement).files?.[0];
  if (!f) {
    out.replaceChildren();
    return;
  }
  if (f.size > MAX_BYTES) return showFailure(out, `file exceeds ${MAX_BYTES} bytes`);
  const anchor = ($('anchor') as HTMLInputElement).value.trim();
  let text: string;
  try {
    text = await f.text();
  } catch (e) {
    if (token === seq) showFailure(out, e instanceof Error ? e.message : 'verification failed');
    return;
  }
  if (token !== seq) return;
  const job = startVerification({ createWorker: createVerifyWorker, inThread: verifyBundle }, { text, anchor }, (phase, engine) => {
    if (token !== seq) return;
    if (phase === 'done') return;
    setCancelVisible(engine === 'worker');
    showProgress(out, phase, engine);
  });
  current = job;
  if (job.engine === 'worker') setCancelVisible(true);
  const o = await job.outcome;
  if (token !== seq) return;
  current = undefined;
  setCancelVisible(false);
  out.dataset.engine = o.engine;
  if (o.kind === 'cancelled') return showCancelled(out);
  if (o.kind === 'failed') return showFailure(out, o.detail);
  try {
    render(out, o.result);
  } catch (e) {
    showFailure(out, e instanceof Error ? e.message : 'verification failed');
  }
}

function render(out: HTMLElement, { report: rep, anchorBad, anchorProblem }: BundleResult): void {
  const kids: HTMLElement[] = [];
  if (anchorProblem === 'mismatch') kids.push(el('p', `${t('qv.err.E-VER-ANCHOR.title')}. ${t('qv.err.E-VER-ANCHOR.body')}`));
  else if (anchorBad) kids.push(el('p', t('qv.err.E-VER-ANCHOR.title')));
  const rows = Object.entries(rep.checks);
  const summary = verificationSummary(rep, anchorBad);
  kids.push(el('h2', t(`qv.verify.verdict.${summary.verdict}` as MessageKey)));
  kids.push(el('p', t('qv.verify.itemized', { passed: rows.filter(([, v]) => v === 'pass').length, total: rows.length })));
  const ul = document.createElement('ul');
  for (const [k, v] of rows) ul.append(el('li', `${label('qv.verify.chk.', k)}: ${label('qv.verify.status.', v)}`));
  kids.push(...rep.caveats.map((c) => el('p', c)));
  kids.push(ul, el('p', t('qv.verify.counts', { cast: rep.counts.cast, counted: rep.counts.counted, spoiled: rep.counts.spoiled })), el('p', t('qv.verify.scope')));
  for (const fi of rep.findings.slice(0, 50)) kids.push(el('p', `${fi.code}${fi.seq !== undefined ? ` #${fi.seq}` : ''}: ${fi.detail}`));
  out.replaceChildren(...kids);
  // The anchor mismatch is part of what a screen-reader user must hear with the verdict.
  $('live').textContent = anchorBad ? `${t('qv.err.E-VER-ANCHOR.title')}. ${t(`qv.verify.verdict.${summary.verdict}` as MessageKey)}` : t(`qv.verify.verdict.${summary.verdict}` as MessageKey);
}

/** Page mode. Must be called synchronously from the inline script so `document.currentScript` is that script. */
export function startPage(): void {
  const me = document.currentScript;
  ownSource = me instanceof HTMLScriptElement && !me.src ? (me.textContent ?? undefined) : undefined;
  $('run').addEventListener('click', () => void run());
  $('cancel').addEventListener('click', () => current?.cancel());
}
