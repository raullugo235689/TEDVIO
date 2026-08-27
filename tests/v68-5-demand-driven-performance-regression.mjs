import fs from'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),boot=read('teacher-progressive-boot-v68.js'),live=read('live-classroom-v58.js'),learning=read('beta-learning.js'),stability=read('beta-stability.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
const direct=[...teacher.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);

must(boot.includes("const VERSION='2026.08.27.685'"),'v68.5 demand loader reports exact hotfix version');
must(teacher.includes('teacher-progressive-boot-v68.js?v=685'),'teacher cache-busts the v68.5 loader');
must(direct.length<=9,`teacher keeps a minimal direct script budget (${direct.length})`);
must(boot.includes("dataset.tedvioPerformance='demand-driven'")&&boot.includes("mode:'demand'"),'teacher explicitly runs in demand-driven performance mode');
must(boot.includes('async function ensure(name)')&&boot.includes('const registry='),'optional features are controlled by an explicit lazy registry');

for(const feature of ['groups','bank','tasks','help','onboarding','admin','analytics','omr','livePro'])must(new RegExp(`\\b${feature}:`).test(boot),`lazy registry preserves ${feature}`);
for(const runtime of ['beta-groups-core-v3.js?v=56','question-studio-v65.js?v=65','assignments-v66.js?v=66','security-commercial-v67.js?v=67','onboarding-v68.js?v=68','admin-v62.js?v=62','academic-analytics-v61.js?v=61','beta-paper-exams-v2.js?v=56','live-classroom-v58.js?v=58'])must(boot.includes(runtime),`demand registry preserves ${runtime}`);

const coreBlock=boot.match(/await loadList\(\[([\s\S]*?)\],30\)/)?.[1]||'';
for(const core of ['beta-brand-v2.js?v=56','beta-premium-shell-v1.js?v=56','beta-dashboard-v2.js?v=56','beta-ui-v44.js?v=56','account-guard-v62.js?v=62','beta-pilot-ready-v57.js?v=57','entitlements-v63.js?v=63','qrcode.min.js'])must(coreBlock.includes(core),`core boot keeps ${core}`);
for(const optional of ['live-classroom-v58.js','question-studio-v65.js','assignments-v66.js','security-commercial-v67.js','onboarding-v68.js','academic-analytics-v61.js','admin-v62.js','beta-paper-exams-v2.js','beta-learning.js','beta-stability.js'])must(!coreBlock.includes(optional),`core boot does not start optional ${optional}`);

must(!teacher.includes('student-v60.js')&&!teacher.includes('student-security-v67.js')&&!teacher.includes('beta-student-live-v1.js'),'teacher does not execute student-only runtimes');
must(beta.includes('student-v60.js?v=60')&&beta.includes('student-security-v67.js?v=67'),'student route preserves student runtimes');
must(!teacher.includes('xlsx.full.min.js')&&!teacher.includes('jspdf')&&!teacher.includes('jsQR.js'),'teacher HTML does not eagerly load heavy academic libraries');
must(boot.includes("if(v==='bank'")||boot.includes("v==='bank'&&!features.has('bank')"),'bank navigation primes Question Studio on demand');
must(boot.includes("await ensure('bank')")&&boot.includes("window.betaView?.('bank')"),'first bank click replays after Question Studio becomes ready');
for(const id of ['tvLazyGroups','tvLazyTasks','tvLazyOmr','tvLazyHelp','tvLazySetup'])must(boot.includes(id),`teacher exposes lazy entry ${id}`);
must(boot.includes("shim(n,'groups')")&&boot.includes("shim(n,'omr')")&&boot.includes("shim(n,'analytics')"),'dashboard deep links are protected by lazy shims');
must(boot.includes("navObserver.observe(root,{childList:true})")&&!boot.includes("navObserver.observe(root,{childList:true,subtree:true})"),'navigation observer avoids whole-subtree churn');

must(live.includes('nativeInterval(()=>{if(sessionView())load();else if(st.root)cleanup()},1100)')&&live.includes('nativeInterval(tick,250)'),'legacy v58 high-frequency timers remain documented in rollback runtime');
const liveCore=coreBlock.includes('live-classroom-v58.js');
must(!liveCore&&boot.includes("livePro:[['./live-classroom-v58.js?v=58','module']]"),'legacy Live Pro stays dormant instead of consuming dashboard CPU');
must(learning.includes('setInterval(()=>')&&learning.includes('},700)'),'legacy learning loop remains preserved for rollback');
must(stability.includes('},900);'),'legacy stability loop remains preserved for rollback');
must(!boot.includes("['./beta-learning.js?v=56','module']")&&!boot.includes("['./beta-stability.js?v=56','module']"),'legacy 700/900ms loops are excluded from normal teacher demand path');
must(boot.includes('requestIdleCallback')&&boot.includes('yieldToInput'),'on-demand loading yields to user input between modules');

if(failed){console.error(`\n${failed} v68.5 demand-driven performance check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v68.5 Demand-Driven Performance regression audit passed.');