import { bytesToHex, concatBytes, ed25519IsStrictPoint, h256, hexToBytes, jcs, u32 } from '@quietvote/crypto';
import { leafHash, mth } from './merkle.ts';
import { check, manifestSchema } from './schema.ts';
import { err, ok, type Manifest, type Result } from './types.ts';

export function manifestHash(m: Manifest): Uint8Array {
  return h256('manifest', jcs(m));
}

const BIDI = /[‎‏‪-‮⁦-⁩]/;

function validTs(s: string): number | null {
  const d = new Date(s.replace('Z', '.000Z'));
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d.toISOString().replace('.000Z', 'Z') === s ? t : null;
}

/** Roll leaf: voter_pk(32) || u32(weight=1). */
export function rollLeaf(pk: Uint8Array): Uint8Array {
  return leafHash(concatBytes(pk, u32(1)));
}

/** Validates the roll: strict keys, sorted ascending bytewise, no duplicates. Returns the Merkle root. */
export function rollRoot(rollHex: readonly string[]): Result<Uint8Array> {
  const keys: Uint8Array[] = [];
  for (const h of rollHex) {
    let b: Uint8Array;
    try {
      b = hexToBytes(h, 32);
    } catch {
      return err('E_ROLL', 'bad key encoding');
    }
    if (!ed25519IsStrictPoint(b)) return err('E_ROLL', 'non-canonical or small-order voter key');
    keys.push(b);
  }
  for (let i = 1; i < rollHex.length; i++) {
    if (!(rollHex[i - 1]! < rollHex[i]!)) return err('E_ROLL', 'roll not strictly ascending / duplicate');
  }
  return ok(mth(keys.map(rollLeaf)));
}

/** QV-ADR-021: default 5 if roll >= 8 else 3. */
export function effectiveMinCounted(m: Manifest, rollSize: number): number {
  return m.min_counted_ballots ?? (rollSize >= 8 ? 5 : 3);
}

export interface ManifestInfo {
  manifest: Manifest;
  warnings: string[];
}

export function validateManifest(body: unknown, rollSize: number): Result<ManifestInfo> {
  const bad = (d: string): Result<ManifestInfo> => err('E_MANIFEST', d);
  const proto = (body as { proto?: unknown } | null)?.proto;
  if (typeof proto === 'string' && proto !== 'qv1-r255-sha2') return err('E_VERSION', proto);
  const e = check(manifestSchema(), body);
  if (e !== null) return err('E_SCHEMA', e);
  const m = body as Manifest;
  const warnings: string[] = [];

  const free = [m.title, ...m.contests.flatMap((c) => [c.title, ...c.options.map((o) => o.label)])];
  for (const s of free) {
    if (s !== s.normalize('NFC')) return bad('free text not NFC');
    if (BIDI.test(s)) return bad('bidi control character in text');
  }
  if (m.n !== m.trustees.length || m.t > m.n) return bad('n/t inconsistent');
  const pks = new Set<string>();
  for (let i = 0; i < m.trustees.length; i++) {
    const tr = m.trustees[i]!;
    if (tr.index !== i + 1) return bad('trustee index order');
    if (pks.has(tr.sign_pk) || !ed25519IsStrictPoint(hexToBytes(tr.sign_pk))) return bad('trustee key invalid/duplicate');
    pks.add(tr.sign_pk);
  }
  if (new Set(m.coordinator.keys).size !== m.coordinator.keys.length || m.coordinator.m > m.coordinator.keys.length) return bad('coordinator');
  if (!m.coordinator.keys.every((k) => ed25519IsStrictPoint(hexToBytes(k)))) return bad('coordinator key invalid');
  if (!ed25519IsStrictPoint(hexToBytes(m.bb.log_pk))) return bad('log key invalid');

  const created = validTs(m.created), open = validTs(m.voting_open), close = validTs(m.voting_close);
  if (created === null || open === null || close === null) return bad('timestamp');
  if (!(created <= open && open < close)) return bad('time ordering');

  const ids = new Set<string>();
  for (const c of m.contests) {
    if (ids.has(c.id)) return bad('duplicate contest id');
    ids.add(c.id);
    const oids = new Set(c.options.map((o) => o.id));
    if (oids.size !== c.options.length) return bad(`duplicate option id in ${c.id}`);
    if (c.options.some((o) => o.id.startsWith('~'))) return bad('reserved option prefix');
    const N = c.options.length;
    const L = c.selection_limit;
    switch (c.method) {
      case 'yes-no':
        if (N !== 2 || c.options[0]!.id !== 'yes' || c.options[1]!.id !== 'no') return bad('yes-no needs options yes,no');
        if (L !== 1 || c.winners !== undefined) return bad('yes-no: selection_limit must be 1, no winners');
        if (c.rule === undefined) return bad('yes-no requires rule');
        break;
      case 'single-choice':
        if (N < 2 || L !== 1) return bad('single-choice: >=2 options, limit 1');
        if (c.winners !== undefined && c.winners !== 1) return bad('single-choice winners must be 1');
        break;
      case 'approval':
        if (L !== undefined) return bad('approval has no selection_limit');
        if (c.winners !== undefined && c.winners > N) return bad('winners > options');
        break;
      case 'k-of-n':
        if (L === undefined || L >= N) return bad('k-of-n: 1 <= k < n');
        if (c.winners !== undefined && c.winners > N) return bad('winners > options');
        break;
    }
    if (c.method !== 'yes-no' && c.rule !== undefined) return bad('rule only for yes-no');
    if (c.rule !== undefined && c.rule.num > c.rule.den) return bad('rule fraction > 1');
    const tb = c.tie_break;
    if (tb.type === 'beacon') return bad('beacon tie-break unavailable in suite v1');
    if (tb.type === 'status-quo') {
      if (c.method !== 'yes-no' || tb.option === undefined || !oids.has(tb.option)) return bad('status-quo needs a yes-no option');
    } else if (tb.option !== undefined) return bad('tie_break.option only for status-quo');
  }
  const q = m.quorum;
  if (q !== undefined) {
    if (q.type === 'fraction') {
      if (q.num === undefined || q.den === undefined || q.basis !== 'roll' || q.value !== undefined || q.num > q.den) return bad('quorum fraction');
    } else if (q.value === undefined || q.num !== undefined || q.den !== undefined || q.basis !== undefined) return bad('quorum count');
  }
  if ((m.roll.root === undefined) !== (m.roll.size === undefined)) return bad('roll.root and roll.size go together');
  const eff = effectiveMinCounted(m, rollSize);
  if (eff < 10 && m.privacy_ack !== true) return bad(`min_counted_ballots ${eff} < 10 requires privacy_ack`);
  if (m.ballots.max_per_voter < 1) return bad('max_per_voter');

  if (m.t === 1) warnings.push('W-NO-THRESHOLD: t = 1 gives no threshold protection');
  if (m.t < Math.floor(m.n / 2) + 1) warnings.push('W-SECRECY: t < floor(n/2)+1');
  if (m.n - m.t < Math.ceil(m.n / 3)) warnings.push('W-AVAILABILITY: n - t < ceil(n/3)');
  if (rollSize < 8) warnings.push('W-SMALL-ROLL: roll < 8 voters');
  return ok({ manifest: m, warnings });
}

export function hexOf(b: Uint8Array): string {
  return bytesToHex(b);
}
