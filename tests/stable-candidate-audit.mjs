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
const control59=read('control-v59.js');
const controlCss59=read('control-v59.css');
const student60=read('student-v60.js');
const studentCss60=read('student-v60.css');
const premium=read('tedvio-premium-v54.css');
const pilot56=read('beta-pilot-ready-v1.js');
const pilotCss=read('beta-pilot-ready-v1.css');
const executive56=read('beta-executive-v56.css');
const smart57=read('beta-pilot-ready-v57.js');
const smartCss57=read('beta-smart-dashboard-v57.css');
const live58=read('live-classroom-v58.js');
const liveCss58=read('live-classroom-v58.css');
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

must(teacher.includes('beta-pilot-ready-v57.js?v=57'),'teacher keeps isolated v57 smart dashboard runtime');
must(teacher.includes('beta-smart-dashboard-v57.css?v=57'),'teacher keeps v57 smart dashboard visual layer');
must(teacher.includes('live-classroom-v58.js?v=58'),'teacher loads isolated v58 Live Classroom runtime');
must(teacher.includes('live-classroom-v58.css?v=58'),'teacher loads v58 Live Classroom visual layer');
must(teacher.includes('student-v60.js?v=60')&&teacher.includes('student-v60.css?v=60'),'teacher shell includes v60 student fallback layer');
must(teacher.includes('beta-executive-v56.css?v=56'),'teacher keeps audited v56 executive visual base');
must(teacher.includes('beta-pilot-ready-v1.css?v=56'),'teacher keeps audited Pilot Ready base CSS');
must(!teacher.includes('beta-pilot-ready-v1.js?v=56'),'teacher does not run v56 and v57 dashboard controllers together');
must(beta.includes('beta-pilot-ready-v1.js?v=56'),'beta fallback remains on stable v56 runtime');
must(beta.includes('beta-executive-v56.css?v=56'),'beta fallback remains on stable v56 visual layer');
must(beta.includes('student-v60.js?v=60')&&beta.includes('student-v60.css?v=60'),'QR/student entry shell loads v60 Student Experience Pro');

