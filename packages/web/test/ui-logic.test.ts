import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519Keypair, streamRng, bytesToHex } from '@quietvote/crypto';
import { initialBallotState, reduce, canCast, canAudit, type BallotState, type BallotEvent } from '../src/flow/ballot-machine.ts';
import { format, parse, argNames } from '../src/i18n/icu.ts';
import { EN, MESSAGE_KEYS } from '../src/i18n/en.ts';
import { LOCALES, GUARANTEE_KEYS, gate, offeredLocales, negotiateLocale, sourceHash, unknownKeys, type LocaleDef } from '../src/i18n/locales.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { pseudoArXB, pseudoEnXA } from '../src/i18n/pseudo.ts';
import { formatDeadline, zonedLocalToUtc } from '../src/i18n/datetime.ts';
import { parseRoute } from '../src/ui/route.ts';
import { parseFragment, inviteHash, makeInviteFragment, safeBoardOrigin } from '../src/flow/invite.ts';
import { buildManifest, parseRoll } from '../src/flow/organizer.ts';
import { checkPassphrase } from '../src/key/passphrase.ts';

const run = (evs: BallotEvent[], s: BallotState = initialBallotState()): BallotState => evs.reduce(reduce, s);

test('ballot machine: happy path and illegal transitions', () => {
  let s = run([{ type: 'SELECT', selections: { a: ['x'] } }, { type: 'REVIEW' }, { type: 'SEAL' }, { type: 'SEALED', sealed: { code: 'c1', attempt: 0 } }]);
  assert.equal(s.kind, 'sealed');
  assert.equal(reduce(s, { type: 'CAST' }), s, 'no cast before the code is rendered');
  assert.equal(reduce(s, { type: 'AUDIT' }), s);
  assert.equal(reduce(s, { type: 'CODE_RENDERED', code: 'other' }), s);
  s = reduce(s, { type: 'CODE_RENDERED', code: 'c1' });
  assert.ok(canCast(s) && canAudit(s));
  assert.equal(run([{ type: 'CAST' }, { type: 'CAST_RESULT', outcome: 'ACCEPTED_RECORDED' }], s).kind, 'cast');
  assert.equal(reduce(initialBallotState(), { type: 'SEAL' }).kind, 'selecting');
});

test('ballot machine: a tested ballot is discarded, attempt advances, repeated code is refused (REQ-012)', () => {
  let s = run([{ type: 'REVIEW' }, { type: 'SEAL' }, { type: 'SEALED', sealed: { code: 'c1', attempt: 0 } }, { type: 'CODE_RENDERED', code: 'c1' }, { type: 'AUDIT' }, { type: 'AUDIT_DONE', posted: true }]);
  assert.equal(s.kind, 'audited');
  assert.equal(canCast(s), false);
  s = run([{ type: 'NEW_SEAL' }], s);
  assert.ok(s.kind === 'reviewing' && s.attempt === 1 && s.spoiled.includes('c1'));
  s = run([{ type: 'SEAL' }, { type: 'SEALED', sealed: { code: 'c1', attempt: 1 } }], s);
  assert.equal(s.kind, 'failed');
  s = run([{ type: 'REVIEW' }, { type: 'SEAL' }, { type: 'SEALED', sealed: { code: 'c2', attempt: 1 } }, { type: 'CODE_RENDERED', code: 'c2' }], { kind: 'selecting', selections: {}, attempt: 1, spoiled: ['c1'] });
  assert.ok(canCast(s));
});

test('ballot machine: unknown delivery retries the same sealed ballot', () => {
  const s = run([{ type: 'REVIEW' }, { type: 'SEAL' }, { type: 'SEALED', sealed: { code: 'c', attempt: 0 } }, { type: 'CODE_RENDERED', code: 'c' }, { type: 'CAST' }, { type: 'CAST_FAILED', error: 'E-NET-TIMEOUT', unknownDelivery: true }]);
  assert.equal(s.kind, 'failed');
  const r = reduce(s, { type: 'RETRY_CAST' });
  assert.ok(r.kind === 'casting' && r.sealed.code === 'c');
  assert.equal(reduce(s, { type: 'NEW_SEAL' }), s, 'cannot re-seal while delivery is unknown');
});

