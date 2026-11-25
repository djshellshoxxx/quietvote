// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only comparison of an unsigned proposal with a pinned pre-publication archive.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { bytesToHex, jcs, parseQvJson, sha256 } from '@quietvote/crypto';
import { verifyTallyDraft } from '@quietvote/protocol';
import { InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { pinnedHash, printJson } from './common.ts';
import { prepareElectionArchive } from './cmd-prepare.ts';
import { EXIT, type Io } from './io.ts';

function readDraft(path: string): unknown {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    // Same body-size boundary as the existing coordinator signing command.
    if (!stat.isFile() || stat.size > 1 << 20) throw new Error('size');
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) break;
      size += n;
    }
    if (size !== stat.size) throw new Error('changed');
    return parseQvJson(bytes.subarray(0, size));
  } catch { throw new InputError('draft must be a stable regular QV-JSON file of at most 1 MiB'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export async function cmdElectionCheckTally(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'manifest-hash': 'value', draft: 'value', 'content-only': 'bool', json: 'bool' });
  const [path] = needPositional(p, 1, 'election check-tally <archive.qvb>');
  const pin = pinnedHash(p), draftPath = needFlag(p, 'draft');
  if (pin === undefined) throw new UsageError('check-tally requires an independently obtained --manifest-hash');
  const body = readDraft(draftPath);
  const { content, board, serverKey, snapshot } = prepareElectionArchive(path!, pin);
  const report = await verifyTallyDraft(content, body, {
    log: { board, extraAuthorKeys: [serverKey] }, allowNoLog: p.has('content-only'),
  });
  const result = { ...report, manifest_hash: pin, draft_body_sha256: bytesToHex(sha256(jcs(body))), snapshot };
  if (p.has('json')) printJson(io, result);
  else {
    io.out(`tally draft ${report.verdict}; body matches supplied snapshot: ${report.bodyMatchesSnapshot}\n`);
    io.out(`manifest: ${pin}\ndraft body SHA-256: ${result.draft_body_sha256}\n`);
    io.out(`snapshot: ${snapshot.origin}; size ${snapshot.tree_size}; root ${snapshot.root_hash}\n`);
    io.out(`board: ${report.checks['chk.board.append_only']}; witnesses: ${report.checks['chk.board.witness']}\n`);
    io.out('unsigned proposal; publication and freshness remain unchecked\n');
    for (const warning of report.warnings) io.out(`warning: ${warning}\n`);
    for (const caveat of report.caveats) io.out(`caveat: ${caveat}\n`);
    for (const finding of report.findings) io.out(`${finding.code} (${finding.cls}): ${finding.detail}\n`);
  }
  return report.verdict === 'MATCH' ? EXIT.ok : report.verdict === 'FAIL' ? EXIT.fail : EXIT.incomplete;
}
