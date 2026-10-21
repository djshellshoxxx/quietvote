import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, ed25519IsStrictPoint, ed25519Keypair, ed25519Verify, utf8 } from '@quietvote/crypto';
import { manifestHash, verifyMultiSig, type Manifest, type MultiSignedRecord } from '@quietvote/protocol';
import { ApiClient } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import { requestMessage } from '../src/api/signing.ts';
import type { AppendResult, ElectionSummary, InviteResult } from '../src/api/types.ts';
import { commitRoll, inviteList, publishElection, PublishError, type PublishClient, type PublishForm, type PublishInput, type PublishState } from '../src/flow/publish.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';

const ELECTION = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'quietvote/v1/ABCDEFGHJKMNPQRSTVWXYZ2345';
const ORG = 'ORG0000000000000000000000000';
const seedOf = (i: number): Uint8Array => new Uint8Array(32).fill(i);
const pkHex = (i: number): string => bytesToHex(ed25519Keypair(seedOf(i)).publicKey);
const LOG_PK = ed25519Keypair(seedOf(90)).publicKey;

const roll = Array.from({ length: 10 }, (_, i) => pkHex(20 + i)).sort();
const form: PublishForm = {
  title: 'Budget', contests: [{ template: 'yes-no', question: 'Adopt?', options: [] }],
  opensIso: '2027-03-01T08:00:00Z', closesIso: '2027-03-14T17:00:00Z', maxBallots: 5, quorumCount: 0,
  trustees: [1, 2, 3].map((i) => ({ name: `T${i}`, signPkHex: pkHex(100 + i) })), t: 2,
};

async function signerFor(i = 1): Promise<Signer> {
  return createSigner(seedOf(i), { preferWebCrypto: false });
}

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}): ApiError =>
  new ApiError({ status, code, message: code, ...extra });

interface FakeOpts {
  /** Throws for the n-th (1-based) entry post, counting every entry post. */
  failPost?: { at: number; error: ApiError };
  failInvites?: { at: number; error: ApiError };
  withholdCodes?: boolean;
}

interface Fake {
  client: PublishClient;
  elections: number;
  posts: { id: string; header: string; body: string }[];
  inviteCalls: { count: number; key: string }[];
}

/** Fake of the subset of ApiClient the flow uses. Records what it was asked to do. */
function fakeClient(o: FakeOpts = {}): Fake {
  const f: Fake = { client: undefined as unknown as PublishClient, elections: 0, posts: [], inviteCalls: [] };
  let inviteSeq = 0;
  f.client = {
    async createElection(orgId: string, title: string): Promise<ElectionSummary> {
      assert.equal(orgId, ORG);
      assert.equal(title, 'Budget');
      f.elections++;
      return { election_id: ELECTION, origin: ORIGIN, log_pk: b64uEncode(LOG_PK), state: 'DRAFT', title };
    },
    async postEntryWithRetry(id: string, header: string, body: string): Promise<AppendResult> {
      f.posts.push({ id, header, body });
      if (o.failPost !== undefined && f.posts.length === o.failPost.at) throw o.failPost.error;
      return { status: 'included', receipt: {} as AppendResult['receipt'] };
    },
    async createInvites(_id: string, count: number, key: string): Promise<InviteResult> {
      f.inviteCalls.push({ count, key });
      if (o.failInvites !== undefined && f.inviteCalls.length === o.failInvites.at) throw o.failInvites.error;
      const invites: InviteResult['invites'] = Array.from({ length: count }, () => {
        inviteSeq++;
        return o.withholdCodes === true ? { invite_id: `inv${inviteSeq}`, code_withheld: true } : { invite_id: `inv${inviteSeq}`, code: `code${inviteSeq}` };
      });
      return { invites };
    },
  } as unknown as PublishClient;
  return f;
}

function input(client: PublishClient, signer: Signer, extra: Partial<PublishInput> = {}): PublishInput {
  return { client, orgId: ORG, form, signer, rollHex: roll, now: () => 1_800_000_000, ...extra };
}

