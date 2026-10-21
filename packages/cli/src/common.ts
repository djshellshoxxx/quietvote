import { closeSync, constants as fsc, fchmodSync, openSync, readFileSync, writeSync } from 'node:fs';
import { bytesToHex, hexToBytes, pointFromBytes } from '@quietvote/crypto';
import { loadBundle, type LoadedBundle } from '@quietvote/verifier';
import { manifestHash, validateManifest, verifyElection, type ElectionParams, type Manifest, type VerificationReport } from '@quietvote/protocol';
import { FailError, InputError, UsageError, type Parsed } from './args.ts';
import type { Io } from './io.ts';

export function readFile(path: string): Uint8Array {
  try {
    return readFileSync(path);
  } catch (e) {
    throw new InputError(`cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`);
  }
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFile(path)));
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError(`${path} is not valid JSON`);
  }
}

export function loadBundleFile(path: string): LoadedBundle {
  const r = loadBundle(readFile(path));
  if (!r.ok) throw new InputError(`${path} is not an election bundle: ${r.errors.join('; ')}`);
  return r.value;
}

export const isHex = (s: unknown, bytes: number): s is string => typeof s === 'string' && s.length === bytes * 2 && /^[0-9a-f]+$/.test(s);

export interface ElectionContext {
  bundle: LoadedBundle;
  manifest: Manifest;
  params: ElectionParams;
  report: VerificationReport;
  rollSet: Set<string>;
}

/**
 * Derives (manifest, K, ctx) for a voter client by running the full protocol verification; refuses to hand out key
 * material unless the manifest and DKG verified (a voter must not encrypt to an unverified key).
 */
export async function electionContext(path: string, pinnedManifestHash?: string): Promise<ElectionContext> {
  const bundle = loadBundleFile(path);
  const report = await verifyElection(bundle.election);
  const c = report.checks;
  if (c['chk.manifest.hash'] !== 'pass' || c['chk.manifest.sig'] !== 'pass' || c['chk.keys.trustees'] !== 'pass' || report.ctx === undefined || report.jointKey === undefined) {
    throw new FailError(`election key material did not verify (${report.findings.filter((f) => f.cls === 'F').map((f) => f.code).join(', ') || 'incomplete DKG'}); refusing to use it`);
  }
  const mv = validateManifest(bundle.election.manifest.body, bundle.election.roll.length);
  if (!mv.ok) throw new FailError(`manifest invalid: ${mv.error}`);
  const manifest = mv.value.manifest;
  // The bundle is self-consistent by construction (an attacker can ship a whole fake election including its own trustees):
  // the only anchor is a manifest hash announced out of band.
  if (pinnedManifestHash !== undefined && bytesToHex(manifestHash(manifest)) !== pinnedManifestHash) {
    throw new FailError('manifest hash differs from --manifest-hash: this is not the announced election; refusing to use it');
  }
  const params: ElectionParams = {
    manifest, mh: manifestHash(manifest), K: pointFromBytes(hexToBytes(report.jointKey, 32), { nonIdentity: true }), ctx: hexToBytes(report.ctx, 32),
  };
  return { bundle, manifest, params, report, rollSet: new Set(bundle.election.roll) };
}

export const hex = bytesToHex;

/** Validates an optional `--manifest-hash` value (64 lower-case hex digits). */
export function pinnedHash(p: Parsed): string | undefined {
  const v = p.get('manifest-hash');
  if (v !== undefined && !isHex(v, 32)) throw new UsageError('--manifest-hash must be 64 lower-case hex digits');
  return v;
}

/**
 * Writes a secret file with mode 0600. Unlike writeFileSync's `mode`, which only applies when the file is created, the mode is
 * enforced on the open descriptor, so overwriting (--force) a pre-existing loose-permission file does not leak the secret.
 * Without `overwrite` the file must not exist (O_EXCL); with it, symlinks are refused (O_NOFOLLOW) so the secret cannot be redirected.
 */
export function writeSecretFile(path: string, data: string, overwrite: boolean): void {
  const flags = fsc.O_WRONLY | fsc.O_CREAT | (overwrite ? fsc.O_TRUNC | (fsc.O_NOFOLLOW ?? 0) : fsc.O_EXCL);
  const fd = openSync(path, flags, 0o600);
  try {
    try {
      fchmodSync(fd, 0o600);
    } catch (e) {
      if (process.platform !== 'win32') throw e;
    }
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

export function printJson(io: { out(s: string): void }, v: unknown): void {
  io.out(JSON.stringify(v, null, 2) + '\n');
}

export const PASSPHRASE_FLAGS = { 'passphrase-file': 'value', 'passphrase-stdin': 'bool' } as const;

/**
 * Passphrase from --passphrase-file (first line), --passphrase-stdin, or a hidden prompt; never from argv (QV-30 S12).
 * `stdinTaken` is true when stdin already carries a seed.
 */
export async function getPassphrase(p: Parsed, io: Io, label: string, confirm: boolean, stdinTaken: boolean): Promise<string | undefined> {
  if (p.has('passphrase-file') && p.has('passphrase-stdin')) throw new UsageError('use either --passphrase-file or --passphrase-stdin');
  const line = (b: Uint8Array): string => new TextDecoder().decode(b).split(/\r?\n/)[0] ?? '';
  if (p.has('passphrase-file')) return line(readFile(p.get('passphrase-file')!));
  if (p.has('passphrase-stdin')) {
    if (stdinTaken) throw new UsageError('stdin cannot carry both the seed and the passphrase');
    return line(await io.stdin());
  }
  const a = await io.prompt(label);
  if (a === undefined) return undefined;
  if (confirm && (await io.prompt('repeat passphrase: ')) !== a) throw new UsageError('passphrases differ');
  return a;
}
