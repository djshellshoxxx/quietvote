// Export / import bundle (QV-18 §12) and offline verification (§13).
// The bundle is an in-memory object with a JSON-object form; the deterministic tar container
// is a transport concern for the CLI (see NOTES.md).
import { b64, b64u, bytesEqual, toHex, unb64, unb64u } from './bytes.ts';
import {
  parseCheckpoint, verifyLogSignature, witnessStatus,
  type Checkpoint, type WitnessPolicy,
} from './checkpoint.ts';
import { checkEntry, grammarStep, newGrammar, type AuthorKeyResolver, type EntryHeader } from './entry.ts';
import { err, ok, type Result } from './errors.ts';
import { MerkleTree, hashLeaf } from './merkle.ts';
import { verifyReceipt, type Receipt } from './receipt.ts';
import { nonceKey, type BoardStore } from './store.ts';

export interface BundleEntry {
  seq: number;
  headerBytes: Uint8Array;
  body: Uint8Array | null;
}

export interface BundlePolicy {
  /** Copy of manifest `log_pk` / `witness_policy`. Self-attested: verifier callers should pass their own. */
  logPublicKey: Uint8Array;
  witnessPolicy: WitnessPolicy;
}

export interface LogBundle {
  format: 'qv-bundle/v1';
  origin: string;
  createdAt: number;
  treeSize: number;
  root: Uint8Array;
  generator: string;
  spec: 'QV-18';
  entries: BundleEntry[];
  /** Signed notes verbatim, including cosignature lines. */
  checkpoints: string[];
  receipts: Receipt[];
  policy: BundlePolicy;
  redactions: { seq: number; redactedAt: number; reason: string }[];
}

export interface ExportOptions {
  origin: string;
  createdAt: number;
  generator: string;
  policy: BundlePolicy;
  receipts?: Receipt[];
  redactions?: { seq: number; redactedAt: number; reason: string }[];
}

/** Export everything in the store. The store should have a checkpoint covering its full size. */
export function exportBundle(store: BoardStore, o: ExportOptions): LogBundle {
  const entries: BundleEntry[] = [];
  for (let i = 0; i < store.size(); i++) {
    const e = store.getEntry(i);
    if (e) entries.push({ seq: e.seq, headerBytes: e.headerBytes, body: e.body });
  }
  const tree = MerkleTree.fromLeafHashes(store.leafHashes(0, store.size()));
  return {
    format: 'qv-bundle/v1', origin: o.origin, createdAt: o.createdAt, treeSize: tree.size, root: tree.root(),
    generator: o.generator, spec: 'QV-18', entries, checkpoints: store.listCheckpoints().map((c) => c.note),
    receipts: o.receipts ?? [], policy: o.policy, redactions: o.redactions ?? [],
  };
}

export interface VerifyOptions {
  /** Trusted log key (from the human-verified manifest). Falls back to the bundle's self-attested copy with a warning. */
  logPublicKey?: Uint8Array;
  witnessPolicy?: WitnessPolicy;
  /** Author key lookup (QV-16 knows how to find keys in manifest/roll). Without it signatures are NOT checked -> PARTIAL. */
  resolveAuthorKey?: AuthorKeyResolver;
  /** Expected manifest body digest (H_m) announced out of band. */
  expectedManifestHash?: Uint8Array;
  /** Previously pinned checkpoint note. */
  pinned?: string;
  /** Predicate marking a `notice` entry as a signed witness_waiver (body is QV-16 encoded). Default: none. */
  isWitnessWaiver?: (entry: BundleEntry, header: EntryHeader) => boolean;
}

export interface Failure {
  seq?: number;
  rule: string;
  detail: string;
}

export interface Verdict {
  integrity: 'VERIFIED' | 'FAILED' | 'PARTIAL';
  witnessed: { have: number; k: number; latest: boolean };
  redacted: number;
  failures: Failure[];
  warnings: string[];
  manifestHash: string | undefined;
  pinnedCheckpoint: string | undefined;
  treeSize: number;
}