const decodeRecord = (b64: string): MultiSignedRecord<Record<string, unknown> & { type: string }> =>
  JSON.parse(new TextDecoder().decode(b64uDecode(b64)!)) as MultiSignedRecord<Record<string, unknown> & { type: string }>;

test('publish: success creates the election, posts manifest, DKG start and invites in order', async () => {
  const signer = await signerFor();
  const fake = fakeClient();
  const res = await publishElection(input(fake.client, signer));
  assert.equal(res.ok, true, res.ok ? '' : String(res.error));
  if (!res.ok) return;
  assert.deepEqual(res.state.done, ['validate', 'election', 'manifest', 'ceremony_start', 'invites']);
  assert.equal(fake.elections, 1);
  assert.deepEqual(fake.posts.map((p) => p.id), [ELECTION, ELECTION]);

  // manifest entry: coordinator (= organizer key) signed, bound to the server election id and log key
  const mrec = decodeRecord(fake.posts[0]!.body);
  const m = mrec.body as unknown as Manifest;
  assert.equal(m.election_id, ELECTION);
  assert.equal(m.bb.log_pk, bytesToHex(LOG_PK));
  assert.deepEqual(m.coordinator.keys, [bytesToHex(signer.publicKey)]);
  assert.equal(m.roll.size, roll.length);
  assert.ok(verifyMultiSig(manifestHash(m), mrec as unknown as MultiSignedRecord<Manifest>, m.coordinator.keys, m.coordinator.m));

  // DKG start marker is the dkg-open marker
  const marker = decodeRecord(fake.posts[1]!.body);
  assert.equal((marker.body as { name?: string }).name, 'dkg-open');

  // invites: one per roll key, codes kept in the state
  assert.equal(inviteList(res.state).length, roll.length);
  assert.equal(inviteList(res.state)[0]!.code, 'code1');
  assert.equal(fake.inviteCalls.length, 1);
  assert.equal(fake.inviteCalls[0]!.count, roll.length);
});

test('publish: state is JSON-serialisable (no key material, bytes stored as base64url)', async () => {
  const signer = await signerFor();
  const res = await publishElection(input(fakeClient().client, signer));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const copy = JSON.parse(JSON.stringify(res.state)) as PublishState;
  assert.deepEqual(copy, res.state);
  assert.ok(!JSON.stringify(res.state).includes('0101010101'), 'the organizer seed never enters the state');
});

test('publish: server problem+json through the real ApiClient is surfaced with its code and step', async () => {
  const signer = await signerFor();
  const seen: string[] = [];
  const fetchFake = async (url: string, init?: RequestInit): Promise<Response> => {
    seen.push(`${init?.method} ${url}`);
    if (url.endsWith('/elections') && init?.method === 'POST') {
      return new Response(JSON.stringify({ election_id: ELECTION, origin: ORIGIN, log_pk: b64uEncode(LOG_PK), state: 'DRAFT' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ type: 'about:blank', title: 'Unprocessable', status: 422, code: 'ENTRY_INVALID', reason: 'E_MANIFEST', detail: 'manifest bb.log_pk is not this election\'s log key', request_id: 'r1' }),
      { status: 422, headers: { 'content-type': 'application/problem+json' } });
  };
  const api = new ApiClient({ baseUrl: 'https://board.example', fetch: fetchFake, sleep: async () => undefined, signing: { signer, audience: 'qv:test@https://board.example' } });
  const res = await publishElection(input(api, signer));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.step, 'manifest');
  assert.ok(res.error instanceof ApiError);
  assert.equal((res.error as ApiError).status, 422);
  assert.equal((res.error as ApiError).code, 'ENTRY_INVALID');
  assert.equal((res.error as ApiError).reason, 'E_MANIFEST');
  assert.equal((res.error as ApiError).requestId, 'r1');
  assert.deepEqual(res.state.done, ['validate', 'election']);
  assert.equal(res.state.electionId, ELECTION);
  assert.equal(seen.length, 2);
});