test('ICU: arguments, plural, select, ordinal, quoting, bidi isolation', () => {
  const o = { locale: 'en', isolate: false };
  assert.equal(format("Don't {n, plural, one {# vote} other {# votes}}", { n: 1 }, o), "Don't 1 vote");
  assert.equal(format('{n, plural, =0 {none} one {# vote} other {# votes}}', { n: 0 }, o), 'none');
  assert.equal(format('{n, plural, offset:1 =0 {nobody} other {you and # more}}', { n: 3 }, o), 'you and 2 more');
  assert.equal(format('{g, select, a {A} other {O}}', { g: 'zz' }, o), 'O');
  assert.equal(format("'{'literal'}' {x}", { x: 'v' }, o), '{literal} v');
  assert.equal(format('{p, number, percent}', { p: 0.256 }, o), '25.6%');
  assert.equal(format('{l, list}', { l: ['a', 'b', 'c'] }, o), 'a, b, and c');
  assert.equal(format('{x}', { x: 'name' }, { locale: 'en' }), '⁨name⁩');
  assert.equal(format('{n, number, latn}', { n: 1234 }, { locale: 'ar' }), '1,234');
  assert.throws(() => parse('{n, plural, one {x}}'));
  assert.throws(() => parse('{unclosed'));
  assert.throws(() => format('{x}', {}, o));
  assert.equal(format('{n, plural, one {# كتاب} two {كتابان} few {# كتب} many {# كتابًا} other {# كتاب}}', { n: 2 }, { locale: 'ar', isolate: false }), 'كتابان');
});

test('catalog: valid ICU everywhere, guarantee strings present, placeholders documented', () => {
  assert.ok(MESSAGE_KEYS.length > 250);
  for (const k of MESSAGE_KEYS) {
    const e = EN[k];
    assert.ok(e.description.length > 0, k);
    assert.doesNotThrow(() => argNames(parse(e.message)), k);
  }
  for (const k of ['qv.privacy.headline', 'qv.privacy.g1', 'qv.privacy.nc4', 'qv.receipt.doesnt', 'qv.phish.mismatch', 'qv.audit.ok'] as const) assert.equal(EN[k].sensitivity, 'guarantee');
  assert.equal(EN['qv.privacy.headline'].message, 'Your choices are secret. The fact that you voted is not.');
});

test('locales: es/fr/de/pt-BR/ar exist with RTL for ar, are not offered until reviewed, and gating tracks source hashes (REQ-064)', () => {
  assert.deepEqual(LOCALES.map((l) => l.tag), ['en', 'es', 'fr', 'de', 'pt-BR', 'ar']);
  assert.equal(LOCALES.find((l) => l.tag === 'ar')!.dir, 'rtl');
  assert.deepEqual(offeredLocales().map((l) => l.tag), ['en']);
  for (const l of LOCALES) assert.deepEqual(unknownKeys(l), []);
  const fake: LocaleDef = { tag: 'xx', dir: 'ltr', autonym: 'Xx', tier: 1, messages: {}, review: {} };
  for (const k of GUARANTEE_KEYS) { fake.messages[k] = `[${k}]`; fake.review[k] = sourceHash(k); }
  assert.equal(gate(fake).offered, true);
  fake.review['qv.privacy.g1'] = 'stale';
  assert.deepEqual(gate(fake).missing, ['qv.privacy.g1']);
  // no silent fallback for guarantee strings; normal strings fall back to English
  const tr = createTranslator('xx', { defs: [...LOCALES, { ...fake, messages: { 'qv.shell.back': 'Zurück' } }] });
  assert.equal(tr.t('qv.shell.back'), 'Zurück');
  assert.equal(tr.t('qv.shell.continue'), 'Continue');
  assert.throws(() => tr.t('qv.privacy.g1'));
  assert.equal(negotiateLocale({ query: 'fr', browser: ['pt-BR'], offered: ['en'] }), 'en');
  assert.equal(negotiateLocale({ stored: 'pt', offered: ['en', 'pt-BR'] }), 'pt-BR');
  assert.equal(negotiateLocale({ query: 'de', stored: 'en', offered: ['en', 'de'] }), 'de');
});

test('pseudo-locales keep placeholders and expand text', () => {
  const m = 'Opening needs {t} of the {n} trustees ({x, list}). {n, plural, one {# vote} other {# votes}}';
  for (const p of [pseudoEnXA(m), pseudoArXB(m)]) {
    assert.doesNotThrow(() => parse(p));
    assert.deepEqual([...argNames(parse(p))].sort(), [...argNames(parse(m))].sort());
    assert.ok(p.length > m.length);
  }
});

