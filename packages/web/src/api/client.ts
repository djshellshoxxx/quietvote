// HTTP client for QV-09. Injected `fetch` and `sleep` make it testable without a network (QV-09-REQ-020 reference client).
// No cookies, no ambient credentials: organizer management calls carry a QV-08 signed request (signing.ts); log appends are
// self-authenticating and never carry a credential (QV-09-REQ-005).
import { utf8 } from '@quietvote/crypto';
import { ApiError, BAD_RESPONSE, NETWORK, TIMEOUT, isRetryable } from './errors.ts';
import { qvSigHeader, type RequestSigning } from './signing.ts';
import type {
  AppendResult, ConsistencyProofView, ElectionState, ElectionSummary, EntryPage, EntryView, InclusionProofView,
  Instance, InviteResult, RegistrationBody, RegistrationResult, RollPage, SpoilShareIndex, SpoilShareList, SpoilSharePosted, VoterStatus,
} from './types.ts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Organizer key for QV-08 signed management requests (createElection, putDraft, createInvites). */
  signing?: RequestSigning | undefined;
  /** Base of the API origin, e.g. "" (same origin) or "https://board.example". */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Read key for `access=link` elections (QV-Read-Key header). */
  readKey?: string | undefined;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called with the number of ms to wait before a retry; for UI progress text. */
  onRetry?: (attempt: number, waitMs: number, e: ApiError) => void;
}

const API = '/api/v1';

export class ApiClient {
  private readonly base: string;
  private readonly f: FetchLike;
  private readonly readKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRetry: ClientOptions['onRetry'];
  private readonly signing: RequestSigning | undefined;

  constructor(o: ClientOptions = {}) {
    this.base = (o.baseUrl ?? '').replace(/\/+$/, '');
    this.f = o.fetch ?? ((i, init) => globalThis.fetch(i, init));
    this.readKey = o.readKey;
    this.timeoutMs = o.timeoutMs ?? 20_000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onRetry = o.onRetry;
    this.signing = o.signing;
  }

  private async req(method: string, path: string, opts: { body?: unknown; signed?: boolean; headers?: Record<string, string>; accept?: string; signal?: AbortSignal; query?: Record<string, string | number | undefined> } = {}): Promise<Response> {
    let target = path;
    if (opts.query) {
      const q = Object.entries(opts.query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      if (q.length > 0) target += `?${q.join('&')}`;
    }
    const url = `${this.base}${target}`;
    const headers: Record<string, string> = { Accept: opts.accept ?? 'application/json', ...opts.headers };
    if (this.readKey !== undefined) headers['QV-Read-Key'] = this.readKey;
    const init: RequestInit = { method, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
    let bodyBytes: Uint8Array = new Uint8Array(0);
    if (opts.body !== undefined) {
      const text = JSON.stringify(opts.body);
      bodyBytes = utf8(text);
      headers['Content-Type'] = 'application/json; charset=utf-8';
      init.body = text;
    }
    if (opts.signed === true) {
      if (this.signing === undefined) throw new ApiError({ status: 0, code: 'UNAUTHENTICATED', message: 'no organizer signing key configured' });
      headers.Authorization = await qvSigHeader(this.signing, method, target, bodyBytes);
    }
    const ctl = new AbortController();
    init.signal = ctl.signal;
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    const outer = opts.signal;
    const relay = (): void => ctl.abort();
    if (outer !== undefined) {
      if (outer.aborted) ctl.abort();
      else outer.addEventListener('abort', relay, { once: true });
    }
    let res: Response;
    try {
      res = await this.f(url, init);
    } catch (e) {
      outer?.removeEventListener('abort', relay);
      throw new ApiError({ status: 0, code: ctl.signal.aborted ? TIMEOUT : NETWORK, message: e instanceof Error ? e.message : 'network error', retryable: true });
    } finally {
      clearTimeout(timer); // the timeout covers connecting and headers only; a stream body may live for hours
    }
    if (!res.ok) {
      outer?.removeEventListener('abort', relay);
      throw await problem(res);
    }
    return res;
  }

  private async json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError({ status: res.status, code: BAD_RESPONSE, message: 'response was not JSON' });
    }
  }

