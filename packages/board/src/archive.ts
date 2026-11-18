// Public archive framing and checksums only. Callers must still verify signatures and election bindings.
import { bytesToHex, sha256 } from '@quietvote/crypto';
import { readTarStrict } from './tar.ts';

export class ArchiveError extends Error {
  readonly rule: 'BUNDLE_TAR' | 'BUNDLE_FORMAT' | 'BUNDLE_CHECKSUM';
  constructor(rule: ArchiveError['rule'], message: string) { super(message); this.rule = rule; }
}

/** No filesystem extraction; every returned member is a view into the caller's bounded input. */
export function readChecksummedArchive(buf: Uint8Array, limits: { maxFiles: number }): Map<string, Uint8Array> {
  let files: Map<string, Uint8Array>;
  try { files = readTarStrict(buf, limits); }
  catch (e) { throw new ArchiveError('BUNDLE_TAR', e instanceof Error ? e.message : 'archive cannot be read'); }
  const sumsRaw = files.get('SHA256SUMS');
  if (!sumsRaw) throw new ArchiveError('BUNDLE_FORMAT', 'SHA256SUMS is missing');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(sumsRaw); }
  catch { throw new ArchiveError('BUNDLE_FORMAT', 'SHA256SUMS is not UTF-8'); }
  if (!text || !text.endsWith('\n')) throw new ArchiveError('BUNDLE_FORMAT', 'SHA256SUMS must end with a newline');
  const sums = new Map<string, string>();
  for (const line of text.slice(0, -1).split('\n')) {
    const m = /^([0-9a-f]{64}) {2}([A-Za-z0-9._/-]{1,100})$/.exec(line);
    if (!m || sums.has(m[2]!)) throw new ArchiveError('BUNDLE_FORMAT', 'SHA256SUMS has a malformed or duplicate line');
    sums.set(m[2]!, m[1]!);
  }
  for (const [name, data] of files) {
    if (name === 'SHA256SUMS') continue;
    const want = sums.get(name);
    if (want === undefined) throw new ArchiveError('BUNDLE_CHECKSUM', `file ${name} is not listed in SHA256SUMS`);
    if (bytesToHex(sha256(data)) !== want) throw new ArchiveError('BUNDLE_CHECKSUM', `checksum mismatch for ${name}`);
  }
  for (const name of sums.keys()) if (!files.has(name)) throw new ArchiveError('BUNDLE_CHECKSUM', `${name} is listed in SHA256SUMS but missing`);
  return files;
}
