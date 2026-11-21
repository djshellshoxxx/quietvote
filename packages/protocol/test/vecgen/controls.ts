// Additions to the shared mutation corpus for the approved B2-05 counter contract.
import assert from 'node:assert/strict';
import { manifestHash, signRecordRaw, verifyElection, type ElectionBundle } from '../../src/index.ts';
import { kp } from '../helpers/sim.ts';

export async function generateControlSequences(put: (path: string, value: unknown) => void, base: ElectionBundle): Promise<void> {
  const coord = kp('vec-tiny', 'coord'), mh = manifestHash(base.manifest.body);
  const cases: [string, (number | undefined)[]][] = [
    ['control-first-counter-future', [2]],
    ['control-counter-replay', [1, 1]],
    ['control-counter-gap', [1, 3]],
    ['control-counter-downgrade', [1, undefined]],
    ['control-counter-older-replay', [1, 2, 1]],
  ];
  for (const [id, counters] of cases) {
    const bundle = structuredClone(base);
    for (const control_seq of counters) {
      const body = { proto: 'qv1-r255-sha2', type: 'control', action: 'security-notice',
        ...(control_seq === undefined ? {} : { control_seq }) };
      const entry = { body, sigs: [signRecordRaw(coord.secretKey, coord.publicKey, mh, 'control', body)] };
      bundle.log.push({ seq: bundle.log.at(-1)!.seq + 1, entry });
    }
    const expected = { verdict: 'FAIL', failed_checks: ['chk.time.window'], codes: ['E_LOG_ORDER'] };
    const actual = await verifyElection(bundle, { allowNoLog: true });
    assert.equal(actual.verdict, expected.verdict, id);
    assert.deepEqual(Object.entries(actual.checks).filter(([, status]) => status === 'fail').map(([check]) => check).sort(), expected.failed_checks, id);
    assert.ok(actual.findings.some((finding) => finding.code === 'E_LOG_ORDER' && finding.cls === 'F'), id);
    assert.equal(actual.results, undefined, id);
    put(`mutations/${id}.json`, { id, base: 'elections/tiny-yesno-3v/bundle.json', expect: expected, bundle });
  }
}