for(const html of [teacher,beta]){
  must(html.includes('tedvio-premium-v54.css?v=56'),'premium design system remains active');
  must(html.includes('beta-groups-core-v3.js'),'canonical groups core is loaded');
  must(html.includes('beta-group-center-v2.js'),'Group Center v2 is loaded');
  must(html.includes('beta-attendance-pro-v1.js'),'Attendance Pro is loaded');
  must(html.includes('beta-stability.js'),'secure join guard is loaded');
  must(html.includes('beta-student-live-v1.js'),'legacy student reveal layer remains available for rollback');
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

must(controlHtml.includes('control-v59.js?v=59')&&controlHtml.includes('control-v59.css?v=59'),'mobile control shell uses v59 runtime and styles');
must(controlHtml.includes('control-premium-v54.css?v=55'),'mobile control keeps premium base layer');
must(!controlHtml.includes('control.js?v=55')&&!controlHtml.includes('control-moderation.js'),'legacy control runtimes are not loaded alongside v59');
must(control59.includes("const VERSION='2026.08.25.59'"),'v59 Mobile Classroom reports correct version');
must(control59.includes("from('v2_sessions').select")&&control59.includes("from('v2_participants').select")&&control59.includes("from('v2_questions').select")&&control59.includes("from('v2_responses').select"),'v59 reads canonical live-session state');
must(!control59.includes("from('v2_responses').insert")&&!control59.includes("from('v2_responses').update")&&!control59.includes("from('v2_responses').delete"),'v59 never writes student responses');
must(!control59.includes("from('v2_participants').insert")&&!control59.includes("from('v2_participants').update")&&!control59.includes("from('v2_participants').delete"),'v59 never mutates participants');
must(control59.includes(".eq('teacher_id',state.user.id)")&&control59.includes(".eq('session_id',state.session.id)"),'v59 writes remain teacher/session scoped');
must(control59.includes("if(state.question?.status==='live')await closeCurrent();await launch(id)"),'v59 Next closes active question before launching next');
must(control59.includes('Todos respondieron')&&control59.includes('navigator.vibrate?.')&&control59.includes('Reconectando'),'v59 provides all-answered and connectivity feedback');
must(controlCss59.includes('.mc59-controls')&&controlCss59.includes('.mc59-flow')&&controlCss59.includes('@media(max-width:560px)'),'v59 CSS covers large mobile controls and phone layout');

must(studentLive.includes('v2_public_question_results'),'legacy student reveal uses aggregate public results');
must(studentLive.includes('v2_student_answer_feedback'),'legacy student explanation uses reveal-gated RPC');
must(studentLive.includes('setInterval(tick,800)'),'legacy student result polling remains throttled to 800 ms');
must(!studentLive.includes('setInterval(tick,180)'),'obsolete 180 ms polling remains absent');
must(stability.includes("v2_join_session_v3"),'join guard uses canonical secure join RPC');
must(stability.includes('stopImmediatePropagation'),'legacy direct join handler remains intercepted');

must(student60.includes("const VERSION='2026.08.25.60'"),'v60 Student Experience reports correct version');
must(student60.includes('window.__TEDVIO_STUDENT_INTERVAL__')&&student60.includes('nativeClear(id)'),'v60 takes ownership by cancelling legacy student render polling');
must(student60.includes("select('id,position,prompt,question_type,options,media_url,media_type,timer_seconds,status,launched_at,closed_at')"),'v60 reads display-safe question fields before reveal');
must(!student60.includes("from('v2_questions').select('*')"),'v60 does not request full question rows before reveal');
must(student60.includes("if(S.question?.status==='revealed')await fetchReveal")&&student60.includes("select('correct_answer')"),'v60 only loads correct-answer data through reveal flow');
must(student60.includes("sb.rpc('v2_submit_response'")&&student60.includes('v2_public_question_results')&&student60.includes('v2_student_answer_feedback'),'v60 uses canonical submit and reveal RPCs');
must(!student60.includes("from('v2_sessions').update")&&!student60.includes("from('v2_questions').update")&&!student60.includes("from('v2_participants').delete"),'v60 cannot alter teacher/session/participant state');
must(student60.includes('Tu respuesta quedó guardada. Espera a que el profesor muestre el resultado.'),'v60 hides correctness until professor reveal');
must(student60.includes('hotspot')&&student60.includes('ordering')&&student60.includes('multiple_select'),'v60 supports advanced interactive question types');
must(student60.includes('Sesión finalizada')&&student60.includes('Reconectando'),'v60 covers final and reconnect states');
must(studentCss60.includes('.tv60-question')&&studentCss60.includes('.tv60-state.submitted')&&studentCss60.includes('.tv60-result')&&studentCss60.includes('.tv60-finish'),'v60 CSS covers full student lifecycle');
must(studentCss60.includes('@media(max-width:520px)')&&studentCss60.includes('@media(pointer:coarse)'),'v60 includes phone and touch layouts');

must(config.includes('SUPABASE_PUBLISHABLE_KEY'),'frontend contains only a publishable Supabase key');
must(!/service_role|secret[_-]?key|SUPABASE_SERVICE/i.test(config),'frontend config contains no service-role/secret key');
must(premium.includes('Teacher login')&&premium.includes('.b-student')&&premium.includes('#tvAttPro')&&premium.includes('#peOverlay')&&premium.includes('#tvAdminOverlay'),'premium design system still covers core product surfaces');

must(pilot56.includes("v2_teacher_today_dashboard")&&pilot56.includes('tedvio_client_events'),'v56 rollback runtime remains preserved');
must(smart57.includes("const VERSION='2026.08.25.57'"),'v57 dashboard runtime remains preserved');
must(smart57.includes("v2_teacher_today_dashboard"),'v57 dashboard still uses server aggregate RPC');
must(smart57.includes('Sin lista hoy')&&smart57.includes('lista histórica')&&smart57.includes('Última asistencia'),'v57 keeps smart attendance semantics');
must(smart57.includes('tvPilotOpenGrades')&&smart57.includes('tvPilotOpenExamForGroup'),'v57 preparation steps still route to grades and OMR');
must(smart57.includes('Todo listo para tu jornada')&&smart57.includes('Sin alumnos'),'v57 keeps ready and empty-group states');
const p1=smart57.indexOf('populated.find(isAttendanceLive)'),p2=smart57.indexOf('populated.find(g=>!hasTodayList(g))'),p3=smart57.indexOf('populated.find(needsEvaluation)');
must(p1>=0&&p2>p1&&p3>p2,'v57 smart action priority remains live attendance → no list today → pending evaluation');
must(smartCss57.includes('.tv57-hero')&&smartCss57.includes('repeat(3,minmax(0,1fr))')&&smartCss57.includes('.tv57-ready'),'v57 visual polish remains available');

must(live58.includes("const VERSION='2026.08.25.58'"),'v58 Live Classroom reports correct telemetry version');
must(live58.includes("from('v2_sessions').select")&&live58.includes("from('v2_participants').select")&&live58.includes("from('v2_questions').select")&&live58.includes("from('v2_responses').select"),'v58 reads canonical live-session state');
must(!live58.includes("from('v2_responses').insert")&&!live58.includes("from('v2_responses').update")&&!live58.includes("from('v2_responses').delete"),'v58 never writes student responses');
must(!live58.includes("from('v2_participants').insert")&&!live58.includes("from('v2_participants').update")&&!live58.includes("from('v2_participants').delete"),'v58 never mutates participant records');
must(live58.includes('betaLaunchQuestion')&&live58.includes('betaCloseQuestion')&&live58.includes('betaRevealQuestion')&&live58.includes('betaEndSession'),'v58 delegates state transitions to audited session core');
must(live58.includes('proyectar.html?code=')&&live58.includes('tv58CopyCode'),'v58 lobby exposes projection and code workflow');
must(live58.includes('Respondió')&&live58.includes('Pendientes')&&live58.includes('Ocultar ranking'),'v58 exposes live response completion and ranking control');
must(liveCss58.includes('#tvLive58Root')&&liveCss58.includes('.tv58-lobby')&&liveCss58.includes('.tv58-stage')&&liveCss58.includes('.tv58-toolbar'),'v58 CSS covers lobby, live stage and controls');
must(liveCss58.includes('@media(max-width:900px)')&&liveCss58.includes('@media(max-width:620px)'),'v58 includes iPad/mobile layouts');

must(pilotCss.includes('.tv55-today')&&pilotCss.includes('@media(pointer:coarse)'),'Pilot base CSS still covers dashboard and touch devices');
must(executive56.includes('.tv56-hero')&&executive56.includes('.tv56-next')&&executive56.includes('.tv56-group-line')&&executive56.includes('.tv56-prep'),'v56 executive CSS remains available as rollback/base layer');
must(projectionPremium.includes('.pj-question')&&projectionPremium.includes('.pj-ranking'),'projection premium covers question and ranking surfaces');
must(attendancePremium.includes('.done-icon')&&attendancePremium.includes('.card'),'attendance premium covers registration and success states');
must(controlPremium.includes('.ct-card')&&controlPremium.includes('.ct-btn'),'legacy mobile control premium base remains available for rollback');

must(manifest.start_url==='/teacher','PWA starts on teacher route');
must(sw.includes("tedvio-pilot-v60-20260825"),'service worker uses v60 cache namespace');
must(sw.includes("cache:'no-store'"),'service worker uses network-first no-store for shell files');
must(version.channel==='pilot-ready','version remains pilot-ready');
must(String(version.version).endsWith('.60'),'Student Experience Pilot Ready version is v60');

if(failed){console.error(`\n${failed} audit check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v60 Student Experience Pro Pilot Ready static audit passed.');
