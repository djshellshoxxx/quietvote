# Translating QuietVote

## Source and catalog structure

English is the source catalog in `packages/web/src/i18n/en.ts`. Locale message tables are under `packages/web/src/i18n/catalogs/`. Keep the same message keys when translating, and preserve each English message’s placeholders and ICU structure (including plural and select branches). Do not change the meaning of guarantee-sensitive text as part of an ordinary translation edit.

The current Spanish, French, German, Brazilian Portuguese, and Arabic tables are machine-drafted. They have no human review records and are not offered to voters. A draft catalog is not ready to publish or offer as a language.

## Editing and checking

Edit the locale catalog, not generated copy. To regenerate the English copy reference after an authorized English source-copy change, run from the repository root:

```sh
UPDATE_COPY=1 node --test packages/web/test/copy.test.ts
```

Run the focused catalog and copy checks from the repository root with:

```sh
node --test packages/web/test/i18n-catalogs.test.ts packages/web/test/copy.test.ts
```

The catalog checks validate key coverage, ICU parsing and placeholder/branch shape. The copy check validates the English voter-facing copy rules and keeps the generated copy reference in sync. A passing check does not supply human translation review.
