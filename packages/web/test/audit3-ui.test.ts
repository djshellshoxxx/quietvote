// B3-18 / B3-23 / B3-32 regressions on a tiny fake DOM (no browser): live regions, announcements, invite rows, chart figure, banner landmark.
// The real-browser counterparts (axe-style landmark and live-region counts) live in e2e/a11y.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EN } from '../src/i18n/en.ts';

class FakeNode {
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: unknown) => void)[]>();
  private text = '';
  readonly tag: string;
  readonly data: string | undefined;
  constructor(tag: string, data?: string) { this.tag = tag; this.data = data; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  addEventListener(k: string, f: (e: unknown) => void): void { this.listeners.set(k, [...(this.listeners.get(k) ?? []), f]); }
  append(...kids: (FakeNode | string)[]): void { for (const k of kids) this.children.push(typeof k === 'string' ? new FakeNode('#text', k) : k); }
  removeChild(c: FakeNode): FakeNode { this.children = this.children.filter((x) => x !== c); return c; }
  get firstChild(): FakeNode | null { return this.children[0] ?? null; }
  set textContent(v: string) { this.children = []; this.text = v; }
  get textContent(): string { return this.data ?? (this.text + this.children.map((c) => c.textContent).join('')); }
  find(pred: (n: FakeNode) => boolean): FakeNode[] { return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => c.find(pred))]; }
  click(): void { for (const f of this.listeners.get('click') ?? []) f({}); }
}
const doc = {
  createElement: (t: string) => new FakeNode(t),
  createElementNS: (_ns: string, t: string) => new FakeNode(t),
  createTextNode: (s: string) => new FakeNode('#text', s),
};
(globalThis as unknown as { document: typeof doc }).document = doc;
const { Announcer, h } = await import('../src/ui/dom.ts');
const { renderBarChart } = await import('../src/ui/charts.ts');
const { inviteLink, inviteRows } = await import('../src/ui/invites.ts');
const { buildHeader } = await import('../src/ui/shell.ts');
const { parseFragment } = await import('../src/flow/invite.ts');
const { b64uEncode } = await import('../src/util/hex.ts');
const as = <T>(n: FakeNode): T => n as unknown as T;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('B3-18: the Announcer keeps one polite and one assertive region and never cuts a long message', async () => {
  const polite = h('div', {}); const urgent = h('div', {});
  const a = new Announcer(polite, urgent);
  const long = EN['qv.phish.mismatch'].message;
  assert.ok(long.length > 140);
  a.say(long, true);
  a.say('Copied.');
  await wait(80);
  assert.equal(urgent.textContent, long, 'full text, no mid-word truncation');
  assert.equal(polite.textContent, 'Copied.');
});

test('B3-18: the phishing announcement has its own short key (<= 140 chars) and the app routes it to the assertive region', () => {
  assert.ok(EN['qv.phish.announce'].message.length <= 140);
  const src = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/say\.say\(t\('qv\.phish\.announce'\), true\)/g) ?? []).length, 2);
  assert.doesNotMatch(src, /say\.say\(t\('qv\.phish\.mismatch'\)/);
});

test('B3-18: app.ts declares exactly one status and one alert live region; local nodes carry no live role', () => {
  const src = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/role: '(status|alert)'/g) ?? []).length, 2, 'only the shell polite (#live-polite) and assertive (#live-urgent) regions');
  assert.match(src, /id: 'live-polite', role: 'status'/);
  assert.match(src, /id: 'live-urgent', role: 'alert'/);
  assert.equal((src.match(/aria-live': '(polite|assertive)'/g) ?? []).length, 0, 'no second polite declaration on the status role');
  assert.doesNotMatch(src, /role: 'note'/);
});

test('B3-23: each invitation row is a full link the voter router parses, with its own Copy button', () => {
  const token = new Uint8Array(16).map((_, i) => i + 1);
  const code = b64uEncode(token);
  const copied: string[] = [];
  const list = as<FakeNode>(inviteRows({ origin: 'https://vote.example', copyLabel: (n) => `Copy invitation link ${n}`, copy: (t) => copied.push(t) }, 'aaaaaaaaaaaaaaaaaaaaaaaaaa', [{ code }, { code: b64uEncode(token.map((x) => x + 1)) }]) as unknown as FakeNode);
  const rows = list.find((n) => n.tag === 'li');
  assert.equal(rows.length, 2);
  const link = rows[0]!.find((n) => n.tag === 'code')[0]!.textContent;
  assert.equal(link, `https://vote.example/e/aaaaaaaaaaaaaaaaaaaaaaaaaa#inv=${code}`);
  assert.deepEqual(parseFragment(new URL(link).hash).token, token, 'the voter-side parser accepts it');
  const buttons = rows[1]!.find((n) => n.tag === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0]!.textContent, 'Copy invitation link 2');
  buttons[0]!.click();
  assert.equal(copied[0], rows[1]!.find((n) => n.tag === 'code')[0]!.textContent);
});

test('B3-23: a malformed code is shown as is, never turned into a bogus link', () => {
  assert.equal(inviteLink('https://x', 'aaaaaaaaaaaaaaaaaaaaaaaaaa', 'short'), 'short');
});

test('B3-32: the chart figure has no role=group and is labelled by its figcaption', () => {
  const fig = as<FakeNode>(renderBarChart({ t: (k) => k, rtl: false }, 'T', { options: [{ id: 'a', label: 'A', count: 2 }, { id: 'b', label: 'B', count: 1 }] }) as unknown as FakeNode);
  assert.equal(fig.tag, 'figure');
  assert.equal(fig.getAttribute('role'), null);
  const cap = fig.find((n) => n.tag === 'figcaption')[0]!;
  assert.equal(fig.getAttribute('aria-labelledby'), cap.getAttribute('id'));
});

test('B3-32: both notices sit inside the header landmark', () => {
  const header = as<FakeNode>(buildHeader(['Experimental', 'Demo'], h('p', { class: 'brand' }, 'QuietVote')) as unknown as FakeNode);
  assert.equal(header.tag, 'header');
  const banners = header.find((n) => n.attrs.get('class') === 'banner');
  assert.deepEqual(banners.map((b) => b.textContent), ['Experimental', 'Demo']);
  const src = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /class: 'banner'/, 'app.ts adds no banner outside buildHeader');
});
