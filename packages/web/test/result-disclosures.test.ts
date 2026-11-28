// @verifies QV-07-REQ-017
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateManifest } from '@quietvote/protocol';
import { bundleOf } from '../../protocol/test/helpers/sim.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { canShowResults, verifyLoadedElection } from '../src/flow/verification.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { optionDisclosure, smallRollDisclosure } from '../src/ui/result-disclosures.ts';
import { disclosureFixture } from './helpers/disclosure-fixture.ts';
import { witnessedBoard } from './helpers/witnessed-board.ts';

class Element {
  readonly tag: string; children: Element[] = []; text = '';
  constructor(tag: string) { this.tag = tag; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(): void {}
  append(...children: Element[]): void { this.children.push(...children); }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: (tag: string) => new Element(tag),
  createTextNode: (text: string) => { const node = new Element('#text'); node.text = text; return node; },
} });
const tr = createTranslator('en');
const required = "Unanimous result: every participant's choice is known";

for (const voters of [9, 10]) {
  test(`real verified tally uses the counted voters and roll-size ${voters} disclosure boundary`, async () => {
    const sim = await disclosureFixture(`disclosure-${voters}`, voters, 'mixed');
    const bundle = bundleOf(sim);
    assert.ok(validateManifest(sim.manifest, voters).ok);
    const records = [{ seq: 0, record: bundle.manifest }, ...bundle.log.map(({ seq, entry }) => ({ seq, record: entry }))];
    const ctx = await deriveElectionContext(records); assert.ok(ctx.ok);
    const report = await verifyLoadedElection(records, ctx.value, bundle.roll, witnessedBoard(sim, bundle));
    assert.equal(canShowResults(report), true); assert.equal(report.counts.counted, 4);
    assert.equal(ctx.value.rollSize, voters); assert.ok(ctx.value.tally);
    const small = smallRollDisclosure(ctx.value.rollSize, tr);
    assert.equal(small?.textContent ?? null, voters < 10 ? 'Results may reveal individual votes' : null);
    for (const contest of ctx.value.tally.contests) {
      const expected = contest.id === 'choice' ? [null, null, 'none'] : ['all', null, 'none'];
      for (const [i, option] of contest.options.entries()) {
        const panel = optionDisclosure(option.T, report.counts.counted, tr);
        if (expected[i] === null) { assert.equal(panel, null); continue; }
        assert.ok(panel);
        assert.ok(panel.textContent?.startsWith('For this option: ' + required));
        assert.ok(panel.textContent?.includes(expected[i] === 'all' ? 'All counted voters selected this option.' : 'No counted voter selected this option.'));
      }
    }
  });
}

test('non-unanimous real single-choice and approval tallies produce no option notices', async () => {
  const sim = await disclosureFixture('disclosure-no-unanimity', 10, 'none');
  const bundle = bundleOf(sim), records = [{ seq: 0, record: bundle.manifest }, ...bundle.log.map(({ seq, entry }) => ({ seq, record: entry }))];
  const ctx = await deriveElectionContext(records); assert.ok(ctx.ok); assert.ok(ctx.value.tally);
  const report = await verifyLoadedElection(records, ctx.value, bundle.roll, witnessedBoard(sim, bundle));
  assert.equal(canShowResults(report), true); assert.equal(report.counts.counted, 4);
  assert.equal(smallRollDisclosure(ctx.value.rollSize, tr), null);
  for (const contest of ctx.value.tally.contests) for (const option of contest.options) assert.equal(optionDisclosure(option.T, report.counts.counted, tr), null);
});

test('empty elections and invalid counters cannot assert that any participant choice is known', async () => {
  const sim = await disclosureFixture('disclosure-empty', 9, 'empty');
  const bundle = bundleOf(sim), records = [{ seq: 0, record: bundle.manifest }, ...bundle.log.map(({ seq, entry }) => ({ seq, record: entry }))];
  const ctx = await deriveElectionContext(records); assert.ok(ctx.ok);
  const report = await verifyLoadedElection(records, ctx.value, bundle.roll, witnessedBoard(sim, bundle));
  assert.equal(canShowResults(report), false); assert.equal(report.counts.counted, 0); assert.equal(ctx.value.tally, undefined);
  for (const counted of [0, -1, NaN, Infinity, 2.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(optionDisclosure(0, counted, tr), null);
  for (const count of [-1, 1, 3, 5, NaN, Infinity]) assert.equal(optionDisclosure(count, 4, tr), null);
  for (const roll of [-1, NaN, Infinity, 2.5]) assert.equal(smallRollDisclosure(roll, tr), null);
});
