// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline, local-only recovery. Sources are operator-owned immutable directories, never live server directories.
import { createHash } from 'node:crypto';
import { constants, closeSync, copyFileSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { bytesToHex, ed25519Keypair, hexToBytes, parseQvJson } from '@quietvote/crypto';
import { authorKeyId, b64u, checkEntry, type EntryHeader } from '@quietvote/board';
import { organizerPk } from './export.ts';
import { auditLog } from './admin.ts';
import { resolveConfig } from './config.ts';
import { ControlDb, MIGRATIONS as CONTROL_MIGRATIONS, type RegistryRow } from './controldb.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS } from './electiondb.ts';
import { openDb } from './db.ts';
import { DATA_LOCK_NAME, lockDataDirectory } from './data-lock.ts';
import { ElectionRuntime, SERVER_VERSION } from './election.ts';
import type { Env } from './env.ts';
import { open as unseal } from './kek.ts';
import { Logger } from './logger.ts';
import { FailureCounter, RateLimiter } from './ratelimit.ts';
import { controlSecurityFloor, inviteSecurityFloor, operationReceiptSecurityFloor, pinnedRollSecurityFloor, preservesSecurityFloor, type BackupSecurityFloor } from './backup-security-floor.ts';

export class BackupError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
function fail(code: string): never { throw new BackupError(code); }
interface FileRecord { name: string; bytes: number; sha256: string }
interface Manifest { files: FileRecord[] }
export interface BackupReport {
  instance_id: string;
  files: number;
  authenticated_envelopes: number;
  deleted_elections: string[];
  elections: { election_id: string; origin: string; log_pk: string; tree_size: number; root: string }[];
}
const equal = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('BACKUP_MANIFEST');
  return v as Record<string, unknown>;
}
function regular(path: string, max: number): number {
  const st = lstatSync(path);
  if (!st.isFile() || st.size > max || st.nlink !== 1) fail('BACKUP_FILE');
  return st.size;
}
function digest(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) fail('BACKUP_FILE');
    const hash = createHash('sha256');
    const block = Buffer.alloc(65536);
    for (;;) {
      const n = readSync(fd, block, 0, block.length, null);
      if (n === 0) return hash.digest('hex');
      hash.update(block.subarray(0, n));
    }
  } finally { closeSync(fd); }
}
function keyFile(path: string): Buffer {
  if (regular(path, 32) !== 32) fail('BACKUP_KEK');
  if (process.platform !== 'win32' && (lstatSync(path).mode & 0o077) !== 0) fail('BACKUP_KEK_PERMISSIONS');
  return readFileSync(path);
}
function manifest(dir: string): Manifest {
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) fail('BACKUP_DIRECTORY');
  const path = join(dir, 'manifest.json');
  regular(path, 1048576);
  const m = object(parseQvJson(readFileSync(path)));
  if (m['format'] !== 'qv-backup/v1' || m['scope'] !== 'all' || !Array.isArray(m['files']) ||
      m['files'].length === 0 || m['files'].length > 10001) fail('BACKUP_MANIFEST');
  const files: FileRecord[] = [];
  const names = new Set<string>();
  let total = 0;
  for (const item of m['files']) {
    const f = object(item);
    if (Object.keys(f).sort().join(',') !== 'bytes,name,sha256' || typeof f['name'] !== 'string' ||
        !/^(control\.sqlite|elections-[0-9a-f]{32}\.sqlite)$/.test(f['name']) || names.has(f['name']) ||
        typeof f['bytes'] !== 'number' || !Number.isSafeInteger(f['bytes']) || f['bytes'] < 1 || f['bytes'] > 16 * 1024 ** 3 ||
        typeof f['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(f['sha256'])) fail('BACKUP_MANIFEST');
    names.add(f['name']); total += f['bytes'];
    if (total > 64 * 1024 ** 3) fail('BACKUP_LIMIT');
    files.push({ name: f['name'], bytes: f['bytes'], sha256: f['sha256'] });
  }
  const actual = readdirSync(dir);
  for (const name of actual) {
    if (name === 'manifest.json' || names.has(name)) continue;
    // Older v1 producers left an empty WAL and a disposable SHM after their read-only check.
    // Never replay an unmanifested WAL; only these inert regular sidecars may be ignored.
    if (name.endsWith('-wal') && names.has(name.slice(0, -4))) {
      if (regular(join(dir, name), 0) !== 0) fail('BACKUP_MEMBERS');
    } else if (name.endsWith('-shm') && names.has(name.slice(0, -4))) regular(join(dir, name), 32768);
    else fail('BACKUP_MEMBERS');
  }
  if (!names.has('control.sqlite') || [...names].some((name) => !actual.includes(name))) fail('BACKUP_MEMBERS');
  return { files };
}
function copyChecked(dir: string, file: FileRecord, destination: string): void {
  const source = join(dir, file.name);
  if (regular(source, file.bytes) !== file.bytes || digest(source) !== file.sha256) fail('BACKUP_CHECKSUM');
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  chmodSync(destination, 0o600);
  if (digest(destination) !== file.sha256) fail('BACKUP_CHECKSUM');
}
function databaseCheck(path: string, applicationId: number): void {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    const id = db.prepare('PRAGMA application_id').get();
    if (id?.['application_id'] !== applicationId || db.prepare('PRAGMA integrity_check').all().some((r) => r['integrity_check'] !== 'ok') ||
        db.prepare('PRAGMA foreign_key_check').all().length !== 0) fail('BACKUP_DATABASE');
  } finally { db.close(); }
}
function restoredPath(name: string): string {
  return name === 'control.sqlite' ? name : join('elections', name.slice(10, 12), name.slice(10));
}
function pathOf(reg: RegistryRow): string {
  if (!/^[0-9a-f]{32}$/.test(reg.election_id) || reg.db_path !== join('elections', reg.election_id.slice(0, 2), `${reg.election_id}.sqlite`)) fail('BACKUP_REGISTRY');
  return `elections-${reg.election_id}.sqlite`;
}

