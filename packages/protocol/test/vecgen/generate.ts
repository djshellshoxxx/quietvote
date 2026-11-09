// Deterministic generator for test-vectors/v1 (QV-34). Re-running it must produce zero diff (see vectors.test.ts).
// Expected values for external vectors are written from the cited standards; QuietVote vectors are produced by the
// reference implementation and (where marked) cross-asserted against hand-written expectations.
import {
  ORDER, baseMul, bytesToHex, canonicalize, cdsProve, decProve, dhProve, ed25519Keypair, ed25519Sign, ed25519Verify, elgamalEncrypt,
  framedPreimage, h256, h512, hexToBytes, hs, hsNz, limitProve, ctSum, LABELS, parseQvJson, pokProve, pointToBytes, scalarAdd,
  scalarRandomNonZero, scalarToBytes, sha256, sha512, streamRng, u32, utf8, QvCryptoError, pointFromBytes, scalarFromBytes, type Label,
} from '@quietvote/crypto';
import {
  analyzeBallotLog, auditSpoil, makeSpoil, spoilDigest, ballotCode, binderFor, castDigest, checkDealing, deriveXi, encryptBallot, evaluateContest, manifestHash,
  rollLeaf, rollRoot, mth, selvecDigest, validateManifest, verifyElection, verifyEnvelope, voterNonceKey, verifySpoilReveal,
  adjudicateDkg, NO_SUPERSEDES, type DkgInput, type ElectionBundle, type Manifest, type MarkerBody, type MarkerSeqs,
} from '../../src/index.ts';
import {
  bundleOf, buildManifest, castBallot, clone, closeElection, defaultContests, kp, multiSign, publishTally, setup, spoilBallot, type Faults, type Sim,
} from '../helpers/sim.ts';
import { generateLogLayer } from './loglayer.ts';

const H = bytesToHex;
const J = (o: unknown): string => JSON.stringify(o, null, 2) + '\n';
type Vec = { id: string; comment?: string | undefined; input: unknown; expect: unknown; tags?: string[]; requires?: string[] };

const ENCODING = { bytes: 'hex-lower', scalars: 'QV-16 §5.2 (32-byte LE, < l)', points: 'QV-16 §5.2 (ristretto255 canonical)', ints: 'decimal-string' };

function envelope(suite: string, operation: string, description: string, origin: 'external' | 'quietvote' | 'hybrid', vectors: Vec[], source?: unknown): unknown {
  const o: Record<string, unknown> = {
    $schema: 'https://quietvote.example/schema/vector-file.schema.json',
    format_version: 1, protocol_version: 'qv1', suite, operation, description, origin,
  };
  if (source !== undefined) o.source = source;
  o.status = 'candidate';
  o.generator = { commit: 'n/a', tool: 'vecgen@0.1.0', seed_ref: 'streamRng(SHA-512 counter) seeds named per vector' };
  o.independent_confirmations = [];
  o.encoding = ENCODING;
  o.vectors = vectors;
  return o;
}
const ok = (output: unknown): unknown => ({ ok: true, output });
const bad = (error: string, extra: Record<string, unknown> = {}): unknown => ({ ok: false, error, ...extra });

/** QV-16 error code -> QV-34 §9.2 registry code where one exists. */
export const ERROR_MAP: Record<string, string> = {
  E_POINT_DECODE: 'ERR_POINT_ENCODING', E_IDENTITY: 'ERR_POINT_ENCODING', E_SCALAR_RANGE: 'ERR_SCALAR_RANGE', E_LENGTH: 'ERR_LENGTH',
  E_DOMAIN_UNKNOWN: 'ERR_DOMAIN_UNKNOWN', E_SIG: 'ERR_SIG_INVALID', E_CDS: 'ERR_PROOF_INVALID', E_LIMIT_PROOF: 'ERR_PROOF_INVALID',
  E_VOTER_NOT_ELIGIBLE: 'ERR_NOT_IN_ROLL', E_CTX: 'ERR_ELECTION_BINDING', E_VERSION: 'ERR_UNSUPPORTED_VERSION',
  E_PARSE: 'ERR_CANON', E_SCHEMA: 'ERR_MANIFEST_FIELD', E_MANIFEST: 'ERR_MANIFEST_FIELD', E_SPOILED_CODE_CAST: 'ERR_SPOILED_AND_CAST',
  E_TALLY_INSUFFICIENT: 'ERR_THRESHOLD', E_DLOG_RANGE: 'ERR_TALLY_OVERFLOW', E_DKG_QUORUM: 'ERR_THRESHOLD',
};

const f = (...parts: string[]): string => parts.join('/');
const hx = (s: string): string => H(utf8(s));

