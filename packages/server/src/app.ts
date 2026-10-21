// Application assembly: services + route table (QV-09 §6-§10 subset; see NOTES.md for what is not implemented).
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import {
  MerkleTree as _M, authorKeyId, b64, b64u, parseCheckpoint, toHex, unb64u, witnessStatus, ENTRY_TYPES,
  type EntryHeader, type Receipt, type WitnessPolicy,
} from '@quietvote/board';
import { bytesToHex, ed25519IsStrictPoint, ed25519Keypair, ed25519Sign, ed25519Verify, hexToBytes, jcs, sha256, utf8 } from '@quietvote/crypto';
import { PROTO_ID } from '@quietvote/protocol';
import { audienceOf, authenticate, keyIdOf } from './auth.ts';
import { resolveConfig, type ServerConfig, type ServerOptions } from './config.ts';
import { ControlDb } from './controldb.ts';
import { SERVER_VERSION, type ElectionRuntime } from './election.ts';
import type { Env } from './env.ts';
import { electionBundle, qvb } from './export.ts';
import { registerExtRoutes } from './ext-routes.ts';
import { GossipService } from './gossip.ts';
import { JobRunner } from './jobs.ts';
import { createHttpApp, type Ctx, type HttpApp, type Reply, type Route } from './http.ts';
import { loadOrCreateKek, seal, open as unsealBytes } from './kek.ts';
import { Logger } from './logger.ts';
import { ElectionPool } from './pool.ts';
import { ApiError, conflict, forbidden, notFound } from './problem.ts';
import { FailureCounter, RateLimiter } from './ratelimit.ts';
import { SseHub } from './sse.ts';
import { TargetRejected } from './ssrf.ts';
import { StaticAssets } from './static.ts';
import { WEBHOOK_EVENTS, WebhookService } from './webhooks.ts';
import { ctEq, fArr, fBool, fEnum, fInt, fObj, fStr, opt, originOf as _o, req, toIso } from './util.ts';
import { effectiveMinCounted } from '@quietvote/protocol';
void _M; void _o;

export interface QuietVoteServer {
  http: HttpApp;
  env: Env;
  pool: ElectionPool;
  sse: SseHub;
  webhooks: WebhookService;
  jobs: JobRunner;
  gossip: GossipService;
  start(): Promise<{ port: number; host: string; url: string }>;
  stop(): Promise<void>;
}

const MAX_ENTRY_REQ = 1_153_434;
const b64uRe = /^[A-Za-z0-9_-]*$/;

function receiptView(r: Receipt): Record<string, unknown> {
  const v: Record<string, unknown> = {
    origin: r.origin, seq: r.seq, leaf_hash: b64u(r.leafHash),
    promise: { sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline }, promise_sig: b64u(r.promiseSig),
  };
  if (r.inclusion) v['inclusion'] = { seq: r.seq, leaf_hash: b64u(r.leafHash), tree_size: r.inclusion.treeSize, path: r.inclusion.path.map(b64), checkpoint_note: r.inclusion.checkpointNote };
  return v;
}

