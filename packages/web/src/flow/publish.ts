// Organizer publish flow (QV-09 §7.1, QV-18 §5.2): creates the election, then posts the signed manifest, the DKG start
// marker and the invites. DOM-free; the API client is injected (a subset of ApiClient), so the flow is unit-tested with a fake.
//
// Resumable: every completed step is recorded in a PublishState (JSON-serialisable, no key material). A failed call returns
// the state; calling again with that state continues at the first unfinished step. Entries are prepared once and their exact
// bytes are stored, so a retry re-posts identical bytes (idempotent, QV-09 §4.4) instead of signing a new entry. Invite
// codes are secrets: the state holds them until the organizer has them, so it must not be written to browser storage.
//
// The roll-commit is separate from publishElection. Pinned membership does not depend on every member registering;
// invitations must still be issued before commitment. Use commitRoll for that step.
import { PROTO_ID, manifestHash, rollRoot, type Manifest, type MarkerBody, type RollCommitBody } from '@quietvote/protocol';
import { bytesToHex, hexToBytes, jcs, sha256, systemRng, type Rng } from '@quietvote/crypto';
import type { ApiClient } from '../api/client.ts';
import type { InviteResult } from '../api/types.ts';
import { boundedPinnedRollBody, checkedPinnedRoll } from '../api/pinned-roll.ts';
import type { Signer } from '../key/signer.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';
import { prepareEntry } from './entries.ts';
import { buildManifest, signMulti, type ManifestForm, type OrgProblem } from './organizer.ts';

/** The client calls the flow needs; ApiClient satisfies it, tests pass a fake. */
export type PublishClient = Pick<ApiClient, 'createElection' | 'postEntryWithRetry' | 'createInvites'>;

/** Manifest form as the organizer enters it. Election id, log key and origin come from the server; the coordinator is the signer. */
export type PublishForm = Omit<ManifestForm, 'coordinatorPkHex' | 'logPkHex' | 'origin' | 'electionIdHex' | 'rollHex'>;

export type PublishStep = 'validate' | 'election' | 'manifest' | 'ceremony_start' | 'invites' | 'roll_commit';

/** Local failure (form does not validate, server did not return what the flow needs). Server failures are ApiError. */
export class PublishError extends Error {
  readonly code: OrgProblem | 'E-ORG-SIGNER' | 'E-ORG-INVITE-REPLAY' | 'E-ORG-STATE';
  readonly detail: string;
  constructor(code: PublishError['code'], detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'PublishError';
    this.code = code;
    this.detail = detail;
  }
}

export interface PublishedInvite {
  invite_id: string;
  code?: string | undefined;
  code_withheld?: boolean | undefined;
  label?: string | undefined;
}

export interface InviteBatch {
  /** Idempotency-Key for this batch; rotated only when the server withheld the codes of a replay. */
  key: string;
  count: number;
  invites?: PublishedInvite[] | undefined;
}

interface StoredEntry {
  headerB64u: string;
  bodyB64u: string;
}

export interface PublishState {
  readonly v: 2;
  done: PublishStep[];
  orgId: string;
  title: string;
  electionKey: string;
  /** Exact immutable membership supplied to the signed creation request. Public keys only. */
  pinnedRoll: string[];
  /** Binds the form, organizer, list and invitation count before the first network mutation. */
  inputHash?: string;
  electionId?: string | undefined;
  origin?: string | undefined;
  logPkB64u?: string | undefined;
  coordinatorPkHex?: string | undefined;
  manifestHashHex?: string | undefined;
  roll?: { root: string; size: number } | undefined;
  entries: { manifest?: StoredEntry; ceremony_start?: StoredEntry; roll_commit?: StoredEntry };
  inviteBatches: InviteBatch[];
}

export type PublishResult =
  | { ok: true; state: PublishState }
  /** `error` is an ApiError for server refusals (problem+json mapped by the client) or a PublishError for local ones. */
  | { ok: false; step: PublishStep; error: unknown; state: PublishState };

export interface PublishInput {
  client: PublishClient;
  orgId: string;
  form: PublishForm;
  /** Organizer key. It is the coordinator (m = 1) and signs every entry it posts. */
  signer: Signer;
  /** Roll public keys (hex) as checked by parseRoll; the invite count defaults to their number. */
  rollHex: string[];
  inviteCount?: number;
  rng?: Rng;
  /** Unix seconds. */
  now?: () => number;
}

/** Server limit for one invite request (QV-09 §7.1 `count` 1..1000). */
export const MAX_INVITES_PER_REQUEST = 1000;

const ORIGIN_PLACEHOLDER = 'quietvote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAA';

function freshState(input: PublishInput, rng: Rng): PublishState {
  return { v: 2, done: [], orgId: input.orgId, title: input.form.title, electionKey: idemKey(rng), pinnedRoll: [], entries: {}, inviteBatches: [] };
}

function idemKey(rng: Rng): string {
  return b64uEncode(rng.bytes(16)); // 22 chars, within the 8..128 Idempotency-Key range
}

