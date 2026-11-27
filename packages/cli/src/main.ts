import { FailError, InputError, UsageError } from './args.ts';
import { cmdBallotAudit, cmdBallotEncrypt } from './cmd-ballot.ts';
import { cmdVerifyReceipt } from './cmd-receipt.ts';
import { cmdBoardVerify } from './cmd-board.ts';
import { cmdElectionDraftRecord } from './cmd-lifecycle.ts';
import { cmdElectionPrepare } from './cmd-prepare.ts';
import { cmdElectionSignRecord, cmdElectionExportEntry } from './cmd-packet.ts';
import { cmdElectionInspect } from './cmd-election.ts';
import { cmdElectionSpoilCollect } from './cmd-spoil.ts';
import { cmdKeygen } from './cmd-keygen.ts';
import { cmdSelftest, cmdVerify } from './cmd-verify.ts';
import { cmdVectorsCheck } from './cmd-vectors.ts';
import { cmdPolicyDraftTemplate, cmdPolicyDraftValidate } from './cmd-policy-draft.ts';
import { cmdGovernanceExport, cmdGovernancePrepare, cmdGovernanceSign, cmdGovernanceVerify } from './cmd-governance.ts';
import { EXIT, type Io } from './io.ts';
import { cmdOnlineInvitesCreate, cmdOnlineEnroll, cmdOnlineRegistrationPreview, cmdOnlineElectionTallyDraft, cmdOnlineAdminStatus, cmdOnlineInstance, cmdOnlineElectionCreate, cmdOnlineElectionPinnedRoll, cmdOnlineElectionInspect, cmdOnlineElectionDraft, cmdOnlineElectionSubmit, cmdOnlineReceiptCheck, cmdOnlineElectionExport } from './cmd-online.ts';
import { ONLINE_EXPORTS } from './cmd-online-exports.ts';
import { ONLINE_ORGS } from './cmd-online-org.ts';
import { cmdOnlineBackupCreate } from './cmd-online-backup.ts';
import { cmdElectionCheckTally } from './cmd-tally-check.ts';
import { cmdHealth } from './cmd-health.ts';
import { cmdTrustee } from './cmd-trustee.ts';

export const VERSION = '0.1.0';

