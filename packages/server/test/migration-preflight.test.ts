// @verifies QV-28-REQ-010
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { buildServer } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { MIGRATIONS as CONTROL_MIGRATIONS } from '../src/controldb.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS } from '../src/electiondb.ts';
import { preflightOpenMigrations } from '../src/migration-policy.ts';
import { World } from './helpers/world.ts';

function fixture(controlVersion: number, targets: { state: string; version: number }[], fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'qv-migration-preflight-'));
  try {
    const control = openDb({ path: join(dir, 'control.sqlite'), applicationId: 0x51564343, synchronous: 'FULL',
      migrations: CONTROL_MIGRATIONS.slice(0, controlVersion), appVersion: 'fixture' });
    control.exec("INSERT INTO org(org_id,name,created_at) VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaa','fixture',0)");
    for (const [index, target] of targets.entries()) {
      const id = (index + 1).toString(16).padStart(32, '0'), relative = join('elections', id.slice(0, 2), id + '.sqlite');
      mkdirSync(join(dir, 'elections', id.slice(0, 2)), { recursive: true });
      openDb({ path: join(dir, relative), applicationId: 0x51564442, synchronous: 'FULL',
        migrations: ELECTION_MIGRATIONS.slice(0, target.version), appVersion: 'fixture' }).close();
      control.prepare("INSERT INTO election_registry(election_id,org_id,db_path,state,title,created_at,imported) VALUES(?,'aaaaaaaaaaaaaaaaaaaaaaaaaa',?,?,?,0,?)")
        .run(id, relative, target.state, 'fixture', target.state === 'IMPORTED' ? 1 : 0);
    }
    control.close(); fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const controlLatest = CONTROL_MIGRATIONS.length, electionLatest = ELECTION_MIGRATIONS.length;

test('OPEN blocks a pending control upgrade before the server writes or retains its instance lock', () => {
  fixture(controlLatest - 1, [{ state: 'OPEN', version: electionLatest }], (dir) => {
    const before = readFileSync(join(dir, 'control.sqlite'));
    assert.throws(() => buildServer({ dataDir: dir }), /OPEN.*force-migrate-open/);
    assert.deepEqual(readFileSync(join(dir, 'control.sqlite')), before);
    assert.equal(existsSync(join(dir, '.qv-server.lock')), false);
    assert.equal(existsSync(join(dir, 'control.sqlite.pre-migrations')), false);
    assert.equal(existsSync(join(dir, 'kek.bin')), false);
    assert.doesNotThrow(() => preflightOpenMigrations(dir, true));
  });
});

test('OPEN blocks another active election\'s pending schema even when control and OPEN schemas are current', () => {
  fixture(controlLatest, [{ state: 'OPEN', version: electionLatest }, { state: 'DRAFT', version: electionLatest - 1 }], (dir) => {
    const before = readFileSync(join(dir, 'control.sqlite'));
    assert.throws(() => buildServer({ dataDir: dir }), /OPEN.*force-migrate-open/);
    assert.deepEqual(readFileSync(join(dir, 'control.sqlite')), before);
    assert.equal(existsSync(join(dir, '.qv-server.lock')), false);
    assert.doesNotThrow(() => preflightOpenMigrations(dir, true));
  });
});

test('current schemas remain usable during voting and historical terminal stores are not automatically migrated', () => {
  fixture(controlLatest, [{ state: 'OPEN', version: electionLatest }, { state: 'ARCHIVED', version: 1 }, { state: 'IMPORTED', version: 1 }], (dir) => {
    assert.doesNotThrow(() => preflightOpenMigrations(dir));
  });
});

test('an ordinary pending upgrade without OPEN does not require an override', () => {
  fixture(1, [{ state: 'DRAFT', version: 1 }], (dir) => assert.doesNotThrow(() => preflightOpenMigrations(dir)));
});

async function preparedWorld(t: TestContext, seed: string): Promise<World> {
  const world = new World({ seed, n: 3, t: 2, voters: 3 });
  await world.start();
  t.after(() => world.stop());
  await world.setupOrgAndElection(); await world.registerVoters();
  assert.equal((await world.publishManifest()).status, 201);
  await world.ceremony();
  return world;
}

function pendingControl(t: TestContext): void {
  // A process-local future step creates real schema debt without changing old
  // checksums, downgrading a current DB, or editing the production catalog.
  const future = { version: CONTROL_MIGRATIONS.length + 1, name: 'preflight-fixture', sql: 'CREATE TABLE preflight_fixture(id INTEGER PRIMARY KEY) STRICT;' };
  CONTROL_MIGRATIONS.push(future);
  t.after(() => { assert.equal(CONTROL_MIGRATIONS.pop(), future); });
}

function assertEmptyUnbound(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA application_id').get()?.['application_id'], 0);
    assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sqlite_schema').get()?.['n'], 0);
  } finally { db.close(); }
}

