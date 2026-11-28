import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  S, TS_RE, ballotBodySchema, castEnvelopeSchema, manifestSchema, spoilEnvelopeSchema, tallySchema, type Schema,
} from '../../src/schema.ts';

export const VECTOR_FILE_BYTES = 1_000_000;
export const VECTOR_CORPUS_BYTES = 25_000_000;
export type VectorFiles = ReadonlyMap<string, Uint8Array>;
const HEX = /^(?:[0-9a-f]{2})*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function canonicalPath(path: string): boolean {
  return path.length > 0 && !/[\\\u0000-\u001f\u007f]/.test(path) && !/^[A-Za-z]:/.test(path)
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Inspect JSON number tokens, not numbers embedded in quoted rejection inputs. */
function integerSpellings(text: string, file: string): void {
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (text[i] === '-' || /[0-9]/.test(text[i]!)) {
      NUMBER.lastIndex = i;
      const token = NUMBER.exec(text)?.[0];
      assert.ok(token !== undefined, `${file}: invalid JSON number`);
      assert.ok(!/[.eE]/.test(token), `${file}: JSON number must use integer decimal notation`);
      i += token.length;
    } else i++;
  }
}

/** QV-34-REQ-012/014: byte limits include metadata, README and MANIFEST itself. */
export function parseVectorCorpus(files: VectorFiles): Map<string, unknown> {
  let total = 0;
  for (const [file, bytes] of files) {
    assert.ok(canonicalPath(file), `non-canonical corpus path: ${file}`);
    assert.ok(bytes.byteLength <= VECTOR_FILE_BYTES, `${file}: exceeds 1 MB`);
    total += bytes.byteLength;
    assert.ok(total <= VECTOR_CORPUS_BYTES, 'vector corpus exceeds 25 MB');
  }
  const documents = new Map<string, unknown>();
  for (const [file, bytes] of files) {
    let text: string;
    try {
      // Preserve any BOM so JSON.parse, rather than silent decoder repair, decides JSON validity.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      assert.fail(`${file}: invalid UTF-8`);
    }
    assert.ok(!text.includes('\r'), `${file}: requires LF newlines`);
    if (!file.endsWith('.json')) continue;
    let value: unknown;
    try { value = JSON.parse(text); } catch { assert.fail(`${file}: invalid JSON`); }
    integerSpellings(text, file);
    documents.set(file, value);
  }
  return documents;
}

