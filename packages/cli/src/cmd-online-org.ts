// Organization enrollment uses the adopted QV-08 signed-request contract (ADR-027 N-20).
import { authorKeyId, b64u } from '@quietvote/board';
import { wipe } from '@quietvote/crypto';
import { FailError, InputError, UsageError, needFlag, type Parsed } from './args.ts';
import { printJson, readPrivateFile } from './common.ts';
import { AUTH, args, jsonRequest, request, withManagementKey } from './cmd-online.ts';
import { EXIT, type Io } from './io.ts';

const ID = /^[a-z2-7]{26}$/;
const MAX_RESPONSE = 64 * 1024;

async function registrationToken(p: Parsed): Promise<string | undefined> {
  if (!p.has('registration-token-file')) return undefined;
  const bytes = await readPrivateFile(needFlag(p, 'registration-token-file'), 1024);
  try {
    // Preserve configured token spelling, including spaces. A text file may end in one LF or CRLF.
    const token = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r?\n$/, '');
    if (token.length < 1 || token.length > 200 || /[\r\n\0]/.test(token)) throw new Error('format');
    return token;
  } catch { throw new InputError('registration token must be a UTF-8 line of 1..200 characters in an owner-private file'); }
  finally { wipe(bytes); }
}

async function create(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, name: 'value', 'idempotency-key': 'value', 'registration-token-file': 'value' });
  const name = needFlag(p, 'name');
  if (name.length > 120 || name.includes('\0')) throw new UsageError('--name must contain 1..120 characters without NUL');
  needFlag(p, 'idempotency-key');
  const token = await registrationToken(p);
  return withManagementKey(p, io, async (key) => {
    const owner = b64u(authorKeyId('ed25519', key.publicKey));
    let response: Uint8Array;
    try {
      response = await request(p, io, 'POST', '/api/v1/orgs', {
        name, owner_key: { pk: b64u(key.publicKey), alg: 'ed25519' },
        ...(token === undefined ? {} : { registration_token: token }),
      }, key, MAX_RESPONSE);
    } catch (error) {
      // Even a bounded server error code could echo the submitted registration bearer.
      if (error instanceof FailError) throw new FailError('organization creation was not confirmed; outcome may be unknown; inspect server state before any retry');
      throw error;
    }
    try {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response));
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
      const org = value as Record<string, unknown>;
      if (typeof org['org_id'] !== 'string' || !ID.test(org['org_id']) || org['name'] !== name ||
          !Array.isArray(org['keys']) || org['keys'].length !== 1) throw new Error('binding');
      const first: unknown = org['keys'][0];
      if (first === null || typeof first !== 'object' || Array.isArray(first)) throw new Error('key');
      const registered = first as Record<string, unknown>;
      if (registered['key_id'] !== owner || registered['role'] !== 'org_owner') throw new Error('owner');
      // Print only the public fields bound to this request; discard all extra server fields.
      printJson(io, { org_id: org['org_id'], name, keys: [{ key_id: owner, role: 'org_owner' }] });
      return EXIT.ok;
    } catch { throw new FailError('organization creation returned an invalid response; it may have been accepted; inspect server state before any retry'); }
    finally { wipe(response); }
  });
}

async function inspect(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, org: 'value' }), org = needFlag(p, 'org');
  if (!ID.test(org)) throw new UsageError('--org must be a 26-character lowercase base32 identifier');
  return jsonRequest(p, io, 'GET', `/api/v1/orgs/${org}`, undefined, true);
}

export const ONLINE_ORGS = { 'org-create': create, 'org-inspect': inspect } as const;
