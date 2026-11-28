// @verifies QV-13-REQ-091
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranslator } from '../src/i18n/index.ts';
import { formatDisplayTime, formatReceiptTime } from '../src/ui/display-time.ts';

const tr = createTranslator('en');
const plain = (text: string): string => text.replace(/[\u2068\u2069]/g, '');

for (const [instant, zone, time, offset] of [
  ['2027-03-28T00:30:42Z', 'Europe/Berlin', '01:30', 'UTC+01:00'],
  ['2027-03-28T01:30:42Z', 'Europe/Berlin', '03:30', 'UTC+02:00'],
  ['2027-10-31T00:30:42Z', 'Europe/Berlin', '02:30', 'UTC+02:00'],
  ['2027-10-31T01:30:42Z', 'Europe/Berlin', '02:30', 'UTC+01:00'],
  ['2027-03-14T06:30:42Z', 'America/New_York', '01:30', 'UTC-05:00'],
  ['2027-03-14T07:30:42Z', 'America/New_York', '03:30', 'UTC-04:00'],
  ['2027-11-07T05:30:42Z', 'America/New_York', '01:30', 'UTC-04:00'],
  ['2027-11-07T06:30:42Z', 'America/New_York', '01:30', 'UTC-05:00'],
  ['2027-03-14T17:00:42Z', 'Asia/Kolkata', '22:30', 'UTC+05:30'],
]) {
  test(`display and receipt offsets at ${instant} in ${zone}`, () => {
    const zones = { viewerZone: zone! };
    const deadline = plain(formatDisplayTime(instant!, tr, zones));
    assert.ok(deadline.includes(time!)); assert.ok(deadline.includes(offset!)); assert.ok(deadline.includes(zone!));
    assert.equal(deadline.includes(time + ':42'), false, 'deadlines retain their existing minute precision');
    const receipt = formatReceiptTime(Date.parse(instant!) / 1000, tr, zones); assert.ok(receipt);
    const text = plain(receipt);
    assert.ok(text.includes(time + ':42'), 'receipt seconds must survive formatting');
    assert.ok(text.includes(offset!)); assert.ok(text.includes(zone!));
  });
}

test('different display and viewer zones each have their own explicit offset and name', () => {
  const text = plain(formatDisplayTime('2027-03-14T17:00:00Z', tr, { displayZone: 'Europe/Berlin', viewerZone: 'America/New_York' }));
  const [display, viewer] = text.split(' — ');
  assert.ok(display?.includes('18:00')); assert.ok(display?.includes('(UTC+01:00, Europe/Berlin)'));
  assert.ok(viewer?.startsWith('Your time: ')); assert.ok(viewer?.includes('13:00')); assert.ok(viewer?.includes('(UTC-04:00, America/New_York)'));
});

test('equal zones render once and the default uses the actual local zone', () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = plain(formatDisplayTime('2027-03-14T17:00:00Z', tr));
  const explicit = plain(formatDisplayTime('2027-03-14T17:00:00Z', tr, { displayZone: zone, viewerZone: zone }));
  assert.equal(local, explicit); assert.ok(local.includes(zone)); assert.equal(local.includes('Your time:'), false);
  assert.equal(local.split(', ' + zone + ')').length - 1, 1);
  const utc = plain(formatDisplayTime('2027-03-14T17:00:00Z', tr, { displayZone: 'UTC', viewerZone: 'UTC' }));
  assert.equal(utc.split(', UTC)').length - 1, 1); assert.equal(utc.includes('Your time:'), false);
});

test('missing or unrenderable receipt times are omitted; an explicitly signed zero stays a real epoch instant', () => {
  for (const timestamp of [undefined, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER]) assert.equal(formatReceiptTime(timestamp, tr), undefined);
  const zero = formatReceiptTime(0, tr, { viewerZone: 'UTC' }); assert.ok(zero);
  assert.match(plain(zero), /1970/); assert.match(plain(zero), /00:00:00/); assert.match(plain(zero), /UTC\+00:00, UTC/);
});
