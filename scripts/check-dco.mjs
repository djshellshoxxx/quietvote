// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-25-REQ-003 QV-30-REQ-019
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: node scripts/check-dco.mjs --base REF --head REF [--repo DIR] [--json]';
const SUBJECT = /^(?:feat|fix|perf|refactor|test|docs|build|ci|chore|revert)(?:\([^():\r\n]+\))?!?: \S.*$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const INSPECTION_ERROR = 'Unable to inspect the requested Git commit range.';

function git(repo, args, input) {
  try {
    return execFileSync('git', ['--no-pager', ...args], {
      cwd: repo, encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(INSPECTION_ERROR);
  }
}

function commitId(repo, ref) {
  const id = git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  if (!OID.test(id)) throw new Error(INSPECTION_ERROR);
  return id;
}

/** Inspect every commit reachable from head but not base, including merged branches. */
export function inspectRange({ repo = process.cwd(), base, head }) {
  const baseId = commitId(repo, base);
  const headId = commitId(repo, head);
  const range = git(repo, ['rev-list', '--topo-order', '--reverse', `${baseId}..${headId}`]).trim();
  const commits = [];
  for (const sha of range ? range.split('\n') : []) {
    if (!OID.test(sha)) throw new Error(INSPECTION_ERROR);
    const fields = git(repo, ['show', '--no-show-signature', '-s', '--encoding=UTF-8',
      '--format=%H%x00%an%x00%ae%x00%B', sha]).split('\0');
    if (fields.length !== 4 || fields[0] !== sha) throw new Error(INSPECTION_ERROR);
    const [, author, email, message] = fields;
    const subject = message.split('\n', 1)[0];
    const issues = [];
    if (!SUBJECT.test(subject) || /[\u0000-\u001f\u007f]/u.test(subject)) issues.push('SUBJECT_FORMAT');
    if ([...subject].length > 72) issues.push('SUBJECT_LENGTH');
    // This is raw commit text, not a patch email. A Markdown divider must not
    // truncate the body before Git identifies the final trailer block.
    const trailers = git(repo, ['-c', 'trailer.separators=:', 'interpret-trailers', '--parse', '--no-divider'], message);
    const signoffs = trailers.split('\n').flatMap(line => {
      const separator = line.indexOf(':');
      return separator >= 0 && line.slice(0, separator).toLowerCase() === 'signed-off-by'
        ? [line.slice(separator + 1).trim()] : [];
    });
    if (signoffs.length === 0) issues.push('DCO_MISSING');
    else if (!signoffs.includes(`${author} <${email}>`)) issues.push('DCO_AUTHOR_MISMATCH');
    // Reports deliberately omit author identities, message bodies and arbitrary Git errors.
    commits.push({ sha, issues });
  }
  return { format: 'qv-dco-report/v1', base: baseId, head: headId, commits };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') { process.stdout.write(`${USAGE}\n`); return 0; }
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!['--base', '--head', '--repo', '--json'].includes(option) || Object.hasOwn(options, option.slice(2))) {
      process.stderr.write(`${USAGE}\n`); return 2;
    }
    if (option === '--json') options.json = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('-')) { process.stderr.write(`${USAGE}\n`); return 2; }
      options[option.slice(2)] = value;
    }
  }
  if (!options.base || !options.head) { process.stderr.write(`${USAGE}\n`); return 2; }
  try {
    const report = inspectRange(options);
    const failures = report.commits.filter(commit => commit.issues.length > 0);
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      for (const commit of failures) process.stdout.write(`${commit.sha}: ${commit.issues.join(', ')}\n`);
      process.stdout.write(`DCO and commit format: ${report.commits.length - failures.length}/${report.commits.length} commits passed.\n`);
    }
    return failures.length > 0 ? 1 : 0;
  } catch {
    process.stderr.write(`${INSPECTION_ERROR}\n`); return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
