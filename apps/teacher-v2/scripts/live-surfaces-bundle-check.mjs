import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '../..');
const failures = [];

const must = (condition, message) => {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
};

must(fs.existsSync(path.join(appRoot, 'scripts/clean-live-surface.mjs')), 'la compilación limpia artefactos hashados anteriores');

const surfaces = [
  {
    directory: 'student-v2',
    marker: 'data-tedvio-surface="student-v2-react"',
    runtimeMarker: 'v2_submit_response_v2',
    dynamicMarkers: ['@supabase/supabase-js'],
    publicFiles: ['boot.js', 'legacy-redirect.js'],
  },
  {
    directory: 'projection-v2',
    marker: 'data-tedvio-surface="projection-v2"',
    runtimeMarker: 'v2_public_session_meta',
    dynamicMarkers: ['@supabase/supabase-js', 'qrcode/lib/browser.js'],
    publicFiles: ['legacy-redirect.js'],
  },
];

for (const surface of surfaces) {
  const outputRoot = path.join(repositoryRoot, surface.directory);
  const htmlPath = path.join(outputRoot, 'index.html');
  must(fs.existsSync(htmlPath), `${surface.directory} tiene index compilado`);
  if (!fs.existsSync(htmlPath)) continue;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const manifestPath = path.join(outputRoot, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};
  const manifestEntries = Object.entries(manifest);
  const entry = manifestEntries.find(([, value]) => value.isEntry)?.[1];
  const references = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]);
  const assetReferences = references.filter((reference) =>
    reference.startsWith(`/${surface.directory}/assets/`),
  );
  const jsReferences = assetReferences.filter((reference) => reference.endsWith('.js'));
  const cssReferences = assetReferences.filter((reference) => reference.endsWith('.css'));

  must(html.includes(surface.marker), `${surface.directory} conserva su marcador de superficie`);
  must(!html.includes('.jsx') && !html.includes('esm.sh') && !html.includes('cdnjs.cloudflare.com'), `${surface.directory} sólo carga recursos locales compilados`);
  must(jsReferences.length === 1, `${surface.directory} referencia un único módulo principal hashado`);
  must(cssReferences.length >= 1, `${surface.directory} referencia CSS local hashado`);

  for (const reference of assetReferences) {
    const localPath = path.join(repositoryRoot, reference.replace(/^\//, ''));
    must(fs.existsSync(localPath), `${reference} existe en el artefacto`);
  }

  const runtime = jsReferences
    .map((reference) => fs.readFileSync(path.join(repositoryRoot, reference.replace(/^\//, '')), 'utf8'))
    .join('\n');
  must(runtime.includes(surface.runtimeMarker), `${surface.directory} conserva su contrato Supabase`);
  must(runtime.includes('RECUPERACIÓN SEGURA'), `${surface.directory} incluye recuperación segura de render`);
  must(!runtime.includes('https://esm.sh') && !runtime.includes('cdnjs.cloudflare.com'), `${surface.directory} no descarga runtimes externos`);

  const mainBytes = jsReferences.length
    ? fs.statSync(path.join(repositoryRoot, jsReferences[0].replace(/^\//, ''))).size
    : Number.POSITIVE_INFINITY;
  must(mainBytes <= 260_000, `${surface.directory} mantiene su entrada inicial por debajo de 260 KB`);
  for (const marker of surface.dynamicMarkers) {
    must(
      (entry?.dynamicImports || []).some((source) => source.includes(marker)),
      `${surface.directory} carga ${marker} sólo cuando se necesita`,
    );
  }
  for (const [, output] of manifestEntries) {
    if (!output.file) continue;
    must(fs.existsSync(path.join(outputRoot, output.file)), `${surface.directory}/${output.file} existe en el artefacto`);
  }

  for (const publicFile of surface.publicFiles) {
    must(fs.existsSync(path.join(outputRoot, publicFile)), `${surface.directory}/${publicFile} conserva compatibilidad`);
  }

  must(fs.existsSync(manifestPath), `${surface.directory} tiene manifiesto reproducible`);
}

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de bundles en vivo fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO live surfaces bundle check passed.');
