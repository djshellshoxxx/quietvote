// Organizer publish, UI side: unlocks the organizer key on this device, runs publishElection against the server and reduces the
// outcome to what the page shows. DOM-free, so the wiring is unit-tested with a fake client (ui/app.ts only renders the outcome).
// The publish state is returned to the caller and kept in memory only. Invite codes are secrets and are never written to storage.
import { ApiClient, type ClientOptions } from '../api/client.ts';
import { ApiError, uxCodeFor, type UxCode } from '../api/errors.ts';
import type { Instance } from '../api/types.ts';
import { KeyError } from '../key/keystore.ts';
import type { Signer } from '../key/signer.ts';
import type { DeviceStorage } from '../key/storage.ts';
import type { Rng } from '@quietvote/crypto';
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
  /** The page origin. The request audience is `qv:<instance_id>@<origin>` (server auth.ts audienceOf). */
  origin: string;
  rng?: Rng | undefined;
  now?: (() => number) | undefined;
  /** Test seams; the defaults are the real key store and the real ApiClient. */
  unlock?: ((passphrase: string) => Promise<Signer>) | undefined;
  makeClient?: ((o: ClientOptions) => PublishClient & Pick<ApiClient, 'instance'>) | undefined;
}

/** QV-08 audience of a request to this instance (server auth.ts audienceOf). */
export function publishAudience(instanceId: string, origin: string): string {
  return `qv:${instanceId}@${origin}`;
}

/** The UX code and detail to show for a failed publish step. */
export function publishFailure(e: unknown): { ux: string; detail: string } {
  if (e instanceof PublishError) {
    return (PUBLISH_UX_CODES as readonly string[]).includes(e.code) ? { ux: e.code, detail: e.detail } : { ux: 'E-GEN-UNKNOWN', detail: '' };
  }
  const ux: UxCode = uxCodeFor(e);
  return { ux, detail: '' };
}

const failed = (e: unknown, state: PublishState | undefined): PublishOutcome => {
  const f = publishFailure(e);
  return { kind: 'failed', ux: f.ux, detail: f.detail, ref: e instanceof ApiError ? e.requestId : undefined, state };
};

/** Runs the whole publish for one attempt. Pass the previous `state` in `prior` to resume after a failure. */
export async function runPublish(r: PublishRun): Promise<PublishOutcome> {
  if (r.orgId.trim() === '') return { kind: 'noOrg' };
  let stored: unknown;
  try {
    stored = await r.storage.getKey(ORGANIZER_SLOT);
  } catch {
    return { kind: 'locked', ux: 'E-KEY-STORAGE' };
  }
  if (stored === undefined) return { kind: 'noKey' };
  const unlock = r.unlock ?? (async (p: string) => (await unlockKey({ storage: r.storage, slot: ORGANIZER_SLOT, passphrase: p })).signer);
  let signer: Signer;
  try {
    signer = await unlock(r.passphrase);
  } catch (e) {
    return { kind: 'locked', ux: e instanceof KeyError && e.code === 'E_KEY_LOCKED' ? 'E-KEY-LOCKED' : 'E-GEN-UNKNOWN' };
  }
  const make = r.makeClient ?? ((o: ClientOptions) => new ApiClient(o));
  try {
    const inst: Instance = await make({ baseUrl: r.apiBase }).instance();
    const client = make({ baseUrl: r.apiBase, signing: { signer, audience: publishAudience(inst.instance_id, r.origin) } });
    const res = await publishElection({
      client, orgId: r.orgId.trim(), form: r.form, signer, rollHex: r.rollHex,
      ...(r.rng === undefined ? {} : { rng: r.rng }), ...(r.now === undefined ? {} : { now: r.now }),
    }, r.prior);
    if (!res.ok) return failed(res.error, res.state);
    if (res.state.electionId === undefined) return failed(new PublishError('E-ORG-STATE', 'the server returned no election id'), res.state);
    return { kind: 'published', electionId: res.state.electionId, invites: inviteList(res.state), state: res.state };
  } catch (e) {
    return failed(e, undefined);
  } finally {
    signer.lock();
  }
}