/** Offline verification (§13 steps 1-6, 9-10 at the board level; QV-16 type-specific checks are the caller's). */
export function verifyLog(bundle: LogBundle, opts: VerifyOptions = {}): Verdict {
  const failures: Failure[] = [];
  const warnings: string[] = [];
  const fail = (rule: string, detail: string, seq?: number): void => {
    failures.push(seq === undefined ? { rule, detail } : { seq, rule, detail });
  };
  const verdict = (extra: Partial<Verdict> = {}): Verdict => {
    const redacted = Array.isArray(bundle.entries) ? bundle.entries.filter((e) => e.body === null).length : 0;
    const partial = redacted > 0 || opts.resolveAuthorKey === undefined;
    return {
      integrity: failures.length > 0 ? 'FAILED' : partial ? 'PARTIAL' : 'VERIFIED',
      witnessed: { have: 0, k: 0, latest: false }, redacted, failures, warnings,
      manifestHash: undefined, pinnedCheckpoint: undefined, treeSize: 0, ...extra,
    };
  };

  try {
    if (bundle.format !== 'qv-bundle/v1' || bundle.spec !== 'QV-18') {
      fail('QV_BOARD_BAD_BUNDLE', 'unknown bundle format');
      return verdict();
    }
    const logPk = opts.logPublicKey ?? bundle.policy.logPublicKey;
    const policy = opts.witnessPolicy ?? bundle.policy.witnessPolicy;
    if (!opts.logPublicKey) warnings.push('log key taken from bundle (self-attested); pass the manifest-verified key');
    if (!opts.witnessPolicy) warnings.push('witness policy taken from bundle (self-attested)');
    if (!opts.resolveAuthorKey) warnings.push('author signatures and authorization NOT checked (no resolver supplied)');

    // Entries: parse, origin, signature, body digest, grammar, uniqueness; build tree.
    const tree = new MerkleTree();
    const g = newGrammar();
    const seenNonce = new Set<string>();
    const redactedSeqs = new Set(bundle.redactions.map((r) => r.seq));
    const seqOf = new Map<string, number[]>();
    let manifestHash: string | undefined;
    const headers: (EntryHeader | undefined)[] = [];
    bundle.entries.forEach((e, i) => {
      if (e.seq !== i) {
        fail('QV_BOARD_GRAMMAR', `sequence not gapless: expected ${i}, got ${e.seq}`, i);
        headers.push(undefined);
        tree.appendLeaf(e.headerBytes);
        return;
      }
      tree.appendLeaf(e.headerBytes);
      const c = checkEntry(e.headerBytes, e.body, bundle.origin, opts.resolveAuthorKey, i);
      if (!c.ok) {
        fail(c.error.code, c.error.message, i);
        headers.push(undefined);
        return;
      }
      const h = c.value;
      headers.push(h);
      if (e.body === null && !redactedSeqs.has(i)) fail('QV_BOARD_BODY_DIGEST', 'body missing but redaction not recorded', i);
      const ge = grammarStep(g, h.type);
      if (ge !== undefined) fail('QV_BOARD_GRAMMAR', ge, i);
      const nk = nonceKey(toHex(h.author), h.type, toHex(h.authorNonce));
      if (seenNonce.has(nk)) fail('QV_BOARD_NONCE_REUSE', 'duplicate (author,type,nonce)', i);
      seenNonce.add(nk);
      const list = seqOf.get(h.type) ?? [];
      list.push(i);
      seqOf.set(h.type, list);
      if (i === 0) manifestHash = toHex(h.bodyDigest);
    });
    const n = tree.size;
    if (n === 0) fail('QV_BOARD_BAD_BUNDLE', 'log is empty (no manifest)');
    if (opts.expectedManifestHash && manifestHash !== toHex(opts.expectedManifestHash)) fail('QV_BOARD_BAD_BUNDLE', 'manifest hash differs from expected');

    const root = tree.root();
    if (bundle.treeSize !== n || !bytesEqual(bundle.root, root)) fail('QV_BOARD_BAD_BUNDLE', 'bundle tree_size/root do not match entries');

    // Checkpoints.
    const cps: Checkpoint[] = [];
    const bySize = new Map<number, Checkpoint>();
    for (const note of bundle.checkpoints) {
      const p = parseCheckpoint(note);
      if (!p.ok) {
        fail(p.error.code, p.error.message);
        continue;
      }
      const cp = p.value;
      if (cp.origin !== bundle.origin) {
        fail('QV_BOARD_ORIGIN_MISMATCH', `checkpoint size ${cp.size} has wrong origin`);
        continue;
      }
      if (!verifyLogSignature(cp, logPk)) {
        fail('QV_BOARD_BAD_CHECKPOINT', `log signature invalid at size ${cp.size}`);
        continue;
      }
      if (cp.size > n) {
        fail('QV_BOARD_BAD_CHECKPOINT', `checkpoint size ${cp.size} exceeds log size ${n}`);
        continue;
      }
      if (!bytesEqual(tree.root(cp.size), cp.root)) {
        fail('QV_BOARD_FORK', `checkpoint at size ${cp.size} does not match recomputed root`);
        continue;
      }
      const prev = bySize.get(cp.size);
      if (prev && !bytesEqual(prev.root, cp.root)) fail('QV_BOARD_FORK', `two roots signed for size ${cp.size}`);
      bySize.set(cp.size, cp);
      cps.push(cp);
    }
    cps.sort((a, b) => a.size - b.size);
    if (n > 0 && !bySize.has(n)) fail('QV_BOARD_BAD_CHECKPOINT', `no signed checkpoint covers the full log (size ${n})`);

    // Witnesses: status per checkpoint, per-witness timestamp monotonicity.
    const status = new Map<number, ReturnType<typeof witnessStatus>>();
    const lastTs = new Map<string, number>();
    for (const cp of cps) {
      const st = witnessStatus(cp, policy);
      status.set(cp.size, st);
      for (const [w, ts] of st.valid) {
        if ((lastTs.get(w) ?? 0) > ts) fail('QV_BOARD_FORK', `witness ${w} cosignature timestamps not monotone at size ${cp.size}`);
        lastTs.set(w, Math.max(ts, lastTs.get(w) ?? 0));
      }
      if (st.unsupported.length > 0) warnings.push(`unsupported cosignature algorithm from ${st.unsupported.join(',')} at size ${cp.size}`);
    }
    const latest = cps.at(-1);
    const latestSt = latest ? status.get(latest.size) : undefined;
    const k = policy.quorum;
    const witnessedBetween = (lo: number, hi: number): boolean => cps.some((c) => c.size >= lo && c.size <= hi && status.get(c.size)?.witnessed === true);
    const waived = (hi: number): boolean =>
      (seqOf.get('notice') ?? []).some((s) => {
        const e = bundle.entries[s];
        const h = headers[s];
        return s < hi && e !== undefined && h !== undefined && opts.isWitnessWaiver?.(e, h) === true;
      });
    if (k === 0) {
      if (!policy.noneAcknowledged) fail('QV_BOARD_GRAMMAR', 'witness quorum 0 without none_acknowledged flag');
      warnings.push('NOT WITNESSED');
    } else {
      const gate = (what: string, seq: number | undefined, lo: number, hi: number, hard: boolean): void => {
        if (seq === undefined || witnessedBetween(lo, hi)) return;
        if (waived(seq)) {
          warnings.push(`witness requirement for ${what} waived by organizer notice`);
        } else if (hard) {
          fail('QV_BOARD_GRAMMAR', `${what}: no quorum-witnessed checkpoint in required range`, seq);
        } else {
          warnings.push(`NOT WITNESSED: ${what}`);
        }
      };
      const first = (t: string): number | undefined => seqOf.get(t)?.[0];
      const roll = first('roll_commit');
      const open = first('election_open');
      const close = first('election_close');
      const agg = first('tally_aggregate');
      const res = first('tally_result');
      if (open !== undefined && roll !== undefined) gate('election_open', open, roll + 1, open, true);
      if (close !== undefined) gate('election_close', agg ?? close, close, agg ?? Number.MAX_SAFE_INTEGER, agg !== undefined);
      if (res !== undefined) gate('tally_result', res, res + 1, Number.MAX_SAFE_INTEGER, false);
    }

    // Pinned checkpoint (REQ-026).
    let pinnedCheckpoint: string | undefined;
    if (opts.pinned !== undefined) {
      const p = parseCheckpoint(opts.pinned);
      if (!p.ok || p.value.origin !== bundle.origin || !verifyLogSignature(p.value, logPk)) {
        fail('QV_BOARD_BAD_CHECKPOINT', 'pinned checkpoint invalid');
      } else if (p.value.size > n) {
        fail('QV_BOARD_ROLLBACK', `ROLLBACK_DETECTED: pinned size ${p.value.size} > log size ${n}`);
      } else if (!bytesEqual(tree.root(p.value.size), p.value.root)) {
        fail('QV_BOARD_FORK', 'EQUIVOCATION_SUSPECTED: pinned checkpoint not a prefix of this log');
      } else {
        pinnedCheckpoint = `${p.value.size}:${b64(p.value.root)}`;
      }
    }

    // Receipts (§13 step 10).
    for (const r of bundle.receipts) {
      const v = verifyReceipt(r, logPk);
      if (!v.ok || r.origin !== bundle.origin) {
        fail(v.ok ? 'QV_BOARD_ORIGIN_MISMATCH' : v.error.code, 'receipt invalid', r.seq);
        continue;
      }
      const lh = r.seq < n ? tree.leafHash(r.seq) : undefined;
      if (lh === undefined || !bytesEqual(lh, r.leafHash)) {
        fail('QV_BOARD_FORK', 'broken_promise: signed receipt not matched by log', r.seq);
      }
    }

    // Referential: leaf hash of each entry is by construction H(0x00||header); sanity.
    if (n > 0 && bundle.entries[0] && !bytesEqual(hashLeaf(bundle.entries[0].headerBytes), tree.leafHash(0) ?? new Uint8Array(0))) {
      fail('QV_BOARD_INTERNAL', 'leaf hash mismatch');
    }

    return verdict({
      witnessed: { have: latestSt?.valid.size ?? 0, k, latest: latestSt?.witnessed === true },
      manifestHash, pinnedCheckpoint, treeSize: n,
    });
  } catch {
    fail('QV_BOARD_BAD_BUNDLE', 'bundle structurally invalid');
    return verdict();
  }
}

