// <election_id>.sqlite (QV-28 §8.2) and the SQLite BoardStore adapter (QV-ADR-014: all board access goes through BoardStore).
import type { DatabaseSync } from 'node:sqlite';
import { decodeHeader, toHex, type BoardStore, type StoredCheckpoint, type StoredEntry } from '@quietvote/board';
import { all, closeDb, get, openDb, run, tx, type Migration } from './db.ts';
import { b64u } from '@quietvote/board';

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 BLOB NOT NULL CHECK (length(sha256)=32), applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE election (
  election_id TEXT PRIMARY KEY CHECK (length(election_id)=32 AND election_id NOT GLOB '*[^0-9a-f]*'),
  origin TEXT NOT NULL UNIQUE, state TEXT NOT NULL, phase_seq TEXT NOT NULL DEFAULT '{}',
  log_pk BLOB NOT NULL, log_sk_enc BLOB, srv_pk BLOB NOT NULL, srv_sk_enc BLOB,
  access TEXT NOT NULL DEFAULT 'public' CHECK (access IN ('public','link')), read_key_hash BLOB,
  title TEXT NOT NULL, draft TEXT, org_id TEXT NOT NULL,
  tree_size INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
  quarantine TEXT, created_at INTEGER NOT NULL) STRICT;
CREATE TABLE log_entry (
  seq INTEGER PRIMARY KEY, type TEXT NOT NULL, author TEXT NOT NULL, author_nonce BLOB NOT NULL CHECK (length(author_nonce)=16),
  nonce_key TEXT NOT NULL UNIQUE,
  header BLOB NOT NULL, leaf_hash BLOB NOT NULL CHECK (length(leaf_hash)=32), body_digest BLOB NOT NULL CHECK (length(body_digest)=32),
  body BLOB, body_len INTEGER NOT NULL, received_at INTEGER NOT NULL, redacted_at INTEGER,
  UNIQUE (author, type, author_nonce), UNIQUE (leaf_hash)) STRICT;
CREATE INDEX log_entry_type ON log_entry(type, seq);
CREATE INDEX log_entry_author ON log_entry(author, type, seq);
CREATE TRIGGER log_entry_gapless BEFORE INSERT ON log_entry
  WHEN NEW.seq IS NOT (SELECT COALESCE(MAX(seq)+1,0) FROM log_entry) BEGIN SELECT RAISE(ABORT,'seq must be max+1'); END;
CREATE TRIGGER log_entry_nodelete BEFORE DELETE ON log_entry BEGIN SELECT RAISE(ABORT,'log_entry is append-only'); END;
CREATE TRIGGER log_entry_noupdate BEFORE UPDATE ON log_entry
  WHEN NEW.seq IS NOT OLD.seq OR NEW.type IS NOT OLD.type OR NEW.author IS NOT OLD.author OR NEW.author_nonce IS NOT OLD.author_nonce
    OR NEW.nonce_key IS NOT OLD.nonce_key OR NEW.header IS NOT OLD.header OR NEW.leaf_hash IS NOT OLD.leaf_hash
    OR NEW.body_digest IS NOT OLD.body_digest OR NEW.body_len IS NOT OLD.body_len OR NEW.received_at IS NOT OLD.received_at
    OR (NEW.body IS NOT OLD.body AND NEW.body IS NOT NULL) OR (NEW.body IS NULL AND NEW.redacted_at IS NULL)
  BEGIN SELECT RAISE(ABORT,'log_entry immutable (only redaction of the body is allowed)'); END;
CREATE TABLE checkpoint (
  tree_size INTEGER PRIMARY KEY, root_hash BLOB NOT NULL CHECK (length(root_hash)=32), note_text TEXT NOT NULL,
  issued_at INTEGER NOT NULL, witnessed INTEGER NOT NULL DEFAULT 0 CHECK (witnessed IN (0,1)), UNIQUE (root_hash, tree_size)) STRICT;
CREATE TABLE voter_invite (
  invite_id TEXT PRIMARY KEY, code_hash BLOB NOT NULL UNIQUE CHECK (length(code_hash)=32), label_enc BLOB, contact_enc BLOB,
  state TEXT NOT NULL CHECK (state IN ('issued','sent','registered','revoked','expired')),
  created_at INTEGER NOT NULL, expires_at INTEGER, registered_at INTEGER) STRICT;
