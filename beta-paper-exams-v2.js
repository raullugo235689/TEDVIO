import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const db = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const omr = () => window.TEDVIO_OMR;
const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

let user = null;
let exams = [];
let groups = [];
let current = null;
let roster = [];
let results = [];
let draft = null;
let draftVersion = 'A';
let scanAnswers = [];
let scanQuality = [];
let scanPreview = '';
let scanMeta = { studentId:'', version:'A', enrollment:'', name:'' };

async function refreshUser(){
  const { data:{ session } } = await db.auth.getSession();
  user = session?.user || null;
  return user;
}

function modal(html){
  document.querySelector('#peOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="b-overlay" id="peOverlay"><div class="b-modal large pe-shell">${html}</div></div>`);
}
window.peClose = () => document.querySelector('#peOverlay')?.remove();

function installButton(){
  if(location.hash.startsWith('#join') || location.hash.startsWith('#student')) return;
  const actions = document.querySelector('.b-top-actions');
  if(!actions || actions.querySelector('#tedvioPaperBtn')) return;
  const b = document.createElement('button');
  b.id = 'tedvioPaperBtn';
  b.className = 'b-btn dark';
  b.textContent = 'Exámenes';
  b.onclick = openHome;
  actions.insertBefore(b, actions.querySelector('#tedvioGroupsBtn') || actions.firstChild);
}

async function loadBase(){
  if(!user) await refreshUser();
  const [e,g] = await Promise.all([
    db.from('v2_paper_exams').select('*').eq('teacher_id',user.id).order('created_at',{ascending:false}),
    db.from('v2_groups').select('*').eq('teacher_id',user.id).order('created_at',{ascending:false})
  ]);
  if(e.error) throw e.error;
  exams = e.data || [];
  groups = g.data || [];
}

function groupLabel(id){
  const g = groups.find(x => x.id === id);
  return g ? (g.group_name || g.name || 'Grupo') : 'Sin grupo';
}

async function openHome(){
  try{
    if(!user) await refreshUser();
    if(!user) return alert('Inicia sesión como profesor.');
    await loadBase();
    modal(`<div class="pe-head"><div><span class="pe-badge">TEDVIO OMR</span><h2>Exámenes en papel</h2><p class="b-sub">Genera hojas de respuestas y califícalas con la cámara.</p></div><div class="b-row"><button class="b-btn primary" onclick="peNewExam()">+ Crear examen</button><button class="b-btn secondary" onclick="peClose()">×</button></div></div><div class="pe-grid">${exams.length ? exams.map(examCard).join('') : `<div class="pe-card"><h3>Tu primer examen OMR</h3><p>Configura la clave, imprime la hoja y escanéala desde TEDVIO.</p><button class="b-btn primary" onclick="peNewExam()">Crear examen</button></div>`}</div>`);
  }catch(e){ alert(e.message || 'No pude cargar los exámenes.'); }
}
window.peOpenHome = openHome;

function examCard(x){
  return `<div class="pe-card"><div class="pe-meta"><span class="b-chip">${x.question_count} reactivos</span><span class="b-chip gray">${(x.versions||['A']).join('/')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.subject||'Sin asignatura')} · ${esc(groupLabel(x.group_id))}</p><button class="b-btn primary" onclick="peOpenExam('${x.id}')">Abrir</button></div>`;
}

window.peNewExam = () => {
  const groupOptions = groups.map(g => `<option value="${g.id}">${esc(g.university||'')} · ${esc(g.program||'')} · ${esc(g.group_name||g.name||'Grupo')}</option>`).join('');
  modal(`<div class="pe-head"><div><span class="pe-badge">NUEVO EXAMEN</span><h2>Configurar hoja de respuestas</h2></div><button class="b-btn secondary" onclick="peOpenHome()">← Volver</button></div><div class="b-grid two" style="margin-top:16px"><div class="b-field"><label>Título</label><input id="peTitle" placeholder="Ej. Parcial 1 · Anatomía"></div><div class="b-field"><label>Asignatura</label><input id="peSubject" placeholder="Anatomía Humana"></div><div class="b-field"><label>Grupo</label><select id="peGroup"><option value="">Sin grupo / genérico</option>${groupOptions}</select></div><div class="b-field"><label>Reactivos</label><input id="peCount" type="number" min="1" max="60" value="40"></div><div class="b-field"><label>Opciones</label><select id="peOptions"><option value="4">A–D</option><option value="5">A–E</option><option value="3">A–C</option><option value="2">A–B</option></select></div><div class="b-field"><label>Versiones</label><select id="peVersions"><option value="1">A</option><option value="2">A y B</option><option value="3">A, B y C</option></select></div></div><div class="pe-instruction">La plantilla admite hasta 60 reactivos. Después configurarás la clave de cada versión.</div><button class="b-btn primary" style="margin-top:15px" onclick="peStartKey()">Configurar clave →</button>`);
};

window.peStartKey = () => {
  const title = document.querySelector('#peTitle')?.value.trim();
  const count = Math.max(1, Math.min(60, Number(document.querySelector('#peCount')?.value || 0)));
  const optionCount = Number(document.querySelector('#peOptions')?.value || 4);
  const versionCount = Number(document.querySelector('#peVersions')?.value || 1);
  if(!title) return alert('Escribe el título del examen.');
  const versions = ['A','B','C'].slice(0,versionCount);
  const keys = {};
  versions.forEach(v => keys[v] = Array(count).fill(null));
  draft = {
    title,
    subject: document.querySelector('#peSubject')?.value.trim() || null,
    group_id: document.querySelector('#peGroup')?.value || null,
    question_count: count,
    option_count: optionCount,
    versions,
    answer_keys: keys
  };
  draftVersion = versions[0];
  renderKeyEditor();
};

function renderKeyEditor(){
  const letters = omr().letters.slice(0,draft.option_count);
  const key = draft.answer_keys[draftVersion] || [];
  const backAction = draft.id ? `peOpenExam('${draft.id}')` : 'peOpenHome()';
  modal(`<div class="pe-head"><div><span class="pe-badge">CLAVE</span><h2>${esc(draft.title)}</h2><p class="b-sub">Marca una respuesta correcta por reactivo.</p></div><button class="b-btn secondary" onclick="${backAction}">← Volver</button></div><div class="pe-key-tabs">${draft.versions.map(v => `<button class="pe-key-tab ${v===draftVersion?'active':''}" onclick="peKeyVersion('${v}')">Versión ${v}</button>`).join('')}</div><div class="pe-key-grid">${key.map((answer,i) => `<div class="pe-key-row" data-q="${i}"><strong>${i+1}</strong>${letters.map(l => `<button class="pe-key-choice ${answer===l?'active':''}" onclick="peSetKey(${i},'${l}',this)">${l}</button>`).join('')}</div>`).join('')}</div><div class="b-row" style="justify-content:space-between;margin-top:15px"><span class="b-sub">Completa todas las versiones antes de guardar.</span><button class="b-btn primary" onclick="peSaveExam()">Guardar examen</button></div>`);
}
window.peKeyVersion = v => { draftVersion = v; renderKeyEditor(); };
window.peSetKey = (i,l,btn) => {
  draft.answer_keys[draftVersion][i] = l;
  btn.closest('.pe-key-row')?.querySelectorAll('.pe-key-choice').forEach(x => x.classList.toggle('active', x.textContent.trim() === l));
};

window.peSaveExam = async () => {
  for(const v of draft.versions){
    if((draft.answer_keys[v] || []).some(x => !x)) return alert(`Completa toda la clave de la versión ${v}.`);
  }
  const row = {
    teacher_id: user.id,
    group_id: draft.group_id,
    title: draft.title,
    subject: draft.subject,
    question_count: draft.question_count,
    option_count: draft.option_count,
    versions: draft.versions,
    answer_keys: draft.answer_keys,
    updated_at: new Date().toISOString()
  };
  const r = draft.id
    ? await db.from('v2_paper_exams').update(row).eq('id',draft.id).select().single()
    : await db.from('v2_paper_exams').insert(row).select().single();
  if(r.error) return alert(r.error.message);
  await loadBase();
  await openExam(r.data.id);
};

async function loadExamData(id){
  current = exams.find(x => x.id === id) || (await db.from('v2_paper_exams').select('*').eq('id',id).single()).data;
  if(!current) throw new Error('No encontré el examen.');
  roster = [];
  if(current.group_id){
    const s = await db.from('v2_group_students').select('*').eq('group_id',current.group_id).eq('active',true).order('full_name');
    roster = s.data || [];
  }
  const r = await db.from('v2_paper_exam_results').select('*').eq('exam_id',current.id).order('created_at',{ascending:false});
  results = r.data || [];
}

async function openExam(id){
  try{ await loadExamData(id); renderExam(); }
  catch(e){ alert(e.message || 'No pude abrir el examen.'); }
}
window.peOpenExam = openExam;

function renderExam(){
  const avg = results.length ? (results.reduce((a,b)=>a+Number(b.score||0),0)/results.length).toFixed(1) : '—';
  modal(`<div class="pe-head"><div><span class="pe-badge">EXAMEN OMR</span><h2>${esc(current.title)}</h2><p class="b-sub">${esc(current.subject||'')} · ${esc(groupLabel(current.group_id))}</p></div><div class="b-row"><button class="b-btn secondary" onclick="peOpenHome()">← Exámenes</button><button class="b-btn secondary" onclick="peClose()">×</button></div></div><div class="pe-stat-row"><div class="pe-stat"><span>Reactivos</span><b>${current.question_count}</b></div><div class="pe-stat"><span>Versiones</span><b>${current.versions.length}</b></div><div class="pe-stat"><span>Calificados</span><b>${results.length}</b></div><div class="pe-stat"><span>Promedio</span><b>${avg}</b></div></div><div class="pe-grid"><div class="pe-card"><span class="pe-badge">1 · PREPARAR</span><h3>Hojas de respuestas</h3><p>Imprime una hoja genérica o una por alumno.</p><button class="b-btn primary" onclick="pePrintDialog()">Imprimir hojas</button></div><div class="pe-card"><span class="pe-badge">2 · REVISAR</span><h3>Escanear hoja</h3><p>Fotografía la hoja y TEDVIO detectará las burbujas marcadas.</p><button class="b-btn primary" onclick="peScan()">Escanear y calificar</button></div><div class="pe-card"><span class="pe-badge">3 · RESULTADOS</span><h3>Resultados</h3><p>Consulta aciertos, calificación y exporta el grupo.</p><button class="b-btn secondary" onclick="peResults()">Ver resultados</button></div></div><div class="b-row" style="margin-top:16px"><button class="b-btn secondary" onclick="peEditKey()">Editar clave</button><button class="b-btn danger" onclick="peDeleteExam()">Eliminar examen</button></div>`);
}

window.peEditKey = () => {
  draft = {
    ...current,
    versions: [...current.versions],
    answer_keys: JSON.parse(JSON.stringify(current.answer_keys || {}))
  };
  draftVersion = draft.versions[0];
  renderKeyEditor();
};

window.peDeleteExam = async () => {
  if(!confirm('¿Eliminar este examen y todos sus resultados?')) return;
  const { error } = await db.from('v2_paper_exams').delete().eq('id',current.id);
  if(error) return alert(error.message);
  openHome();
};

window.pePrintDialog = () => {
  const versionOptions = current.versions.map(v => `<option value="${v}">Versión ${v}</option>`).join('');
  modal(`<div class="pe-head"><div><span class="pe-badge">IMPRIMIR</span><h2>Hojas de respuestas</h2><p class="b-sub">${esc(current.title)}</p></div><button class="b-btn secondary" onclick="peOpenExam('${current.id}')">← Examen</button></div><div class="b-grid two" style="margin-top:15px"><div class="b-field"><label>Versión</label><select id="pePrintVersion">${versionOptions}</select></div>${roster.length && current.versions.length>1 ? `<div class="b-field"><label>Distribución</label><select id="peAlternate"><option value="0">Misma versión</option><option value="1">Alternar ${current.versions.join('/')}</option></select></div>` : ''}</div><div class="pe-print-actions"><div class="pe-card"><h3>Genérica</h3><p>Una hoja con espacios para nombre y matrícula.</p><button class="b-btn primary" onclick="pePrint('generic')">Imprimir una</button></div><div class="pe-card"><h3>Personalizadas</h3><p>${roster.length ? `${roster.length} hojas con nombre y matrícula.` : 'Asigna un grupo con alumnos para usar esta opción.'}</p><button class="b-btn primary" ${roster.length?'':'disabled'} onclick="pePrint('roster')">Imprimir padrón</button></div></div>`);
};

window.pePrint = mode => {
  const version = document.querySelector('#pePrintVersion')?.value || current.versions[0];
  const alternate = document.querySelector('#peAlternate')?.value === '1';
  const people = mode === 'roster' ? roster : [];
  const win = window.open('','_blank');
  if(!win) return alert('Permite ventanas emergentes para imprimir.');
  win.document.open();
  win.document.write(omr().printHtml(current, people, alternate ? current.versions : [version], alternate));
  win.document.close();
};

window.peScan = () => {
  scanAnswers = [];
  scanQuality = [];
  scanPreview = '';
  scanMeta = { studentId:'', version:current.versions[0], enrollment:'', name:'' };
  renderScanner();
};

function scanStudentField(){
  if(roster.length){
    return `<div class="b-field"><label>Alumno</label><select id="peScanStudent" onchange="peScanStudentChange(this.value)"><option value="">Seleccionar alumno</option>${roster.map(s=>`<option value="${s.id}" ${scanMeta.studentId===s.id?'selected':''}>${esc(s.enrollment)} · ${esc(s.full_name)}</option>`).join('')}</select></div>`;
  }
  return `<div class="b-grid two"><div class="b-field"><label>Matrícula</label><input id="peScanEnrollment" value="${esc(scanMeta.enrollment)}" oninput="peScanEnrollmentChange(this.value)"></div><div class="b-field"><label>Nombre</label><input id="peScanName" value="${esc(scanMeta.name)}" oninput="peScanNameChange(this.value)"></div></div>`;
}
window.peScanStudentChange = v => scanMeta.studentId = v;
window.peScanEnrollmentChange = v => scanMeta.enrollment = v;
window.peScanNameChange = v => scanMeta.name = v;
window.peScanVersionChange = v => scanMeta.version = v;

function renderScanner(){
  modal(`<div class="pe-head"><div><span class="pe-badge">ESCÁNER OMR</span><h2>Escanear hoja</h2><p class="b-sub">${esc(current.title)}</p></div><button class="b-btn secondary" onclick="peOpenExam('${current.id}')">← Examen</button></div><div class="pe-scan-layout"><div class="pe-scan-box"><div class="pe-upload"><div><h3>Fotografía la hoja completa</h3><p class="b-sub">Mantén la hoja vertical, con buena luz y las cuatro marcas negras visibles.</p><input type="file" accept="image/*" capture="environment" onchange="peScanFile(event)"></div></div></div><div class="pe-scan-box"><h3>Datos</h3>${scanStudentField()}<div class="b-field"><label>Versión</label><select onchange="peScanVersionChange(this.value)">${current.versions.map(v=>`<option value="${v}" ${scanMeta.version===v?'selected':''}>Versión ${v}</option>`).join('')}</select></div><div class="pe-instruction">Después de leer la hoja podrás corregir manualmente cualquier reactivo dudoso antes de guardar.</div></div></div>`);
}

window.peScanFile = ev => {
  const file = ev.target.files?.[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try{
      const a = omr().analyze(img,current);
      scanAnswers = a.answers;
      scanQuality = a.quality;
      scanPreview = a.canvas.toDataURL('image/jpeg',.82);
      if(a.qr?.startsWith('TEDVIO-OMR|')){
        const p = a.qr.split('|');
        if(p[1] === current.id){
          if(current.versions.includes(p[2])) scanMeta.version = p[2];
          if(p[3]) scanMeta.studentId = p[3];
          if(p[4]) scanMeta.enrollment = p[4];
        }
      }
      renderScanReview();
    }catch(e){
      alert(e.message || 'No pude analizar la hoja.');
    }finally{
      URL.revokeObjectURL(url);
    }
  };
  img.src = url;
};

function renderScanReview(){
  const letters = omr().letters.slice(0,current.option_count);
  const warnings = scanQuality.filter(x => x.status !== 'ok').length;
  modal(`<div class="pe-head"><div><span class="pe-badge">REVISIÓN</span><h2>Confirma la lectura</h2><p class="b-sub">${warnings ? `${warnings} reactivos requieren revisión.` : 'Lectura completa sin alertas.'}</p></div><button class="b-btn secondary" onclick="peScan()">↻ Otra foto</button></div><div class="pe-scan-layout"><div class="pe-scan-box"><img class="pe-preview" src="${scanPreview}" alt="Hoja escaneada"><div class="pe-instruction" style="margin-top:10px">Los reactivos amarillos están en blanco o fueron ambiguos.</div></div><div class="pe-scan-box">${scanStudentField()}<div class="b-field"><label>Versión</label><select onchange="peScanVersionChange(this.value)">${current.versions.map(v=>`<option value="${v}" ${scanMeta.version===v?'selected':''}>Versión ${v}</option>`).join('')}</select></div><div class="pe-answer-grid">${scanAnswers.map((a,i)=>`<div class="pe-answer-row ${scanQuality[i]?.status!=='ok'?'warn':''}" data-answer-row="${i}"><strong>${i+1}</strong>${letters.map(l=>`<button class="pe-answer-btn ${a===l?'active':''}" onclick="pePickAnswer(${i},'${l}',this)">${l}</button>`).join('')}<button class="pe-answer-btn ${!a?'active':''}" onclick="pePickAnswer(${i},'',this)">—</button></div>`).join('')}</div><button class="b-btn primary" style="width:100%;margin-top:14px" onclick="peSaveScan()">Calificar y guardar</button></div></div>`);
}

window.pePickAnswer = (i,value,btn) => {
  scanAnswers[i] = value || null;
  scanQuality[i] = { ...(scanQuality[i]||{}), status:value?'ok':'blank' };
  const row = btn.closest('.pe-answer-row');
  row?.querySelectorAll('.pe-answer-btn').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  row?.classList.toggle('warn', !value);
};

window.peSaveScan = async () => {
  const key = current.answer_keys?.[scanMeta.version];
  if(!Array.isArray(key)) return alert('No encontré la clave de esta versión.');
  let studentId = null, enrollment = scanMeta.enrollment, name = scanMeta.name;
  if(roster.length){
    studentId = scanMeta.studentId || null;
    if(!studentId) return alert('Selecciona al alumno.');
    const s = roster.find(x => x.id === studentId);
    enrollment = s?.enrollment || '';
    name = s?.full_name || '';
  }else if(!enrollment && !name){
    return alert('Escribe al menos nombre o matrícula.');
  }
  const correct = scanAnswers.reduce((n,a,i) => n + (a && String(a)===String(key[i]) ? 1 : 0),0);
  const blanks = scanAnswers.filter(x => !x).length;
  const score = Number((correct/current.question_count*10).toFixed(2));
  const row = {
    exam_id: current.id,
    teacher_id: user.id,
    student_id: studentId,
    enrollment,
    student_name: name,
    version: scanMeta.version,
    answers: scanAnswers,
    correct_count: correct,
    blank_count: blanks,
    score,
    reviewed: true,
    updated_at: new Date().toISOString()
  };
  const r = studentId
    ? await db.from('v2_paper_exam_results').upsert(row,{onConflict:'exam_id,student_id,version'}).select().single()
    : await db.from('v2_paper_exam_results').insert(row).select().single();
  if(r.error) return alert(r.error.message);
  await loadExamData(current.id);
  modal(`<div style="text-align:center;padding:22px"><span class="pe-badge">CALIFICADO</span><h2>${esc(name||enrollment)}</h2><div class="pe-score" style="justify-content:center"><b>${score.toFixed(1)}</b><span>${correct}/${current.question_count} aciertos<br>${blanks} en blanco · ${(correct/current.question_count*100).toFixed(0)}%</span></div><div class="b-row" style="justify-content:center"><button class="b-btn primary" onclick="peScan()">Escanear siguiente</button><button class="b-btn secondary" onclick="peResults()">Ver resultados</button></div></div>`);
};

window.peResults = renderResults;
function renderResults(){
  const avg = results.length ? (results.reduce((s,r)=>s+Number(r.score||0),0)/results.length).toFixed(2) : '—';
  const high = results.length ? Math.max(...results.map(r=>Number(r.score||0))).toFixed(1) : '—';
  const low = results.length ? Math.min(...results.map(r=>Number(r.score||0))).toFixed(1) : '—';
  modal(`<div class="pe-head"><div><span class="pe-badge">RESULTADOS</span><h2>${esc(current.title)}</h2><p class="b-sub">${results.length} hojas calificadas</p></div><div class="b-row"><button class="b-btn secondary" onclick="peExportResults()">Exportar CSV</button><button class="b-btn secondary" onclick="peOpenExam('${current.id}')">← Examen</button></div></div><div class="pe-stat-row"><div class="pe-stat"><span>Calificados</span><b>${results.length}</b></div><div class="pe-stat"><span>Promedio</span><b>${avg}</b></div><div class="pe-stat"><span>Mayor</span><b>${high}</b></div><div class="pe-stat"><span>Menor</span><b>${low}</b></div></div><div class="b-table-wrap pe-results"><table class="b-table"><thead><tr><th>Matrícula</th><th>Alumno</th><th>Versión</th><th>Aciertos</th><th>Blancos</th><th>Calificación</th><th></th></tr></thead><tbody>${results.length ? results.map(r=>`<tr><td>${esc(r.enrollment||'—')}</td><td><strong>${esc(r.student_name||'Sin nombre')}</strong></td><td><span class="pe-version-pill">${esc(r.version)}</span></td><td>${r.correct_count}/${current.question_count}</td><td>${r.blank_count}</td><td><strong>${Number(r.score).toFixed(1)}</strong></td><td><button class="b-btn danger" onclick="peDeleteResult('${r.id}')">Eliminar</button></td></tr>`).join('') : '<tr><td colspan="7">Aún no hay resultados.</td></tr>'}</tbody></table></div>`);
}

window.peDeleteResult = async id => {
  if(!confirm('¿Eliminar este resultado?')) return;
  await db.from('v2_paper_exam_results').delete().eq('id',id);
  await loadExamData(current.id);
  renderResults();
};

window.peExportResults = () => {
  const rows = [
    ['Matricula','Alumno','Version','Aciertos','Reactivos','Blancos','Calificacion'],
    ...results.map(r => [r.enrollment||'',r.student_name||'',r.version,r.correct_count,current.question_count,r.blank_count,Number(r.score).toFixed(2)])
  ];
  const csv = '\ufeff' + rows.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `TEDVIO_${current.title.replace(/[^a-z0-9]+/gi,'_')}_resultados.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

new MutationObserver(()=>requestAnimationFrame(installButton)).observe(document.querySelector('#betaApp'),{childList:true,subtree:true});
db.auth.onAuthStateChange((_event,session)=>{ user=session?.user||null; setTimeout(installButton,0); });
window.addEventListener('hashchange',()=>setTimeout(installButton,0));
refreshUser().then(installButton);