export async function generateAll(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const put = (path: string, o: unknown): void => void out.set(path, J(o));

  // ------------------------------------------------------------------ hash
  const sha = (name: 'sha256' | 'sha512', cases: [string, string, string][]): void => {
    const fn = name === 'sha256' ? sha256 : sha512;
    const vs: Vec[] = cases.map(([id, msg, digest]) => {
      assert(H(fn(hexToBytes(msg))) === digest, `${name} ${id}`);
      return { id, input: { msg_hex: msg }, expect: ok({ digest_hex: digest }), tags: ['kat', 'external'] };
    });
    put(f('primitives', 'hash', `${name}.json`), envelope('primitives/hash', `hash.${name}`, `${name.toUpperCase()} known answers (FIPS 180-4 examples)`, 'external', vs, {
      name: 'FIPS 180-4 examples', url: 'https://csrc.nist.gov/publications/detail/fips/180/4/final', retrieved: '2026-10-21', source_sha256: 'not-computed (values re-derived from the standard text by the author; see README)',
    }));
  };
  sha('sha256', [
    ['sha256-abc', hx('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['sha256-empty', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['sha256-448bit', hx('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ]);
  sha('sha512', [
    ['sha512-abc', hx('abc'), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'],
    ['sha512-empty', '', 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'],
  ]);

  // tagged hash: one vector per registry label
  const tagged: Vec[] = [];
  const fieldsFor = (label: string): Uint8Array[] => [sha256(utf8(`field-a/${label}`)), utf8('contest-1'), Uint8Array.of(7)];
  for (const [label, kind] of Object.entries(LABELS)) {
    const fl = fieldsFor(label);
    const lab = label as Label;
    const pre = framedPreimage(lab, ...fl);
    const o: Record<string, string> = { preimage_hex: H(pre) };
    if (kind === 'H256') o.digest_hex = H(h256(lab, ...fl));
    else if (kind === 'H512') o.digest_hex = H(h512(lab, ...fl));
    else if (kind === 'hs') o.scalar_hex = H(scalarToBytes(hs(lab, ...fl)));
    else {
      o.scalar_hex = H(scalarToBytes(hsNz(lab, ...fl)));
      o.counter_field_hex = H(u32(0));
      o.preimage_hex = H(framedPreimage(lab, ...fl, u32(0)));
    }
    tagged.push({ id: `tagged-${label}`, comment: kind === 'hs_nz' ? 'preimage includes the trailing u32(counter=0) field' : undefined, input: { label, kind, fields_hex: fl.map(H) }, expect: ok(o), tags: ['kat', 'label-registry'] });
  }
  const a = h256('manifest', utf8('ab'), utf8('c'));
  const b = h256('manifest', utf8('a'), utf8('bc'));
  assert(H(a) !== H(b), 'ambiguity');
  tagged.push({ id: 'tagged-boundary-ab-c', input: { label: 'manifest', kind: 'H256', fields_hex: [hx('ab'), hx('c')] }, expect: ok({ digest_hex: H(a), preimage_hex: H(framedPreimage('manifest', utf8('ab'), utf8('c'))) }), tags: ['field-boundary'] });
  tagged.push({ id: 'tagged-boundary-a-bc', comment: 'differs from tagged-boundary-ab-c', input: { label: 'manifest', kind: 'H256', fields_hex: [hx('a'), hx('bc')] }, expect: ok({ digest_hex: H(b), preimage_hex: H(framedPreimage('manifest', utf8('a'), utf8('bc'))) }), tags: ['field-boundary'] });
  const z32 = new Uint8Array(32);
  tagged.push({ id: 'tagged-cds01-length-383', comment: 'QV-16 Appendix A.4 length check', input: { label: 'cds01', kind: 'hs', fields_hex: [z32, z32, utf8('budget'), utf8('yes'), z32, z32, z32, z32, z32, z32, z32].map(H) }, expect: ok({ preimage_hex: H(framedPreimage('cds01', z32, z32, utf8('budget'), utf8('yes'), z32, z32, z32, z32, z32, z32, z32)), scalar_hex: H(scalarToBytes(hs('cds01', z32, z32, utf8('budget'), utf8('yes'), z32, z32, z32, z32, z32, z32, z32))) }), tags: ['length', 'preimage-bytes:383'] });
  tagged.push({ id: 'tagged-unknown-label', input: { label: 'nope', kind: 'H256', fields_hex: [] }, expect: bad('E_DOMAIN_UNKNOWN'), tags: ['negative'] });
  put(f('primitives', 'hash', 'tagged-hash.json'), envelope('primitives/hash', 'hash.tagged', 'Framed hashes for every QV-16 §5.4 label', 'quietvote', tagged));

  // ------------------------------------------------------------------ ristretto / scalars
  const mult: Vec[] = [];
  for (let k = 0; k <= 16; k++) {
    mult.push({ id: `base-mul-${k}`, input: { scalar_hex: H(scalarToBytes(BigInt(k))) }, expect: ok({ point_hex: H(pointToBytes(baseMul(BigInt(k)))) }), tags: ['kat', k <= 3 ? 'rfc9496-checked' : 'generated'] });
  }
  put(f('primitives', 'ristretto', 'base-multiples.json'), envelope('primitives/ristretto', 'ristretto.encode_base_mul', '[k]G for k = 0..16 (k = 1, 2, 3 equal the RFC 9496 Appendix A values)', 'hybrid', mult));
  const BAD = [
    '00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'f3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    '0100000000000000000000000000000000000000000000000000000000000000', '01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    '26948d35ca62e643e26a83177332e6b6afeb9d08e4268b650f1f5bbd8d81d371', '4eac077a713c57b4f4397629a4145982c661f48044dd3f96427d40b147d9742f',
    'de6a7b00deadc788eb6b6c8d20c0ae96c2f2019078fa604fee5b87d6e989ad7b', 'bcab477be20861e01e4a0e295284146a510150d9817763caf1a6f4b422d67042',
    '2a292df7e32cababbd9de088d1d1abec9fc0440f637ed2fba145094dc14bea08', 'f4a9e534fc0d216c44b218fa0c42d99635a0127ee2e53c712f70609649fdff22',
    '8268436f8c4126196cf64b3c7ddbda90746a378625f9813dd9b8457077256731', '2810e5cbc2cc4d4eece54f61c6f69758e289aa7ab440b3cbeaa21995c2f4232b',
    '3eb858e78f5a7254d8c9731174a94f76755fd3941c0ac93735c07ba14579630e', 'a45fdc55c76448c049a1ab33f17023edfb2be3581e9c7aade8a6125215e04220',
    'd483fe813c6ba647ebbfd3ec41adca1c6130c2beeee9d9bf065c8d151c5f396e', '8a2e1d30050198c65a54483123960ccc38aef6848e1ec8f5f780e8523769ba32',
    '32888462f8b486c68ad7dd9610be5192bbeaf3b443951ac1a8118419d9fa097b', '227142501b9d4355ccba290404bde41575b037693cef1f438c47f8fbf35d1165',
    '5c37cc491da847cfeb9281d407efc41e15144c876e0170b499a96a22ed31e01e', '445425117cb8c90edcbc7c1cc0e74f747f2c1efa5630a967c64f287792a48a4b',
  ];
  const decV: Vec[] = BAD.map((h, i) => {
    let threw = false;
    try { pointFromBytes(hexToBytes(h)); } catch { threw = true; }
    assert(threw, `invalid encoding ${i} must be rejected`);
    return { id: `decode-invalid-${i}`, input: { point_hex: h }, expect: bad('E_POINT_DECODE'), tags: ['negative', 'attack:non-canonical'] };
  });
  decV.push({ id: 'decode-identity-ok', input: { point_hex: '00'.repeat(32) }, expect: ok({ is_identity: true }), tags: ['identity'] });
  decV.push({ id: 'decode-identity-forbidden', input: { point_hex: '00'.repeat(32), non_identity: true }, expect: bad('E_IDENTITY'), tags: ['negative', 'attack:identity'] });
  decV.push({ id: 'decode-31-bytes', input: { point_hex: '00'.repeat(31) }, expect: bad('E_POINT_DECODE'), tags: ['negative'] });
  decV.push({ id: 'decode-33-bytes', input: { point_hex: '00'.repeat(33) }, expect: bad('E_POINT_DECODE'), tags: ['negative'] });
  put(f('primitives', 'ristretto', 'decode.json'), envelope('primitives/ristretto', 'ristretto.decode', 'Strict ristretto255 decoding (RFC 9496 §4.3.1): invalid, identity and wrong-length inputs', 'hybrid', decV));

  const le = (x: bigint): string => { const o = new Uint8Array(32); let v = x; for (let i = 0; i < 32; i++, v >>= 8n) o[i] = Number(v & 255n); return H(o); };
  const scal: Vec[] = [
    ['zero', 0n], ['one', 1n], ['l-minus-1', ORDER - 1n],
  ].map(([id, v]) => ({ id: `scalar-${id as string}`, input: { scalar_hex: le(v as bigint) }, expect: ok({ canonical: true }), tags: ['kat'] }));
  scal.push({ id: 'scalar-l', input: { scalar_hex: le(ORDER) }, expect: bad('E_SCALAR_RANGE'), tags: ['negative'] });
  scal.push({ id: 'scalar-2^256-1', input: { scalar_hex: 'ff'.repeat(32) }, expect: bad('E_SCALAR_RANGE'), tags: ['negative'] });
  scal.push({ id: 'scalar-31-bytes', input: { scalar_hex: '00'.repeat(31) }, expect: bad('E_LENGTH'), tags: ['negative'] });
  put(f('primitives', 'ristretto', 'scalars.json'), envelope('primitives/ristretto', 'scalar.decode', 'Strict scalar decoding (never reduce)', 'quietvote', scal));

  // ------------------------------------------------------------------ ed25519
  const e1 = ed25519Keypair(hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'));
  const e2 = ed25519Keypair(hexToBytes('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'));
  const sig1 = ed25519Sign(e1.secretKey, new Uint8Array(0));
  const sig2 = ed25519Sign(e2.secretKey, Uint8Array.of(0x72));
  assert(H(e1.publicKey) === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'rfc8032 t1 pk');
  assert(H(sig2) === '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00', 'rfc8032 t2 sig');
  const edv: Vec[] = [
    { id: 'rfc8032-test1', input: { secret_hex: H(e1.secretKey), msg_hex: '' }, expect: ok({ public_hex: H(e1.publicKey), sig_hex: H(sig1) }), tags: ['kat', 'external'] },
    { id: 'rfc8032-test2', input: { secret_hex: H(e2.secretKey), msg_hex: '72' }, expect: ok({ public_hex: H(e2.publicKey), sig_hex: H(sig2) }), tags: ['kat', 'external'] },
  ];
  put(f('primitives', 'ed25519', 'sign.json'), envelope('primitives/ed25519', 'ed25519.sign', 'RFC 8032 §7.1 tests 1 and 2', 'external', edv, { name: 'RFC 8032 §7.1', url: 'https://www.rfc-editor.org/rfc/rfc8032#section-7.1', retrieved: '2026-10-21', source_sha256: 'not-computed' }));
  let S = 0n;
  for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(sig1[i]!);
  const mall = sig1.slice();
  let S2 = S + ORDER;
  for (let i = 32; i < 64; i++, S2 >>= 8n) mall[i] = Number(S2 & 255n);
  const smallPk = new Uint8Array(32); smallPk[0] = 1;
  const ver = (id: string, pk: Uint8Array, sg: Uint8Array, msg: string, expectOk: boolean, tags: string[]): Vec => {
    assert(ed25519Verify(pk, sg, hexToBytes(msg)) === expectOk, `ed25519 ${id}`);
    return { id, input: { public_hex: H(pk), sig_hex: H(sg), msg_hex: msg }, expect: expectOk ? ok({ valid: true }) : bad('E_SIG'), tags };
  };
  put(f('primitives', 'ed25519', 'verify.json'), envelope('primitives/ed25519', 'ed25519.verify', 'Strict RFC 8032 verification (QV-ADR-018)', 'quietvote', [
    ver('verify-ok', e1.publicKey, sig1, '', true, ['kat']),
    ver('verify-wrong-message', e1.publicKey, sig1, '00', false, ['negative']),
    ver('verify-s-plus-l', e1.publicKey, mall, '', false, ['negative', 'malleability', 'policy:strict']),
    ver('verify-small-order-pk', smallPk, new Uint8Array(64).fill(0).map((_, i) => (i === 0 ? 1 : 0)), '', false, ['negative', 'policy:strict']),
    ver('verify-short-signature', e1.publicKey, sig1.slice(0, 63), '', false, ['negative']),
  ]));

  // ------------------------------------------------------------------ canonical JSON
  const cj: [string, string, string | null][] = [
    ['key-order', '{"b":1,"a":2}', '{"a":2,"b":1}'],
    ['nested-key-order', '{"z":{"y":1,"x":[{"b":true,"a":false}]}}', '{"z":{"x":[{"a":false,"b":true}],"y":1}}'],
    ['utf16-order', '{"\\uff5e":1,"\\ud83d\\ude00":2}', '{"😀":2,"～":1}'],
    ['escapes', '{"s":"\\u0001\\n\\t\\"\\\\\\/"}', '{"s":"\\u0001\\n\\t\\"\\\\/"}'],
    ['unicode-literal', '{"s":"é€"}', '{"s":"é€"}'],
    ['whitespace', ' [ 1 , 2 ,\n3 ] ', '[1,2,3]'],
    ['empty-object', '{}', '{}'],
    ['empty-array', '[]', '[]'],
    ['max-safe-int', '9007199254740991', '9007199254740991'],
    ['negative-int', '-17', '-17'],
    ['booleans', '[true,false]', '[true,false]'],
    ['reject-duplicate-key', '{"a":1,"a":2}', null],
    ['reject-nested-duplicate-key', '{"x":{"a":1,"a":1}}', null],
    ['reject-float', '1.0', null],
    ['reject-exponent', '1e2', null],
    ['reject-null', '{"a":null}', null],
    ['reject-negative-zero', '-0', null],
    ['reject-unsafe-int', '9007199254740992', null],
    ['reject-lone-surrogate', '"\\ud800"', null],
    ['reject-non-nfc', '"é"', null],
    ['reject-leading-zero', '01', null],
    ['reject-trailing-data', '[1] 2', null],
    ['reject-control-char', '"\t"', null],
  ];
  put(f('primitives', 'encoding', 'canonical-json.json'), envelope('primitives/encoding', 'enc.canon_json', 'QV-JSON strict parse + RFC 8785 serialisation', 'quietvote', cj.map(([id, text, canon]) => {
    let got: string | null = null;
    try { got = canonicalize(parseQvJson(text)); } catch { got = null; }
    assert(got === canon, `canon ${id}`);
    return { id, input: { text }, expect: canon === null ? bad('E_PARSE') : ok({ canonical: canon }), tags: [canon === null ? 'negative' : 'kat'] };
  })));

  // ------------------------------------------------------------------ roll merkle
  const rollV: Vec[] = [];
  for (const n of [1, 2, 3, 5, 8]) {
    const keys = Array.from({ length: n }, (_, i) => ed25519Keypair(sha256(utf8(`vec-roll-${i}`))).publicKey).map(H).sort();
    const r = rollRoot(keys);
    assert(r.ok, 'roll');
    rollV.push({ id: `roll-${n}`, input: { voter_pks: keys }, expect: ok({ root_hex: r.ok ? H(r.value) : '', leaf_hashes: keys.map((k) => H(rollLeaf(hexToBytes(k)))) }), tags: ['kat', 'rfc9162-split'] });
  }
  const k2 = [1, 2].map((i) => H(ed25519Keypair(sha256(utf8(`vec-roll-${i}`))).publicKey)).sort();
  rollV.push({ id: 'roll-duplicate', input: { voter_pks: [k2[0]!, k2[0]!] }, expect: bad('E_ROLL'), tags: ['negative'] });
  rollV.push({ id: 'roll-unsorted', input: { voter_pks: [k2[1]!, k2[0]!] }, expect: bad('E_ROLL'), tags: ['negative'] });
  rollV.push({ id: 'roll-small-order-key', input: { voter_pks: ['01' + '00'.repeat(31)] }, expect: bad('E_ROLL'), tags: ['negative', 'attack:small-order'] });
  put(f('protocol', 'board', 'roll-merkle.json'), envelope('protocol/board', 'roll.merkle_root', 'Voter roll Merkle root (RFC 9162 §2.1.1, leaf = pk || u32(1))', 'quietvote', rollV));
  void mth;

  // ------------------------------------------------------------------ manifest
  const coord = [kp('vec', 'coord')];
  const tks = [1, 2, 3].map((i) => kp('vec', `t${i}`));
  const m0 = buildManifest({ seed: 'vec-manifest', n: 3, t: 2, voters: 10 }, coord, tks, 10, '00'.repeat(32));
  const mv: Vec[] = [{ id: 'manifest-valid', input: { manifest: m0, roll_size: 10 }, expect: ok({ manifest_hash: H(manifestHash(m0)), jcs_hex: H(utf8(canonicalize(m0))) }), tags: ['kat'] }];
  const negs: [string, (m: Manifest) => void][] = [
    ['unknown-proto', (m) => (m.proto = 'qv2-x')], ['unknown-field', (m) => ((m as unknown as Record<string, unknown>).evil = 1)], ['t-greater-than-n', (m) => (m.t = 4)],
    ['duplicate-trustee-key', (m) => (m.trustees[1]!.sign_pk = m.trustees[0]!.sign_pk)], ['time-order', (m) => (m.voting_close = m.voting_open)],
    ['duplicate-contest', (m) => (m.contests[1]!.id = m.contests[0]!.id)], ['beacon-tie-break', (m) => (m.contests[1]!.tie_break = { type: 'beacon' })],
    ['k-equals-n', (m) => (m.contests[3]!.selection_limit = 5)], ['bidi-label', (m) => (m.contests[0]!.options[0]!.label = 'Y‮es')],
    ['uppercase-hex', (m) => (m.election_id = m.election_id.toUpperCase())], ['floor-without-ack', (m) => (m.privacy_ack = false)],
  ];
  for (const [id, mut] of negs) {
    const m = clone(m0);
    mut(m);
    const v = validateManifest(m, 10);
    assert(!v.ok, `manifest negative ${id}`);
    mv.push({ id: `manifest-${id}`, input: { manifest: m, roll_size: 10 }, expect: bad(v.ok ? '' : v.error), tags: ['negative'] });
  }
  put(f('protocol', 'manifest', 'manifest.json'), envelope('protocol/manifest', 'manifest.validate_hash', 'Manifest validation and hash', 'quietvote', mv));

  // ------------------------------------------------------------------ proofs (verify vectors)
  const prng = streamRng('vec-proofs');
  const ctx = h256('election-ctx', utf8('vec'));
  const binder = h256('binder-roll', ctx, utf8('voter'));
  const K = baseMul(scalarRandomNonZero(prng));
  const cdsV: Vec[] = [];
  for (const m of [0, 1] as const) {
    const r = scalarRandomNonZero(prng);
    const ct = elgamalEncrypt(K, m, r);
    const xi = sha512(utf8(`vec-cds-${m}`));
    const pr = cdsProve({ ctx, binder, cid: 'budget', oid: 'yes', K, ct }, m, r, xi);
    const base = { ctx_hex: H(ctx), binder_hex: H(binder), cid: 'budget', oid: 'yes', K_hex: H(pointToBytes(K)), alpha_hex: H(pointToBytes(ct.A)), beta_hex: H(pointToBytes(ct.B)), proof: { c0: le(pr.c0), s0: le(pr.s0), c1: le(pr.c1), s1: le(pr.s1) } };
    cdsV.push({ id: `cds-valid-m${m}`, input: base, expect: ok({ valid: true }), tags: ['kat'] });
    if (m === 1) {
      cdsV.push({ id: 'cds-mutated-binder', input: { ...base, binder_hex: H(h256('binder-roll', ctx, utf8('mallory'))) }, expect: bad('E_CDS'), tags: ['negative', 'attack:ballot-copy'] });
      cdsV.push({ id: 'cds-mutated-ctx', input: { ...base, ctx_hex: H(h256('election-ctx', utf8('other'))) }, expect: bad('E_CDS'), tags: ['negative', 'attack:replay'] });
      cdsV.push({ id: 'cds-mutated-oid', input: { ...base, oid: 'no' }, expect: bad('E_CDS'), tags: ['negative', 'attack:frozen-heart'] });
      cdsV.push({ id: 'cds-mutated-cid', input: { ...base, cid: 'budgex' }, expect: bad('E_CDS'), tags: ['negative', 'attack:frozen-heart'] });
      cdsV.push({ id: 'cds-mutated-K', input: { ...base, K_hex: H(pointToBytes(baseMul(5n))) }, expect: bad('E_CDS'), tags: ['negative', 'attack:frozen-heart'] });
      cdsV.push({ id: 'cds-mutated-beta', input: { ...base, beta_hex: H(pointToBytes(baseMul(5n))) }, expect: bad('E_CDS'), tags: ['negative', 'attack:frozen-heart'] });
      cdsV.push({ id: 'cds-identity-alpha', input: { ...base, alpha_hex: '00'.repeat(32) }, expect: bad('E_IDENTITY'), tags: ['negative', 'attack:identity'] });
      cdsV.push({ id: 'cds-scalar-ge-l', input: { ...base, proof: { ...base.proof, s0: le(ORDER) } }, expect: bad('E_SCALAR_RANGE'), tags: ['negative'] });
      cdsV.push({ id: 'cds-swapped-branches', input: { ...base, proof: { c0: base.proof.c1, s0: base.proof.s1, c1: base.proof.c0, s1: base.proof.s0 } }, expect: bad('E_CDS'), tags: ['negative'] });
    }
  }
  // plaintext 2 with a prover that claims m = 1
  { const r = scalarRandomNonZero(prng); const ct = { A: baseMul(r), B: baseMul(2n + 0n) .add(K.multiply(r)) }; const pr = cdsProve({ ctx, binder, cid: 'budget', oid: 'yes', K, ct }, 1, r, sha512(utf8('vec-cds-2')));
    cdsV.push({ id: 'cds-plaintext-2', input: { ctx_hex: H(ctx), binder_hex: H(binder), cid: 'budget', oid: 'yes', K_hex: H(pointToBytes(K)), alpha_hex: H(pointToBytes(ct.A)), beta_hex: H(pointToBytes(ct.B)), proof: { c0: le(pr.c0), s0: le(pr.s0), c1: le(pr.c1), s1: le(pr.s1) } }, expect: bad('E_CDS'), tags: ['negative', 'attack:invalid-plaintext'] }); }
  put(f('protocol', 'proofs', 'cds-disjunctive', 'cds.json'), envelope('protocol/proofs/cds-disjunctive', 'cds.verify', '0/1 disjunctive proofs (QV-16 §5.10.1) incl. statement-binding negatives', 'quietvote', cdsV));

  // limit proof
  const lim: Vec[] = [];
  { const ms = [1, 0, 0]; const rs = ms.map(() => scalarRandomNonZero(prng)); const sum = ctSum(ms.map((m, i) => elgamalEncrypt(K, m, rs[i]!))); const R = rs.reduce((x, y) => scalarAdd(x, y), 0n);
    const st = { ctx, binder, cid: 'budget', L: 1, K, Asum: sum.A, Bsum: sum.B };
    const pr = limitProve(st, R, sha512(utf8('vec-limit')));
    const base = { ctx_hex: H(ctx), binder_hex: H(binder), cid: 'budget', L: 1, K_hex: H(pointToBytes(K)), Asum_hex: H(pointToBytes(sum.A)), Bsum_hex: H(pointToBytes(sum.B)), proof: { c: le(pr.c), s: le(pr.s) } };
    lim.push({ id: 'limit-valid', input: base, expect: ok({ valid: true }), tags: ['kat'] });
    lim.push({ id: 'limit-wrong-L', input: { ...base, L: 2 }, expect: bad('E_LIMIT_PROOF'), tags: ['negative', 'attack:frozen-heart'] });
    lim.push({ id: 'limit-wrong-cid', input: { ...base, cid: 'other' }, expect: bad('E_LIMIT_PROOF'), tags: ['negative'] });
    lim.push({ id: 'limit-wrong-binder', input: { ...base, binder_hex: H(h256('binder-roll', ctx, utf8('mallory'))) }, expect: bad('E_LIMIT_PROOF'), tags: ['negative', 'attack:ballot-copy'] });
    const ms2 = [1, 1, 0]; const rs2 = ms2.map(() => scalarRandomNonZero(prng)); const sum2 = ctSum(ms2.map((m, i) => elgamalEncrypt(K, m, rs2[i]!)));
    const pr2 = limitProve({ ctx, binder, cid: 'budget', L: 1, K, Asum: sum2.A, Bsum: sum2.B }, rs2.reduce((x, y) => scalarAdd(x, y), 0n), sha512(utf8('vec-limit-over')));
    lim.push({ id: 'limit-overvote', input: { ...base, Asum_hex: H(pointToBytes(sum2.A)), Bsum_hex: H(pointToBytes(sum2.B)), proof: { c: le(pr2.c), s: le(pr2.s) } }, expect: bad('E_LIMIT_PROOF'), tags: ['negative', 'attack:overvote'] }); }
  put(f('protocol', 'proofs', 'contest-limit', 'limit.json'), envelope('protocol/proofs/contest-limit', 'limit.verify', 'Selection-limit proofs (QV-16 §5.10.2)', 'quietvote', lim));

  // schnorr pok + dleq + partial decryption
  const mh = h256('manifest', utf8('vec-pok'));
  const pokV: Vec[] = [];
  { const a = scalarRandomNonZero(prng); const A = baseMul(a); const p = pokProve(mh, 2, 1, a, A, prng);
    const base = { manifest_hash_hex: H(mh), i: 2, k: 1, A_hex: H(pointToBytes(A)), proof: { c: le(p.c), s: le(p.s) } };
    pokV.push({ id: 'pok-valid', input: base, expect: ok({ valid: true }), tags: ['kat'] });
    pokV.push({ id: 'pok-replay-other-index', input: { ...base, i: 3 }, expect: bad('E_DKG_R1'), tags: ['negative', 'attack:dkg-replay'] });
    pokV.push({ id: 'pok-replay-other-coefficient', input: { ...base, k: 0 }, expect: bad('E_DKG_R1'), tags: ['negative', 'attack:dkg-replay'] });
    pokV.push({ id: 'pok-other-manifest', input: { ...base, manifest_hash_hex: H(h256('manifest', utf8('other'))) }, expect: bad('E_DKG_R1'), tags: ['negative'] });
    pokV.push({ id: 'pok-rogue-key', comment: 'A replaced by Y - A_honest, proof reused', input: { ...base, A_hex: H(pointToBytes(baseMul(9n).subtract(A))) }, expect: bad('E_DKG_R1'), tags: ['negative', 'attack:rogue-key'] });
    pokV.push({ id: 'pok-identity', input: { ...base, A_hex: '00'.repeat(32) }, expect: bad('E_DKG_R1'), tags: ['negative', 'attack:identity'] }); }
  put(f('protocol', 'proofs', 'schnorr-pok', 'pok.json'), envelope('protocol/proofs/schnorr-pok', 'pok.verify', 'DKG proofs of possession (QV-16 §5.7.2)', 'quietvote', pokV));

  const dh: Vec[] = [];
  { const e = scalarRandomNonZero(prng); const E = baseMul(e); const R = baseMul(scalarRandomNonZero(prng)); const Sx = R.multiply(e); const p = dhProve(mh, 1, 2, E, R, Sx, e, prng);
    const base = { manifest_hash_hex: H(mh), i: 1, j: 2, E_hex: H(pointToBytes(E)), R_hex: H(pointToBytes(R)), S_hex: H(pointToBytes(Sx)), proof: { c: le(p.c), s: le(p.s) } };
    dh.push({ id: 'dleq-valid', input: base, expect: ok({ valid: true }), tags: ['kat'] });
    dh.push({ id: 'dleq-wrong-S', input: { ...base, S_hex: H(pointToBytes(Sx.add(R))) }, expect: bad('E_DKG_COMPLAINT'), tags: ['negative'] });
    dh.push({ id: 'dleq-swapped-parties', input: { ...base, i: 2, j: 1 }, expect: bad('E_DKG_COMPLAINT'), tags: ['negative', 'attack:frozen-heart'] }); }
  put(f('protocol', 'proofs', 'cp-dleq', 'dh-reveal.json'), envelope('protocol/proofs/cp-dleq', 'cp.verify_dh', 'Complaint DH-reveal DLEQ (QV-16 §5.7.5)', 'quietvote', dh));

  const dec: Vec[] = [];
  { const sj = scalarRandomNonZero(prng); const Yj = baseMul(sj); const ct = elgamalEncrypt(K, 3, scalarRandomNonZero(prng));
    const { M, proof } = decProve({ ctx, cid: 'budget', oid: 'yes', j: 2, Yj, A: ct.A, B: ct.B }, sj, prng);
    const base = { ctx_hex: H(ctx), cid: 'budget', oid: 'yes', j: 2, Yj_hex: H(pointToBytes(Yj)), A_hex: H(pointToBytes(ct.A)), B_hex: H(pointToBytes(ct.B)), M_hex: H(pointToBytes(M)), proof: { c: le(proof.c), s: le(proof.s) } };
    dec.push({ id: 'dec-valid', input: base, expect: ok({ valid: true }), tags: ['kat'] });
    dec.push({ id: 'dec-wrong-share', input: { ...base, M_hex: H(pointToBytes(M.add(ct.A))) }, expect: bad('E_DEC_PROOF'), tags: ['negative', 'attack:wrong-partial'] });
    dec.push({ id: 'dec-other-ciphertext', input: { ...base, B_hex: H(pointToBytes(ct.B.add(ct.A))) }, expect: bad('E_DEC_PROOF'), tags: ['negative'] });
    dec.push({ id: 'dec-index-mismatch', input: { ...base, j: 3 }, expect: bad('E_DEC_PROOF'), tags: ['negative'] }); }
  put(f('protocol', 'tally', 'partial-decrypt', 'dec.json'), envelope('protocol/tally', 'tally.partial_verify', 'Partial decryption proofs (QV-16 §5.16)', 'quietvote', dec));

  // ------------------------------------------------------------------ ballots + benaloh
  const sim = await setup({ seed: 'vec-ballot', n: 3, t: 2, voters: 3, contests: defaultContests().filter((c) => c.id === 'budget' || c.id === 'board') });
  const p = sim.params!;
  const paramsJson = { manifest: p.manifest, K_hex: H(pointToBytes(p.K)), ctx_hex: H(p.ctx) };
  const v0 = sim.voters[0]!;
  const SEL: Record<string, string[]> = { budget: ['yes'], board: ['p', 'q'] };
  const sv = selvecDigest(p.manifest, p.ctx, SEL);
  assert(sv.ok, 'selvec');
  const rho = sha256(utf8('vec-rho'));
  const vnk = voterNonceKey(v0.secretKey);
  const xi = deriveXi(p.ctx, vnk, rho, 0, sv.ok ? sv.value : new Uint8Array(32));
  const enc = encryptBallot(p, v0.publicKey, NO_SUPERSEDES, SEL, xi);
  assert(enc.ok, 'encrypt');
  const body = enc.ok ? enc.value : (undefined as never);
  const code = ballotCode(p.ctx, body);
  const sig = ed25519Sign(v0.secretKey, castDigest(p.ctx, code));
  put(f('protocol', 'ballot', 'ballot-encrypt.json'), envelope('protocol/ballot', 'ballot.encrypt', 'Deterministic ballot from (xi, selections), tracking code and cast signature', 'quietvote', [
    { id: 'ballot-derive-xi', input: { ctx_hex: H(p.ctx), voter_nonce_key_hex: H(vnk), rho_hex: H(rho), attempt: '0', selvec_digest_hex: sv.ok ? H(sv.value) : '' }, expect: ok({ xi_hex: H(xi) }), tags: ['kat'] },
    { id: 'ballot-yes-p-q', input: { params: paramsJson, voter_pk_hex: H(v0.publicKey), voter_secret_hex: H(v0.secretKey), supersedes: NO_SUPERSEDES, selections: SEL, xi_hex: H(xi) }, expect: ok({ body_jcs_hex: H(utf8(canonicalize(body))), ballot_code_hex: H(code), binder_hex: H(binderFor(p.ctx, v0.publicKey)), cast_sig_hex: H(sig) }), tags: ['kat'] },
  ]));

  const roll = new Set(sim.rollHex);
  const env0 = { intent: 'cast', body, sig: H(sig) };
  const bv: Vec[] = [{ id: 'verify-valid', input: { params: paramsJson, roll: sim.rollHex, envelope: env0 }, expect: ok({ ballot_code_hex: H(code) }), tags: ['kat'] }];
  const tamper = (id: string, mutate: (e: typeof env0) => void, expectErr: string, tags: string[], resign = true): void => {
    const e = clone(env0);
    mutate(e);
    if (resign) e.sig = H(ed25519Sign(v0.secretKey, castDigest(p.ctx, ballotCode(p.ctx, e.body))));
    const r = verifyEnvelope(p, roll, e);
    assert(!r.ok && r.error === expectErr, `ballot tamper ${id}: got ${r.ok ? 'ok' : r.error}`);
    bv.push({ id: `verify-${id}`, input: { params: paramsJson, roll: sim.rollHex, envelope: e }, expect: bad(expectErr), tags: ['negative', ...tags] });
  };
  tamper('alpha-replaced', (e) => (e.body.contests[0]!.sel[0]!.a = H(pointToBytes(baseMul(1n)))), 'E_CDS', ['attack:forged-proof']);
  tamper('alpha-identity', (e) => (e.body.contests[0]!.sel[0]!.a = '00'.repeat(32)), 'E_IDENTITY', ['attack:identity']);
  tamper('alpha-non-canonical', (e) => (e.body.contests[0]!.sel[0]!.a = 'ff'.repeat(32)), 'E_POINT_DECODE', ['attack:non-canonical']);
  tamper('scalar-2^256-1', (e) => (e.body.contests[0]!.sel[0]!.s0 = 'ff'.repeat(32)), 'E_SCALAR_RANGE', []);
  tamper('limit-proof-c', (e) => (e.body.contests[1]!.lim!.c = (e.body.contests[1]!.lim!.c[0] === '0' ? '1' : '0') + e.body.contests[1]!.lim!.c.slice(1)), 'E_LIMIT_PROOF', ['attack:overvote']);
  tamper('placeholder-dropped', (e) => e.body.contests[1]!.ph!.pop(), 'E_STRUCTURE', []);
  tamper('contest-missing', (e) => e.body.contests.pop(), 'E_STRUCTURE', []);
  tamper('wrong-ctx', (e) => (e.body.ctx = '22'.repeat(32)), 'E_CTX', ['attack:replay'], false);
  tamper('body-changed-after-signing', (e) => (e.body.supersedes = '11'.repeat(32)), 'E_SIG', [], false);
  tamper('unknown-field', (e) => ((e as unknown as Record<string, unknown>).x = 1), 'E_SCHEMA', [], false);
  const notOnRoll = verifyEnvelope(p, new Set(sim.rollHex.slice(1).filter((k) => k !== H(v0.publicKey))), env0);
  assert(!notOnRoll.ok && notOnRoll.error === 'E_VOTER_NOT_ELIGIBLE', 'not on roll');
  bv.push({ id: 'verify-voter-not-on-roll', input: { params: paramsJson, roll: sim.rollHex.filter((k) => k !== H(v0.publicKey)), envelope: env0 }, expect: bad('E_VOTER_NOT_ELIGIBLE'), tags: ['negative'] });
  // ballot copy: Alice's content re-signed by Bob
  { const v1 = sim.voters[1]!; const e = clone(env0); e.body.voter = H(v1.publicKey); e.sig = H(ed25519Sign(v1.secretKey, castDigest(p.ctx, ballotCode(p.ctx, e.body))));
    const r = verifyEnvelope(p, roll, e); assert(!r.ok && r.error === 'E_CDS', 'copy');
    bv.push({ id: 'verify-ballot-copy-resigned', input: { params: paramsJson, roll: sim.rollHex, envelope: e }, expect: bad('E_CDS'), tags: ['negative', 'attack:ballot-copy'] }); }
  put(f('protocol', 'ballot', 'ballot-verify.json'), envelope('protocol/ballot', 'ballot.verify', 'Ballot verification (QV-16 §5.14.4 checks 1-9) incl. tampered variants', 'quietvote', bv));

  // benaloh
  const built = { xi, selections: SEL };
  const bn: Vec[] = [{ id: 'spoil-reveal-reproduces', input: { params: paramsJson, body, reveal: { xi: H(built.xi), selections: SEL } }, expect: ok({ reproduced: true }), tags: ['kat'] }];
  const revs: [string, { xi: string; selections: Record<string, string[]> }][] = [
    ['wrong-selections', { xi: H(xi), selections: { ...SEL, budget: ['no'] } }],
    ['wrong-xi', { xi: H(sha512(utf8('x'))), selections: SEL }],
  ];
  for (const [id, rev] of revs) {
    const r = verifySpoilReveal(p, body, rev);
    assert(!r.ok, `benaloh ${id}`);
    bn.push({ id: `spoil-${id}`, input: { params: paramsJson, body, reveal: rev }, expect: bad('E_SPOIL_MISMATCH'), tags: ['negative'] });
  }
  // private audit (QV-10 / QV-ADR-020): private-mode spoil envelope (no reveal on the log) + out-of-band reveal
  {
    const rev = { xi: H(xi), selections: SEL };
    const pe = makeSpoil(p, v0.secretKey, { body, code, xi, selections: SEL, voterPk: v0.publicKey }, 'private');
    const au = auditSpoil(p, roll, pe, rev);
    assert(au.ok, 'private audit');
    const badDigest = clone(pe);
    badDigest.reveal_digest = '11'.repeat(32);
    badDigest.sig = H(ed25519Sign(v0.secretKey, spoilDigest(p.ctx, code, hexToBytes(badDigest.reveal_digest, 32)))); // validly signed, but commits to a different reveal
    const wrongSel = { xi: H(xi), selections: { ...SEL, budget: ['no'] } };
    const wrongXi = { xi: H(sha512(utf8('x'))), selections: SEL };
    const notSpoil = { intent: 'cast', body, sig: H(sig) };
    const cases: [string, unknown, typeof rev, string][] = [
      ['wrong-selections', pe, wrongSel, 'E_SPOIL_MISMATCH'], ['wrong-xi', pe, wrongXi, 'E_SPOIL_MISMATCH'],
      ['digest-not-committing', badDigest, rev, 'E_SPOIL_MISMATCH'], ['envelope-is-a-cast', notSpoil, rev, 'E_SPOIL_MISMATCH'],
    ];
    const pa: Vec[] = [{ id: 'private-audit-reproduces', input: { params: paramsJson, roll: sim.rollHex, envelope: pe, reveal: rev }, expect: ok({ audited: true, ballot_code_hex: H(code) }), tags: ['kat'] }];
    for (const [id, e, rv, code2] of cases) {
      const r = auditSpoil(p, roll, e, rv);
      assert(!r.ok && r.error === code2, `private audit ${id}: got ${r.ok ? 'ok' : r.error}`);
      pa.push({ id: `private-audit-${id}`, input: { params: paramsJson, roll: sim.rollHex, envelope: e, reveal: rv }, expect: bad(code2), tags: ['negative'] });
    }
    put(f('protocol', 'benaloh', 'private-audit.json'), envelope('protocol/benaloh', 'benaloh.private_audit', 'Voter-side private audit of a spoil: envelope + out-of-band reveal', 'quietvote', pa));
  }

  put(f('protocol', 'benaloh', 'spoil-reveal.json'), envelope('protocol/benaloh', 'benaloh.verify_spoiled', 'Benaloh audit: recompute ballot from published reveal', 'quietvote', bn));

  // ------------------------------------------------------------------ rules
  const rules: Vec[] = [];
  const cs = defaultContests();
  const mm = (q?: Manifest['quorum']): Manifest => { const x = clone(m0); if (q) x.quorum = q; return x; };
  const addRule = (id: string, m: Manifest, c: Manifest['contests'][number], T: Record<string, number>, V: number, N: number): void => {
    const r = evaluateContest(m, c, new Map(Object.entries(T)), V, N);
    rules.push({ id, input: { manifest_quorum: m.quorum ?? null, contest: c, counts: T, participation: V, roll_size: N }, expect: ok({ result: r }), tags: ['boundary'] });
  };
  const yn = (num: number, den: number, strict: boolean, tb: Manifest['contests'][number]['tie_break'] = { type: 'status-quo', option: 'no' }): Manifest['contests'][number] => ({ ...cs[0]!, rule: { type: 'threshold', num, den, basis: 'yes+no', strict }, tie_break: tb });
  addRule('majority-51-50', mm(), yn(1, 2, true), { yes: 51, no: 50 }, 101, 200);
  addRule('majority-tie-status-quo-no', mm(), yn(1, 2, true), { yes: 50, no: 50 }, 100, 200);
  addRule('majority-tie-status-quo-yes', mm(), yn(1, 2, true, { type: 'status-quo', option: 'yes' }), { yes: 50, no: 50 }, 100, 200);
  addRule('majority-tie-declare', mm(), yn(1, 2, true, { type: 'declare-tie' }), { yes: 50, no: 50 }, 100, 200);
  addRule('two-thirds-exact', mm(), yn(2, 3, false), { yes: 2, no: 1 }, 3, 10);
  addRule('two-thirds-one-short', mm(), yn(2, 3, false), { yes: 66, no: 34 }, 100, 200);
  addRule('quorum-boundary-met', mm({ type: 'fraction', basis: 'roll', num: 1, den: 3 }), yn(1, 2, true), { yes: 3, no: 0 }, 34, 100);
  addRule('quorum-boundary-missed', mm({ type: 'fraction', basis: 'roll', num: 1, den: 3 }), yn(1, 2, true), { yes: 3, no: 0 }, 33, 100);
  addRule('zero-base', mm(), yn(1, 2, false), { yes: 0, no: 0 }, 0, 100);
  addRule('approval-tie-at-cutoff', mm(), cs[2]!, { a: 5, b: 3, c: 3, d: 0 }, 6, 10);
  addRule('kofn-lexicographic', mm(), cs[3]!, { p: 4, q: 4, r: 4, s: 1, t: 0 }, 6, 10);
  put(f('protocol', 'rules', 'rules.json'), envelope('protocol/rules', 'rules.evaluate', 'Exact-integer outcome evaluation (QV-16 §5.19.3)', 'quietvote', rules));

  // ------------------------------------------------------------------ DKG ceremonies and scenarios
  const dkgFiles: [string, number, number, Faults | undefined][] = [
    ['dkg-n3-t2-honest', 3, 2, undefined], ['dkg-n5-t3-honest', 5, 3, undefined],
    ['dkg-n5-t3-bad-share', 5, 3, { badShare: [[2, 4]] }], ['dkg-n5-t3-false-complaint', 5, 3, { falseComplaint: [[4, 2]] }],
    ['dkg-n5-t3-missing-shares', 5, 3, { noShares: [3] }], ['dkg-n5-t3-late-dealing', 5, 3, { lateDealing: [1] }], ['dkg-n5-t3-no-dealing', 5, 3, { noDealing: [5] }],
  ];
  const dkgV: Vec[] = [];
  for (const [id, n, t, faults] of dkgFiles) {
    const s = await setup({ seed: id, n, t, voters: 0, faults });
    dkgV.push({ id, input: dkgInputOf(s), expect: ok({ Q: s.outcome!.Q, qmask: s.outcome!.qmask, K_hex: H(pointToBytes(s.outcome!.K)), ctx_hex: H(s.outcome!.ctx), Y_hex: Object.fromEntries([...s.outcome!.Y].map(([j, y]) => [String(j), H(pointToBytes(y))])) }), tags: faults ? ['scenario'] : ['kat'] });
  }
  { // abort: |Q| < t
    const s = await setup({ seed: 'dkg-abort-src', n: 3, t: 2, voters: 0 });
    const inp = dkgInputOf(s) as { records: { dealings: { seq: number; body: { i: number } }[] } };
    inp.records.dealings = inp.records.dealings.filter((d) => d.body.i === 1);
    dkgV.push({ id: 'dkg-abort-quorum', input: inp, expect: bad('E_DKG_QUORUM'), tags: ['negative', 'abort'] });
  }
  put(f('protocol', 'dkg', 'dkg.json'), envelope('protocol/dkg', 'dkg.adjudicate', 'DKG ceremonies (n=3,t=2; n=5,t=3) and fault scenarios with expected Q, K and ctx', 'quietvote', dkgV));
  void checkDealing;

  // ------------------------------------------------------------------ elections, mutations, canary
  const tiny = await setup({ seed: 'vec-tiny', n: 3, t: 2, voters: 5, contests: [cs[0]!] });
  for (let i = 0; i < 4; i++) castBallot(tiny, i, { budget: [i === 2 ? 'no' : 'yes'] });
  spoilBallot(tiny, 4, { budget: ['no'] }, 'publish');
  closeElection(tiny);
  publishTally(tiny, [1, 3]);
  const tinyB = bundleOf(tiny);
  const rep = await verifyElection(tinyB);
  assert(rep.verdict === 'PASS', 'tiny must pass');
  put(f('elections', 'tiny-yesno-3v', 'bundle.json'), tinyB);
  put(f('elections', 'tiny-yesno-3v', 'expected-report.json'), expectedOf(rep));

  const smallSim = await setup({ seed: 'vec-small', n: 5, t: 3, voters: 20, contests: [{ ...cs[2]!, options: cs[2]!.options.slice(0, 3), winners: 1, tie_break: { type: 'lexicographic' } }], maxPerVoter: 3 });
  const sr = streamRng('vec-small-select');
  const opts = ['a', 'b', 'c'];
  for (let i = 0; i < 18; i++) castBallot(smallSim, i, { topics: opts.filter(() => sr.bytes(1)[0]! % 2 === 0) });
  for (const i of [0, 4, 9]) castBallot(smallSim, i, { topics: opts.filter(() => sr.bytes(1)[0]! % 2 === 0) });
  spoilBallot(smallSim, 18, { topics: ['a'] }, 'publish');
  spoilBallot(smallSim, 19, { topics: ['b'] }, 'private');
  closeElection(smallSim);
  publishTally(smallSim, [1, 2, 4, 5]);
  const smallB = bundleOf(smallSim);
  const srep = await verifyElection(smallB);
  assert(srep.verdict === 'PASS', 'small must pass');
  put(f('elections', 'small-approval-20v', 'bundle.json'), smallB);
  put(f('elections', 'small-approval-20v', 'expected-report.json'), expectedOf(srep));

  const entries = (b: ElectionBundle, pred: (e: Record<string, any>) => boolean) => b.log.filter((l) => pred(l.entry as Record<string, any>)) as { seq: number; entry: Record<string, any> }[];
  const tallyBody = (b: ElectionBundle): Record<string, any> => entries(b, (e) => e.body?.type === 'tally')[0]!.entry.body;
  const renumber = (b: ElectionBundle): void => { b.log.sort((x, y) => x.seq - y.seq); let n = 0; for (const l of b.log) l.seq = ++n; };
  const closeSeq = (b: ElectionBundle): number => entries(b, (e) => e.body?.name === 'election-close')[0]!.seq;
  const mutants: { id: string; mut: (b: ElectionBundle) => void; checks: string[]; codes: string[]; verdict: string }[] = [
    { id: 'manifest-field-flip', mut: (b) => (b.manifest.body.title += 'x'), checks: ['chk.manifest.hash'], codes: ['E_MANIFEST_HASH'], verdict: 'FAIL' },
    { id: 'manifest-signature-removed', mut: (b) => (b.manifest.sigs = []), checks: ['chk.manifest.sig'], codes: ['E_MANIFEST_SIG'], verdict: 'FAIL' },
    { id: 'counted-ballot-dropped', mut: (b) => { const e = entries(b, (x) => x.intent === 'cast')[2]!; b.log.splice(b.log.findIndex((l) => l.seq === e.seq), 1); }, checks: ['chk.tally.aggregate'], codes: ['E_COUNTED_ROOT', 'E_AGG_MISMATCH'], verdict: 'FAIL' },
    { id: 'ciphertext-bit-flip', mut: (b) => { entries(b, (x) => x.intent === 'cast')[1]!.entry.body.contests[0].sel[0].a = '0'.repeat(63) + '1'; }, checks: ['chk.ballots.valid', 'chk.tally.aggregate'], codes: ['E_SIG', 'E_COUNTED_ROOT'], verdict: 'FAIL' },
    { id: 'ballot-replayed', mut: (b) => { const e = entries(b, (x) => x.intent === 'cast')[0]!; b.log.splice(b.log.findIndex((l) => l.seq === closeSeq(b)), 0, { seq: closeSeq(b) - 0.5, entry: clone(e.entry) }); renumber(b); }, checks: ['chk.ballots.latest'], codes: ['E_SUPERSEDES'], verdict: 'PASS' },
    { id: 'aggregate-altered', mut: (b) => { const o = tallyBody(b).contests[0].options[0]; o.A = o.B; }, checks: ['chk.tally.aggregate'], codes: ['E_AGG_MISMATCH'], verdict: 'FAIL' },
    { id: 'partial-decryption-wrong', mut: (b) => { const o = tallyBody(b).contests[0].options[0]; o.shares[0].M = o.B; }, checks: ['chk.tally.decrypt'], codes: ['E_TALLY_INSUFFICIENT'], verdict: 'FAIL' },
    { id: 'fewer-than-t-partials', mut: (b) => { for (const o of tallyBody(b).contests[0].options) o.shares = o.shares.slice(0, 1); }, checks: ['chk.tally.decrypt'], codes: ['E_TALLY_INSUFFICIENT'], verdict: 'FAIL' },
    { id: 'count-altered', mut: (b) => { tallyBody(b).contests[0].options[0].T += 1; }, checks: ['chk.tally.decrypt'], codes: ['E_DLOG_RANGE'], verdict: 'FAIL' },
    { id: 'result-flipped', mut: (b) => { tallyBody(b).results[0].outcome = { kind: 'rejected' }; }, checks: ['chk.result.rules'], codes: ['E_RESULT'], verdict: 'FAIL' },
    { id: 'spoiled-also-cast', mut: (b) => { const s = entries(b, (x) => x.intent === 'spoil')[0]!.entry; const v = tiny.voters.find((k) => H(k.publicKey) === s.body.voter)!; const code2 = ballotCode(tiny.params!.ctx, s.body); b.log.splice(b.log.findIndex((l) => l.seq === closeSeq(b)), 0, { seq: closeSeq(b) - 0.5, entry: { intent: 'cast', body: clone(s.body), sig: H(ed25519Sign(v.secretKey, castDigest(tiny.params!.ctx, code2))) } }); renumber(b); }, checks: ['chk.benaloh.spoiled'], codes: ['E_SPOILED_CODE_CAST'], verdict: 'PASS' },
    { id: 'spoil-wrong-plaintext', mut: (b) => { entries(b, (x) => x.intent === 'spoil')[0]!.entry.reveal.selections.budget = ['yes']; }, checks: ['chk.benaloh.spoiled'], codes: ['E_SPOIL_MISMATCH'], verdict: 'PASS' },
    { id: 'non-canonical-hex', mut: (b) => { const s = entries(b, (x) => x.intent === 'cast')[1]!.entry.body.contests[0].sel[0]; s.a = s.a.toUpperCase(); }, checks: ['chk.ballots.valid', 'chk.encoding.canonical', 'chk.tally.aggregate'], codes: ['E_SCHEMA', 'E_COUNTED_ROOT'], verdict: 'FAIL' },
    { id: 'unknown-field-in-tally', mut: (b) => { tallyBody(b).extra = true; }, checks: ['chk.encoding.canonical'], codes: ['E_SCHEMA'], verdict: 'FAIL' },
    { id: 'tally-wrong-ctx', mut: (b) => { tallyBody(b).ctx = '11'.repeat(32); }, checks: ['chk.tally.aggregate'], codes: ['E_CTX'], verdict: 'FAIL' },
    // QV-ADR-015 election-open binding: each mutant re-signs the open marker (scope ctx) so only the reference is wrong
    ...(() => {
      const openMut = (patch: (o: Record<string, any>, b: ElectionBundle) => void) => (b: ElectionBundle): void => {
        const e = entries(b, (x) => x.body?.name === 'election-open')[0]!;
        const body = { ...e.entry.body } as Record<string, any>;
        patch(body, b);
        e.entry = multiSign(tiny, tiny.params!.ctx, body as never);
      };
      const bind = { checks: ['chk.time.window'], codes: ['E_MARKERS'], verdict: 'FAIL' };
      const seqOf = (b: ElectionBundle, pred: (e: Record<string, any>) => boolean): number => entries(b, pred)[0]!.seq;
      return [
        { id: 'open-roll-ref-forward', mut: openMut((o, b) => { o.roll_commit_seq = closeSeq(b); }), ...bind },
        { id: 'open-joint-key-ref-forward', mut: openMut((o, b) => { o.joint_key_seq = closeSeq(b); }), ...bind },
        { id: 'open-roll-ref-absent', mut: openMut((o) => { delete o.roll_commit_seq; }), ...bind },
        { id: 'open-binding-fields-absent', mut: openMut((o) => { delete o.roll_commit_seq; delete o.joint_key_seq; delete o.manifest_hash; }), ...bind },
        { id: 'open-roll-ref-wrong-record', mut: openMut((o, b) => { o.roll_commit_seq = seqOf(b, (x) => x.body?.name === 'dkg-r3-close'); }), ...bind },
        { id: 'open-roll-ref-nonexistent', mut: openMut((o) => { o.roll_commit_seq = 99999; }), ...bind },
        { id: 'open-joint-key-ref-mismatch', mut: openMut((o, b) => { o.joint_key_seq = seqOf(b, (x) => x.body?.name === 'dkg-r3-close'); }), ...bind },
        { id: 'open-manifest-hash-mismatch', mut: openMut((o) => { o.manifest_hash = '22'.repeat(32); }), ...bind },
      ];
    })(),
  ];
  const mutDir = f('mutations');
  for (const m of mutants) {
    const b = clone(tinyB);
    m.mut(b);
    const r = await verifyElection(b);
    const failed = Object.entries(r.checks).filter(([, s]) => s === 'fail').map(([k]) => k).sort();
    assert(JSON.stringify(failed) === JSON.stringify([...m.checks].sort()), `mutant ${m.id}: failed checks ${JSON.stringify(failed)}`);
    for (const c of m.codes) assert(r.findings.some((x) => x.code === c), `mutant ${m.id}: missing code ${c} in ${JSON.stringify(r.findings.map((x) => x.code))}`);
    assert(r.verdict === m.verdict, `mutant ${m.id}: verdict ${r.verdict}`);
    put(f(mutDir, `${m.id}.json`), { id: m.id, base: 'elections/tiny-yesno-3v/bundle.json', expect: { verdict: m.verdict, failed_checks: m.checks.slice().sort(), codes: m.codes }, bundle: b });
  }

  // canary: wrong aggregate + forged CDS proof in a counted ballot
  { const b = clone(tinyB);
    const o = tallyBody(b).contests[0].options[0]; o.A = o.B;
    const e = entries(b, (x) => x.intent === 'cast')[1]!;
    e.entry.body.contests[0].sel[0].s0 = H(scalarToBytes(5n));
    const v = tiny.voters.find((k) => H(k.publicKey) === e.entry.body.voter)!;
    e.entry.sig = H(ed25519Sign(v.secretKey, castDigest(tiny.params!.ctx, ballotCode(tiny.params!.ctx, e.entry.body))));
    const r = await verifyElection(b);
    const failed = Object.entries(r.checks).filter(([, s]) => s === 'fail').map(([k]) => k).sort();
    assert(failed.join() === ['chk.ballots.valid', 'chk.tally.aggregate'].join(), `canary: ${failed.join()}`);
    put(f('canary', 'canary-election.json'), b);
    put(f('canary', 'expected-report.json'), expectedOf(r)); }

  // ------------------------------------------------------------------ log layer (QV-18 / logcheck X-21..X-34), additions only
  await generateLogLayer(put, (s, o, d, g, v) => envelope(s, o, d, g, v as Vec[]), assert, expectedOf);

  // ------------------------------------------------------------------ schema, registries, README
  put(f('..', 'schema', 'error-codes.json'), { $comment: 'Map from QV-16 §5.20 codes (used in vectors) to QV-34 §9.2 registry codes where one exists. Codes without a registry entry are used verbatim.', map: ERROR_MAP });
  put(f('..', 'schema', 'check-ids.json'), { checks: ['chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees', 'chk.board.append_only', 'chk.board.witness', 'chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules', 'chk.benaloh.spoiled', 'chk.receipts.sample', 'chk.encoding.canonical', 'chk.time.window'], statuses: ['pass', 'fail', 'not_run'] });
  out.set(f('..', 'README.md'), README);
  // MANIFEST.json: SHA-256 of each file and an RFC 9162 root over the sorted list (unsigned; signing is a release step)
  const files = [...out.keys()].sort();
  const hashes = files.map((k) => ({ path: k.startsWith('..') ? k.slice(3) : `v1/${k}`, sha256: H(sha256(utf8(out.get(k)!))) })).sort((a, b2) => (a.path < b2.path ? -1 : 1));
  const root = H(mth(hashes.map((h) => sha256(Uint8Array.from([0, ...utf8(`${h.path}\n${h.sha256}`)])))));
  out.set(f('..', 'MANIFEST.json'), J({ protocol_version: 'qv1', generator: 'vecgen@0.1.0', signature: 'unsigned (release job signs)', merkle_root_sha256_rfc9162: root, files: hashes }));
  void ed25519Sign; void QvCryptoError; void scalarFromBytes; void rollRoot; void manifestHash; void parseQvJson;
  return out;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`vecgen: ${msg}`);
}

function expectedOf(r: Awaited<ReturnType<typeof verifyElection>>): unknown {
  return { verdict: r.verdict, checks: r.checks, counts: { cast: r.counts.cast, spoiled: r.counts.spoiled, counted: r.counts.counted }, ctx_prefix: r.ctxPrefix, results: r.results };
}

function dkgInputOf(s: Sim): unknown {
  const take = (type: string): { seq: number; body: unknown }[] => s.log.filter((e) => (e.entry as { body?: { type?: string } }).body?.type === type).map((e) => ({ seq: e.seq, body: (e.entry as { body: unknown }).body }));
  const mk: Record<string, number> = {};
  for (const e of s.log) { const b = (e.entry as { body?: MarkerBody }).body; if (b?.type === 'marker' && b.name.startsWith('dkg-')) mk[b.name] = e.seq; }
  return { manifest_hash_hex: H(s.mh), n: s.manifest.n, t: s.manifest.t, markers: mk as unknown as MarkerSeqs, records: { commits: take('dkg-commit'), dealings: take('dkg-dealing'), shares: take('dkg-shares'), complaints: take('dkg-complaint') } };
}

export function dkgInputFromVector(i: { manifest_hash_hex: string; n: number; t: number; markers: MarkerSeqs; records: { commits: unknown[]; dealings: unknown[]; shares: unknown[]; complaints: unknown[] } }): DkgInput {
  return { mh: hexToBytes(i.manifest_hash_hex, 32), n: i.n, t: i.t, markers: i.markers, commits: i.records.commits as never, dealings: i.records.dealings as never, shares: i.records.shares as never, complaints: i.records.complaints as never };
}
void adjudicateDkg; void analyzeBallotLog;
void kp;

const README = `# QuietVote test vectors (protocol version qv1)

Licence: CC0-1.0. Format: QV-34 §6 (envelope with \`vectors[]\`, \`input\`, \`expect\`). Hex is lower-case; scalars are 32-byte
little-endian; points are canonical ristretto255.

* \`v1/primitives\`, \`v1/protocol\`: known answers and negative vectors per operation (see \`operation\` in each file).
* \`v1/elections\`: complete election bundles (\`bundle.json\`) with \`expected-report.json\`.
* \`v1/mutations\`: one mutant per file derived from \`elections/tiny-yesno-3v\` (the QV-34 text derives them from the
  20-voter election; the tiny election is used here to keep verification cheap) with the exact set of failing named checks.
* \`v1/canary\`: the verifier self-test bundle (wrong aggregate + forged CDS proof).
* \`schema/error-codes.json\`: QV-16 error codes used in vectors and their QV-34 registry equivalents.

Status: every set is \`candidate\`. No independent implementation has reproduced them yet (QV-34-REQ-005), the MANIFEST is
unsigned, and the external-standard sets (FIPS 180-4, RFC 8032, RFC 9496) contain only the few values quoted from memory and
re-checked by computation; they have not been imported verbatim from the source documents (QV-34-REQ-003 open).

Regenerate: \`node packages/protocol/test/vecgen/write.ts\` (zero diff expected; \`vectors.test.ts\` enforces it).
Deterministic randomness: SHA-512 counter-mode stream RNG seeded per scenario (not the HKDF \`vecrng-v1\` of QV-34 §8.1).
`;
