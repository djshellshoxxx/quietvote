import test from 'node:test';
import assert from 'node:assert/strict';
import { preservesSecurityFloor, type BackupSecurityFloor } from '../src/backup-security-floor.ts';

const id = JSON.stringify(['principal', 'request-key']);
const receipt = { principal: 'principal', idem_key: 'request-key', method: 'POST', path: '/invites',
  req_sha256: new Uint8Array(32), expires_at: 10000, status: 201,
  response: '{"invites":[{"invite_id":"original","code_withheld":true}]}', audit_action: null, audit_detail: null };
const pending = { ...receipt, status: -1, response: null };
function fixture(): BackupSecurityFloor {
  return { keys: new Map(), orgs: new Map(), hooks: new Map(), deletedHooks: new Set(), nonces: new Map(),
    requests: new Map([[id, { ...pending }]]), eventCursors: new Map(), invites: new Map(), registrationSchemes: new Map(),
    operationReceipts: new Map([['election', new Map([[id, { ...receipt }]])]]) };
}

test('retained receipt cannot hide loss of its recoverable control-marker generation', () => {
  const floor = fixture(), candidate = fixture();
  assert.equal(preservesSecurityFloor(candidate, floor, 1), true);
  candidate.requests.set(id, { ...pending, expires_at: receipt.expires_at + 1 });
  assert.equal(preservesSecurityFloor(candidate, floor, 1), false, 'exact marker generation must remain bridgeable');
});

test('retained receipt cannot hide a conflicting completed response', () => {
  const floor = fixture(), candidate = fixture();
  candidate.requests.set(id, { ...pending, status: 201, response: Buffer.from('{"invites":[]}') });
  assert.equal(preservesSecurityFloor(candidate, floor, 1), false);
});

test('a delayed successful promotion may replace its original operation receipt', () => {
  const floor = fixture(), candidate = fixture();
  const completed = { ...pending, status: receipt.status, response: Buffer.from(receipt.response), expires_at: receipt.expires_at + 100 };
  floor.requests.set(id, { ...completed });
  candidate.requests.set(id, { ...completed });
  candidate.operationReceipts.clear();
  assert.equal(preservesSecurityFloor(candidate, floor, 1), true);
});
