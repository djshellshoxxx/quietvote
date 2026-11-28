// QV-28-REQ-010: preserve protected rows and independently check their Merkle commitments.
// The caller holds a stable database snapshot/transaction for capture and comparison.
import { createHash, type Hash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

const TABLES = ['log_entry', 'checkpoint', 'merkle_node'] as const;
type ProtectedTable = typeof TABLES[number];
type Row = Record<string, SQLOutputValue>;
const KEYS: Record<ProtectedTable, readonly string[]> = {
  log_entry: ['seq'], checkpoint: ['tree_size'], merkle_node: ['level', 'idx'],
};
const REQUIRED: Record<ProtectedTable, readonly string[]> = {
  log_entry: ['seq', 'header', 'leaf_hash'], checkpoint: ['tree_size', 'root_hash'], merkle_node: ['level', 'idx', 'hash'],
};

export interface ProtectedRows {
  readonly columns: readonly string[];
  readonly rows: bigint;
  readonly sha256: string;
}

export interface MigrationInvariants {
  readonly log: { readonly size: bigint; readonly maxSeq: bigint | null; readonly root: string };
  readonly tables: Readonly<Record<ProtectedTable, ProtectedRows | null>>;
}

function fail(reason: string): never {
  // Never include bodies, headers, note contents, or arbitrary field values in errors.
  throw new Error(`migration invariant violation: ${reason}`);
}

const ident = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const equal = (a: Uint8Array, b: Uint8Array): boolean => Buffer.compare(a, b) === 0;
const hash = (...parts: Uint8Array[]): Uint8Array => {
  const h = createHash('sha256');
  for (const part of parts) h.update(part);
  return h.digest();
};
const parent = (a: Uint8Array, b: Uint8Array): Uint8Array => hash(new Uint8Array([1]), a, b);

function columns(db: DatabaseSync, table: ProtectedTable): string[] | null {
  if (db.prepare('SELECT 1 FROM sqlite_temp_schema WHERE name=? COLLATE NOCASE').get(table) !== undefined) {
    fail(`${table} has a temporary shadow`);
  }
  const object = db.prepare('SELECT type,rootpage FROM main.sqlite_schema WHERE name=? COLLATE NOCASE').get(table);
  if (object === undefined) return null;
  if (object.type !== 'table' || typeof object.rootpage !== 'number' || object.rootpage <= 0) {
    fail(`${table} must be an ordinary table`);
  }
  const names: string[] = [];
  for (const row of db.prepare(`PRAGMA main.table_xinfo(${ident(table)})`).iterate()) {
    if (typeof row.name !== 'string') fail(`${table} has invalid column metadata`);
    names.push(row.name);
  }
  for (const name of REQUIRED[table]) if (!names.includes(name)) fail(`${table} is missing a required column`);
  return names.sort();
}

/** Type tag + unsigned 64-bit byte length prevents ambiguous concatenation. */
function frame(h: Hash, tag: number, bytes: Uint8Array): void {
  const prefix = Buffer.alloc(9);
  prefix[0] = tag;
  prefix.writeBigUInt64BE(BigInt(bytes.byteLength), 1);
  h.update(prefix).update(bytes);
}

function valueFrame(h: Hash, type: SQLOutputValue | undefined, value: SQLOutputValue | undefined): void {
  if (type === 'null' && value === null) { frame(h, 0, new Uint8Array()); return; }
  if (type === 'integer' && typeof value === 'bigint') {
    const bytes = Buffer.alloc(8);
    bytes.writeBigInt64BE(value);
    frame(h, 1, bytes);
    return;
  }
  if (type === 'real' && typeof value === 'number' && !Number.isNaN(value)) {
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(value);
    frame(h, 2, bytes);
    return;
  }
  if ((type === 'text' || type === 'blob') && value instanceof Uint8Array) {
    frame(h, type === 'text' ? 3 : 4, value);
    return;
  }
  fail('unsupported stored value');
}

function reader(db: DatabaseSync, table: ProtectedTable, names: readonly string[]) {
  // Read TEXT as bytes too: decoding malformed UTF-8 or embedded NUL must not
  // collapse two different stored values into the same row digest.
  const projection = names.map((name, i) => {
    const column = ident(name);
    return `typeof(${column}) AS t${i}, CASE WHEN typeof(${column}) IN ('text','blob') THEN CAST(${column} AS BLOB) ELSE ${column} END AS v${i}`;
  }).join(',');
  const statement = db.prepare(`SELECT ${projection} FROM main.${ident(table)} ORDER BY ${KEYS[table].map(ident).join(',')}`);
  statement.setReadBigInts(true);
  const iterator = statement.iterate();
  const digest = createHash('sha256');
  frame(digest, 10, Buffer.from('qv-migration-rows/v1'));
  frame(digest, 11, Buffer.from(table));
  for (const name of names) frame(digest, 12, Buffer.from(name));
  let count = 0n;
  const field = (row: Row, name: string): SQLOutputValue | undefined => row[`v${names.indexOf(name)}`];
  return {
    next(): Row | undefined {
      const result = iterator.next();
      if (result.done === true) return undefined;
      digest.update(new Uint8Array([13]));
      for (let i = 0; i < names.length; i++) valueFrame(digest, result.value[`t${i}`], result.value[`v${i}`]);
      count++;
      return result.value;
    },
    integer(row: Row, name: string): bigint {
      const value = field(row, name);
      if (typeof value !== 'bigint') fail(`${table}.${name} must be an integer`);
      return value;
    },
    blob(row: Row, name: string, length?: number): Uint8Array {
      const i = names.indexOf(name);
      const value = field(row, name);
      if (row[`t${i}`] !== 'blob' || !(value instanceof Uint8Array) || (length !== undefined && value.length !== length)) {
        fail(`${table}.${name} must be a${length === undefined ? '' : ` ${length}-byte`} blob`);
      }
      return value;
    },
    count: (): bigint => count,
    finish: (): ProtectedRows => Object.freeze({ columns: Object.freeze([...names]), rows: count, sha256: digest.digest('hex') }),
    close: (): void => { iterator.return?.(); },
  };
}
type Reader = ReturnType<typeof reader>;

function root(frontier: readonly (Uint8Array | undefined)[]): Uint8Array {
  let result: Uint8Array | undefined;
  for (const part of frontier) if (part !== undefined) result = result === undefined ? part : parent(part, result);
  return result ?? hash(new Uint8Array());
}

function capture(db: DatabaseSync, before?: MigrationInvariants): MigrationInvariants {
  const readers: Partial<Record<ProtectedTable, Reader | null>> = {};
  try {
    for (const table of TABLES) {
      const names = columns(db, table);
      const previous = before?.tables[table];
      if (previous !== undefined && previous !== null) {
        if (names === null) fail(`${table} was dropped`);
        if (previous.columns.some((name) => !names.includes(name))) fail(`${table} lost a protected column`);
      }
      // Expand migrations may add columns. Compare all old values; a new capture
      // after the step includes the added columns in the next baseline.
      readers[table] = names === null ? null : reader(db, table, previous?.columns ?? names);
    }
    const entries = readers.log_entry ?? null;
    const checkpoints = readers.checkpoint ?? null;
    const nodes = readers.merkle_node ?? null;
    if (nodes !== null) {
      for (let row = nodes.next(); row !== undefined; row = nodes.next()) {
        const level = nodes.integer(row, 'level');
        if (level < 1n || level > 63n || nodes.integer(row, 'idx') < 0n) fail('merkle_node has an invalid coordinate');
        nodes.blob(row, 'hash', 32);
      }
    }
    // Optional historical cache: compare every stored node with a completed
    // subtree. Point lookups retain no cache rows or log-sized hash collection.
    const storedNode = nodes === null ? null : db.prepare('SELECT hash FROM main.merkle_node WHERE level=? AND idx=?');
    let matchedNodes = 0n;
    let lastCheckpoint = -1n;
    const nextCheckpoint = (): { size: bigint; root: Uint8Array } | undefined => {
      const row = checkpoints?.next();
      if (row === undefined || checkpoints === null) return undefined;
      const size = checkpoints.integer(row, 'tree_size');
      if (size < 0n || size <= lastCheckpoint) fail('checkpoint sizes must be nonnegative and unique');
      lastCheckpoint = size;
      return { size, root: checkpoints.blob(row, 'root_hash', 32) };
    };
    let checkpoint = nextCheckpoint();
    if (checkpoint !== undefined && entries === null) fail('checkpoint exists without log_entry');
    const frontier: (Uint8Array | undefined)[] = [];
    let size = 0n;
    const checkPrefix = (): void => {
      if (checkpoint?.size !== size) return;
      if (!equal(checkpoint.root, root(frontier))) fail(`checkpoint root mismatch at size ${size}`);
      checkpoint = nextCheckpoint();
    };
    checkPrefix();
    if (entries !== null) {
      for (let row = entries.next(); row !== undefined; row = entries.next()) {
        if (entries.integer(row, 'seq') !== size) fail('log_entry sequence is not contiguous from zero');
        let leaf = hash(new Uint8Array([0]), entries.blob(row, 'header'));
        if (!equal(leaf, entries.blob(row, 'leaf_hash', 32))) fail(`leaf hash mismatch at sequence ${size}`);
        let level = 0;
        for (let occupied = size; (occupied & 1n) === 1n; occupied >>= 1n) {
          const left = frontier[level];
          if (left === undefined) fail('missing Merkle frontier node');
          leaf = parent(left, leaf);
          frontier[level] = undefined;
          level++;
          const cached = storedNode?.get(BigInt(level), size >> BigInt(level));
          if (cached !== undefined) {
            if (!(cached.hash instanceof Uint8Array) || !equal(leaf, cached.hash)) fail('merkle_node hash mismatch');
            matchedNodes++;
          }
        }
        frontier[level] = leaf;
        size++;
        checkPrefix();
      }
    }
    if (checkpoint !== undefined) fail('checkpoint exceeds the log size');
    if (nodes !== null && matchedNodes !== nodes.count()) fail('merkle_node contains an orphan or duplicate node');
    const tables = {} as Record<ProtectedTable, ProtectedRows | null>;
    for (const table of TABLES) tables[table] = readers[table]?.finish() ?? null;
    return Object.freeze({
      log: Object.freeze({ size, maxSeq: size === 0n ? null : size - 1n, root: Buffer.from(root(frontier)).toString('hex') }),
      tables: Object.freeze(tables),
    });
  } finally {
    for (const table of TABLES) readers[table]?.close();
  }
}

/** Capture every protected row, streaming bodies and retaining O(log n) hashes. */
export function captureMigrationInvariants(db: DatabaseSync): MigrationInvariants {
  return capture(db);
}

/** Reject changes to existing protected values; initially absent tables may be created empty. */
export function assertMigrationInvariants(db: DatabaseSync, before: MigrationInvariants): void {
  const after = capture(db, before);
  for (const table of TABLES) {
    const oldRows = before.tables[table];
    const newRows = after.tables[table];
    if (oldRows === null) {
      if (newRows !== null && newRows.rows !== 0n) fail(`${table} was created with protected rows`);
    } else if (newRows === null || oldRows.rows !== newRows.rows || oldRows.sha256 !== newRows.sha256) {
      fail(`${table} protected rows changed`);
    }
  }
  if (before.log.size !== after.log.size || before.log.maxSeq !== after.log.maxSeq || before.log.root !== after.log.root) {
    fail('log size or root changed');
  }
}
