/** Supplemental public signing keys must come from an independent, trusted source.
 * This validates input only; the log verifier still enforces each record's author role. */
export function validateExtraAuthorKeys(keys: readonly string[]): string[] {
  if (keys.length > 32 || keys.some((key) => key.length !== 64 || !/^[0-9a-f]{64}$/.test(key))) {
    throw new Error('Use at most 32 public signing keys, each with 64 lower-case hexadecimal digits.');
  }
  return [...new Set(keys)];
}
