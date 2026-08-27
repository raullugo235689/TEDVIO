import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),betaHtml=read('beta.html'),loader=read('teacher-progressive-boot-v68.js'),teacherCore=read('teacher-core-v68-6.js'),sessionCore=read('teacher-session-core-v68-6.js'),live=read('live-classroom-v58.js'),css=read('live-classroom-v58.css'),beta=read('beta.js'),projection=read('proyectar-v2.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};

must(!teacher.includes('live-classroom-v58.css?v=58')&&loader.includes('live-classroom-v58.css?v=58'),'teacher keeps Live v58 CSS opt-in instead of first paint');
must(loader.includes('live-classroom-v58.js?v=58'),'teacher keeps Live v58 runtime as opt-in/rollback');
must(!teacher.includes('beta.js?v=56')&&betaHtml.includes('beta.js?v=56'),'teacher no longer executes beta.js while beta route preserves rollback');
must(teacherCore.includes('teacher-session-core-v68-6.js?v=686'),'split teacher delegates live sessions to dedicated session core');
for(const name of ['betaReturnWaiting','betaShowQuestion','betaLaunchQuestion','betaCloseQuestion','betaRevealQuestion','betaEndSession'])must(teacherCore.includes(`window.${name}`),`teacher core exports compatibility control ${name}`);
for(const fn of ['returnWaiting','showQuestion','launchQuestion','closeQuestion','revealQuestion','endSession'])must(sessionCore.includes(`function ${fn}`),`split session core implements ${fn}`);
must(sessionCore.includes("addEventListener('tedvio:v64:state'")&&sessionCore.includes('15000'),'split session core uses Realtime wake plus 15s session-only fallback');
must(!sessionCore.includes('new MutationObserver'),'split session core installs no DOM MutationObserver');
must(live.includes("const VERSION='2026.08.25.58'"),'Live Classroom v58 rollback runtime reports v58');
must(live.includes("from('v2_sessions').select")&&live.includes("from('v2_participants').select")&&live.includes("from('v2_questions').select")&&live.includes("from('v2_responses').select"),'Live v58 reads canonical live-session state');
must(!live.includes("from('v2_responses').insert")&&!live.includes("from('v2_responses').update")&&!live.includes("from('v2_responses').delete"),'Live v58 never writes student responses');
must(!live.includes("from('v2_participants').insert")&&!live.includes("from('v2_participants').update")&&!live.includes("from('v2_participants').delete"),'Live v58 never mutates participants');
must(live.includes('betaLaunchQuestion')&&live.includes('betaCloseQuestion')&&live.includes('betaRevealQuestion')&&live.includes('betaEndSession'),'Live v58 remains compatible with teacher control contract');
must(live.includes('await window.betaCloseQuestion?.();await window.betaLaunchQuestion?.(id)'),'v58 Next closes active question before launching next');
must(live.includes('proyectar.html?code=')&&projection.includes('v2_public_session_people'),'projection remains privacy-safe');
must(css.includes('#tvLive58Root')&&css.includes('.tv58-lobby')&&css.includes('.tv58-stage')&&css.includes('.tv58-toolbar'),'v58 visual rollback remains intact');
must(beta.includes('window.betaReturnWaiting')&&beta.includes('window.betaEndSession'),'legacy beta session engine remains preserved for rollback');
if(failed){console.error(`\n${failed} v58 regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v58 compatibility audit passed under v68.6 Teacher Core Split.');