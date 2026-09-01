import { readFile } from 'node:fs/promises';

const classroom = await readFile(new URL('../src/features/classroom/ClassroomPage.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles/phase-three.css', import.meta.url), 'utf8');

const requirements = [
  ['inteligencia postclase', classroom.includes('INTELIGENCIA POSTCLASE')],
  ['análisis por reactivo', classroom.includes('questionInsights') && classroom.includes('REACTIVOS DIFÍCILES')],
  ['seguimiento de alumnos', classroom.includes('studentInsights') && classroom.includes('SEGUIMIENTO SUGERIDO')],
  ['exportación CSV', classroom.includes('downloadSessionSummary')],
  ['estilos responsive', styles.includes('.postclass-hero') && styles.includes('.insight-list')],
];

const missing = requirements.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error(`Postclass Intelligence incompleto: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Postclass Intelligence: OK');