test('initial control startup recovers an interruption before application_id is assigned', async (t) => {
  const world = new World({ seed: 'migration-empty-control-cut', n: 3, t: 2, voters: 3 });
  t.after(async () => { await world.server?.stop(); rmSync(world.dir, { recursive: true, force: true }); });
  const exec = DatabaseSync.prototype.exec;
  let reached = 0;
  const fault = t.mock.method(DatabaseSync.prototype, 'exec', function(this: DatabaseSync, sql: string): void {
    if (sql === `PRAGMA application_id=${0x51564343}`) { reached++; throw new Error('simulated interruption before control identity'); }
    exec.call(this, sql);
  });
  await assert.rejects(world.start(), /simulated interruption before control identity/);
  fault.mock.restore();
  assert.equal(reached, 1);
  assertEmptyUnbound(join(world.dir, 'control.sqlite'));
  assert.equal(existsSync(join(world.dir, '.qv-server.lock')), false);
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
  await world.start();
  assert.equal(world.server.env.control.migrationVersion(), controlLatest);
});

test('a DRAFT creation interrupted before its database identity remains a proven-empty initialization target', async (t) => {
  const world = new World({ seed: 'migration-empty-election-cut', n: 3, t: 2, voters: 3 });
  await world.start();
  t.after(() => world.stop());
  await world.setupOrgAndElection();
  const exec = DatabaseSync.prototype.exec;
  let reached = 0;
  const fault = t.mock.method(DatabaseSync.prototype, 'exec', function(this: DatabaseSync, sql: string): void {
    if (sql === `PRAGMA application_id=${0x51564442}`) { reached++; throw new Error('simulated interruption before election identity'); }
    exec.call(this, sql);
  });
  const route = `/api/v1/orgs/${world.orgId}/elections`, body = { title: 'Empty interrupted creation' }, headers = world.idemKey();
  const response = await world.signed('POST', route, body, world.owner, headers);
  fault.mock.restore();
  assert.equal(reached, 1);
  assert.equal(response.status, 500, response.text);
  const reservation = world.server.env.control.listElections(world.orgId, undefined, undefined, 10).find((row) => row.title === body.title);
  assert.ok(reservation);
  assert.equal(reservation.state, 'DRAFT');
  await world.server.stop();
  assertEmptyUnbound(join(world.dir, reservation.db_path));
  pendingControl(t);
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
  await world.start();
  assert.equal(world.server.env.control.migrationVersion(), CONTROL_MIGRATIONS.length);
  const retry = await world.signed('POST', route, body, world.owner, headers);
  assert.equal(retry.status, 409, retry.text);
  assert.equal(retry.json.reason, 'IDEMPOTENCY_INTERRUPTED');
  assert.equal(world.server.env.control.countElections(world.orgId), 2);
});

