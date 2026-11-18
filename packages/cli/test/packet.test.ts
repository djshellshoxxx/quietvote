// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, ftruncateSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { decodeHeader, unb64u } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { PROTO_ID, manifestHash, verifyMultiSig } from '@quietvote/protocol';
import { BIN, COORD, qv, strangerKeyFile, tinyBundle, tmp, writeJson } from './helpers.ts';

test('coordinator signing pins body, checks prior signatures and refuses unauthorized or duplicate signers', async () => {
  const dir = tmp();
  try {
    const manifest = tinyBundle().manifest.body;
    const mh = bytesToHex(manifestHash(manifest));
    const mf = writeJson(dir, 'manifest.json', manifest);
    const key = writeJson(dir, 'coord.key', { format: 'qv-voter-key/v1', public_key: bytesToHex(COORD.publicKey), seed: bytesToHex(COORD.secretKey) });
    const body = writeJson(dir, 'body.json', { proto: PROTO_ID, type: 'marker', name: 'dkg-open' });
    const out = join(dir, 'signed.json');
    const base = ['election', 'sign-record', '--manifest', mf, '--manifest-hash', mh, '--key', key, '--out', out];
    const signed = await qv([...base, '--body', body]);
    assert.equal(signed.code, 0, signed.err);
    assert.equal(JSON.parse(signed.out).quorum, true);
    const rec = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(verifyMultiSig(manifestHash(manifest), rec, manifest.coordinator.keys, manifest.coordinator.m), true);
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.equal((await qv([...base, '--body', body])).code, 4, 'never overwrite');
    const fail = async (flags: string[], code: number) => {
      const args = [...base]; args[args.indexOf(out)] = join(dir, 'failure.json');
      const r = await qv([...args, ...flags]); assert.equal(r.code, code, r.err);
    };
    await fail(['--record', out], 1);
    const bad = writeJson(dir, 'bad.json', { ...rec, sigs: [{ ...rec.sigs[0], sig: '00'.repeat(64) }] });
    await fail(['--record', bad], 1);
    const stranger = strangerKeyFile(dir);
    assert.equal((await qv(['election', 'sign-record', '--manifest', mf, '--manifest-hash', mh, '--key', stranger, '--out', join(dir, 'stranger.json'), '--body', body])).code, 1);
    const pin = base.map((v) => v === mh ? '00'.repeat(32) : v);
    assert.equal((await qv([...pin, '--body', body])).code, 1);
    const malformed = writeJson(dir, 'malformed.json', { proto: PROTO_ID, type: 'marker', name: 'invented' });
    await fail(['--body', malformed], 4);
    const control = writeJson(dir, 'control.json', { proto: PROTO_ID, type: 'control', action: 'pause', reason: 'operator review' });
    const controlOut = join(dir, 'control-signed.json');
    assert.equal((await qv(['election', 'sign-record', '--manifest', mf, '--manifest-hash', mh, '--key', key, '--out', controlOut, '--body', control])).code, 0);
    assert.equal(verifyMultiSig(manifestHash(manifest), JSON.parse(readFileSync(controlOut, 'utf8')), manifest.coordinator.keys, manifest.coordinator.m), true);
    const unsupportedControl = writeJson(dir, 'waiver.json', { proto: PROTO_ID, type: 'control', action: 'witness-waiver' });
    await fail(['--body', unsupportedControl], 4);
    const packet = join(dir, 'packet.json');
    const r = await qv(['election', 'export-entry', '--origin', 'quietvote/v1/abcdefghijklmnopqrstuvwxyz', '--type', 'ceremony_start', '--file', out, '--key', key, '--out', packet]);
    assert.equal(r.code, 0, r.err);
    const header = decodeHeader(unb64u(JSON.parse(readFileSync(packet, 'utf8')).header)!);
    assert.equal(header.ok, true);
    assert.equal(header.value.type, 'ceremony_start');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('tally proposal rejects duplicate/out-of-range decrypters before network access', async () => {
  for (const decrypters of ['1,1', '0', '33', '01', '1,,2']) {
    const r = await qv(['online', 'election-tally-draft', '--server', 'http://127.0.0.1:1', '--id', 'aa'.repeat(16), '--decrypters', decrypters, '--out', '/unused.json']);
    assert.equal(r.code, 2, r.err);
  }
});


test('coordinator context input rejects oversized files, directories and FIFOs without blocking', () => {
  const dir = tmp();
  try {
    const manifest = tinyBundle().manifest.body;
    const mf = writeJson(dir, 'manifest.json', manifest);
    const body = writeJson(dir, 'close.json', { proto: PROTO_ID, type: 'marker', name: 'election-close' });
    const key = writeJson(dir, 'coord.key', { format: 'qv-voter-key/v1', public_key: bytesToHex(COORD.publicKey), seed: bytesToHex(COORD.secretKey) });
    const args = ['election', 'sign-record', '--manifest', mf, '--manifest-hash', bytesToHex(manifestHash(manifest)), '--body', body, '--key', key, '--out', join(dir, 'out.json')];
    const reject = (file: string) => {
      const result = spawnSync(process.execPath, [BIN, ...args, '--election', file], { encoding: 'utf8', timeout: 5000 });
      assert.equal(result.error, undefined, 'context input must not block waiting for a writer');
      assert.equal(result.status, 4, result.stderr);
      assert.match(result.stderr, /regular file.*64 MiB/);
    };
    const huge = join(dir, 'huge.json');
    const fd = openSync(huge, 'wx');
    try { ftruncateSync(fd, 64 * 1024 * 1024 + 1); } finally { closeSync(fd); }
    reject(huge);
    reject(dir);
    if (process.platform !== 'win32') {
      const fifo = join(dir, 'input.fifo');
      execFileSync('mkfifo', [fifo]);
      reject(fifo);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