test('publish: a server refusal (409 WRONG_PHASE) stops at the failing step and keeps the earlier ones', async () => {
  const signer = await signerFor();
  const fake = fakeClient({ failPost: { at: 1, error: apiError(409, 'WRONG_PHASE', { detail: 'election is closed' }) } });
  const res = await publishElection(input(fake.client, signer));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.step, 'manifest');
  assert.ok(res.error instanceof ApiError);
  assert.equal(res.error.code, 'WRONG_PHASE');
  assert.deepEqual(res.state.done, ['validate', 'election']);
  assert.equal(fake.inviteCalls.length, 0);
});

test('publish: invalid form fails at validate before any server call', async () => {
  const signer = await signerFor();
  const fake = fakeClient();
  const res = await publishElection(input(fake.client, signer, { form: { ...form, t: 9 } }));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.step, 'validate');
  assert.ok(res.error instanceof PublishError);
  assert.equal((res.error as PublishError).code, 'E-ORG-TRUSTEES');
  assert.equal(fake.elections, 0);
  assert.equal(fake.posts.length, 0);
});

test('resume: a transient manifest failure re-posts identical bytes and does not create a second election', async () => {
  const signer = await signerFor();
  const first = fakeClient({ failPost: { at: 1, error: apiError(503, 'MAINTENANCE', { retryable: true }) } });
  const r1 = await publishElection(input(first.client, signer));
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.step, 'manifest');

  const second = fakeClient();
  const r2 = await publishElection(input(second.client, signer), r1.state);
  assert.equal(r2.ok, true, r2.ok ? '' : String(r2.error));
  assert.equal(second.elections, 0, 'the election already exists');
  assert.equal(first.posts[0]!.header, second.posts[0]!.header, 'retry posts the stored header bytes');
  assert.equal(first.posts[0]!.body, second.posts[0]!.body, 'retry posts the stored body bytes');
  if (!r2.ok) return;
  assert.equal(r2.state.electionId, ELECTION);
  assert.equal(inviteList(r2.state).length, roll.length);
});

test('resume: invites in batches only re-run the failed batch; earlier invites are kept', async () => {
  const signer = await signerFor();
  const n = 1500;
  const bigRoll = Array.from({ length: n }, (_, i) => {
    const seed = new Uint8Array(32);
    seed[0] = i & 0xff;
    seed[1] = (i >> 8) & 0xff;
    seed[2] = 0x42;
    return bytesToHex(ed25519Keypair(seed).publicKey);
  }).sort();
  assert.equal(new Set(bigRoll).size, n);
  const fail = fakeClient({ failInvites: { at: 2, error: apiError(503, 'MAINTENANCE', { retryable: true }) } });
  const r1 = await publishElection(input(fail.client, signer, { rollHex: bigRoll }));
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.step, 'invites');
  assert.deepEqual(r1.state.inviteBatches.map((b) => b.count), [1000, 500]);
  assert.equal(r1.state.inviteBatches[0]!.invites?.length, 1000);

  const ok = fakeClient();
  const r2 = await publishElection(input(ok.client, signer, { rollHex: bigRoll }), r1.state);
  assert.equal(r2.ok, true, r2.ok ? '' : String(r2.error));
  assert.deepEqual(ok.inviteCalls.map((c) => c.count), [500], 'only the unfinished batch is requested');
  assert.equal(ok.inviteCalls[0]!.key, r1.state.inviteBatches[1]!.key, 'same idempotency key for the unfinished batch');
  if (!r2.ok) return;
  assert.equal(inviteList(r2.state).length, n);
  assert.equal(fail.elections, 1);
});

test('publish: a replayed invite request without codes is reported, and the batch key is rotated for the retry', async () => {
  const signer = await signerFor();
  const fake = fakeClient({ withholdCodes: true });
  const res = await publishElection(input(fake.client, signer));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.step, 'invites');
  assert.equal((res.error as PublishError).code, 'E-ORG-INVITE-REPLAY');
  assert.equal(res.state.inviteBatches[0]!.invites, undefined);
  assert.notEqual(res.state.inviteBatches[0]!.key, fake.inviteCalls[0]!.key);
});

