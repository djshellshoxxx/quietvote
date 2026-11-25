import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedLogId, logOrigin } from '@quietvote/protocol';
import { electionFixture, type Fixture } from './helpers/harness.ts';
import type { Transcript } from '../src/index.ts';

// Protocol X-21 / QV-18 origin: `quietvote/v1/` + 26 lowercase base32 chars (base32 of the 16-byte election_id).
// The board (`ORIGIN_RE`), server (`originOf`) and protocol (`logOrigin`) all use this form. The ceremony
// transcript must use it too, and must derive it from election_id, not from bb.log_id.
const ORIGIN_RE = /^quietvote\/v1\/[a-z2-7]{26}$/;

let f: Fixture;
let tr: Transcript;

test('ceremony transcript origin is the election log origin (quietvote/v1/base32(election_id))', async () => {
  f = await electionFixture({ n: 3, t: 2, seed: 'origin' });
  tr = await (await f.c.act(1, async (x) => x)).exportTranscript('airgap-dkg', { network: 'offline' });
  const m = tr.manifest.body;
  assert.equal(tr.origin, logOrigin(m));
  assert.match(tr.origin, ORIGIN_RE);
  assert.notEqual(tr.origin, `quietvote/v1/${m.bb.log_id}`);
  assert.equal(m.bb.log_id, expectedLogId(tr.origin), 'bb.log_id must be SHA-256 of the origin');
});

test('origin is a function of election_id only (independent of bb.log_id and witnesses)', async () => {
  const m = tr.manifest.body;
  const altered = { ...m, bb: { ...m.bb, log_id: 'ff'.repeat(32), witness_quorum: 1 } };
  assert.equal(logOrigin(altered), tr.origin);
  assert.notEqual(logOrigin({ ...m, election_id: 'ab'.repeat(16) }), tr.origin);
});
