import { bytesToHex } from '@quietvote/crypto';
import { manifestHash, validateManifest } from '@quietvote/protocol';
import { needPositional, parseArgs } from './args.ts';
import { loadBundleFile, printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdElectionInspect(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { json: 'bool' });
  const [file] = needPositional(p, 1, 'election inspect <bundle>');
  const b = loadBundleFile(file!);
  const e = b.election;
  const mv = validateManifest(e.manifest.body, e.roll.length);
  if (!mv.ok) {
    io.err(`manifest invalid: ${mv.error}${mv.detail === undefined ? '' : ` (${mv.detail})`}\n`);
    return EXIT.fail;
  }
  const m = mv.value.manifest;
  const hash = bytesToHex(manifestHash(m));
  const types: Record<string, number> = {};
  for (const l of e.log) {
    const o = l.entry as { intent?: unknown; body?: { type?: unknown } } | null;
    const t = typeof o?.intent === 'string' ? `ballot:${o.intent}` : typeof o?.body?.type === 'string' ? o.body.type : 'unrecognised';
    types[t] = (types[t] ?? 0) + 1;
  }
  const info = {
    title: m.title, election_id: m.election_id, proto: m.proto, manifest_hash: hash, manifest_hash_matches_bundle: hash === e.manifest_hash,
    window: { open: m.voting_open, close: m.voting_close }, created: m.created,
    contests: m.contests.map((c) => ({ id: c.id, title: c.title, method: c.method, options: c.options.map((o) => o.id), ...(c.selection_limit === undefined ? {} : { selection_limit: c.selection_limit }) })),
    trustees: { n: m.n, t: m.t }, coordinators: { keys: m.coordinator.keys.length, m: m.coordinator.m }, roll_size: e.roll.length,
    ballots: m.ballots, witness_quorum: m.bb.witness_quorum, warnings: mv.value.warnings, log_entries: e.log.length, log_record_types: types,
    board_export_present: b.board !== undefined, verified: false as const,
  };
  if (p.has('json')) printJson(io, info);
  else {
    const L = [
      `${m.title}`, `election id: ${m.election_id}`, `protocol: ${m.proto}`, `manifest hash: ${hash} (${info.manifest_hash_matches_bundle ? 'matches' : 'DIFFERS from'} the bundle's manifest_hash)`,
      `voting: ${m.voting_open} to ${m.voting_close}`, `trustees: ${m.t}-of-${m.n}; coordinators: ${m.coordinator.m}-of-${m.coordinator.keys.length}; roll: ${e.roll.length} voters`,
      `ballots per voter: max ${m.ballots.max_per_voter}, max spoils ${m.ballots.max_spoils_per_voter}; witness quorum: ${m.bb.witness_quorum}`,
    ];
    for (const c of info.contests) L.push(`contest ${c.id}: ${c.title} [${c.method}] options: ${c.options.join(', ')}${c.selection_limit === undefined ? '' : ` (select up to ${c.selection_limit})`}`);
    L.push(`log: ${e.log.length} entries (${Object.entries(types).map(([k, n]) => `${k} ${n}`).join(', ')}); board export: ${info.board_export_present ? 'yes' : 'no'}`);
    for (const w of info.warnings) L.push(`warning: ${w}`);
    L.push('This is a description, not a verification. Run `qv verify` for a verdict.');
    io.out(L.join('\n') + '\n');
  }
  // The description is still printed, but a bundle whose manifest hash does not match its own manifest is a failure.
  return info.manifest_hash_matches_bundle ? EXIT.ok : EXIT.fail;
}
