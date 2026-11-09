// Standalone offline verifier page (QV-19 §7). No network code at all: reads a bundle chosen by the user and runs the
// shared protocol verifier. Everything is rendered with textContent.
import { hexToBytes } from '@quietvote/crypto';
import { verifyElectionText, type VerificationProgress } from '@quietvote/protocol';
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

/** 64 MiB, the same bound as packages/verifier's loader. Parsing and individual proof operations remain synchronous. */
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

let active: AbortController | undefined;
const stages: Record<VerificationProgress['stage'], string> = {
  parse: 'Reading JSON', manifest: 'Checking manifest and roll', log: 'Reading log order', records: 'Checking signed records',
  dkg: 'Checking joint key', keyconfs: 'Checking trustee confirmations', markers: 'Checking election markers',
  ballots: 'Checking ballot proofs', 'spoil-conflicts': 'Checking spoiled codes', 'latest-ballots': 'Selecting latest ballots',
  aggregate: 'Recomputing aggregates', tally: 'Checking tally proofs', spoiled: 'Checking spoiled ballots', complete: 'Finishing checks',
};

function busy(value: boolean): void {
  ($('run') as HTMLButtonElement).disabled = value;
  ($('cancel') as HTMLButtonElement).disabled = !value;
  $('progress').hidden = !value;
  $('out').setAttribute('aria-busy', String(value));
}

function stop(message: string): void {
  active?.abort();
  active = undefined;
  busy(false);
  $('out').replaceChildren(el('p', message));
  $('progress-detail').textContent = '';
  $('live').textContent = message;
}

async function run(): Promise<void> {
  stop('');
  const out = $('out');
  const f = ($('file') as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > MAX_BYTES) return showFailure(out, `file exceeds ${MAX_BYTES} bytes`);
  const scope = new AbortController();
  active = scope;
  // Bind the anchor to this run. Editing either input invalidates all pending work and any previous verdict.
  const anchor = ($('anchor') as HTMLInputElement).value.trim();
  busy(true);
  out.replaceChildren(el('p', t('qv.verify.running')));
  $('live').textContent = t('qv.verify.running');
  let lastYield = 0;
  let lastStage: VerificationProgress['stage'] | undefined;
  try {
    const text = await f.text();
    if (active !== scope) return;
    const rep = await verifyElectionText(text, { cooperative: { signal: scope.signal, checkpoint: async (p) => {
      if (active !== scope) return;
      const progress = $('progress') as HTMLProgressElement;
      progress.max = Math.max(1, p.total);
      progress.value = p.completed;
      $('progress-detail').textContent = `${stages[p.stage]}: ${p.completed} of ${p.total}. Progress is work completed, not a verdict.`;
      const newStage = lastStage !== p.stage;
      if (newStage) { $('live').textContent = stages[p.stage]; lastStage = p.stage; }
      if (newStage || performance.now() - lastYield >= 16) {
        // A task boundary allows input, rendering and cancellation; a resolved Promise alone would not.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    } } });
    if (active !== scope) return;
    showReport(out, text, anchor, rep);
  } catch (e) {
    if (active === scope) showFailure(out, e instanceof Error ? e.message : 'verification failed');
  } finally {
    if (active === scope) {
      active = undefined;
      busy(false);
      $('progress-detail').textContent = '';
    }
  }
}

function showReport(out: HTMLElement, text: string, anchor: string, rep: Awaited<ReturnType<typeof verifyElectionText>>): void {
  const kids: HTMLElement[] = [];
  let anchorBad = false;
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
$('cancel').addEventListener('click', () => { stop('Verification cancelled. No report was produced.'); $('run').focus(); });
$('file').addEventListener('change', () => stop('File changed. Run checks to verify it.'));
$('anchor').addEventListener('input', () => stop('Election ID changed. Run checks to verify it.'));
window.addEventListener('pagehide', () => stop('Verification stopped. Run checks to start again.'));
