import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const STUDENT_KEY = 'tedvio_student_context';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function questionTypeLabel(type) {
  return ({
    multiple_choice: 'Opción múltiple',
    true_false: 'Verdadero / Falso',
    open_text: 'Respuesta abierta'
  })[type] || type;
}

function enhanceCreateForm() {
  const promptInput = document.querySelector('#bp');
  if (!promptInput || document.querySelector('#btype')) return;

  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = `
    <label>Tipo de pregunta</label>
    <select id="btype" style="width:100%;padding:12px;border:1px solid #d5dbe5;border-radius:10px;background:white">
      <option value="multiple_choice">Opción múltiple</option>
      <option value="true_false">Verdadero / Falso</option>
      <option value="open_text">Respuesta abierta</option>
    </select>`;
  promptInput.closest('.field')?.before(field);

  const select = field.querySelector('#btype');
  select.addEventListener('change', updateCreateFormByType);
  updateCreateFormByType();
}

function optionFields() {
  return [0, 1, 2, 3].map(i => document.querySelector(`#bo${i}`)?.closest('.field')).filter(Boolean);
}

function updateCreateFormByType() {
  const type = document.querySelector('#btype')?.value || 'multiple_choice';
  const fields = optionFields();
  const optionInputs = [0, 1, 2, 3].map(i => document.querySelector(`#bo${i}`));
  const radios = [...document.querySelectorAll('input[name="bc"]')];

  fields.forEach(f => { f.style.display = ''; });
  optionInputs.forEach(i => { if (i) i.disabled = false; });
  radios.forEach(r => { r.disabled = false; });

  if (type === 'true_false') {
    if (optionInputs[0]) optionInputs[0].value = 'Verdadero';
    if (optionInputs[1]) optionInputs[1].value = 'Falso';
    fields[2] && (fields[2].style.display = 'none');
    fields[3] && (fields[3].style.display = 'none');
    if (optionInputs[2]) optionInputs[2].disabled = true;
    if (optionInputs[3]) optionInputs[3].disabled = true;
    radios.forEach(r => {
      if (Number(r.value) > 1) r.disabled = true;
    });
  }

  if (type === 'open_text') {
    fields.forEach(f => { f.style.display = 'none'; });
    optionInputs.forEach(i => { if (i) i.disabled = true; });
    radios.forEach(r => { r.disabled = true; r.checked = false; });

    if (!document.querySelector('#openTextHint')) {
      const hint = document.createElement('div');
      hint.id = 'openTextHint';
      hint.className = 'field';
      hint.innerHTML = '<small>Los estudiantes escribirán una respuesta libre. No se define una respuesta correcta automática.</small>';
      document.querySelector('#bp')?.closest('.field')?.after(hint);
    }
  } else {
    document.querySelector('#openTextHint')?.remove();
  }
}

async function saveTypedQuestion() {
  const prompt = document.querySelector('#bp')?.value.trim();
  const subject = document.querySelector('#bs')?.value.trim() || '';
  const topic = document.querySelector('#bt')?.value.trim() || '';
  const type = document.querySelector('#btype')?.value || 'multiple_choice';
  if (!prompt) return alert('Escribe la pregunta.');

  let options = [];
  let correctAnswer = null;

  if (type === 'multiple_choice') {
    options = [0,1,2,3].map(i => document.querySelector(`#bo${i}`)?.value.trim() || '');
    correctAnswer = document.querySelector('input[name="bc"]:checked')?.value ?? null;
    if (options.some(x => !x) || correctAnswer === null) return alert('Completa las cuatro opciones y marca la respuesta correcta.');
  }

  if (type === 'true_false') {
    options = ['Verdadero', 'Falso'];
    correctAnswer = document.querySelector('input[name="bc"]:checked')?.value ?? null;
    if (!['0','1'].includes(String(correctAnswer))) return alert('Marca si la respuesta correcta es Verdadero o Falso.');
  }

  if (type === 'open_text') {
    options = [];
    correctAnswer = null;
  }

  const { error } = await sb.from('question_bank').insert({
    title: prompt.slice(0, 80),
    subject,
    topic,
    question_type: type,
    prompt,
    options,
    correct_answer: correctAnswer
  });
  if (error) return alert(error.message);
  await window.showBank?.();
}

function installSaveOverride() {
  if (window.__tedvioTypedSaveInstalled) return;
  window.__tedvioTypedSaveInstalled = true;
  window.saveBank = saveTypedQuestion;
}

