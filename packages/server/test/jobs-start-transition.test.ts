// QV-09 Job / QV-28: a storage failure while starting one job must not strand the queue.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { World } from './helpers/world.ts';

test('a failed job-start transition records failure and schedules the next job', { timeout: 30_000 }, async () => {
  const world = new World({ seed: 'job-start-transition', n: 3, t: 2, voters: 1 });
  await world.start();
  const jobs = world.server.jobs;
  const control = world.server.env.control;
  const start = control.startJob.bind(control);
  let attempts = 0;
  const startMock = mock.method(control, 'startJob', (id: string) => {
    if (++attempts === 1) throw new Error('synthetic job start storage failure');
    start(id);
  });
  try {
    let firstWorkInvoked = false;
    const spec = { kind: 'backup' as const, election_id: null, params: {}, created_by: 'synthetic' };
    const first = jobs.submit('admin', 4, spec, async () => {
      firstWorkInvoked = true;
      return { result: 'must not execute' };
    });
    const second = jobs.submit('admin', 4, spec, async () => ({ result: { ok: true } }));

    for (let i = 0; i < 100 && control.job(second.job_id)?.state !== 'done'; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(firstWorkInvoked, false, 'a job whose start transition failed must not execute work');
    const failed = control.job(first.job_id)!;
    assert.equal(failed.state, 'failed');
    assert.equal((JSON.parse(failed.error!) as { code: string }).code, 'INTERNAL');
    assert.equal(control.job(second.job_id)?.state, 'done', 'the next job must not remain queued');
    assert.equal(jobs.active('admin'), 0, 'all queue slots must be released');
  } finally {
    startMock.mock.restore();
    await world.stop();
  }
});
