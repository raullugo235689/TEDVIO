import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('control.html');
const mobile=read('control-v59.js');
const css=read('control-v59.css');
const live=read('live-classroom-v58.js');
const version=JSON.parse(read('version.json'));
const sw=read('sw.js');
const vercel=read('vercel.json');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};

must(html.includes('control-v59.js?v=59')&&html.includes('control-v59.css?v=59'),'control shell loads v59 runtime and styles');
must(!html.includes('control.js?v=55')&&!html.includes('control-moderation.js'),'legacy control runtimes are rollback-only and not loaded');
must(mobile.includes("const VERSION='2026.08.25.59'"),'Mobile Classroom reports v59');
must(mobile.includes("from('v2_sessions').select")&&mobile.includes("from('v2_participants').select")&&mobile.includes("from('v2_questions').select")&&mobile.includes("from('v2_responses').select"),'v59 reads canonical live-session state');
must(!mobile.includes("from('v2_responses').insert")&&!mobile.includes("from('v2_responses').update")&&!mobile.includes("from('v2_responses').delete"),'v59 never mutates student responses');
must(!mobile.includes("from('v2_participants').insert")&&!mobile.includes("from('v2_participants').update")&&!mobile.includes("from('v2_participants').delete"),'v59 never mutates participant records');
must(mobile.includes(".eq('teacher_id',state.user.id)")&&mobile.includes(".eq('session_id',state.session.id)"),'session/question writes are owner/session scoped');
must(mobile.includes("if(state.question?.status==='live')await closeCurrent();await launch(id)"),'v59 Next closes a live question before launching the next');
must(live.includes("if(st.current?.status==='live')await window.betaCloseQuestion?.();await window.betaLaunchQuestion?.(id)"),'v58 keeps the same Next transition contract');
must(mobile.includes('Todos respondieron')&&mobile.includes('navigator.vibrate?.')&&mobile.includes("visibilitychange"),'v59 exposes all-answered feedback, haptic fallback and resume-on-visibility');
must(mobile.includes("window.addEventListener('online'")&&mobile.includes("window.addEventListener('offline'")&&mobile.includes('Reconectando'),'v59 handles connectivity state and recovery');
must(mobile.includes('mc59CopyCode')&&mobile.includes('mc59Project')&&mobile.includes('mc59ToggleRanking'),'v59 includes code, projection and ranking controls');
must(mobile.includes('questionStrip')&&mobile.includes('Pendientes')&&mobile.includes('Respondieron'),'v59 includes question navigation and participation state');
must(css.includes('.mc59-controls')&&css.includes('.mc59-flow')&&css.includes('.mc59-all')&&css.includes('@media(max-width:560px)'),'v59 CSS covers large controls, all-answered state and phone layout');
must(vercel.includes('/control-v59.js')&&vercel.includes('/control-v59.css'),'v59 control assets use no-store headers');
must(sw.includes('tedvio-pilot-v59-20260825'),'service worker uses v59 cache namespace');
must(version.channel==='pilot-ready'&&String(version.version).endsWith('.59'),'version metadata is Pilot Ready v59');

if(failed){console.error(`\n${failed} v59 regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v59 Mobile Classroom Pro regression audit passed.');
