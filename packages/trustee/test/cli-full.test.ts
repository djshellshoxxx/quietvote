// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-016 QV-17-REQ-030 QV-17-REQ-040 QV-17-REQ-080
// All trustee operations use main(argv). The harness holds only coordinator/voter/log keys, never trustee keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MerkleTree, buildEntry, bundleToJson, signCheckpoint, type EntryType, type LogBundle } from '@quietvote/board';
import { bytesToHex, hexToBytes, jcs, pointToBytes, sha256, utf8 } from '@quietvote/crypto';
import { logOrigin, manifestHash, rollRoot, signRecordRaw, verifySig, type SignedRecord } from '@quietvote/protocol';
import { buildManifest, defaultContests } from '../../protocol/test/helpers/sim.ts';
import { main } from '../src/cli.ts';
import { verifyKeycheck, type KeycheckBody, type Packet } from '../src/index.ts';
import { BOARD_CREATED_AT, Ceremony, PASS, finishTally, mkDeps, verifyAll } from './helpers/harness.ts';

const H = bytesToHex;

test('main(argv) completes the entire 3-of-5 trustee ceremony, drill and tally using only public exchanges', { timeout: 180_000 }, async () => {
  const c = new Ceremony({ n: 5, t: 3, seed: 'cli-full-main-only', voters: 6 });
  const messages: string[] = [];
  const envelopes = new Map<string, { headerBytes: Uint8Array; body: Uint8Array }>();
  let serial = 0;
  const file = (name: string, value: unknown): string => {
    const path = join(c.dir, `${serial++}-${name}`);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  const command = async (i: number, name: string, args: string[] = [], expected = 0, errorCode?: string): Promise<Record<string, unknown>> => {
    const out: string[] = [], err: string[] = [];
    const code = await main([name, '--bundle', c.path(i), ...args, '--json'], {
      out: (s) => out.push(s), err: (s) => err.push(s), promptSecret: async () => PASS,
    }, c.deps.get(i)!, {});
    messages.push(...out, ...err);
    assert.equal([...out, ...err].join('').includes(PASS), false, 'CLI must not emit the synthetic passphrase');
    assert.equal(code, expected, `${name}: ${err.join('\n')}`);
    if (errorCode !== undefined) {
      assert.deepEqual(out, []);
      assert.equal(err.length, 1);
      const report = JSON.parse(err[0]!) as Record<string, unknown>;
      assert.equal(report['code'], errorCode);
      assert.equal(report['ok'], false);
      return report;
    }
    assert.deepEqual(err, []);
    assert.equal(out.length, 1);
    return JSON.parse(out[0]!) as Record<string, unknown>;
  };
  const sync = async (): Promise<void> => {
    const path = join(c.dir, `${serial++}-log.qvl`);
    writeFileSync(path, c.slice());
    for (const i of c.honest()) await command(i, 'import', ['--log', path]);
  };
  const round = async (i: number, name: string, args: string[] = [], post = true): Promise<Packet['obj']> => {
    const output = join(c.dir, `${serial++}-${name}-${i}.qvp`);
    await command(i, name, [...args, '--out', output]);
    const packet = JSON.parse(readFileSync(output, 'utf8')) as Packet['obj'];
    assert.equal(packet.from, i);
    assert.equal(packet.manifest_hash, H(c.mh));
    if (post) {
      for (const [index, record] of packet.records.entries()) {
        const exportPath = join(c.dir, `${serial++}-entry.json`);
        await command(i, 'export-entry', ['--round', packet.round, '--index', String(index), '--out', exportPath]);
        const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as { header: string; body: string };
        const body = Buffer.from(exported.body, 'base64url');
        assert.deepEqual(body, Buffer.from(jcs(record)));
        envelopes.set(H(body), { body, headerBytes: Buffer.from(exported.header, 'base64url') });
        c.push(record);
      }
    }
    return packet;
  };
  try {
    for (const i of [1, 2, 3, 4, 5]) {
      c.paths.set(i, join(c.dir, `t${i}.qvtb`));
      c.deps.set(i, mkDeps(`cli-full-main-only/${i}`));
      const identity = await command(i, 'keygen');
      c.signKeys.push({ publicKey: hexToBytes(identity['sign_pk'] as string, 32), secretKey: new Uint8Array() });
    }
    const rr = rollRoot(c.rollHex); assert.equal(rr.ok, true); if (!rr.ok) throw new Error('invalid fixture roll');
    c.manifest = buildManifest({ seed: c.o.seed, n: 5, t: 3, voters: 6, boundLog: true, contests: [defaultContests()[0]!] }, [c.coord], c.signKeys, c.rollHex.length, H(rr.value));
    c.mh = manifestHash(c.manifest);
    c.mrec = { body: c.manifest, sigs: [signRecordRaw(c.coord.secretKey, c.coord.publicKey, c.mh, 'manifest', c.manifest)] };
    assert.equal(c.manifest.bb.log_pk, H(c.logKey.publicKey));
    const manifest = file('manifest.json', c.mrec);
    for (const i of c.honest()) await command(i, 'join', ['--manifest', manifest, '--manifest-hash', H(c.mh)]);
    for (const name of ['shares', 'verify', 'finalize']) await command(1, name, [], 40, 'WRONG_STATE');
    await command(1, 'confirm', ['--compared-with', '2'], 40, 'WRONG_STATE');

    c.marker('dkg-open'); await sync();
    for (const i of c.honest()) await round(i, 'commit');
    c.marker('dkg-r1-open'); await sync();
    for (const i of c.honest()) await round(i, 'reveal');
    c.marker('dkg-r1-close'); await sync();
    for (const i of c.honest()) await round(i, 'shares');
    c.marker('dkg-r2-close'); await sync();
    for (const i of c.honest()) assert.deepEqual((await round(i, 'verify')).records, []);
    c.marker('dkg-r3-close'); await sync();
    const outcome = await c.adjudicate(); c.ctx = outcome.ctx;
    const fingerprints: string[] = [];
    for (const i of c.honest()) {
      const result = await command(i, 'finalize');
      assert.deepEqual(result['qualified'], [1, 2, 3, 4, 5]);
      fingerprints.push(result['check_words'] as string);
    }
    assert.equal(new Set(fingerprints).size, 1);
    for (const i of c.honest()) await round(i, 'confirm', ['--compared-with', String(i === 1 ? 2 : 1), '--words', fingerprints[0]!]);
    c.marker('dkg-final', { qmask: outcome.qmask, K: H(pointToBytes(outcome.K)) }); await sync();
    for (const i of c.honest()) {
      // Drill packets have no board exporter; verify their actual public proofs without synthesizing trustee signatures.
      const packet = await round(i, 'drill', [], false), r = packet.records[0] as SignedRecord<KeycheckBody>;
      assert.equal(verifySig(outcome.ctx, 'keycheck', r.body, r.sig, c.manifest.trustees[i - 1]!.sign_pk), true);
      assert.equal(verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(i)!, r.body), true);
    }
    await command(1, 'tally-release', ['--election', file('not-open.json', {})], 40, 'WRONG_STATE');
    c.openElection(); await sync();
    for (const i of [0, 1, 2, 3, 4, 5]) c.cast(outcome, i, { budget: [i < 4 ? 'yes' : 'no'] });
    c.marker('election-close'); await sync();

    // Bind the complete release input using the CLI's trustee envelopes and harness-owned public actors only.
    c.board = () => {
      const origin = logOrigin(c.manifest), tree = new MerkleTree(), entries: LogBundle['entries'] = [];
      const records: [number, unknown][] = [[0, c.mrec], ...c.log.map((e): [number, unknown] => [e.seq, e.entry])];
      for (const [seq, raw] of records) {
        const body = jcs(raw), exported = envelopes.get(H(body));
        let entry = exported;
        if (entry === undefined) {
          const record = raw as { intent?: string; body: { type: string; name?: string; voter?: string } };
          const marker: Record<string, EntryType> = { 'dkg-open': 'ceremony_start', 'dkg-final': 'joint_key', 'election-open': 'election_open', 'election-close': 'election_close' };
          const type: EntryType = seq === 0 ? 'manifest' : record.intent === 'cast' ? 'ballot' : record.body.type === 'marker' ? marker[record.body.name!] ?? 'notice' : record.body.type === 'roll-commit' ? 'roll_commit' : 'tally_result';
          assert.ok(seq === 0 || record.intent === 'cast' || ['marker', 'roll-commit', 'tally'].includes(record.body.type), 'every trustee record must have its CLI-generated envelope');
          const who = record.intent === 'cast' ? c.authors.get(record.body.voter!)! : c.coord;
          entry = buildEntry({ origin, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce: sha256(utf8(`cli-full/${seq}`)).slice(0, 16), createdAt: BOARD_CREATED_AT, body });
        }
        entries.push({ seq, ...entry }); tree.appendLeaf(entry.headerBytes);
      }
      return bundleToJson({ format: 'qv-bundle/v1', origin, createdAt: BOARD_CREATED_AT, treeSize: tree.size, root: tree.root(), generator: 'cli-full-test', spec: 'QV-18', entries,
        checkpoints: [signCheckpoint(origin, tree.size, tree.root(), c.logKey.secretKey, c.logKey.publicKey)], receipts: [], redactions: [],
        policy: { logPublicKey: c.logKey.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } } });
    };
    const release = file('release.json', c.bundle()), shares: unknown[] = [];
    for (const i of [1, 3, 5]) shares.push(...(await round(i, 'tally-release', ['--election', release], false)).records);
    for (const i of [1, 3, 5]) assert.equal((await command(i, 'status'))['state'], 'RELEASED');
    for (const i of [2, 4]) assert.equal((await command(i, 'status'))['state'], 'STANDBY');
    const final = finishTally(c, outcome, shares);
    assert.deepEqual(final.rejected, []);
    assert.deepEqual(final.valid, [1, 3, 5]);
    assert.equal(final.counts?.get('budget')?.get('yes'), 4);
    assert.equal(final.counts?.get('budget')?.get('no'), 2);
    assert.equal((await verifyAll(c)).verdict, 'PASS');
    assert.equal(c.trusteeKeys.size, 0, 'the harness never obtains trustee private keys');
    assert.ok(c.signKeys.every((key) => key.secretKey.length === 0));
    for (const output of messages) assert.equal(output.includes(PASS), false);
    for (const name of readdirSync(c.dir)) {
      const bytes = readFileSync(join(c.dir, name));
      for (const secret of [PASS, '"sk_sign"', '"sk_i"']) assert.equal(bytes.includes(Buffer.from(secret)), false, `secret material in ${name}`);
    }
  } finally { c.cleanup(); }
});