/** The caller owns this new private directory; never apply these overrides to the supplied source. */
function upgradePrivateCopy(directory: string, manifest: Manifest): void {
  for (const file of manifest.files) {
    const control = file.name === 'control.sqlite';
    const db = openDb({ path: join(directory, restoredPath(file.name)), applicationId: control ? 0x51564343 : 0x51564442,
      synchronous: 'FULL', migrations: control ? CONTROL_MIGRATIONS : ELECTION_MIGRATIONS, appVersion: SERVER_VERSION,
      forceMigrateOpen: true, allowArchiveMigration: true });
    db.close();
  }
}

/** The current server author roles, applied to history; revoked organizer keys remain valid for past signatures. */
function checkAuthors(rt: ElectionRuntime): void {
  const coords = new Map((rt.st.manifest?.coordinator.keys ?? []).map((hex) => {
    const pk = hexToBytes(hex, 32); return [b64u(authorKeyId('ed25519', pk)), pk];
  }));
  const trustees = new Map((rt.st.manifest?.trustees ?? []).map((t) => {
    const pk = hexToBytes(t.sign_pk, 32); return [b64u(authorKeyId('ed25519', pk)), pk];
  }));
  const organizer = organizerPk(rt);
  const resolveAuthor = (h: EntryHeader): Uint8Array | undefined => {
    const kid = b64u(h.author);
    switch (h.type) {
      case 'manifest': {
        if (rt.imported) return organizer;
        const k = rt.env.control.keyAnyById(kid);
        return k && k.org_id === rt.orgId && k.role !== 'instance_admin' ? new Uint8Array(k.pk) : undefined;
      }
      case 'ceremony_start': case 'joint_key': case 'roll_commit': case 'election_open': case 'election_close': case 'notice':
      case 'tally_result': case 'audit_close': case 'election_cancel': case 'ceremony_abort': return coords.get(kid);
      case 'dkg_round1': case 'dkg_round2': case 'dkg_complaint': case 'key_confirm': case 'decryption_share': return trustees.get(kid);
      case 'ballot': case 'ballot_audit': {
        const voter = rt.edb.voter(kid);
        return voter && (voter.status === 'approved' || voter.status === 'committed') ? new Uint8Array(voter.pk) : undefined;
      }
      case 'tally_aggregate': return rt.srvPk;
      default: return undefined;
    }
  };
  for (let i = 0; i < rt.log.size; i++) {
    const entry = rt.edb.store.getEntry(i);
    if (!entry || entry.body === null || !checkEntry(entry.headerBytes, entry.body, rt.origin, resolveAuthor, i).ok) fail('BACKUP_SIGNATURE');
  }
}

