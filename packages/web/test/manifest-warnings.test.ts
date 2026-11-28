// @verifies QV-03-REQ-012 QV-02-REQ-032 QV-06-REQ-010
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex } from '@quietvote/crypto';
import { rollRoot, validateManifest } from '@quietvote/protocol';
import { buildManifest, kp } from '../../protocol/test/helpers/sim.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { LOCALES, offeredLocales } from '../src/i18n/locales.ts';
import { manifestWarnings } from '../src/ui/manifest-warnings.ts';

class Element {
  readonly tag: string;
  readonly attrs = new Map<string, string>();
  children: Element[] = [];
  text = '';
  constructor(tag: string) { this.tag = tag; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
  append(...children: Element[]): void { this.children.push(...children); }
  find(tag: string): Element[] { return [...(this.tag === tag ? [this] : []), ...this.children.flatMap((child) => child.find(tag))]; }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: (tag: string) => new Element(tag),
  createTextNode: (text: string) => { const node = new Element('#text'); node.text = text; return node; },
} });
const tr = createTranslator('en');
const render = (warnings: readonly string[]): Element | null => manifestWarnings(warnings, tr) as unknown as Element | null;
const copy = {
  'W-NO-THRESHOLD': 'The trustee threshold is 1, so there is no threshold protection.',
  'W-SECRECY': 'The trustee threshold is below a majority of trustees.',
  'W-AVAILABILITY': 'Fewer than one third of the trustees can be unavailable for the result to be opened.',
  'W-SMALL-ROLL': 'With this few voters, the published totals could reveal individual votes.',
};

function warningsFor(n: number, t: number, voters: number): string[] {
  const seed = `manifest-warning-${n}-${t}-${voters}`;
  const roll = Array.from({ length: voters }, (_, i) => bytesToHex(kp(seed, `voter-${i}`).publicKey)).sort();
  const root = rollRoot(roll); assert.ok(root.ok);
  const manifest = buildManifest({ seed, n, t, voters }, [kp(seed, 'coordinator')],
    Array.from({ length: n }, (_, i) => kp(seed, `trustee-${i}`)), voters, bytesToHex(root.value));
  const result = validateManifest(manifest, voters); assert.ok(result.ok);
  return result.value.warnings;
}

for (const fixture of [
  { label: 'single-trustee threshold', n: 3, t: 1, voters: 8, codes: ['W-NO-THRESHOLD', 'W-SECRECY'] },
  { label: 'threshold below a majority', n: 4, t: 2, voters: 8, codes: ['W-SECRECY'] },
  { label: 'limited trustee availability', n: 3, t: 3, voters: 8, codes: ['W-AVAILABILITY'] },
  { label: 'small voter list', n: 3, t: 2, voters: 7, codes: ['W-SMALL-ROLL'] },
  { label: 'multiple warnings', n: 3, t: 1, voters: 4, codes: ['W-NO-THRESHOLD', 'W-SECRECY', 'W-SMALL-ROLL'] },
] as const) {
  test(`validated manifest renders ${fixture.label}`, () => {
    const warnings = warningsFor(fixture.n, fixture.t, fixture.voters);
    assert.deepEqual(warnings.map((warning) => warning.split(':')[0]), fixture.codes);
    const before = [...warnings]; const panel = render(warnings); assert.ok(panel);
    assert.equal(panel.tag, 'section');
    const heading = panel.find('h2')[0]!;
    assert.equal(heading.textContent, 'Election warnings');
    assert.equal(panel.attrs.get('aria-labelledby'), heading.attrs.get('id'));
    assert.deepEqual(panel.find('li').map((node) => node.textContent), fixture.codes.map((code) => copy[code]));
    assert.equal(panel.attrs.has('role'), false, 'static warnings do not add another live alert');
    assert.deepEqual(warnings, before, 'rendering must not mutate the validated warnings');
  });
}

test('a manifest without warnings produces no empty panel or all-clear claim', () => {
  const warnings = warningsFor(3, 2, 8); assert.deepEqual(warnings, []);
  assert.equal(render(warnings), null);
});

test('known codes use fixed copy; unknown warnings and prototype-like codes remain literal text', () => {
  const hostile = 'W-FUTURE: <img src=x onerror="CANARY()"> & </li><script>CANARY()</script>';
  const panel = render(['W-SECRECY: forged assurance CANARY', hostile, 'constructor: future warning', '__proto__: future warning', 'W-SECRECY-NEW: future warning']);
  assert.ok(panel);
  const lines = panel.find('li');
  assert.equal(lines[0]!.textContent, copy['W-SECRECY']);
  assert.equal(panel.textContent.includes('forged assurance'), false);
  for (const [i, text] of [hostile, 'constructor: future warning', '__proto__: future warning', 'W-SECRECY-NEW: future warning'].entries()) {
    assert.ok(lines[i + 1]!.textContent.includes(text));
    assert.ok(lines[i + 1]!.textContent.startsWith('Additional election warning: '));
    assert.equal(lines[i + 1]!.children.length, 1);
    assert.equal(lines[i + 1]!.children[0]!.tag, '#text', 'the entire untrusted diagnostic must stay in a text node');
  }
  assert.deepEqual(panel.find('img'), []); assert.deepEqual(panel.find('script'), []);
});

test('warning headings have distinct labels and unreviewed catalogs remain unavailable', () => {
  const first = render(['W-SMALL-ROLL']), second = render(['W-SMALL-ROLL']);
  assert.ok(first); assert.ok(second);
  assert.notEqual(first.attrs.get('aria-labelledby'), second.attrs.get('aria-labelledby'));
  assert.deepEqual(offeredLocales(LOCALES).map((locale) => locale.tag), ['en']);
  for (const locale of LOCALES.filter((item) => item.tag !== 'en')) assert.deepEqual(locale.review, {});
});
