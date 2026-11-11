import { FailError, InputError, UsageError } from './args.ts';
import { cmdBallotAudit, cmdBallotEncrypt } from './cmd-ballot.ts';
import { cmdBoardVerify } from './cmd-board.ts';
import { cmdElectionInspect } from './cmd-election.ts';
import { cmdElectionSpoilCollect } from './cmd-spoil.ts';
import { cmdKeygen } from './cmd-keygen.ts';
import { cmdSelftest, cmdVerify } from './cmd-verify.ts';
import { cmdVectorsCheck } from './cmd-vectors.ts';
import { EXIT, type Io } from './io.ts';

export const VERSION = '0.1.0';

export const HELP = `qv ${VERSION}: QuietVote command line (offline-friendly, no dependencies)

usage:
  qv --version                     print the version
  qv verify <bundle> [--json] [--skip-selftest] [--manifest-hash <hex>]
                                   verify an election bundle (V1..V14); runs the canary self-test first
  qv selftest [--json]             run only the canary self-test
  qv keygen --out <file> [--seed-file <f> | --seed-stdin] [--passphrase-file <f> | --passphrase-stdin]
            [--no-passphrase] [--kdf-memory-kib <n>] [--kdf-iterations <n>] [--force] [--json]
                                   create a voter key; seed and passphrase never come from argv; the key file is
                                   passphrase-protected (QVKEY1, Argon2id) unless --no-passphrase
                                   keep the exact passphrase spelling; web-generated words use lower-case and single spaces
  qv ballot encrypt --election <bundle> --key <keyfile> [--manifest-hash <hex>] [--select contest=opt[,opt]]... --out <file>
                    [--intent cast|spoil] [--supersedes <hex>] [--audit-out <file>] [--publish-reveal]
                    [--passphrase-file <f> | --passphrase-stdin] [--json]
  qv ballot audit --election <bundle> --ballot <audit-file|envelope> [--manifest-hash <hex>] [--json]
  qv board verify <board-bundle|election-bundle> [--log-key <hex>] [--manifest-hash <hex>] [--author-key <hex>]...
                    [--witness-policy <file>] [--pin-file <f>] [--json]
                                   --witness-policy applies only to standalone board bundles
  qv election inspect <bundle> [--json]
  qv election spoil-collect --election <bundle> --code <hex> --packet <file> [--packet <file>]... [--manifest-hash <hex>]
                    [--post-body-out <dir>] [--json]
                                   combine trustee spoil-share packets for one trustees-mode spoil and decode its selections;
                                   exit 1 if fewer than t shares verify or the code is cast/re-wrapped/not a trustees-mode spoil
  qv vectors check [dir] [--strict] [--json]

exit codes: 0 ok / PASS, 1 verification or conformance failure, 2 usage error, 3 INCOMPLETE or PARTIAL (nothing failed,
but something could not be checked: that is not a pass), 4 unreadable or malformed input, 70 internal error.
`;

type Cmd = (argv: string[], io: Io) => Promise<number>;
const TABLE: Record<string, Cmd | Record<string, Cmd>> = {
  verify: cmdVerify,
  selftest: cmdSelftest,
  keygen: cmdKeygen,
  ballot: { encrypt: cmdBallotEncrypt, audit: cmdBallotAudit },
  board: { verify: cmdBoardVerify },
  election: { inspect: cmdElectionInspect, 'spoil-collect': cmdElectionSpoilCollect },
  vectors: { check: cmdVectorsCheck },
};

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const [a, ...rest] = argv;
    if (a === undefined || a === 'help' || a === '--help') {
      (a === undefined ? io.err : io.out).call(io, HELP);
      return a === undefined ? EXIT.usage : EXIT.ok;
    }
    if (a === '--version' || a === 'version') {
      io.out(`qv ${VERSION}\n`);
      return EXIT.ok;
    }
    const entry = Object.hasOwn(TABLE, a) ? TABLE[a] : undefined;
    if (entry === undefined) throw new UsageError(`unknown command "${a}"`);
    if (typeof entry === 'function') {
      if (rest.includes('--help')) {
        io.out(HELP);
        return EXIT.ok;
      }
      return await entry(rest, io);
    }
    const [sub, ...args] = rest;
    if (sub === undefined) {
      // A missing subcommand is a usage error: the usage text goes to stderr, like the top-level case.
      io.err(HELP);
      return EXIT.usage;
    }
    if (sub === '--help') {
      io.out(HELP);
      return EXIT.ok;
    }
    const fn = Object.hasOwn(entry, sub) ? entry[sub] : undefined;
    if (fn === undefined) throw new UsageError(`unknown command "${a} ${sub}"`);
    if (args.includes('--help')) {
      io.out(HELP);
      return EXIT.ok;
    }
    return await fn(args, io);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`qv: ${e.message}\nrun "qv --help" for usage\n`);
      return EXIT.usage;
    }
    if (e instanceof InputError) {
      io.err(`qv: ${e.message}\n`);
      return EXIT.input;
    }
    if (e instanceof FailError) {
      io.err(`qv: ${e.message}\n`);
      return EXIT.fail;
    }
    io.err(`qv: internal error: ${e instanceof Error ? e.message : 'unknown'}\n`);
    return EXIT.internal;
  }
}
