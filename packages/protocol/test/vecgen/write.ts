import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAll } from './generate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'test-vectors', 'v1');
for (const [path, text] of await generateAll()) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}
console.log('vectors written to', root);