CREATE INDEX voter_invite_state ON voter_invite(state);
CREATE TABLE voter (
  voter_kid TEXT PRIMARY KEY, pk BLOB NOT NULL UNIQUE, alg TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','committed')),
  registered_at INTEGER NOT NULL, roll_index INTEGER UNIQUE, weight INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE ballot_index (
  voter_kid TEXT PRIMARY KEY REFERENCES voter(voter_kid), first_seq INTEGER NOT NULL REFERENCES log_entry(seq),
  latest_seq INTEGER NOT NULL REFERENCES log_entry(seq), ballot_count INTEGER NOT NULL CHECK (ballot_count >= 1)) STRICT;
CREATE INDEX ballot_index_latest ON ballot_index(latest_seq);
CREATE TABLE ballot_ref (
  seq INTEGER PRIMARY KEY REFERENCES log_entry(seq), voter_kid TEXT NOT NULL REFERENCES voter(voter_kid), kind TEXT NOT NULL CHECK (kind IN ('cast','spoil')),
  leaf_hash BLOB NOT NULL) STRICT;
CREATE INDEX ballot_ref_voter ON ballot_ref(voter_kid, seq);
CREATE TABLE projection_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, as_of_seq INTEGER NOT NULL) STRICT;
CREATE TABLE redaction (seq INTEGER PRIMARY KEY REFERENCES log_entry(seq), redacted_at INTEGER NOT NULL, reason TEXT NOT NULL) STRICT;
`,
  },
  {
    version: 2,
    name: 'event_outbox',
    // SSE / webhook outbox (QV-28 §8.2 `event`, QV-09 §9). Public (P0) data only.
    sql: `
CREATE TABLE event (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('entry','checkpoint','phase','witness','alert')),
  seq      INTEGER,
  data     TEXT NOT NULL
) STRICT;
`,
  },
  {
    version: 3,
    name: 'gossip',
    // QV-28 §8.2 `gossip_seen` (checkpoints posted by peers; P4, bounded) and the QV-18 §9.6 evidence record.
    // `fingerprint` is SHA-256 of the signed text of the note (origin, size, root), not of the note with its signature lines,
    // so a peer cannot multiply rows by appending signature lines.
    sql: `
CREATE TABLE gossip_seen (
  fingerprint BLOB PRIMARY KEY CHECK (length(fingerprint)=32),
  tree_size   INTEGER NOT NULL, root_hash BLOB NOT NULL CHECK (length(root_hash)=32), received_at INTEGER NOT NULL,
  consistent  INTEGER NOT NULL CHECK (consistent IN (0,1))
) STRICT;
CREATE INDEX gossip_seen_time ON gossip_seen(received_at);
CREATE TABLE equivocation_evidence (
  evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint BLOB NOT NULL UNIQUE CHECK (length(fingerprint)=32),
  kind        TEXT NOT NULL CHECK (kind IN ('fork','inconsistent','rollback','missing_consistency','broken_promise','witness_conflict')),
  tree_size   INTEGER NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('inbound','outbound')),
  recorded_at INTEGER NOT NULL,
  evidence    TEXT NOT NULL CHECK (length(evidence) <= 32768)
) STRICT;
CREATE TRIGGER equivocation_evidence_noupdate BEFORE UPDATE ON equivocation_evidence BEGIN SELECT RAISE(ABORT,'evidence is append-only'); END;
CREATE TRIGGER equivocation_evidence_nodelete BEFORE DELETE ON equivocation_evidence BEGIN SELECT RAISE(ABORT,'evidence is append-only'); END;
`,
  },
  {
    version: 4,
    name: 'spoil_share',
    // QV-ADR-020: trustee-signed spoil-share records are NOT board log records (QV-16 closed list); they live here and are
    // published through tally.spoiled[].shares. One row per (ballot code, trustee); `record` is the signed record as JSON.
    sql: `
