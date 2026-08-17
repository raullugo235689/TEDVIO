import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
let visible = false;
let lastCode = null;
let lastHash = '';

const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function getSessionCode(){
  return document.querySelector('.session-panel .code')?.textContent?.trim() || null;
}

function ensureStyles(){
  if(document.querySelector('#tedvio-ranking-styles')) return;
  const style = document.createElement('style');
  style.id = 'tedvio-ranking-styles';
  style.textContent = `
    #tedvioRankingBtn{position:fixed;right:18px;bottom:18px;z-index:9000;border:0;border-radius:999px;padding:12px 18px;background:#0A1B3D;color:#fff;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,.18);cursor:pointer}
    #tedvioRanking{position:fixed;right:18px;bottom:74px;z-index:8999;width:min(390px,calc(100vw - 36px));max-height:70vh;overflow:auto;background:#fff;border:1px solid #dbe3ef;border-radius:18px;padding:16px;box-shadow:0 16px 40px rgba(0,0,0,.18)}
    #tedvioRanking h3{margin:0 0 4px}.tr-sub{font-size:12px;color:#667085;margin-bottom:12px}.tr-row{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #eef2f7}.tr-pos{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eef3ff;font-weight:800}.tr-name{font-weight:700}.tr-meta{font-size:12px;color:#667085}.tr-score{font-weight:800}.tr-podium{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 8px}.tr-podium div{background:#f6f8fb;border-radius:14px;padding:10px;text-align:center}.tr-podium b{display:block;margin-top:4px}.tr-close{float:right;border:0;background:transparent;font-size:20px;cursor:pointer}.tr-empty{padding:16px 0;color:#667085}
  `;
  document.head.appendChild(style);
}

function clearRankingUI(){
  document.querySelector('#tedvioRanking')?.remove();
  document.querySelector('#tedvioRankingBtn')?.remove();
  visible = false;
}

function ensureButton(){
  if(!location.hash.startsWith('#teacher') || !getSessionCode()){
    clearRankingUI();
    return;
  }
  if(document.querySelector('#tedvioRankingBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'tedvioRankingBtn';
  btn.type = 'button';
  btn.textContent = '🏆 Ranking';
  btn.addEventListener('click', async () => {
    visible = !visible;
    if(visible) await renderRanking(); else document.querySelector('#tedvioRanking')?.remove();
  });
  document.body.appendChild(btn);
}

function scoreResponse(question, response){
  if(!['multiple_choice','true_false'].includes(question.question_type)) return {points:0,correct:false};
  const correct = String(response.answer) === String(question.correct_answer);
  if(!correct) return {points:0,correct:false};
  const launched = question.launched_at ? new Date(question.launched_at).getTime() : null;
  const submitted = response.submitted_at ? new Date(response.submitted_at).getTime() : null;
  let bonus = 0;
  if(launched && submitted && submitted >= launched){
    const secs = Math.max(0,(submitted-launched)/1000);
    bonus = Math.max(0, Math.round(500 * (1 - Math.min(secs,30)/30)));
  }
  return {points:1000+bonus,correct:true};
}

async function buildRanking(code){
  const {data:session,error:sErr} = await sb.from('sessions').select('id').eq('code',code).maybeSingle();
  if(sErr || !session) return [];
  const [{data:participants},{data:questions}] = await Promise.all([
    sb.from('participants').select('id,display_name').eq('session_id',session.id),
    sb.from('questions').select('id,question_type,correct_answer,launched_at').eq('session_id',session.id)
  ]);
  const qs = questions || [];
  const qIds = qs.map(q=>q.id);
  let responses = [];
  if(qIds.length){
    const {data} = await sb.from('responses').select('question_id,participant_id,answer,submitted_at').in('question_id',qIds);
    responses = data || [];
  }
  const qMap = new Map(qs.map(q=>[q.id,q]));
  const rows = (participants||[]).map(p=>({id:p.id,name:p.display_name||'Alumno',points:0,correct:0,answered:0}));
  const map = new Map(rows.map(r=>[r.id,r]));
  for(const r of responses){
    const row = map.get(r.participant_id), q = qMap.get(r.question_id);
    if(!row || !q) continue;
    row.answered++;
    const result = scoreResponse(q,r);
    row.points += result.points;
    if(result.correct) row.correct++;
  }
  return rows.sort((a,b)=>b.points-a.points || b.correct-a.correct || a.name.localeCompare(b.name));
}

async function renderRanking(){
  const code = getSessionCode();
  if(!code) return;
  lastCode = code;
  let box = document.querySelector('#tedvioRanking');
  if(!box){
    box = document.createElement('section');
    box.id = 'tedvioRanking';
    document.body.appendChild(box);
  }
  box.innerHTML = '<button class="tr-close" aria-label="Cerrar">×</button><h3>🏆 Ranking en vivo</h3><div class="tr-sub">Actualizando posiciones…</div>';
  box.querySelector('.tr-close').addEventListener('click',()=>{visible=false;box.remove()});
  const ranking = await buildRanking(code);
  if(!visible || code !== getSessionCode()) return;
  const podium = ranking.slice(0,3);
  box.innerHTML = `<button class="tr-close" aria-label="Cerrar">×</button><h3>🏆 Ranking en vivo</h3><div class="tr-sub">Puntos por aciertos + bono por rapidez · Las respuestas abiertas no suman automáticamente.</div>${podium.length?`<div class="tr-podium">${podium.map((r,i)=>`<div><span>${['🥇','🥈','🥉'][i]}</span><b>${esc(r.name)}</b><small>${r.points} pts</small></div>`).join('')}</div>`:''}${ranking.length?ranking.map((r,i)=>`<div class="tr-row"><div class="tr-pos">${i+1}</div><div><div class="tr-name">${esc(r.name)}</div><div class="tr-meta">${r.correct} correctas · ${r.answered} respondidas</div></div><div class="tr-score">${r.points}</div></div>`).join(''):'<div class="tr-empty">Aún no hay alumnos con respuestas registradas.</div>'}`;
  box.querySelector('.tr-close').addEventListener('click',()=>{visible=false;box.remove()});
}

ensureStyles();
setInterval(async()=>{
  const hash = location.hash;
  if(hash !== lastHash){ lastHash = hash; ensureButton(); }
  ensureButton();
  const code = getSessionCode();
  if(code !== lastCode && visible){ lastCode = code; await renderRanking(); }
  else if(visible) await renderRanking();
},2500);

window.addEventListener('hashchange',()=>setTimeout(ensureButton,100));
setTimeout(ensureButton,600);
