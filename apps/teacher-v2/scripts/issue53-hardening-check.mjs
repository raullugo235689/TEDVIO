import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20260906012707_consolidate_grade_rls_and_observed_indexes.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

for (const table of ['v2_grade_categories', 'v2_grade_items']) {
  must(sql.includes(`drop policy if exists ${table}_owner`), `${table} elimina la política ALL duplicada`);
  for (const action of ['select', 'insert', 'update', 'delete']) {
    must(
      sql.includes(`create policy ${table}_teacher_v2_${action}`),
      `${table} conserva una política explícita para ${action.toUpperCase()}`,
    );
  }
}

must(!/c\.group_id\s*=\s*c\.group_id/i.test(sql), 'la validación de categoría no contiene una comparación tautológica');
must(
  /c\.group_id\s*=\s*v2_grade_items\.group_id/i.test(sql),
  'INSERT y UPDATE validan que categoría e ítem pertenezcan al mismo grupo',
);
must((sql.match(/c\.group_id\s*=\s*v2_grade_items\.group_id/gi) || []).length >= 2, 'la relación cruzada se valida en INSERT y UPDATE');
must((sql.match(/\(select auth\.uid\(\)\)/g) || []).length >= 16, 'las políticas cachean auth.uid() mediante SELECT');

must(!/create\s+(?:unique\s+)?index/i.test(sql), 'la medición no introduce índices especulativos en tablas heredadas o vacías');
must(/active\s+--\s+v2_grade_\* access paths already have covering indexes/i.test(sql), 'la decisión de índices queda documentada en la migración');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) del cierre técnico del issue #53 fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO issue #53 RLS and measured-index hardening check passed.');