function formWith(input: PublishInput, v: { electionIdHex: string; logPkHex: string; origin: string; coordinatorPkHex: string; rollHex: string[] }): ManifestForm {
  return { ...input.form, rollHex: v.rollHex, electionIdHex: v.electionIdHex, logPkHex: v.logPkHex, origin: v.origin, coordinatorPkHex: v.coordinatorPkHex };
}

async function entryOf(input: PublishInput, rng: Rng, now: () => number, origin: string, type: 'manifest' | 'ceremony_start' | 'roll_commit', record: unknown): Promise<StoredEntry> {
  const p = await prepareEntry({ signer: input.signer, origin, type, record, rng, now: now() });
  return { headerB64u: p.headerB64u, bodyB64u: p.bodyB64u };
}

function clone(s: PublishState): PublishState {
  return JSON.parse(JSON.stringify(s)) as PublishState;
}

function mustHave<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new PublishError('E-ORG-STATE', `${what} is missing; start the publish flow again`);
  return v;
}

/** Snapshot caller-owned arrays before awaiting and reject changed input on a mutation retry. */
function bindInput(input: PublishInput, st: PublishState): PublishInput {
  if (st.v !== 2) throw new PublishError('E-ORG-STATE', 'this checkpoint predates pinned membership; inspect the existing election and attach its matching full roll with qv online election-pinned-roll');
  const rollHex = checkedPinnedRoll(input.rollHex);
  const form = JSON.parse(JSON.stringify(input.form)) as PublishForm;
  if (st.orgId !== input.orgId || st.title !== form.title) throw new PublishError('E-ORG-STATE', 'publish organization or title differs from the original checkpoint');
  const inviteCount = input.inviteCount ?? rollHex.length;
  if (!Number.isInteger(inviteCount) || inviteCount < 0 || inviteCount > 100_000) throw new PublishError('E-ORG-STATE', 'invitation count must be an integer from 0 to 100000');
  boundedPinnedRollBody({ title: form.title, pinned_roll: rollHex });
  const hash = bytesToHex(sha256(jcs({ orgId: input.orgId, form, rollHex, inviteCount, electionKey: st.electionKey, signer: bytesToHex(input.signer.publicKey) })));
  if (st.inputHash !== undefined) {
    if (hash !== st.inputHash || st.orgId !== input.orgId || st.title !== form.title ||
        JSON.stringify(st.pinnedRoll) !== JSON.stringify(rollHex)) {
      throw new PublishError('E-ORG-STATE', 'publish inputs changed; retry with the original organizer, form, membership and invitation count');
    }
  } else {
    if (st.done.length !== 0 || st.electionId !== undefined) throw new PublishError('E-ORG-STATE', 'checkpoint has no membership binding; recover the existing election with qv online election-pinned-roll');
    st.inputHash = hash;
    st.pinnedRoll = [...rollHex];
  }
  return { ...input, form, rollHex, inviteCount };
}

