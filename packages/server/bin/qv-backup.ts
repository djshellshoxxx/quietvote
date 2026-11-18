#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { backupMain } from '../src/offline-backup.ts';
process.exitCode = await backupMain(process.argv.slice(2), (s) => { process.stdout.write(s); }, (s) => { process.stderr.write(s); });
