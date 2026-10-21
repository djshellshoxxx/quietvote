// Orchestrates one voter's seal -> (test | cast) -> receipt flow on top of the pure state machine.
// Network access and secrets live here; the reducer stays pure. Nothing is sent before the voter chooses CAST, except an
// opt-in-by-default test (spoil) posting after AUDIT (QV-10 §10.1 rule 1: no ciphertext leaves before the choice).
import { bytesToHex, hexToBytes, type Rng } from '@quietvote/crypto';
import { NO_SUPERSEDES, castDigest, ballotCode, type BallotBody, type CastEnvelope, type SpoilMode } from '@quietvote/protocol';
import { ApiError, BAD_RESPONSE, uxCodeFor, type UxCode } from '../api/errors.ts';
import type { ApiClient } from '../api/client.ts';
import type { DeviceStorage } from '../key/storage.ts';
import type { Signer } from '../key/signer.ts';
import { ballotCodeDisplay } from '../util/crockford.ts';
import { wipe } from '../util/hex.ts';
import { auditLink, auditText, buildAuditPackage, checkAuditPackage, makeSpoilEnvelope, type AuditResult } from './audit.ts';
import { initialBallotState, reduce, type BallotEvent, type BallotState, type Selections, type SubmissionOutcome } from './ballot-machine.ts';
import { prepareEntry, type PreparedEntry } from './entries.ts';
import type { ElectionContext } from './election.ts';
import { BoardIntegrityError, checkHeadAgainstPin, receiptFileText, verifyAppendResult, type ReceiptFile } from './receipt.ts';
import { parseCheckpoint, unb64 } from '@quietvote/board';

import { requestFor, type SealedBallot, type Sealer } from './seal.ts';

export interface BallotDeps {
  ctx: ElectionContext;
  apiElectionId: string;
  origin: string;
  signer: Signer;
  api: ApiClient;
  sealer: Sealer;
  storage: DeviceStorage;
  rng: Rng;
  logPk: Uint8Array;
  /** Hex code of the voter's previous admissible ballot, or 64 zeros for a first ballot. */
  supersedes: string;
  clientBuild: string;
  now?: () => number;
}

export interface CastReport {
  outcome: SubmissionOutcome;
  seq?: number;
  codeHex: string;
  codeDisplay: string;
  receipt?: ReceiptFile;
  error?: { ux: UxCode | 'E-BOARD-INCL-FAIL' | 'E-BOARD-FORK' | 'E-BOARD-ROLLBACK'; requestId?: string | undefined };
}

export class BallotController {
  state: BallotState = initialBallotState();
  private readonly d: BallotDeps;
  private readonly listeners = new Set<(s: BallotState) => void>();
  private sealed: SealedBallot | undefined;
  private xi: Uint8Array | undefined;
  private pending: PreparedEntry | undefined;
  lastCast: CastReport | undefined;
  lastAudit: { result: AuditResult; text: string; link: string; posted: boolean } | undefined;

  constructor(d: BallotDeps) {
    this.d = d;
  }

  subscribe(f: (s: BallotState) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private dispatch(e: BallotEvent): void {
    const next = reduce(this.state, e);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l(next);
  }
  private now(): number {
    return (this.d.now ?? ((): number => Math.floor(Date.now() / 1000)))();
  }

  select(selections: Selections): void {
    this.dispatch({ type: 'SELECT', selections });
  }
  review(): void {
    this.dispatch({ type: 'REVIEW' });
  }
  edit(): void {
    this.dispatch({ type: 'EDIT' });
  }

  /** Seal: encrypt and prove. Resolves when the state is `sealed` (code not yet rendered) or `failed`. */
  async seal(): Promise<void> {
    if (this.state.kind !== 'reviewing') return;
    const { selections, attempt } = this.state;
    this.dispatch({ type: 'SEAL' });
    this.discardSecrets();
    let res: Awaited<ReturnType<Sealer['seal']>>;
    try {
      res = await this.d.sealer.seal(
        requestFor(this.d.ctx.params, {
          voterPk: bytesToHex(this.d.signer.publicKey), nonceKey: bytesToHex(this.d.signer.nonceKey), supersedes: this.d.supersedes,
          selections, attempt, selfCheck: true,
        }),
      );
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : 'seal failed' };
    }
    if ((this.state as BallotState).kind !== 'sealing') return; // locked while sealing: drop the result
    if (!res.ok) {
      this.dispatch({ type: 'SEAL_FAILED', error: res.error });
      return;
    }
    this.sealed = res.sealed;
    this.xi = hexToBytes(res.sealed.xiHex, 64);
    this.dispatch({ type: 'SEALED', sealed: { code: res.sealed.codeHex, attempt: res.sealed.attempt } });
  }

