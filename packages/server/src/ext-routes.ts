// Routes added after the first server cut: gossip (QV-09 §8, QV-18 §9.5), imports + jobs (QV-09 §10, QV-18 §12), /admin/*
// (QV-09 §10), evidence listing. Registered from app.ts.
import { randomBytes } from 'node:crypto';
import { parseCheckpoint } from '@quietvote/board';
import { bytesToHex, sha256, utf8 } from '@quietvote/crypto';
import { adminStatus, authorizeAdmin, backupWork, clearQuarantine, DELETABLE_STATES, selfAuditWork } from './admin.ts';
import type { ElectionRuntime } from './election.ts';
import type { Env } from './env.ts';
import { checkNoteText, gossipAnswer, judge, MAX_NOTE_CHARS, ownSignedNote } from './gossip.ts';
import type { Ctx, Reply, Route } from './http.ts';
import { commitImport, verifyBundle } from './imports.ts';
import { JobError, jobView, type JobRunner } from './jobs.ts';
import type { ElectionPool } from './pool.ts';
import { ApiError, conflict, notFound } from './problem.ts';
import { ELECTION_ID_RE, ORG_ID_RE, fArr, fEnum, fObj, fStr, opt, req, toIso, unbase32 } from './util.ts';

export interface ExtDeps {
  env: Env;
  pool: ElectionPool;
  jobs: JobRunner;
  add(r: Route): void;
  idem(c: Ctx, principal: string, fn: () => Promise<Reply>, redact?: (r: Reply) => Reply): Promise<Reply>;
  readable(c: Ctx): Promise<ElectionRuntime>;
  intQ(c: Ctx, n: string, def: number, max: number): number;
}

const allowQuery = (c: Ctx, names: string[]): void => {
  for (const k of c.query.keys()) if (!names.includes(k)) throw new ApiError(400, 'BAD_REQUEST', `unknown query parameter ${k.slice(0, 40)}`);
};

