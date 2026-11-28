// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline status is a conclusion about one independently pinned, fully checked snapshot.
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { ballotCode, verifyElection, type VerificationReport, type VoterEnvelope } from '@quietvote/protocol';
import { needFlag, needPositional, parseArgs, UsageError } from './args.ts';
import { isHex, pinnedHash, printJson } from './common.ts';
import { prepareElectionArchive } from './cmd-prepare.ts';
import { EXIT, type Io } from './io.ts';
import { hasSnapshotWitness, snapshotEvidenceVerdict, SNAPSHOT_REQUIRED_CHECKS, uninterpretedSnapshotControls } from './snapshot-evidence.ts';

type Status = 'COUNTED' | 'SUPERSEDED' | 'SPOILED' | 'ABSENT' | 'EXCLUDED' | 'UNVERIFIED';
interface BallotRecord { seq: number; code: string; env: VoterEnvelope }

function evidenceVerdict(report: VerificationReport): VerificationReport['verdict'] {
  const verdict = snapshotEvidenceVerdict(report);
  return verdict === 'PASS' && (report.ctx === undefined || report.countedBallots === undefined) ? 'INCOMPLETE' : verdict;
}

/** The full verifier has authenticated all envelopes before this lookup is reachable. */
function classify(records: readonly BallotRecord[], report: VerificationReport, code: string): { status: Status; intent: 'cast' | 'spoil' | null } {
  const ignored = new Set(report.findings.filter((f) => f.cls === 'L' && f.seq !== undefined).map((f) => f.seq));
  const matches = records.filter((record) => record.code === code);
  if (matches.length === 0) return { status: 'ABSENT', intent: null };
  const target = matches.find((record) => !ignored.has(record.seq));
  if (target === undefined) return { status: 'EXCLUDED', intent: matches[0]!.env.intent };
  if (target.env.intent === 'spoil') return { status: 'SPOILED', intent: 'spoil' };
  const final = report.countedBallots!.find((ballot) => ballot.voter === target.env.body.voter);
  if (final?.code === code) return { status: 'COUNTED', intent: 'cast' };

  // A different final code alone does not prove supersession. Walk the authenticated
  // same-voter predecessor chain, strictly backwards in log order. This also bounds it.
  const casts = new Map(records.filter((record) => record.env.intent === 'cast' &&
    record.env.body.voter === target.env.body.voter && !ignored.has(record.seq)).map((record) => [record.code, record]));
  let current = final === undefined ? undefined : casts.get(final.code);
  while (current !== undefined && current.seq > target.seq) {
    const previous = casts.get(current.env.body.supersedes);
    if (previous === undefined || previous.seq >= current.seq) break;
    if (previous.code === code) return { status: 'SUPERSEDED', intent: 'cast' };
    current = previous;
  }
  return { status: 'EXCLUDED', intent: 'cast' };
}

const EXPLANATION: Record<Status, string> = {
  COUNTED: 'This ballot is included in the verified tally in the supplied snapshot.',
  SUPERSEDED: 'A later counted ballot replaces this ballot through its verified revote chain in the supplied snapshot.',
  SPOILED: 'This code belongs to a spoiled test ballot in the supplied snapshot; it is not counted.',
  ABSENT: 'This code is absent from the supplied snapshot. This does not prove that it was never submitted or accepted elsewhere.',
  EXCLUDED: 'This code is recorded but is not counted or proved superseded in the supplied snapshot.',
  UNVERIFIED: 'Required snapshot checks failed or remain incomplete; no ballot status is established.',
};

