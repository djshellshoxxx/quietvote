import test from 'node:test';
import assert from 'node:assert/strict';
import { openWithPassphrase, sealWithPassphrase, streamRng, utf8 } from '../src/index.ts';

const weak = { logN: 4, allowWeak: true } as const;
const passphrase = 'opening cleanup passphrase';

for (const stage of ['KDF', 'payload derivation']) {
  test(`opening wipes allocated secrets when ${stage} throws`, async (t) => {
    const file = await sealWithPassphrase(utf8('secret payload'), passphrase, streamRng('open-cleanup'), weak);
    const originalFile = file.slice();
    const encode = TextEncoder.prototype.encode;
    const subtle = globalThis.crypto.subtle;
    const decrypt = subtle.decrypt.bind(subtle);
    let pw: Uint8Array | undefined;
    let fileKey: Uint8Array | undefined;
    let decryptCalls = 0;
    t.mock.method(subtle, 'decrypt', async (...args: Parameters<typeof decrypt>) => {
      const result = await decrypt(...args);
      if (++decryptCalls === 1) fileKey = new Uint8Array(result);
      return result;
    });
    const failure = new Error('injected derivation failure');
    t.mock.method(TextEncoder.prototype, 'encode', function (this: TextEncoder, input?: string) {
      if (input === (stage === 'KDF' ? 'qv-bundle-v1' : 'qv-bundle-v1/payload')) throw failure;
      const bytes = encode.call(this, input);
      if (input === passphrase) pw = bytes;
      return bytes;
    });
    await assert.rejects(openWithPassphrase(file, passphrase, { allowWeak: true }), failure);
    assert.ok(pw, 'captured the owned passphrase encoding');
    assert.deepEqual(pw, new Uint8Array(passphrase.length));
    if (stage === 'payload derivation') {
      assert.ok(fileKey, 'captured unwrapped file key');
      assert.deepEqual(fileKey, new Uint8Array(32));
    } else assert.equal(decryptCalls, 0);
    assert.deepEqual(file, originalFile, 'caller-owned ciphertext is unchanged');
  });
}

for (const operation of ['importKey', 'decrypt'] as const) {
  for (const failAt of [1, 2]) {
    test(`opening wipes owned secrets when ${operation} ${failAt} rejects`, async (t) => {
      const file = await sealWithPassphrase(utf8('secret payload'), passphrase, streamRng(`open-${operation}-${failAt}`), weak);
      const originalFile = file.slice();
      const subtle = globalThis.crypto.subtle;
      const original = subtle[operation].bind(subtle);
      const encode = TextEncoder.prototype.encode;
      let pw: Uint8Array | undefined;
      t.mock.method(TextEncoder.prototype, 'encode', function (this: TextEncoder, input?: string) {
        const bytes = encode.call(this, input);
        if (input === passphrase) pw = bytes;
        return bytes;
      });
      const wiped: { buffer: Uint8Array; before: Uint8Array }[] = [];
      const fill = Uint8Array.prototype.fill;
      t.mock.method(Uint8Array.prototype, 'fill', function (this: Uint8Array, value: number, start?: number, end?: number) {
        if (value === 0 && start === undefined && end === undefined && this.length === 32) wiped.push({ buffer: this, before: this.slice() });
        return fill.call(this, value, start, end);
      });
      let calls = 0;
      t.mock.method(subtle, operation, (...args: Parameters<typeof original>) => {
        if (++calls === failAt) return Promise.reject(new Error('injected crypto failure'));
        return Reflect.apply(original, subtle, args);
      });
      await assert.rejects(openWithPassphrase(file, passphrase, { allowWeak: true }), { code: 'E_AEAD' });
      assert.equal(calls, failAt);
      assert.deepEqual(pw, new Uint8Array(passphrase.length));
      const secrets = wiped.filter(({ before }) => before.some((byte) => byte !== 0));
      // The KDF also clears internal scratch buffers; do not pin their count.
      assert.ok(secrets.length >= (failAt === 1 ? 1 : 3), 'wrapping key, plus file and payload keys after unwrap');
      for (const { buffer } of secrets) assert.deepEqual(buffer, new Uint8Array(32));
      assert.deepEqual(file, originalFile);
    });
  }
}
