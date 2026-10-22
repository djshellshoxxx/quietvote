import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QvCryptoError, baseMul, bytesToHex, canonicalize, cdsVerify, decVerify, dhVerify, ed25519Sign, ed25519Verify, framedPreimage, h256,
  h512, hexToBytes, hs, hsNz, limitVerify, parseQvJson, pokVerify, pointFromBytes, pointToBytes, scalarFromBytes, scalarToBytes, sha256,
  sha512, ed25519Keypair, type Label, LABELS,
} from '@quietvote/crypto';
import {
  adjudicateDkg, ballotCode, binderFor, castDigest, deriveXi, encryptBallot, evaluateContest, manifestHash, rollLeaf, rollRoot,
  validateManifest, verifyElection, verifyEnvelope, verifySpoilReveal, auditSpoil, type ElectionParams, type Manifest,
} from '../src/index.ts';
import { dkgInputFromVector, generateAll } from './vecgen/generate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-vectors');
const H = bytesToHex;
const hb = (h: string): Uint8Array => hexToBytes(h);

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('vectors:regen-check - regenerating produces zero diff (QV-34-REQ-004)', async () => {
  const gen = await generateAll();
  const onDisk = new Map<string, string>();
  for (const f of walk(ROOT)) onDisk.set(relative(ROOT, f).replaceAll('\\', '/'), readFileSync(f, 'utf8'));
  const norm = new Map<string, string>();
  for (const [k, v] of gen) norm.set(k.startsWith('../') ? k.slice(3) : `v1/${k}`, v);
  assert.deepEqual([...norm.keys()].sort(), [...onDisk.keys()].sort());
  for (const [k, v] of norm) assert.equal(onDisk.get(k), v, `vector file differs: ${k}`);
});

test('cds01 vector preimage is 383 bytes (QV-16 Appendix A.4)', () => {
  const v = load('primitives/hash/tagged-hash.json').vectors.find((x) => x.id === 'tagged-cds01-length-383')!;
  assert.equal(v.expect.output.preimage_hex.length, 383 * 2);
});

