// A fixture-owned supplemental author is independent of all transported key metadata.
import { bytesToHex } from '@quietvote/crypto';
import { bundleOf, castBallot, closeElection, kp, publishTally, setup } from '../../../protocol/test/helpers/sim.ts';
import { fixtureWitnesses, witnessedBoard } from './witnessed-board.ts';

export async function supplementalAuthorFixture(quorum = 2) {
  const seed = `supplemental-author-${quorum}`;
  const sim = await setup({ seed, n: 2, t: 2, voters: 3, boundLog: true, witnessQuorum: quorum, witnesses: fixtureWitnesses(seed) });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'], chair: ['ann'] });
  closeElection(sim);
  const author = kp(seed, 'server'), key = bytesToHex(author.publicKey);
  sim.log.push({ seq: ++sim.seq, entry: { body: { type: 'tally-aggregate', proto: sim.manifest.proto } } });
  publishTally(sim, [1, 2]);
  const bundle = bundleOf(sim);
  const board = witnessedBoard(sim, bundle, author) as any;
  board.policy.witness_policy = { quorum, none_acknowledged: quorum === 0, witnesses: fixtureWitnesses(seed).map((w) => ({ name: w.name, alg: 'ed25519', pk_b64: Buffer.from(w.pk, 'hex').toString('base64') })) };
  return { sim, bundle, board, author, key, text: JSON.stringify({ ...bundle, board }), untrustedText: JSON.stringify({ ...bundle, board, server_pk: key, extraAuthorKeys: [key], options: { extraAuthorKeys: [key] } }) };
}
