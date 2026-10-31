// Standalone offline verifier page (QV-19 §7). No network code at all: reads a bundle chosen by the user and runs the
// shared protocol verifier. Everything is rendered with textContent.
import { hexToBytes } from '@quietvote/crypto';
import { verifyElectionText } from '@quietvote/protocol';
import { createTranslator, type MessageKey } from '../i18n/index.ts';
import { verificationSummary } from '../flow/verification.ts';
import { electionIdOf, sameElectionId } from '../util/crockford.ts';

const t = createTranslator('en').t;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

/** 64 MiB, the same bound as packages/verifier's loader: a hostile file must not hang the tab. */
const MAX_BYTES = 64 * 1024 * 1024;

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

async function run(): Promise<void> {
  const out = $('out');
  out.replaceChildren(el('p', t('qv.verify.running')));
  const f = ($('file') as HTMLInputElement).files?.[0];
  if (!f) {
    out.replaceChildren();
    return;
  }
  if (f.size > MAX_BYTES) return showFailure(out, `file exceeds ${MAX_BYTES} bytes`);
  try {
    await runChecked(out, await f.text());
  } catch (e) {
    showFailure(out, e instanceof Error ? e.message : 'verification failed');
  }
}

async function runChecked(out: HTMLElement, text: string): Promise<void> {
  const rep = await verifyElectionText(text);
  const kids: HTMLElement[] = [];
  let anchorBad = false;
  const anchor = ($('anchor') as HTMLInputElement).value.trim();
  if (anchor !== '') {
    try {
      const mh = (JSON.parse(text) as { manifest_hash: string }).manifest_hash;
      if (!sameElectionId(anchor, electionIdOf(hexToBytes(mh, 32)))) { anchorBad = true; kids.push(el('p', `${t('qv.err.E-VER-ANCHOR.title')}. ${t('qv.err.E-VER-ANCHOR.body')}`)); }
    } catch {
      anchorBad = true;
      kids.push(el('p', t('qv.err.E-VER-ANCHOR.title')));
    }
  }
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

$('run').addEventListener('click', () => void run());
