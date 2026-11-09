import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MerkleTree, bundleFromJson, unb64, unb64u, verifyConsistency, verifyInclusion, verifyLog, authorKeyId, b64u, toHex, type WitnessPolicy } from '@quietvote/board';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { signRecord, verifyElectionText, PROTO_ID } from '@quietvote/protocol';
import { readTar } from '../src/index.ts';
import { World } from './helpers/world.ts';

const H = bytesToHex;

test('full election over HTTP: 3-of-5 trustees, 22 voters, revotes, spoils, close, tally, export, verifyElection PASS', { timeout: 900_000 }, async () => {
  const w = new World({ seed: 'e2e-http', n: 5, t: 3, voters: 22 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.registerVoters();
    const m = await w.publishManifest();
    assert.equal(m.status, 201, m.text);
    assert.equal(m.json.status, 'included');
    await w.ceremony();
    let st = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
    assert.equal(st.phase, 'READY');
    // ballot before open is rejected
    assert.equal((await w.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 409);
    assert.equal((await w.open()).status, 201);
    st = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
    assert.equal(st.phase, 'OPEN');

    const final = new Map<number, Record<string, string[]>>();
    const pick = (i: number): Record<string, string[]> => ({ budget: i % 5 === 0 ? [] : [i % 3 === 0 ? 'no' : 'yes'], chair: [['ann', 'bob', 'cy'][i % 3]!] });
    for (let i = 0; i < 20; i++) {
      const s = pick(i);
      const r = await w.cast(i, s);
      assert.equal(r.status, 201, r.text);
      final.set(i, s);
    }
    // voters 20, 21 abstain. Revotes:
    for (const i of [1, 4, 7]) {
      const s = { budget: ['no'], chair: ['cy'] };
      assert.equal((await w.cast(i, s)).status, 201);
      final.set(i, s);
    }
    assert.equal((await w.cast(4, { budget: ['yes'], chair: ['bob'] })).status, 201);
    final.set(4, { budget: ['yes'], chair: ['bob'] });
    // spoils: published, private
    assert.equal((await w.spoil(2, { budget: ['no'], chair: ['ann'] }, 'publish')).status, 201);
    assert.equal((await w.spoil(3, { budget: ['yes'], chair: ['bob'] }, 'private')).status, 201);
    // per-voter index is public
    const kid = b64u(authorKeyId('ed25519', w.voters[4]!.publicKey));
    const vi = (await w.get(`/api/v1/elections/${w.electionId}/voters/${kid}`)).json;
    assert.equal(vi.ballot_count, 3);

    // pause / resume (steward action), ballots rejected while paused
    assert.equal((await w.post('notice', w.coord[0]!, w.control('pause', 'maintenance'))).status, 201);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'PAUSED');
    assert.equal((await w.cast(21, { budget: ['yes'], chair: ['ann'] })).status, 409);
    assert.equal((await w.post('notice', w.coord[1]!, w.control('resume'))).status, 201);
    assert.equal((await w.cast(21, { budget: ['yes'], chair: ['ann'] })).status, 201);
    final.set(21, { budget: ['yes'], chair: ['ann'] });

    const closed = await w.close();
    assert.equal(closed.status, 201, closed.text);
    st = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
    assert.equal(st.phase, 'TALLYING', 'server posted the tally aggregate');
    // late ballot after close
    assert.equal((await w.cast(20, { budget: ['yes'], chair: ['ann'] })).status, 409);

    // 3 of 5 trustees (1, 3, 5) relay partial decryptions
    for (const j of [1, 3, 5]) {
      const r = await w.trusteeShares(j);
      assert.equal(r.status, 201, r.text);
      w.tick();
    }
    // a trustee cannot post twice
    assert.equal((await w.trusteeShares(1)).status, 409);
    const view = (await w.get(`/api/v1/elections/${w.electionId}/tally`)).json;
    assert.deepEqual(view.shares_received, [1, 3, 5]);

    const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3,5`);
    assert.equal(draft.status, 200, draft.text);
    const body = draft.json.body;
    const c0 = w.coord[0]!;
    const tallyRec = signRecord(c0.secretKey, c0.publicKey, w.params.ctx, body);
    const tr = await w.post('tally_result', c0, tallyRec);
    assert.equal(tr.status, 201, tr.text);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'AUDIT');
    assert.equal((await w.post('audit_close', c0, w.control('audit-close'))).status, 201);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'ARCHIVED');

    // expected totals from the plaintext choices
    const exp = { yes: 0, no: 0, ann: 0, bob: 0, cy: 0 } as Record<string, number>;
    for (const s of final.values()) for (const ids of Object.values(s)) for (const id of ids) exp[id]!++;
    for (const c of body.contests) for (const o of c.options) assert.equal(o.T, exp[o.id], `${c.id}/${o.id}`);

    // ---- export feeds the protocol verifier
    const ex = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
    const rep = await verifyElectionText(ex.text);
    assert.equal(rep.verdict, 'PASS', JSON.stringify(rep.findings.filter((f) => f.cls === 'F')));
    assert.equal(rep.counts.counted, final.size);
    assert.equal(rep.counts.spoiled, 2);
    assert.deepEqual(Object.values(rep.checks).filter((c) => c === 'fail'), []);

    // ---- .qvb: tar integrity + board-level verification
    const tarRes = await fetch(`${w.base}/api/v1/elections/${w.electionId}/export.qvb`);
    assert.equal(tarRes.headers.get('content-type'), 'application/x-tar');
    const files = readTar(new Uint8Array(await tarRes.arrayBuffer()));
    const sums = new TextDecoder().decode(files.get('SHA256SUMS')!).trim().split('\n');
    for (const line of sums) {
      const [hash, name] = line.split('  ') as [string, string];
      assert.equal(createHash('sha256').update(files.get(name)!).digest('hex'), hash, name);
    }
    const bj = JSON.parse(new TextDecoder().decode(files.get('bundle.json')!));
    const entries = new TextDecoder().decode(files.get('log/entries.jsonl')!).trim().split('\n').map((l) => JSON.parse(l));
    const cps = [...files.keys()].filter((k) => k.startsWith('log/checkpoints/')).map((k) => new TextDecoder().decode(files.get(k)!));
    const pol = JSON.parse(new TextDecoder().decode(files.get('witness/policy.json')!));
    const lb = bundleFromJson({
      format: bj.format, origin: bj.origin, created_at: bj.created_at, tree_size: bj.tree_size, root_b64: bj.root_b64, generator: bj.generator, spec: bj.spec,
      entries, checkpoints: cps, receipts: [], policy: pol, redactions: [],
    });
    assert.ok(lb.ok, JSON.stringify(lb));
    const keys = new Map<string, Uint8Array>();
    for (const k of [...w.coord, ...w.trustees, ...w.voters, w.owner]) keys.set(toHex(authorKeyId('ed25519', k.publicKey)), k.publicKey);
    // server key: read from election info
    const info = (await w.get(`/api/v1/elections/${w.electionId}`)).json;
    const srv = unb64u(info.server_pk)!;
    keys.set(toHex(authorKeyId('ed25519', srv)), srv);
    const wp: WitnessPolicy = { quorum: 0, noneAcknowledged: true, witnesses: [] };
    const verdict = verifyLog(lb.value, { logPublicKey: unb64u(info.log_pk)!, witnessPolicy: wp, resolveAuthorKey: (h) => keys.get(toHex(h.author)) });
    assert.deepEqual(verdict.failures, []);
    assert.equal(verdict.integrity, 'VERIFIED');
    assert.equal(verdict.treeSize, info.tree_size);

    // ---- proofs served over HTTP verify against the signed checkpoint
    const cpText = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
    const size = Number(cpText.split('\n')[1]);
    const root = unb64(cpText.split('\n')[2]!)!;
    const inc = (await w.get(`/api/v1/elections/${w.electionId}/log/proof/inclusion?seq=10&tree_size=${size}`)).json;
    assert.ok(verifyInclusion(unb64u(inc.leaf_hash)!, 10, size, inc.path.map((p: string) => unb64(p)!), root));
    const old = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoints?limit=500`)).json.items[20];
    const cons = (await w.get(`/api/v1/elections/${w.electionId}/log/proof/consistency?old=${old.tree_size}&new=${size}`)).json;
    assert.ok(verifyConsistency(old.tree_size, size, unb64(old.root)!, root, cons.path.map((p: string) => unb64(p)!)));
    void MerkleTree; void jcs; void PROTO_ID; void H;

    // ---- reopen from disk: state and projections rebuilt by replay
    await w.server.pool.closeAll();
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'ARCHIVED');
    // archived: appends rejected, keys erased
    assert.equal((await w.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 409);
  } finally {
    await w.stop();
  }
});
