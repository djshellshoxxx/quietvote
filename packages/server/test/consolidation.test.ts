// Consolidation regressions exercise actual HTTP admission and the retained registration-contract blocker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { b64u, cosignLine, unb64u } from '@quietvote/board';
import { bytesToHex, jcs, sha256, utf8 } from '@quietvote/crypto';
import { ballotCode, buildTally, makeCast, makeSpoil, signRecord, verifyElectionText, type Manifest } from '@quietvote/protocol';
import { registrationBody } from '../../web/src/flow/onboarding.ts';
import { createSigner } from '../../web/src/key/signer.ts';
import { verifierHtml } from '../../web/src/build/site.ts';
import { STATIC_CSP } from '../src/http.ts';
import { exportQvb, importAndWait } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

test('real server: permitted registration, client-contract blocker, voting, stored-aggregate draft after eviction, tally and export', { timeout: 300_000 }, async (t) => {
  const w = new World({ seed: 'consolidation-http', n: 3, t: 2, voters: 3 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    // B3-01 remains an owner blocker: reproduce the actual web helper's mismatch without changing either contract.
    const invite = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(invite.status, 201, invite.text);
    const signer = await createSigner(sha256(utf8('consolidation-web-key')), { preferWebCrypto: false });
    try {
      const body = await registrationBody({ apiElectionId: w.electionId, token: unb64u(invite.json.invites[0].code)!, signer });
      const refused = await w.req('POST', `/api/v1/elections/${w.electionId}/registrations`, body);
      assert.equal(refused.status, 401);
      assert.equal(refused.json.code, 'BAD_SIGNATURE');
      t.diagnostic('B3-01 unresolved: actual web registrationBody is rejected with 401 BAD_SIGNATURE; raw-token server-contract registration below succeeds.');
    } finally { signer.lock(); }
    await w.registerVoters();
    const roll = (await w.get(`/api/v1/elections/${w.electionId}/roll?limit=2`)).json;
    const rollRest = (await w.get(`/api/v1/elections/${w.electionId}/roll?limit=2&cursor=${roll.next_cursor}`)).json;
    assert.deepEqual([...roll.items, ...rollRest.items].map((v) => bytesToHex(unb64u(v.pk)!)), w.rollHex);
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    const closedRegistration = await w.req('POST', `/api/v1/elections/${w.electionId}/registrations`, {
      invite_code: invite.json.invites[0].code, pk: b64u(w.voters[0]!.publicKey), alg: 'ed25519', pop: b64u(new Uint8Array(64)),
    });
    assert.equal(closedRegistration.status, 403);
    assert.equal(closedRegistration.json.code, 'REGISTRATION_CLOSED');
    assert.equal((await w.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 409);
    assert.equal((await w.open()).status, 201);
    const originalBallot = w.build(0, { budget: ['yes'], chair: ['ann'] });
    assert.equal((await w.post('ballot', w.voters[0]!, makeCast(w.params, w.voters[0]!.secretKey, originalBallot))).status, 201);
    w.last.set(bytesToHex(w.voters[0]!.publicKey), bytesToHex(originalBallot.code));
    w.tick();
    const aliasBody = structuredClone(originalBallot.body);
    aliasBody.supersedes = '22'.repeat(32);
    const alias = makeSpoil(w.params, w.voters[0]!.secretKey, { ...originalBallot, body: aliasBody, code: ballotCode(w.params.ctx, aliasBody) }, 'private');
    const aliasRefused = await w.post('ballot_audit', w.voters[0]!, alias);
    assert.equal(aliasRefused.status, 422);
    assert.equal(aliasRefused.json.reason, 'E_SPOILED_CODE_CAST');
    for (let i = 1; i < 3; i++) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    assert.equal((await w.cast(1, { budget: ['no'], chair: ['bob'] })).status, 201);
    assert.equal((await w.spoil(2, { budget: ['no'], chair: ['cy'] }, 'publish')).status, 201);
    const earlyClose = await w.post('election_close', w.coord[0]!, w.marker('election-close', w.params.ctx));
    assert.equal(earlyClose.status, 409, earlyClose.text);
    assert.equal((await w.close()).status, 201);
    assert.equal((await w.cast(0, { budget: ['no'], chair: ['cy'] })).status, 409);
    const draftPath = `/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`;
    const rt = (await w.server.pool.get(w.electionId))!;
    const original = rt['ensureAnalysis'];
    rt['ensureAnalysis'] = () => { throw new Error('anonymous draft must not replay ballot proofs'); };
    assert.equal((await w.get(draftPath)).status, 409, 'insufficient shares must be rejected before ballot work');
    rt['ensureAnalysis'] = original;
    for (const j of [1, 3]) assert.equal((await w.trusteeShares(j)).status, 201);
    const an = await w.analysis();
    const expected = buildTally(w.params, {
      analysis: an, shares: new Map([...rt.st.decShares].map(([j, s]) => [j, s.set])), Y: rt.st.dkgPre!.Y,
      decrypters: rt.st.decrypters, rollSize: w.rollHex.length,
      spoiled: [...an.spoiled.values()].filter((s) => s.env.reveal !== undefined).map((rec) => ({ rec, mode: 'reveal', selections: rec.env.reveal!.selections })),
    });
    assert.ok(expected.ok);
    await w.server.pool.evict(w.electionId);
    const reopened = (await w.server.pool.get(w.electionId))!;
    reopened['ensureAnalysis'] = () => { throw new Error('anonymous draft after eviction must not replay ballot proofs'); };
    const draft = await w.get(draftPath);
    assert.equal(draft.status, 200, draft.text);
    assert.equal(bytesToHex(jcs(draft.json.body)), bytesToHex(jcs(expected.value.body)));
    assert.deepEqual((await w.get(draftPath)).json.body, draft.json.body);
    const c = w.coord[0]!;
    assert.equal((await w.post('tally_result', c, signRecord(c.secretKey, c.publicKey, w.params.ctx, draft.json.body))).status, 201);
    assert.equal((await w.post('audit_close', c, w.control('audit-close'))).status, 201);
    const exported = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
    const report = await verifyElectionText(exported.text);
    assert.equal(report.verdict, 'PASS', JSON.stringify(report.findings));
    assert.equal(report.counts.counted, 3);
    assert.equal(report.counts.spoiled, 1);
    const bundle = await exportQvb(w);
    const entries = reopened.edb.entries;
    reopened.edb.entries = () => { throw new Error('cached/conditional exports must not rescan the log'); };
    try {
      assert.equal((await w.get(`/api/v1/elections/${w.electionId}/export.json`)).text, exported.text);
      assert.equal((await w.get(`/api/v1/elections/${w.electionId}/export.json`, { 'if-none-match': exported.headers.get('etag')! })).status, 304);
      const range = await w.get(`/api/v1/elections/${w.electionId}/export.json`, { range: 'bytes=0-15' });
      assert.equal(range.status, 206);
      assert.equal(range.text, exported.text.slice(0, 16));
    } finally { reopened.edb.entries = entries; }
    const mirror = new World({ seed: 'consolidation-mirror', n: 3, t: 2, voters: 0 });
    await mirror.start();
    try {
      await mirror.setupOrgAndElection();
      const job = await importAndWait(mirror, bundle);
      assert.equal(job.state, 'done', JSON.stringify(job));
      const r = await mirror.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
      assert.equal(r.status, 409);
      assert.equal(r.json.code, 'STATE_CONFLICT');
    } finally { await mirror.stop(); }
  } finally { await w.stop(); }
});

test('B2-04: manifest witness keys control the open gate and advertised policy', { timeout: 180_000 }, async () => {
  const manifestWitness = kp('consolidation', 'manifest-witness');
  class ManifestWitnessWorld extends World {
    override buildManifest(): Manifest {
      const m = super.buildManifest();
      m.bb.witnesses = [{ name: 'manifest-only', pk: bytesToHex(manifestWitness.publicKey) }];
      return m;
    }
  }
  const w = new ManifestWitnessWorld({ seed: 'consolidation-witness', n: 3, t: 2, voters: 3, witnessQuorum: 1 });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    assert.equal((await w.open()).status, 409);
    const cp = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
    const size = Number(cp.split('\n')[1]);
    const text = cp.slice(0, cp.indexOf('\n\n') + 1);
    const submit = (name: string, key: ReturnType<typeof kp>) => w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, {
      checkpoint_size: size, lines: [cosignLine(name, key.secretKey, key.publicKey, text, w.nowSec)],
    });
    const operator = await submit('w1', w.witnesses[0]!);
    assert.equal(operator.status, 403);
    assert.equal((await w.open()).status, 409);
    const malformed = await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, { checkpoint_size: size, lines: ['this is junk'] });
    assert.equal(malformed.status, 422);
    const before = await w.get(`/api/v1/elections/${w.electionId}/export.qvb`);
    const chosen = await submit('manifest-only', manifestWitness);
    assert.equal(chosen.status, 200, chosen.text);
    assert.deepEqual(chosen.json.accepted, ['manifest-only']);
    const after = await w.get(`/api/v1/elections/${w.electionId}/export.qvb`);
    assert.notEqual(after.headers.get('etag'), before.headers.get('etag'));
    const repeated = await submit('manifest-only', manifestWitness);
    assert.equal(repeated.status, 200);
    assert.deepEqual(repeated.json.accepted, []);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/export.qvb`)).headers.get('etag'), after.headers.get('etag'));
    const policy = (await w.get(`/api/v1/elections/${w.electionId}/log/witnesses`)).json.policy;
    assert.deepEqual(policy.witnesses, ['manifest-only']);
    assert.equal((await w.open()).status, 201);
  } finally { await w.stop(); }
});

test('B2-03/B2-09: removed admin keys lose access on restart and invitation rows obey the election quota', async () => {
  const admin = kp('consolidation', 'admin');
  const w = new World({ seed: 'consolidation-admin', n: 3, t: 2, voters: 0, server: { adminKeys: [bytesToHex(admin.publicKey)], maxVotersPerElection: 2 } });
  await w.start();
  try {
    assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, admin)).status, 200);
    await w.setupOrgAndElection();
    const path = `/api/v1/elections/${w.electionId}/invites`;
    const idem = w.idemKey();
    assert.equal((await w.signed('POST', path, { count: 4 }, w.owner, idem)).status, 201);
    assert.equal((await w.signed('POST', path, { count: 1 }, w.owner, w.idemKey())).status, 429);
    assert.equal((await w.signed('POST', path, { count: 4 }, w.owner, idem)).status, 201, 'idempotent retry does not consume quota again');
    await w.server.stop();
    w.o.server = { ...w.o.server, adminKeys: [] };
    await w.start();
    assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, admin)).status, 401);
  } finally { await w.stop(); }
});

test('B3-03: real static server uses only the standalone verifier hash policy, retaining app headers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-consolidation-static-'));
  const v = await verifierHtml();
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(dir, 'verifier.html'), v.html);
  const w = new World({ seed: 'consolidation-static', n: 3, t: 2, voters: 0, server: { staticDir: dir } });
  await w.start();
  try {
    const page = await w.get('/verifier.html');
    const policy = page.headers.get('content-security-policy')!;
    assert.ok(policy.includes(`script-src '${v.scriptHash}'`));
    assert.ok(policy.includes(`style-src '${v.styleHash}'`));
    assert.ok(policy.includes("connect-src 'none'"));
    assert.ok(policy.includes("frame-ancestors 'none'"));
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal((await w.get('/')).headers.get('content-security-policy'), STATIC_CSP);
    assert.equal((await w.get('/verifier.html', { 'if-none-match': page.headers.get('etag')! })).headers.get('content-security-policy'), policy);
  } finally { await w.stop(); rmSync(dir, { recursive: true, force: true }); }
});
