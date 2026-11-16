#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { jcs, parseQvJson, systemRng, hexToBytes, bytesToHex, pointFromBytes, utf8, type Rng } from '@quietvote/crypto';
import type { Aggregate, Manifest, MultiSignedRecord } from '@quietvote/protocol';
import { TrusteeError } from './errors.ts';
import { assertPassphraseStrength, generatePassphrase } from './passphrase.ts';
import { OVERRIDE_NO_LEDGER, OVERRIDE_UNWITNESSED, Trustee, realTarget, type Packet } from './trustee.ts';
import { atomicWrite, exists, lockPath, readSecretFile } from './fsutil.ts';
import { ledgerPath } from './ledger.ts';
import { tombstonePath } from './bundle.ts';
import { verifyTranscript, type CeremonyMode, type Transcript } from './transcript.ts';
import type { VaultDeps } from './bundle.ts';

export interface CliIo {
  out(s: string): void;
  err(s: string): void;
  /** Hidden-input prompt; used only when no passphrase file is given. */
  promptSecret(q: string): Promise<string>;
}
export interface CliDeps {
  rng: Rng;
  now: () => Date;
  /** Tests only. The shipped binary never sets these. */
  logN?: number;
  allowWeak?: boolean;
}

const USAGE = `qv-trustee <command> [options]   (offline tool; secrets never leave this machine)
  keygen --bundle F [--generate-passphrase]       new identity; prints public key
  join --bundle F --manifest F --manifest-hash HEX [--ceremony-id ID]
  import --bundle F --log F.qvl
  commit|reveal|shares|verify|drill --bundle F [--out F.qvp]
  finalize --bundle F
  export-entry --bundle F --round ROUND [--index N] --out F.json
      ROUND: r1-commit|r1-dealing|r2-shares|r3-complaints|r4-keyconf|tally-share
      exports one persisted output for qv online election-submit; no network access
  confirm --bundle F --compared-with 2,3 [--words "w1 .. w6"] [--out F]
  tally-release --bundle F --election F.json [--claimed F] [--override-unwitnessed PHRASE] [--out F]   (election.json carries log_evidence)
  spoil-release --bundle F --election F.json --codes HEX[,HEX...] [--override-unwitnessed PHRASE] [--out F]
  status --bundle F | abort --bundle F --reason T | restart --bundle F
  backup --bundle F --to F2 [--backup-passphrase-file F] | restore --from F2 --bundle F [--backup-passphrase-file F] [--ledger F.releases] [--override-no-ledger PHRASE]
  destroy --bundle F --audit-close F --confirm "<election title>"
  report-compromise --bundle F --severity suspected|confirmed [--out F]
  export-transcript --bundle F --out F [--mode online-dkg|airgap-dkg|airgap-dealer]
  cosign-transcript --bundle F --in F --out F | verify-transcript --in F [--witness-key NAME=HEX]
Passphrase: --passphrase-file F (or QV_TRUSTEE_PASSPHRASE_FILE), otherwise a hidden prompt. Never on the command line.
Options: --json   Exit codes: 0 ok, 10 declined, 20 verification failed, 40 state conflict, 50 locked, 60 refused for safety.`;

