// `qv vectors check`: runs the test-vectors/v1 conformance corpus (QV-34) against this build.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABELS, QvCryptoError, baseMul, bytesToHex, canonicalize, cdsVerify, decVerify, dhVerify, ed25519Keypair, ed25519Sign, ed25519Verify,
  framedPreimage, h256, h512, hexToBytes, hs, hsNz, limitVerify, parseQvJson, pointFromBytes, pointToBytes, scalarFromBytes, scalarToBytes,
  sha256, sha512, type Label,
} from '@quietvote/crypto';
import {
  auditSpoil, ballotCode, binderFor, castDigest, deriveXi, encryptBallot, evaluateContest, manifestHash, rollLeaf, rollRoot, validateManifest,
  verifyEnvelope, verifySpoilReveal, type ElectionParams, type Manifest,
} from '@quietvote/protocol';
import { pokVerify } from '@quietvote/crypto';
import { verifyBundle } from '@quietvote/verifier';
import { InputError, needPositional, parseArgs } from './args.ts';
import { printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';

const H = bytesToHex;
const hb = (h: string): Uint8Array => hexToBytes(h);
type Any = any; // vector inputs are untyped JSON by design
type Runner = (i: Any) => unknown;
const err = (code: string): { __err: string } => ({ __err: code });
const errCode = (e: unknown): string => {
  if (e instanceof QvCryptoError) return e.code;
  throw e;
};
const sc = (h: string): bigint => scalarFromBytes(hb(h));
const pt = (h: string): ReturnType<typeof pointFromBytes> => pointFromBytes(hb(h));
const params = (p: Any): ElectionParams => ({ manifest: p.manifest as Manifest, mh: manifestHash(p.manifest), K: pt(p.K_hex), ctx: hb(p.ctx_hex) });

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
      return { is_identity: pointFromBytes(hb(i.point_hex), i.non_identity === true ? { nonIdentity: true } : {}).is0() };
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
      return cdsVerify({ ctx: hb(i.ctx_hex), binder: hb(i.binder_hex), cid: i.cid, oid: i.oid, K: pt(i.K_hex), ct: { A, B } }, { c0: sc(p.c0), s0: sc(p.s0), c1: sc(p.c1), s1: sc(p.s1) }) ? { valid: true } : err('E_CDS');
    } catch (e) {
      return err(errCode(e));
    }
  },
  'limit.verify': (i) => (limitVerify({ ctx: hb(i.ctx_hex), binder: hb(i.binder_hex), cid: i.cid, L: i.L, K: pt(i.K_hex), Asum: pt(i.Asum_hex), Bsum: pt(i.Bsum_hex) }, { c: sc(i.proof.c), s: sc(i.proof.s) }) ? { valid: true } : err('E_LIMIT_PROOF')),
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
  'rules.evaluate': (i) => ({ result: evaluateContest({ quorum: i.manifest_quorum ?? undefined } as Manifest, i.contest, new Map(Object.entries(i.counts as Record<string, number>)), i.participation, i.roll_size) }),
  'ballot.encrypt': (i) => {
    if (i.voter_pk_hex === undefined) return { xi_hex: H(deriveXi(hb(i.ctx_hex), hb(i.voter_nonce_key_hex), hb(i.rho_hex), BigInt(i.attempt), hb(i.selvec_digest_hex))) };
    const p = params(i.params);
    const r = encryptBallot(p, hb(i.voter_pk_hex), i.supersedes, i.selections, hb(i.xi_hex));
    if (!r.ok) return err(r.error);
    const code = ballotCode(p.ctx, r.value);
    return {
      body_jcs_hex: H(new TextEncoder().encode(canonicalize(r.value))), ballot_code_hex: H(code), binder_hex: H(binderFor(p.ctx, hb(i.voter_pk_hex))),
      cast_sig_hex: H(ed25519Sign(hb(i.voter_secret_hex), castDigest(p.ctx, code))),
    };
  },
};

/** Operations this CLI does not run (they need generator-side adapters); counted and reported, never silently passed. */
const UNSUPPORTED = new Set(['dkg.adjudicate']);

interface Row { file: string; id: string; ok: boolean; detail?: string }

const posix = (p: string): string => p.split(sep).join('/');
const isObj = (v: unknown): v is Any => typeof v === 'object' && v !== null && !Array.isArray(v);
const malformed = (path: string, what: string): InputError => new InputError(`${path}: malformed ${what}`);
const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Regular files and directories under `dir`. Symlinks are never followed (a link cycle would not terminate); they are collected in `links`. */
const walk = (dir: string, links: string[]): string[] => readdirSync(dir).sort().flatMap((n) => {
  const p = join(dir, n);
  const st = lstatSync(p);
  if (st.isSymbolicLink()) {
    links.push(p);
    return [];
  }
  return st.isDirectory() ? walk(p, links) : [p];
});