export async function cmdBallotStatus(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { election: 'value', code: 'value', 'manifest-hash': 'value', json: 'bool' });
  needPositional(p, 0, 'ballot status (options only)');
  const path = needFlag(p, 'election'), code = needFlag(p, 'code'), pin = pinnedHash(p);
  if (!isHex(code, 32)) throw new UsageError('--code must be 64 lower-case hex digits');
  if (pin === undefined) throw new UsageError('ballot status requires an independently obtained --manifest-hash');
  const prepared = prepareElectionArchive(path, pin);
  const { content, board, serverKey, snapshot, notices } = prepared;
  const report = await verifyElection(content, { log: { board, extraAuthorKeys: [serverKey] } });
  let verdict = evidenceVerdict(report);
  const snapshotWitnessed = hasSnapshotWitness(prepared);
  // The verifier reports these authenticated controls but does not interpret their
  // outcome effects. Refuse a status claim without inventing their pending contract.
  const uninterpretedControls = uninterpretedSnapshotControls(notices);
  if (verdict === 'PASS' && (!snapshotWitnessed || uninterpretedControls.length > 0)) verdict = 'INCOMPLETE';
  let status: Status = 'UNVERIFIED';
  let intent: 'cast' | 'spoil' | null = null;
  if (verdict === 'PASS') {
    // Candidate countedBallots is populated before tally verification. Never move this
    // derivation above the complete evidence gate or trust a bundle-provided code list.
    const records: BallotRecord[] = [];
    try {
      const ctx = hexToBytes(report.ctx!, 32);
      for (const { seq, entry } of content.log) {
        if (typeof entry !== 'object' || entry === null || !('intent' in entry)) continue;
        const env = entry as VoterEnvelope;
        records.push({ seq, code: bytesToHex(ballotCode(ctx, env.body)), env });
      }
      ({ status, intent } = classify(records, report, code));
    } catch {
      // An inconsistent verifier/lookup result cannot become an absence or counting claim.
      verdict = 'FAIL';
    }
  }
  const result = {
    format: 'qv-ballot-status/v1', manifest_hash: pin, ballot_code: code, status, intent,
    counted: status === 'UNVERIFIED' ? null : status === 'COUNTED', snapshot,
    verification: { verdict, protocol_verdict: report.verdict, checks: report.checks,
      snapshot_witness: snapshotWitnessed ? 'pass' : 'not_run',
      controls: uninterpretedControls.length === 0 ? 'pass' : 'not_run', uninterpreted_controls: uninterpretedControls,
      findings: report.findings.map(({ code: findingCode, cls, seq }) => ({ code: findingCode, cls, ...(seq === undefined ? {} : { seq }) })) },
    freshnessVerified: false, finalityVerified: false,
    explanation: EXPLANATION[status],
    caveats: [...report.caveats, 'Status applies only to the supplied snapshot; freshness and election finality are not established.',
      'No receipt, checkpoint or election file is changed.', 'QuietVote is unaudited and not for real elections.'],
  };
  if (p.has('json')) printJson(io, result);
  else {
    io.out(`ballot status: ${status}\n${result.explanation}\nmanifest: ${pin}\nballot code: ${code}\n`);
    io.out(`snapshot: ${snapshot.origin}; size ${snapshot.tree_size}; root ${snapshot.root_hash}\n`);
    io.out(`verification: ${verdict}\n`);
    io.out(`snapshot witness quorum: ${result.verification.snapshot_witness}; control interpretation: ${result.verification.controls}\n`);
    for (const id of SNAPSHOT_REQUIRED_CHECKS) if (report.checks[id] !== 'pass') io.out(`${id}: ${report.checks[id]}\n`);
    for (const finding of result.verification.findings) io.out(`${finding.code} (${finding.cls})${finding.seq === undefined ? '' : ` at seq ${finding.seq}`}\n`);
    for (const caveat of result.caveats) io.out(`caveat: ${JSON.stringify(caveat)}\n`);
  }
  if (verdict === 'FAIL') return EXIT.fail;
  if (verdict === 'INCOMPLETE') return EXIT.incomplete;
  return status === 'ABSENT' || status === 'EXCLUDED' ? EXIT.fail : EXIT.ok;
}