/** Only options consumed by that command are accepted; validation precedes prompts and file access. */
const COMMAND_OPTIONS = new Map<string, readonly string[]>([
  ['keygen', ['bundle', 'passphrase-file', 'generate-passphrase']],
  ['join', ['bundle', 'passphrase-file', 'manifest', 'manifest-hash', 'ceremony-id']],
  ['import', ['bundle', 'passphrase-file', 'log']],
  ...['commit', 'reveal', 'shares', 'verify', 'drill'].map((cmd): [string, string[]] => [cmd, ['bundle', 'passphrase-file', 'out']]),
  ['finalize', ['bundle', 'passphrase-file']],
  ['export-entry', ['bundle', 'passphrase-file', 'round', 'index', 'out']],
  ['confirm', ['bundle', 'passphrase-file', 'compared-with', 'words', 'out']],
  ['tally-release', ['bundle', 'passphrase-file', 'election', 'claimed', 'override-unwitnessed', 'out']],
  ['spoil-release', ['bundle', 'passphrase-file', 'election', 'codes', 'override-unwitnessed', 'out']],
  ['status', ['bundle', 'passphrase-file']],
  ['abort', ['bundle', 'passphrase-file', 'reason']],
  ['restart', ['bundle', 'passphrase-file']],
  ['backup', ['bundle', 'passphrase-file', 'to', 'backup-passphrase-file']],
  ['restore', ['from', 'bundle', 'passphrase-file', 'backup-passphrase-file', 'ledger', 'override-no-ledger']],
  ['destroy', ['bundle', 'passphrase-file', 'audit-close', 'confirm']],
  ['report-compromise', ['bundle', 'passphrase-file', 'severity', 'out']],
  ['export-transcript', ['bundle', 'passphrase-file', 'out', 'mode']],
  ['cosign-transcript', ['bundle', 'passphrase-file', 'in', 'out']],
  ['verify-transcript', ['in', 'witness-key']],
]);
const OPTIONS = new Set(['json', ...[...COMMAND_OPTIONS.values()].flat()]);

function transcriptMode(value: string | undefined): CeremonyMode {
  const mode = value ?? 'airgap-dkg';
  if (mode !== 'online-dkg' && mode !== 'airgap-dkg' && mode !== 'airgap-dealer') {
    throw new TrusteeError('USAGE', 'USAGE', '--mode must be online-dkg, airgap-dkg or airgap-dealer (value withheld)');
  }
  return mode;
}

function witnessKeys(value: string | undefined): Record<string, string> {
  if (value === undefined) return {};
  const match = /^([^=\r\n]+)=([0-9a-f]{64})$/.exec(value);
  if (match === null || match[0] !== value || match[1]!.trim().length === 0) {
    throw new TrusteeError('USAGE', 'USAGE', '--witness-key must be NAME=HEX with a nonempty name and 32-byte lowercase hex key (value withheld)');
  }
  return Object.fromEntries([[match[1]!, match[2]!]]);
}

function parseArgs(argv: string[]): { cmd: string; o: Map<string, string>; flags: Set<string> } {
  const [cmd = '', ...rest] = argv;
  const o = new Map<string, string>();
  const flags = new Set<string>();
  const bool = new Set(['json', 'generate-passphrase']);
  const supported = new Set(['json', ...(COMMAND_OPTIONS.get(cmd) ?? [])]);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) throw new TrusteeError('USAGE', 'USAGE', 'unexpected positional argument (value withheld)');
    const k = a.slice(2);
    // Checked before any value is consumed, and the value is never echoed. The name is echoed only when it is a plain option-shaped word.
    if (!OPTIONS.has(k)) {
      const shown = /^[a-z][a-z0-9-]{0,39}$/.test(k) ? `--${k}` : '(name withheld)';
      throw new TrusteeError('USAGE', 'USAGE', `unknown option ${shown}; run with no arguments for usage`);
    }
    if (!supported.has(k)) throw new TrusteeError('USAGE', 'USAGE', `--${k} is not supported by this command`);
    if (o.has(k) || flags.has(k)) throw new TrusteeError('USAGE', 'USAGE', `duplicate option --${k}`);
    if (bool.has(k)) flags.add(k);
    else {
      const v = rest[++i];
      if (v === undefined || v.startsWith('--')) throw new TrusteeError('USAGE', 'USAGE', `--${k} needs a value`);
      o.set(k, v);
    }
  }
  if (o.has('mode')) transcriptMode(o.get('mode'));
  if (o.has('witness-key')) witnessKeys(o.get('witness-key'));
  if (cmd === 'export-entry') {
    if (!['r1-commit', 'r1-dealing', 'r2-shares', 'r3-complaints', 'r4-keyconf', 'tally-share'].includes(o.get('round') ?? '') || !o.has('out')) {
      throw new TrusteeError('USAGE', 'USAGE', 'export-entry requires a supported --round and --out');
    }
    const index = o.get('index') ?? '0';
    if (!/^(0|[1-9][0-9]*)$/.test(index) || !Number.isSafeInteger(Number(index))) {
      throw new TrusteeError('USAGE', 'USAGE', '--index must be a nonnegative safe integer');
    }
  }
  return { cmd, o, flags };
}

