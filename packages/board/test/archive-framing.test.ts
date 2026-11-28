// SPDX-License-Identifier: AGPL-3.0-or-later
// Strict archive framing must inspect original text instead of normalizing a leading BOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, sha256, utf8 } from '@quietvote/crypto';
import { readChecksummedArchive, readTarStrict, writeTar } from '../src/index.ts';

const data = utf8('{"fixture":true}\n');
const sum = `${bytesToHex(sha256(data))}  election.json\n`;

test('strict tar names reject a leading BOM instead of interpreting a different member name', () => {
  const ordinary = writeTar([{ name: 'election.json', data }]);
  assert.deepEqual(readTarStrict(ordinary, { maxFiles: 2 }).get('election.json'), data);
  const prefixed = writeTar([{ name: '\ufeffelection.json', data }]);
  assert.throws(() => readTarStrict(prefixed, { maxFiles: 2 }), /unsafe file name/);
});

test('checksums reject a leading BOM instead of repairing a malformed digest line', () => {
  const archive = (sums: string) => writeTar([
    { name: 'election.json', data }, { name: 'SHA256SUMS', data: utf8(sums) },
  ]);
  assert.deepEqual(readChecksummedArchive(archive(sum), { maxFiles: 2 }).get('election.json'), data);
  assert.throws(() => readChecksummedArchive(archive('\ufeff' + sum), { maxFiles: 2 }), /malformed or duplicate line/);
});
