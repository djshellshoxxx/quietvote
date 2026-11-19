// Organizer publish, UI side: unlocks the organizer key on this device, runs publishElection against the server and reduces the
// outcome to what the page shows. DOM-free, so the wiring is unit-tested with a fake client (ui/app.ts only renders the outcome).
// The publish state is returned to the caller and kept in memory only. Invite codes are secrets and are never written to storage.
import { ApiClient, type ClientOptions } from '../api/client.ts';
import { ApiError, uxCodeFor, type UxCode } from '../api/errors.ts';
import { apiOrigin } from '../api/origins.ts';
import type { Instance } from '../api/types.ts';
import { KeyError, type KeystoreDeps } from '../key/keystore.ts';
import type { Signer } from '../key/signer.ts';
import type { DeviceStorage } from '../key/storage.ts';
import type { Rng } from '@quietvote/crypto';
import { b64uEncode } from '../util/hex.ts';
import { ORGANIZER_SLOT, unlockKey } from './onboarding.ts';
import { PublishError, inviteList, publishElection, type PublishClient, type PublishForm, type PublishState, type PublishedInvite } from './publish.ts';

/** Local publish failures that have a catalog title and body (`qv.err.<code>.title`). Anything else shows as E-GEN-UNKNOWN. */
export const PUBLISH_UX_CODES = ['E-ORG-QUORUM', 'E-ORG-TRUSTEES', 'E-ORG-MANIFEST', 'E-ORG-STATE', 'E-ORG-INVITE-REPLAY'] as const;

export type PublishOutcome =
  /** The organization ID field is empty; nothing was sent. */
  | { kind: 'noOrg' }
  /** No organizer key is stored on this device. */
  | { kind: 'noKey' }
  /** The organizer key could not be read or unlocked with the passphrase. */
  | { kind: 'locked'; ux: 'E-KEY-LOCKED' | 'E-KEY-STORAGE' | 'E-GEN-UNKNOWN' }
  /** A step failed. `state` is what to pass back to resume; undefined when the failure came before any step ran. */
  | { kind: 'failed'; ux: string; detail: string; ref: string | undefined; state: PublishState | undefined }
  | { kind: 'published'; electionId: string; invites: PublishedInvite[]; state: PublishState };

export interface PublishRun {
  orgId: string;
  /** Organizer key passphrase, as typed. Not stored. */
  passphrase: string;
  form: PublishForm;
  rollHex: string[];
  /** The `state` of the previous failed run, to continue at the first unfinished step. */
  prior?: PublishState | undefined;
  storage: DeviceStorage;
  /** API base, "" for same origin. */
  apiBase: string;
  /** The page origin; the signed audience uses apiBase when this deployment has a separate board. */
  origin: string;
  rng?: Rng | undefined;
  now?: (() => number) | undefined;
  /** B3-28: key-store dependencies for the unlock (carries the KDF cost confirm). Defaults to the real key store. */
  deps?: KeystoreDeps | undefined;
  /** Test seams; the defaults are the real key store and the real ApiClient. */
  unlock?: ((passphrase: string) => Promise<Signer>) | undefined;
  makeClient?: ((o: ClientOptions) => PublishClient & Pick<ApiClient, 'instance'>) | undefined;
}

/** QV-08 audience of a request to this instance (server auth.ts audienceOf). */
export function publishAudience(instanceId: string, origin: string): string {
  return `qv:${instanceId}@${origin}`;
}