export const HELP = `qv ${VERSION}: QuietVote command line (offline verification and online operators)

usage:
  qv --version                     print the version
  qv health <server-origin> [--timeout-ms <1..120000>] [--json]
                                   check service health, database readiness and instance metadata (availability only)
  qv trustee <args...>              run the separate offline qv-trustee command from PATH;
                                   native input/output and trustee exit codes are preserved (help: qv trustee help)
  qv verify <bundle> [--json] [--skip-selftest] [--manifest-hash <hex>] [--content-only] [--extra-author-key <hex>]...
                                   verify an election bundle (V1..V14); runs the canary self-test first
                                   extra author keys: at most 32 independently obtained public signing keys
  qv verify-receipt <receipt.json> --log-key <hex> --origin <origin> --leaf-hash <hex> [--json]
                                   verify signed promise and inclusion against external anchors (no witness/freshness verdict)
  qv selftest [--json]             run only the canary self-test
  qv keygen --out <file> [--seed-file <f> | --seed-stdin] [--passphrase-file <f> | --passphrase-stdin]
            [--no-passphrase] [--kdf-memory-kib <n>] [--kdf-iterations <n>] [--force] [--json]
                                   create a voter key; seed and passphrase never come from argv; the key file is
                                   passphrase-protected (QVKEY1, Argon2id) unless --no-passphrase
                                   shared web/CLI word normalization; old CLI keys still need their original spelling
  qv ballot encrypt --election <bundle> --key <keyfile> [--manifest-hash <hex>] [--select contest=opt[,opt]]... --out <file>
                    [--intent cast|spoil] [--supersedes <hex>] [--audit-out <file>] [--publish-reveal]
                    [--passphrase-file <f> | --passphrase-stdin] [--json]
  qv ballot audit --election <bundle> --ballot <audit-file|envelope> [--manifest-hash <hex>] [--json]
  qv board verify <board-bundle|election-bundle> [--log-key <hex>] [--manifest-hash <hex>] [--author-key <hex>]...
                    [--witness-policy <file>] [--pin-file <f>] [--json]
                                   standalone VERIFIED needs --log-key and --witness-policy from trusted sources
                                   election bundles use their signed manifest policy and refuse --witness-policy
  qv election prepare <archive.qvb> --manifest-hash <hex> --out <file> [--format election|ceremony] [--json]
                                   checks archive, pinned manifest and board before preparing trustee inputs;
                                   accepts regular files up to 64 MiB and 10000 entries; refuses existing outputs
  qv election draft-record <archive.qvb> --manifest-hash <hex> --kind <action> --out <body.json> [--reason <code>] [--json]
                                   phases: dkg-open, dkg-r1-open, dkg-r1-close, dkg-r2-close, dkg-r3-close,
                                   dkg-final, roll-commit, election-open, election-close; controls: pause, resume,
                                   invalidate, security-notice, audit-close, cancel, abort; unsigned, never submitted
  qv election sign-record --manifest <manifest.json> --manifest-hash <hex> --body <body.json> | --record <record.json>
                    --key <keyfile> --out <file> [--election <bundle>] [passphrase options] [--json]
                                   add one coordinator signature; quorum:false means additional signers are needed
                                   controls require --election <archive.qvb> to check their signed control_seq
  qv election export-entry --origin <quietvote/v1/id> --type <board-type> --file <signed-record.json>
                    --key <outer-author-keyfile> --out <packet.json> [passphrase options] [--json]
  qv election inspect <bundle> [--json]
  qv election check-tally <archive.qvb> --manifest-hash <hex> --draft <body.json> [--content-only] [--json]
                                   compare an unsigned tally with a pinned pre-publication snapshot;
                                   MATCH is scoped to that snapshot; publication and freshness remain unchecked
  qv election spoil-collect --election <bundle> --code <hex> --packet <file> [--packet <file>]... [--manifest-hash <hex>]
                    [--post-body-out <dir>] [--json]
                                   combine trustee spoil-share packets for one trustees-mode spoil and decode its selections;
                                   exit 1 if fewer than t shares verify or the code is cast/re-wrapped/not a trustees-mode spoil
  qv online instance --server <origin> [--json]
  qv online admin-status --server <origin> --audience <qv:id@publicUrl> --key <keyfile> [passphrase options] [--json]
  qv online backup-create --server <origin> --scope all|election [--id <election-id>]
                    --audience <qv:id@publicUrl> --key <keyfile> --idempotency-key <key> [passphrase options] [--json]
                                   request a server-local snapshot job; election scope requires --id; inspect with job-inspect
  qv online org-create --server <origin> --audience <qv:id@publicUrl> --key <keyfile>
                    --name <name> --idempotency-key <key> [--registration-token-file <private.txt>] [passphrase options] [--json]
                                   register the supplied key as organization owner; registration tokens never come from argv
  qv online org-inspect --server <origin> --org <id> --audience <qv:id@publicUrl> --key <keyfile> [passphrase options] [--json]
  qv online election-create --server <origin> --audience <qv:id@publicUrl> --key <keyfile>
                    --org <id> --title <title> --access public|link --idempotency-key <key>
                    [--pinned-roll <sorted-keys.json>] [passphrase options] [--json]
  qv online election-pinned-roll --server <origin> --id <id> --pinned-roll <sorted-keys.json>
                    --audience <qv:id@publicUrl> --key <keyfile> --idempotency-key <key> [passphrase options] [--json]
                                   attach the immutable full list matching an existing pinned manifest;
                                   JSON array of distinct, sorted lowercase Ed25519 public keys; never voter secrets
  qv online invites-create --server <origin> --id <id> --count <1..1000> --out <private.json>
                    --audience <qv:id@publicUrl> --key <keyfile> --idempotency-key <key> [passphrase options] [--read-key-file <file>] [--json]
                                   reserves an exclusive private output before issuance; bearer codes never appear in stdout
  qv online enroll --server <origin> --id <id> --key <keyfile> --invite-file <file> [passphrase options] [--read-key-file <file>] [--json]
                                   enroll in a hashed-pop-v1 election; invite tokens never come from argv
  qv online registration-preview --server <origin> --id <id> --audience <qv:id@publicUrl> --key <keyfile> [passphrase options] [--json]
                                   inspect legacy migration status without changing invites or the election
  qv online election-inspect --server <origin> --id <id> [--read-key-file <file>] [--json]
  qv online election-draft --server <origin> --id <id> --file <draft.json>
                    --audience <qv:id@publicUrl> --key <keyfile> [passphrase options] [--json]
  qv online election-tally-draft --server <origin> --id <id> --decrypters <1,2> --out <body.json> [--read-key-file <file>] [--json]
  qv online election-submit --server <origin> --id <id> --file <signed-entry.json> [--log-key <hex>] [--json]
                                   with an independent log-key pin, verify the returned receipt against this packet;
                                   a valid promise without inclusion exits 3; witness, freshness and counting remain unchecked
  qv online receipt-check --server <origin> --id <id> --file <receipt.json> --log-key <hex> --leaf-hash <hex>
                    --tree-size <integer> [--read-key-file <file>] [--json]
                                   verify one requested inclusion snapshot and consistency with any supplied prior checkpoint;
                                   absent signed checkpoint evidence exits 3; saved receipt is never overwritten
  qv online election-export --server <origin> --id <id> --out <file> [--format qvb|json]
                    [--read-key-file <file>] [--json]
  qv online export-create --server <origin> --id <id> --audience <audience> --key <keyfile> --idempotency-key <key>
  qv online job-inspect --server <origin> --job-id <id> --audience <audience> --key <keyfile>
  qv online export-list --server <origin> --id <id> --audience <audience> --key <keyfile>
  qv online export-inspect --server <origin> --id <id> --export-id <id> --audience <audience> --key <keyfile>
  qv online export-download --server <origin> --id <id> --export-id <id> --out <archive.qvb>
                    --audience <audience> --key <keyfile>
  qv online export-acknowledge --server <origin> --id <id> --export-id <id> --file <retained.qvb> --retained
                    --audience <audience> --key <keyfile> --idempotency-key <key>
  qv online export-deletion-notice --server <origin> --id <id> --export-id <id>
                    --tree-size <n> --root-hash <hex> --sha256 <hex> --audience <audience> --key <keyfile> --idempotency-key <key>
                                   recorded exports use signed management requests; passphrase options and --json accepted;
                                   downloads check exact bytes and tree binding, never acknowledge automatically;
                                   acknowledgement confirms retention; notice starts the server's 30-day deletion grace
                                   all online commands accept --timeout-ms (1..120000, default 20000);
                                   server responses and downloaded bundles are not independently verified
  qv vectors check [dir] [--strict] [--json]
  qv policy-draft template foundation|association|collective --out <draft.json> [--json]
  qv policy-draft validate <draft.json> [--json]
                                   unsigned policy planning only; no signatures, group authority or election binding;
                                   collective preserves a source duration conflict and returns exit 1 with a draft to review
  qv governance prepare genesis --policy <draft.json> --identity-key <hex> --steward-key <hex>... --out <body.json>
  qv governance prepare amendment --policy <draft.json> --identity-key <hex> --genesis-hash <hex>
                    --history <history.json> --decision-class rules|entrenched [--steward-key <hex>]... --out <body.json>
  qv governance sign --body <body.json> | --record <partial.json> --identity-key <hex> --genesis-hash <hex>
                    --rules-hash <hex> [--history <history.json>] --key <keyfile> --out <signed.json> [passphrase options]
  qv governance export --record <signed.json>... [--history <history.json>] --identity-key <hex> --genesis-hash <hex> --out <history.json>
  qv governance verify <history.json> --identity-key <hex> --genesis-hash <hex> [--json]
                                   experimental signed-rule history only; all outputs are JSON, never election authorization;
                                   independent pins required; unratified amendments remain INCOMPLETE (exit 3)

exit codes: 0 ok / PASS, 1 verification or conformance failure, 2 usage error, 3 INCOMPLETE or PARTIAL (nothing failed,
but something could not be checked: that is not a pass), 4 unreadable or malformed input, 70 internal error.
`;