test('vector files are well-formed: envelope, unique ids, size limits, lowercase hex, no floats', () => {
  for (const f of walk(join(ROOT, 'v1')).filter((x) => x.endsWith('.json'))) {
    const text = readFileSync(f, 'utf8');
    assert.ok(text.length < 1_000_000, `${f} exceeds 1 MB`);
    assert.ok(!text.includes('\r'));
    const j = JSON.parse(text) as { vectors?: { id: string }[]; format_version?: number };
    if (j.vectors !== undefined) {
      assert.equal(j.format_version, 1);
      const ids = j.vectors.map((v) => v.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${f}`);
    }
  }
});

type Vec = { id: string; input: any; expect: { ok: boolean; output?: any; error?: string } };
const load = (rel: string): { operation: string; vectors: Vec[] } => JSON.parse(readFileSync(join(ROOT, 'v1', rel), 'utf8'));

const errCode = (e: unknown): string => {
  if (e instanceof QvCryptoError) return e.code;
  throw e;
};
const sc = (h: string): bigint => scalarFromBytes(hb(h));
const pt = (h: string): ReturnType<typeof pointFromBytes> => pointFromBytes(hb(h));
const params = (p: any): ElectionParams => ({ manifest: p.manifest as Manifest, mh: manifestHash(p.manifest), K: pt(p.K_hex), ctx: hb(p.ctx_hex) });

type Runner = (i: any) => unknown | { __err: string };
const err = (code: string): { __err: string } => ({ __err: code });

const runners: Record<string, Runner> = {
  'hash.sha256': (i) => ({ digest_hex: H(sha256(hb(i.msg_hex))) }),
  'hash.sha512': (i) => ({ digest_hex: H(sha512(hb(i.msg_hex))) }),
  'hash.tagged': (i) => {
    if (!(i.label in LABELS)) return err('E_DOMAIN_UNKNOWN');
    const fl = (i.fields_hex as string[]).map(hb);
    const label = i.label as Label;
    if (i.kind === 'hs_nz') return { scalar_hex: H(scalarToBytes(hsNz(label, ...fl))), counter_field_hex: '00000000', preimage_hex: H(framedPreimage(label, ...fl, new Uint8Array(4))) };
    const o: Record<string, unknown> = { preimage_hex: H(framedPreimage(label, ...fl)) };
    if (i.kind === 'H256') o.digest_hex = H(h256(label, ...fl));
    else if (i.kind === 'H512') o.digest_hex = H(h512(label, ...fl));
    else if (i.kind === 'hs') o.scalar_hex = H(scalarToBytes(hs(label, ...fl)));
    return o;
  },
  'ristretto.encode_base_mul': (i) => ({ point_hex: H(pointToBytes(baseMul(sc(i.scalar_hex)))) }),
  'ristretto.decode': (i) => {
    try {
      const p = pointFromBytes(hb(i.point_hex), i.non_identity === true ? { nonIdentity: true } : {});
      return { is_identity: p.is0() };
    } catch (e) {
      return err(errCode(e));
    }
  },
  'scalar.decode': (i) => {
    try {
      sc(i.scalar_hex);
      return { canonical: true };
    } catch (e) {
      return err(errCode(e));
    }
  },
  'ed25519.sign': (i) => {
    const kp = ed25519Keypair(hb(i.secret_hex));
    return { public_hex: H(kp.publicKey), sig_hex: H(ed25519Sign(kp.secretKey, hb(i.msg_hex))) };
  },
  'ed25519.verify': (i) => (ed25519Verify(hb(i.public_hex), hb(i.sig_hex), hb(i.msg_hex)) ? { valid: true } : err('E_SIG')),
  'enc.canon_json': (i) => {
    try {
      return { canonical: canonicalize(parseQvJson(i.text)) };
    } catch {
      return err('E_PARSE');
    }
  },
  'roll.merkle_root': (i) => {
    const r = rollRoot(i.voter_pks);
    return r.ok ? { root_hex: H(r.value), leaf_hashes: (i.voter_pks as string[]).map((k) => H(rollLeaf(hb(k)))) } : err('E_ROLL');
  },
  'manifest.validate_hash': (i) => {
    const v = validateManifest(i.manifest, i.roll_size);
    return v.ok ? { manifest_hash: H(manifestHash(v.value.manifest)), jcs_hex: H(new TextEncoder().encode(canonicalize(i.manifest))) } : err(v.error);
  },
  'cds.verify': (i) => {
    try {
      const A = pt(i.alpha_hex), B = pt(i.beta_hex);
      if (A.is0() || B.is0()) return err('E_IDENTITY');
      const p = i.proof;
      const ok = cdsVerify({ ctx: hb(i.ctx_hex), binder: hb(i.binder_hex), cid: i.cid, oid: i.oid, K: pt(i.K_hex), ct: { A, B } }, { c0: sc(p.c0), s0: sc(p.s0), c1: sc(p.c1), s1: sc(p.s1) });
      return ok ? { valid: true } : err('E_CDS');
    } catch (e) {
      return err(errCode(e));
    }
  },
  'limit.verify': (i) => {
    const ok = limitVerify({ ctx: hb(i.ctx_hex), binder: hb(i.binder_hex), cid: i.cid, L: i.L, K: pt(i.K_hex), Asum: pt(i.Asum_hex), Bsum: pt(i.Bsum_hex) }, { c: sc(i.proof.c), s: sc(i.proof.s) });
    return ok ? { valid: true } : err('E_LIMIT_PROOF');
  },
  'pok.verify': (i) => (pokVerify(hb(i.manifest_hash_hex), i.i, i.k, pt(i.A_hex), { c: sc(i.proof.c), s: sc(i.proof.s) }) ? { valid: true } : err('E_DKG_R1')),
  'cp.verify_dh': (i) => (dhVerify(hb(i.manifest_hash_hex), i.i, i.j, pt(i.E_hex), pt(i.R_hex), pt(i.S_hex), { c: sc(i.proof.c), s: sc(i.proof.s) }) ? { valid: true } : err('E_DKG_COMPLAINT')),
  'tally.partial_verify': (i) =>
    decVerify({ ctx: hb(i.ctx_hex), cid: i.cid, oid: i.oid, j: i.j, Yj: pt(i.Yj_hex), A: pt(i.A_hex), B: pt(i.B_hex), M: pt(i.M_hex) }, { c: sc(i.proof.c), s: sc(i.proof.s) }) ? { valid: true } : err('E_DEC_PROOF'),
  'ballot.verify': (i) => {
    const r = verifyEnvelope(params(i.params), new Set<string>(i.roll), i.envelope);
    return r.ok ? { ballot_code_hex: H(r.value.code) } : err(r.error);
  },
  'benaloh.verify_spoiled': (i) => {
    const r = verifySpoilReveal(params(i.params), i.body, i.reveal);
    return r.ok ? { reproduced: true } : err(r.error);
  },
  'benaloh.private_audit': (i) => {
    const r = auditSpoil(params(i.params), new Set<string>(i.roll), i.envelope, i.reveal);
    return r.ok ? { audited: true, ballot_code_hex: H(r.value.code) } : err(r.error);
  },
  'rules.evaluate': (i) => {
    const m = { quorum: i.manifest_quorum ?? undefined } as Manifest;
    return { result: evaluateContest(m, i.contest, new Map(Object.entries(i.counts as Record<string, number>)), i.participation, i.roll_size) };
  },
};

const files = walk(join(ROOT, 'v1')).filter((f) => f.endsWith('.json') && !/elections|mutations|canary/.test(f)).map((f) => f.slice(join(ROOT, 'v1').length + 1));

for (const rel of files) {
  const file = load(rel);
  if (file.operation === 'ballot.encrypt' || file.operation === 'dkg.adjudicate') continue;
  test(`vectors: ${rel} (${file.operation})`, () => {
    const run = runners[file.operation];
    assert.ok(run, `no runner for ${file.operation}`);
    for (const v of file.vectors) {
      const got = run(v.input) as any;
      if (v.expect.ok) {
        assert.ok(!(got && got.__err), `${v.id}: unexpected error ${got?.__err}`);
        assert.deepEqual(got, v.expect.output, v.id);
      } else {
        assert.ok(got && got.__err, `${v.id}: expected error ${v.expect.error}`);
        assert.equal(got.__err, v.expect.error, v.id);
      }
    }
  });
}

test('vectors: ballot.encrypt reproduces xi, body, code and signature byte for byte', () => {
  const f = load('protocol/ballot/ballot-encrypt.json');
  for (const v of f.vectors) {
    if (v.id === 'ballot-derive-xi') {
      const i = v.input;
      const xi = deriveXi(hb(i.ctx_hex), hb(i.voter_nonce_key_hex), hb(i.rho_hex), BigInt(i.attempt), hb(i.selvec_digest_hex));
      assert.equal(H(xi), v.expect.output.xi_hex);
    } else {
      const i = v.input;
      const p = params(i.params);
      const r = encryptBallot(p, hb(i.voter_pk_hex), i.supersedes, i.selections, hb(i.xi_hex));
      assert.ok(r.ok);
      if (!r.ok) return;
      const code = ballotCode(p.ctx, r.value);
      assert.equal(H(new TextEncoder().encode(canonicalize(r.value))), v.expect.output.body_jcs_hex);
      assert.equal(H(code), v.expect.output.ballot_code_hex);
      assert.equal(H(binderFor(p.ctx, hb(i.voter_pk_hex))), v.expect.output.binder_hex);
      assert.equal(H(ed25519Sign(hb(i.voter_secret_hex), castDigest(p.ctx, code))), v.expect.output.cast_sig_hex);
    }
  }
});

test('vectors: dkg.adjudicate reproduces Q, K, ctx and public key shares', async () => {
  const f = load('protocol/dkg/dkg.json');
  for (const v of f.vectors) {
    const r = await adjudicateDkg(dkgInputFromVector(v.input));
    if (v.expect.ok) {
      assert.ok(r.ok, v.id);
      if (!r.ok) continue;
      assert.deepEqual(r.value.Q, v.expect.output.Q, v.id);
      assert.equal(r.value.qmask, v.expect.output.qmask);
      assert.equal(H(pointToBytes(r.value.K)), v.expect.output.K_hex);
      assert.equal(H(r.value.ctx), v.expect.output.ctx_hex);
      for (const [j, y] of r.value.Y) assert.equal(H(pointToBytes(y)), v.expect.output.Y_hex[String(j)]);
    } else {
      assert.ok(!r.ok && r.error === v.expect.error, v.id);
    }
  }
});

test('vectors: full elections verify to the expected report', async () => {
  for (const name of ['tiny-yesno-3v', 'small-approval-20v']) {
    const bundle = JSON.parse(readFileSync(join(ROOT, 'v1', 'elections', name, 'bundle.json'), 'utf8'));
    const exp = JSON.parse(readFileSync(join(ROOT, 'v1', 'elections', name, 'expected-report.json'), 'utf8'));
    const r = await verifyElection(bundle);
    assert.equal(r.verdict, exp.verdict, name);
    assert.deepEqual(r.checks, exp.checks, name);
    assert.deepEqual(r.results, exp.results, name);
    assert.equal(r.ctxPrefix, exp.ctx_prefix);
    assert.equal(r.counts.counted, exp.counts.counted);
  }
});

test('vectors: every mutant fails exactly its named checks; none passes all checks; canary behaves', async () => {
  for (const f of readdirSync(join(ROOT, 'v1', 'mutations'))) {
    const m = JSON.parse(readFileSync(join(ROOT, 'v1', 'mutations', f), 'utf8'));
    const r = await verifyElection(m.bundle);
    const failed = Object.entries(r.checks).filter(([, s]) => s === 'fail').map(([k]) => k).sort();
    assert.deepEqual(failed, m.expect.failed_checks, m.id);
    assert.equal(r.verdict, m.expect.verdict, m.id);
    for (const c of m.expect.codes) assert.ok(r.findings.some((x) => x.code === c), `${m.id}: ${c}`);
    assert.ok(failed.length > 0 || r.verdict !== 'PASS', `${m.id} passes all checks`);
  }
  const canary = JSON.parse(readFileSync(join(ROOT, 'v1', 'canary', 'canary-election.json'), 'utf8'));
  const exp = JSON.parse(readFileSync(join(ROOT, 'v1', 'canary', 'expected-report.json'), 'utf8'));
  const r = await verifyElection(canary);
  assert.deepEqual(r.checks, exp.checks);
  assert.equal(r.checks['chk.ballots.valid'], 'fail');
  assert.equal(r.checks['chk.tally.aggregate'], 'fail');
});

test('MANIFEST.json lists every vector file with matching SHA-256', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'MANIFEST.json'), 'utf8')) as { files: { path: string; sha256: string }[] };
  for (const e of m.files) assert.equal(H(sha256(readFileSync(join(ROOT, e.path)))), e.sha256, e.path);
  const listed = new Set(m.files.map((e) => e.path));
  for (const f of walk(ROOT)) {
    const rel = relative(ROOT, f).replaceAll('\\', '/');
    if (rel !== 'MANIFEST.json') assert.ok(listed.has(rel), `${rel} not in MANIFEST`);
  }
});