/** Explicit organization enrollment using the existing organizer key and server registration policy. */
export async function enrollOrganization(r: {
  name: string; token: string; idempotencyKey: string; passphrase: string;
  storage: DeviceStorage; apiBase: string; origin: string; deps?: KeystoreDeps;
  unlock?: (passphrase: string) => Promise<Signer>;
  makeClient?: (o: ClientOptions) => Pick<ApiClient, 'instance' | 'createOrganization'>;
}): Promise<string> {
  if (r.name.trim() === '' || r.name.trim().length > 120) throw new PublishError('E-ORG-MANIFEST', 'organization name must contain 1 to 120 characters');
  const board = apiOrigin(r.apiBase, r.origin);
  const signer = await (r.unlock ? r.unlock(r.passphrase) : unlockKey({ storage: r.storage, slot: ORGANIZER_SLOT, passphrase: r.passphrase, rewrap: false, ...(r.deps ? { deps: r.deps } : {}) }).then((k) => k.signer));
  try {
    const make = r.makeClient ?? ((o: ClientOptions) => new ApiClient(o));
    const instance = await make({ baseUrl: r.apiBase }).instance();
    const client = make({ baseUrl: board, signing: { signer, audience: publishAudience(instance.instance_id, board) } });
    const result = await client.createOrganization(r.name.trim(), b64uEncode(signer.publicKey), r.idempotencyKey, r.token);
    return result.org_id;
  } finally { signer.lock(); }
}

/** The UX code and detail to show for a failed publish step. */
export function publishFailure(e: unknown): { ux: string; detail: string } {
  if (e instanceof PublishError) {
    return (PUBLISH_UX_CODES as readonly string[]).includes(e.code) ? { ux: e.code, detail: e.detail } : { ux: 'E-GEN-UNKNOWN', detail: '' };
  }
  const ux: UxCode = uxCodeFor(e);
  // Only local validation supplies technical detail; remote problem text is not displayed here.
  return { ux, detail: ux === 'E-ORG-MANIFEST' && e instanceof ApiError && e.status === 0 ? e.detail ?? '' : '' };
}

const failed = (e: unknown, state: PublishState | undefined): PublishOutcome => {
  const f = publishFailure(e);
  return { kind: 'failed', ux: f.ux, detail: f.detail, ref: e instanceof ApiError ? e.requestId : undefined, state };
};

/** Runs the whole publish for one attempt. Pass the previous `state` in `prior` to resume after a failure. */
export async function runPublish(r: PublishRun): Promise<PublishOutcome> {
  if (r.orgId.trim() === '') return { kind: 'noOrg' };
  let board: string;
  try { board = apiOrigin(r.apiBase, r.origin); } catch (e) { return failed(e, undefined); }
  if (r.prior && r.prior.boardOrigin !== board) return failed(new PublishError('E-ORG-STATE', 'publication checkpoint belongs to another API origin'), undefined);
  let stored: unknown;
  try {
    stored = await r.storage.getKey(ORGANIZER_SLOT);
  } catch {
    return { kind: 'locked', ux: 'E-KEY-STORAGE' };
  }
  if (stored === undefined) return { kind: 'noKey' };
  const unlock = r.unlock ?? (async (p: string) => (await unlockKey({ storage: r.storage, slot: ORGANIZER_SLOT, passphrase: p, rewrap: false, ...(r.deps === undefined ? {} : { deps: r.deps }) })).signer);
  let signer: Signer;
  try {
    signer = await unlock(r.passphrase);
  } catch (e) {
    return { kind: 'locked', ux: e instanceof KeyError && e.code === 'E_KEY_LOCKED' ? 'E-KEY-LOCKED' : 'E-GEN-UNKNOWN' };
  }
  const make = r.makeClient ?? ((o: ClientOptions) => new ApiClient(o));
  try {
    const inst: Instance = await make({ baseUrl: r.apiBase }).instance();
    const client = make({ baseUrl: board, signing: { signer, audience: publishAudience(inst.instance_id, board) } });
    const res = await publishElection({
      client, orgId: r.orgId.trim(), form: r.form, signer, rollHex: r.rollHex,
      ...(r.rng === undefined ? {} : { rng: r.rng }), ...(r.now === undefined ? {} : { now: r.now }),
    }, r.prior);
    res.state.boardOrigin = board;
    if (!res.ok) return failed(res.error, res.state);
    if (res.state.electionId === undefined) return failed(new PublishError('E-ORG-STATE', 'the server returned no election id'), res.state);
    return { kind: 'published', electionId: res.state.electionId, invites: inviteList(res.state), state: res.state };
  } catch (e) {
    return failed(e, undefined);
  } finally {
    signer.lock();
  }
}
