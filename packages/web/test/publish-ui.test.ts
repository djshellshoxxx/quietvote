import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bytesToHex, ed25519Keypair } from '@quietvote/crypto';
import type { ClientOptions } from '../src/api/client.ts';
import { ApiError } from '../src/api/errors.ts';
import type { AppendResult, ElectionSummary, Instance, InviteResult } from '../src/api/types.ts';
import { PublishError, type PublishForm, type PublishState } from '../src/flow/publish.ts';
import { PUBLISH_UX_CODES, publishAudience, publishFailure, runPublish, type PublishRun } from '../src/flow/publish-ui.ts';
import { EN } from '../src/i18n/en.ts';
import { KeyError, type QvKey1 } from '../src/key/keystore.ts';
import { createSigner } from '../src/key/signer.ts';
import type { DeviceStorage } from '../src/key/storage.ts';
import { b64uEncode } from '../src/util/hex.ts';

const ELECTION = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'quietvote/v1/ABCDEFGHJKMNPQRSTVWXYZ2345';
const INSTANCE = 'INST000000000000000000000000';
const PAGE = 'https://vote.example';
const seedOf = (i: number): Uint8Array => new Uint8Array(32).fill(i);
const pkHex = (i: number): string => bytesToHex(ed25519Keypair(seedOf(i)).publicKey);
const LOG_PK = ed25519Keypair(seedOf(90)).publicKey;
const roll = Array.from({ length: 10 }, (_, i) => pkHex(20 + i)).sort();
const form: PublishForm = {
  title: 'Budget', contests: [{ template: 'yes-no', question: 'Adopt?', options: [] }],
  opensIso: '2027-03-01T08:00:00Z', closesIso: '2027-03-14T17:00:00Z', maxBallots: 5, quorumCount: 0,
  trustees: [1, 2, 3].map((i) => ({ name: `T${i}`, signPkHex: pkHex(100 + i) })), t: 2,
};

const storageWith = (hasKey: boolean): DeviceStorage =>
  ({ getKey: async (): Promise<QvKey1 | undefined> => (hasKey ? ({} as QvKey1) : undefined) }) as unknown as DeviceStorage;

/** Fake server for the calls the publish flow makes. `failInvitesOnce` fails the first invite call; `withhold` replays. */
function fakeServer(o: { failInvitesOnce?: ApiError; withhold?: boolean } = {}) {
  const seen = { elections: 0, posts: 0, inviteCalls: 0, audiences: [] as string[] };
  const client = {
    async instance(): Promise<Instance> {
      return { instance_id: INSTANCE, api_versions: ['v1'], server_version: 'test' };
    },
    async createElection(_org: string, title: string): Promise<ElectionSummary> {
      seen.elections++;
      return { election_id: ELECTION, origin: ORIGIN, log_pk: b64uEncode(LOG_PK), state: 'DRAFT', title };
    },
    async postEntryWithRetry(): Promise<AppendResult> {
      seen.posts++;
      return { status: 'included', receipt: {} } as unknown as AppendResult;
    },
    async createInvites(_id: string, count: number): Promise<InviteResult> {
      seen.inviteCalls++;
      if (o.failInvitesOnce !== undefined && seen.inviteCalls === 1) throw o.failInvitesOnce;
      const invites = Array.from({ length: count }, (_, i) =>
        o.withhold === true ? { invite_id: `inv${i}`, code_withheld: true } : { invite_id: `inv${i}`, code: `CODE-${seen.inviteCalls}-${i}` });
      return { invites };
    },
  };
  const make = (opts: ClientOptions) => {
    if (opts.signing !== undefined) seen.audiences.push(opts.signing.audience);
    return client as never;
  };
  return { seen, make };
}

function baseRun(srv: ReturnType<typeof fakeServer>, over: Partial<PublishRun> = {}): PublishRun {
  return {
    orgId: 'ORG0000000000000000000000000', passphrase: 'correct horse battery', form, rollHex: roll,
    storage: storageWith(true), apiBase: '', origin: PAGE,
    // A fresh signer per attempt: runPublish locks the signer it used.
    unlock: async () => createSigner(seedOf(1), { preferWebCrypto: false }),
    makeClient: srv.make, ...over,
  };
}

test('publish UI: an empty organization ID or a missing organizer key stops before any server call', async () => {
  const srv = fakeServer();
  assert.deepEqual(await runPublish(baseRun(srv, { orgId: '   ' })), { kind: 'noOrg' });
  assert.deepEqual(await runPublish(baseRun(srv, { storage: storageWith(false) })), { kind: 'noKey' });
  assert.equal(srv.seen.elections, 0);
  assert.equal(srv.seen.posts, 0);
});

