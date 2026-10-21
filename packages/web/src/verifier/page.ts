// Standalone offline verifier page (QV-19 §7). No network code at all: reads a bundle chosen by the user and runs the
// shared protocol verifier. Everything is rendered with textContent.
import { hexToBytes } from '@quietvote/crypto';
import { verifyElectionText } from '@quietvote/protocol';
import { createTranslator, type MessageKey } from '../i18n/index.ts';
import { electionIdOf, sameElectionId } from '../util/crockford.ts';

const t = createTranslator('en').t;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

async function run(): Promise<void> {
  const out = $('out');
  out.replaceChildren(el('p', t('qv.verify.running')));
  const f = ($('file') as HTMLInputElement).files?.[0];
  if (!f) return;
  const text = await f.text();
  const rep = await verifyElectionText(text);
  const kids: HTMLElement[] = [];
  const anchor = ($('anchor') as HTMLInputElement).value.trim();
  if (anchor !== '') {
    try {
      const mh = (JSON.parse(text) as { manifest_hash: string }).manifest_hash;
      if (!sameElectionId(anchor, electionIdOf(hexToBytes(mh, 32)))) kids.push(el('p', `${t('qv.err.E-VER-ANCHOR.title')}. ${t('qv.err.E-VER-ANCHOR.body')}`));
    } catch {
      kids.push(el('p', t('qv.err.E-VER-ANCHOR.title')));
    }
  }
  const rows = Object.entries(rep.checks);
  kids.push(el('h2', t(`qv.verify.verdict.${rep.verdict}` as MessageKey)));
  kids.push(el('p', t('qv.verify.itemized', { passed: rows.filter(([, v]) => v === 'pass').length, total: rows.length })));
  const ul = document.createElement('ul');
  for (const [k, v] of rows) ul.append(el('li', `${t(`qv.verify.chk.${k}` as MessageKey)}: ${t(`qv.verify.status.${v}` as MessageKey)}`));
  kids.push(ul, el('p', t('qv.verify.counts', { cast: rep.counts.cast, counted: rep.counts.counted, spoiled: rep.counts.spoiled })), el('p', t('qv.verify.scope')));
  for (const fi of rep.findings.slice(0, 50)) kids.push(el('p', `${fi.code}${fi.seq !== undefined ? ` #${fi.seq}` : ''}: ${fi.detail}`));
  out.replaceChildren(...kids);
  $('live').textContent = t(`qv.verify.verdict.${rep.verdict}` as MessageKey);
}

$('run').addEventListener('click', () => void run());
