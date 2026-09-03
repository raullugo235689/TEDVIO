#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const migrationsDirectory = path.join(repositoryRoot, 'supabase', 'migrations');
const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/backup-recovery-readiness.yml'), 'utf8');
const restoreWorkflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/isolated-restore-drill.yml'), 'utf8');
const localConfig = fs.readFileSync(path.join(repositoryRoot, 'supabase/config.toml'), 'utf8');
const restoreContract = fs.readFileSync(path.join(repositoryRoot, 'supabase/tests/recovery_contract.sql'), 'utf8');
const runbook = fs.readFileSync(path.join(repositoryRoot, 'docs/backup-recovery-runbook.md'), 'utf8');
const remoteInventory = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'supabase/recovery/production-migration-inventory.json'), 'utf8'));
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
const migrationKeys = new Set(migrationFiles.map((file) => file.replace(/\.sql$/, '')));
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
must(remoteInventory.project_ref === 'ggjknixnrjzkzkpwbwsl', 'el inventario corresponde al proyecto productivo TEDVIO');
must(remoteInventory.migrations.length >= 100, 'el inventario conserva el ledger productivo completo conocido');
must(new Set(remoteInventory.migrations.map(({ version }) => version)).size === remoteInventory.migrations.length, 'el ledger remoto no contiene versiones duplicadas');
const foundationalLedger = remoteInventory.migrations.filter(({ version }) => version < '20260828134154');
must(foundationalLedger.length === 67, 'el inventario identifica las 67 migraciones fundacionales recuperadas');
for (const { version, name } of foundationalLedger) {
  must(migrationKeys.has(`${version}_${name}`), `GitHub conserva la migración fundacional ${version}_${name}`);
}
must(!migrationText.includes("digest('TEDVIO2026'"), 'el esquema recuperado no conserva el código estático de demostración');
must(migrationText.includes('Recovery baseline intentionally omits the historical static demo access-code seed.'), 'la omisión del acceso histórico queda documentada');

must(workflow.includes('permissions:\n  contents: read'), 'el control de continuidad usa permisos de solo lectura');
must(workflow.includes('backup-recovery-check.mjs'), 'CI ejecuta el contrato de recuperación');
must(workflow.includes('schedule:') && workflow.includes('cron:'), 'CI revisa mensualmente la preparación de recuperación');
must(!/SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD)\s*[:=]\s*[^$\n]/.test(workflow), 'el workflow no contiene credenciales de Supabase');
must(!/restore_project|restore-pitr|drop\s+(?:database|schema)/i.test(workflow), 'la automatización nunca restaura ni elimina producción');
must(restoreWorkflow.includes('supabase db reset --local'), 'CI reconstruye la base local desde cero');
must(restoreWorkflow.includes('supabase/tests/recovery_contract.sql'), 'CI valida el contrato SQL del esquema restaurado');
must(restoreWorkflow.includes('permissions:\n  contents: read'), 'el simulacro aislado usa permisos de solo lectura');
must(restoreWorkflow.includes('supabase stop --no-backup'), 'CI destruye el entorno local al terminar');
must(!/SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|SERVICE_ROLE_KEY)/.test(restoreWorkflow), 'el simulacro no requiere secretos de producción');
must(!restoreWorkflow.includes(remoteInventory.project_ref), 'el simulacro no referencia el proyecto productivo');
must(localConfig.includes('project_id = "tedvio-recovery-drill"'), 'la configuración local usa una identidad no productiva');
must(!localConfig.includes(remoteInventory.project_ref), 'la configuración local no puede enlazarse a producción');
must(restoreContract.includes('supabase_migrations.schema_migrations'), 'el contrato comprueba que las migraciones fueron aplicadas');
must(restoreContract.includes('relrowsecurity'), 'el contrato comprueba RLS en tablas académicas críticas');
must(restoreContract.includes('supabase_realtime'), 'el contrato comprueba la publicación Realtime');
must(restoreContract.includes('active static teacher access code'), 'el contrato impide códigos docentes estáticos activos');

must(runbook.includes('RPO') && runbook.includes('RTO'), 'el runbook define objetivos de pérdida y recuperación');
must(runbook.includes('entorno aislado') && runbook.includes('Nunca restaurar sobre producción'), 'el simulacro exige un destino aislado');
must(runbook.includes('Storage') && runbook.includes('no incluye'), 'el alcance distingue base de datos y objetos de Storage');
must(runbook.includes('auth.users') && runbook.includes('Realtime'), 'la lista de verificación cubre identidad y sesiones en vivo');
must(runbook.includes('Evidencia mínima'), 'el procedimiento exige evidencia auditable');
must(runbook.includes('67 migraciones fundacionales') && runbook.includes('111 entradas'), 'el runbook registra la reconciliación del ledger productivo');
must(runbook.includes('Restore schema from zero') && runbook.includes('plan Free'), 'el runbook documenta el simulacro local gratuito');

if (failures.length) {
  console.error(`\n${failures.length} control(es) de recuperación fallaron.`);
  process.exit(1);
}

console.log(`\nTEDVIO Backup & Recovery contract passed (${migrationFiles.length} migrations).`);
