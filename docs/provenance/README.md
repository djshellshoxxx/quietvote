# Consolidation source provenance

`quietvote-review-20261117.bundle` preserves the original local repair, review and
merge commits for the November 17 consolidation, including their author metadata
and matching DCO sign-offs. It contains the reviewed source through local commit
`f698a7dbc6274acc886060f4f0d43cf9a15faa09` and the three contributing review lanes.
It is a Git source archive, not an application asset or build output.

The shell's Git connection could read this public repository but had no write
credentials. Publication therefore uses the authenticated GitHub connection to
create a commit with the exact same resulting source tree. That API uses its
publisher identity and current timestamp; it cannot preserve local commit IDs.
The published checkpoint keeps the original remote milestone, canonical
integration and historical planning commits as parents. No source branch is
rewritten. The bundle retains local histories without pretending their hashes
are the new publisher's commit IDs or retroactively attesting inherited commits.

To inspect the original local histories in a clone containing the preserved
source branches:

```sh
git bundle verify docs/provenance/quietvote-review-20261117.bundle
git bundle list-heads docs/provenance/quietvote-review-20261117.bundle
git fetch docs/provenance/quietvote-review-20261117.bundle \
  refs/heads/integration/quietvote-reviewed-20261117:refs/remotes/review-archive/consolidation-20261117
```

The verification receipt and PR name the published source and CI separately.
The historical D-100 contribution-provenance gaps remain recorded; preservation
does not certify or repair missing attestations in older source history.

## Excluded W15 source archive

`quietvote-w15-residual-20261117.bundle` preserves the unmerged local port
`e4212219635291a002b68d6b27a9714df23d7df2`. It is evidence and follow-up source,
not active application code. It requires local base `25d26aa`, which is contained
in `quietvote-review-20261117.bundle`. Fetch the main archive as above first,
then inspect this separate branch:

```sh
git bundle verify docs/provenance/quietvote-w15-residual-20261117.bundle
git fetch docs/provenance/quietvote-w15-residual-20261117.bundle \
  HEAD:refs/remotes/review-archive/w15-residual-20261117
```

The [residual receipt](../reports/consolidation-w15-residual-20261117.md) records
the unchanged failing size gate and uncompleted browser qualification.
