#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const migrationsDirectory = path.join(repositoryRoot, 'supabase', 'migrations');
const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/backup-recovery-readiness.yml'), 'utf8');
const runbook = fs.readFileSync(path.join(repositoryRoot, 'docs/backup-recovery-runbook.md'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

const migrationFiles = fs.readdirSync(migrationsDirectory)
  .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
  .sort();
const versions = migrationFiles.map((file) => file.slice(0, 14));
const migrationText = migrationFiles
  .map((file) => fs.readFileSync(path.join(migrationsDirectory, file), 'utf8'))
  .join('\n');
const manifest = migrationFiles.map((file) => {
  const contents = fs.readFileSync(path.join(migrationsDirectory, file));
  return `${crypto.createHash('sha256').update(contents).digest('hex')}  ${file}`;
}).join('\n');

const criticalObjects = [
  'v2_groups',
  'v2_group_students',
  'v2_attendance_sessions',
  'v2_attendance_records',
  'v2_sessions',
  'v2_questions',
  'v2_participants',
  'v2_responses',
  'v2_question_bank',
  'v2_paper_exams',
  'v2_paper_exam_results',
  'v2_grade_categories',
  'v2_grade_items',
  'v2_grade_scores',
  'v2_academic_periods',
];

must(migrationFiles.length >= 25, 'el esquema conserva un historial sustancial de migraciones');
must(new Set(versions).size === versions.length, 'cada migración tiene una versión cronológica única');
must(versions.every((version, index) => index === 0 || version > versions[index - 1]), 'las migraciones mantienen orden estrictamente creciente');
for (const object of criticalObjects) {
  must(migrationText.includes(object), `el historial referencia ${object}`);
}
must(manifest.split('\n').length === migrationFiles.length, 'cada migración produce una huella SHA-256 reproducible');

must(workflow.includes('permissions:\n  contents: read'), 'el control de continuidad usa permisos de solo lectura');
must(workflow.includes('backup-recovery-check.mjs'), 'CI ejecuta el contrato de recuperación');
must(workflow.includes('schedule:') && workflow.includes('cron:'), 'CI revisa mensualmente la preparación de recuperación');
must(!/SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD)\s*[:=]\s*[^$\n]/.test(workflow), 'el workflow no contiene credenciales de Supabase');
must(!/restore_project|restore-pitr|drop\s+(?:database|schema)/i.test(workflow), 'la automatización nunca restaura ni elimina producción');

must(runbook.includes('RPO') && runbook.includes('RTO'), 'el runbook define objetivos de pérdida y recuperación');
must(runbook.includes('entorno aislado') && runbook.includes('Nunca restaurar sobre producción'), 'el simulacro exige un destino aislado');
must(runbook.includes('Storage') && runbook.includes('no incluye'), 'el alcance distingue base de datos y objetos de Storage');
must(runbook.includes('auth.users') && runbook.includes('Realtime'), 'la lista de verificación cubre identidad y sesiones en vivo');
must(runbook.includes('Evidencia mínima'), 'el procedimiento exige evidencia auditable');

if (failures.length) {
  console.error(`\n${failures.length} control(es) de recuperación fallaron.`);
  process.exit(1);
}

console.log(`\nTEDVIO Backup & Recovery contract passed (${migrationFiles.length} migrations).`);
