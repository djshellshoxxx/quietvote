// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Io } from './io.ts';
import { installedProgram, runInstalledCommand, type InstalledCommand, type InstalledProgram } from './installed-command.ts';

const ARCHIVE: InstalledCommand = {
  binary: 'qv-migrate-archive', packageName: '@quietvote/server',
  unavailable: 'qv: cannot start qv-migrate-archive; install the offline server command on PATH (Windows: native executable or standard npm installation).\n',
};

export function archiveMigrationProgram(directories: readonly string[], platform: NodeJS.Platform = process.platform): InstalledProgram | undefined {
  return installedProgram(ARCHIVE, directories, platform);
}

/** QV-28 §13: delegate to the installed offline maintenance binary without an in-process server dependency. */
export async function cmdMigrateArchive(argv: string[], io: Io): Promise<number> {
  return runInstalledCommand(ARCHIVE, argv, io);
}