/** Verify, then load into `target` and mark it read-only (REQ-033). Rejects with the exact failing seq. */
export function importBundle(bundle: LogBundle, target: BoardStore, opts: VerifyOptions = {}): Result<Verdict> {
  if (target.size() !== 0) return err('QV_BOARD_BAD_BUNDLE', 'import target must be empty');
  const v = verifyLog(bundle, opts);
  if (v.integrity === 'FAILED') {
    const f = v.failures[0];
    return err('QV_BOARD_BAD_BUNDLE', `seq=${f?.seq ?? 'n/a'} rule=${f?.rule ?? ''}: ${f?.detail ?? ''}`);
  }
  const tree = new MerkleTree();
  for (const e of bundle.entries) {
    const h = checkEntry(e.headerBytes, e.body, bundle.origin, undefined, e.seq);
    if (!h.ok) return h;
    const leafHash = hashLeaf(e.headerBytes);
    tree.appendLeafHash(leafHash);
    target.appendEntry({
      seq: e.seq, headerBytes: e.headerBytes, body: e.body, leafHash, sequencedAt: 0,
      nonceKey: nonceKey(toHex(h.value.author), h.value.type, toHex(h.value.authorNonce)),
    });
  }
  for (const note of bundle.checkpoints) {
    const p = parseCheckpoint(note);
    if (p.ok) target.putCheckpoint({ size: p.value.size, root: p.value.root, note });
  }
  target.setReadOnly(true);
  return ok(v);
}