const bytesOf = async (p: string): Promise<Uint8Array> => {
  try {
    return new Uint8Array(await readFile(p));
  } catch {
    throw new TrusteeError('USAGE', 'NO_SUCH_FILE', p);
  }
};
const jsonOf = async (p: string): Promise<unknown> => {
  const b = await bytesOf(p);
  try {
    return parseQvJson(b);
  } catch {
    throw new TrusteeError('VERIFY', 'BAD_JSON', `${p} is not valid QV-JSON`);
  }
};

/** Parses `--claimed`: {contests:[{id, options:[{id, A, B}]}]} with 32-byte hex points. Any malformation is BAD_CLAIMED, never a raw exception. */
function parseClaimed(c: unknown): Map<string, Map<string, Aggregate>> {
  const bad = (): never => {
    throw new TrusteeError('VERIFY', 'BAD_CLAIMED', '--claimed must be {contests:[{id, options:[{id, A, B}]}]} with 32-byte hex points');
  };
  const cs = (c as { contests?: unknown } | null)?.contests;
  if (!Array.isArray(cs)) return bad();
  try {
    return new Map(cs.map((x: { id: string; options: { id: string; A: string; B: string }[] }) => {
      if (typeof x.id !== 'string' || !Array.isArray(x.options)) return bad();
      return [x.id, new Map(x.options.map((y) => [y.id, { A: pointFromBytes(hexToBytes(y.A, 32)), B: pointFromBytes(hexToBytes(y.B, 32)) }] as const))] as const;
    }));
  } catch (e) {
    if (e instanceof TrusteeError) throw e;
    return bad();
  }
}