/** Runs the publish steps in order. Pass the state of a failed run to resume it. */
export async function publishElection(input: PublishInput, prior?: PublishState): Promise<PublishResult> {
  const rng = input.rng ?? systemRng;
  const now = input.now ?? (() => Math.floor(Date.now() / 1000));
  const st = prior === undefined ? freshState(input, rng) : clone(prior);
  const fail = (step: PublishStep, error: unknown): PublishResult => ({ ok: false, step, error, state: st });

  try { input = bindInput(input, st); }
  catch (error) { return fail('validate', error); }

  // 1. Local validation before any server call, so a bad form never leaves an empty election behind.
  if (!st.done.includes('validate')) {
    const dry = buildManifest(formWith(input, {
      electionIdHex: '00'.repeat(16), logPkHex: bytesToHex(input.signer.publicKey), origin: ORIGIN_PLACEHOLDER,
      coordinatorPkHex: bytesToHex(input.signer.publicKey), rollHex: input.rollHex,
    }));
    if (!dry.ok) return fail('validate', new PublishError(dry.code, dry.detail));
    st.done.push('validate');
  }

  const steps: [PublishStep, () => Promise<void>][] = [
    ['election', async () => {
      const el = await input.client.createElection(st.orgId, st.title, st.electionKey, [...st.pinnedRoll]);
      st.electionId = el.election_id;
      st.origin = el.origin;
      st.logPkB64u = el.log_pk;
    }],
    ['manifest', async () => {
      const electionId = mustHave(st.electionId, 'election id');
      const origin = mustHave(st.origin, 'origin');
      const logPkB64u = mustHave(st.logPkB64u, 'log key');
      const logPk = b64uDecode(logPkB64u);
      if (logPk === undefined || logPk.length !== 32) throw new PublishError('E-ORG-STATE', 'server returned a malformed log key');
      if (st.entries.manifest === undefined) {
        const coordinatorPkHex = bytesToHex(input.signer.publicKey);
        const built = buildManifest(formWith(input, { electionIdHex: electionId, logPkHex: bytesToHex(logPk), origin, coordinatorPkHex, rollHex: input.rollHex }));
        if (!built.ok) throw new PublishError(built.code, built.detail);
        const mh = manifestHash(built.manifest);
        const rec = await signMulti(input.signer, mh, built.manifest);
        st.entries.manifest = await entryOf(input, rng, now, origin, 'manifest', rec);
        st.coordinatorPkHex = coordinatorPkHex;
        st.manifestHashHex = bytesToHex(mh);
        st.roll = { root: mustRoll(built.manifest), size: built.manifest.roll.size ?? input.rollHex.length };
      }
      const e = st.entries.manifest;
      await input.client.postEntryWithRetry(electionId, e.headerB64u, e.bodyB64u);
    }],
    ['ceremony_start', async () => {
      const electionId = mustHave(st.electionId, 'election id');
      const origin = mustHave(st.origin, 'origin');
      const mh = hexToBytes(mustHave(st.manifestHashHex, 'manifest hash'), 32);
      if (st.entries.ceremony_start === undefined) {
        const marker: MarkerBody = { proto: PROTO_ID, type: 'marker', name: 'dkg-open' };
        st.entries.ceremony_start = await entryOf(input, rng, now, origin, 'ceremony_start', await signMulti(input.signer, mh, marker));
      }
      const e = st.entries.ceremony_start;
      await input.client.postEntryWithRetry(electionId, e.headerB64u, e.bodyB64u);
    }],
    ['invites', async () => {
      const electionId = mustHave(st.electionId, 'election id');
      if (st.inviteBatches.length === 0) {
        const total = input.inviteCount ?? input.rollHex.length;
        for (let left = total; left > 0; left -= MAX_INVITES_PER_REQUEST) {
          st.inviteBatches.push({ key: idemKey(rng), count: Math.min(MAX_INVITES_PER_REQUEST, left) });
        }
      }
      for (const b of st.inviteBatches) {
        if (b.invites !== undefined) continue;
        const res: InviteResult = await input.client.createInvites(electionId, b.count, b.key);
        if (res.invites.some((i) => i.code === undefined)) {
          // A replay: the server keeps the codes only for the first response. Rotate the key so a retry issues fresh invites.
          b.key = idemKey(rng);
          throw new PublishError('E-ORG-INVITE-REPLAY', `the server withheld the codes of ${res.invites.length} invite(s) on a replayed request; they cannot be shown`);
        }
        b.invites = res.invites;
      }
    }],
  ];

  for (const [step, run] of steps) {
    if (st.done.includes(step)) continue;
    try {
      await run();
      st.done.push(step);
    } catch (e) {
      return fail(step, e);
    }
  }
  return { ok: true, state: st };
}

/**
 * Posts the roll-commit (QV-18 §5.2) for the complete pinned membership, including members who never register.
 * The server checks the stored list and signed manifest pins. Resumable like publishElection.
 */
export async function commitRoll(input: PublishInput, prior: PublishState): Promise<PublishResult> {
  const rng = input.rng ?? systemRng;
  const now = input.now ?? (() => Math.floor(Date.now() / 1000));
  const st = clone(prior);
  const fail = (error: unknown): PublishResult => ({ ok: false, step: 'roll_commit', error, state: st });
  try {
    const electionId = mustHave(st.electionId, 'election id');
    const origin = mustHave(st.origin, 'origin');
    const mh = hexToBytes(mustHave(st.manifestHashHex, 'manifest hash'), 32);
    if (bytesToHex(input.signer.publicKey) !== mustHave(st.coordinatorPkHex, 'coordinator key')) {
      throw new PublishError('E-ORG-SIGNER', 'the signing key is not the manifest coordinator key');
    }
    input = bindInput(input, st);
    const roll = mustHave(st.roll, 'roll');
    const rr = rollRoot(st.pinnedRoll);
    if (!st.done.includes('manifest') || !rr.ok || roll.root !== bytesToHex(rr.value) || roll.size !== st.pinnedRoll.length) {
      throw new PublishError('E-ORG-STATE', 'roll commitment differs from the original authenticated membership');
    }
    if (st.done.includes('roll_commit')) return { ok: true, state: st };
    if (st.entries.roll_commit === undefined) {
      const body: RollCommitBody = { proto: PROTO_ID, type: 'roll-commit', root: roll.root, size: roll.size };
      st.entries.roll_commit = await entryOf(input, rng, now, origin, 'roll_commit', await signMulti(input.signer, mh, body));
    }
    const e = st.entries.roll_commit;
    await input.client.postEntryWithRetry(electionId, e.headerB64u, e.bodyB64u);
    st.done.push('roll_commit');
    return { ok: true, state: st };
  } catch (e) {
    return fail(e);
  }
}

function mustRoll(m: Manifest): string {
  if (m.roll.root === undefined) throw new PublishError('E-ORG-MANIFEST', 'manifest carries no roll root');
  return m.roll.root;
}

/** Invites in the order the server issued them, flattened for display. Codes are shown once; do not persist them. */
export function inviteList(state: PublishState): PublishedInvite[] {
  return state.inviteBatches.flatMap((b) => b.invites ?? []);
}
