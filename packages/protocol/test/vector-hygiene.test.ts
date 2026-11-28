import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  VECTOR_CORPUS_BYTES, VECTOR_FILE_BYTES, assertVectorFormats, assertVectorManifest, parseVectorCorpus,
} from './helpers/vector-hygiene.ts';

const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');
const parse = (text: string): unknown => parseVectorCorpus(new Map([['fixture.json', bytes(text)]])).get('fixture.json');
const formats = (value: unknown): void => assertVectorFormats(value, 'fixture.json');
function corpus(contents: Readonly<Record<string, string>> = { 'v1/a.json': '{"value":1}\n', 'README.md': 'Corpus\n' }) {
  const files = new Map(Object.entries(contents).map(([path, text]) => [path, bytes(text)]));
  const manifest = { files: [...files].map(([path, value]) => ({ path, sha256: createHash('sha256').update(value).digest('hex') })) };
  files.set('MANIFEST.json', bytes(JSON.stringify(manifest) + '\n'));
  return { files, manifest };
}

test('vector hygiene: fatal UTF-8 decoding does not silently replace malformed bytes', () => {
  for (const invalid of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]]) {
    const value = Buffer.concat([Buffer.from('{"text":"'), Buffer.from(invalid), Buffer.from('"}')]);
    assert.doesNotThrow(() => JSON.parse(value.toString('utf8')), 'old nonfatal decoding hid this error');
    assert.throws(() => parseVectorCorpus(new Map([['fixture.json', value]])), /invalid UTF-8/);
  }
  assert.throws(() => parseVectorCorpus(new Map([['README.md', Uint8Array.of(0xff)]])), /invalid UTF-8/);
  assert.deepEqual(parse('{"text":"é€😀"}\n'), { text: 'é€😀' });
});

test('vector hygiene: LF applies to every corpus file and escaped carriage returns remain data', () => {
  for (const path of ['fixture.json', 'README.md']) assert.throws(() => parseVectorCorpus(new Map([[path, bytes('{}\r\n')]])), /LF newlines/);
  assert.deepEqual(parse('{"text":"\\r\\n"}\n'), { text: '\r\n' });
  assert.throws(() => parse('\ufeff{}'), /invalid JSON/);
  assert.throws(() => parse('{"unfinished":'), /invalid JSON/);
});

test('vector hygiene: reject floating and exponent spellings even when JSON.parse yields an integer', () => {
  for (const token of ['1.5', '1.0', '1e0', '1E+1', '-2e-1', '-0.0']) {
    assert.throws(() => parse(`{"n":${token}}`), /integer decimal notation/, token);
  }
  assert.deepEqual(parse('{"n":[0,1,-17,9007199254740991]}'), { n: [0, 1, -17, 9007199254740991] });
});

test('vector hygiene: quoted malformed canonical-JSON inputs and escaped quotes are opaque', () => {
  const value = { input: { text: '{"n":1.0,"n":1e0,"s":"\\\""}' }, expected: '1E2', comment: 'offset 2026-10-21T12:00:00+01:00' };
  assert.deepEqual(parse(JSON.stringify(value)), value);
  formats(value);
});

test('vector hygiene: the 1 MB boundary is inclusive and counts UTF-8 bytes, not characters', () => {
  assert.equal(VECTOR_FILE_BYTES, 1_000_000);
  const exact = '"' + 'é'.repeat((VECTOR_FILE_BYTES - 2) / 2) + '"';
  assert.equal(Buffer.byteLength(exact), VECTOR_FILE_BYTES);
  assert.doesNotThrow(() => parse(exact));
  const tooLarge = exact.slice(0, -1) + 'é"';
  assert.ok(tooLarge.length < 1_000_000, 'the former character-count test accepted this file');
  assert.throws(() => parse(tooLarge), /exceeds 1 MB/);
});

test('vector hygiene: the 25 MB corpus boundary includes all files and metadata', () => {
  assert.equal(VECTOR_CORPUS_BYTES, 25_000_000);
  const file = bytes('x'.repeat(VECTOR_FILE_BYTES));
  const files = new Map<string, Uint8Array>(Array.from({ length: 25 }, (_, index) => [`${index}.txt`, file] as const));
  assert.doesNotThrow(() => parseVectorCorpus(files));
  files.set('MANIFEST.json', bytes('0'));
  assert.throws(() => parseVectorCorpus(files), /corpus exceeds 25 MB/);
});