/** Exact path bijection; distinct paths may intentionally contain identical bytes. */
export function assertVectorManifest(files: VectorFiles, manifest: unknown): void {
  const entries = object(manifest)?.files;
  assert.ok(files.has('MANIFEST.json'), 'missing MANIFEST.json');
  assert.ok(Array.isArray(entries), 'MANIFEST.json: files must be an array');
  const listed = new Set<string>();
  for (const entry of entries) {
    const row = object(entry);
    assert.ok(row !== undefined && typeof row.path === 'string' && typeof row.sha256 === 'string', 'MANIFEST.json: invalid file row');
    assert.ok(canonicalPath(row.path) && row.path !== 'MANIFEST.json', `MANIFEST.json: non-canonical or self path: ${row.path}`);
    assert.ok(!listed.has(row.path), `MANIFEST.json: duplicate path: ${row.path}`);
    assert.ok(DIGEST.test(row.sha256), `MANIFEST.json: invalid SHA-256 encoding: ${row.path}`);
    listed.add(row.path);
    const bytes = files.get(row.path);
    assert.ok(bytes !== undefined, `MANIFEST.json: absent file: ${row.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, `MANIFEST.json: SHA-256 mismatch: ${row.path}`);
  }
  assert.deepEqual([...listed].sort(), [...files.keys()].filter((path) => path !== 'MANIFEST.json').sort(), 'MANIFEST.json: file set mismatch');
  const root = object(manifest)?.merkle_root_sha256_rfc9162;
  if (root !== undefined) assert.ok(typeof root === 'string' && DIGEST.test(root), 'MANIFEST.json: invalid Merkle digest encoding');
}

const RECORD_SCHEMAS: Readonly<Record<string, Schema>> = {
  manifest: manifestSchema(), marker: S.marker, 'roll-commit': S.rollCommit, 'dkg-commit': S.dkgCommit,
  // Only field formats are visited; this argument does not impose a coefficient count.
  'dkg-dealing': S.dkgDealing(1), 'dkg-shares': S.dkgShares, 'dkg-complaint': S.dkgComplaint,
  'dkg-keyconf': S.dkgKeyconf, ballot: ballotBodySchema(), tally: tallySchema(),
};
const UPPERCASE_FILE = 'v1/protocol/manifest/manifest.json';
const UPPERCASE_ID = 'manifest-uppercase-hex';
const UPPERCASE_VALUE = 'C96FDB867F51DA652DB2B911D0159E58';
const MUTANT_FILE = 'v1/mutations/non-canonical-hex.json';
const MUTANT_PATH = '/bundle/log/21/entry/body/contests/0/sel/0/a';
const MUTANT_VALUE = 'AA98046327B79C296124C4186C4FE564B42D88750539B6DDE878CB2235AB8638';
type Path = readonly (string | number)[];
const pointer = (path: Path): string => '/' + path.map((key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

/**
 * Lint encodings, not protocol validity: cryptographic lengths, wrong-type/missing fields,
 * time ordering, signatures and intentional semantic mutants stay with conformance tests.
 * The existing schema supplies field identity; free text and encoded JSON strings are opaque.
 */
export function assertVectorFormats(document: unknown, file: string): void {
  const vectors = object(document)?.vectors;
  const consumed = new Map<string, string>();
  const consume = (id: string, path: Path): void => {
    const previous = consumed.get(id);
    assert.ok(previous === undefined || previous === pointer(path), `${file}: duplicate malformed fixture exception`);
    consumed.set(id, pointer(path));
  };
  const hex = (value: unknown, path: Path): void => {
    if (typeof value !== 'string' || HEX.test(value)) return;
    const vector = Array.isArray(vectors) && typeof path[1] === 'number' ? object(vectors[path[1]]) : undefined;
    const expected = object(vector?.expect);
    if (file === UPPERCASE_FILE && path.length === 5 && path[0] === 'vectors'
      && path[2] === 'input' && path[3] === 'manifest' && path[4] === 'election_id'
      && vector?.id === UPPERCASE_ID && value === UPPERCASE_VALUE && isDeepStrictEqual(expected, { ok: false, error: 'E_SCHEMA' })) {
      consume(UPPERCASE_ID, path);
      return;
    }
    if (file === MUTANT_FILE && pointer(path) === MUTANT_PATH && object(document)?.id === 'non-canonical-hex'
      && value === MUTANT_VALUE && isDeepStrictEqual(object(document)?.expect, {
        verdict: 'FAIL', failed_checks: ['chk.ballots.valid', 'chk.encoding.canonical', 'chk.tally.aggregate'], codes: ['E_SCHEMA', 'E_COUNTED_ROOT'],
      })) {
      consume('non-canonical-hex', path);
      return;
    }
    assert.fail(`${file}${pointer(path)}: expected lowercase even-length hex`);
  };
  const hexContainer = (value: unknown, path: Path): void => {
    if (Array.isArray(value)) value.forEach((item, index) => hexContainer(item, [...path, index]));
    else if (object(value) !== undefined) for (const [key, item] of Object.entries(object(value)!)) hexContainer(item, [...path, key]);
    else hex(value, path);
  };
  const timestamp = (value: unknown, path: Path): void => {
    if (typeof value !== 'string') return;
    const millis = Date.parse(value);
    assert.ok(TS_RE.test(value) && Number.isFinite(millis)
      && new Date(millis).toISOString() === value.replace('Z', '.000Z'), `${file}${pointer(path)}: expected UTC timestamp YYYY-MM-DDTHH:MM:SSZ`);
  };
  const schemaFormats = (schema: Schema, value: unknown, path: Path): void => {
    if (schema.t === 'hex') hex(value, path);
    else if (schema.t === 'str' && schema.re === TS_RE) timestamp(value, path);
    else if (schema.t === 'arr' && Array.isArray(value)) value.forEach((item, index) => schemaFormats(schema.item, item, [...path, index]));
    else if ((schema.t === 'obj' || schema.t === 'map') && object(value) !== undefined) {
      for (const [key, item] of Object.entries(object(value)!)) {
        const sub = schema.t === 'map' ? schema.item : Object.hasOwn(schema.req, key) ? schema.req[key]
          : schema.opt !== undefined && Object.hasOwn(schema.opt, key) ? schema.opt[key] : undefined;
        if (sub !== undefined) schemaFormats(sub, item, [...path, key]);
      }
    }
  };
  const visit = (value: unknown, path: Path): void => {
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, [...path, index])); return; }
    const row = object(value);
    if (row === undefined) return;
    if (typeof row.type === 'string' && Object.hasOwn(RECORD_SCHEMAS, row.type)) schemaFormats(RECORD_SCHEMAS[row.type]!, row, path);
    if (row.intent === 'cast' || row.intent === 'spoil') schemaFormats(row.intent === 'cast' ? castEnvelopeSchema() : spoilEnvelopeSchema(), row, path);
    if (object(row.body) !== undefined) {
      if (typeof row.sig === 'string') hex(row.sig, [...path, 'sig']);
      else if (row.sig !== undefined) schemaFormats(S.sig, row.sig, [...path, 'sig']);
      if (Array.isArray(row.sigs)) row.sigs.forEach((sig, index) => schemaFormats(S.sig, sig, [...path, 'sigs', index]));
    }
    if (object(row.selections) !== undefined && Object.hasOwn(row, 'xi')) schemaFormats(S.reveal, row, path);
    // ElectionBundle / ReceiptClaim / verifier-report encodings (types.ts, logcheck.ts).
    if (Array.isArray(row.roll)) hexContainer(row.roll, [...path, 'roll']);
    for (const key of ['manifest_hash', 'ctx_prefix']) if (Object.hasOwn(row, key)) hex(row[key], [...path, key]);
    for (const [key, item] of Object.entries(row)) {
      if (key.endsWith('_hex')) hexContainer(item, [...path, key]);
      else visit(item, [...path, key]);
    }
  };
  visit(document, []);
  if (Array.isArray(vectors)) vectors.forEach((entry, index) => {
    const row = object(entry), input = object(row?.input), output = object(object(row?.expect)?.output);
    const operation = object(document)?.operation;
    if (['cds.verify', 'limit.verify', 'cp.verify_dh', 'pok.verify', 'tally.partial_verify'].includes(String(operation))) {
      const proof = object(input?.proof);
      for (const key of operation === 'cds.verify' ? ['c0', 's0', 'c1', 's1'] : ['c', 's']) hex(proof?.[key], ['vectors', index, 'input', 'proof', key]);
    }
    if (operation === 'roll.merkle_root') {
      hexContainer(input?.voter_pks, ['vectors', index, 'input', 'voter_pks']);
      hexContainer(output?.leaf_hashes, ['vectors', index, 'expect', 'output', 'leaf_hashes']);
    }
    if (operation === 'scalar.decode') hex(output?.canonical, ['vectors', index, 'expect', 'output', 'canonical']);
    if (operation === 'ballot.encrypt') hex(input?.supersedes, ['vectors', index, 'input', 'supersedes']);
    if (operation === 'log.verify_election' && Array.isArray(input?.receipts)) input.receipts.forEach((claim, claimIndex) => {
      for (const key of ['voter', 'code']) hex(object(claim)?.[key], ['vectors', index, 'input', 'receipts', claimIndex, key]);
    });
  });
  const required = file === UPPERCASE_FILE ? UPPERCASE_ID : file === MUTANT_FILE ? 'non-canonical-hex' : undefined;
  if (required !== undefined) assert.ok(consumed.has(required), `${file}: intentional malformed-hex rejection fixture exception was not consumed`);
}
