import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, ed25519Keypair, utf8 } from '@quietvote/crypto';
import { requestMessage, signRequest } from '../../server/src/auth.ts';
import { requestMessage as sharedMessage, signRequest as sharedSign } from '@quietvote/board';

// Captured from the existing server helper before extracting it. These fixed bytes guard compatibility.
const MESSAGE = '51562d5245512d763100504f5354002f6170692f76312f6f7267732f6162632f656c656374696f6e730071763a696e7374616e63654068747470733a2f2f766f74652e6578616d706c65003138303030303030303000040404040404040404040404040404045c924960820d681cb4ac7c1dd76c1b56b963dbbf718faba003691dd26cce3e38';
const HEADER = 'QV-Sig keyid=Mpxp5U-dXzOO93DUrNoHfuBhyWB-t5sG0tGSk6AeLGM,ts=1800000000,nonce=BAQEBAQEBAQEBAQEBAQEBA,sig=pk7UqJMtMGvKnzZaFHavhdnAJGXkVlWktXvH8DejPfjuyOwHYcGJuy_d6PLKpKN09L9AeI0V3AKtYi-JeoFkCw';

test('shared request signing preserves the existing server message and signature bytes', () => {
  assert.equal(requestMessage, sharedMessage);
  assert.equal(signRequest, sharedSign);
  const key = ed25519Keypair(new Uint8Array(32).fill(3));
  const nonce = new Uint8Array(16).fill(4);
  const body = utf8('{"title":"Hello"}');
  assert.equal(bytesToHex(requestMessage('POST', '/api/v1/orgs/abc/elections', 'qv:instance@https://vote.example', 1800000000, nonce, body)), MESSAGE);
  assert.equal(signRequest(key.secretKey, key.publicKey, 'POST', '/api/v1/orgs/abc/elections', 'qv:instance@https://vote.example', body, 1800000000, nonce), HEADER);
});
