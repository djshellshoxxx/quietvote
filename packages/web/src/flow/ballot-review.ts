// Review uses the same method bounds as the validated suite-v1 manifest, never the number of winners.
import type { Manifest } from '@quietvote/protocol';

export function maximumSelections(contest: Manifest['contests'][number]): number {
  if (contest.method === 'approval') return contest.options.length;
  if (contest.method === 'k-of-n') return contest.selection_limit!;
  return 1; // yes-no and single-choice
}