/** Verify private copies with the shipped startup replay and self-audit; no listeners, jobs, webhooks or gossip are started. */
export async function verifyBackup(directory: string, kekPath: string, minimum?: BackupReport): Promise<BackupReport> {
  const kek = keyFile(kekPath);
  try { return (await verifyCopy(resolve(directory), kek, manifest(resolve(directory)), minimum ? { report: minimum } : undefined)).report; }
  finally { kek.fill(0); }
}
interface VerifiedBackup { report: BackupReport; security?: BackupSecurityFloor }
async function verifyCopy(dir: string, kek: Buffer, m: Manifest, floor?: VerifiedBackup, captureSecurity = false): Promise<VerifiedBackup> {
  const minimum = floor?.report;
  const temp = mkdtempSync(join(tmpdir(), 'qv-backup-check-'));
  let control: ControlDb | undefined;
  try {
    mkdirSync(join(temp, 'elections'), { mode: 0o700 });
    for (const f of m.files) {
      const dest = join(temp, restoredPath(f.name));
      mkdirSync(join(dest, '..'), { recursive: true, mode: 0o700 });
      copyChecked(dir, f, dest);
      databaseCheck(dest, f.name === 'control.sqlite' ? 0x51564343 : 0x51564442);
    }
    // Verification is an explicit offline operation on disposable copies, including OPEN and archived
    // snapshots. Strict schema/invariant/backup checks still apply; automatic live-startup policy does not.
    upgradePrivateCopy(temp, m);
    control = new ControlDb(temp, Date.now, SERVER_VERSION);
    const security = captureSecurity || floor?.security ? controlSecurityFloor(control.db) : undefined;
    const registry = control.db.prepare('SELECT * FROM election_registry ORDER BY election_id').all() as unknown as RegistryRow[];
    // Tombstones can drive resumable cleanup at startup too; never trust their paths.
    for (const reg of registry) pathOf(reg);
    const rows = registry.filter((reg) => reg.state !== 'DELETED');
    const deleted = registry.filter((reg) => reg.state === 'DELETED').map((reg) => reg.election_id);
    const deletedIds = new Set(deleted);
    if (minimum?.deleted_elections.some((id) => !deletedIds.has(id))) fail('BACKUP_ROLLBACK');
    if (rows.length + 1 !== m.files.length) fail('BACKUP_REGISTRY');
    const names = new Set(m.files.map((f) => f.name));
    for (const reg of rows) if (!names.has(pathOf(reg))) fail('BACKUP_REGISTRY');
    const cfg = resolveConfig({ dataDir: temp, registrationMode: 'closed', minFreeBytes: 0 });
    const env: Env = {
      cfg, control, kek, limiter: new RateLimiter(Date.now), failures: new FailureCounter(Date.now), logger: new Logger(() => {}, Date.now),
      stats: { proofVerifications: 0, requests: 0, appended: 0, importVerifications: 0 }, inflight: { n: 0 },
      nowMs: Date.now, nowSec: () => Math.floor(Date.now() / 1000), witnessPolicy: (quorum) => ({ witnesses: [], quorum, noneAcknowledged: quorum === 0 }),
    };
    const report: BackupReport = { instance_id: control.instanceId(), files: m.files.length, authenticated_envelopes: 0, deleted_elections: deleted, elections: [] };
    if (minimum && minimum.instance_id !== report.instance_id) fail('BACKUP_INSTANCE');
    for (const hook of control.db.prepare('SELECT webhook_id,url_enc,secret_enc FROM webhook').all()) {
      for (const field of ['url', 'secret']) {
        const plaintext = unseal(kek, hook[`${field}_enc`] as Uint8Array, `webhook:${hook['webhook_id']}:${field}`);
        plaintext.fill(0); report.authenticated_envelopes++;
      }
    }
    for (const reg of rows) {
      if (reg.quarantine !== null) fail('BACKUP_QUARANTINE');
      const rt = await ElectionRuntime.open(env, reg);
      try {
        security?.invites.set(reg.election_id, inviteSecurityFloor(rt.edb.db));
        security?.operationReceipts.set(reg.election_id, operationReceiptSecurityFloor(rt.edb.db));
        if (security) {
          const pinned = pinnedRollSecurityFloor(rt.edb.db);
          if (pinned) security.pinnedRolls.set(reg.election_id, pinned);
        }
        const row = rt.edb.row();
        security?.registrationSchemes.set(reg.election_id, row.registration_scheme);
        checkAuthors(rt);
        if (row.org_id !== reg.org_id || row.imported !== reg.imported || rt.quarantineReason() !== undefined || rt.edb.hasKeyEvidence() ||
            rt.log.size < rt.edb.maxEvidenceSize() || !(await auditLog(rt)).ok) fail('BACKUP_INTEGRITY');
        if (reg.dek_wrapped !== null) {
          const dek = unseal(kek, reg.dek_wrapped, `dek:${reg.election_id}`);
          try {
            report.authenticated_envelopes++;
            for (const [sealed, pk, aad] of [[row.log_sk_enc, row.log_pk, 'log_sk'], [row.srv_sk_enc, row.srv_pk, 'srv_sk']] as const) {
              if (sealed === null) continue;
              const sk = unseal(dek, sealed, aad);
              try { if (!equal(ed25519Keypair(sk).publicKey, pk)) fail('BACKUP_KEYS'); }
              finally { sk.fill(0); }
              report.authenticated_envelopes++;
            }
            for (const invite of rt.edb.db.prepare('SELECT label_enc,contact_enc FROM voter_invite').all()) {
              for (const field of ['label', 'contact']) {
                if (invite[`${field}_enc`] === null) continue;
                const plaintext = unseal(dek, invite[`${field}_enc`] as Uint8Array, field);
                plaintext.fill(0); report.authenticated_envelopes++;
              }
            }
          } finally { dek.fill(0); }
        } else if (row.log_sk_enc !== null || row.srv_sk_enc !== null) fail('BACKUP_KEYS');
        const prior = minimum?.elections.find((e) => e.election_id === reg.election_id);
        if (prior && (prior.origin !== row.origin || prior.log_pk !== bytesToHex(row.log_pk) || prior.tree_size > rt.log.size ||
            prior.root !== bytesToHex(rt.log.root(prior.tree_size)))) fail('BACKUP_ROLLBACK');
        report.elections.push({ election_id: reg.election_id, origin: row.origin, log_pk: bytesToHex(row.log_pk), tree_size: rt.log.size, root: bytesToHex(rt.log.root()) });
      } finally { rt.close(); }
    }
    if (minimum?.elections.some((e) => !report.elections.some((r) => r.election_id === e.election_id))) fail('BACKUP_ROLLBACK');
    if (floor?.security && (!security || !preservesSecurityFloor(security, floor.security, Date.now()))) fail('BACKUP_SECURITY_ROLLBACK');
    return { report, ...(security ? { security } : {}) };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('BACKUP_VERIFY'); // Never echo SQLite errors, decoded data, paths or authentication exceptions.
  } finally { control?.close(); rmSync(temp, { recursive: true, force: true }); }
}

