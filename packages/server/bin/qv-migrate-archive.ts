#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { archiveMigrationMain } from '../src/archive-migration.ts';
process.exitCode = archiveMigrationMain(process.argv.slice(2), (text) => { process.stdout.write(text); }, (text) => { process.stderr.write(text); });