test('vector hygiene: MANIFEST is an exact path bijection while identical-content files are allowed', () => {
  const { files, manifest } = corpus({ 'v1/a.json': '{}\n', 'v1/b.json': '{}\n' });
  assert.equal(manifest.files[0]!.sha256, manifest.files[1]!.sha256);
  assert.doesNotThrow(() => assertVectorManifest(files, parseVectorCorpus(files).get('MANIFEST.json')));
  assert.throws(() => assertVectorManifest(files, { files: [...manifest.files, manifest.files[0]] }), /duplicate path/);
  assert.throws(() => assertVectorManifest(files, { files: manifest.files.slice(1) }), /file set mismatch/);
  assert.throws(() => assertVectorManifest(files, { files: [...manifest.files, { ...manifest.files[0], path: 'absent.json' }] }), /absent file/);
  files.delete('MANIFEST.json');
  assert.throws(() => assertVectorManifest(files, manifest), /missing MANIFEST/);
});

test('vector hygiene: MANIFEST rejects path aliases, traversal, self-reference and noncanonical hashes', () => {
  const { files, manifest } = corpus();
  for (const path of ['/v1/a.json', '../v1/a.json', './v1/a.json', 'v1/../v1/a.json', 'v1//a.json', 'v1\\a.json', 'C:/v1/a.json', 'v1/a.json\n', 'MANIFEST.json']) {
    // Keep every canonical row: membership alone must not hide an additional alias.
    const altered = { files: [...manifest.files, { ...manifest.files[0]!, path }] };
    assert.throws(() => assertVectorManifest(files, altered), /non-canonical or self path/, path);
  }
  for (const sha256 of ['FF'.repeat(32), 'ab'.repeat(31), 'zz'.repeat(32)]) {
    const altered = structuredClone(manifest); altered.files[0]!.sha256 = sha256;
    assert.throws(() => assertVectorManifest(files, altered), /invalid SHA-256 encoding/);
  }
  const altered = structuredClone(manifest); altered.files[0]!.sha256 = '00'.repeat(32);
  assert.throws(() => assertVectorManifest(files, altered), /SHA-256 mismatch/);
  assert.throws(() => assertVectorManifest(files, { ...manifest, merkle_root_sha256_rfc9162: 'FF'.repeat(32) }), /Merkle digest encoding/);
});

test('vector hygiene: format checks cover named hex strings, array/map leaves and proof fields', () => {
  for (const value of [
    { msg_hex: 'AB' }, { fields_hex: ['ab', 'CD'] }, { Y_hex: { 1: 'EF' } }, { point_hex: 'a' }, { scalar_hex: '0x00' },
    { manifest_hash: 'FF' }, { roll: ['AB'] }, { ctx_prefix: 'AB' },
    { operation: 'cds.verify', vectors: [{ input: { proof: { c0: 'AA' } }, expect: { ok: false } }] },
    { operation: 'pok.verify', vectors: [{ input: { proof: { s: 'AA' } } }] },
    { operation: 'roll.merkle_root', vectors: [{ input: { voter_pks: ['AB'] } }] },
    { operation: 'roll.merkle_root', vectors: [{ expect: { output: { leaf_hashes: ['AB'] } } }] },
    { operation: 'scalar.decode', vectors: [{ expect: { output: { canonical: 'AB' } } }] },
    { operation: 'ballot.encrypt', vectors: [{ input: { supersedes: 'AB' } }] },
    { operation: 'log.verify_election', vectors: [{ input: { receipts: [{ voter: 'AB' }] } }] },
  ]) assert.throws(() => formats(value), /lowercase even-length hex/);
  formats({ fields_hex: ['', 'aa', '00'.repeat(31), 'ff'.repeat(33)], Y_hex: { 1: 'ab' } });
});

test('vector hygiene: wire schemas locate hex without treating arbitrary text, labels or base64 as hex', () => {
  for (const value of [
    { type: 'manifest', trustees: [{ sign_pk: 'AB' }] },
    { type: 'dkg-dealing', enc: { E: 'AB' }, coeffs: [] },
    { type: 'ballot', contests: [{ sel: [{ c1: 'AB' }] }] },
    { type: 'tally', spoiled: [{ code: 'AB' }] },
    { body: { type: 'control' }, sigs: [{ key: 'AB', sig: 'aa' }] },
    { intent: 'spoil', reveal_digest: 'AB' },
    { xi: 'AB', selections: {} },
  ]) assert.throws(() => formats(value), /lowercase even-length hex/);
  formats({ type: 'manifest', title: 'ABCD', created: '2024-02-29T23:59:59Z', trustees: [{ name: 'ABC', sign_pk: 'aa' }] });
  formats({ source: { retrieved: '2026-10-21', source_sha256: 'not-computed' }, board: { root: 'AA+/==', body: 'eyJhIjoxfQ==' } });
  formats({ type: 'ballot', ctx: 7, contests: [] }); // Wrong types/shape are semantic negative-vector inputs, not encoding repair targets.
});

