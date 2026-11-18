import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qv, tinyBundle, tmp, writeJson } from './helpers.ts';

test('election inspect counts prototype-named log types as own integers in JSON and text', async () => {
  // The inspector deliberately describes an unverified, structurally loaded bundle.
  // No election validation/protocol rules or signed fixture expectations are changed.
  const bundle = tinyBundle();
  const names = ['constructor', 'toString', '__proto__'];
  for (const type of names) {
    bundle.log.push({ entry: { body: { type } } });
    bundle.log.push({ entry: { body: { type } } });
  }
  const file = writeJson(tmp(), 'prototype-named-log-types.json', bundle);

  const jsonResult = await qv(['election', 'inspect', file, '--json']);
  assert.equal(jsonResult.code, 0, jsonResult.err);
  const report = JSON.parse(jsonResult.out);
  assert.equal(report.verified, false, 'inspection must not be called verification');
  assert.equal(report.log_entries, bundle.log.length);
  for (const type of names) {
    assert.equal(Object.hasOwn(report.log_record_types, type), true, `missing own count for ${type}`);
    assert.equal(report.log_record_types[type], 2, `incorrect count for ${type}`);
  }
  assert.equal(report.log_record_types['ballot:cast'], 4, 'normal counts stay unchanged');

  const textResult = await qv(['election', 'inspect', file]);
  assert.equal(textResult.code, 0, textResult.err);
  for (const type of names) {
    assert.ok(textResult.out.includes(`${type} 2`), `missing correct text count for ${type}`);
  }
  assert.match(textResult.out, /not a verification/);
});
