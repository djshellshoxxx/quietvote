#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseQvJson, systemRng, hexToBytes, bytesToHex, pointFromBytes, type Rng } from '@quietvote/crypto';
import type { Aggregate, Manifest, MultiSignedRecord } from '@quietvote/protocol';
import { TrusteeError } from './errors.ts';
import { assertPassphraseStrength, generatePassphrase } from './passphrase.ts';
import { OVERRIDE_UNWITNESSED, Trustee, type Packet } from './trustee.ts';
import { verifyTranscript, type Transcript } from './transcript.ts';
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
  commit|reveal|shares|verify|finalize|drill --bundle F [--out F.qvp]
  confirm --bundle F --compared-with 2,3 [--words "w1 .. w6"] [--out F]
  tally-release --bundle F --election F.json [--claimed F] [--override-unwitnessed PHRASE] [--out F]
  status --bundle F | abort --bundle F --reason T | restart --bundle F
  backup --bundle F --to F2 [--backup-passphrase-file F] | restore --from F2 --bundle F [--backup-passphrase-file F]
  destroy --bundle F --audit-close F --confirm "<election title>"
  report-compromise --bundle F --severity suspected|confirmed [--out F]
  export-transcript --bundle F --out F [--mode airgap-dkg] | cosign-transcript --bundle F --in F --out F | verify-transcript --in F [--witness-key NAME=HEX]
Passphrase: --passphrase-file F (or QV_TRUSTEE_PASSPHRASE_FILE), otherwise a hidden prompt. Never on the command line.
Options: --json   Exit codes: 0 ok, 10 declined, 20 verification failed, 40 state conflict, 50 locked, 60 refused for safety.`;

function parseArgs(argv: string[]): { cmd: string; o: Map<string, string>; flags: Set<string> } {
  const [cmd = '', ...rest] = argv;
  const o = new Map<string, string>();
  const flags = new Set<string>();
  const bool = new Set(['json', 'generate-passphrase']);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) throw new TrusteeError('USAGE', 'USAGE', `unexpected argument ${a}`);
    const k = a.slice(2);
    if (bool.has(k)) flags.add(k);
    else {
      const v = rest[++i];
      if (v === undefined) throw new TrusteeError('USAGE', 'USAGE', `--${k} needs a value`);
      o.set(k, v);
    }
  }
  return { cmd, o, flags };
}

const bytesOf = async (p: string): Promise<Uint8Array> => new Uint8Array(await readFile(p));
const jsonOf = async (p: string): Promise<unknown> => parseQvJson(await bytesOf(p));

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
      return f !== undefined ? (await readFile(f, 'utf8')).replace(/\r?\n$/, '') : io.promptSecret(q);
    };
    const mainPass = (): Promise<string> => pass('passphrase-file', 'QV_TRUSTEE_PASSPHRASE_FILE', 'Bundle passphrase: ');
    const open = async (): Promise<Trustee> => Trustee.open(need('bundle'), await mainPass(), vd);
    const emit = async (p: Packet, extra: Record<string, unknown> = {}): Promise<void> => {
      const out = o.get('out');
      if (out !== undefined) await writeFile(out, p.bytes, { mode: 0o644 });
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
          const c = (await jsonOf(need('claimed'))) as { contests: { id: string; options: { id: string; A: string; B: string }[] }[] };
          claimed = new Map(c.contests.map((x) => [x.id, new Map(x.options.map((y) => [y.id, { A: pointFromBytes(hexToBytes(y.A, 32)), B: pointFromBytes(hexToBytes(y.B, 32)) }]))]));
        }
        const ov = o.get('override-unwitnessed');
        await emit(await t.releaseTally(await jsonOf(need('election')), { ...(claimed === undefined ? {} : { claimed }), ...(ov === undefined ? {} : { override: ov }) }), { state: t.state });
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
        const t = await Trustee.restore(need('from'), bp, need('bundle'), np, vd);
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
        const tr = await t.exportTranscript((o.get('mode') ?? 'airgap-dkg') as 'airgap-dkg', { network: 'offline' });
        await writeFile(need('out'), JSON.stringify(tr));
        report({ summary_hash: tr.summary_hash, out: need('out') });
        return 0;
      }
      case 'cosign-transcript': {
        const t = await open();
        const tr = await t.cosignTranscript((await jsonOf(need('in'))) as Transcript);
        await writeFile(need('out'), JSON.stringify(tr));
        report({ signatures: tr.signatures.length });
        return 0;
      }
      case 'verify-transcript': {
        const witnessKeys: Record<string, string> = {};
        const wk = o.get('witness-key');
        if (wk !== undefined) witnessKeys[wk.split('=')[0]!] = wk.split('=')[1]!;
        const r = await verifyTranscript(await jsonOf(need('in')), { witnessKeys });
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

void OVERRIDE_UNWITNESSED; void bytesToHex;

if (import.meta.url === `file://${process.argv[1]}`) {
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