  // ---- instance and election reads
  async instance(): Promise<Instance> {
    return this.json(await this.req('GET', `${API}/instance`));
  }
  async election(id: string): Promise<ElectionSummary> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}`));
  }
  async state(id: string): Promise<ElectionState> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/state`));
  }
  async entries(id: string, q: { from?: number; limit?: number; type?: string } = {}): Promise<EntryPage> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/log/entries`, { query: { from: q.from ?? 0, limit: q.limit ?? 1000, type: q.type } }));
  }
  /** All entries from `from`, following `next_from`. Bounded by `maxPages` to stop a hostile server from looping forever. */
  async allEntries(id: string, from = 0, maxPages = 200): Promise<{ entries: EntryView[]; treeSize: number }> {
    const out: EntryView[] = [];
    let next: number | null = from;
    let treeSize = 0;
    for (let i = 0; next !== null && i < maxPages; i++) {
      const page: EntryPage = await this.entries(id, { from: next });
      out.push(...page.entries);
      treeSize = page.tree_size;
      if (page.next_from !== null && page.next_from <= next) throw new ApiError({ status: 200, code: BAD_RESPONSE, message: 'pagination did not advance' });
      next = page.next_from;
    }
    return { entries: out, treeSize };
  }
  async entry(id: string, seq: number): Promise<EntryView> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/log/entries/${seq}`));
  }
  async checkpointNote(id: string): Promise<string> {
    return (await this.req('GET', `${API}/elections/${enc(id)}/log/checkpoint`, { accept: 'text/plain' })).text();
  }
  async inclusion(id: string, q: { seq?: number; leafHash?: string; treeSize?: number }): Promise<InclusionProofView> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/log/proof/inclusion`, { query: { seq: q.seq, leaf_hash: q.leafHash, tree_size: q.treeSize } }));
  }
  async consistency(id: string, oldSize: number, newSize?: number): Promise<ConsistencyProofView> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/log/proof/consistency`, { query: { old: oldSize, new: newSize } }));
  }
  async roll(id: string, cursor?: string): Promise<RollPage> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/roll`, { query: { cursor, limit: 500 } }));
  }
  async voter(id: string, kid: string): Promise<VoterStatus> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/voters/${enc(kid)}`));
  }
  /** Public bundle (JSON form) for the verifier; `application/x-tar` is the server format, JSON is the web alias. */
  async exportJson(id: string): Promise<unknown> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/export.json`));
  }

  /**
   * Opens the live event stream (QV-09 §9). The resume cursor goes in the Last-Event-ID header and the read key in QV-Read-Key,
   * so the URL carries nothing but the election id. The caller owns the body and aborts it through `signal`.
   */
  events(id: string, o: { lastEventId?: number | undefined; signal?: AbortSignal | undefined } = {}): Promise<Response> {
    return this.req('GET', `${API}/elections/${enc(id)}/events`, {
      accept: 'text/event-stream',
      ...(o.lastEventId === undefined ? {} : { headers: { 'Last-Event-ID': String(o.lastEventId) } }),
      ...(o.signal === undefined ? {} : { signal: o.signal }),
    });
  }

  // ---- trustees-mode spoil shares (QV-ADR-020). Not log records: they have their own endpoints and need no credential.
  /** Without `code`: the index of codes and posting trustees. With `code` (64 lower-case hex): the stored signed records for that code. */
  async getSpoilShares(id: string): Promise<SpoilShareIndex>;
  async getSpoilShares(id: string, code: string): Promise<SpoilShareList>;
  async getSpoilShares(id: string, code?: string): Promise<SpoilShareIndex | SpoilShareList> {
    return this.json(await this.req('GET', `${API}/elections/${enc(id)}/spoil-shares`, { query: { code } }));
  }
  /**
   * Posts one trustee-signed `spoil-share` record exactly as `qv-trustee spoil-release` produced it: the body IS the record
   * ({body, sig}), not wrapped. 201 accepted, 200 duplicate; 409 WRONG_PHASE (not closed / tally posted), 409 STATE_CONFLICT (that
   * trustee already posted different shares for the code), 422 ENTRY_INVALID with reason E_SCHEMA|E_CTX|E_SIG|E_SPOIL_MISMATCH|
   * E_DEC_PROOF|E_TRUSTEE_REFUSE, 403 AUTHOR_NOT_AUTHORIZED, 404 NOT_FOUND (no spoiled ballot with that code), 429 RATE_LIMITED.
   * Idempotent for identical bytes, so a retry resends the same record.
   */
  async postSpoilShare(id: string, record: unknown): Promise<SpoilSharePosted> {
    return this.json(await this.req('POST', `${API}/elections/${enc(id)}/spoil-shares`, { body: record }));
  }

  // ---- voter
  async register(id: string, body: RegistrationBody): Promise<RegistrationResult> {
    return this.json(await this.req('POST', `${API}/elections/${enc(id)}/registrations`, { body }));
  }

  /** Appends one entry. Identical bytes are idempotent (QV-09 §4.4), so retries resend exactly the same body. */
  async postEntry(id: string, headerB64u: string, bodyB64u: string): Promise<AppendResult> {
    const res = await this.req('POST', `${API}/elections/${enc(id)}/log/entries`, { body: { header: headerB64u, body: bodyB64u } });
    return this.json(res);
  }

  /** Retries network failures, timeouts, 429 and 503 with the same bytes; honours Retry-After; never retries 4xx rejects. */
  async postEntryWithRetry(id: string, headerB64u: string, bodyB64u: string, maxAttempts = 4): Promise<AppendResult> {
    let last: ApiError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.postEntry(id, headerB64u, bodyB64u);
      } catch (e) {
        if (!isRetryable(e) || attempt === maxAttempts) throw e;
        last = e as ApiError;
        const wait = Math.min(15_000, last.retryAfter !== undefined ? last.retryAfter * 1000 : 500 * 2 ** (attempt - 1));
        this.onRetry?.(attempt, wait, last);
        await this.sleep(wait);
      }
    }
    throw last ?? new ApiError({ status: 0, code: NETWORK });
  }

  // ---- organizer
  async createElection(orgId: string, title: string, idempotencyKey: string): Promise<ElectionSummary> {
    return this.json(await this.req('POST', `${API}/orgs/${enc(orgId)}/elections`, { body: { title }, signed: true, headers: { 'Idempotency-Key': idempotencyKey } }));
  }
  async putDraft(id: string, draft: unknown): Promise<unknown> {
    return this.json(await this.req('PUT', `${API}/elections/${enc(id)}/draft`, { body: draft, signed: true }));
  }
  /** Returns codes once. An idempotent replay answers `code_withheld: true` and no `code`; the first response must be kept. */
  async createInvites(id: string, count: number, idempotencyKey: string): Promise<InviteResult> {
    return this.json(await this.req('POST', `${API}/elections/${enc(id)}/invites`, { body: { count }, signed: true, headers: { 'Idempotency-Key': idempotencyKey } }));
  }
}

const enc = encodeURIComponent;

async function problem(res: Response): Promise<ApiError> {
  const ra = Number(res.headers.get('Retry-After'));
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  let p: Partial<{ code: string; detail: string; retryable: boolean; request_id: string; reason: string }> = {};
  try {
    p = (await res.json()) as typeof p;
  } catch {
    /* not problem+json: fall through to a generic code */
  }
  return new ApiError({
    status: res.status,
    code: typeof p.code === 'string' ? p.code : res.status === 404 ? 'NOT_FOUND' : res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
    retryable: typeof p.retryable === 'boolean' ? p.retryable : res.status === 429 || res.status === 503,
    requestId: typeof p.request_id === 'string' ? p.request_id : res.headers.get('X-Request-Id') ?? undefined,
    reason: typeof p.reason === 'string' ? p.reason : undefined,
    retryAfter,
    detail: typeof p.detail === 'string' ? p.detail : undefined,
  });
}
