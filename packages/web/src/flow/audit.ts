// Benaloh audit package (QV-19 §6.2, QV-ADR-020): everything a second device needs to re-seal a tested ballot and compare it.
import { bytesToHex, hexToBytes, jcs, parseQvJson } from '@quietvote/crypto';
import {
  ballotCode, revealDigest, spoilDigest, verifyBallotContent, verifySpoilReveal,
  type BallotBody, type ElectionParams, type Reveal, type SpoilEnvelope, type SpoilMode,
} from '@quietvote/protocol';
import { ed25519Verify } from '@quietvote/crypto';
import type { Signer } from '../key/signer.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';
import type { Selections } from './ballot-machine.ts';
import type { SealedBallot } from './seal.ts';

export interface AuditPackage {
  format: 'qv-audit/1';
  manifest_hash: string;
  ctx: string;
  code: string;
  body: BallotBody;
  reveal: Reveal;
}

export const AUDIT_PREFIX = 'qv-audit:';

export function buildAuditPackage(p: ElectionParams, s: SealedBallot, selections: Selections): AuditPackage {
  return {
    format: 'qv-audit/1', manifest_hash: bytesToHex(p.mh), ctx: bytesToHex(p.ctx), code: s.codeHex, body: s.body,
    reveal: { xi: s.xiHex, selections },
  };
}

export const auditText = (pkg: AuditPackage): string => new TextDecoder().decode(jcs(pkg));
export const auditLink = (pkg: AuditPackage): string => AUDIT_PREFIX + b64uEncode(jcs(pkg));

export function parseAuditPackage(input: string): AuditPackage | undefined {
  try {
    const s = input.trim();
    const text = s.startsWith(AUDIT_PREFIX) ? new TextDecoder().decode(b64uDecode(s.slice(AUDIT_PREFIX.length)) ?? new Uint8Array()) : s;
    const v = parseQvJson(text) as Partial<AuditPackage> | null;
    if (typeof v !== 'object' || v === null || v.format !== 'qv-audit/1') return undefined;
    if (typeof v.code !== 'string' || typeof v.ctx !== 'string' || typeof v.manifest_hash !== 'string' || typeof v.body !== 'object' || typeof v.reveal !== 'object') return undefined;
    return v as AuditPackage;
  } catch {
    return undefined;
  }
}

export interface AuditCheck {
  id: 'context' | 'code' | 'proofs' | 'plaintext';
  ok: boolean;
  detail?: string;
}
export interface AuditResult {
  ok: boolean;
  checks: AuditCheck[];
  /** The plaintext the opened ballot encrypts, for the voter's eyes. */
  selections: Selections;
}

/**
 * Independent re-check: recompute the ciphertexts from the revealed randomness and the election key and compare byte for
 * byte, recompute the code, verify the proofs. Runs identically in the web client, the standalone verifier page and (by
 * construction of the protocol package) the CLI.
 */
export function checkAuditPackage(p: ElectionParams, pkg: AuditPackage): AuditResult {
  const checks: AuditCheck[] = [];
  const add = (id: AuditCheck['id'], ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { id, ok } : { id, ok, detail });
  };
  add('context', pkg.ctx === bytesToHex(p.ctx) && pkg.manifest_hash === bytesToHex(p.mh) && pkg.body.ctx === pkg.ctx, 'ctx or manifest differs');
  let codeOk = false;
  try {
    codeOk = bytesToHex(ballotCode(p.ctx, pkg.body)) === pkg.code;
  } catch {
    codeOk = false;
  }
  add('code', codeOk, 'code differs from the ballot');
  const proofs = (() => {
    try {
      return verifyBallotContent(p, pkg.body);
    } catch {
      return { ok: false as const, error: 'E_SCHEMA' as const };
    }
  })();
  add('proofs', proofs.ok, proofs.ok ? undefined : proofs.error);
  const re = (() => {
    try {
      return verifySpoilReveal(p, pkg.body, pkg.reveal);
    } catch {
      return { ok: false as const, error: 'E_SPOIL_MISMATCH' as const };
    }
  })();
  add('plaintext', re.ok, re.ok ? undefined : re.error);
  return { ok: checks.every((c) => c.ok), checks, selections: pkg.reveal.selections };
}

/** Voter-signed spoil envelope under the distinct label `sig-spoil` (QV-ADR-020 (1)). */
export async function makeSpoilEnvelope(p: ElectionParams, signer: Signer, s: SealedBallot, selections: Selections, mode: SpoilMode): Promise<SpoilEnvelope> {
  const reveal: Reveal = { xi: s.xiHex, selections };
  const rd = mode === 'trustees' ? new Uint8Array(32) : revealDigest(p.ctx, reveal);
  const sig = await signer.sign(spoilDigest(p.ctx, hexToBytes(s.codeHex, 32), rd));
  const env: SpoilEnvelope = { intent: 'spoil', body: s.body, reveal_digest: bytesToHex(rd), sig: bytesToHex(sig) };
  if (mode === 'publish') env.reveal = reveal;
  return env;
}

export function verifySpoilSignature(p: ElectionParams, env: SpoilEnvelope): boolean {
  try {
    return ed25519Verify(hexToBytes(env.body.voter, 32), hexToBytes(env.sig, 64), spoilDigest(p.ctx, ballotCode(p.ctx, env.body), hexToBytes(env.reveal_digest, 32)));
  } catch {
    return false;
  }
}