/** Destination must not exist, even as an empty directory or a dangling symlink. A failed copy is removed. */
export async function restoreBackup(directory: string, kekPath: string, destination: string, minimumDirectory: string): Promise<BackupReport> {
  // Hold the same KEK and manifests through verification and copying. Replacing a source manifest/key
  // between awaits cannot substitute bytes that were not checked.
  const kek = keyFile(kekPath);
  try {
    const dir = resolve(directory);
    const m = manifest(dir);
    const floorDir = resolve(minimumDirectory);
    const floor = await verifyCopy(floorDir, kek, manifest(floorDir), undefined, true);
    const { report } = await verifyCopy(dir, kek, m, floor);
    const target = resolve(destination);
    // mkdir is the atomic no-clobber reservation. No recursive mkdir and no rename over a target.
    mkdirSync(target, { mode: 0o700 });
    // If another process wins this lock, leave its directory alone.
    const lock = lockDataDirectory(target);
    let complete = false;
    try {
      mkdirSync(join(target, 'elections'), { mode: 0o700 });
      mkdirSync(join(target, 'kek'), { mode: 0o700 });
      for (const f of m.files) {
        const dest = join(target, restoredPath(f.name));
        mkdirSync(join(dest, '..'), { recursive: true, mode: 0o700 });
        copyChecked(dir, f, dest);
      }
      writeFileSync(join(target, 'kek', 'kek.bin'), kek, { mode: 0o600, flag: 'wx' });
      // The destination was reserved above and remains locked/offline. Restore current schemas so its
      // subsequent ordinary startup does not need a voting override or an implicit archive upgrade.
      upgradePrivateCopy(target, m);
      const control = new ControlDb(target, Date.now, SERVER_VERSION);
      try { control.audit('offline-operator', 'restore', null, { files: report.files }); }
      finally { control.close(); }
      complete = true;
      return report;
    } finally {
      if (!complete) {
        // Clean only while we own the volume. Never release and then recursively remove a directory
        // another server could have acquired. Final rmdir is empty-only and may safely lose a race.
        for (const name of readdirSync(target)) if (name !== DATA_LOCK_NAME) rmSync(join(target, name), { recursive: true, force: true });
      }
      lock.release();
      if (!complete) { try { rmdirSync(target); } catch { /* a new owner may have acquired it */ } }
    }
  } finally { kek.fill(0); }
}