test('commitRoll: posts a coordinator-signed roll-commit with the manifest roll root, after publish', async () => {
  const signer = await signerFor();
  const fake = fakeClient();
  const pub = await publishElection(input(fake.client, signer));
  assert.equal(pub.ok, true);
  if (!pub.ok) return;
  const rc = fakeClient();
  const res = await commitRoll(input(rc.client, signer), pub.state);
  assert.equal(res.ok, true, res.ok ? '' : String(res.error));
  if (!res.ok) return;
  assert.equal(rc.posts.length, 1);
  const rec = decodeRecord(rc.posts[0]!.body);
  const body = rec.body as unknown as { type: string; root: string; size: number };
  assert.equal(body.type, 'roll-commit');
  assert.equal(body.size, roll.length);
  const m = decodeRecord(fake.posts[0]!.body).body as unknown as Manifest;
  assert.equal(body.root, m.roll.root);
  assert.deepEqual(res.state.done.slice(-1), ['roll_commit']);
  // a second call does not post again
  const again = await commitRoll(input(rc.client, signer), res.state);
  assert.equal(again.ok, true);
  assert.equal(rc.posts.length, 1);
});

test('commitRoll: refuses a signer that is not the manifest coordinator', async () => {
  const signer = await signerFor();
  const fake = fakeClient();
  const pub = await publishElection(input(fake.client, signer));
  assert.equal(pub.ok, true);
  if (!pub.ok) return;
  const other = await signerFor(77);
  const res = await commitRoll(input(fakeClient().client, other), pub.state);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal((res.error as PublishError).code, 'E-ORG-SIGNER');
});

test('signed requests: createElection carries a QV-Sig header that verifies over the QV-08 request message', async () => {
  const signer = await signerFor(5);
  let auth = '';
  let target = '';
  let body = '';
  const api = new ApiClient({
    baseUrl: 'https://board.example', sleep: async () => undefined,
    signing: { signer, audience: 'qv:inst@https://board.example', now: () => 1_800_000_000, nonce: () => new Uint8Array(16).fill(9) },
    fetch: async (url, init) => {
      target = url.replace('https://board.example', '');
      auth = (init!.headers as Record<string, string>).Authorization!;
      body = init!.body as string;
      return new Response(JSON.stringify({ election_id: ELECTION, origin: ORIGIN, log_pk: b64uEncode(LOG_PK), state: 'DRAFT' }), { status: 201, headers: { 'content-type': 'application/json' } });
    },
  });
  await api.createElection(ORG, 'Budget', 'key-abcdefgh');
  const m = /^QV-Sig keyid=([A-Za-z0-9_-]+),ts=(\d+),nonce=([A-Za-z0-9_-]+),sig=([A-Za-z0-9_-]+)$/.exec(auth);
  assert.ok(m, auth);
  const sig = b64uDecode(m[4]!)!;
  const msg = requestMessage('POST', target, 'qv:inst@https://board.example', Number(m[2]), b64uDecode(m[3]!)!, utf8(body));
  assert.ok(ed25519Verify(signer.publicKey, sig, msg));
  assert.equal(target, `/api/v1/orgs/${ORG}/elections`);
  assert.equal(m[2], '1800000000');
  assert.ok(ed25519IsStrictPoint(signer.publicKey));
});

test('signed requests: a management call without a configured key fails locally with UNAUTHENTICATED', async () => {
  let called = false;
  const api = new ApiClient({ fetch: async () => { called = true; return new Response('{}'); } });
  await assert.rejects(api.createInvites(ELECTION, 1, 'key-abcdefgh'), (e: unknown) => e instanceof ApiError && e.code === 'UNAUTHENTICATED');
  assert.equal(called, false);
});