for (const [name, sql] of [
  ['nonempty unbound database', 'CREATE TABLE unrelated(value TEXT)'],
  ['nonzero schema version', 'PRAGMA user_version=1'],
  ['unrelated application identity', 'PRAGMA application_id=123'],
] as const) {
  test(`an initialization exception cannot claim a ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'qv-migration-unbound-refusal-')), path = join(dir, 'control.sqlite');
    try {
      const db = new DatabaseSync(path); db.exec(sql); db.close();
      const before = readFileSync(path);
      for (const force of [false, true]) assert.throws(() => preflightOpenMigrations(dir, force), /application_id/);
      assert.deepEqual(readFileSync(path), before);
      assert.equal(existsSync(path + '.pre-migrations'), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('an interrupted signed creation preserves current-schema startup but blocks upgrade of unreadable storage, including with force', async (t) => {
  const world = new World({ seed: 'migration-preflight-creation-cut', n: 3, t: 2, voters: 3 });
  await world.start();
  t.after(() => world.stop());
  await world.setupOrgAndElection();
  const insert = world.server.env.control.insertElection.bind(world.server.env.control);
  let reserved: { id: string; path: string } | undefined;
  let reached = 0;
  const fault = t.mock.method(world.server.env.control, 'insertElection', (...args: Parameters<typeof insert>) => {
    insert(...args);
    reserved = { id: args[0].election_id, path: args[0].db_path };
    reached++;
    throw new Error('simulated interruption after the durable DRAFT reservation');
  });
  const route = `/api/v1/orgs/${world.orgId}/elections`, body = { title: 'Interrupted creation' }, headers = world.idemKey();
  const response = await world.signed('POST', route, body, world.owner, headers);
  fault.mock.restore();
  assert.equal(reached, 1);
  assert.equal(response.status, 500, response.text);
  assert.ok(reserved);
  assert.equal(world.server.env.control.election(reserved.id)?.state, 'DRAFT');
  const path = join(world.dir, reserved.path);
  assert.equal(existsSync(path), false, 'the cut preceded database creation');
  await world.server.stop();
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
  await world.start();
  const retry = await world.signed('POST', route, body, world.owner, headers);
  assert.equal(retry.status, 409, retry.text);
  assert.equal(retry.json.reason, 'IDEMPOTENCY_INTERRUPTED');
  assert.equal(world.server.env.control.countElections(world.orgId), 2, 'startup must retain the interrupted request without repeating creation');
  assert.equal(existsSync(path), false);
  await world.server.stop();
  const controlPath = join(world.dir, 'control.sqlite'), before = readFileSync(controlPath);
  pendingControl(t);
  for (const force of [false, true]) {
    assert.throws(() => preflightOpenMigrations(world.dir, force), /cannot safely inspect.*migration/);
    assert.throws(() => buildServer({ dataDir: world.dir, minFreeBytes: 0, forceMigrateOpen: force }), /cannot safely inspect.*migration/);
    assert.equal(existsSync(join(world.dir, '.qv-server.lock')), false);
  }
  assert.deepEqual(readFileSync(controlPath), before);
  assert.equal(existsSync(controlPath + '.pre-migrations'), false);
  openDb({ path, applicationId: 0x51564442, synchronous: 'FULL', migrations: [], appVersion: 'empty-creation-target' }).close();
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir), 'a verified empty creation target contains no unresolved opening');
});

for (const cut of ['registry', 'both projections'] as const) {
  test(`durable election_open blocks migration after interruption before ${cut} update`, async (t) => {
    const world = await preparedWorld(t, `migration-preflight-${cut}`);
    const runtime = (await world.server.pool.get(world.electionId))!;
    const electionPath = join(world.dir, runtime.registry.db_path);
    const controlPath = join(world.dir, 'control.sqlite');
    const originalControl = world.server.env.control.setState.bind(world.server.env.control);
    const originalElection = runtime.edb.setState.bind(runtime.edb);
    let reached = 0;
    const fault = cut === 'registry'
      ? t.mock.method(world.server.env.control, 'setState', (...args: Parameters<typeof originalControl>) => {
        if (args[1] === 'OPEN') { reached++; throw new Error('simulated interruption before registry update'); }
        return originalControl(...args);
      })
      : t.mock.method(runtime.edb, 'setState', (...args: Parameters<typeof originalElection>) => {
        if (args[0] === 'OPEN') { reached++; throw new Error('simulated interruption before election projection update'); }
        return originalElection(...args);
      });
    const response = await world.open();
    fault.mock.restore();
    assert.equal(reached, 1, 'the requested post-append cut must be reached');
    assert.equal(response.status, 500, response.text);
    assert.equal(runtime.logState, 'OPEN');
    assert.equal(world.server.env.control.election(world.electionId)?.state, 'READY');
    assert.equal(runtime.edb.row().state, cut === 'registry' ? 'OPEN' : 'READY');
    const opening = runtime.edb.db.prepare("SELECT seq FROM log_entry WHERE type='election_open'").get();
    assert.ok(opening, 'the real authenticated opening was durably admitted');
    assert.notEqual(runtime.edb.appendCompletion(Number(opening['seq'])), undefined, 'the durable completion intent must remain');
    await world.server.stop();
    // With no pending schema, read-only inspection permits normal recovery.
    assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
    const before = [controlPath, electionPath].map((path) => readFileSync(path));
    pendingControl(t);
    assert.throws(() => preflightOpenMigrations(world.dir), /OPEN.*force-migrate-open/);
    assert.throws(() => buildServer({ dataDir: world.dir, minFreeBytes: 0 }), /OPEN.*force-migrate-open/);
    assert.equal(existsSync(join(world.dir, '.qv-server.lock')), false);
    for (const [index, path] of [controlPath, electionPath].entries()) {
      assert.deepEqual(readFileSync(path), before[index]);
      assert.equal(existsSync(path + '.pre-migrations'), false);
    }
    assert.doesNotThrow(() => preflightOpenMigrations(world.dir, true));
  });
}

test('an unresolved opening stays conservative through PAUSED and INVALIDATED controls', async (t) => {
  const world = await preparedWorld(t, 'migration-preflight-notice-controls');
  assert.equal((await world.open()).status, 201);
  const pause = await world.post('notice', world.coord[0]!, world.control('pause'));
  assert.equal(pause.status, 201, pause.text);
  const runtime = (await world.server.pool.get(world.electionId))!;
  assert.equal(runtime.state, 'PAUSED');
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
  pendingControl(t);
  assert.throws(() => preflightOpenMigrations(world.dir), /OPEN.*force-migrate-open/);
  const invalidate = await world.post('notice', world.coord[0]!, world.control('invalidate'));
  assert.equal(invalidate.status, 201, invalidate.text);
  assert.equal(runtime.state, 'INVALIDATED');
  assert.throws(() => preflightOpenMigrations(world.dir), /OPEN.*force-migrate-open/);
  assert.doesNotThrow(() => preflightOpenMigrations(world.dir, true));
});

for (const ending of ['close', 'cancel'] as const) {
  test(`a later admitted ${ending} resolves an opening for preflight policy`, async (t) => {
    const world = await preparedWorld(t, `migration-preflight-resolved-${ending}`);
    assert.equal((await world.open()).status, 201);
    const response = ending === 'close' ? await world.close()
      : await world.post('election_cancel', world.coord[0]!, world.control('cancel'));
    assert.equal(response.status, 201, response.text);
    pendingControl(t);
    assert.doesNotThrow(() => preflightOpenMigrations(world.dir));
  });
}