export function buildServer(opts: ServerOptions): QuietVoteServer {
  const cfg: ServerConfig = resolveConfig(opts);
  mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
  const nowMs = cfg.now;
  const control = new ControlDb(cfg.dataDir, nowMs, SERVER_VERSION);
  const witnesses = cfg.witnesses.map((w) => ({ name: w.name, alg: 'ed25519' as const, publicKey: hexToBytes(w.publicKey, 32) }));
  const env: Env = {
    cfg, control, kek: loadOrCreateKek(cfg.dataDir), limiter: new RateLimiter(nowMs), failures: new FailureCounter(nowMs),
    logger: new Logger(cfg.logSink, nowMs), stats: { proofVerifications: 0, requests: 0, appended: 0 }, inflight: { n: 0 },
    nowMs, nowSec: () => Math.floor(nowMs() / 1000),
    witnessPolicy: (quorum): WitnessPolicy => ({ witnesses, quorum, noneAcknowledged: quorum === 0 }),
  };
  for (const k of cfg.adminKeys) control.seedAdmin(keyIdOf(hexToBytes(k, 32)), hexToBytes(k, 32));
  const pool = new ElectionPool(env);
  const sse = new SseHub(env);
  const webhooks = new WebhookService(env);
  const jobs = new JobRunner(env);
  const gossip = new GossipService(env, pool);
  env.onEvent = (who, ev) => webhooks.onEvent(who, ev);
  const statics = cfg.staticDir ? new StaticAssets(cfg.staticDir) : undefined;
  const releaseKey = cfg.releaseSeedHex ? ed25519Keypair(hexToBytes(cfg.releaseSeedHex, 32)) : undefined;

  // ---------------------------------------------------------------- helpers
  const rtOf = async (c: Ctx): Promise<ElectionRuntime> => {
    const rt = await pool.get(c.params['id']!);
    if (!rt) throw notFound('election');
    return rt;
  };
  const readable = async (c: Ctx): Promise<ElectionRuntime> => {
    const rt = await rtOf(c);
    const row = rt.edb.row();
    if (row.access === 'link') {
      const k = c.header('qv-read-key');
      const ok = k !== undefined && row.read_key_hash !== null && ctEq(sha256(utf8(`QV-READKEY-v1\0${k}`)), new Uint8Array(row.read_key_hash));
      if (!ok) throw forbidden('this election requires a read key', 'READ_KEY_REQUIRED');
    }
    return rt;
  };
  const orgElection = async (c: Ctx): Promise<ElectionRuntime> => {
    const rt = await rtOf(c);
    if (c.auth?.role === 'instance_admin') return rt;
    if (c.auth?.orgId !== rt.orgId) throw notFound('election'); // cross-org probes look like 404
    return rt;
  };
  const orgOf = (c: Ctx): string => {
    const o = c.params['org']!;
    if (c.auth?.role !== 'instance_admin' && c.auth?.orgId !== o) throw notFound('organization');
    if (!control.getOrg(o)) throw notFound('organization');
    return o;
  };
  const idem = async (c: Ctx, principal: string, fn: () => Promise<Reply>, redact?: (r: Reply) => Reply): Promise<Reply> => {
    const key = c.header('idempotency-key');
    if (key === undefined || key.length < 8 || key.length > 128 || !/^[\x21-\x7e]+$/.test(key)) throw new ApiError(400, 'BAD_REQUEST', 'Idempotency-Key header (8-128 printable chars) is required');
    const h = new Uint8Array(createHash('sha256').update(`${c.method}\n${c.target}\n`).update(c.body).digest());
    const prev = control.idem(principal, key);
    if (prev && prev.expires_at > nowMs()) {
      if (Buffer.compare(Buffer.from(prev.req_sha256), Buffer.from(h)) !== 0) throw new ApiError(422, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key was used with a different request');
      if (prev.status === 0) throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'original request still running', { retryAfter: 1 });
      return { status: prev.status, headers: { 'Idempotent-Replay': 'true' }, json: prev.response ? JSON.parse(Buffer.from(prev.response).toString()) : undefined };
    }
    control.storeIdem(principal, key, c.method, c.path, h, 0, null);
    try {
      const r = await fn();
      const stored = redact ? redact(r) : r;
      control.storeIdem(principal, key, c.method, c.path, h, r.status, stored.json === undefined ? null : Buffer.from(JSON.stringify(stored.json)));
      return r;
    } catch (e) {
      control.db.exec(`DELETE FROM idempotency WHERE idem_key = '${key.replace(/'/g, "''")}' AND principal = '${principal.replace(/'/g, "''")}' AND status = 0`);
      throw e;
    }
  };
  const need = (v: string | undefined | null, what: string): string => {
    if (!v) throw new ApiError(400, 'BAD_REQUEST', `${what} required`);
    return v;
  };
  const intQ = (c: Ctx, n: string, def: number, max: number): number => {
    const s = c.query.get(n);
    if (s === null) return def;
    if (!/^\d{1,9}$/.test(s) || Number(s) > max) throw new ApiError(400, 'BAD_REQUEST', `bad ${n}`);
    return Number(s);
  };

  const entryView = (e: { seq: number; headerBytes: Uint8Array; body: Uint8Array | null; leafHash: Uint8Array }, type: string, author: string, h?: EntryHeader): Record<string, unknown> => ({
    seq: e.seq, type, author, leaf_hash: b64u(e.leafHash), header_b64u: b64u(e.headerBytes), body_b64u: e.body === null ? null : b64u(e.body),
    ...(e.body === null ? { redacted: true } : {}),
    ...(h ? { parsed: { origin: h.origin, created_at: h.createdAt, body_len: h.bodyLen, refs: h.refs } } : {}),
  });

  const checkpointView = (note: string, size: number, root: Uint8Array, rt: ElectionRuntime): Record<string, unknown> => {
    const p = parseCheckpoint(note);
    const ws = p.ok ? witnessStatus(p.value, rt.witnessPolicy()) : undefined;
    return { tree_size: size, root: b64(root), note, witnessed: !!ws && rt.witnessPolicy().quorum > 0 && ws.witnessed, cosigners: ws ? [...ws.valid.keys()] : [] };
  };

  const stateView = (rt: ElectionRuntime): Record<string, unknown> => {
    const st = rt.st;
    const w = rt.witnessInfo();
    const m = st.manifest;
    const now = env.nowSec();
    const gates = [
      { name: 'manifest_published', satisfied: m !== undefined },
      { name: 'dkg_complete', satisfied: st.params !== undefined, ...(st.dkgError ? { detail: st.dkgError } : {}) },
      { name: 'roll_committed', satisfied: st.rollSet !== undefined },
      { name: 'voting_window', satisfied: !!m && now >= Date.parse(m.voting_open) / 1000 - m.clock_skew_s && now < Date.parse(m.voting_close) / 1000 },
      { name: 'witness_quorum', satisfied: w.required === 0 || w.witnessed, detail: `${w.have}/${w.required}` },
      { name: 'tally_unblocked', satisfied: st.tallyBlocked === undefined, ...(st.tallyBlocked ? { detail: st.tallyBlocked } : {}) },
    ];
    const quarantine = rt.quarantineReason();
    return {
      election_id: rt.id, phase: rt.state, tree_size: rt.log.size, witnessed: w.witnessed,
      witness_quorum: { required: w.required, have: w.have },
      ...(rt.st.mh ? { manifest_hash: b64u(rt.st.mh) } : {}),
      phase_seq: st.phaseSeq,
      integrity: rt.edb.hasPermanentEvidence() ? 'compromised' : quarantine ? 'quarantined' : w.required > 0 && !w.witnessed ? 'unwitnessed' : 'ok',
      gates,
    };
  };

  // ---------------------------------------------------------------- routes
  const R: Route[] = [];
  const add = (r: Route): void => void R.push(r);

  add({ method: 'GET', path: '/healthz', cls: 'R', auth: 'none', handler: () => ({ status: 200, json: { status: 'ok' } }) });
  add({
    method: 'GET', path: '/readyz', cls: 'R', auth: 'none',
    handler: () => {
      try {
        control.tx(() => control.instanceId());
        return { status: 200, json: { status: 'ready' } };
      } catch {
        throw new ApiError(503, 'MAINTENANCE', 'database not writable');
      }
    },
  });
  add({
    method: 'GET', path: '/api/v1/instance', cls: 'R', auth: 'none',
    handler: () => ({
      status: 200,
      json: {
        instance_id: control.instanceId(), api_versions: ['1.0'], server_version: SERVER_VERSION, protocol_suites: [PROTO_ID], entry_types: [...ENTRY_TYPES],
        registration_mode: cfg.registrationMode, logging: { ip: false, user_agent: false },
        limits: { max_entry_bytes: 1 << 20, max_ballot_bytes: cfg.maxBallotBytes, max_import_bytes: cfg.maxImportBytes, max_revotes: 20, max_log_bytes: cfg.maxLogBytes },
        features: ['signed-requests', 'link-access', 'qvb-export', 'witness-cosign', 'gossip', 'imports', 'range-export', 'admin'], witnesses_supported: cfg.witnesses.map((w) => w.name),
      },
    }),
  });
  add({
    method: 'GET', path: '/api/v1/instance/release', cls: 'R', auth: 'none',
    handler: () => {
      const files = statics?.manifest() ?? [];
      const body = { version: SERVER_VERSION, files };
      return { status: 200, json: { ...body, signature: releaseKey ? b64u(ed25519Sign(releaseKey.secretKey, jcs(body))) : null, signing_key_id: releaseKey ? keyIdOf(releaseKey.publicKey) : null } };
    },
  });

  // ---- organizations
  add({
    method: 'POST', path: '/api/v1/orgs', cls: 'A', auth: 'self', body: 'json', maxBody: 4096,
    handler: async (c) => {
      if (cfg.registrationMode === 'closed') throw forbidden('registration is closed on this instance', 'REGISTRATION_CLOSED');
      const b = c.parse(fObj({
        name: req(fStr({ min: 1, max: 120 })), owner_key: req(fObj({ pk: req(fStr({ min: 40, max: 50, re: b64uRe })), alg: req(fEnum('ed25519')) })),
        registration_token: opt(fStr({ max: 200 })),
      }));
      if (cfg.registrationMode === 'token' && !(b.registration_token !== undefined && cfg.registrationTokens.some((t) => ctEq(utf8(t), utf8(b.registration_token!))))) {
        throw forbidden('a valid registration token is required', 'REGISTRATION_CLOSED');
      }
      const pk = unb64u(b.owner_key.pk);
      if (!pk || pk.length !== 32 || !ed25519IsStrictPoint(pk)) throw new ApiError(400, 'BAD_REQUEST', 'owner_key.pk is not a strict Ed25519 key');
      const a = authenticate(env, c.method, c.target, c.header('authorization'), c.body, pk); // proof of possession
      return idem(c, a.keyId, async () => {
        if (control.keyAnyById(a.keyId)) throw conflict('key already registered');
        const org = control.tx(() => control.createOrg(b.name, a.keyId, pk));
        control.audit(a.keyId, 'org.create', org.org_id);
        return { status: 201, json: { org_id: org.org_id, name: org.name, keys: [{ key_id: a.keyId, role: 'org_owner' }] } };
      });
    },
  });
  add({
    method: 'GET', path: '/api/v1/orgs/:org', cls: 'M', auth: 'sig',
    handler: (c) => {
      const o = control.getOrg(orgOf(c))!;
      return { status: 200, json: { org_id: o.org_id, name: o.name, created_at: toIso(o.created_at / 1000) } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/orgs/:org/keys', cls: 'M', auth: 'sig',
    handler: (c) => ({ status: 200, json: { items: control.orgKeys(orgOf(c)).map((k) => ({ key_id: k.key_id, role: k.role, label: k.label })), next_cursor: null } }),
  });
  add({
    method: 'POST', path: '/api/v1/orgs/:org/keys', cls: 'M', auth: 'sig', body: 'json', maxBody: 4096,
    handler: (c) => {
      const org = orgOf(c);
      if (c.auth!.role !== 'org_owner' && c.auth!.role !== 'instance_admin') throw forbidden('owner only');
      const b = c.parse(fObj({
        pk: req(fStr({ min: 40, max: 50, re: b64uRe })), alg: req(fEnum('ed25519')), role: req(fEnum('org_owner', 'org_organizer')),
        label: opt(fStr({ max: 80 })), pop: req(fStr({ min: 80, max: 90, re: b64uRe })),
      }));
      const pk = unb64u(b.pk);
      const pop = unb64u(b.pop);
      if (!pk || pk.length !== 32 || !pop || !ed25519IsStrictPoint(pk)) throw new ApiError(400, 'BAD_REQUEST', 'bad key');
      if (!ed25519Verify(pk, pop, new Uint8Array([...utf8(`QV-KEY-v1\0${org}\0`), ...pk]))) throw new ApiError(401, 'BAD_SIGNATURE', 'proof of possession invalid');
      const kid = keyIdOf(pk);
      if (control.keyAnyById(kid)) throw conflict('key already registered');
      control.addKey(org, kid, pk, b.role, b.label ?? null);
      return { status: 201, json: { key_id: kid, role: b.role } };
    },
  });
  add({
    method: 'DELETE', path: '/api/v1/orgs/:org/keys/:keyid', cls: 'M', auth: 'sig',
    handler: (c) => {
      const org = orgOf(c);
      if (c.auth!.role !== 'org_owner' && c.auth!.role !== 'instance_admin') throw forbidden('owner only');
      const k = control.keyById(c.params['keyid']!);
      if (!k || k.org_id !== org) throw notFound('key');
      if (k.role === 'org_owner' && control.orgKeys(org).filter((x) => x.role === 'org_owner').length <= 1) throw conflict('cannot remove the last owner key');
      control.revokeKey(k.key_id);
      return { status: 204 };
    },
  });
  add({
    method: 'GET', path: '/api/v1/orgs/:org/elections', cls: 'M', auth: 'sig',
    handler: (c) => {
      const org = orgOf(c);
      const limit = Math.max(1, intQ(c, 'limit', 100, 500));
      const after = c.query.get('cursor') ?? undefined;
      const rows = control.listElections(org, c.query.get('state') ?? undefined, after, limit + 1);
      const more = rows.length > limit;
      const items = rows.slice(0, limit).map((r) => ({ election_id: r.election_id, title: r.title, state: r.state, access: r.access, created_at: toIso(r.created_at / 1000) }));
      return { status: 200, json: { items, next_cursor: more ? items.at(-1)!.election_id : null } };
    },
  });
  add({
    method: 'POST', path: '/api/v1/orgs/:org/elections', cls: 'M', auth: 'sig', body: 'json', maxBody: 4096,
    handler: (c) => {
      const org = orgOf(c);
      const b = c.parse(fObj({ title: req(fStr({ min: 1, max: 200 })), access: opt(fEnum('public', 'link')) }));
      return idem(c, c.auth!.keyId, async () => {
        const r = await pool.create(org, b.title, b.access ?? 'public');
        control.audit(c.auth!.keyId, 'election.create', r.id);
        return {
          status: 201,
          json: { election_id: r.id, origin: r.origin, log_pk: b64u(r.logPk), log_pk_hex: bytesToHex(r.logPk), state: 'DRAFT', ...(r.readKey ? { read_key: r.readKey } : {}) },
        };
      }, (r) => {
        const j = { ...(r.json as Record<string, unknown>) };
        delete j['read_key'];
        return { ...r, json: j };
      });
    },
  });

  // ---- election reads
  add({
    method: 'GET', path: '/api/v1/elections/:id', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const row = rt.edb.row();
      return {
        status: 200, etag: `"${rt.log.size}"`,
        json: {
          election_id: rt.id, origin: rt.origin, title: rt.st.manifest?.title ?? row.title, state: rt.state, access: row.access, log_pk: b64u(rt.logPk),
          server_pk: b64u(rt.srvPk), tree_size: rt.log.size, created_at: toIso(row.created_at / 1000),
          ...(rt.st.mh ? { manifest_hash: b64u(rt.st.mh) } : {}),
        },
      };
    },
  });
  add({
    method: 'PUT', path: '/api/v1/elections/:id/draft', cls: 'M', auth: 'sig', body: 'json', maxBody: 262144,
    handler: async (c) => {
      const rt = await orgElection(c);
      if (rt.st.state !== 'DRAFT') throw conflict('draft can only be edited before the manifest is published');
      const j = c.rawJson();
      if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new ApiError(400, 'BAD_REQUEST', 'draft must be an object');
      rt.edb.setDraft(JSON.stringify(j));
      return { status: 200, json: { election_id: rt.id, origin: rt.origin, log_pk: b64u(rt.logPk), state: 'DRAFT', draft: j } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/manifest', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const e = rt.edb.store.getEntry(0);
      if (!e) throw new ApiError(409, 'WRONG_PHASE', 'manifest not yet published');
      return { status: 200, cache: 'public, max-age=31536000, immutable', json: entryView(e, 'manifest', b64u(new Uint8Array(32))) };
    },
  });
  add({ method: 'GET', path: '/api/v1/elections/:id/state', cls: 'R', auth: 'none', handler: async (c) => { const rt = await readable(c); return { status: 200, etag: `"${rt.log.size}:${rt.state}"`, json: stateView(rt) }; } });
  add({
    method: 'GET', path: '/api/v1/elections/:id/ceremony', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const st = rt.st;
      const m = st.manifest;
      const trustees = (m?.trustees ?? []).map((t) => ({
        index: t.index, name: t.name, sign_pk: t.sign_pk, commit: st.commits.some((x) => x.body.i === t.index), dealing: st.dealings.some((x) => x.body.i === t.index),
        shares: st.shares.some((x) => x.body.i === t.index), complaints: st.complaints.filter((x) => x.body.accuser === t.index).length,
        keyconf: st.keyconfs.some((x) => x.body.j === t.index), qualified: st.dkgPre?.Q.includes(t.index) ?? null,
      }));
      return {
        status: 200, etag: `"${rt.log.size}"`,
        json: {
          phase: rt.state, markers: Object.fromEntries(st.markers), trustees,
          dkg: st.dkgPre
            ? { status: 'adjudicated', Q: st.dkgPre.Q, qmask: st.dkgPre.qmask, K: bytesToHex(st.dkgPre.K.toBytes()), ctx_prefix: bytesToHex(st.dkgPre.ctx).slice(0, 16), events: st.dkgPre.events }
            : { status: st.dkgError ? 'failed' : 'pending', ...(st.dkgError ? { error: st.dkgError } : {}) },
          fingerprint: st.params ? bytesToHex(st.params.ctx).slice(0, 16) : null, threshold: m ? { t: m.t, n: m.n } : null,
        },
      };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/ceremony/inbox/:j', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const j = Number(c.params['j']);
      const st = rt.st;
      return {
        status: 200,
        json: {
          trustee: j,
          dealings: st.dealings.map((d) => ({ seq: d.seq, i: d.body.i })),
          shares: st.shares.flatMap((s) => s.body.shares.filter((x) => x.j === j).map((x) => ({ seq: s.seq, from: s.body.i, share: x }))),
          complaints: st.complaints.map((x) => ({ seq: x.seq, accuser: x.body.accuser, accused: x.body.accused })),
        },
      };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/tally', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const st = rt.st;
      let aggregates: unknown[] = [];
      let n_counted: number | undefined;
      if (st.aggregateSeq !== undefined) {
        const e = rt.edb.store.getEntry(st.aggregateSeq)!;
        const rec = JSON.parse(Buffer.from(e.body!).toString()) as { body: { aggregates: unknown[]; n_counted: number } };
        aggregates = rec.body.aggregates;
        n_counted = rec.body.n_counted;
      }
      return {
        status: 200, etag: `"${rt.log.size}"`,
        json: {
          phase: rt.state, aggregate_seq: st.aggregateSeq ?? null, n_counted: n_counted ?? null, aggregates,
          threshold: st.manifest?.t ?? null, decrypters: rt.decrypterList(), shares_received: [...st.decShares.keys()].sort((a, b) => a - b),
          blocked: st.tallyBlocked ?? null, result_seq: st.tallySeq ?? null,
          min_counted: st.manifest && st.rollSet ? effectiveMinCounted(st.manifest, st.rollSet.size) : null,
        },
      };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/tally/draft', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const u = c.query.get('decrypters');
      let use: number[] | undefined;
      if (u !== null) {
        if (!/^\d{1,2}(,\d{1,2}){0,31}$/.test(u)) throw new ApiError(400, 'BAD_REQUEST', 'bad decrypters');
        use = u.split(',').map(Number);
      }
      return { status: 200, json: { body: rt.buildTallyDraft(use) } };
    },
  });
  add({
    method: 'DELETE', path: '/api/v1/elections/:id', cls: 'M', auth: 'sig', body: 'json', maxBody: 1024,
    handler: async (c) => {
      const rt = await orgElection(c);
      if (c.auth!.role !== 'org_owner' && c.auth!.role !== 'instance_admin') throw forbidden('owner only');
      const b = c.parse(fObj({ confirm: req(fStr({ min: 1, max: 200 })) }));
      if (b.confirm !== (rt.st.manifest?.title ?? rt.edb.row().title)) throw new ApiError(422, 'VALIDATION_FAILED', 'confirm must equal the election title');
      await pool.remove(rt.id);
      return { status: 202, json: { state: 'done' } };
    },
  });

  // ---- invites, registration, roll
  const unlockDek = (rt: ElectionRuntime): Uint8Array => {
    if (!rt.registry.dek_wrapped) throw conflict('this election holds no operator data (imported mirror)');
    return unsealBytes(env.kek, new Uint8Array(rt.registry.dek_wrapped ?? new Uint8Array()), `dek:${rt.id}`);
  };
  add({
    method: 'POST', path: '/api/v1/elections/:id/invites', cls: 'M', auth: 'sig', body: 'json', maxBody: 262144,
    handler: async (c) => {
      const rt = await orgElection(c);
      const b = c.parse(fObj({
        count: opt(fInt(1, 1000)),
        items: opt(fArr(fObj({ label: opt(fStr({ max: 120 })), contact: opt(fStr({ max: 254 })) }), 1000)),
        expires_at: opt(fStr({ max: 40 })), deliver: opt(fBool),
      }));
      if ((b.count === undefined) === (b.items === undefined)) throw new ApiError(400, 'BAD_REQUEST', 'exactly one of count or items is required');
      if (b.deliver) throw new ApiError(422, 'VALIDATION_FAILED', 'server-side delivery is not configured');
      if (['READY', 'OPEN'].includes(rt.state) || rt.terminal) throw new ApiError(403, 'REGISTRATION_CLOSED', 'roll is committed');
      let exp: number | null = null;
      if (b.expires_at !== undefined) {
        exp = Date.parse(b.expires_at);
        if (Number.isNaN(exp)) throw new ApiError(400, 'BAD_REQUEST', 'bad expires_at');
      }
      const dek = unlockDek(rt);
      const n = b.count ?? b.items!.length;
      if (rt.edb.voterCount() + n > cfg.maxVotersPerElection * 2) throw new ApiError(429, 'RATE_LIMITED', 'too many invites', { retryable: false });
      return idem(c, c.auth!.keyId, async () => {
        const out: { invite_id: string; code: string; label?: string }[] = [];
        const rows = [];
        for (let i = 0; i < n; i++) {
          const code = randomBytes(16).toString('base64url');
          const id = b64u(randomBytes(16)).slice(0, 26).toLowerCase().replace(/[^a-z2-7]/g, 'a').padEnd(26, 'a');
          const it = b.items?.[i];
          rows.push({
            invite_id: id, code_hash: sha256(utf8(`QV-INVITE-v1\0${code}`)), label_enc: it?.label ? seal(dek, utf8(it.label), 'label') : null,
            contact_enc: it?.contact ? seal(dek, utf8(it.contact), 'contact') : null, state: 'issued' as const, created_at: nowMs(), expires_at: exp,
          });
          out.push({ invite_id: id, code, ...(it?.label ? { label: it.label } : {}) });
        }
        rt.edb.addInvites(rows);
        return { status: 201, json: { invites: out } };
      }, (r) => ({ ...r, json: { invites: (r.json as { invites: { invite_id: string }[] }).invites.map((i) => ({ invite_id: i.invite_id, code_withheld: true })) } }));
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/invites', cls: 'M', auth: 'sig',
    handler: async (c) => {
      const rt = await orgElection(c);
      const limit = Math.max(1, intQ(c, 'limit', 100, 500));
      const rows = rt.edb.invites(c.query.get('state') ?? undefined, c.query.get('cursor') ?? undefined, limit + 1);
      const more = rows.length > limit;
      const dek = c.query.get('include_label') === 'true' ? unlockDek(rt) : undefined;
      const items = rows.slice(0, limit).map((r) => ({
        invite_id: r.invite_id, state: r.state, created_at: toIso(r.created_at / 1000), expires_at: r.expires_at ? toIso(r.expires_at / 1000) : null,
        ...(dek && r.label_enc ? { label: Buffer.from(unsealBytes(dek, new Uint8Array(r.label_enc), 'label')).toString() } : {}),
      }));
      return { status: 200, json: { items, next_cursor: more ? items.at(-1)!.invite_id : null } };
    },
  });
  add({
    method: 'DELETE', path: '/api/v1/elections/:id/invites/:invite', cls: 'M', auth: 'sig',
    handler: async (c) => {
      const rt = await orgElection(c);
      const inv = rt.edb.inviteById(c.params['invite']!);
      if (!inv) throw notFound('invite');
      if (inv.state === 'issued' || inv.state === 'sent') rt.edb.setInviteState(inv.invite_id, 'revoked');
      return { status: 204 };
    },
  });
  add({
    method: 'POST', path: '/api/v1/elections/:id/registrations', cls: 'A', auth: 'none', body: 'json', maxBody: 4096,
    handler: async (c) => {
      const rt = await rtOf(c);
      const b = c.parse(fObj({
        invite_code: req(fStr({ min: 22, max: 64, re: b64uRe })), pk: req(fStr({ min: 40, max: 50, re: b64uRe })),
        alg: req(fEnum('ed25519')), pop: req(fStr({ min: 80, max: 90, re: b64uRe })),
      }));
      if (env.failures.blocked(`reg:${c.bucket}`, cfg.rate.inviteFail)) throw new ApiError(429, 'RATE_LIMITED', 'too many failed attempts', { retryAfter: 60 });
      if (['READY', 'OPEN', 'PAUSED'].includes(rt.state) || rt.terminal || rt.st.rollSet !== undefined) throw new ApiError(403, 'REGISTRATION_CLOSED', 'registration closed at roll_commit');
      const fail = (e: ApiError): never => {
        env.failures.fail(`reg:${c.bucket}`);
        throw e;
      };
      const pk = unb64u(b.pk);
      const pop = unb64u(b.pop);
      if (!pk || pk.length !== 32 || !pop || !ed25519IsStrictPoint(pk)) return fail(new ApiError(400, 'BAD_REQUEST', 'pk is not a strict Ed25519 key'));
      if (!ed25519Verify(pk, pop, new Uint8Array([...utf8(`QV-REG-v1\0${rt.id}\0`), ...pk]))) return fail(new ApiError(401, 'BAD_SIGNATURE', 'proof of possession invalid'));
      const inv = rt.edb.inviteByHash(sha256(utf8(`QV-INVITE-v1\0${b.invite_code}`)));
      if (!inv || inv.state === 'revoked') return fail(new ApiError(422, 'INVITE_EXPIRED', 'invite code is not valid'));
      if (inv.expires_at !== null && inv.expires_at < nowMs()) return fail(new ApiError(422, 'INVITE_EXPIRED', 'invite code has expired'));
      const kid = b64u(authorKeyId('ed25519', pk));
      const existing = rt.edb.voter(kid);
      if (inv.state === 'registered') {
        if (existing) return { status: 201, json: { voter_kid: kid, status: existing.status === 'committed' ? 'approved' : existing.status } };
        return fail(conflict('invite code already used', 'INVITE_USED'));
      }
      if (existing) throw conflict('this key is already registered');
      if (rt.edb.voterCount() >= cfg.maxVotersPerElection) throw new ApiError(429, 'RATE_LIMITED', 'roll is full', { retryable: false });
      rt.edb.tx(() => {
        if (!rt.edb.consumeInvite(inv.invite_id, Math.floor(nowMs() / 3_600_000) * 3_600_000)) throw conflict('invite code already used', 'INVITE_USED');
        rt.edb.addVoter({ voter_kid: kid, pk, alg: 'ed25519', status: 'approved', registered_at: Math.floor(nowMs() / 3_600_000) * 3_600_000 });
      });
      return { status: 201, json: { voter_kid: kid, status: 'approved' } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/roll', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const limit = Math.max(1, intQ(c, 'limit', 100, 500));
      const after = c.query.get('cursor') ? rt.edb.voterRowid(c.query.get('cursor')!) : 0;
      const rows = rt.edb.voters(after, limit + 1);
      const more = rows.length > limit;
      const items = rows.slice(0, limit).map((v) => ({ voter_kid: v.voter_kid, pk: b64u(v.pk), alg: v.alg, status: v.status, roll_index: v.roll_index, weight: v.weight }));
      return { status: 200, json: { items, next_cursor: more ? items.at(-1)!.voter_kid : null, roll_size: rt.edb.voterCount(), ...(rt.st.rollRootHex ? { roll_root: rt.st.rollRootHex } : {}) } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/voters/:kid', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const v = rt.edb.voter(c.params['kid']!);
      const bi = v ? rt.edb.ballotIndex(v.voter_kid) : undefined;
      return { status: 200, json: { registered: !!v, status: v?.status ?? null, ballot_count: bi?.ballot_count ?? 0, first_seq: bi?.first_seq ?? null, latest_seq: bi?.latest_seq ?? null } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/voters/:kid/ballots', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const limit = Math.max(1, intQ(c, 'limit', 100, 500));
      const rows = rt.edb.ballotsOf(c.params['kid']!, intQ(c, 'cursor', -1, 1e9), limit + 1);
      const more = rows.length > limit;
      const items = rows.slice(0, limit).map((r) => ({ seq: r.seq, leaf_hash: b64u(new Uint8Array(r.leaf_hash)), kind: r.kind }));
      return { status: 200, json: { items, next_cursor: more ? String(items.at(-1)!.seq) : null } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/trustees', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const st = rt.st;
      const items = (st.manifest?.trustees ?? []).map((t) => ({
        trustee_id: String(t.index), label: t.name, pk_sign: t.sign_pk,
        status: st.keyconfs.some((k) => k.body.j === t.index) ? 'confirmed' : st.dealings.some((d) => d.body.i === t.index) ? 'r1' : 'invited',
      }));
      return { status: 200, json: { items, next_cursor: null } };
    },
  });

  // ---- the log
  add({
    method: 'POST', path: '/api/v1/elections/:id/log/entries', cls: 'W', auth: 'none', body: 'json', maxBody: MAX_ENTRY_REQ,
    handler: async (c) => {
      const rt = await rtOf(c); // bearer / signature headers are ignored here: entries authenticate themselves
      const b = c.parse(fObj({ header: req(fStr({ min: 1, max: 2800, re: b64uRe })), body: req(fStr({ max: 1_400_000, re: b64uRe })) }));
      const header = unb64u(b.header);
      const body = unb64u(b.body);
      if (!header || !body) throw new ApiError(400, 'MALFORMED_ENTRY', 'header/body are not base64url');
      rt.inUse++;
      try {
        const o = await rt.append(header, body);
        return { status: o.duplicate ? 200 : 201, headers: { Location: `/api/v1/elections/${rt.id}/log/entries/${o.seq}` }, json: { status: o.status, receipt: receiptView(o.receipt) } };
      } finally {
        rt.inUse--;
      }
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/entries', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const from = intQ(c, 'from', 0, 2 ** 40);
      const limit = Math.max(1, intQ(c, 'limit', 100, 1000));
      const type = c.query.get('type') ?? undefined;
      if (type !== undefined && !(ENTRY_TYPES as readonly string[]).includes(type)) throw new ApiError(400, 'BAD_REQUEST', 'unknown type');
      const author = c.query.get('author') ?? undefined;
      if (author !== undefined && !/^[A-Za-z0-9_-]{16,64}$/.test(author)) throw new ApiError(400, 'BAD_REQUEST', 'bad author');
      const page = rt.edb.entries(from, limit, type, author);
      const tree = rt.log.size;
      const last = page.rows.at(-1);
      const complete = from + limit <= tree && type === undefined && author === undefined;
      return {
        status: 200, cache: complete && from + limit <= tree ? 'public, max-age=3600' : 'no-cache',
        json: {
          entries: page.rows.map((r) => entryView(r, r.type, r.author)), from,
          next_from: page.more && last ? last.seq + 1 : type === undefined && author === undefined && last && last.seq + 1 < tree ? last.seq + 1 : null, tree_size: tree,
        },
      };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/entries/:seq', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const r = rt.edb.entries(Number(c.params['seq']), 1).rows[0];
      if (!r || r.seq !== Number(c.params['seq'])) throw notFound('entry');
      return { status: 200, cache: 'public, max-age=31536000, immutable', json: entryView(r, r.type, r.author) };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/entries/by-leaf/:leaf', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const leaf = unb64u(c.params['leaf']!);
      const seq = leaf ? rt.edb.seqByLeaf(leaf) : undefined;
      if (seq === undefined) throw notFound('entry');
      const r = rt.edb.entries(seq, 1).rows[0]!;
      return { status: 200, json: entryView(r, r.type, r.author) };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/checkpoint', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const cp = rt.edb.store.latestCheckpoint();
      if (!cp) throw new ApiError(503, 'LOG_UNAVAILABLE', 'no checkpoint yet');
      const etag = `"${cp.size}:${toHex(cp.root).slice(0, 16)}:${(cp.note.match(/\n/g) ?? []).length}"`;
      if ((c.header('accept') ?? '').includes('application/json')) return { status: 200, etag, json: checkpointView(cp.note, cp.size, cp.root, rt) };
      return { status: 200, etag, text: cp.note };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/checkpoints', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const after = intQ(c, 'after_size', -1, 2 ** 40);
      const limit = Math.max(1, intQ(c, 'limit', 100, 500));
      const all = rt.edb.store.listCheckpoints().filter((x) => x.size > after);
      const items = all.slice(0, limit).map((x) => checkpointView(x.note, x.size, x.root, rt));
      return { status: 200, json: { items, next_cursor: all.length > limit ? String(all[limit - 1]!.size) : null } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/proof/inclusion', cls: 'P', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const explicit = c.query.get('tree_size') !== null;
      const size = intQ(c, 'tree_size', rt.log.size, 2 ** 40);
      let seq: number;
      if (c.query.get('seq') !== null) seq = intQ(c, 'seq', 0, 2 ** 40);
      else {
        const leaf = unb64u(need(c.query.get('leaf_hash'), 'seq or leaf_hash'));
        const s = leaf ? rt.edb.seqByLeaf(leaf) : undefined;
        if (s === undefined) throw notFound('entry');
        seq = s;
      }
      if (seq >= size || size > rt.log.size) throw new ApiError(400, 'BAD_REQUEST', 'seq must be < tree_size <= current size');
      const p = rt.log.inclusionProof(seq, size);
      if (!p.ok) throw notFound('proof');
      const e = rt.edb.store.getEntry(seq)!;
      const cp = rt.edb.store.getCheckpoint(size);
      return {
        status: 200, cache: explicit ? 'public, max-age=31536000, immutable' : 'no-cache',
        json: { seq, leaf_hash: b64u(e.leafHash), tree_size: size, path: p.value.map(b64), ...(cp ? { checkpoint_note: cp.note } : {}) },
      };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/proof/consistency', cls: 'P', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const old = intQ(c, 'old', 0, 2 ** 40);
      const explicit = c.query.get('new') !== null;
      const nw = intQ(c, 'new', rt.log.size, 2 ** 40);
      if (old > nw || nw > rt.log.size) throw new ApiError(400, 'BAD_REQUEST', 'need old <= new <= current size');
      const p = rt.log.consistencyProof(old, nw);
      if (!p.ok) throw notFound('proof');
      return { status: 200, cache: explicit ? 'public, max-age=31536000, immutable' : 'no-cache', json: { old_size: old, new_size: nw, path: p.value.map(b64) } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/witnesses', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      const w = rt.witnessInfo();
      return { status: 200, json: { policy: { quorum: w.required, witnesses: cfg.witnesses.map((x) => x.name) }, latest_size: w.size, cosigners: w.cosigners, quorum_met: w.required === 0 || w.witnessed } };
    },
  });
  add({
    method: 'POST', path: '/api/v1/elections/:id/log/cosignatures', cls: 'G', auth: 'none', body: 'json', maxBody: 16384,
    handler: async (c) => {
      const rt = await rtOf(c);
      if (rt.imported) throw conflict('imported elections are read-only mirrors; they take no cosignatures');
      const b = c.parse(fObj({ checkpoint_size: req(fInt(1, 2 ** 40)), lines: req(fArr(fStr({ min: 10, max: 400 }), 16)) }));
      if (!rt.edb.store.getCheckpoint(b.checkpoint_size)) throw notFound('checkpoint');
      const before = rt.witnessInfo();
      const r = await rt.attachCosignatures(b.checkpoint_size, b.lines);
      exportGen.set(rt.id, (exportGen.get(rt.id) ?? 0) + 1);
      exportCache.delete(rt.id);
      const after = rt.witnessInfo();
      return { status: 200, json: { accepted: after.cosigners.filter((x) => !before.cosigners.includes(x)), rejected: [], witnessed: r.witnessed } };
    },
  });

  // ---- event stream (QV-09 §9)
  add({
    method: 'GET', path: '/api/v1/elections/:id/events', cls: 'R', auth: 'none',
    handler: async (c) => sse.open(c, await readable(c)),
  });

  // ---- webhooks (QV-09 §6.3; owner only, public events only)
  const ownerOnly = (c: Ctx): void => {
    if (c.auth!.role !== 'org_owner' && c.auth!.role !== 'instance_admin') throw forbidden('owner only');
  };
  add({
    method: 'POST', path: '/api/v1/orgs/:org/webhooks', cls: 'M', auth: 'sig', body: 'json', maxBody: 4096,
    handler: (c) => {
      const org = orgOf(c);
      ownerOnly(c);
      const b = c.parse(fObj({
        url: req(fStr({ min: 1, max: 2048 })), events: req(fArr(fEnum(...WEBHOOK_EVENTS), WEBHOOK_EVENTS.length)),
        election_id: opt(fStr({ min: 32, max: 32, re: /^[0-9a-f]{32}$/ })),
      }));
      if (b.events.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'events must not be empty');
      return idem(c, c.auth!.keyId, async () => {
        if (b.election_id !== undefined) {
          const rt = await pool.get(b.election_id);
          if (!rt || rt.orgId !== org) throw notFound('election');
        }
        if (control.countWebhooks(org) >= cfg.maxWebhooksPerOrg) throw new ApiError(429, 'RATE_LIMITED', 'webhook quota reached for this organization', { retryable: false });
        let made;
        try {
          made = await webhooks.create(org, b.url, b.events, b.election_id);
        } catch (e) {
          if (e instanceof TargetRejected) throw new ApiError(422, 'VALIDATION_FAILED', e.message, { reason: e.code });
          throw e;
        }
        control.audit(c.auth!.keyId, 'webhook.create', made.row.webhook_id);
        return { status: 201, json: { ...webhooks.view(made.row), secret: made.secret } };
      }, (r) => {
        const j = { ...(r.json as Record<string, unknown>) };
        delete j['secret']; // shown once, never replayed from the idempotency cache
        delete j['url']; // may embed a token; kept out of the plaintext idempotency table (list shows it, decrypted)
        return { ...r, json: j };
      });
    },
  });
  add({
    method: 'GET', path: '/api/v1/orgs/:org/webhooks', cls: 'M', auth: 'sig',
    handler: (c) => {
      const org = orgOf(c);
      ownerOnly(c);
      return { status: 200, json: { items: control.webhooksOf(org).map((r) => webhooks.view(r)), next_cursor: null } };
    },
  });
  add({
    method: 'DELETE', path: '/api/v1/orgs/:org/webhooks/:wh', cls: 'M', auth: 'sig',
    handler: (c) => {
      const org = orgOf(c);
      ownerOnly(c);
      const w = control.webhook(c.params['wh']!);
      if (!w || w.org_id !== org) throw notFound('webhook');
      control.deleteWebhook(w.webhook_id);
      control.audit(c.auth!.keyId, 'webhook.delete', w.webhook_id);
      return { status: 204 };
    },
  });

  // ---- export (QV-09 §10; single-range `Range` support, QV-09 §13 "Mass export abuse")
  // Built bundles are cached per election for 10 minutes (bounded in total bytes) so resumed/ranged downloads do not rebuild them;
  // a cosignature attach bumps the generation, which changes the ETag and drops the cached bytes.
  const exportGen = new Map<string, number>();
  const exportCache = new Map<string, { etag: string; bytes: Uint8Array; at: number }>();
  const EXPORT_CACHE_MAX = 128 * 1024 * 1024;
  const exportEtag = (rt: ElectionRuntime): string => `"${rt.log.size}:${toHex(rt.log.root()).slice(0, 16)}:${exportGen.get(rt.id) ?? 0}"`;
  const cachedQvb = (rt: ElectionRuntime): { bytes: Uint8Array; etag: string } => {
    const etag = exportEtag(rt);
    const hit = exportCache.get(rt.id);
    if (hit && hit.etag === etag && nowMs() - hit.at < 600_000) {
      exportCache.delete(rt.id);
      exportCache.set(rt.id, hit); // LRU order
      return { bytes: hit.bytes, etag };
    }
    exportCache.delete(rt.id);
    const bytes = qvb(rt);
    if (bytes.length <= EXPORT_CACHE_MAX) {
      exportCache.set(rt.id, { etag, bytes, at: nowMs() });
      let total = 0;
      for (const v of exportCache.values()) total += v.bytes.length;
      for (const [k, v] of exportCache) {
        if (total <= EXPORT_CACHE_MAX) break;
        exportCache.delete(k);
        total -= v.bytes.length;
      }
    }
    return { bytes, etag };
  };
  add({
    method: 'GET', path: '/api/v1/elections/:id/export.qvb', cls: 'X', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      if (!rt.st.manifest) throw new ApiError(409, 'WRONG_PHASE', 'nothing to export before the manifest');
      const b = cachedQvb(rt);
      return { status: 200, bytes: b.bytes, ranges: true, contentType: 'application/x-tar', cache: 'public, max-age=600', etag: b.etag };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/export.json', cls: 'X', auth: 'none',
    handler: async (c) => {
      const rt = await readable(c);
      if (!rt.st.manifest) throw new ApiError(409, 'WRONG_PHASE', 'nothing to export before the manifest');
      return { status: 200, bytes: Buffer.from(JSON.stringify(electionBundle(rt))), ranges: true, contentType: 'application/json; charset=utf-8', cache: 'public, max-age=600', etag: exportEtag(rt) };
    },
  });
  void audienceOf;

  registerExtRoutes({ env, pool, jobs, add, idem, readable, intQ });

  const http = createHttpApp(env, R, statics);
  return {
    http, env, pool, sse, webhooks, jobs, gossip,
    async start() {
      const a = await http.listen();
      return { ...a, url: `http://${a.host}:${a.port}` };
    },
    async stop() {
      sse.closeAll();
      webhooks.stop();
      gossip.stop();
      await jobs.stop();
      await http.close();
      await pool.closeAll();
      control.close();
    },
  };
}
