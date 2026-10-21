// Crockford base32 (no I L O U) used for Election ID, ballot codes and the paper recovery code (QV-10 §9/§10.2, QV-19 §5.3).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Encodes `bytes` MSB-first; the final symbol is zero-padded. Optionally truncated to `bits` bits. */
export function crockfordEncode(bytes: Uint8Array, bits: number = bytes.length * 8): string {
  if (bits < 0 || bits > bytes.length * 8) throw new RangeError('bits out of range');
  let out = '';
  let acc = 0;
  let nacc = 0;
  let used = 0;
  for (const b of bytes) {
    for (let i = 7; i >= 0 && used < bits; i--, used++) {
      acc = (acc << 1) | ((b >> i) & 1);
      nacc++;
      if (nacc === 5) {
        out += ALPHABET[acc]!;
        acc = 0;
        nacc = 0;
      }
    }
  }
  if (nacc > 0) out += ALPHABET[acc << (5 - nacc)]!;
  return out;
}

/** Normalises user input: strips separators, upper-cases, maps O->0 and I/L->1 (Crockford). Returns undefined on bad symbols. */
export function crockfordNormalize(s: string): string | undefined {
  let out = '';
  for (const ch of s.toUpperCase()) {
    if (ch === '-' || ch === ' ' || ch === ' ' || ch === '_') continue;
    const c = ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch;
    if (!ALPHABET.includes(c)) return undefined;
    out += c;
  }
  return out;
}

/** Decodes `symbols` into `byteLen` bytes. Trailing padding bits must be zero. */
export function crockfordDecode(symbols: string, byteLen: number): Uint8Array | undefined {
  const s = crockfordNormalize(symbols);
  if (s === undefined) return undefined;
  if (s.length !== Math.ceil((byteLen * 8) / 5)) return undefined;
  const out = new Uint8Array(byteLen);
  let bitPos = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    for (let i = 4; i >= 0; i--, bitPos++) {
      const bit = (v >> i) & 1;
      if (bitPos < byteLen * 8) out[bitPos >> 3]! |= bit << (7 - (bitPos & 7));
      else if (bit !== 0) return undefined;
    }
  }
  return out;
}

export function groupSymbols(s: string, size = 4): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts.join('-');
}

/** Election ID = Crockford(first 100 bits of H(manifest)), 4x5 grouped (QV-10 §9). */
export function electionIdOf(manifestHash: Uint8Array): string {
  return groupSymbols(crockfordEncode(manifestHash, 100));
}

/** Ballot code display (QV-10 §10.2): 256 bits -> 52 symbols in groups of 4. `short` shows the first 28 symbols (7 groups, 140 bits >= the 130-bit minimum). */
export function ballotCodeDisplay(code: Uint8Array, short = false): string {
  const full = crockfordEncode(code);
  return groupSymbols(short ? full.slice(0, 28) : full);
}

/** True when two Election ID strings denote the same ID (separator/case/confusable tolerant). */
export function sameElectionId(a: string, b: string): boolean {
  const x = crockfordNormalize(a);
  const y = crockfordNormalize(b);
  return x !== undefined && y !== undefined && x.length === 20 && x === y;
}

/** NATO-style spoken form for the "read aloud slowly" disclosure (C-CODE). English only; localized alphabets are a catalog concern. */
const SPOKEN: Record<string, string> = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', J: 'Juliett', K: 'Kilo',
  M: 'Mike', N: 'November', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
};
export function spokenForm(code: string): string {
  return [...code].filter((c) => c !== '-').map((c) => SPOKEN[c] ?? c).join(' ');
}
