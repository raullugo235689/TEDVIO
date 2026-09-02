import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(new URL('../', import.meta.url).pathname);
const repositoryRoot = path.resolve(appRoot, '../..');
const surface = process.argv[2];
const allowed = new Set(['student-v2', 'projection-v2']);

if (!allowed.has(surface)) {
  throw new Error('Usa student-v2 o projection-v2.');
}

const outputRoot = path.resolve(repositoryRoot, surface);
if (path.dirname(outputRoot) !== repositoryRoot) {
  throw new Error('Directorio de salida inválido.');
}

fs.rmSync(path.join(outputRoot, 'assets'), { recursive: true, force: true });
for (const file of ['index.html', 'manifest.json']) {
  fs.rmSync(path.join(outputRoot, file), { force: true });
}