  get codeHex(): string | undefined {
    return this.sealed?.codeHex;
  }
  get codeDisplay(): string | undefined {
    return this.sealed ? ballotCodeDisplay(hexToBytes(this.sealed.codeHex, 32)) : undefined;
  }

  /** The UI calls this after the code is in the DOM; only then do CAST and AUDIT become available (REQ-011). */
  codeRendered(): void {
    if (this.sealed) this.dispatch({ type: 'CODE_RENDERED', code: this.sealed.codeHex });
  }

  /** CAST. Idempotent retry after an unknown delivery resends the SAME entry bytes. */
  async cast(): Promise<CastReport | undefined> {
    if (this.state.kind === 'failed') this.dispatch({ type: 'RETRY_CAST' });
    else this.dispatch({ type: 'CAST' });
    if (this.state.kind !== 'casting' || !this.sealed) return undefined;
    const { ctx, signer, api, apiElectionId, origin, logPk } = this.d;
    const codeHex = this.sealed.codeHex;
    const codeDisplay = ballotCodeDisplay(hexToBytes(codeHex, 32));
    try {
      if (!this.pending) {
        const env: CastEnvelope = {
          intent: 'cast', body: this.sealed.body,
          sig: bytesToHex(await signer.sign(castDigest(ctx.params.ctx, hexToBytes(codeHex, 32)))),
        };
        this.pending = await prepareEntry({ signer, origin, type: 'ballot', record: env, rng: this.d.rng, now: this.now() });
      }
      const res = await api.postEntryWithRetry(apiElectionId, this.pending.headerB64u, this.pending.bodyB64u);
      const info = verifyAppendResult(res, { origin, leafHash: this.pending.leafHash, logPk });
      // W2: the head in the receipt must extend the pinned one (rollback / fork alarms) before it replaces the pin.
      if (info.checkpointNote !== undefined && info.treeSize !== undefined) await this.checkAgainstPin(info.checkpointNote);
      const report: CastReport = { outcome: info.outcome, seq: info.seq, codeHex, codeDisplay };
      if (info.outcome === 'ACCEPTED_RECORDED') {
        const file: ReceiptFile = {
          format: 'qv-receipt/1', election: this.d.apiElectionId, manifest_hash: ctx.manifestHashHex, ballot_code: codeHex, seq: info.seq,
          leaf_hash: res.receipt.leaf_hash, receipt: res.receipt, client_build: this.d.clientBuild,
        };
        report.receipt = file;
        const settings = await this.d.storage.getSettings();
        if (settings.rememberReceipts) await this.d.storage.putReceipt({ electionId: this.d.apiElectionId, code: codeHex, seq: info.seq, json: receiptFileText(file) });
        if (info.checkpointNote !== undefined && info.treeSize !== undefined) await this.d.storage.putHead({ electionId: this.d.apiElectionId, size: info.treeSize, note: info.checkpointNote });
      }
      this.lastCast = report;
      this.discardSecrets(); // REQ-014: randomness zeroed once the submit succeeded
      this.dispatch({ type: 'CAST_RESULT', outcome: info.outcome });
      return report;
    } catch (e) {
      // W1: anything that is not a definite refusal (4xx with a problem body) may have been recorded: retry the SAME bytes.
      const unknown = e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT' || e.code === BAD_RESPONSE || e.status >= 500 || e.status === 429);
      const ux = e instanceof BoardIntegrityError ? e.code : uxCodeFor(e, true);
      const rejected = e instanceof ApiError && !unknown;
      const outcome: SubmissionOutcome | undefined = rejected
        ? e.code === 'WRONG_PHASE' ? 'AFTER_CLOSE' : ux === 'E-VOT-DUP' ? 'DUPLICATE_IGNORED' : ux === 'E-VOT-SUPERSEDED-LOST' ? 'SUPERSEDED' : 'REJECTED'
        : undefined;
      const report: CastReport = {
        outcome: outcome ?? 'PENDING_UNCONFIRMED', codeHex, codeDisplay,
        error: { ux, requestId: e instanceof ApiError ? e.requestId : undefined },
      };
      this.lastCast = report;
      if (outcome !== undefined) {
        this.discardSecrets();
        this.dispatch({ type: 'CAST_RESULT', outcome });
      } else {
        this.dispatch({ type: 'CAST_FAILED', error: ux, unknownDelivery: unknown });
      }
      return report;
    }
  }