CREATE TABLE spoil_share (
  code        TEXT NOT NULL CHECK (length(code)=64 AND code NOT GLOB '*[^0-9a-f]*'),
  j           INTEGER NOT NULL CHECK (j BETWEEN 1 AND 32),
  spoil_seq   INTEGER NOT NULL,
  record      TEXT NOT NULL CHECK (length(record) <= 2097152),
  received_at INTEGER NOT NULL,
  PRIMARY KEY (code, j)
) STRICT;
`,
  },
];

/** One row of the event outbox. `data` is a JSON string containing public data only. */
export interface EventRow {
  id: number;
  ts: number;
  type: string;
  seq: number | null;
  data: string;
}

export interface ElectionRow {
  election_id: string;
  origin: string;
  state: string;
  log_pk: Uint8Array;
  log_sk_enc: Uint8Array | null;
  srv_pk: Uint8Array;
  srv_sk_enc: Uint8Array | null;
  access: 'public' | 'link';
  read_key_hash: Uint8Array | null;
  title: string;
  draft: string | null;
  org_id: string;
  quarantine: string | null;
  created_at: number;
  imported: number;
}

export interface EvidenceRow {
  evidence_id: number;
  kind: string;
  tree_size: number;
  source: 'inbound' | 'outbound';
  recorded_at: number;
  evidence: string;
}

export interface VoterRow {
  voter_kid: string;
  pk: Uint8Array;
  alg: string;
  status: 'pending' | 'approved' | 'rejected' | 'committed';
  registered_at: number;
  roll_index: number | null;
  weight: number;
}
export interface InviteRow {
  invite_id: string;
  code_hash: Uint8Array;
  label_enc: Uint8Array | null;
  contact_enc: Uint8Array | null;
  state: 'issued' | 'sent' | 'registered' | 'revoked' | 'expired';
  created_at: number;
  expires_at: number | null;
  registered_at: number | null;
}

interface EntryRow {
  seq: number;
  header: Uint8Array;
  body: Uint8Array | null;
  leaf_hash: Uint8Array;
  received_at: number;
  nonce_key: string;
}

const u8 = (x: Uint8Array): Uint8Array => new Uint8Array(x);

export class SqliteBoardStore implements BoardStore {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  size(): number {
    return get<{ n: number }>(this.db, 'SELECT COALESCE(MAX(seq)+1,0) AS n FROM log_entry')!.n;
  }
  appendEntry(e: StoredEntry): void {
    if (this.isReadOnly()) throw new Error('store is read-only');
    const d = decodeHeader(e.headerBytes);
    if (!d.ok) throw new Error('stored header does not parse');
    const h = d.value;
    run(this.db,
      `INSERT INTO log_entry(seq,type,author,author_nonce,nonce_key,header,leaf_hash,body_digest,body,body_len,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      e.seq, h.type, b64u(h.author), h.authorNonce, e.nonceKey, e.headerBytes, e.leafHash, h.bodyDigest, e.body, h.bodyLen, Math.round(e.sequencedAt * 1000));
  }
  getEntry(seq: number): StoredEntry | undefined {
    const r = get<EntryRow>(this.db, 'SELECT seq,header,body,leaf_hash,received_at,nonce_key FROM log_entry WHERE seq=?', seq);
    if (!r) return undefined;
    return { seq: r.seq, headerBytes: u8(r.header), body: r.body === null ? null : u8(r.body), leafHash: u8(r.leaf_hash), sequencedAt: Math.round(r.received_at / 1000), nonceKey: r.nonce_key };
  }
  leafHashes(start: number, end: number): Uint8Array[] {
    return all<{ leaf_hash: Uint8Array }>(this.db, 'SELECT leaf_hash FROM log_entry WHERE seq>=? AND seq<? ORDER BY seq', start, end).map((r) => u8(r.leaf_hash));
  }
  findByNonce(key: string): number | undefined {
    return get<{ seq: number }>(this.db, 'SELECT seq FROM log_entry WHERE nonce_key=?', key)?.seq;
  }
  putCheckpoint(cp: StoredCheckpoint): void {
    const old = get<{ root_hash: Uint8Array }>(this.db, 'SELECT root_hash FROM checkpoint WHERE tree_size=?', cp.size);
    if (old && Buffer.compare(Buffer.from(old.root_hash), Buffer.from(cp.root)) !== 0) throw new Error('conflicting checkpoint root');
    run(this.db, 'INSERT INTO checkpoint(tree_size,root_hash,note_text,issued_at) VALUES (?,?,?,?) ON CONFLICT(tree_size) DO UPDATE SET note_text=excluded.note_text',
      cp.size, cp.root, cp.note, Date.now());
  }
  private cp(r: { tree_size: number; root_hash: Uint8Array; note_text: string } | undefined): StoredCheckpoint | undefined {
    return r ? { size: r.tree_size, root: u8(r.root_hash), note: r.note_text } : undefined;
  }
  getCheckpoint(size: number): StoredCheckpoint | undefined {
    return this.cp(get(this.db, 'SELECT tree_size,root_hash,note_text FROM checkpoint WHERE tree_size=?', size));
  }
  latestCheckpoint(): StoredCheckpoint | undefined {
    return this.cp(get(this.db, 'SELECT tree_size,root_hash,note_text FROM checkpoint ORDER BY tree_size DESC LIMIT 1'));
  }
  listCheckpoints(): StoredCheckpoint[] {
    return all<{ tree_size: number; root_hash: Uint8Array; note_text: string }>(this.db, 'SELECT tree_size,root_hash,note_text FROM checkpoint ORDER BY tree_size').map((r) => this.cp(r)!);
  }
  redactBody(seq: number): void {
    run(this.db, 'UPDATE log_entry SET body=NULL, redacted_at=? WHERE seq=?', Date.now(), seq);
    run(this.db, "INSERT OR IGNORE INTO redaction(seq,redacted_at,reason) VALUES (?,?,'operator')", seq, Date.now());
  }
  isReadOnly(): boolean {
    return get<{ value: string }>(this.db, "SELECT value FROM meta WHERE key='read_only'")?.value === '1';
  }
  setReadOnly(v: boolean): void {
    run(this.db, "INSERT INTO meta(key,value) VALUES ('read_only',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", v ? '1' : '0');
  }
}

