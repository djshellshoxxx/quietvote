// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-16-REQ-005, QV-18-REQ-034
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalize, parseJsonContainer, parseQvJson, type JsonContainerPath, type QvJson } from '../src/index.ts';

const bodyPath = (path: JsonContainerPath): boolean => path.length === 3 && path[0] === 'entries' && typeof path[1] === 'number' && path[2] === 'body_b64u';
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const parseError = (fn: () => unknown): string => {
  try { fn(); } catch (error) {
    assert.equal((error as { code: string }).code, 'E_PARSE');
    return (error as Error).message;
  }
  assert.fail('expected a typed parse refusal');
};

test('container JSON: required trusted predicate receives numeric indexes and decoded string keys', () => {
  const paths: JsonContainerPath[] = [];
  const text = '{"entries":[{"body_b64u":null},{"\\u0062ody_b64u":null}]}';
  const value = parseJsonContainer(text, (path) => { paths.push(path); return bodyPath(path); });
  assert.deepEqual(paths, [['entries', 0, 'body_b64u'], ['entries', 1, 'body_b64u']]);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), { entries: [{ body_b64u: null }, { body_b64u: null }] });
  assert.deepEqual(parseJsonContainer(encode(text), bodyPath), value);
  assert.match(parseError(() => parseJsonContainer('{}', undefined as never)), /predicate required/);
});

test('container JSON: only exact true grants a nullable position', () => {
  for (const answer of [false, undefined, null, 1, 'true', {}, new Boolean(true)]) {
    assert.match(parseError(() => parseJsonContainer('{"body_b64u":null}', () => answer as boolean)), /null not allowed/);
  }
  assert.equal(parseJsonContainer('null', (path) => path.length === 0), null, 'schema caller must explicitly authorize even the root');
});

test('container JSON: predicate path snapshots cannot corrupt traversal or later sibling positions', () => {
  const paths: (string | number)[][] = [];
  const value = parseJsonContainer('{"entries":[{"body_b64u":null},{"body_b64u":null}]}', (path) => {
    paths.push([...path]);
    const allowed = bodyPath(path);
    (path as (string | number)[]).splice(0, path.length, 'mutated');
    return allowed;
  });
  assert.deepEqual(paths, [['entries', 0, 'body_b64u'], ['entries', 1, 'body_b64u']]);
  assert.ok(value !== null);
});

test('container JSON: nullable schema distinguishes object keys, lookalikes and nested body fields', () => {
  for (const text of [
    '{"entries":{"0":{"body_b64u":null}}}', '{"entries":[{"body_b64u":{"body_b64u":null}}]}',
    '{"entries":[{"body_b64u":[null]}]}', '{"entries":[{"body_b64u ":null}]}',
    '{"entries":[{"body_b64U":null}]}', '{"entries":[{"body_b64u\\u200b":null}]}',
    '{"nested":{"entries":[{"body_b64u":null}]}}', '{"entries":[null]}',
  ]) assert.match(parseError(() => parseJsonContainer(text, bodyPath)), /null not allowed/, text);
});

test('container JSON: duplicate keys including escaped aliases remain refused at every depth', () => {
  for (const text of [
    '{"body_b64u":null,"body_b64u":"x"}', '{"body_b64u":null,"\\u0062ody_b64u":null}',
    '{"entries":[{"body_b64u":null,"body_b64u":null}]}', '{"x":{"a":1,"a":2}}',
    '{"entries":[],"entries":[{"body_b64u":null}]}',
  ]) assert.match(parseError(() => parseJsonContainer(text, () => true)), /duplicate key/, text);
});

test('container JSON: signed parser and serializer retain their exact no-null API and domain', () => {
  for (const text of ['null', '[null]', '{"body_b64u":null}', '{"board":{"entries":[{"body_b64u":null}]}}']) {
    assert.match(parseError(() => parseQvJson(text)), /null not allowed/);
    assert.match(parseError(() => Reflect.apply(parseQvJson, undefined, [text, () => true])), /null not allowed/);
  }
  const container = parseJsonContainer('{"entries":[{"body_b64u":null}]}', bodyPath);
  assert.match(parseError(() => canonicalize(container)), /outside QV-JSON profile/);
  // @ts-expect-error The exported signed QvJson type must still exclude null.
  const forbidden: QvJson = null;
  void forbidden;
});

test('container JSON: unchanged strict rules have the same errors as the signed parser', () => {
  const bad: (string | Uint8Array)[] = [
    '', '{', 'true false', '{"a":1,"a":2}', '[1,]', '{"a":1,}',
    '1.0', '1e2', '-0', '9007199254740992', '-9007199254740992', '01',
    '"\\ud800"', '"\\udc00"', '"e\u0301"', '{"e\u0301":1}', '"raw\nnewline"', '"\\q"',
    '\ufeff{}', Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d), Uint8Array.of(0xc0, 0xaf),
    '['.repeat(33) + '0' + ']'.repeat(33),
  ];
  for (const input of bad) assert.equal(parseError(() => parseJsonContainer(input, () => true)), parseError(() => parseQvJson(input)));
  for (const suffix of ['1.5', '1e2', '-0', '"e\u0301"', '"\\ud800"']) {
    parseError(() => parseJsonContainer(`{"entries":[{"body_b64u":null}],"other":${suffix}}`, bodyPath));
  }
});

test('container JSON: valid QV-JSON and depth boundaries are unchanged', () => {
  for (const text of ['{}', '[]', 'true', 'false', '"é"', '0', '-1', '9007199254740991', '-9007199254740991',
    '{"__proto__":{"x":1},"a":[1,true,"\\ud83d\\ude00"]}', '['.repeat(32) + '0' + ']'.repeat(32)]) {
    const strict = parseQvJson(text), container = parseJsonContainer(text, () => false);
    assert.deepEqual(container, strict); assert.equal(canonicalize(container), canonicalize(strict));
  }
  assert.ok(Array.isArray(parseJsonContainer('['.repeat(32) + 'null' + ']'.repeat(32), (path) => path.length === 32 && path.every((part) => part === 0))));
  assert.match(parseError(() => parseJsonContainer('['.repeat(33) + 'null' + ']'.repeat(33), () => true)), /nesting too deep/);
  assert.match(parseError(() => parseJsonContainer('nullx', () => true)), /trailing data/);
});