// ---- JSON-object form (entries.jsonl lines etc.); proofs/hashes std-b64, payloads b64u ----

export function bundleToJson(b: LogBundle): unknown {
  return {
    format: b.format, origin: b.origin, created_at: b.createdAt, tree_size: b.treeSize, root_b64: b64(b.root),
    generator: b.generator, spec: b.spec,
    entries: b.entries.map((e) => ({ seq: e.seq, header_b64u: b64u(e.headerBytes), body_b64u: e.body === null ? null : b64u(e.body) })),
    checkpoints: b.checkpoints,
    receipts: b.receipts.map((r) => ({
      origin: r.origin, seq: r.seq, leaf_hash: b64(r.leafHash), sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline,
      promise_sig: b64(r.promiseSig),
      ...(r.inclusion ? { inclusion: { tree_size: r.inclusion.treeSize, path: r.inclusion.path.map(b64), checkpoint_note: r.inclusion.checkpointNote } } : {}),
    })),
    policy: {
      log_pk_b64: b64(b.policy.logPublicKey),
      witness_policy: {
        quorum: b.policy.witnessPolicy.quorum, none_acknowledged: b.policy.witnessPolicy.noneAcknowledged,
        witnesses: b.policy.witnessPolicy.witnesses.map((w) => ({ name: w.name, alg: w.alg, pk_b64: b64(w.publicKey) })),
      },
    },
    redactions: b.redactions.map((r) => ({ seq: r.seq, redacted_at: r.redactedAt, reason: r.reason })),
  };
}

interface Obj { [k: string]: unknown }
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;