test('publish UI: a wrong passphrase or an unreadable key is reported and nothing is sent', async () => {
  const srv = fakeServer();
  const wrong = await runPublish(baseRun(srv, { unlock: async () => { throw new KeyError('E_KEY_LOCKED', 'wrong passphrase'); } }));
  assert.deepEqual(wrong, { kind: 'locked', ux: 'E-KEY-LOCKED' });
  const broken = await runPublish(baseRun(srv, { storage: { getKey: async () => { throw new Error('denied'); } } as unknown as DeviceStorage }));
  assert.deepEqual(broken, { kind: 'locked', ux: 'E-KEY-STORAGE' });
  assert.equal(srv.seen.elections, 0);
});

test('publish UI: success publishes with the organizer key and returns the invitation codes once', async () => {
  const srv = fakeServer();
  const out = await runPublish(baseRun(srv));
  assert.equal(out.kind, 'published');
  if (out.kind !== 'published') return;
  assert.equal(out.electionId, ELECTION);
  assert.equal(out.invites.length, roll.length);
  assert.ok(out.invites.every((i) => i.code?.startsWith('CODE-')));
  assert.deepEqual(srv.seen.audiences, [publishAudience(INSTANCE, PAGE)]);
  assert.equal(publishAudience(INSTANCE, PAGE), `qv:${INSTANCE}@${PAGE}`);
});

test('publish UI: a failed step keeps a resumable state, and the retry continues without a second election', async () => {
  const srv = fakeServer({ failInvitesOnce: new ApiError({ status: 503, code: 'LOG_UNAVAILABLE', message: 'busy', requestId: 'req-7' }) });
  const first = await runPublish(baseRun(srv));
  assert.equal(first.kind, 'failed');
  if (first.kind !== 'failed') return;
  assert.equal(first.ux, 'E-API-UNAVAILABLE');
  assert.equal(first.ref, 'req-7');
  assert.ok(first.state !== undefined);
  assert.ok(!first.state.done.includes('invites'));
  assert.equal(srv.seen.posts, 2, 'manifest and ceremony start were posted before the failure');

  const second = await runPublish(baseRun(srv, { prior: first.state as PublishState }));
  assert.equal(second.kind, 'published');
  assert.equal(srv.seen.elections, 1, 'the retry does not create another election');
  assert.equal(srv.seen.posts, 2, 'completed entries are not posted again');
});

test('publish UI: a replayed invitation batch is reported as E-ORG-INVITE-REPLAY with its own text', async () => {
  const srv = fakeServer({ withhold: true });
  const out = await runPublish(baseRun(srv));
  assert.equal(out.kind, 'failed');
  if (out.kind !== 'failed') return;
  assert.equal(out.ux, 'E-ORG-INVITE-REPLAY');
  assert.ok(out.state !== undefined);
});

test('publish UI: every failure code the flow can show has a catalog title and body', () => {
  const catalog = EN as Record<string, unknown>;
  for (const code of PUBLISH_UX_CODES) {
    for (const part of ['title', 'body']) {
      const entry = catalog[`qv.err.${code}.${part}`] as { message?: string } | undefined;
      assert.ok(entry?.message, `${code}.${part}`);
    }
  }
  assert.equal(publishFailure(new PublishError('E-ORG-QUORUM', 'x')).ux, 'E-ORG-QUORUM');
  assert.deepEqual(publishFailure(new PublishError('E-ORG-MANIFEST', 'bad roll')), { ux: 'E-ORG-MANIFEST', detail: 'bad roll' });
  // A local code with no catalog text falls back to the generic error instead of a missing key.
  assert.equal(publishFailure(new PublishError('E-ORG-SIGNER', 'x')).ux, 'E-GEN-UNKNOWN');
  assert.equal(publishFailure(new Error('boom')).ux, 'E-GEN-UNKNOWN');
  assert.equal(publishFailure(new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'slow' })).ux, 'E-API-RATE');
});

test('publish UI: the create view calls runPublish from the publish button, and shows the button only after a valid preview', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/ui/app.ts', import.meta.url)), 'utf8');
  assert.match(src, /import \{ runPublish, type PublishOutcome \} from '\.\.\/flow\/publish-ui\.ts'/);
  assert.match(src, /const pubBtn = btn\(t\('qv\.org\.publish'\)/);
  assert.match(src, /o = await runPublish\(\{/);
  assert.match(src, /prepared = \{ form, rollHex: roll\.keys \};\n\s+add\(publishBox, \[publishSection\(\)\]\);/);
  assert.match(src, /\}, \{ primary: true \}\), out, publishBox\);/);
});