export class ElectionDb {
  readonly db: DatabaseSync;
  readonly store: SqliteBoardStore;
  readonly path: string;
  constructor(path: string, appVersion: string, readOnly = false) {
    this.path = path;
    this.db = openDb({ path, applicationId: 0x51564442, synchronous: 'FULL', migrations: MIGRATIONS, appVersion, readOnly });
    this.store = new SqliteBoardStore(this.db);
  }
  close(): void {
    closeDb(this.db);
  }
  tx<T>(fn: () => T): T {
    return tx(this.db, fn);
  }

  init(row: Omit<ElectionRow, 'quarantine' | 'draft' | 'imported'>): void {
    this.tx(() => {
      run(this.db, `INSERT INTO election(election_id,origin,state,log_pk,log_sk_enc,srv_pk,srv_sk_enc,access,read_key_hash,title,org_id,created_at)
        VALUES (?,?, 'DRAFT', ?,?,?,?,?,?,?,?,?)`, row.election_id, row.origin, row.log_pk, row.log_sk_enc, row.srv_pk, row.srv_sk_enc, row.access, row.read_key_hash, row.title, row.org_id, row.created_at);
      run(this.db, "INSERT INTO meta(key,value) VALUES ('election_id',?),('spec_version','QV-28')", row.election_id);
    });
  }
  /** Read-only mirror of a verified bundle (QV-18-REQ-033): no signing keys, state IMPORTED. */
  initImported(row: Omit<ElectionRow, 'quarantine' | 'draft' | 'imported' | 'log_sk_enc' | 'srv_sk_enc' | 'state'>): void {
    this.tx(() => {
      run(this.db, `INSERT INTO election(election_id,origin,state,log_pk,log_sk_enc,srv_pk,srv_sk_enc,access,read_key_hash,title,org_id,created_at,imported)
        VALUES (?,?, 'IMPORTED', ?, NULL, ?, NULL, ?,?,?,?,?, 1)`, row.election_id, row.origin, row.log_pk, row.srv_pk, row.access, row.read_key_hash, row.title, row.org_id, row.created_at);
      run(this.db, "INSERT INTO meta(key,value) VALUES ('election_id',?),('spec_version','QV-28')", row.election_id);
    });
  }
  meta(key: string): string | undefined {
    return get<{ value: string }>(this.db, 'SELECT value FROM meta WHERE key=?', key)?.value;
  }
  setMeta(key: string, value: string): void {
    run(this.db, 'INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
  }
  importVoters(pks: Uint8Array[], kidOf: (pk: Uint8Array) => string, at: number): void {
    pks.forEach((pk, i) => {
      run(this.db, "INSERT INTO voter(voter_kid,pk,alg,status,registered_at,roll_index) VALUES (?,?, 'ed25519', 'committed', ?, ?)", kidOf(pk), pk, at, i);
    });
  }
  // ---- gossip and equivocation evidence (QV-18 §9.5-9.6)
  /** Records a verified peer note. Bounded: rows older than `retentionMs` go, and at most `maxRows` stay (oldest first out). */
  recordGossip(fp: Uint8Array, size: number, root: Uint8Array, now: number, consistent: boolean, maxRows: number, retentionMs: number): void {
    run(this.db, 'INSERT OR IGNORE INTO gossip_seen(fingerprint,tree_size,root_hash,received_at,consistent) VALUES (?,?,?,?,?)', fp, size, root, now, consistent ? 1 : 0);
    run(this.db, 'DELETE FROM gossip_seen WHERE received_at < ?', now - retentionMs);
    run(this.db, 'DELETE FROM gossip_seen WHERE fingerprint IN (SELECT fingerprint FROM gossip_seen ORDER BY received_at DESC, rowid DESC LIMIT -1 OFFSET ?)', maxRows);
  }
  gossipCount(): number {
    return get<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM gossip_seen')!.n;
  }
  /** Returns true when the evidence is new. At most `maxRows` rows are kept; later distinct evidence is dropped (the first is what matters). */
  addEvidence(fp: Uint8Array, kind: string, size: number, source: 'inbound' | 'outbound', now: number, evidence: string, maxRows: number): boolean {
    if (get<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM equivocation_evidence')!.n >= maxRows) return false;
    return Number(run(this.db, 'INSERT OR IGNORE INTO equivocation_evidence(fingerprint,kind,tree_size,source,recorded_at,evidence) VALUES (?,?,?,?,?,?)', fp, kind, size, source, now, evidence).changes) === 1;
  }
  evidence(limit: number): EvidenceRow[] {
    return all<EvidenceRow>(this.db, 'SELECT evidence_id,kind,tree_size,source,recorded_at,evidence FROM equivocation_evidence ORDER BY evidence_id LIMIT ?', limit);
  }
  evidenceCount(): number {
    return get<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM equivocation_evidence')!.n;
  }
  /** Evidence that the log key signed a history this database does not contain or contradicts (fork, inconsistent, rollback). */
  hasKeyEvidence(): boolean {
    return get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM equivocation_evidence WHERE kind IN ('fork','inconsistent','rollback')")!.n > 0;
  }
  /** fork / inconsistent: the log key signed contradictory histories. Not clearable by an operator. */
  hasPermanentEvidence(): boolean {
    return get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM equivocation_evidence WHERE kind IN ('fork','inconsistent')")!.n > 0;
  }
  maxEvidenceSize(): number {
    return get<{ m: number | null }>(this.db, "SELECT MAX(tree_size) AS m FROM equivocation_evidence WHERE kind='rollback'")?.m ?? 0;
  }
  row(): ElectionRow {
    const r = get<ElectionRow>(this.db, 'SELECT election_id,origin,state,log_pk,log_sk_enc,srv_pk,srv_sk_enc,access,read_key_hash,title,draft,org_id,quarantine,created_at,imported FROM election');
    if (!r) throw new Error('election row missing');
    return r;
  }
  setDraft(json: string): void {
    run(this.db, 'UPDATE election SET draft=?', json);
  }
  setState(state: string, phaseSeq: Record<string, number>, treeSize: number): void {
    run(this.db, 'UPDATE election SET state=?, phase_seq=?, tree_size=?', state, JSON.stringify(phaseSeq), treeSize);
  }
  setTitle(t: string): void {
    run(this.db, 'UPDATE election SET title=?', t);
  }
  setQuarantine(reason: string | null): void {
    run(this.db, 'UPDATE election SET quarantine=?', reason);
  }
  // ---- event outbox
  insertEvent(ts: number, type: string, seq: number | null, data: string): EventRow {
    const r = run(this.db, 'INSERT INTO event(ts,type,seq,data) VALUES (?,?,?,?)', ts, type, seq, data);
    return { id: Number(r.lastInsertRowid), ts, type, seq, data };
  }
  /** Events with id > after, ascending, at most `limit`. */
  eventsAfter(after: number, limit: number): EventRow[] {
    return all<EventRow>(this.db, 'SELECT event_id AS id, ts, type, seq, data FROM event WHERE event_id > ? ORDER BY event_id LIMIT ?', after, limit);
  }
  eventBounds(): { first: number; last: number } | undefined {
    const r = get<{ f: number | null; l: number | null }>(this.db, 'SELECT MIN(event_id) AS f, MAX(event_id) AS l FROM event');
    return r && r.f !== null && r.l !== null ? { first: r.f, last: r.l } : undefined;
  }
  /** Highest event id ever issued (survives pruning thanks to AUTOINCREMENT). */
  lastEventId(): number {
    return get<{ s: number | null }>(this.db, "SELECT seq AS s FROM sqlite_sequence WHERE name='event'")?.s ?? 0;
  }
  pruneEvents(): void {
    run(this.db, 'DELETE FROM event');
  }

  eraseKeys(): void {
    run(this.db, 'UPDATE election SET log_sk_enc=NULL, srv_sk_enc=NULL');
  }
  totalBodyBytes(): number {
    return get<{ n: number }>(this.db, 'SELECT COALESCE(SUM(body_len),0) AS n FROM log_entry')!.n;
  }

  // ---- entries (queries beyond the BoardStore contract)
  entries(from: number, limit: number, type?: string, authorB64u?: string): { rows: (StoredEntry & { type: string; author: string })[]; more: boolean } {
    const r = all<EntryRow & { type: string; author: string }>(this.db,
      `SELECT seq,header,body,leaf_hash,received_at,nonce_key,type,author FROM log_entry WHERE seq>=? AND (? IS NULL OR type=?) AND (? IS NULL OR author=?) ORDER BY seq LIMIT ?`,
      from, type ?? null, type ?? null, authorB64u ?? null, authorB64u ?? null, limit + 1);
    const more = r.length > limit;
    return {
      more,
      rows: r.slice(0, limit).map((x) => ({
        seq: x.seq, headerBytes: u8(x.header), body: x.body === null ? null : u8(x.body), leafHash: u8(x.leaf_hash), sequencedAt: Math.round(x.received_at / 1000), nonceKey: x.nonce_key, type: x.type, author: x.author,
      })),
    };
  }
  seqByLeaf(leaf: Uint8Array): number | undefined {
    return get<{ seq: number }>(this.db, 'SELECT seq FROM log_entry WHERE leaf_hash=?', leaf)?.seq;
  }
  redactions(): { seq: number; redactedAt: number; reason: string }[] {
    return all<{ seq: number; redacted_at: number; reason: string }>(this.db, 'SELECT seq,redacted_at,reason FROM redaction ORDER BY seq').map((r) => ({ seq: r.seq, redactedAt: r.redacted_at, reason: r.reason }));
  }

  // ---- invites
  addInvites(rows: Omit<InviteRow, 'registered_at'>[]): void {
    this.tx(() => {
      for (const r of rows) {
        run(this.db, 'INSERT INTO voter_invite(invite_id,code_hash,label_enc,contact_enc,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?)',
          r.invite_id, r.code_hash, r.label_enc, r.contact_enc, r.state, r.created_at, r.expires_at);
      }
    });
  }
  inviteByHash(h: Uint8Array): InviteRow | undefined {
    return get<InviteRow>(this.db, 'SELECT * FROM voter_invite WHERE code_hash=?', h);
  }
  inviteById(id: string): InviteRow | undefined {
    return get<InviteRow>(this.db, 'SELECT * FROM voter_invite WHERE invite_id=?', id);
  }
  invites(state: string | undefined, after: string | undefined, limit: number): InviteRow[] {
    return all<InviteRow>(this.db, 'SELECT * FROM voter_invite WHERE (? IS NULL OR state=?) AND (? IS NULL OR invite_id>?) ORDER BY invite_id LIMIT ?',
      state ?? null, state ?? null, after ?? null, after ?? null, limit);
  }
  setInviteState(id: string, state: InviteRow['state']): void {
    run(this.db, 'UPDATE voter_invite SET state=? WHERE invite_id=?', state, id);
  }
  /** Marks an invite used and purges contact data; deliberately stores no link to the voter row (QV-28 §8.2). */
  consumeInvite(id: string, hourRounded: number): boolean {
    const r = run(this.db, "UPDATE voter_invite SET state='registered', registered_at=?, contact_enc=NULL, label_enc=label_enc WHERE invite_id=? AND state IN ('issued','sent')", hourRounded, id);
    return Number(r.changes) === 1;
  }

  // ---- voters
  voter(kid: string): VoterRow | undefined {
    return get<VoterRow>(this.db, 'SELECT * FROM voter WHERE voter_kid=?', kid);
  }
  voterByPk(pk: Uint8Array): VoterRow | undefined {
    return get<VoterRow>(this.db, 'SELECT * FROM voter WHERE pk=?', pk);
  }
  addVoter(v: Omit<VoterRow, 'roll_index' | 'weight'>): void {
    run(this.db, 'INSERT INTO voter(voter_kid,pk,alg,status,registered_at) VALUES (?,?,?,?,?)', v.voter_kid, v.pk, v.alg, v.status, v.registered_at);
  }
  voterCount(): number {
    return get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM voter WHERE status IN ('approved','committed')")!.n;
  }
  voters(after: number, limit: number): VoterRow[] {
    return all<VoterRow>(this.db, "SELECT * FROM voter WHERE rowid>? AND status IN ('approved','committed') ORDER BY rowid LIMIT ?", after, limit);
  }
  voterRowid(kid: string): number {
    return get<{ rowid: number }>(this.db, 'SELECT rowid FROM voter WHERE voter_kid=?', kid)?.rowid ?? 0;
  }
  /** Approved keys, hex, strictly ascending (the order rollRoot requires). */
  approvedKeysHex(): string[] {
    return all<{ pk: Uint8Array }>(this.db, "SELECT pk FROM voter WHERE status IN ('approved','committed')").map((r) => toHex(r.pk)).sort();
  }
  commitRoll(sortedHex: string[]): void {
    this.tx(() => {
      sortedHex.forEach((h, i) => {
        run(this.db, "UPDATE voter SET status='committed', roll_index=? WHERE pk=?", i, Buffer.from(h, 'hex'));
      });
      run(this.db, "UPDATE voter SET status='rejected' WHERE status NOT IN ('committed')");
    });
  }
  committedVoterByKid(kid: string): VoterRow | undefined {
    return get<VoterRow>(this.db, "SELECT * FROM voter WHERE voter_kid=? AND status='committed'", kid);
  }

  // ---- spoil shares (QV-ADR-020)
  insertSpoilShare(code: string, j: number, spoilSeq: number, record: string, at: number): void {
    run(this.db, 'INSERT INTO spoil_share(code,j,spoil_seq,record,received_at) VALUES (?,?,?,?,?)', code, j, spoilSeq, record, at);
  }
  spoilShare(code: string, j: number): { spoil_seq: number; record: string } | undefined {
    return get(this.db, 'SELECT spoil_seq,record FROM spoil_share WHERE code=? AND j=?', code, j);
  }
  spoilSharesOf(code: string): { j: number; spoil_seq: number; record: string }[] {
    return all(this.db, 'SELECT j,spoil_seq,record FROM spoil_share WHERE code=? ORDER BY j', code) as never;
  }
  spoilShareIndex(): { code: string; j: number }[] {
    return all(this.db, 'SELECT code,j FROM spoil_share ORDER BY code,j') as never;
  }

  // ---- ballots
  recordBallot(seq: number, kid: string, kind: 'cast' | 'spoil', leaf: Uint8Array): void {
    run(this.db, 'INSERT INTO ballot_ref(seq,voter_kid,kind,leaf_hash) VALUES (?,?,?,?)', seq, kid, kind, leaf);
    if (kind === 'cast') {
      run(this.db, `INSERT INTO ballot_index(voter_kid,first_seq,latest_seq,ballot_count) VALUES (?,?,?,1)
        ON CONFLICT(voter_kid) DO UPDATE SET latest_seq=excluded.latest_seq, ballot_count=ballot_count+1`, kid, seq, seq);
    }
  }
  ballotIndex(kid: string): { first_seq: number; latest_seq: number; ballot_count: number } | undefined {
    return get(this.db, 'SELECT first_seq,latest_seq,ballot_count FROM ballot_index WHERE voter_kid=?', kid);
  }
  ballotsOf(kid: string, after: number, limit: number): { seq: number; leaf_hash: Uint8Array; kind: string }[] {
    return all(this.db, 'SELECT seq,leaf_hash,kind FROM ballot_ref WHERE voter_kid=? AND seq>? ORDER BY seq LIMIT ?', kid, after, limit) as never;
  }
}
