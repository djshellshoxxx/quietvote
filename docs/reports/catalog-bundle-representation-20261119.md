# Lossless catalog bundle representation

The first published consolidation candidate used 204,577 gzip bytes across all
application and sealing-worker JavaScript files against the existing 204,800-byte
budget. Completing organizer timezone input and separate-origin routing requires
additional application code. This change creates room by reducing repeated catalog
data; it does not relax either the aggregate or entry limit.

## Representation change

The English compiled formatter map references the existing source-key dictionary
by index. Each translated catalog also uses that dictionary, with every exact
source message stored beside its precompiled formatting tree. Keeping duplicated
text close together improves compression within each independently loaded chunk.
Plain text requires no formatting tree. Null slots continue to represent missing
translations, rather than silently manufacturing English translations.

All five complete draft catalogs remain emitted. Their messages, metadata and
review gates are unchanged. No unreviewed locale becomes selectable, and the
runtime ICU parser remains absent from the application bundle. The standalone
verifier build does not use this substitution and remains unchanged. CSP, asset
integrity, worker behavior and dependency versions are unchanged.

## Evidence before the additional UI features

On the local production source based on `be098bee`, the resulting build
`8ff1d4c1b86d` uses **200,936 aggregate gzip bytes** and **101,260 entry bytes**.
This saves **3,641 bytes** compared with the first published candidate and leaves
3,864 bytes under the aggregate budget. These are intermediate measurements;
the combined candidate must be measured again after the UI changes.

Fourteen focused checks pass across `precompile.test.ts`,
`app-precompile.test.ts` and `lazy.test.ts`. They execute emitted JavaScript and
compare formatting against the source interpreter for every catalog message,
compare complete tables and review metadata, require byte-identical repeated
builds, preserve missing-key slots, and verify the existing bundle/CSP/integrity
gates. The scoped web TypeScript check passes. No browser pass is inferred from
these build and formatting checks.

This is implementation maintenance supporting the two UI workflows. It is not
counted as an additional product feature or repaired product-defect family.
