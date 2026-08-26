import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const beta=read('beta.html');
const root=read('index.html');
const groups=read('beta-groups-core-v3.js');
const attendance=read('beta-attendance-pro-v1.js');
const checkin=read('asistencia.html');
const projection=read('proyectar-v2.js');
const projectionHtml=read('proyectar.html');
const controlHtml=read('control.html');
const premium=read('tedvio-premium-v54.css');
const pilot56=read('beta-pilot-ready-v1.js');
const pilotCss=read('beta-pilot-ready-v1.css');
const executive56=read('beta-executive-v56.css');
const smart57=read('beta-pilot-ready-v57.js');
const smartCss57=read('beta-smart-dashboard-v57.css');
const projectionPremium=read('projection-premium-v54.css');
const attendancePremium=read('attendance-premium-v54.css');
const controlPremium=read('control-premium-v54.css');
const studentLive=read('beta-student-live-v1.js');
const stability=read('beta-stability.js');
const config=read('config.js');
const sw=read('sw.js');
const manifest=JSON.parse(read('manifest.webmanifest'));
const version=JSON.parse(read('version.json'));

let failed=0;
function must(ok,msg){if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}}

must(teacher.includes('beta-pilot-ready-v57.js?v=57'),'teacher uses isolated v57 smart dashboard runtime');
must(teacher.includes('beta-smart-dashboard-v57.css?v=57'),'teacher loads v57 smart visual override last');
must(teacher.includes('beta-executive-v56.css?v=56'),'teacher keeps audited v56 executive visual base');
must(teacher.includes('beta-pilot-ready-v1.css?v=56'),'teacher keeps audited Pilot Ready base CSS');
must(!teacher.includes('beta-pilot-ready-v1.js?v=56'),'teacher does not run v56 and v57 dashboard controllers together');
must(beta.includes('beta-pilot-ready-v1.js?v=56'),'beta fallback remains on stable v56 runtime');
must(beta.includes('beta-executive-v56.css?v=56'),'beta fallback remains on stable v56 visual layer');

for(const html of [teacher,beta]){
  must(html.includes('tedvio-premium-v54.css?v=56'),'premium design system remains active');
  must(html.includes('beta-groups-core-v3.js'),'canonical groups core is loaded');
  must(html.includes('beta-group-center-v2.js'),'Group Center v2 is loaded');
  must(html.includes('beta-attendance-pro-v1.js'),'Attendance Pro is loaded');
  must(html.includes('beta-stability.js'),'secure join guard is loaded');
  must(html.includes('beta-student-live-v1.js'),'student reveal runtime is loaded');
  must(html.includes('beta-paper-exams-v2.js'),'OMR v2 is loaded');
  for(const dead of ['beta-groups-attendance.js','beta-groups-cascade-v1.js','beta-attendance-date-v1.js','beta-attendance-fast-v1.js','beta-attendance-save-v1.js','beta-paper-exams-v1.js','beta-qr-attendance-v3.js','beta-group-center-v1.js']) must(!html.includes(dead),`${dead} is not loaded`);
}

must(root.includes("location.replace('/teacher')")&&!root.includes('app.js'),'legacy root remains quarantined and routes to teacher');
must(groups.includes('attendance_session_id:attSession.id'),'manual attendance saves with active attendance session id');
must(!groups.includes("select('attendance_session_id').eq('student_id'"),'manual attendance never infers session id from student record');
must(groups.includes('v2_universities')&&groups.includes('v2_programs')&&groups.includes('v2_groups'),'groups use canonical academic hierarchy');

must(attendance.includes("v2_attendance_pro_open")&&attendance.includes("v2_attendance_pro_action"),'Attendance Pro uses server lifecycle RPCs');
must(attendance.includes("v2_issue_attendance_qr"),'Attendance Pro uses server-issued QR tokens');
must(attendance.includes("tvAttExportExcel")&&attendance.includes("tvAttExportPdf"),'Attendance Pro exports Excel and PDF');
must(attendance.includes("['present','Asistió'],['late','Retardo'],['absent','Falta'],['justified','Justificado']"),'Attendance Pro supports all four correction states');

must(checkin.includes('attendance-checkin-v2.js?v=55'),'student attendance page remains on audited v55 runtime');
must(checkin.includes('attendance-premium-v54.css?v=55'),'student attendance page keeps premium polish');
must(!checkin.includes('attendance-checkin-v1.js'),'student attendance page does not load legacy check-in runtime');