function decorateBank() {
  if (!document.querySelector('.card h2')?.textContent?.includes('Banco de preguntas')) return;
  const items = [...document.querySelectorAll('.card > div[style*="border-top"]')];
  for (const item of items) {
    if (item.dataset.typeDecorated === '1') continue;
    item.dataset.typeDecorated = '1';
    const launch = item.querySelector('button[onclick*="launchBank"]');
    const idMatch = launch?.getAttribute('onclick')?.match(/launchBank\('([^']+)'\)/);
    if (!idMatch) continue;
    sb.from('question_bank').select('question_type').eq('id', idMatch[1]).maybeSingle().then(({data}) => {
      if (!data || !item.isConnected) return;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.marginLeft = '8px';
      badge.textContent = questionTypeLabel(data.question_type);
      item.querySelector('small')?.appendChild(badge);
    });
  }
}

function installJoinWrapper() {
  if (window.__tedvioJoinWrapped || typeof window.joinSession !== 'function') return;
  window.__tedvioJoinWrapped = true;
  const original = window.joinSession;
  window.joinSession = async function () {
    const code = document.querySelector('#code')?.value.trim();
    const name = document.querySelector('#name')?.value.trim();
    await original();
    if (!code || !name) return;
    await sleep(150);
    const { data: session } = await sb.from('sessions').select('id,code').eq('code', code).maybeSingle();
    if (!session) return;
    const { data: participant } = await sb.from('participants').select('id,display_name,session_id').eq('session_id', session.id).eq('display_name', name).order('joined_at', { ascending: false }).limit(1).maybeSingle();
    if (participant) localStorage.setItem(STUDENT_KEY, JSON.stringify({ sessionId: session.id, participantId: participant.id }));
  };
}

async function renderOpenTextStudent() {
  if (!location.hash.startsWith('#student')) return;
  let ctx;
  try { ctx = JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null'); } catch { return; }
  if (!ctx?.sessionId || !ctx?.participantId) return;

  const { data: session } = await sb.from('sessions').select('current_question_id').eq('id', ctx.sessionId).maybeSingle();
  if (!session?.current_question_id) return;
  const { data: question } = await sb.from('questions').select('*').eq('id', session.current_question_id).maybeSingle();
  if (!question || question.question_type !== 'open_text' || question.status !== 'live') return;
  if (document.querySelector('#tedOpenAnswer')) return;

  const target = document.querySelector('.mobile-body') || document.querySelector('.join-card');
  if (!target) return;
  target.innerHTML = `
    <h1>${escapeHtml(question.prompt)}</h1>
    <div class="field" style="margin-top:18px">
      <label>Tu respuesta</label>
      <textarea id="tedOpenAnswer" rows="6" placeholder="Escribe tu respuesta..." style="width:100%;padding:14px;border:1px solid #d5dbe5;border-radius:12px;font:inherit;resize:vertical"></textarea>
    </div>
    <button class="btn primary" id="tedOpenSend" style="width:100%">Enviar respuesta</button>`;

  document.querySelector('#tedOpenSend').onclick = async () => {
    const answer = document.querySelector('#tedOpenAnswer')?.value.trim();
    if (!answer) return alert('Escribe una respuesta.');
    const { error } = await sb.from('responses').insert({ question_id: question.id, participant_id: ctx.participantId, answer });
    if (error) return alert(error.message);
    target.innerHTML = '<div style="text-align:center;padding-top:50px"><div style="font-size:64px">✓</div><h1>¡Respuesta enviada!</h1><p>Espera al profesor.</p></div>';
  };
}

async function renderOpenTextTeacher() {
  if (!document.querySelector('.session-panel')) {
    document.querySelector('#tedOpenResponses')?.remove();
    return;
  }
  const code = document.querySelector('.session-panel .code')?.textContent.trim();
  if (!code) return;
  const { data: session } = await sb.from('sessions').select('current_question_id').eq('code', code).maybeSingle();
  if (!session?.current_question_id) return;
  const { data: question } = await sb.from('questions').select('id,question_type,status').eq('id', session.current_question_id).maybeSingle();
  if (!question || question.question_type !== 'open_text') {
    document.querySelector('#tedOpenResponses')?.remove();
    return;
  }
  const { data: responses } = await sb.from('responses').select('answer,submitted_at').eq('question_id', question.id).order('submitted_at', { ascending: false });
  const left = document.querySelector('.grid.split > div:first-child');
  if (!left) return;
  let box = document.querySelector('#tedOpenResponses');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tedOpenResponses';
    box.className = 'card';
    box.style.marginTop = '18px';
    left.appendChild(box);
  }
  box.innerHTML = `<h3>Respuestas abiertas <span class="badge">${responses?.length || 0}</span></h3>${responses?.length ? responses.map(r => `<div style="padding:10px 0;border-top:1px solid #e5e7eb">${escapeHtml(r.answer)}</div>`).join('') : '<p>Aún no hay respuestas.</p>'}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

installSaveOverride();
installJoinWrapper();
setInterval(() => {
  try {
    installSaveOverride();
    installJoinWrapper();
    enhanceCreateForm();
    decorateBank();
    renderOpenTextStudent();
    renderOpenTextTeacher();
  } catch (error) {
    console.error('TEDVIO question types:', error);
  }
}, 700);