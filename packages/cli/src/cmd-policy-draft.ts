import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { jcs, parseQvJson } from '@quietvote/crypto';
import { GROUP_POLICY_TEMPLATES, groupPolicyTemplate, validateGroupPolicyDraft, type GroupPolicyTemplate } from '@quietvote/protocol';
import { InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';
import { writePrivateFileSync } from './private-files.ts';

function readDraft(path: string): unknown {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('draft must be a regular file of at most 128 KiB');
    const bytes = Buffer.alloc(stat.size + 1);
    let n = 0;
    while (n < bytes.length) {
      const got = readSync(fd, bytes, n, bytes.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n !== stat.size) throw new Error('draft changed while reading');
    return parseQvJson(bytes.subarray(0, n));
  } catch (e) { throw new InputError(`cannot read policy draft: ${e instanceof Error ? e.message : 'invalid input'}`); }
  finally { if (fd !== undefined) closeSync(fd); }
}

function show(io: Io, json: boolean, input: unknown): number {
  const report = validateGroupPolicyDraft(input);
  if (json) printJson(io, report);
  else {
    // Unknown object keys become diagnostic pointers. Render their controls and
    // bidi/format marks visibly instead of letting untrusted drafts alter a TTY.
    const terminal = (value: string) => value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu,
      (character) => `\\u{${character.codePointAt(0)!.toString(16)}}`);
    io.out(`${report.valid ? 'Valid' : 'Invalid'} unsigned policy draft; no signed rules or election authority verified.\n`);
    for (const e of report.errors) io.out(`${e.code} ${terminal(e.path || '/')}: ${terminal(e.message)}\n`);
    for (const w of report.warnings) io.out(`${w.code} ${w.path}: ${w.message}\n`);
    if (report.effective_min_review_hours !== undefined) io.out(`Selected class minimums: review ${report.effective_min_review_hours} hours; voting ${report.effective_min_voting_hours} hours.\n`);
    io.out(`Still required: ${report.required_configuration.join('; ')}.\n`);
  }
  return report.valid ? EXIT.ok : EXIT.fail;
}

export async function cmdPolicyDraftValidate(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { json: 'bool' });
  const [path] = needPositional(p, 1, 'policy-draft validate <draft.json>');
  return show(io, p.has('json'), readDraft(path!));
}

export async function cmdPolicyDraftTemplate(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { out: 'value', json: 'bool' });
  const [name] = needPositional(p, 1, 'policy-draft template foundation|association|collective --out <draft.json>');
  if (!(GROUP_POLICY_TEMPLATES as readonly string[]).includes(name!)) throw new UsageError('template must be foundation, association or collective');
  const path = needFlag(p, 'out');
  const draft = groupPolicyTemplate(name as GroupPolicyTemplate);
  try { writePrivateFileSync(path, new Uint8Array([...jcs(draft), 10])); }
  catch { throw new InputError('cannot create policy draft; destination must not exist'); }
  // The literal collective template is deliberately emitted for inspection even
  // when its inherited duration conflict makes validation return exit 1.
  return show(io, p.has('json'), draft);
}
