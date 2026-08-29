import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appendBankQuestionsToSession,
  bankDraftFromQuestion,
  bankWorkspaceKey,
  duplicateBankQuestion,
  emptyBankDraft,
  fetchBankWorkspace,
  launchClassroomSession,
  saveBankQuestion,
  updateBankQuestionFlags,
  type BankQuestion,
  type BankQuestionDraft,
  type BankQuestionType,
} from '../../core/bank';
import { groupName, groupSubject } from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import { EmptyState, ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const typeLabels: Record<BankQuestionType, string> = {
  multiple_choice: 'Opción múltiple',
  multiple_select: 'Selección múltiple',
  true_false: 'Verdadero / Falso',
  open_text: 'Respuesta abierta',
  numeric: 'Numérica',
  poll: 'Encuesta',
  scale_5: 'Escala 1–5',
  ordering: 'Ordenar',
  hotspot: 'Zona de imagen',
};

const answerTypes = new Set<BankQuestionType>(['multiple_choice', 'multiple_select', 'true_false', 'ordering']);
const optionTypes = new Set<BankQuestionType>(['multiple_choice', 'multiple_select', 'true_false', 'poll', 'scale_5', 'ordering']);

function accuracy(value?: number | null): string {
  return value == null ? 'Sin datos' : `${Number(value).toFixed(1)}%`;
}

function difficultyLabel(value?: string | null): string {
  if (value === 'baja') return 'Baja';
  if (value === 'alta') return 'Alta';
  if (value === 'media') return 'Media';
  return 'Sin nivel';
}

function normalizeTypeDraft(current: BankQuestionDraft, questionType: BankQuestionType): BankQuestionDraft {
  if (questionType === 'true_false') {
    return { ...current, questionType, options: ['Verdadero', 'Falso'], correctAnswers: [] };
  }
  if (questionType === 'scale_5') {
    return { ...current, questionType, options: ['1', '2', '3', '4', '5'], correctAnswers: [] };
  }
  if (!optionTypes.has(questionType)) {
    return { ...current, questionType, options: [], correctAnswers: [] };
  }
  const options = current.options.length >= 2 ? current.options : ['', '', '', ''];
  return { ...current, questionType, options, correctAnswers: [] };
}

function QuestionEditor({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: BankQuestionDraft;
  busy: boolean;
  onChange: (draft: BankQuestionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function setOption(index: number, value: string) {
    const options = [...draft.options];
    const previous = options[index];
    options[index] = value;
    const correctAnswers = draft.correctAnswers.map((answer) => (answer === previous ? value : answer));
    onChange({ ...draft, options, correctAnswers });
  }

  function removeOption(index: number) {
    const removed = draft.options[index];
    onChange({
      ...draft,
      options: draft.options.filter((_, itemIndex) => itemIndex !== index),
      correctAnswers: draft.correctAnswers.filter((answer) => answer !== removed),
    });
  }

  function moveOption(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= draft.options.length) return;
    const options = [...draft.options];
    const current = options[index];
    const target = options[next];
    if (current == null || target == null) return;
    options[index] = target;
    options[next] = current;
    onChange({ ...draft, options });
  }

  function toggleAnswer(option: string) {
    if (!option.trim()) return;
    if (draft.questionType === 'multiple_select') {
      const selected = draft.correctAnswers.includes(option)
        ? draft.correctAnswers.filter((answer) => answer !== option)
        : [...draft.correctAnswers, option];
      onChange({ ...draft, correctAnswers: selected });
      return;
    }
    onChange({ ...draft, correctAnswers: [option] });
  }

  return (
    <form className="editor-panel bank-editor" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <header>
        <div><span className="eyebrow">{draft.id ? 'EDITAR REACTIVO' : 'NUEVO REACTIVO'}</span><h2>{draft.id ? 'Actualizar pregunta' : 'Crear pregunta'}</h2><p>Todo se guarda en tu banco privado y puede reutilizarse en clase o evaluación.</p></div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Cerrar">×</button>
      </header>

      <div className="form-grid two">
        <label>Título interno<input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="Osteogénesis · pregunta 1" /></label>
        <label>Tipo<select value={draft.questionType} onChange={(event) => onChange(normalizeTypeDraft(draft, event.target.value as BankQuestionType))}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Materia<input value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} placeholder="Anatomía" /></label>
        <label>Tema<input value={draft.topic} onChange={(event) => onChange({ ...draft, topic: event.target.value })} placeholder="Osteogénesis" /></label>
        <label>Carpeta<input value={draft.folder} onChange={(event) => onChange({ ...draft, folder: event.target.value })} placeholder="Unidad 1" /></label>
        <label>Etiquetas<input value={draft.tags.join(', ')} onChange={(event) => onChange({ ...draft, tags: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder="hueso, embriología" /></label>
        <label>Dificultad<select value={draft.difficulty} onChange={(event) => onChange({ ...draft, difficulty: event.target.value as BankQuestionDraft['difficulty'] })}><option value="">Sin nivel</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label>
        <label>Nivel cognitivo<select value={draft.bloom} onChange={(event) => onChange({ ...draft, bloom: event.target.value as BankQuestionDraft['bloom'] })}><option value="">Sin nivel</option><option value="recordar">Recordar</option><option value="comprender">Comprender</option><option value="aplicar">Aplicar</option><option value="analizar">Analizar</option><option value="evaluar">Evaluar</option><option value="crear">Crear</option></select></label>
      </div>

      <label className="wide-field">Enunciado<textarea rows={4} value={draft.prompt} onChange={(event) => onChange({ ...draft, prompt: event.target.value })} placeholder="Escribe la pregunta que verá el alumno" required /></label>

      {optionTypes.has(draft.questionType) ? (
        <section className="bank-options-editor">
          <div className="section-heading compact"><div><span className="eyebrow">OPCIONES</span><h3>{draft.questionType === 'ordering' ? 'Orden correcto' : 'Respuestas disponibles'}</h3><p>{draft.questionType === 'poll' || draft.questionType === 'scale_5' ? 'Esta actividad no tiene una respuesta correcta.' : draft.questionType === 'ordering' ? 'El orden visible será la solución esperada.' : 'Marca la opción o las opciones correctas.'}</p></div>{!['true_false', 'scale_5'].includes(draft.questionType) ? <button className="button ghost compact" type="button" onClick={() => onChange({ ...draft, options: [...draft.options, ''] })}>＋ Opción</button> : null}</div>
          <div className="bank-option-list">
            {draft.options.map((option, index) => (
              <div className="bank-option-row" key={`${index}-${option}`}>
                {answerTypes.has(draft.questionType) && draft.questionType !== 'ordering' ? <input type={draft.questionType === 'multiple_select' ? 'checkbox' : 'radio'} name="correct-answer" checked={draft.correctAnswers.includes(option) && Boolean(option.trim())} onChange={() => toggleAnswer(option)} aria-label={`Marcar opción ${index + 1} como correcta`} /> : <span className="option-index">{index + 1}</span>}
                <input value={option} disabled={['true_false', 'scale_5'].includes(draft.questionType)} onChange={(event) => setOption(index, event.target.value)} placeholder={`Opción ${index + 1}`} />
                {draft.questionType === 'ordering' ? <><button className="icon-button compact-icon" type="button" onClick={() => moveOption(index, -1)} disabled={index === 0} aria-label="Subir">↑</button><button className="icon-button compact-icon" type="button" onClick={() => moveOption(index, 1)} disabled={index === draft.options.length - 1} aria-label="Bajar">↓</button></> : null}
                {!['true_false', 'scale_5'].includes(draft.questionType) ? <button className="icon-button compact-icon" type="button" onClick={() => removeOption(index)} disabled={draft.options.length <= 2} aria-label="Eliminar opción">×</button> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!optionTypes.has(draft.questionType) && !['poll', 'scale_5'].includes(draft.questionType) ? (
        <label className="wide-field">{draft.questionType === 'hotspot' ? 'Descripción de la zona correcta' : 'Respuesta de referencia'}<input value={draft.correctAnswers[0] || ''} onChange={(event) => onChange({ ...draft, correctAnswers: event.target.value ? [event.target.value] : [] })} placeholder={draft.questionType === 'numeric' ? 'Ej. 7.5' : 'Opcional'} /></label>
      ) : null}

      <div className="form-grid two">
        <label>Recurso multimedia<select value={draft.mediaType} onChange={(event) => onChange({ ...draft, mediaType: event.target.value as BankQuestionDraft['mediaType'] })}><option value="">Sin recurso</option><option value="image">Imagen</option><option value="audio">Audio</option><option value="video">Video</option></select></label>
        <label>URL del recurso<input value={draft.mediaUrl} onChange={(event) => onChange({ ...draft, mediaUrl: event.target.value })} placeholder="https://…" disabled={!draft.mediaType} /></label>
      </div>
      <label className="wide-field">Explicación o retroalimentación<textarea rows={3} value={draft.explanation} onChange={(event) => onChange({ ...draft, explanation: event.target.value })} placeholder="Explica por qué la respuesta es correcta" /></label>

      <div className="editor-checks">
        <label><input type="checkbox" checked={draft.favorite} onChange={(event) => onChange({ ...draft, favorite: event.target.checked })} /> Favorita</label>
        <label><input type="checkbox" checked={draft.archived} onChange={(event) => onChange({ ...draft, archived: event.target.checked })} /> Archivada</label>
      </div>
      <footer><button className="button ghost" type="button" onClick={onCancel}>Cancelar</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear reactivo'}</button></footer>
    </form>
  );
}

function QuestionCard({
  question,
  selected,
  metric,
  onSelect,
  onEdit,
  onDuplicate,
  onFavorite,
  onArchive,
}: {
  question: BankQuestion;
  selected: boolean;
  metric?: { times_used: number; accuracy_pct?: number | null; discrimination?: number | null };
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  onArchive: () => void;
}) {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  return (
    <article className={`bank-question-card${selected ? ' selected' : ''}${question.archived ? ' archived' : ''}`}>
      <header>
        <label className="question-selector"><input type="checkbox" checked={selected} onChange={onSelect} /><span /></label>
        <div className="bank-question-heading"><div className="question-chips"><StatusPill tone="blue">{typeLabels[question.question_type]}</StatusPill><StatusPill>{difficultyLabel(question.difficulty)}</StatusPill>{question.favorite ? <StatusPill tone="amber">Favorita</StatusPill> : null}{question.archived ? <StatusPill>Archivada</StatusPill> : null}</div><h2>{question.prompt}</h2><p>{[question.subject, question.topic, question.folder].filter(Boolean).join(' · ') || 'Sin clasificación'}</p></div>
      </header>
      {question.media_url ? <div className="question-media-note"><Icon name="layout" />Incluye {question.media_type || 'recurso multimedia'}</div> : null}
      {options.length ? <div className="question-option-preview">{options.slice(0, 5).map((option, index) => <span key={`${option}-${index}`}><b>{String.fromCharCode(65 + index)}</b>{option}</span>)}</div> : null}
      <div className="question-metrics"><span><small>Usos</small><b>{metric?.times_used || 0}</b></span><span><small>Acierto</small><b>{accuracy(metric?.accuracy_pct)}</b></span><span><small>Discriminación</small><b>{metric?.discrimination == null ? '—' : Number(metric.discrimination).toFixed(2)}</b></span></div>
      <footer><button className="button ghost compact" type="button" onClick={onFavorite}>{question.favorite ? '★ Quitar favorita' : '☆ Favorita'}</button><button className="button ghost compact" type="button" onClick={onDuplicate}>Duplicar</button><button className="button ghost compact" type="button" onClick={onArchive}>{question.archived ? 'Restaurar' : 'Archivar'}</button><button className="button secondary compact" type="button" onClick={onEdit}>Editar</button></footer>
    </article>
  );
}

export function BankPage() {
  const auth = useAuth();
  const home = useTeacherHome();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<BankQuestionDraft | null>(null);
  const [groupId, setGroupId] = useState(searchParams.get('group') || '');
  const [notice, setNotice] = useState('');
  const [competitive, setCompetitive] = useState(true);
  const [teamMode, setTeamMode] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const targetSessionId = searchParams.get('session') || '';

  const bank = useQuery({
    queryKey: bankWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchBankWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: bankWorkspaceKey(auth.user?.id) });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !draft) throw new Error('El editor no está listo.');
      return saveBankQuestion(auth.user, draft);
    },
    onSuccess: async () => { setDraft(null); setNotice('Pregunta guardada en tu banco.'); await invalidate(); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (questionId: string) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return duplicateBankQuestion(auth.user, questionId);
    },
    onSuccess: async () => { setNotice('Pregunta duplicada.'); await invalidate(); },
  });

  const flagsMutation = useMutation({
    mutationFn: ({ questionId, changes }: { questionId: string; changes: { favorite?: boolean; archived?: boolean } }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return updateBankQuestionFlags(auth.user, questionId, changes);
    },
    onSuccess: invalidate,
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      const ids = (bank.data?.questions || []).filter((question) => selected.has(question.id)).map((question) => question.id);
      if (targetSessionId) {
        const count = await appendBankQuestionsToSession(auth.user, targetSessionId, ids);
        return { sessionId: targetSessionId, message: `${count} pregunta${count === 1 ? '' : 's'} agregada${count === 1 ? '' : 's'} a la sesión.` };
      }
      const result = await launchClassroomSession(auth.user, groupId, ids, { competitive, teamMode, timerSeconds });
      return { sessionId: result.session_id, message: `Sesión ${result.code} creada con ${result.questions} preguntas.` };
    },
    onSuccess: async (result) => {
      setSelected(new Set());
      setNotice(result.message);
      await queryClient.invalidateQueries({ queryKey: ['teacher-classroom-sessions'] });
      navigate(`/classroom/${result.sessionId}`);
    },
  });

  const questions = bank.data?.questions || [];
  const subjects = useMemo(() => [...new Set(questions.map((question) => question.subject).filter(Boolean) as string[])].sort(), [questions]);
  const topics = useMemo(() => [...new Set(questions.map((question) => question.topic).filter(Boolean) as string[])].sort(), [questions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return questions.filter((question) => {
      if (!showArchived && question.archived) return false;
      if (subject && question.subject !== subject) return false;
      if (topic && question.topic !== topic) return false;
      if (type && question.question_type !== type) return false;
      if (!needle) return true;
      return [question.title, question.prompt, question.subject, question.topic, question.folder, ...(question.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(needle);
    });
  }, [questions, query, showArchived, subject, topic, type]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (bank.isLoading || home.isLoading) return <LoadingScreen label="Abriendo Question Studio…" />;
  if (bank.isError) return <ErrorPanel title="No pude cargar el banco" detail={bank.error.message} onRetry={() => bank.refetch()} />;
  if (home.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;

  const groups = home.data?.dashboard.groups || [];
  const selectedCount = selected.size;
  const anyError = saveMutation.error || duplicateMutation.error || flagsMutation.error || launchMutation.error;

  return (
    <div className="view-stack bank-page">
      <PageHeader eyebrow="QUESTION STUDIO" title="Banco de Reactivos" detail="Crea, clasifica, analiza y reutiliza preguntas sin salir del frontend unificado." actions={<button className="button primary" type="button" onClick={() => setDraft(emptyBankDraft())}>＋ Nueva pregunta</button>} />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {anyError ? <ErrorPanel title="No se pudo completar la operación" detail={(anyError as Error).message || 'Intenta nuevamente.'} /> : null}
      {draft ? <QuestionEditor draft={draft} busy={saveMutation.isPending} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => saveMutation.mutate()} /> : null}

      <SectionCard>
        <div className="bank-toolbar">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por pregunta, tema, carpeta o etiqueta" /></label>
          <select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">Todas las materias</option>{subjects.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">Todos los temas</option>{topics.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos los tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <label className="toggle-field"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivadas</label>
          <StatusPill tone="blue">{filtered.length} de {questions.length}</StatusPill>
        </div>
      </SectionCard>

      {filtered.length ? <section className="bank-question-grid">{filtered.map((question) => <QuestionCard key={question.id} question={question} selected={selected.has(question.id)} metric={bank.data?.metrics[question.id]} onSelect={() => toggleSelected(question.id)} onEdit={() => setDraft(bankDraftFromQuestion(question))} onDuplicate={() => duplicateMutation.mutate(question.id)} onFavorite={() => flagsMutation.mutate({ questionId: question.id, changes: { favorite: !question.favorite } })} onArchive={() => flagsMutation.mutate({ questionId: question.id, changes: { archived: !question.archived } })} />)}</section> : <EmptyState icon="bank" title={questions.length ? 'No hay coincidencias' : 'Tu banco está vacío'} detail={questions.length ? 'Ajusta los filtros o incluye reactivos archivados.' : 'Crea la primera pregunta para utilizarla en Modo Clase y futuras evaluaciones.'} action={<button className="button primary" type="button" onClick={() => setDraft(emptyBankDraft())}>Crear pregunta</button>} />}

      {selectedCount ? (
        <section className="selection-dock" aria-label="Preguntas seleccionadas">
          <div><span className="eyebrow">SELECCIÓN</span><b>{selectedCount} pregunta{selectedCount === 1 ? '' : 's'}</b><small>{targetSessionId ? 'Se agregarán a la sesión abierta.' : 'Crea una clase con este conjunto.'}</small></div>
          {!targetSessionId ? <label>Grupo<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Selecciona un grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{groupSubject(group)} · {groupName(group)}</option>)}</select></label> : <StatusPill tone="violet">Sesión existente</StatusPill>}
          {!targetSessionId ? <div className="launch-options"><label>Tiempo<input type="number" min="5" max="600" value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value))} /><span>s</span></label><label className="toggle-field"><input type="checkbox" checked={competitive} onChange={(event) => { setCompetitive(event.target.checked); if (!event.target.checked) setTeamMode(false); }} /> Ranking</label><label className="toggle-field"><input type="checkbox" checked={teamMode} disabled={!competitive} onChange={(event) => setTeamMode(event.target.checked)} /> Equipos</label></div> : null}
          <button className="button ghost" type="button" onClick={() => setSelected(new Set())}>Limpiar</button>
          <button className="button primary" type="button" disabled={launchMutation.isPending || (!targetSessionId && !groupId)} onClick={() => launchMutation.mutate()}>{launchMutation.isPending ? 'Preparando…' : targetSessionId ? 'Agregar a sesión' : 'Iniciar Modo Clase'}</button>
        </section>
      ) : null}

      <section className="bank-integration-note"><Icon name="classroom" /><div><span className="eyebrow">MODO CLASE</span><h2>Banco y sesión ya comparten el mismo flujo.</h2><p>Selecciona reactivos, elige un grupo y TEDVIO creará el código de acceso. También puedes añadir preguntas a una sesión ya abierta.</p></div><Link className="button secondary" to="/classroom">Abrir Modo Clase</Link></section>
    </div>
  );
}
