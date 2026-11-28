#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep npm lifecycle hooks and the existing test glob; Node runner options must precede that positional glob.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = ['--test', '--test-reporter=spec'];
const env = { ...process.env };
const output = env.QV_COVERAGE_OUTPUT;
// Only this workspace runner collects the requested report; child tools and nested runners must not reuse its file.
delete env.QV_COVERAGE_OUTPUT;
delete env.NODE_TEST_CONTEXT;
if (output) args.push('--experimental-test-coverage', '--test-reporter=' + resolve(import.meta.dirname, 'coverage-report.mjs'),
  '--test-reporter-destination=stdout', '--test-reporter-destination=' + resolve(output));
args.push(...process.argv.slice(2), 'test/**/*.test.ts');
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
if (result.error) {
  process.stderr.write('Workspace test process could not start.\n');
  process.exitCode = 1;
} else if (result.signal) {
  // Preserve termination as a signal instead of translating it into a successful or ordinary test exit.
  process.kill(process.pid, result.signal);
} else process.exitCode = result.status ?? 1;
