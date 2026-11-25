#!/usr/bin/env node
import { run } from '../src/main.ts';
import { nodeIo } from '../src/io.ts';

process.exitCode = await run(process.argv.slice(2), nodeIo());
