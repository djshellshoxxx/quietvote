import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControlDb } from '../src/controldb.ts';
import { loadOrCreateKek, seal } from '../src/kek.ts';

const NOW = () => 1_700_000_000_000;

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'qv-kek-'));
}

test('fresh data directory creates a 32-byte KEK file and reuses it', () => {
  const dir = freshDir();
  try {
    const k1 = loadOrCreateKek(dir);
    assert.equal(k1.length, 32);
    assert.ok(existsSync(join(dir, 'kek', 'kek.bin')));
    const k2 = loadOrCreateKek(dir);
    assert.deepEqual(k2, k1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fresh data directory with an empty control.sqlite still creates the KEK', () => {
  const dir = freshDir();
  try {
    // buildServer opens control.sqlite before loading the KEK; an empty registry must not block that.
    const control = new ControlDb(dir, NOW, 'test');
    control.close();
    const k = loadOrCreateKek(dir);
    assert.equal(k.length, 32);
    assert.ok(existsSync(join(dir, 'kek', 'kek.bin')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing KEK file with wrapped data present is refused and no new KEK is written', () => {
  const dir = freshDir();
  try {
    const kek = loadOrCreateKek(dir);
    const control = new ControlDb(dir, NOW, 'test');
    const org = control.createOrg('org', 'k'.repeat(26), new Uint8Array(32));
    const dek = new Uint8Array(32).fill(7);
    control.insertElection({
      election_id: 'ab'.repeat(16), org_id: org.org_id, db_path: 'elections/x.sqlite', access: 'public', title: 't',
      dek_wrapped: seal(kek, dek, `dek:${'ab'.repeat(16)}`),
    });
    control.close();

    const kekFile = join(dir, 'kek', 'kek.bin');
    unlinkSync(kekFile);

    assert.throws(() => loadOrCreateKek(dir), /KEK .*missing .*wrapped data/i);
    assert.equal(existsSync(kekFile), false, 'must not write a replacement KEK file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing KEK file with a webhook row present is refused', () => {
  const dir = freshDir();
  try {
    const kek = loadOrCreateKek(dir);
    const control = new ControlDb(dir, NOW, 'test');
    const org = control.createOrg('org', 'k'.repeat(26), new Uint8Array(32));
    control.insertWebhook({
      webhook_id: 'w'.repeat(26), org_id: org.org_id, election_id: null,
      url_enc: seal(kek, new TextEncoder().encode('https://example.invalid/h'), 'webhook:w:url'),
      secret_enc: seal(kek, new TextEncoder().encode('s'), 'webhook:w:secret'), events: '[]',
    });
    control.close();
    unlinkSync(join(dir, 'kek', 'kek.bin'));
    assert.throws(() => loadOrCreateKek(dir), /KEK .*missing .*wrapped data/i);
    assert.equal(existsSync(join(dir, 'kek', 'kek.bin')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing KEK file is still read unchanged when data is present', () => {
  const dir = freshDir();
  try {
    const kek = loadOrCreateKek(dir);
    const control = new ControlDb(dir, NOW, 'test');
    const org = control.createOrg('org', 'k'.repeat(26), new Uint8Array(32));
    control.insertElection({
      election_id: 'cd'.repeat(16), org_id: org.org_id, db_path: 'elections/y.sqlite', access: 'public', title: 't',
      dek_wrapped: seal(kek, new Uint8Array(32).fill(3), `dek:${'cd'.repeat(16)}`),
    });
    control.close();
    assert.deepEqual(loadOrCreateKek(dir), kek);
    assert.deepEqual(readFileSync(join(dir, 'kek', 'kek.bin')), Buffer.from(kek));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