export function registerExtRoutes(d: ExtDeps): void {
  const { env, pool, jobs, add } = d;
  const cfg = env.cfg;
  const control = env.control;

  // ------------------------------------------------------------------------------------------------ gossip
  add({
    method: 'POST', path: '/api/v1/gossip/checkpoints', cls: 'G', auth: 'none', body: 'json', maxBody: 16384,
    handler: async (c) => {
      const b = c.parse(fObj({ note: req(fStr({ min: 20, max: MAX_NOTE_CHARS })) }));
      checkNoteText(b.note);
      const p = parseCheckpoint(b.note);
      if (!p.ok) throw new ApiError(400, 'BAD_REQUEST', 'note is not a well-formed signed checkpoint');
      const m = /^quietvote\/v1\/([a-z2-7]{26})$/.exec(p.value.origin);
      const raw = m ? unbase32(m[1]!, 16) : undefined;
      const id = raw ? bytesToHex(raw) : undefined;
      if (id === undefined || !ELECTION_ID_RE.test(id)) throw notFound('origin');
      c.params['id'] = id;
      const rt = await d.readable(c); // 404 for unknown origins; link elections need their read key, like every other read
      const cp = ownSignedNote(rt, b.note);
      if (cp === undefined) throw new ApiError(422, 'VALIDATION_FAILED', 'note is not signed by the log key of this origin', { reason: 'BAD_SIGNATURE' });
      const j = judge(env, rt, cp, b.note, 'inbound');
      if (j.assessment.evidence !== undefined) {
        throw new ApiError(409, 'EQUIVOCATION', `the posted note contradicts this log (${j.assessment.evidence.kind})`, {
          retryable: false,
          body: { evidence: j.assessment.evidence, relation: j.assessment.relation, ...(j.incident ? { incident: j.incident } : {}), integrity: rt.quarantineReason() ? 'quarantined' : 'compromised' },
        });
      }
      return { status: 200, json: gossipAnswer(rt, j.assessment, cp.size) };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/log/evidence', cls: 'R', auth: 'none',
    handler: async (c) => {
      const rt = await d.readable(c);
      const rows = rt.edb.evidence(64);
      return {
        status: 200,
        json: {
          items: rows.map((r) => ({ evidence_id: r.evidence_id, kind: r.kind, tree_size: r.tree_size, source: r.source, recorded_at: toIso(r.recorded_at / 1000), evidence: JSON.parse(r.evidence) as unknown })),
          integrity: rt.edb.hasPermanentEvidence() ? 'compromised' : rt.quarantineReason() ? 'quarantined' : 'ok',
        },
      };
    },
  });

  // ------------------------------------------------------------------------------------------------ jobs
  add({
    method: 'GET', path: '/api/v1/jobs/:job', cls: 'M', auth: 'sig',
    handler: (c) => {
      const j = control.job(c.params['job']!);
      // visible to its creator and to instance admins; everyone else gets the same 404 as for an unknown id
      if (!j || (j.created_by !== c.auth!.keyId && c.auth!.role !== 'instance_admin')) throw notFound('job');
      return { status: 200, json: jobView(j) };
    },
  });

  // ------------------------------------------------------------------------------------------------ imports
  add({
    method: 'POST', path: '/api/v1/imports', cls: 'X', auth: 'sig', body: 'tar', maxBody: cfg.maxImportBytes,
    handler: (c) => {
      allowQuery(c, ['org_id', 'access', 'manifest_hash']);
      const a = c.auth!;
      const orgId = c.query.get('org_id') ?? a.orgId ?? undefined;
      if (orgId === undefined || !ORG_ID_RE.test(orgId)) throw new ApiError(400, 'BAD_REQUEST', 'org_id is required');
      if (a.role !== 'instance_admin' && a.orgId !== orgId) throw notFound('organization'); // cross-org probes look like 404
      if (!control.getOrg(orgId)) throw notFound('organization');
      const access = c.query.get('access') ?? 'public';
      if (access !== 'public' && access !== 'link') throw new ApiError(400, 'BAD_REQUEST', 'access must be public or link');
      const mh = c.query.get('manifest_hash') ?? undefined;
      if (mh !== undefined && !/^[0-9a-f]{64}$/.test(mh)) throw new ApiError(400, 'BAD_REQUEST', 'manifest_hash must be 64 lower-case hex characters');
      if (control.countElections(orgId) >= cfg.maxElectionsPerOrg) throw new ApiError(429, 'RATE_LIMITED', 'election quota reached for this organization', { retryable: false });
      const body = c.body;
      if (body.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'request body required');
      return d.idem(c, a.keyId, async () => {
        const readKey = access === 'link' ? randomBytes(16).toString('base64url') : undefined;
        const readKeyHash = readKey === undefined ? null : sha256(utf8(`QV-READKEY-v1\0${readKey}`));
        const job = jobs.submit('import', cfg.importQueueMax, { kind: 'import', election_id: null, params: { org_id: orgId, access, bytes: body.length }, created_by: a.keyId }, async (ctl) => {
          const vb = await verifyBundle(env, body, mh, () => ctl.tick(), (p) => ctl.progress(p));
          const r = await commitImport(env, pool, vb, orgId, access, readKeyHash, () => ctl.tick());
          return { result: r, result_ref: r.election_id };
        });
        control.audit(a.keyId, 'import.submit', job.job_id, { bytes: body.length });
        return { status: 202, headers: { Location: `/api/v1/jobs/${job.job_id}` }, json: { ...jobView(job), ...(readKey ? { read_key: readKey } : {}) } };
      }, (r) => {
        const j = { ...(r.json as Record<string, unknown>) };
        delete j['read_key']; // shown once
        return { ...r, json: j };
      });
    },
  });

  // ------------------------------------------------------------------------------------------------ admin
  add({
    method: 'GET', path: '/api/v1/admin/status', cls: 'M', auth: 'sig',
    handler: (c) => {
      authorizeAdmin(c);
      return { status: 200, json: adminStatus(env, pool) };
    },
  });
  add({
    method: 'GET', path: '/api/v1/admin/elections', cls: 'M', auth: 'sig',
    handler: (c) => {
      authorizeAdmin(c);
      allowQuery(c, ['state', 'cursor', 'limit']);
      const limit = Math.max(1, d.intQ(c, 'limit', 100, 500));
      const state = c.query.get('state') ?? undefined;
      if (state !== undefined && !/^[A-Z_]{3,16}$/.test(state)) throw new ApiError(400, 'BAD_REQUEST', 'bad state');
      const cursor = c.query.get('cursor') ?? undefined;
      if (cursor !== undefined && !ELECTION_ID_RE.test(cursor)) throw new ApiError(400, 'INVALID_CURSOR', 'bad cursor');
      const rows = control.listAllElections(state, cursor, limit + 1);
      const items = rows.slice(0, limit).map((r) => ({
        election_id: r.election_id, org_id: r.org_id, state: r.state, access: r.access, title: r.title, created_at: toIso(r.created_at / 1000),
        imported: r.imported === 1, quarantined: r.quarantine != null, bytes_used: r.bytes_used,
      }));
      return { status: 200, json: { items, next_cursor: rows.length > limit ? items.at(-1)!.election_id : null } };
    },
  });
  add({
    method: 'POST', path: '/api/v1/admin/backups', cls: 'M', auth: 'sig', body: 'json', maxBody: 1024,
    handler: (c) => {
      const a = authorizeAdmin(c);
      const b = c.parse(fObj({ scope: req(fEnum('all', 'election')), election_id: opt(fStr({ min: 32, max: 32, re: /^[0-9a-f]{32}$/ })) }));
      if ((b.scope === 'election') !== (b.election_id !== undefined)) throw new ApiError(400, 'BAD_REQUEST', 'election_id is required for scope election and not allowed for scope all');
      if (b.election_id !== undefined && !control.election(b.election_id)) throw notFound('election');
      return d.idem(c, a.keyId, async () => {
        const job = jobs.submit('admin', 4, { kind: 'backup', election_id: b.election_id ?? null, params: { scope: b.scope }, created_by: a.keyId },
          (ctl) => backupWork(env, pool, ctl.jobId, b.scope, b.election_id, ctl));
        return { status: 202, headers: { Location: `/api/v1/jobs/${job.job_id}` }, json: jobView(job) };
      });
    },
  });
  add({
    method: 'POST', path: '/api/v1/admin/elections/:id/self-audit', cls: 'M', auth: 'sig',
    handler: (c) => {
      const a = authorizeAdmin(c);
      const id = c.params['id']!;
      return d.idem(c, a.keyId, async () => {
        if (!control.election(id)) throw notFound('election');
        const job = jobs.submit('admin', 4, { kind: 'self_audit', election_id: id, params: {}, created_by: a.keyId }, async (ctl) => {
          const rt = await pool.get(id);
          if (!rt) throw new JobError('NOT_FOUND', 'no such election');
          return selfAuditWork(env, rt, ctl);
        });
        return { status: 202, headers: { Location: `/api/v1/jobs/${job.job_id}` }, json: jobView(job) };
      });
    },
  });
  add({
    method: 'POST', path: '/api/v1/admin/elections/:id/quarantine/clear', cls: 'M', auth: 'sig', body: 'json', maxBody: 2048,
    handler: (c) => {
      const a = authorizeAdmin(c);
      const id = c.params['id']!;
      const b = c.parse(fObj({ ack: req(fStr({ min: 4, max: 64, re: /^[A-Za-z0-9_-]+$/ })), verified_against: req(fArr(fStr({ min: 9, max: 80 }), 16)) }));
      return d.idem(c, a.keyId, async () => {
        if (!control.election(id)) throw notFound('election');
        return { status: 200, json: await clearQuarantine(env, pool, id, b.ack, b.verified_against, a.keyId) };
      });
    },
  });
  add({
    method: 'DELETE', path: '/api/v1/admin/elections/:id', cls: 'M', auth: 'sig', body: 'json', maxBody: 1024,
    handler: (c) => {
      const a = authorizeAdmin(c);
      const id = c.params['id']!;
      const b = c.parse(fObj({ confirm: req(fStr({ min: 1, max: 200 })) }));
      return d.idem(c, a.keyId, async () => {
        const reg = control.election(id);
        if (!reg) throw notFound('election');
        if (b.confirm !== reg.title) throw new ApiError(422, 'VALIDATION_FAILED', 'confirm must equal the election title');
        if (!DELETABLE_STATES.includes(reg.state)) throw conflict(`election in state ${reg.state} cannot be deleted; unmet condition: state must be DRAFT, ARCHIVED, CANCELLED, ABORTED or IMPORTED`);
        const job = jobs.submit('admin', 4, { kind: 'delete', election_id: id, params: {}, created_by: a.keyId }, async () => {
          try {
            await pool.remove(id);
          } catch (e) {
            if (e instanceof ApiError) throw new JobError(e.code, e.message);
            throw e;
          }
          control.audit(a.keyId, 'election.delete', id);
          return { result: { election_id: id, state: 'DELETED' } };
        });
        return { status: 202, headers: { Location: `/api/v1/jobs/${job.job_id}` }, json: jobView(job) };
      });
    },
  });
}