/** Runs one command; returns the process exit code. */
export async function main(argv: string[], io: CliIo, deps: CliDeps, env: Record<string, string | undefined> = {}): Promise<number> {
  let json = false;
  try {
    const { cmd, o, flags } = parseArgs(argv);
    json = flags.has('json');
    const need = (k: string): string => {
      const v = o.get(k);
      if (v === undefined) throw new TrusteeError('USAGE', 'USAGE', `--${k} is required`);
      return v;
    };
    const vd: VaultDeps = { rng: deps.rng, now: deps.now, ...(deps.logN !== undefined ? { logN: deps.logN } : {}), ...(deps.allowWeak === true ? { allowWeak: true } : {}) };
    const pass = async (fileOpt: string, envKey: string, q: string): Promise<string> => {
      const f = o.get(fileOpt) ?? env[envKey];
      if (f === undefined) return io.promptSecret(q);
      const raw = await readSecretFile(f); // refuses group/other-readable passphrase files (QV-17 §6.5)
      try {
        return new TextDecoder().decode(raw).replace(/\r?\n$/, '');
      } finally {
        raw.fill(0);
      }
    };
    const mainPass = (): Promise<string> => pass('passphrase-file', 'QV_TRUSTEE_PASSPHRASE_FILE', 'Bundle passphrase: ');
    /** T6: an output file may never be (or resolve to) the sealed bundle, a registered backup, the tombstone/attestation/ledger, nor any existing file. */
    const guardOut = async (t: Trustee): Promise<void> => {
      const out = o.get('out');
      if (out === undefined) return;
      const b = t.path;
      const prot = [b, tombstonePath(b), `${b}.attestation.json`, ledgerPath(b), lockPath(b), ...t.data.backups.map((x) => x.path)];
      const target = await realTarget(out);
      for (const x of prot) if ((await realTarget(x)) === target) throw new TrusteeError('REFUSED', 'OUT_PATH_PROTECTED', `--out ${out} is a sealed bundle, backup or record of this share`);
      if (await exists(out)) throw new TrusteeError('REFUSED', 'OUT_EXISTS', `--out ${out} already exists; remove it first (never overwritten)`);
    };
    const open = async (): Promise<Trustee> => {
      const t = await Trustee.open(need('bundle'), await mainPass(), vd);
      await guardOut(t); // before the command changes any state
      return t;
    };
    const emit = async (p: Packet, extra: Record<string, unknown> = {}): Promise<void> => {
      const out = o.get('out');
      if (out !== undefined) await atomicWrite(out, p.bytes, 0o644);
      report({ round: p.round, ...(out === undefined ? {} : { out }), ...extra });
    };
    const report = (x: Record<string, unknown>): void => io.out(json ? JSON.stringify({ ok: true, ...x }) : Object.entries(x).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n'));

    switch (cmd) {
      case 'keygen': {
        let p: string;
        if (flags.has('generate-passphrase')) {
          p = generatePassphrase(deps.rng);
          io.err(`GENERATED PASSPHRASE (write it on paper now; it is not stored anywhere): ${p}`);
        } else p = await mainPass();
        assertPassphraseStrength(p, flags.has('generate-passphrase') || deps.allowWeak === true);
        const t = await Trustee.keygen(need('bundle'), p, vd);
        report({ state: t.state, sign_pk: t.signPk });
        return 0;
      }
      case 'join': {
        const t = await open();
        await t.join((await jsonOf(need('manifest'))) as MultiSignedRecord<Manifest>, need('manifest-hash'), o.get('ceremony-id') ?? 'c1');
        report({ state: t.state, trustee_id: t.data.trustee_id ?? 0 });
        return 0;
      }
      case 'import': {
        const t = await open();
        report({ ...(await t.importLog(await bytesOf(need('log')))), state: t.state });
        return 0;
      }
      case 'commit': case 'reveal': case 'shares': case 'drill': {
        const t = await open();
        await emit(await t[cmd](), { state: t.state });
        return 0;
      }
      case 'verify': {
        const t = await open();
        const r = await t.verify();
        await emit(r.packet, { state: t.state, complaints: r.complaints });
        return 0;
      }
      case 'finalize': {
        const t = await open();
        const r = await t.finalize();
        report({ state: t.state, check_words: r.fingerprint.words.join(' '), check_hex: r.fingerprint.hex, qualified: r.qualified, events: r.events });
        return 0;
      }
      case 'export-entry': {
        const t = await open();
        const entry = await t.exportBoardEntry(need('round'), Number(o.get('index') ?? '0'));
        try { await atomicWrite(need('out'), jcs(entry), 0o644, { exclusive: true }); }
        catch { throw new TrusteeError('REFUSED', 'OUT_WRITE_FAILED', 'cannot create entry output; existing files are never overwritten'); }
        report({ out: need('out'), round: need('round'), index: Number(o.get('index') ?? '0') });
        return 0;
      }
      case 'confirm': {
        const t = await open();
        const w = o.get('words');
        await emit(await t.confirm(need('compared-with').split(',').map(Number), w === undefined ? undefined : w.trim().split(/\s+/)), { state: t.state });
        return 0;
      }
      case 'tally-release': {
        const t = await open();
        let claimed: Map<string, Map<string, Aggregate>> | undefined;
        if (o.has('claimed')) {
          claimed = parseClaimed(await jsonOf(need('claimed')));
        }
        const ov = o.get('override-unwitnessed');
        await emit(await t.releaseTally(await jsonOf(need('election')), { ...(claimed === undefined ? {} : { claimed }), ...(ov === undefined ? {} : { override: ov }) }), { state: t.state });
        return 0;
      }
      case 'spoil-release': {
        const t = await open();
        const ov = o.get('override-unwitnessed');
        await emit(await t.releaseSpoil(await jsonOf(need('election')), need('codes').split(',').map((c) => c.trim()), ov === undefined ? {} : { override: ov }), { state: t.state });
        return 0;
      }
      case 'status': {
        report({ ...(await open()).status() });
        return 0;
      }
      case 'abort': {
        const t = await open();
        await t.abort(need('reason'));
        report({ state: t.state });
        return 0;
      }
      case 'restart': {
        const t = await open();
        report({ ...(await t.restart()), state: t.state });
        return 0;
      }
      case 'backup': {
        const t = await open();
        report({ ...(await t.backup(need('to'), await pass('backup-passphrase-file', 'QV_TRUSTEE_BACKUP_PASSPHRASE_FILE', 'Backup passphrase: '))) });
        return 0;
      }
      case 'restore': {
        const bp = await pass('backup-passphrase-file', 'QV_TRUSTEE_BACKUP_PASSPHRASE_FILE', 'Backup passphrase: ');
        const np = await pass('passphrase-file', 'QV_TRUSTEE_PASSPHRASE_FILE', 'New bundle passphrase: ');
        const lg = o.get('ledger');
        const ro = o.get('override-no-ledger');
        const t = await Trustee.restore(need('from'), bp, need('bundle'), np, vd, { ...(lg === undefined ? {} : { ledger: lg }), ...(ro === undefined ? {} : { override: ro }) });
        report({ state: t.state });
        return 0;
      }
      case 'destroy': {
        const t = await open();
        const r = await t.destroy(await jsonOf(need('audit-close')), need('confirm'));
        report({ attestation: r.attestationPath, backups_removed: r.backupsRemoved, backups_missing: r.backupsMissing, reminders: r.reminders });
        return 0;
      }
      case 'report-compromise': {
        const t = await open();
        const sev = need('severity');
        if (sev !== 'suspected' && sev !== 'confirmed') throw new TrusteeError('USAGE', 'USAGE', 'severity');
        await emit(await t.reportCompromise(sev, ['share', 'bundle+passphrase', 'sign-key']));
        return 0;
      }
      case 'export-transcript': {
        const t = await open();
        const tr = await t.exportTranscript(transcriptMode(o.get('mode')), { network: 'offline' });
        await atomicWrite(need('out'), utf8(JSON.stringify(tr)), 0o644);
        report({ summary_hash: tr.summary_hash, out: need('out') });
        return 0;
      }
      case 'cosign-transcript': {
        const t = await open();
        const tr = await t.cosignTranscript((await jsonOf(need('in'))) as Transcript);
        await atomicWrite(need('out'), utf8(JSON.stringify(tr)), 0o644);
        report({ signatures: tr.signatures.length });
        return 0;
      }
      case 'verify-transcript': {
        const r = await verifyTranscript(await jsonOf(need('in')), { witnessKeys: witnessKeys(o.get('witness-key')) });
        report({ ...r });
        return r.ok ? 0 : 20;
      }
      default:
        io.err(USAGE);
        return cmd === '' || cmd === 'help' ? 0 : 2;
    }
  } catch (e) {
    if (e instanceof TrusteeError) {
      io.err(json ? JSON.stringify({ ok: false, code: e.code, kind: e.kind, message: e.message }) : `error ${e.code}: ${e.message}`);
      return e.exitCode;
    }
    throw e;
  }
}

void OVERRIDE_UNWITNESSED; void OVERRIDE_NO_LEDGER; void bytesToHex;

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createInterface } = await import('node:readline');
  const io: CliIo = {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    promptSecret: (q) =>
      new Promise((res) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
        const w = rl as unknown as { _writeToOutput: (s: string) => void };
        process.stderr.write(q);
        w._writeToOutput = () => {};
        rl.question('', (a) => {
          rl.close();
          process.stderr.write('\n');
          res(a);
        });
      }),
  };
  process.exitCode = await main(process.argv.slice(2), io, { rng: systemRng, now: () => new Date() }, process.env);
}
