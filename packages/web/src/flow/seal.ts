// Ballot sealing: hedged deterministic randomness (QV-16 §5.11) -> encrypt -> proofs -> ballot code.
// `sealBallot` is a pure function of its inputs plus fresh CSPRNG bytes. It runs either in-thread or in a dedicated Worker
// (QV-19 §4); the Worker receives only JSON-safe data and returns the same.
import { bytesToHex, hexToBytes, pointFromBytes, pointToBytes, systemRng, type Rng } from '@quietvote/crypto';
import {
  ballotCode, deriveXi, encryptBallot, selvecDigest, verifyBallotContent,
  type BallotBody, type ElectionParams, type Manifest, type Selections,
} from '@quietvote/protocol';

export interface SealRequest {
  manifest: Manifest;
  /** Hex of the joint key K, manifest hash and ctx. */
  K: string;
  mh: string;
  ctx: string;
  voterPk: string;
  /** Hex of H("voter-nonce-key", seed): a derived value, never the seed. */
  nonceKey: string;
  supersedes: string;
  selections: Selections;
  attempt: number;
  /** Fresh 32 random bytes (hex). In a Worker, left undefined and drawn there. */
  rho?: string;
  /** Run QV-16 §5.14.4 content checks on the result (cheap relative to encryption; catches device faults early). */
  selfCheck?: boolean;
}

export interface SealedBallot {
  body: BallotBody;
  codeHex: string;
  /** Hex of the secret randomness xi. Held in memory only until cast succeeds or the audit is done (REQ-014). */
  xiHex: string;
  attempt: number;
}

export type SealResponse = { ok: true; sealed: SealedBallot } | { ok: false; error: string };

export function paramsOf(r: Pick<SealRequest, 'manifest' | 'K' | 'mh' | 'ctx'>): ElectionParams {
  return { manifest: r.manifest, mh: hexToBytes(r.mh, 32), K: pointFromBytes(hexToBytes(r.K, 32), { nonIdentity: true }), ctx: hexToBytes(r.ctx, 32) };
}

export function requestFor(p: ElectionParams, rest: Omit<SealRequest, 'manifest' | 'K' | 'mh' | 'ctx'>): SealRequest {
  return { manifest: p.manifest, K: bytesToHex(pointToBytes(p.K)), mh: bytesToHex(p.mh), ctx: bytesToHex(p.ctx), ...rest };
}

export function sealBallot(req: SealRequest, rng: Rng = systemRng): SealResponse {
  try {
    const p = paramsOf(req);
    const voterPk = hexToBytes(req.voterPk, 32);
    const sv = selvecDigest(p.manifest, p.ctx, req.selections);
    if (!sv.ok) return { ok: false, error: `${sv.error}${sv.detail ? `: ${sv.detail}` : ''}` };
    const rho = req.rho !== undefined ? hexToBytes(req.rho, 32) : rng.bytes(32);
    const xi = deriveXi(p.ctx, hexToBytes(req.nonceKey, 32), rho, req.attempt, sv.value);
    const body = encryptBallot(p, voterPk, req.supersedes, req.selections, xi);
    if (!body.ok) return { ok: false, error: `${body.error}${body.detail ? `: ${body.detail}` : ''}` };
    if (req.selfCheck !== false) {
      const v = verifyBallotContent(p, body.value);
      if (!v.ok) return { ok: false, error: `self-check failed: ${v.error}` };
    }
    return { ok: true, sealed: { body: body.value, codeHex: bytesToHex(ballotCode(p.ctx, body.value)), xiHex: bytesToHex(xi), attempt: req.attempt } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'seal failed' };
  }
}

/** Where sealing runs. The worker implementation lives in the UI layer (needs `Worker`); this default runs in-thread. */
export interface Sealer {
  seal(req: SealRequest): Promise<SealResponse>;
}

export const inlineSealer: Sealer = {
  seal: (req) =>
    new Promise((resolve) => {
      // Yield once so the "sealing" status can paint before the CPU-bound work starts.
      setTimeout(() => resolve(sealBallot(req)), 0);
    }),
};
