import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LABELS, QvCryptoError, bytesToHex, concatBytes, firstNonZero, frame, framedPreimage, h256, h512, hs, hsNz, lp,
  sha256, u32, utf8, u8, ctEqual, hexToBytes, isHex, ORDER,
} from '../src/index.ts';

const f = (s: string): Uint8Array => utf8(s);

test('frame layout matches QV-16 §5.3', () => {
  const p = frame('manifest', [f('ab'), f('c')]);
  const expect = concatBytes(lp(f('QV1-HASH')), lp(f('qv1-r255-sha2')), lp(f('manifest')), u32(2), lp(f('ab')), lp(f('c')));
  assert.deepEqual(p, expect);
});

test('field-boundary ambiguity: ("ab","c") vs ("a","bc") differ', () => {
  assert.notEqual(bytesToHex(h256('manifest', f('ab'), f('c'))), bytesToHex(h256('manifest', f('a'), f('bc'))));
  assert.notEqual(bytesToHex(h256('manifest', f('abc'))), bytesToHex(h256('manifest', f('abc'), f(''))));
});

test('cds01 preimage is exactly 383 bytes (QV-16 Appendix A.4 length check)', () => {
  const b32 = new Uint8Array(32);
  const pre = framedPreimage('cds01', b32, b32, f('budget'), f('yes'), b32, b32, b32, b32, b32, b32, b32);
  assert.equal(pre.length, 383);
});

test('unregistered labels and kind mismatches throw', () => {
  // @ts-expect-error unregistered label on purpose
  assert.throws(() => h256('nope', f('x')), (e: unknown) => e instanceof QvCryptoError && e.code === 'E_DOMAIN_UNKNOWN');
  assert.throws(() => h256('cds01', f('x')), /registered for hs/);
  assert.throws(() => hs('manifest', f('x')), /registered for H256/);
  assert.throws(() => h512('manifest', f('x')), /registered/);
  assert.throws(() => hsNz('pok', f('x')), /registered/);
});

test('every registry label is usable with its kind and domain separated from every other', () => {
  const outs = new Set<string>();
  for (const [label, kind] of Object.entries(LABELS)) {
    const l = label as keyof typeof LABELS;
    let out: string;
    if (kind === 'H256') out = bytesToHex(h256(l, f('x')));
    else if (kind === 'H512') out = bytesToHex(h512(l, f('x')));
    else if (kind === 'hs') out = hs(l, f('x')).toString(16);
    else out = hsNz(l, f('x')).toString(16);
    assert.ok(!outs.has(out), `collision for ${label}`);
    outs.add(out);
  }
  assert.equal(outs.size, Object.keys(LABELS).length);
});

test('hs is a canonical scalar; hs_nz appends the counter as the LAST field and retries on zero', () => {
  const s = hs('pok', f('a'));
  assert.ok(s >= 0n && s < ORDER);
  const seen: number[] = [];
  const r = firstNonZero((c) => {
    seen.push(c);
    return c < 2 ? 0n : 5n;
  });
  assert.equal(r, 5n);
  assert.deepEqual(seen, [0, 1, 2]);
  // hs_nz(L; f) == hs-style frame with u32(0) appended
  assert.notEqual(hsNz('enc-nonce', f('x')), 0n);
});

test('h256 equals sha256 of the frame', () => {
  assert.deepEqual(h256('selvec', f('q')), sha256(frame('selvec', [f('q')])));
});

test('byte helpers', () => {
  assert.ok(ctEqual(u8(1), u8(1)));
  assert.ok(!ctEqual(u8(1), u8(2)));
  assert.ok(!ctEqual(u8(1), new Uint8Array(2)));
  assert.ok(isHex('00ff', 2));
  assert.ok(!isHex('00FF'));
  assert.ok(!isHex('0'));
  assert.throws(() => hexToBytes('0G'));
  assert.throws(() => hexToBytes('00', 2));
  assert.throws(() => u8(256));
  assert.throws(() => u32(-1));
});
