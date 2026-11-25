// Board entries on the client: build + sign with an async Signer, and decode what the server returns.
// Body convention: the entry body is the QV-JSON (RFC 8785) serialisation of the protocol record or voter envelope,
// carried as exact canonical bytes (QV-ADR-019). The board does not interpret bodies; the verifier does.
import { authorKeyId, bodyDigest, encodeHeader, hashLeaf, signedBytes, type EntryHeader, type EntryType } from '@quietvote/board';
import { jcs, parseQvJson, utf8, type Rng } from '@quietvote/crypto';
import type { EntryView } from '../api/types.ts';
import type { Signer } from '../key/signer.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';

export interface PreparedEntry {
  headerBytes: Uint8Array;
  body: Uint8Array;
  leafHash: Uint8Array;
  headerB64u: string;
  bodyB64u: string;
  type: EntryType;
}

export async function prepareEntry(i: {
  signer: Signer;
  origin: string;
  type: EntryType;
  record: unknown;
  rng: Rng;
  /** Unix seconds. */
  now: number;
  refs?: number[];
}): Promise<PreparedEntry> {
  const body = jcs(i.record);
  const unsigned: EntryHeader = {
    v: 1, origin: i.origin, type: i.type, author: authorKeyId('ed25519', i.signer.publicKey), authorAlg: 'ed25519',
    authorNonce: i.rng.bytes(16), createdAt: i.now, bodyLen: body.length, bodyDigest: bodyDigest(body), refs: i.refs ?? [], sig: new Uint8Array(0),
  };
  const sig = await i.signer.sign(signedBytes(unsigned));
  const headerBytes = encodeHeader({ ...unsigned, sig });
  return { headerBytes, body, leafHash: hashLeaf(headerBytes), headerB64u: b64uEncode(headerBytes), bodyB64u: b64uEncode(body), type: i.type };
}

/** Parses an entry body as strict QV-JSON. Returns undefined for redacted or malformed entries. */
export function entryRecord(v: EntryView): unknown {
  if (v.body_b64u === null) return undefined;
  const bytes = b64uDecode(v.body_b64u);
  if (bytes === undefined) return undefined;
  try {
    return parseQvJson(bytes);
  } catch {
    return undefined;
  }
}

export const textOf = (b: Uint8Array): string => new TextDecoder().decode(b);
export const bytesOfText = utf8;
