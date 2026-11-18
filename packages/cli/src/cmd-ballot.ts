import { rmSync, writeFileSync } from 'node:fs';
import { canonicalize } from '@quietvote/crypto';
import {
  NO_SUPERSEDES, buildBallot, makeCast, makeSpoil, revealDigest, verifyEnvelope, verifySpoilReveal,
  type CastEnvelope, type Reveal, type Selections, type SpoilEnvelope,
} from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { PASSPHRASE_FLAGS, electionContext, hex, isHex, pinnedHash, printJson, readJson } from './common.ts';
import { loadVoterKey } from './cmd-keygen.ts';
import { EXIT, type Io } from './io.ts';

export const AUDIT_FORMAT = 'qv-ballot-audit/v1';

function writeOut(path: string, data: string, secret: boolean, io: Io): void {
  try {
    writeFileSync(path, data, { mode: secret ? 0o600 : 0o644, flag: 'wx' });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new InputError(code === 'EEXIST' ? `${path} exists; refusing to overwrite` : `cannot write ${path}: ${code ?? 'error'}`);
  }
  void io;
}

function parseSelections(specs: string[], contestIds: string[]): Selections {
  const sel: Selections = {};
  for (const s of specs) {
    const eq = s.indexOf('=');
    if (eq < 1) throw new UsageError(`--select expects contest=option[,option...], got "${s}"`);
    const cid = s.slice(0, eq);
    if (!contestIds.includes(cid)) throw new UsageError(`unknown contest "${cid}" (contests: ${contestIds.join(', ')})`);
    if (Object.hasOwn(sel, cid)) throw new UsageError(`contest "${cid}" selected twice`);
    const rest = s.slice(eq + 1);
    sel[cid] = rest === '' ? [] : rest.split(',');
  }
  return sel;
}

export async function cmdBallotEncrypt(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { election: 'value', key: 'value', select: 'multi', intent: 'value', supersedes: 'value', out: 'value', 'audit-out': 'value', 'manifest-hash': 'value', 'publish-reveal': 'bool', json: 'bool', ...PASSPHRASE_FLAGS });
  needPositional(p, 0, 'ballot encrypt (options only)');
  const intent = p.get('intent') ?? 'cast';
  if (intent !== 'cast' && intent !== 'spoil') throw new UsageError('--intent must be cast or spoil');
  if (intent === 'cast' && p.has('publish-reveal')) throw new UsageError('--publish-reveal only applies to --intent spoil');
  const out = needFlag(p, 'out');
  const auditOut = p.get('audit-out');
  if (intent === 'spoil' && auditOut === undefined) throw new UsageError('--intent spoil needs --audit-out (the reveal is how a second device audits it)');
  // A cast audit file would hold the selections and the randomness of a counted ballot, so it is never written.
  if (intent === 'cast' && auditOut !== undefined) throw new UsageError('--audit-out only applies to --intent spoil (a cast ballot writes no audit file)');
  const supersedes = p.get('supersedes') ?? NO_SUPERSEDES;
  if (!isHex(supersedes, 32)) throw new UsageError('--supersedes must be 64 lower-case hex digits');
  const key = await loadVoterKey(needFlag(p, 'key'), p, io);
  const ec = await electionContext(needFlag(p, 'election'), pinnedHash(p));
  if (!ec.rollSet.has(hex(key.publicKey))) throw new FailError('this voter key is not on the election roll');
  const ids = ec.manifest.contests.map((c) => c.id);
  const sel = parseSelections(p.all('select'), ids);
  const blank = ids.filter((id) => sel[id] === undefined);
  const full: Selections = Object.fromEntries(ids.map((id) => [id, sel[id] ?? []]));
  const built = buildBallot(ec.params, key.seed, key.publicKey, supersedes, full, io.rng);
  if (!built.ok) throw new UsageError(`selections rejected: ${built.error}${built.detail === undefined ? '' : ` (${built.detail})`}`);
  const b = built.value;
  const env: CastEnvelope | SpoilEnvelope = intent === 'cast' ? makeCast(ec.params, key.seed, b) : makeSpoil(ec.params, key.seed, b, p.has('publish-reveal') ? 'publish' : 'private');
  // Both or neither: the audit file is written first, and it is removed again if the envelope cannot be written, so a
  // failure never leaves an envelope or audit file behind without the other.
  if (auditOut !== undefined) {
    const reveal: Reveal = { xi: hex(b.xi), selections: b.selections };
    writeOut(auditOut, JSON.stringify({ format: AUDIT_FORMAT, ctx_prefix: hex(ec.params.ctx).slice(0, 16), envelope: env, reveal }) + '\n', true, io);
  }
  try {
    writeOut(out, canonicalize(env) + '\n', false, io);
  } catch (e) {
    if (auditOut !== undefined) rmSync(auditOut, { force: true });
    throw e;
  }
  if (p.has('json')) printJson(io, { intent, manifest_hash: hex(ec.params.mh), ballot_code: hex(b.code), envelope: out, ...(auditOut === undefined ? {} : { audit_file: auditOut }), blank_contests: blank });
  else {
    io.out(`manifest hash: ${hex(ec.params.mh)}\nballot code: ${hex(b.code)}\nintent: ${intent}\nenvelope: ${out}\n`);
    if (auditOut !== undefined) io.out(`audit file: ${auditOut} (mode 0600)\n`);
  }
  if (blank.length > 0) io.err(`note: no selection given for ${blank.join(', ')}; those contests are cast blank\n`);
  if (intent === 'spoil') {
    io.err('warning: the audit file holds your selections and the ballot randomness; keep it private and use it on a second device (qv ballot audit). Audit with test selections only.\n');
    if (p.has('publish-reveal')) io.err('warning: --publish-reveal embeds your selections in the envelope; posting it makes them public (QV-ADR-020).\n');
  } else io.err('note: keep the ballot code; it is your receipt for checking that this ballot was counted.\n');
  return EXIT.ok;
}

