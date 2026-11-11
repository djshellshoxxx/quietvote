#!/usr/bin/env node
import { verifierMain } from './main.ts';

process.exitCode = await verifierMain(process.argv.slice(2), {
  out: (s) => void process.stdout.write(s),
  err: (s) => void process.stderr.write(s),
});
