// Export bundle writer: the protocol ElectionBundle (feeds verifyElection) and the .qvb tar (QV-18 §12).
import { b64u, bundleToJson, decodeHeader, exportBundle, toHex, type LogBundle } from '@quietvote/board';
import { bytesToHex, hexToBytes, parseQvJson, sha256, utf8 } from '@quietvote/crypto';
import { manifestHash, type ElectionBundle, type LogEntry } from '@quietvote/protocol';
import { SERVER_VERSION, type ElectionRuntime } from './election.ts';
import { writeTar } from './tar.ts';

/** Entry types whose bodies are protocol records the verifier understands. */
const PROTOCOL_TYPES = new Set([
  'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close', 'dkg_round1', 'dkg_round2', 'dkg_complaint',
  'key_confirm', 'ballot', 'ballot_audit', 'tally_result',
]);

export function electionBundle(rt: ElectionRuntime): ElectionBundle {
  const st = rt.st;
  if (!st.manifestRec || !st.mh) throw new Error('no manifest');
  const log: LogEntry[] = [];
  let from = 0;
  for (;;) {
    const page = rt.edb.entries(from, 500);
    for (const r of page.rows) {
      if (r.seq === 0 || r.body === null) continue;
      const isNotice = r.type === 'notice';
      if (!PROTOCOL_TYPES.has(r.type) && !isNotice) continue;
      const rec = parseQvJson(r.body) as { body?: { type?: string } };
      if (isNotice && rec.body?.type !== 'marker') continue; // control notices are board-level only
      log.push({ seq: r.seq, entry: rec });
    }
    if (!page.more) break;
    from = (page.rows.at(-1)?.seq ?? from) + 1;
  }
  return { manifest: st.manifestRec, manifest_hash: bytesToHex(manifestHash(st.manifest!)), roll: st.rollSet ? [...st.rollSet].sort() : rt.edb.approvedKeysHex(), log };
}

export function logBundle(rt: ElectionRuntime): LogBundle {
  const w = rt.witnessPolicy();
  return exportBundle(rt.edb.store, {
    origin: rt.origin, createdAt: rt.env.nowSec(), generator: `quietvote-server/${SERVER_VERSION}`,
    policy: { logPublicKey: rt.logPk, witnessPolicy: w }, redactions: rt.edb.redactions(),
  });
}

/**
 * Key that signed the manifest entry (an org organizer key on the instance that ran the election, or the value recorded at import).
 * Not derivable from the log (headers carry only a key id), so bundles carry it for importers; the importer checks it against that id.
 */
export function organizerPk(rt: ElectionRuntime): Uint8Array | undefined {
  const rec = rt.edb.meta('organizer_pk');
  if (rec !== undefined) return hexToBytes(rec, 32);
  const e = rt.edb.store.getEntry(0);
  const h = e ? decodeHeader(e.headerBytes) : undefined;
  const k = h?.ok ? rt.env.control.keyAnyById(b64u(h.value.author)) : undefined;
  return k ? new Uint8Array(k.pk) : undefined;
}

export function qvb(rt: ElectionRuntime): Uint8Array {
  const lb = logBundle(rt);
  const j = bundleToJson(lb) as Record<string, unknown> & { entries: unknown[]; checkpoints: string[]; policy: unknown; redactions: unknown };
  const files: { name: string; data: Uint8Array }[] = [];
  const entries = utf8(j.entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  files.push({ name: 'log/entries.jsonl', data: entries });
  for (const note of j.checkpoints) {
    const size = /\n(\d+)\n/.exec(note)?.[1] ?? '0';
    files.push({ name: `log/checkpoints/${size}.txt`, data: utf8(note) });
  }
  files.push({ name: 'witness/policy.json', data: utf8(JSON.stringify(j.policy)) });
  files.push({ name: 'redactions.json', data: utf8(JSON.stringify(j.redactions)) });
  files.push({ name: 'election.json', data: utf8(JSON.stringify(electionBundle(rt))) });
  files.push({
    name: 'bundle.json',
    data: utf8(JSON.stringify({
      format: j['format'], origin: j['origin'], created_at: j['created_at'], tree_size: j['tree_size'], root_b64: j['root_b64'],
      entries_sha256: toHex(sha256(entries)), generator: j['generator'], spec: j['spec'], log_pk_b64u: b64u(rt.logPk),
      server_pk_b64u: b64u(rt.srvPk), ...(organizerPk(rt) ? { organizer_pk_b64u: b64u(organizerPk(rt)!) } : {}),
    })),
  });
  files.push({ name: 'README.txt', data: utf8('QuietVote bundle v1. Verify offline: check SHA256SUMS, then run the board and protocol verifiers on log/ and election.json.\n') });
  const sums = [...files].sort((a, b) => (a.name < b.name ? -1 : 1)).map((f) => `${toHex(sha256(f.data))}  ${f.name}`).join('\n') + '\n';
  files.push({ name: 'SHA256SUMS', data: utf8(sums) });
  return writeTar(files);
}
