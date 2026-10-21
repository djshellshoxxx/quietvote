import { systemRng, type Rng } from '@quietvote/crypto';

export interface Io {
  out(s: string): void;
  err(s: string): void;
  /** Reads all of stdin (used for secrets, which are never accepted via argv: QV-30 S12). */
  stdin(): Promise<Uint8Array>;
  rng: Rng;
  /** Hidden-echo prompt (QV-30 S12). Resolves undefined when not interactive. */
  prompt(label: string): Promise<string | undefined>;
}

export function nodeIo(): Io {
  return {
    out: (s) => void process.stdout.write(s),
    err: (s) => void process.stderr.write(s),
    stdin: async () => {
      const chunks: Uint8Array[] = [];
      for await (const c of process.stdin) chunks.push(c as Uint8Array);
      return Buffer.concat(chunks);
    },
    rng: systemRng,
    prompt: async (label) => {
      const stdin = process.stdin;
      if (!stdin.isTTY) return undefined;
      process.stderr.write(label);
      stdin.setRawMode(true);
      stdin.resume();
      return new Promise<string>((resolve) => {
        let buf = '';
        const onData = (d: Buffer): void => {
          for (const ch of d.toString('utf8')) {
            if (ch === '\r' || ch === '\n' || ch === '\u0004') {
              stdin.setRawMode(false);
              stdin.pause();
              stdin.off('data', onData);
              process.stderr.write('\n');
              resolve(buf);
              return;
            }
            if (ch === '\u0003') {
              stdin.setRawMode(false);
              process.stderr.write('\n');
              process.exit(130);
            }
            if (ch === '\u007f' || ch === '\b') buf = [...buf].slice(0, -1).join('');
            else buf += ch;
          }
        };
        stdin.on('data', onData);
      });
    },
  };
}

export const EXIT = { ok: 0, fail: 1, usage: 2, incomplete: 3, input: 4, internal: 70 } as const;
