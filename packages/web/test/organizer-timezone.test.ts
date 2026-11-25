// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-13-REQ-092
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offsetText, zonedLocalToUtc, zoneOffsetMinutes } from '../src/i18n/datetime.ts';

test('historical second offsets retain exact UTC instants and explicit offset text', () => {
  for (const [zone, instant, seconds, text] of [
    ['Europe/Paris', '1900-01-01T11:50:39Z', 561, 'UTC+00:09:21'],
    ['Asia/Kathmandu', '1900-01-01T06:18:44Z', 20476, 'UTC+05:41:16'],
  ] as const) {
    assert.deepEqual(zonedLocalToUtc({ y: 1900, mo: 1, d: 1, h: 12, mi: 0 }, zone), { kind: 'ok', instant, offsetMinutes: seconds / 60 });
    assert.equal(offsetText(seconds / 60), text);
  }
  assert.equal(offsetText(-561 / 60), 'UTC-00:09:21');
  assert.equal(offsetText(330), 'UTC+05:30');
});

test('UTC resolution and offset reconstruction preserve exact years instead of remapping 00..99 to 1900..1999', () => {
  for (const year of [0, 1, 99, 100, 2027]) {
    const instant = `${String(year).padStart(4, '0')}-01-01T00:00:00Z`;
    assert.deepEqual(zonedLocalToUtc({ y: year, mo: 1, d: 1, h: 0, mi: 0 }, 'UTC'), { kind: 'ok', instant, offsetMinutes: 0 });
    assert.equal(zoneOffsetMinutes(Date.parse(instant), 'UTC'), 0, instant);
  }
});

test('early-year fixed-offset conversion retains the year across a local New Year boundary', () => {
  const instant = '0098-12-31T19:00:00Z';
  assert.equal(zoneOffsetMinutes(Date.parse(instant), 'Etc/GMT-5'), 300);
  assert.deepEqual(zonedLocalToUtc({ y: 99, mo: 1, d: 1, h: 0, mi: 0 }, 'Etc/GMT-5'), { kind: 'ok', instant, offsetMinutes: 300 });
});

test('gap alternatives identify real wall times for one-hour, half-hour and skipped-day transitions', () => {
  for (const [zone, local] of [
    ['Europe/Berlin', { y: 2027, mo: 3, d: 28, h: 2, mi: 30 }],
    ['Australia/Lord_Howe', { y: 2027, mo: 10, d: 3, h: 2, mi: 15 }],
    ['Pacific/Apia', { y: 2011, mo: 12, d: 30, h: 12, mi: 0 }],
  ] as const) {
    const result = zonedLocalToUtc(local, zone);
    assert.equal(result.kind, 'gap', zone);
    if (result.kind !== 'gap') continue;
    assert.equal(new Set(result.suggestions).size, 2);
    for (const suggestion of result.suggestions) {
      const date = new Date(`${suggestion.replace(' ', 'T')}:00Z`);
      const resolved = zonedLocalToUtc({ y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes() }, zone);
      assert.notEqual(resolved.kind, 'gap', `${zone} suggested another nonexistent time: ${suggestion}`);
    }
  }
});

test('half-hour folds require an explicit matching offset and preserve each distinct UTC instant', () => {
  const local = { y: 2027, mo: 4, d: 4, h: 1, mi: 45 };
  const result = zonedLocalToUtc(local, 'Australia/Lord_Howe');
  assert.equal(result.kind, 'fold');
  if (result.kind !== 'fold') return;
  assert.deepEqual(result.candidates, [
    { offsetMinutes: 660, instant: '2027-04-03T14:45:00Z' },
    { offsetMinutes: 630, instant: '2027-04-03T15:15:00Z' },
  ]);
  assert.equal(zonedLocalToUtc(local, 'Australia/Lord_Howe', 0).kind, 'fold');
  for (const candidate of result.candidates) assert.deepEqual(zonedLocalToUtc(local, 'Australia/Lord_Howe', candidate.offsetMinutes), { kind: 'ok', ...candidate });
});
