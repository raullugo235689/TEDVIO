import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const repositoryRoot = path.resolve(root, '../..');
const app = fs.readFileSync(path.join(src, 'app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(src, 'app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8');
const periodsApi = fs.readFileSync(path.join(src, 'core/periods.ts'), 'utf8');
const periodsPage = fs.readFileSync(path.join(src, 'features/periods/PeriodsPage.tsx'), 'utf8');
const reportsApi = fs.readFileSync(path.join(src, 'core/reports.ts'), 'utf8');
const reportsPage = fs.readFileSync(path.join(src, 'features/reports/ReportsPage.tsx'), 'utf8');
const settingsApi = fs.readFileSync(path.join(src, 'core/settings.ts'), 'utf8');
const settingsPage = fs.readFileSync(path.join(src, 'features/settings/SettingsPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles/phase-five.css'), 'utf8');
const migration = fs.readFileSync(path.join(repositoryRoot, 'supabase/migrations/20260831005947_teacher_v2_phase5_close_reports_settings.sql'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(app.includes('path="periods"') && app.includes('path="periods/:groupId"') && app.includes('<PeriodsPage />'), 'Periodos tiene catálogo y grupo en rutas React propias');
must(app.includes('path="reports"') && app.includes('path="reports/:groupId"') && app.includes('<ReportsPage />'), 'Reportes tiene catálogo y grupo en rutas React propias');
must(app.includes('path="settings"') && app.includes('<SettingsPage />'), 'Configuración tiene una ruta React propia');
must(!app.includes('MigrationPage') && !app.includes('module="periods"') && !app.includes('module="reports"') && !app.includes('module="settings"'), 'Fase 5 retira los últimos placeholders heredados');
must(navigation.includes("to: '/periods'") && navigation.includes("to: '/reports'") && !navigation.includes('migrated: false'), 'navegación marca todos los módulos como migrados');
must(main.includes("import './styles/phase-five.css'"), 'Fase 5 carga un único módulo visual');

for (const rpc of ['v2_save_academic_period_v2','v2_create_period_template_v2','v2_delete_academic_period_v2','v2_teacher_academic_period_summary','v2_teacher_close_academic_period','v2_teacher_reopen_academic_period']) {
  must(periodsApi.includes(`rpc('${rpc}'`), `Periodos utiliza ${rpc}`);
}
must(periodsPage.includes('Parcial listo para cerrar') && periodsPage.includes('Reabrir periodo') && periodsPage.includes('Fotografía por alumno'), 'Periodos cubre preparación, cierre, reapertura y snapshot');
must(periodsPage.includes('transition_log') && periodsPage.includes('Historial de transiciones'), 'Periodos expone la trazabilidad de cierre y reapertura');
must(!periodsApi.includes('.delete('), 'Periodos elimina únicamente mediante RPC protegido');

for (const source of ['fetchGradebookDetail','calculateGradebook','attendanceSessions','omrResults','liveSessions','v2_assignments']) {
  must(reportsApi.includes(source), `Reportes reutiliza ${source}`);
}
for (const report of ['group','roster','attendance','grades','evaluations','sessions']) {
  must(reportsApi.includes(`'${report}'`), `Centro incluye reporte ${report}`);
}
must(reportsApi.includes('downloadAcademicReportCsv') && reportsApi.includes('printAcademicReport'), 'Reportes genera CSV e impresión bajo demanda');
must(reportsApi.includes("result.review_status === 'confirmed'") && reportsApi.includes('!result.archived_at'), 'Reportes excluye OMR pendiente o archivado');
must(reportsPage.includes('Vista previa') || reportsPage.includes('report-preview'), 'Reportes ofrece vista previa antes de exportar');

for (const rpc of ['v2_save_teacher_profile_settings','v2_save_group_alert_settings_v2','tedvio_account_center_snapshot_v69','tedvio_accept_legal_v69','tedvio_request_account_deletion_v69','tedvio_cancel_account_deletion_v69','tedvio_update_institution_branding_v6811']) {
  must(settingsApi.includes(`rpc('${rpc}'`), `Configuración utiliza ${rpc}`);
}
must(settingsApi.includes("signOut({ scope: 'others' })") && settingsApi.includes('auth.updateUser'), 'Configuración cubre contraseña y sesiones');
must(settingsApi.includes("functions.invoke('tedvio-account-v69'") && settingsPage.includes('Descargar mis datos'), 'Configuración conserva portabilidad de cuenta');
must(settingsPage.includes('Privacidad') && settingsPage.includes('ELIMINAR') && settingsPage.includes('Umbrales por grupo'), 'Configuración cubre privacidad, baja y reglas académicas');
must(!settingsPage.includes('dangerouslySetInnerHTML') && settingsApi.includes('DOMParser'), 'documentos legales se muestran como texto sin HTML inseguro');

for (const fn of ['v2_save_academic_period_v2','v2_create_period_template_v2','v2_delete_academic_period_v2','v2_save_teacher_profile_settings','v2_save_group_alert_settings_v2']) {
  must(migration.includes(`function public.${fn}`), `migración define ${fn}`);
}
must((migration.match(/security invoker/g) || []).length >= 5, 'RPC nuevos conservan identidad del docente');
must((migration.match(/from anon/g) || []).length >= 7 && migration.includes('grant execute'), 'ejecución anónima está revocada');
must(migration.includes('profiles_self_insert') && migration.includes('v2_group_alert_settings'), 'perfil y umbrales conservan políticas y privilegios mínimos');

must(css.includes('.period-readiness-hero') && css.includes('.report-preview-card') && css.includes('.settings-tabs'), 'Fase 5 contiene estilos de cierre, reportes y configuración');
must(css.includes('@media(max-width:640px)'), 'Fase 5 se adapta a iPhone');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${periodsApi}\n${reportsApi}\n${settingsApi}\n${periodsPage}\n${reportsPage}\n${settingsPage}`), 'Fase 5 no introduce IA generativa ni costo por tokens');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Fase 5 fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO 2.0 Phase 5 architecture check passed.');