export async function cmdBallotAudit(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { election: 'value', ballot: 'value', 'manifest-hash': 'value', json: 'bool' });
  needPositional(p, 0, 'ballot audit (options only)');
  const ec = await electionContext(needFlag(p, 'election'), pinnedHash(p));
  const parsed = readJson(needFlag(p, 'ballot'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new InputError('the ballot file is not a JSON object');
  const j = parsed as { format?: unknown; envelope?: unknown; reveal?: unknown; intent?: unknown };
  const env = (j.format === AUDIT_FORMAT ? j.envelope : j) as { intent?: unknown; body?: unknown; reveal_digest?: unknown; reveal?: Reveal } | undefined;
  const reveal = (j.format === AUDIT_FORMAT ? j.reveal : env?.reveal) as Reveal | undefined;
  if (env === undefined || typeof env !== 'object' || env === null) throw new InputError('no envelope found in the ballot file');
  if (reveal === undefined || typeof reveal !== 'object' || reveal === null || typeof reveal.xi !== 'string' || !isHex(reveal.xi, 64)) {
    throw new InputError('no usable reveal: a private-mode spoil needs the audit file written by `ballot encrypt --audit-out`');
  }
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const v = verifyEnvelope(ec.params, ec.rollSet, env);
  checks.push(v.ok ? { name: 'envelope: roll membership, signature, proofs', ok: true } : { name: 'envelope: roll membership, signature, proofs', ok: false, detail: `${v.error}${v.detail === undefined ? '' : ` (${v.detail})`}` });
  if (v.ok) {
    const s = verifySpoilReveal(ec.params, v.value.env.body, reveal);
    checks.push(s.ok ? { name: 'recomputed ballot equals the posted ballot', ok: true } : { name: 'recomputed ballot equals the posted ballot', ok: false, detail: `${s.error}${s.detail === undefined ? '' : ` (${s.detail})`}` });
    if (v.value.env.intent === 'spoil') {
      const rd = v.value.env.reveal_digest;
      const zero = rd === '00'.repeat(32);
      const match = zero || hex(revealDigest(ec.params.ctx, reveal)) === rd;
      checks.push({ name: 'reveal_digest commits to this reveal', ok: match, ...(match ? {} : { detail: 'digest differs' }) });
    }
  }
  const ok = checks.every((c) => c.ok);
  const code = v.ok ? hex(v.value.code) : undefined;
  if (p.has('json')) printJson(io, { ok, manifest_hash: hex(ec.params.mh), ballot_code: code ?? null, selections: ok ? reveal.selections : null, checks });
  else {
    io.out(`manifest hash: ${hex(ec.params.mh)}\n`);
    for (const c of checks) io.out(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail === undefined ? '' : `: ${c.detail}`}\n`);
    if (code !== undefined) io.out(`ballot code: ${code}\n`);
    if (ok) for (const [cid, s] of Object.entries(reveal.selections)) io.out(`selection ${cid}: ${s.length === 0 ? '(blank)' : s.join(', ')}\n`);
    io.out(ok ? 'AUDIT PASSED: the posted ciphertexts encrypt exactly these selections.\n' : 'AUDIT FAILED: do not trust the device that produced this ballot.\n');
  }
  return ok ? EXIT.ok : EXIT.fail;
}
