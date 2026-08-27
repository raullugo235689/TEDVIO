import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),boot=fs.existsSync('teacher-progressive-boot-v68.js')?read('teacher-progressive-boot-v68.js'):'',student=read('student-v60.js'),css=read('student-v60.css'),legacy=read('beta.js'),secure=read('beta-stability.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};

must(teacher.includes('student-v60.css?v=60'),'teacher keeps v60 visual compatibility layer');
must(teacher.includes('beta-runtime-hooks.js?v=56'),'teacher keeps runtime hooks for canonical core');
must(!teacher.includes('student-v60.js?v=60')&&!boot.includes('student-v60.js'),'progressive /teacher intentionally omits student-only v60 runtime');
must(beta.includes('student-v60.css?v=60'),'student-capable beta shell loads v60 visual layer');
must(beta.includes('student-v60.js?v=60'),'student-capable beta shell loads v60 runtime');
must(beta.includes('beta-runtime-hooks.js?v=56'),'student-capable beta shell keeps runtime hooks');
must(beta.includes('beta-stability.js?v=56')&&beta.indexOf('beta-stability.js?v=56')<beta.indexOf('student-v60.js?v=60'),'secure join runtime remains loaded before Student Experience Pro on beta route');
must(student.includes("const VERSION='2026.08.25.60'"),'v60 runtime reports correct version');
must(student.includes("window.__TEDVIO_STUDENT_INTERVAL__")&&student.includes('nativeClear(id)'),'v60 cancels legacy renderStudent polling when it owns the student route');
must(student.includes("localStorage.getItem(STUDENT_KEY)")&&student.includes('tedvio.v60.answers.'),'v60 restores participant identity and persisted answered-question state');
must(student.includes("select('id,position,prompt,question_type,options,media_url,media_type,timer_seconds,status,launched_at,closed_at')"),'v60 reads only display-safe question fields before reveal');
must(!student.includes("from('v2_questions').select('*')"),'v60 never requests the full question row before reveal');
must(student.includes("if(S.question?.status==='revealed')await fetchReveal")&&student.includes("select('correct_answer')"),'correct answer is requested only through the reveal flow');
must(student.includes("v2_public_question_results")&&student.includes("v2_student_answer_feedback")&&student.includes("v2_student_feedback"),'v60 uses reveal/rank RPCs for student feedback');
must(student.includes("sb.rpc('v2_submit_response'") ,'v60 submits answers through canonical response RPC');
must(!student.includes("from('v2_responses').insert")&&!student.includes("from('v2_responses').update")&&!student.includes("from('v2_responses').delete"),'v60 never writes response tables directly');
must(!student.includes("from('v2_participants').insert")&&!student.includes("from('v2_participants').update")&&!student.includes("from('v2_participants').delete"),'v60 never mutates participant rows');
must(!student.includes("from('v2_sessions').update")&&!student.includes("from('v2_questions').update"),'v60 never changes teacher/session state');
must(student.includes('Tu respuesta quedó guardada. Espera a que el profesor muestre el resultado.'),'pre-reveal screen confirms registration without exposing correctness');
must(student.includes("S.question.status==='revealed'")&&student.includes('¡Correcto!')&&student.includes('Esta vez no fue correcta'),'personal correctness appears only in reveal result UI');
for(const t of ['multiple_choice','multiple_select','true_false','open_text','numeric','poll','scale_5','ordering','hotspot'])must(student.includes(t),`v60 supports ${t}`);
must(student.includes('tv60Hot')&&student.includes('S.hotspot={x:')&&student.includes('tv60-hot-correct'),'v60 supports interactive hotspot answer and revealed overlay');
must(student.includes('Reconectando')&&student.includes("visibilitychange")&&student.includes("window.addEventListener('online'") ,'v60 includes reconnect and Safari resume behavior');
must(student.includes('Sesión finalizada')&&student.includes('Respondidas')&&student.includes('Correctas'),'v60 provides a final individual session summary');
must(student.includes("String(error.message).includes('duplicate')"),'v60 handles duplicate answer protection gracefully');
must(css.includes('.tv60-question')&&css.includes('.tv60-state.submitted')&&css.includes('.tv60-result')&&css.includes('.tv60-finish'),'v60 CSS covers question, submitted, revealed and final states');
must(css.includes('@media(max-width:520px)')&&css.includes('@media(pointer:coarse)'),'v60 CSS includes phone and touch layouts');
must(legacy.includes("sb.rpc('v2_submit_response'") ,'audited legacy response engine remains present for rollback');
must(secure.includes('v2_join_session_v3')&&secure.includes('stopImmediatePropagation'),'secure join v3 remains the canonical entry path');

if(failed){console.error(`\n${failed} v60 regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v60 Student Experience Pro regression audit passed.');
