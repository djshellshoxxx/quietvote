# Translating QuietVote

This is a contributor checklist for the current web catalogs. It records the existing tooling and the review work still needed; it does not approve any translation wording or locale style decision. QV-13 §9 describes the intended localization requirements, while T-314 (workflow and per-locale style guides) remains open.

## Before editing

- English in `packages/web/src/i18n/en.ts` is the source catalog. Read each entry’s `description` for its screen context and `sensitivity` (`normal` or `guarantee`). Stable message keys identify the same concept across locales; do not reuse a key for a different meaning.
- Edit only the UI catalog in `packages/web/src/i18n/catalogs/`. Do not put election names, ballot choices, or other election-authored text in UI messages. The catalogs are product copy; election-authored text is outside this translation workflow.
- Translate the entire message while preserving all argument names and ICU structure. Keep `plural`, `select`, ordinal cases, exact-number cases, offsets, and `other` branches structurally aligned with English. Do not concatenate sentence fragments or replace plural handling with forms such as “(s)”.
- Preserve formatting arguments and their meaning. The formatter supports number, date, time, and list arguments; localized display formatting is distinct from message wording. Do not translate argument names or alter which value an argument represents.
- Check surrounding punctuation and bidirectional text when a message mixes scripts or includes an inserted value. The runtime isolates formatted arguments; a human reviewer still needs to inspect the rendered language and direction, especially Arabic.

## Normal and guarantee-sensitive messages

`normal` messages are ordinary interface copy. The current runtime can fall back to English for a missing normal message. This does not mean a partial locale is ready to offer: the current catalog tests expect complete message tables.

`guarantee` messages include privacy and non-claim text and certain integrity-related messages. Do not change their meaning during translation or routine copy editing. QV-13 §9.6 specifies qualified translation, a second-person review, a third-person back-translation with meaning differences reviewed by the protocol owner, and a review record tied to the source-string hash. At present the five translated locales have no such review records and are not offered to voters. Do not create or imply a review record as part of drafting.

## Contributor and reviewer checklist

For every catalog edit:

- [ ] Preserve the English key set and keep all messages non-empty.
- [ ] Preserve ICU validity, placeholder names, and plural/select structure.
- [ ] Check the translation in context, including punctuation, text expansion, numbers and dates, and mixed-direction arguments where applicable.
- [ ] Have a qualified human reviewer assess naturalness, meaning, terminology, register, and accessibility for the target locale. Automated checks cannot judge these qualities.
- [ ] For guarantee-sensitive messages, complete the stronger QV-13 §9.6 review process before any future offer decision. Keep the locale unoffered until authorized human review and records are complete.

## Locale worksheets: decisions still pending

No locale-specific style choice below is approved. A qualified reviewer and project maintainers must record decisions in a locale style guide as the T-314 work is completed.

| Locale | Current status | Human review worksheet |
|---|---|---|
| `es` | Machine draft; unreviewed; unoffered | Pending: choose and document register, neutral/inclusive wording conventions, glossary decisions, and review evidence. |
| `fr` | Machine draft; unreviewed; unoffered | Pending: choose and document register, inclusive wording conventions, glossary decisions, and review evidence. |
| `de` | Machine draft; unreviewed; unoffered | Pending: choose and document register, inclusive wording conventions, glossary decisions, and review evidence. |
| `pt-BR` | Machine draft; unreviewed; unoffered | Pending: choose and document register, inclusive wording conventions, glossary decisions, and review evidence. |
| `ar` | Machine draft; unreviewed; unoffered | Pending: agree terminology and locale conventions, review plural forms and numeral presentation, inspect RTL and mixed-direction rendering, and document review evidence. |

All five catalog tables currently exist, but their review maps are empty. Do not treat completeness or passing structural tests as native review. T-314 is still open; Arabic also needs a visual RTL review (TODO N-35).

## Checks and generated copy

The ordinary web-app build precompiles the English source table and all five
locale catalogs in `packages/web/src/build/precompile.ts`. The ICU parser runs
while the build loads these tables, so malformed catalog syntax fails the
build. Exact plain-text messages are registered as direct string formatters;
messages with ICU structure are emitted as AST-backed formatter wrappers that
use the existing ICU evaluator. The bundled app runtime looks up those
precompiled formatters and throws if a message was not registered. It does not
parse or evaluate arbitrary message source at runtime, so any runtime-selected
message must come from a table included during the build.

The source/test translator in `packages/web/src/i18n/index.ts` retains its
parse-and-evaluate path. The esbuild precompile plugin is not attached to the
standalone verifier build; that path is excluded from this ordinary app-build
description. This documents the implemented app path, not a claim that every
repository artifact is parser-free or that all of QV-13 REQ-062 is complete.

The bounded extraction/literal check is available from the repository root:

```sh
npm run i18n:check -w @quietvote/web
node packages/web/scripts/i18n-check.ts --json > /tmp/quietvote-i18n-extraction.json
```

The JSON includes source catalog metadata, direct static references, dynamic
references, unknown IDs, literal findings and explicit exclusions. The check
covers `main.ts`, `ui/app.ts`, `ui/dom.ts` and `ui/charts.ts`. It excludes the
restricted `verifyView` block and standalone verifier files. Dynamic references
are reported separately. These exclusions and dynamic references mean this is
partial REQ060/061 coverage; a passing scoped check is not repository-wide
extraction or approval of excluded copy. The web test command runs this check
first.

Edit the locale catalog, not generated copy. To regenerate the English copy reference after an authorized English source-copy change, run from the repository root:

```sh
UPDATE_COPY=1 node --test packages/web/test/copy.test.ts
```

Run the focused catalog and copy checks from the repository root with:

```sh
node --test packages/web/test/i18n-catalogs.test.ts packages/web/test/copy.test.ts
```

The catalog checks cover key coverage, ICU parsing, placeholder and plural/select shape, presence of guarantee strings, and the current offer gate. The copy test checks English voter-facing copy rules and that `packages/web/COPY.md` matches the English catalog. These checks do not establish translation quality, accessibility conformance, or human review.