must(projection.includes("v2_public_session_people"),'projection uses display-safe public people RPC');
must(!projection.includes("from('v2_participants')"),'projection does not read participant rows directly');
must(projectionHtml.includes('proyectar-v2.js?v=55'),'projection shell remains on audited v55 runtime');
must(projectionHtml.includes('projection-premium-v54.css?v=55'),'projection premium layer remains active');
must(controlHtml.includes('control-premium-v54.css?v=55'),'mobile control premium layer remains active');

must(studentLive.includes('v2_public_question_results'),'student reveal uses aggregate public results');
must(studentLive.includes('v2_student_answer_feedback'),'student explanation uses reveal-gated RPC');
must(studentLive.includes('setInterval(tick,800)'),'student result polling remains throttled to 800 ms');
must(!studentLive.includes('setInterval(tick,180)'),'obsolete 180 ms polling remains absent');
must(stability.includes("v2_join_session_v3"),'join guard uses canonical secure join RPC');
must(stability.includes('stopImmediatePropagation'),'legacy direct join handler remains intercepted');

must(config.includes('SUPABASE_PUBLISHABLE_KEY'),'frontend contains only a publishable Supabase key');
must(!/service_role|secret[_-]?key|SUPABASE_SERVICE/i.test(config),'frontend config contains no service-role/secret key');
must(premium.includes('Teacher login')&&premium.includes('.b-student')&&premium.includes('#tvAttPro')&&premium.includes('#peOverlay')&&premium.includes('#tvAdminOverlay'),'premium design system still covers core product surfaces');

must(pilot56.includes("v2_teacher_today_dashboard")&&pilot56.includes('tedvio_client_events'),'v56 rollback runtime remains preserved');
must(smart57.includes("const VERSION='2026.08.25.57'"),'v57 runtime reports correct telemetry version');
must(smart57.includes("v2_teacher_today_dashboard"),'v57 dashboard still uses server aggregate RPC');
must(smart57.includes('tedvio_client_events')&&smart57.includes('network_offline')&&smart57.includes('unhandled_rejection'),'v57 keeps telemetry, connectivity and error monitoring');
must(smart57.includes('Sin lista hoy')&&smart57.includes('lista histórica'),'v57 distinguishes today status from historical attendance');
must(smart57.includes('Última asistencia'),'v57 labels historical attendance explicitly');
must(smart57.includes('tvPilotOpenGrades')&&smart57.includes('tvPilotOpenExamForGroup'),'v57 preparation steps route to grades and OMR');
must(smart57.includes('Todo listo para tu jornada')&&smart57.includes('Sin alumnos'),'v57 exposes ready state and clear empty-group state');
const p1=smart57.indexOf('populated.find(isAttendanceLive)'),p2=smart57.indexOf('populated.find(g=>!hasTodayList(g))'),p3=smart57.indexOf('populated.find(needsEvaluation)');
must(p1>=0&&p2>p1&&p3>p2,'v57 smart action priority is live attendance → no list today → pending evaluation');
must(smartCss57.includes('.tv57-hero')&&smartCss57.includes('repeat(3,minmax(0,1fr))')&&smartCss57.includes('.tv57-checks>button')&&smartCss57.includes('.tv57-ready'),'v57 CSS covers compact hero, 3-column groups, clickable preparation and ready state');
must(pilotCss.includes('.tv55-today')&&pilotCss.includes('@media(pointer:coarse)'),'Pilot base CSS still covers dashboard and touch devices');
must(executive56.includes('.tv56-hero')&&executive56.includes('.tv56-next')&&executive56.includes('.tv56-group-line')&&executive56.includes('.tv56-prep'),'v56 executive CSS remains available as rollback/base layer');
must(projectionPremium.includes('.pj-question')&&projectionPremium.includes('.pj-ranking'),'projection premium covers question and ranking surfaces');
must(attendancePremium.includes('.done-icon')&&attendancePremium.includes('.card'),'attendance premium covers registration and success states');
must(controlPremium.includes('.ct-card')&&controlPremium.includes('.ct-btn'),'mobile control premium covers cards and controls');

must(manifest.start_url==='/teacher','PWA starts on teacher route');
must(sw.includes("tedvio-pilot-v57-20260825"),'service worker uses v57 cache namespace');
must(sw.includes("cache:'no-store'"),'service worker uses network-first no-store for shell files');
must(version.channel==='pilot-ready','version remains pilot-ready');
must(String(version.version).endsWith('.57'),'Smart Dashboard Pilot Ready version is v57');

if(failed){console.error(`\n${failed} audit check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v57 Smart Dashboard Pilot Ready static audit passed.');
