// S3 confidentiality review — the web client stamps ballot entries with SECOND precision on the public board.
// Not picked up by the test glob (.repro.ts). Run: node --test packages/web/test/s3-timestamp.repro.ts
//
// QV-06 §4.3 / QV-06-REQ-009 and QV-18 (`created_at ... clients may round to the minute (default)`) call for ballot
// entry timestamps at 60 s granularity; the privacy notice (QV-06 §10.3(2)) promises members see "when you voted (to
// the minute)". The web client's BallotController.now() defaults to Math.floor(Date.now()/1000) (seconds) and that value
// is written into the entry header `createdAt`, which is covered by the voter signature, hashed into the board leaf and
// published in the board export (QV-18-REQ-046, readable by anyone). So the public log reveals each voter's casting time
// to the SECOND, not the minute. This repro drives prepareEntry exactly as the controller does and decodes the leaf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@quietvote/crypto';
import { decodeHeader } from '@quietvote/board';
import { createSigner } from '../src/key/signer.ts';
import { prepareEntry } from '../src/flow/entries.ts';
import { streamRng } from '@quietvote/crypto';

test('web ballot entry createdAt is second-precision, not minute-rounded (QV-06-REQ-009)', async () => {
  const seed = new Uint8Array(32).fill(7);
  const signer = await createSigner(seed.slice(), { preferWebCrypto: false });
  // 2026-11-11T14:37:29Z -> 1794501449 s; the controller default is Math.floor(Date.now()/1000) with no rounding.
  const wall = Date.UTC(2026, 10, 11, 14, 37, 29) / 1000;
  const controllerNow = Math.floor(wall); // exactly BallotController.now()
  const entry = await prepareEntry({ signer, origin: 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa', type: 'ballot', record: { intent: 'cast' }, rng: streamRng('s3-ts'), now: controllerNow });
  const h = decodeHeader(entry.headerBytes);
  assert.ok(h.ok, 'header decodes');
  const createdAt = h.value.createdAt;
  console.log('controllerNow =', controllerNow, 'entry.createdAt =', createdAt, 'createdAt % 60 =', createdAt % 60);
  // The published timestamp equals the raw second value: it was NOT rounded to a 60 s boundary.
  assert.equal(createdAt, controllerNow, 'createdAt is the raw second count');
  assert.notEqual(createdAt % 60, 0, 'createdAt is not minute-aligned, i.e. the spec default rounding was not applied');
});

void bytesToHex;
