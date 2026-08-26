import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const live=read('live-classroom-v58.js');
const css=read('live-classroom-v58.css');
const beta=read('beta.js');
const projection=read('proyectar-v2.js');
let failed=0;
const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};

must(teacher.includes('live-classroom-v58.css?v=58'),'teacher loads Live Classroom v58 CSS');
must(teacher.includes('live-classroom-v58.js?v=58'),'teacher loads Live Classroom v58 runtime');
must(teacher.includes('beta-pilot-ready-v57.js?v=57'),'v57 smart dashboard remains active');
must(teacher.includes('beta.js?v=56'),'audited v56 core session engine remains active');
must(live.includes("const VERSION='2026.08.25.58'"),'Live Classroom telemetry reports v58');
must(live.includes("from('v2_sessions').select")&&live.includes("from('v2_participants').select")&&live.includes("from('v2_questions').select")&&live.includes("from('v2_responses').select"),'Live Classroom reads canonical live-session state');
must(!live.includes("from('v2_responses').insert")&&!live.includes("from('v2_responses').update")&&!live.includes("from('v2_responses').delete"),'Live Classroom never writes student responses');
must(!live.includes("from('v2_participants').insert")&&!live.includes("from('v2_participants').update")&&!live.includes("from('v2_participants').delete"),'Live Classroom never mutates participant records');
must(live.includes('betaLaunchQuestion')&&live.includes('betaCloseQuestion')&&live.includes('betaRevealQuestion')&&live.includes('betaEndSession'),'Live Classroom delegates session actions to audited core controls');
must(live.includes('await window.betaCloseQuestion?.();await window.betaLaunchQuestion?.(id)'),'Next action closes the current live question before launching the queued one');
must(live.includes('proyectar.html?code=')&&projection.includes('v2_public_session_people'),'projection remains wired to privacy-safe public runtime');
must(live.includes('Respondió')&&live.includes('Pendientes')&&live.includes('Ocultar ranking'),'teacher sees response completion and optional local ranking');
must(live.includes('tv58CopyCode')&&live.includes('tv58Projection')&&live.includes('tv58Lobby'),'lobby exposes code, projection and room controls');
must(css.includes('#tvLive58Root')&&css.includes('.tv58-lobby')&&css.includes('.tv58-stage')&&css.includes('.tv58-toolbar'),'Live Classroom CSS covers lobby, live stage and teacher controls');
must(css.includes('@media(max-width:900px)')&&css.includes('@media(max-width:620px)'),'Live Classroom includes iPad/mobile responsive layouts');
must(css.includes('.tv58-session-hidden'),'legacy session UI is hidden rather than removed while v58 is active');
must(beta.includes('window.betaReturnWaiting')&&beta.includes('window.betaShowQuestion')&&beta.includes('window.betaLaunchQuestion')&&beta.includes('window.betaCloseQuestion')&&beta.includes('window.betaRevealQuestion')&&beta.includes('window.betaEndSession'),'core still exports every control required by v58');

if(failed){console.error(`\n${failed} v58 regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v58 Live Classroom Pro regression audit passed.');
