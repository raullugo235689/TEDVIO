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
const pilot=read('beta-pilot-ready-v1.js');
const pilotCss=read('beta-pilot-ready-v1.css');
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

for(const html of [teacher,beta]){
  must(html.includes('v=55'),'pilot shell is cache-busted to v55');
  must(html.includes('tedvio-premium-v54.css?v=55'),'premium design system remains active in v55');
  must(html.includes('beta-pilot-ready-v1.css?v=55'),'Pilot Ready visual layer is loaded');
  must(html.includes('beta-pilot-ready-v1.js?v=55'),'Pilot Ready runtime is loaded');
  must(html.includes('beta-groups-core-v3.js'),'canonical groups core is loaded');
  must(html.includes('beta-group-center-v2.js'),'Group Center v2 is loaded');
  must(html.includes('beta-attendance-pro-v1.js'),'Attendance Pro is loaded');
  must(html.includes('beta-stability.js'),'secure join guard is loaded');
  must(html.includes('beta-student-live-v1.js'),'student reveal runtime is loaded');
  must(html.includes('beta-paper-exams-v2.js'),'OMR v2 is loaded');
  for(const dead of ['beta-groups-attendance.js','beta-groups-cascade-v1.js','beta-attendance-date-v1.js','beta-attendance-fast-v1.js','beta-attendance-save-v1.js','beta-paper-exams-v1.js','beta-qr-attendance-v3.js','beta-group-center-v1.js']) must(!html.includes(dead),`${dead} is not loaded`);
}

must(root.includes("location.replace('/teacher')")&&!root.includes('app.js'),'legacy root is quarantined and routes to stable teacher');
must(groups.includes('attendance_session_id:attSession.id'),'manual attendance saves with the active attendance session id');
must(!groups.includes("select('attendance_session_id').eq('student_id'"),'manual attendance never infers session id from a student record');
must(groups.includes('v2_universities')&&groups.includes('v2_programs')&&groups.includes('v2_groups'),'groups use canonical academic hierarchy');

must(attendance.includes("v2_attendance_pro_open")&&attendance.includes("v2_attendance_pro_action"),'Attendance Pro uses server lifecycle RPCs');
must(attendance.includes("v2_issue_attendance_qr"),'Attendance Pro uses server-issued QR tokens');
must(attendance.includes("tvAttExportExcel")&&attendance.includes("tvAttExportPdf"),'Attendance Pro exports Excel and PDF');
must(attendance.includes("['present','Asistió'],['late','Retardo'],['absent','Falta'],['justified','Justificado']"),'Attendance Pro supports all four correction states');

must(checkin.includes('attendance-checkin-v2.js?v=55'),'student attendance page uses v55 check-in runtime');
must(checkin.includes('attendance-premium-v54.css?v=55'),'student attendance page keeps premium polish');
must(!checkin.includes('attendance-checkin-v1.js'),'student attendance page does not load legacy check-in runtime');

must(projection.includes("v2_public_session_people"),'projection uses display-safe public people RPC');
must(!projection.includes("from('v2_participants')"),'projection does not read participant rows directly');
must(projectionHtml.includes('proyectar-v2.js?v=55'),'projection shell loads v55 runtime');
must(projectionHtml.includes('projection-premium-v54.css?v=55'),'projection premium layer remains active');
must(controlHtml.includes('control-premium-v54.css?v=55'),'mobile control premium layer remains active');

must(studentLive.includes('v2_public_question_results'),'student reveal uses aggregate public results');
must(studentLive.includes('v2_student_answer_feedback'),'student explanation is fetched through reveal-gated RPC');
must(studentLive.includes('setInterval(tick,800)'),'student result polling is throttled to 800 ms');
must(!studentLive.includes('setInterval(tick,180)'),'obsolete 180 ms result polling is gone');

must(stability.includes("v2_join_session_v3"),'join guard uses canonical secure join RPC');
must(stability.includes('stopImmediatePropagation'),'legacy direct join handler is intercepted');

must(config.includes('SUPABASE_PUBLISHABLE_KEY'),'frontend contains only a publishable Supabase key');
must(!/service_role|secret[_-]?key|SUPABASE_SERVICE/i.test(config),'frontend config contains no service-role/secret key');

must(premium.includes('Teacher login')&&premium.includes('.b-student')&&premium.includes('#tvAttPro')&&premium.includes('#peOverlay')&&premium.includes('#tvAdminOverlay'),'premium design system covers core product surfaces without targeting teacher login');
must(pilot.includes("v2_teacher_today_dashboard"),'Pilot Ready dashboard uses server aggregate RPC');
must(pilot.includes("tedvio_client_events"),'Pilot Ready telemetry writes authenticated client events');
must(pilot.includes('network_offline')&&pilot.includes('unhandled_rejection'),'Pilot Ready monitors connectivity and runtime errors');
must(pilot.includes('tvPilotAttendance')&&pilot.includes('tvPilotOpenGroup'),'Today dashboard exposes direct classroom actions');
must(pilotCss.includes('.tv55-today')&&pilotCss.includes('@media(pointer:coarse)'),'Pilot Ready CSS covers dashboard and touch devices');
must(projectionPremium.includes('.pj-question')&&projectionPremium.includes('.pj-ranking'),'projection premium covers question and ranking surfaces');
must(attendancePremium.includes('.done-icon')&&attendancePremium.includes('.card'),'attendance premium covers registration and success states');
must(controlPremium.includes('.ct-card')&&controlPremium.includes('.ct-btn'),'mobile control premium covers cards and controls');

must(manifest.start_url==='/teacher','PWA starts on the stable teacher route');
must(sw.includes("tedvio-pilot-v55-20260825"),'service worker uses the v55 pilot cache namespace');
must(sw.includes("cache:'no-store'"),'service worker uses network-first no-store for app shell files');

must(version.channel==='pilot-ready','version is marked pilot-ready');
must(String(version.version).endsWith('.55'),'Pilot Ready version is v55');

if(failed){console.error(`\n${failed} audit check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v55 Pilot Ready static audit passed.');