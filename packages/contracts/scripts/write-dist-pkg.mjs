// Writes the per-format package.json markers into the dual build output so Node
// and bundlers classify each folder correctly, independent of the root package's
// "type": dist/cjs is CommonJS, dist/esm is ES modules. Run after the two tsc
// emits (see the `build` script).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { dir: 'dist/cjs', type: 'commonjs' },
  { dir: 'dist/esm', type: 'module' },
];

for (const { dir, type } of targets) {
  writeFileSync(join(packageRoot, dir, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
}
