// SPDX-License-Identifier: AGPL-3.0-or-later
import { run } from '../../src/main.ts';
import { nodeIo } from '../../src/io.ts';

// Windows needs its real SystemRoot while starting Node itself. Change only the
// already-running CLI's native-helper lookup, then exercise the normal dispatcher.
const [unavailableRoot, ...args] = process.argv.slice(2);
process.env.SystemRoot = unavailableRoot;
process.exitCode = await run(args, nodeIo());