/** A corpus path must stay inside the corpus, both lexically and after symlink resolution. A missing path passes here and fails at its read. */
function inside(base: string, p: string): boolean {
  const within = (b: string, q: string): boolean => {
    const r = relative(b, resolve(b, q));
    return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
  };
  if (!within(base, p)) return false;
  try {
    return within(realpathSync(base), realpathSync(resolve(base, p)));
  } catch {
    return true;
  }
}

/** Reads and parses a corpus file; an unreadable or non-JSON file is an input error naming the file (exit 4), not an internal one. */
const rdJson = (p: string): Any => {
  let text: string;
  try {
    text = readFileSync(p, 'utf8');
  } catch {
    throw new InputError(`cannot read ${p}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new InputError(`${p} is not valid JSON`);
  }
};

export function defaultVectorsDir(): string {
  return fileURLToPath(new URL('../../../test-vectors', import.meta.url));
}

export async function cmdVectorsCheck(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { json: 'bool', strict: 'bool' });
  if (p.positional.length > 1) needPositional(p, 1, 'vectors check [dir]');
  const root = p.positional[0] ?? defaultVectorsDir();
  const v1 = join(root, 'v1');
  if (!existsSync(join(root, 'MANIFEST.json')) || !existsSync(v1)) throw new InputError(`${root} is not a test-vectors directory (MANIFEST.json and v1/ expected)`);
  const required = [join(v1, 'elections'), join(v1, 'mutations'), join(v1, 'canary', 'canary-election.json'), join(v1, 'canary', 'expected-report.json')];
  if (!required.every((f) => existsSync(f)) || !inside(root, 'v1')) throw new InputError(`${root}: v1/elections, v1/mutations and v1/canary/ are required inside the directory`);
  const rows: Row[] = [];
  const skipped: string[] = [];
  const add = (file: string, id: string, ok: boolean, detail?: string): void => void rows.push({ file, id, ok, ...(detail === undefined ? {} : { detail }) });

  // 1. MANIFEST.json: every listed file has the listed SHA-256 and stays inside the corpus; every file is listed; no symlinks.
  const man = rdJson(join(root, 'MANIFEST.json'));
  if (!isObj(man) || !Array.isArray(man.files) || !man.files.every((f: Any) => isObj(f) && typeof f.path === 'string' && typeof f.sha256 === 'string')) {
    throw malformed(join(root, 'MANIFEST.json'), 'file list (each entry needs a string path and sha256)');
  }
  const listed = new Set<string>();
  for (const f of man.files as { path: string; sha256: string }[]) {
    listed.add(f.path);
    const fp = join(root, f.path);
    if (!inside(root, f.path)) add('MANIFEST.json', f.path, false, 'path resolves outside the corpus');
    else add('MANIFEST.json', f.path, isFile(fp) && H(sha256(readFileSync(fp))) === f.sha256, 'sha256 differs or file missing');
  }
  const links: string[] = [];
  for (const f of walk(root, links)) {
    const rel = posix(relative(root, f));
    if (rel !== 'MANIFEST.json') add('MANIFEST.json', `${rel} listed`, listed.has(rel), 'file not listed in MANIFEST.json');
  }
  for (const l of links) add('MANIFEST.json', `${posix(relative(root, l))} not a symlink`, false, 'symbolic links are not allowed in the corpus');

  // 2. Known-answer and negative vectors.
  for (const f of walk(v1, []).filter((x) => x.endsWith('.json') && !/\/(elections|mutations|canary)\//.test(posix(x)))) {
    const rel = posix(relative(v1, f));
    const file = rdJson(f);
    if (!isObj(file) || typeof file.operation !== 'string' || !Array.isArray(file.vectors)) throw malformed(f, 'vector file (operation and vectors)');
    for (const v of file.vectors) if (!isObj(v) || typeof v.id !== 'string' || !isObj(v.expect)) throw malformed(f, 'vector entry (id and expect)');
    const ids = file.vectors.map((v: Any) => v.id);
    add(rel, 'envelope', file.format_version === 1 && new Set(ids).size === ids.length, 'format_version != 1 or duplicate vector ids');
    const run = Object.hasOwn(runners, file.operation) ? runners[file.operation] : undefined;
    if (run === undefined || UNSUPPORTED.has(file.operation)) {
      skipped.push(`${rel} (${file.operation})`);
      continue;
    }
    for (const v of file.vectors as { id: string; input: Any; expect: { ok: boolean; output?: unknown; error?: string } }[]) {
      let got: Any;
      try {
        got = run(v.input);
      } catch (e) {
        add(rel, v.id, false, `threw: ${e instanceof Error ? e.message : 'error'}`);
        continue;
      }
      if (v.expect.ok) {
        const same = !(got && got.__err) && canonicalize(got) === canonicalize(v.expect.output);
        add(rel, v.id, same, got?.__err !== undefined ? `unexpected error ${got.__err}` : 'output differs');
      } else add(rel, v.id, !!got && got.__err === v.expect.error, `expected error ${v.expect.error}, got ${got?.__err ?? 'success'}`);
    }
  }

  // 3. Whole-election reports, mutants and the canary, through the verifier composition (what `qv verify` runs).
  const chkOf = (r: { chk: Record<string, string> }): string[] => Object.entries(r.chk).filter(([k, s]) => s === 'fail' && !k.startsWith('chk.board.')).map(([k]) => k).sort();
  const elections = join(v1, 'elections');
  for (const name of readdirSync(elections).sort()) {
    const dir = join(elections, name);
    const bundle = rdJson(join(dir, 'bundle.json'));
    const exp = rdJson(join(dir, 'expected-report.json'));
    if (!isObj(bundle)) throw malformed(join(dir, 'bundle.json'), 'bundle');
    if (!isObj(exp) || !isObj(exp.checks) || !isObj(exp.counts)) throw malformed(join(dir, 'expected-report.json'), 'report (checks and counts)');
    const r = await verifyBundle(bundle);
    const same = r.verdict === exp.verdict && JSON.stringify(Object.keys(exp.checks).map((k) => r.chk[k])) === JSON.stringify(Object.values(exp.checks))
      && canonicalize(r.results) === canonicalize(exp.results) && r.ctxPrefix === exp.ctx_prefix && r.counts.counted === exp.counts.counted;
    add('elections', name, same, `verdict ${r.verdict}, expected ${exp.verdict}, or checks/results differ`);
  }
  const mutations = join(v1, 'mutations');
  for (const f of readdirSync(mutations).sort()) {
    const path = join(mutations, f);
    const m = rdJson(path);
    if (!isObj(m) || typeof m.id !== 'string' || !isObj(m.bundle) || !isObj(m.expect) || !Array.isArray(m.expect.failed_checks)
      || !Array.isArray(m.expect.codes) || typeof m.expect.verdict !== 'string') throw malformed(path, 'mutation (id, bundle, expect)');
    const r = await verifyBundle(m.bundle);
    const failed = chkOf(r);
    const ok = JSON.stringify(failed) === JSON.stringify(m.expect.failed_checks) && r.verdict === m.expect.verdict
      && (m.expect.codes as string[]).every((c) => r.findings.some((x) => x.code === c)) && (failed.length > 0 || r.verdict !== 'PASS');
    add('mutations', m.id, ok, `failed [${failed.join(',')}], verdict ${r.verdict}; expected [${(m.expect.failed_checks as string[]).join(',')}] ${m.expect.verdict}`);
  }
  {
    const canaryPath = join(v1, 'canary', 'expected-report.json');
    const r = await verifyBundle(rdJson(join(v1, 'canary', 'canary-election.json')));
    const exp = rdJson(canaryPath);
    if (!isObj(exp) || !isObj(exp.checks)) throw malformed(canaryPath, 'report (checks)');
    add('canary', 'canary-election', r.verdict === exp.verdict && JSON.stringify(Object.keys(exp.checks).map((k) => r.chk[k])) === JSON.stringify(Object.values(exp.checks)), 'canary report differs from expected-report.json');
  }

  const failures = rows.filter((r) => !r.ok);
  const strictFail = p.has('strict') && skipped.length > 0;
  if (p.has('json')) printJson(io, { ok: failures.length === 0 && !strictFail, total: rows.length, failed: failures, skipped });
  else {
    for (const f of failures) io.out(`FAIL ${f.file} :: ${f.id}${f.detail === undefined ? '' : ` (${f.detail})`}\n`);
    for (const s of skipped) io.out(`SKIP ${s}: operation not supported by qv\n`);
    io.out(`vectors: ${rows.length - failures.length}/${rows.length} passed, ${failures.length} failed, ${skipped.length} file(s) not run${strictFail ? ' (--strict: not-run files fail)' : ''}\n`);
  }
  return failures.length === 0 && !strictFail ? EXIT.ok : EXIT.fail;
}