  private async checkAgainstPin(note: string): Promise<void> {
    const cp = parseCheckpoint(note);
    if (!cp.ok) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'checkpoint in receipt is malformed');
    const pinnedHead = await this.d.storage.getHead(this.d.apiElectionId);
    const pc = pinnedHead ? parseCheckpoint(pinnedHead.note) : undefined;
    const pin = pc?.ok ? pc.value : undefined;
    let proof: Uint8Array[] | undefined;
    if (pin && cp.value.size > pin.size) {
      const cons = await this.d.api.consistency(this.d.apiElectionId, pin.size, cp.value.size);
      proof = cons.path.map((p) => unb64(p) ?? new Uint8Array());
    }
    checkHeadAgainstPin(cp.value, pin, proof);
  }

  /** TEST (audit): open the ballot, check it here, and post the spoil record (default) without the reveal unless opted in. */
  async audit(o: { post: boolean; publishReveal: boolean }): Promise<AuditResult | undefined> {
    this.dispatch({ type: 'AUDIT' });
    if (this.state.kind !== 'auditing' || !this.sealed) return undefined;
    const { ctx, signer } = this.d;
    const sealed = this.sealed;
    const selections = this.state.selections;
    const pkg = buildAuditPackage(ctx.params, sealed, selections);
    const result = checkAuditPackage(ctx.params, pkg);
    let posted = false;
    if (o.post) {
      try {
        const mode: SpoilMode = o.publishReveal ? 'publish' : 'private';
        const env = await makeSpoilEnvelope(ctx.params, signer, sealed, selections, mode);
        const entry = await prepareEntry({ signer, origin: this.d.origin, type: 'ballot_audit', record: env, rng: this.d.rng, now: this.now() });
        await this.d.api.postEntryWithRetry(this.d.apiElectionId, entry.headerB64u, entry.bodyB64u);
        posted = true;
      } catch {
        posted = false;
      }
    }
    this.lastAudit = { result, text: auditText(pkg), link: auditLink(pkg), posted };
    this.discardSecrets(); // a tested ballot is thrown away (REQ-012)
    this.dispatch({ type: 'AUDIT_DONE', posted });
    return result;
  }

  confirmMatch(matches: boolean): void {
    this.dispatch({ type: 'AUDIT_CONFIRM', matches });
  }
  newSeal(): void {
    this.lastAudit = this.lastAudit ? { ...this.lastAudit, text: '', link: '' } : undefined;
    this.dispatch({ type: 'NEW_SEAL' });
  }

  /** Auto-lock / page hide: drops randomness and any not-yet-submitted sealed ballot (W4). A submission in flight is kept. */
  lockSession(): void {
    this.dispatch({ type: 'LOCK' });
    if (this.state.kind === 'reviewing') this.sealed = undefined;
    this.discardSecrets();
  }

  /** Zeroises randomness and drops cached bytes. Safe to call repeatedly (also on lock / page hide). */
  discardSecrets(): void {
    wipe(this.xi);
    this.xi = undefined;
    this.pending = this.state.kind === 'casting' || this.state.kind === 'failed' ? this.pending : undefined;
    if (this.sealed) {
      this.sealed = { ...this.sealed, xiHex: '' };
    }
  }

  /** For tests: the body of the sealed ballot. */
  get body(): BallotBody | undefined {
    return this.sealed?.body;
  }
  get supersedesHex(): string {
    return this.d.supersedes;
  }
}

/** Code of the voter's newest cast ballot found in the log (signature-checked), for the `supersedes` link of a revote. */
export function lastOwnBallotCode(
  records: readonly { seq: number; record: unknown }[], voterPkHex: string, ctxHex: string,
  verifyCast: (env: CastEnvelope) => boolean,
): string {
  let best: { seq: number; code: string } | undefined;
  for (const { seq, record } of records) {
    const r = record as Partial<CastEnvelope> | undefined;
    if (r?.intent !== 'cast' || r.body?.voter !== voterPkHex || r.body.ctx !== ctxHex) continue;
    if (!verifyCast(r as CastEnvelope)) continue;
    if (best === undefined || seq > best.seq) best = { seq, code: bytesToHex(ballotCode(hexToBytes(ctxHex, 32), r.body)) };
  }
  return best?.code ?? NO_SUPERSEDES;
}
