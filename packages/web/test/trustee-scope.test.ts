// QV-ADR-027 N-37c (with QV-ADR-024): trustees are CLI-only. The web client may verify public DKG/tally records, post organizer
// markers and relay records a trustee already signed with `qv-trustee`; it must never produce trustee material (dealings, shares,
// complaints, key confirmations, partial decryptions). These source checks keep that boundary from drifting.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url).pathname;

/** Protocol functions that need a trustee secret (or create the secret). Combiners and verifiers stay allowed. */
export const TRUSTEE_PRODUCERS = [
  'dkgDeal', 'dkgMakeShares', 'dkgReceiveShare', 'dkgMakeComplaint', 'dkgFinalShare', 'dkgKeyconf',
  'trusteeDecryptTally', 'trusteeDecryptSpoiled',
] as const;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Returns why `src` crosses the trustee boundary, or [] when it does not. */
export function trusteeViolations(src: string): string[] {
  const out: string[] = [];
  if (/from\s+['"](?:@quietvote\/(?:trustee|cli)|[./]*\/(?:trustee|cli)\/src\/[^'"]*)['"]|import\(\s*['"]@quietvote\/(?:trustee|cli)['"]/.test(src)) out.push('imports the trustee/CLI package');
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!/@quietvote\/protocol|\/protocol\/src\//.test(m[2]!)) continue;
    for (const name of m[1]!.split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!)) {
      if ((TRUSTEE_PRODUCERS as readonly string[]).includes(name)) out.push(`imports ${name}`);
    }
  }
  if (/import\s*\*\s*as\s+\w+\s+from\s*['"]@quietvote\/protocol['"]/.test(src)) out.push('namespace import of the protocol (cannot be checked by name)');
  return out;
}

test('N-37c: no web source imports the trustee/CLI packages or a trustee-secret protocol function', () => {
  const all = files(SRC);
  assert.ok(all.length > 20, 'scanned the web sources');
  for (const f of all) assert.deepEqual(trusteeViolations(readFileSync(f, 'utf8')), [], f.slice(SRC.length));
});

test('N-37c negative: the scan catches each forbidden import form', () => {
  assert.deepEqual(trusteeViolations(`import { dkgDeal, verifyKeyconf } from '@quietvote/protocol';`), ['imports dkgDeal']);
  assert.deepEqual(trusteeViolations(`import {\n  check,\n  trusteeDecryptTally as td,\n} from '../../protocol/src/tally.ts';`), ['imports trusteeDecryptTally']);
  assert.deepEqual(trusteeViolations(`import { runCeremony } from '@quietvote/trustee';`), ['imports the trustee/CLI package']);
  assert.deepEqual(trusteeViolations(`import { x } from '../../trustee/src/trustee.ts';`), ['imports the trustee/CLI package']);
  assert.deepEqual(trusteeViolations(`const m = await import('@quietvote/cli');`), ['imports the trustee/CLI package']);
  assert.deepEqual(trusteeViolations(`import * as P from '@quietvote/protocol';`), ['namespace import of the protocol (cannot be checked by name)']);
  for (const p of TRUSTEE_PRODUCERS) assert.equal(trusteeViolations(`import { ${p} } from '@quietvote/protocol';`).length, 1, p);
  assert.deepEqual(trusteeViolations(`import { adjudicateDkg, verifyKeyconf, decryptAggregates } from '@quietvote/protocol';`), [], 'verifiers and combiners stay allowed');
});

/** Record bodies only a trustee signs. Organizer/coordinator `marker` records stay allowed (N-37c keeps marker wiring open). */
const TRUSTEE_RECORD = /type:\s*'(dkg-commit|dkg-dealing|dkg-shares|dkg-complaint|dkg-keyconf|spoil-share)'/;

test('N-37c: the web builds no trustee-signed record and relays trustee spoil shares exactly as received', () => {
  for (const f of files(SRC)) assert.ok(!TRUSTEE_RECORD.test(readFileSync(f, 'utf8')), `${f.slice(SRC.length)} builds a trustee record body`);
  assert.ok(TRUSTEE_RECORD.test(`const b = { proto: PROTO_ID, type: 'dkg-keyconf', j: 1 };`), 'negative control: the pattern catches a trustee body');
  assert.ok(!TRUSTEE_RECORD.test(`const marker = { proto: PROTO_ID, type: 'marker', name: 'dkg-open' };`), 'organizer markers stay allowed');
  const client = readFileSync(join(SRC, 'api/client.ts'), 'utf8');
  assert.match(client, /async postSpoilShare\(id: string, record: unknown\)[^{]*\{\s*return this\.json\(await this\.req\('POST', `\$\{API\}\/elections\/\$\{enc\(id\)\}\/spoil-shares`, \{ body: record \}\)\);/);
  const route = readFileSync(join(SRC, 'ui/route.ts'), 'utf8');
  assert.ok(!/trustee/i.test(route), 'no trustee route in the web client');
});