type Cmd = (argv: string[], io: Io) => Promise<number>;
const TABLE: Record<string, Cmd | Record<string, Cmd>> = {
  health: cmdHealth,
  verify: cmdVerify,
  'verify-receipt': cmdVerifyReceipt,
  selftest: cmdSelftest,
  keygen: cmdKeygen,
  trustee: cmdTrustee,
  ballot: { encrypt: cmdBallotEncrypt, audit: cmdBallotAudit },
  board: { verify: cmdBoardVerify },
  election: { 'check-tally': cmdElectionCheckTally, 'draft-record': cmdElectionDraftRecord, 'sign-record': cmdElectionSignRecord, 'export-entry': cmdElectionExportEntry, prepare: cmdElectionPrepare, inspect: cmdElectionInspect, 'spoil-collect': cmdElectionSpoilCollect },
  online: { ...ONLINE_ORGS, ...ONLINE_EXPORTS, 'backup-create': cmdOnlineBackupCreate, 'invites-create': cmdOnlineInvitesCreate, enroll: cmdOnlineEnroll, 'registration-preview': cmdOnlineRegistrationPreview, instance: cmdOnlineInstance, 'admin-status': cmdOnlineAdminStatus, 'election-create': cmdOnlineElectionCreate, 'election-pinned-roll': cmdOnlineElectionPinnedRoll, 'election-inspect': cmdOnlineElectionInspect, 'election-draft': cmdOnlineElectionDraft, 'election-tally-draft': cmdOnlineElectionTallyDraft, 'election-submit': cmdOnlineElectionSubmit, 'receipt-check': cmdOnlineReceiptCheck, 'election-export': cmdOnlineElectionExport },
  vectors: { check: cmdVectorsCheck },
  'policy-draft': { template: cmdPolicyDraftTemplate, validate: cmdPolicyDraftValidate },
  governance: { prepare: cmdGovernancePrepare, sign: cmdGovernanceSign, export: cmdGovernanceExport, verify: cmdGovernanceVerify },
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
      if (a !== 'trustee' && rest.includes('--help')) {
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