/** Strict decode; any shape error is a Result error (never throws). */
export function bundleFromJson(x: unknown): Result<LogBundle> {
  const bad = (m: string): Result<LogBundle> => err('QV_BOARD_BAD_BUNDLE', m);
  try {
    if (!isObj(x) || x['format'] !== 'qv-bundle/v1' || x['spec'] !== 'QV-18') return bad('format');
    const { origin, created_at, tree_size, root_b64, generator } = x as Obj;
    const root = typeof root_b64 === 'string' ? unb64(root_b64) : undefined;
    if (typeof origin !== 'string' || !isInt(created_at) || !isInt(tree_size) || !root || typeof generator !== 'string') return bad('header fields');
    const entriesJ = x['entries'];
    if (!Array.isArray(entriesJ)) return bad('entries');
    const entries: BundleEntry[] = [];
    for (const e of entriesJ) {
      if (!isObj(e) || !isInt(e['seq']) || typeof e['header_b64u'] !== 'string') return bad('entry');
      const headerBytes = unb64u(e['header_b64u']);
      const bodyJ = e['body_b64u'];
      const body = bodyJ === null ? null : typeof bodyJ === 'string' ? unb64u(bodyJ) : undefined;
      if (!headerBytes || body === undefined) return bad('entry encoding');
      entries.push({ seq: e['seq'], headerBytes, body });
    }
    const cpsJ = x['checkpoints'];
    if (!Array.isArray(cpsJ) || cpsJ.some((c) => typeof c !== 'string')) return bad('checkpoints');
    const receipts: Receipt[] = [];
    const rj = x['receipts'];
    if (!Array.isArray(rj)) return bad('receipts');
    for (const r of rj) {
      if (!isObj(r)) return bad('receipt');
      const leafHash = typeof r['leaf_hash'] === 'string' ? unb64(r['leaf_hash']) : undefined;
      const promiseSig = typeof r['promise_sig'] === 'string' ? unb64(r['promise_sig']) : undefined;
      if (typeof r['origin'] !== 'string' || !isInt(r['seq']) || !isInt(r['sequenced_at']) || !isInt(r['checkpoint_deadline']) || !leafHash || !promiseSig) return bad('receipt');
      const rec: Receipt = { origin: r['origin'], seq: r['seq'], leafHash, sequencedAt: r['sequenced_at'], checkpointDeadline: r['checkpoint_deadline'], promiseSig };
      const inc = r['inclusion'];
      if (inc !== undefined) {
        if (!isObj(inc) || !isInt(inc['tree_size']) || !Array.isArray(inc['path']) || typeof inc['checkpoint_note'] !== 'string') return bad('inclusion');
        const path = inc['path'].map((p) => (typeof p === 'string' ? unb64(p) : undefined));
        if (path.some((p) => !p)) return bad('inclusion path');
        rec.inclusion = { treeSize: inc['tree_size'], path: path as Uint8Array[], checkpointNote: inc['checkpoint_note'] };
      }
      receipts.push(rec);
    }
    const pj = x['policy'];
    if (!isObj(pj) || typeof pj['log_pk_b64'] !== 'string' || !isObj(pj['witness_policy'])) return bad('policy');
    const logPublicKey = unb64(pj['log_pk_b64']);
    const wp = pj['witness_policy'];
    if (!logPublicKey || !isInt(wp['quorum']) || typeof wp['none_acknowledged'] !== 'boolean' || !Array.isArray(wp['witnesses'])) return bad('policy');
    const witnesses = wp['witnesses'].map((w): WitnessPolicy['witnesses'][number] | undefined => {
      if (!isObj(w) || typeof w['name'] !== 'string' || (w['alg'] !== 'ed25519' && w['alg'] !== 'mldsa44') || typeof w['pk_b64'] !== 'string') return undefined;
      const pk = unb64(w['pk_b64']);
      return pk ? { name: w['name'], alg: w['alg'], publicKey: pk } : undefined;
    });
    if (witnesses.some((w) => !w)) return bad('witnesses');
    const redJ = x['redactions'];
    if (!Array.isArray(redJ)) return bad('redactions');
    const redactions: LogBundle['redactions'] = [];
    for (const r of redJ) {
      if (!isObj(r) || !isInt(r['seq']) || !isInt(r['redacted_at']) || typeof r['reason'] !== 'string') return bad('redaction');
      redactions.push({ seq: r['seq'], redactedAt: r['redacted_at'], reason: r['reason'] });
    }
    return ok({
      format: 'qv-bundle/v1', origin, createdAt: created_at, treeSize: tree_size, root, generator, spec: 'QV-18', entries,
      checkpoints: cpsJ as string[], receipts,
      policy: { logPublicKey, witnessPolicy: { quorum: wp['quorum'], noneAcknowledged: wp['none_acknowledged'], witnesses: witnesses as WitnessPolicy['witnesses'] } },
      redactions,
    });
  } catch {
    return bad('malformed');
  }
}

