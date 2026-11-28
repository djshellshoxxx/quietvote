// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Io } from './io.ts';
import { installedProgram, runInstalledCommand, type InstalledCommand, type InstalledProgram } from './installed-command.ts';

const TRUSTEE: InstalledCommand = {
  binary: 'qv-trustee', packageName: '@quietvote/trustee',
  unavailable: 'qv: cannot start qv-trustee; install the offline trustee command on PATH (Windows: native executable or standard npm installation).\n',
};

export function trusteeProgram(directories: readonly string[], platform: NodeJS.Platform = process.platform): InstalledProgram | undefined {
  return installedProgram(TRUSTEE, directories, platform);
}

/** QV-ADR-027 N-39c: separate offline process, native streams, no trustee import. */
export async function cmdTrustee(argv: string[], io: Io): Promise<number> {
  return runInstalledCommand(TRUSTEE, argv, io);
}