test('deadlines: election zone with offset, viewer zone, DST gap and fold', () => {
  const d = formatDeadline('2027-03-14T17:00:00Z', 'Europe/Berlin', 'America/New_York', 'en');
  assert.equal(d.offset, 'UTC+01:00');
  assert.equal(d.isoDate, '2027-03-14');
  assert.match(d.electionTime, /18:00/);
  assert.match(d.viewerTime!, /13:00|12:00/);
  assert.equal(formatDeadline('2027-03-14T17:00:00Z', 'Europe/Berlin', 'Europe/Berlin', 'en').viewerTime, undefined);
  const gap = zonedLocalToUtc({ y: 2027, mo: 3, d: 28, h: 2, mi: 30 }, 'Europe/Berlin');
  assert.equal(gap.kind, 'gap');
  const fold = zonedLocalToUtc({ y: 2027, mo: 10, d: 31, h: 2, mi: 30 }, 'Europe/Berlin');
  assert.equal(fold.kind, 'fold');
  if (fold.kind === 'fold') {
    assert.equal(fold.candidates.length, 2);
    const chosen = zonedLocalToUtc({ y: 2027, mo: 10, d: 31, h: 2, mi: 30 }, 'Europe/Berlin', 60);
    assert.equal(chosen.kind === 'ok' && chosen.instant, '2027-10-31T01:30:00Z');
  }
  const ok = zonedLocalToUtc({ y: 2027, mo: 3, d: 14, h: 18, mi: 0 }, 'Europe/Berlin');
  assert.equal(ok.kind === 'ok' && ok.instant, '2027-03-14T17:00:00Z');
});

test('routes, invite fragments and board origins', () => {
  assert.deepEqual(parseRoute('/'), { name: 'home' });
  assert.deepEqual(parseRoute('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/vote'), { name: 'election', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaa', view: 'vote' });
  assert.equal(parseRoute('/e/short').name, 'notfound');
  assert.equal(parseRoute('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/evil').name, 'notfound');
  const tok = streamRng('t').bytes(16);
  const f = parseFragment(makeInviteFragment(tok, { readKey: 'abcdefghijklmnop', board: 'https://board.example' }));
  assert.deepEqual(f.token, tok);
  assert.equal(f.board, 'https://board.example');
  assert.equal(inviteHash(tok).length, 43);
  assert.equal(parseFragment('#inv=AAAA').token, undefined);
  assert.equal(safeBoardOrigin('http://evil.example'), undefined);
  assert.equal(safeBoardOrigin('http://abc.onion'), 'http://abc.onion');
  assert.equal(safeBoardOrigin('https://u:p@x.example'), undefined);
});

test('organizer: roll parsing with row numbers, manifest from template validates (E-ORG-*)', () => {
  const ks = [1, 2, 3, 4].map((i) => bytesToHex(ed25519Keypair(streamRng(`k${i}`).bytes(32)).publicKey));
  const r = parseRoll([...ks, ks[0]!, 'zz', '00'.repeat(32)].join('\n'));
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.problem}`), ['5:dup', '6:badHex', '7:badKey']);
  const good = parseRoll(`${ks.join(',label\n')},x`);
  assert.equal(good.errors.length, 0);
  assert.deepEqual(good.keys, [...ks].sort());
  const tk = [1, 2, 3].map((i) => ({ name: `T${i}`, signPkHex: bytesToHex(ed25519Keypair(streamRng(`t${i}`).bytes(32)).publicKey) }));
  const base = { title: 'Budget', contests: [{ template: 'yes-no' as const, question: 'Adopt?', options: [] }], opensIso: '2027-03-01T08:00:00Z', closesIso: '2027-03-14T17:00:00Z', maxBallots: 5, quorumCount: 0, trustees: tk, t: 2, coordinatorPkHex: ks[0]!, logPkHex: ks[1]!, origin: 'https://x.example', rollHex: good.keys, electionIdHex: '11'.repeat(16) };
  const m = buildManifest(base);
  assert.ok(m.ok, m.ok ? '' : m.detail);
  assert.equal(buildManifest({ ...base, quorumCount: 99 }).ok, false);
  const bad = buildManifest({ ...base, t: 9 });
  assert.ok(!bad.ok && bad.code === 'E-ORG-TRUSTEES');
  for (const tpl of ['single-choice', 'approval', 'k-of-n'] as const) {
    const r2 = buildManifest({ ...base, contests: [{ template: tpl, question: 'Pick', options: ['Ann', 'Bob', 'Cy'], k: 2 }] });
    assert.ok(r2.ok, `${tpl}: ${r2.ok ? '' : r2.detail}`);
  }
});

test('passphrase generator output passes policy', () => {
  assert.equal(checkPassphrase('mistral harbour velvet lantern').ok, true);
});