test('vector hygiene: manifest timestamp strings use real UTC calendar dates without offsets or fractions', () => {
  for (const timestamp of ['2026-10-21T12:00:00+00:00', '2026-10-21T12:00:00z', '2026-10-21T12:00:00.000Z', '2026-02-30T12:00:00Z', '2026-10-21']) {
    for (const key of ['created', 'voting_open', 'voting_close']) assert.throws(() => formats({ type: 'manifest', [key]: timestamp }), /UTC timestamp/);
  }
  formats({ type: 'manifest', created: '2024-02-29T23:59:59Z', voting_open: '2024-02-28T23:59:59Z' }); // Ordering belongs to protocol tests.
  formats({ comment: '2026-10-21T12:00:00+01:00', input: { text: '{"created":"2026-02-30T12:00:00Z"}' } });
});

test('vector hygiene: the intentional uppercase fixture exception is exact, consumed and field-local', () => {
  const file = 'v1/protocol/manifest/manifest.json';
  const fixture = { operation: 'manifest.validate_hash', vectors: [{ id: 'manifest-uppercase-hex', input: {
    manifest: { type: 'manifest', election_id: 'C96FDB867F51DA652DB2B911D0159E58', bb: { log_pk: 'aa' } },
  }, expect: { ok: false, error: 'E_SCHEMA' } }] };
  assert.doesNotThrow(() => assertVectorFormats(fixture, file));
  assert.throws(() => assertVectorFormats(fixture, 'moved.json'), /lowercase even-length hex/);
  const changedValue = structuredClone(fixture); changedValue.vectors[0]!.input.manifest.election_id = 'AB';
  assert.throws(() => assertVectorFormats(changedValue, file), /lowercase even-length hex/);
  const changedId = structuredClone(fixture); changedId.vectors[0]!.id = 'other-negative';
  assert.throws(() => assertVectorFormats(changedId, file), /lowercase even-length hex/);
  const changedVerdict = structuredClone(fixture); changedVerdict.vectors[0]!.expect.ok = true;
  assert.throws(() => assertVectorFormats(changedVerdict, file), /lowercase even-length hex/);
  const otherField = structuredClone(fixture); otherField.vectors[0]!.input.manifest.bb.log_pk = 'AB';
  assert.throws(() => assertVectorFormats(otherField, file), /lowercase even-length hex/);
  const noLongerMalformed = structuredClone(fixture); noLongerMalformed.vectors[0]!.input.manifest.election_id = 'ab';
  assert.throws(() => assertVectorFormats(noLongerMalformed, file), /exception was not consumed/);
  const duplicated = structuredClone(fixture); duplicated.vectors.push(structuredClone(duplicated.vectors[0]!));
  assert.throws(() => assertVectorFormats(duplicated, file), /duplicate malformed fixture exception/);
  assert.throws(() => assertVectorFormats({ vectors: [] }, file), /exception was not consumed/);
});

test('vector hygiene: the uppercase ciphertext mutant has an exact consumed field and outcome exception', () => {
  const file = 'v1/mutations/non-canonical-hex.json';
  const make = () => ({ id: 'non-canonical-hex', expect: {
    verdict: 'FAIL', failed_checks: ['chk.ballots.valid', 'chk.encoding.canonical', 'chk.tally.aggregate'], codes: ['E_SCHEMA', 'E_COUNTED_ROOT'],
  }, bundle: { log: Array.from({ length: 22 }, (_, seq) => ({ seq, entry: {
    intent: 'cast', body: { type: 'ballot', ctx: 'aa', contests: [{ sel: [{ a: seq === 21
      ? 'AA98046327B79C296124C4186C4FE564B42D88750539B6DDE878CB2235AB8638' : 'aa' }] }] },
  } })) } });
  const fixture = make();
  assert.doesNotThrow(() => assertVectorFormats(fixture, file));
  assert.throws(() => assertVectorFormats(fixture, 'other-negative.json'), /lowercase even-length hex/);
  const changedOutcome = make(); changedOutcome.expect.verdict = 'PASS';
  assert.throws(() => assertVectorFormats(changedOutcome, file), /lowercase even-length hex/);
  const otherField = make(); otherField.bundle.log[21]!.entry.body.ctx = 'AB';
  assert.throws(() => assertVectorFormats(otherField, file), /lowercase even-length hex/);
  const changedValue = make(); changedValue.bundle.log[21]!.entry.body.contests[0]!.sel[0]!.a = 'AB';
  assert.throws(() => assertVectorFormats(changedValue, file), /lowercase even-length hex/);
  const removed = make(); removed.bundle.log.pop();
  assert.throws(() => assertVectorFormats(removed, file), /exception was not consumed/);
});