export const BACKUP_USAGE = `Usage: qv-backup verify --backup DIR --kek-file FILE
       qv-backup restore --backup DIR --kek-file FILE --minimum-backup DIR --destination NEW_DIR
       qv-backup --help
`;
export async function backupMain(args: string[], out: (text: string) => void, err: (text: string) => void): Promise<number> {
  if (args.length === 1 && args[0] === '--help') { out(BACKUP_USAGE); return 0; }
  const cmd = args[0];
  const allowed = cmd === 'verify' ? ['--backup', '--kek-file'] : cmd === 'restore' ? ['--backup', '--kek-file', '--minimum-backup', '--destination'] : [];
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const name = args[i]!; const value = args[i + 1];
    if (!allowed.includes(name) || values.has(name) || !value || value.startsWith('-')) { err(BACKUP_USAGE); return 2; }
    values.set(name, value);
  }
  if (allowed.length === 0 || values.size !== allowed.length) { err(BACKUP_USAGE); return 2; }
  try {
    const report = cmd === 'verify' ? await verifyBackup(values.get('--backup')!, values.get('--kek-file')!) :
      await restoreBackup(values.get('--backup')!, values.get('--kek-file')!, values.get('--destination')!, values.get('--minimum-backup')!);
    out(JSON.stringify(report) + '\n'); return 0;
  } catch (error) { err(`qv-backup: ${error instanceof BackupError ? error.code : 'BACKUP_IO'}\n`); return 1; }
}
