import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankQuestion } from '../../core/bank';
import type { GroupRecord } from '../../core/types';
import { useAcademicDraft, type AcademicDraft } from '../../core/useAcademicDraft';
import {
  closeOnlineForm,
  compatibleOnlineFormQuestion,
  emptyOnlineFormDraft,
  fetchOnlineFormDetail,
  fetchOnlineFormsWorkspace,
  onlineFormDetailKey,
  onlineFormDraftFromDetail,
  onlineFormDraftPayload,
  onlineFormError,
  onlineFormsWorkspaceKey,
  onlineFormStudentUrl,
  onlineFormTopic,
  publishOnlineForm,
  saveOnlineFormDraft,
  type OnlineForm,
  type OnlineFormAttempt,
  type OnlineFormDetail,
  type OnlineFormDraft,
  type OnlineFormFeedback,
  type OnlineFormsWorkspace,
  type OnlineFormStatus,
} from '../../core/online-forms';
import { exportOnlineFormResults } from '../../core/online-forms-export';
import { ActionDialog } from '../../shared/ActionDialog';
import { EmptyState, ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';
import './forms.css';

const statusLabels: Record<OnlineFormStatus, string> = { draft: 'Borrador', published: 'Publicado', closed: 'Cerrado' };
const statusTones: Record<OnlineFormStatus, string> = { draft: 'amber', published: 'green', closed: 'neutral' };
const feedbackLabels: Record<OnlineFormFeedback, string> = {
  score_only: 'Solo calificación',
  after_submit: 'Respuestas al enviar',
  after_close: 'Resultados al cerrar el formulario',
};
const feedbackHints: Record<OnlineFormFeedback, string> = {
  score_only: 'El alumno verá su calificación sin las respuestas correctas ni las explicaciones.',
  after_submit: 'Las respuestas correctas y las explicaciones estarán disponibles al enviar cada intento.',
  after_close: 'La calificación, las respuestas correctas y las explicaciones se mostrarán después del cierre del formulario.',
};
const selectionLabels: Record<OnlineFormDraft['selectionMode'], string> = {
  all: 'Todas las seleccionadas', random: 'Azar global', topic_quotas: 'Cuotas por tema',
};
const PAGE_SIZE = 12;

function groupLabel(group?: GroupRecord): string {
  if (!group) return 'Sin grupo';
  return [group.subject || group.program, group.group_name || group.name].filter(Boolean).join(' · ') || 'Grupo';
}

function dateTime(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Fecha no disponible';
}

function resultGrade(attempt: OnlineFormAttempt): string {
  return attempt.status === 'submitted' && attempt.percentage != null && Number.isFinite(Number(attempt.percentage))
    ? (Number(attempt.percentage) / 10).toFixed(1)
    : '—';
}

function CandidateSelector({ questions, selectedIds, disabled, onChange }: {
  questions: BankQuestion[];
  selectedIds: string[];
  disabled: boolean;
  onChange: (update: (ids: string[]) => string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [folder, setFolder] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [page, setPage] = useState(1);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const subjects = useMemo(() => [...new Set(questions.map(q => q.subject?.trim() || 'Sin materia'))].sort((a, b) => a.localeCompare(b, 'es')), [questions]);
  const folders = useMemo(() => [...new Set(questions.map(q => q.folder?.trim() || 'Sin carpeta'))].sort((a, b) => a.localeCompare(b, 'es')), [questions]);
  const topics = useMemo(() => [...new Set(questions.map(onlineFormTopic))].sort((a, b) => a.localeCompare(b, 'es')), [questions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return questions.filter(question => {
      if (subject && (question.subject?.trim() || 'Sin materia') !== subject) return false;
      if (folder && (question.folder?.trim() || 'Sin carpeta') !== folder) return false;
      if (topic && onlineFormTopic(question) !== topic) return false;
      if (difficulty && (question.difficulty || 'none') !== difficulty) return false;
      if (onlySelected && !selected.has(question.id)) return false;
      return !needle || [question.prompt, question.title, question.subject, question.topic, question.folder, ...(question.tags || [])]
        .filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(needle);
    });
  }, [questions, query, subject, folder, topic, difficulty, onlySelected, selected]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const allFilteredSelected = filtered.length > 0 && filtered.every(question => selected.has(question.id));

  function resetFilters() {
    setQuery(''); setSubject(''); setFolder(''); setTopic(''); setDifficulty(''); setOnlySelected(false); setPage(1);
  }

  function selectQuestion(id: string, checked: boolean) {
    onChange(ids => checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id));
  }

  return (
    <>
      <div className="of-filters">
        <label className="of-wide">Buscar en el banco
          <input type="search" value={query} disabled={disabled} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Enunciado, título o etiqueta" />
        </label>
        <label>Materia<select value={subject} disabled={disabled} onChange={event => { setSubject(event.target.value); setPage(1); }}><option value="">Todas las materias</option>{subjects.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Carpeta<select value={folder} disabled={disabled} onChange={event => { setFolder(event.target.value); setPage(1); }}><option value="">Todas las carpetas</option>{folders.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Tema<select value={topic} disabled={disabled} onChange={event => { setTopic(event.target.value); setPage(1); }}><option value="">Todos los temas</option>{topics.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Dificultad<select value={difficulty} disabled={disabled} onChange={event => { setDifficulty(event.target.value); setPage(1); }}><option value="">Todas las dificultades</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="none">Sin nivel</option></select></label>
      </div>
      <div className="of-bank-actions">
        <div>
          <button type="button" className="button secondary compact" disabled={disabled || !filtered.length || allFilteredSelected} onClick={() => onChange(ids => [...new Set([...ids, ...filtered.map(question => question.id)])])}>Seleccionar {filtered.length} filtradas</button>
          <button type="button" className="button ghost compact" disabled={disabled || !filtered.some(question => selected.has(question.id))} onClick={() => { const filteredIds = new Set(filtered.map(question => question.id)); onChange(ids => ids.filter(id => !filteredIds.has(id))); }}>Quitar filtradas</button>
        </div>
        <label className="of-check"><input type="checkbox" checked={onlySelected} disabled={disabled} onChange={event => { setOnlySelected(event.target.checked); setPage(1); }} />Solo seleccionadas ({selectedIds.length})</label>
      </div>
      {!questions.length ? (
        <EmptyState icon="bank" title="No hay preguntas compatibles" detail="Agrega al banco preguntas de opción múltiple o verdadero/falso con opciones y una respuesta correcta." action={<Link className="button secondary" to="/bank">Abrir banco de preguntas</Link>} />
      ) : !filtered.length ? (
        <div className="of-bank-empty"><p>No hay preguntas que coincidan con estos filtros.</p><button type="button" className="button ghost compact" onClick={resetFilters}>Limpiar filtros</button></div>
      ) : (
        <>
          <ul className="of-bank-list">
            {visible.map(question => (
              <li className="of-question" key={question.id}>
                <div className="of-question-top">
                  <input id={`of-question-${question.id}`} type="checkbox" checked={selected.has(question.id)} disabled={disabled} onChange={event => selectQuestion(question.id, event.currentTarget.checked)} />
                  <div className="of-question-copy">
                    <label htmlFor={`of-question-${question.id}`}>{question.prompt}</label>
                    <p>{[question.subject, onlineFormTopic(question), question.folder, question.question_type === 'true_false' ? 'Verdadero / Falso' : 'Opción múltiple'].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <details>
                  <summary>Ver opciones y clave</summary>
                  <ol className="of-option-list">
                    {(question.options as string[]).map((option, index) => (
                      <li key={`${question.id}-${index}`} className={option === question.correct_answer ? 'of-correct' : ''}>{option}{option === question.correct_answer ? <small>Correcta</small> : null}</li>
                    ))}
                  </ol>
                  {question.explanation ? <p className="of-hint">{question.explanation}</p> : null}
                </details>
              </li>
            ))}
          </ul>
          <div className="of-pagination">
            <button className="button ghost compact" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <span>Página {currentPage} de {pageCount} · {filtered.length} preguntas</span>
            <button className="button ghost compact" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </>
  );
}

function OnlineFormEditor({ workspace, initialDraft, initialUpdatedAt, onCancel }: {
  workspace: OnlineFormsWorkspace;
  initialDraft: OnlineFormDraft;
  initialUpdatedAt?: string;
  onCancel?: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const draftKey = ['online-form-draft', auth.user?.id, initialDraft.id || `new:${initialDraft.groupId}`];
  const academic = useAcademicDraft(draftKey, { draft: initialDraft, updatedAt: initialUpdatedAt }, { persistInSession: true });
  const draft = academic.value.draft;
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const questions = useMemo(() => workspace.questions.filter(compatibleOnlineFormQuestion), [workspace.questions]);
  const byId = useMemo(() => new Map(questions.map(question => [question.id, question])), [questions]);
  const selectedQuestions = useMemo(() => draft.questionIds.flatMap(id => { const question = byId.get(id); return question ? [question] : []; }), [draft.questionIds, byId]);
  const selectedTopics = useMemo(() => {
    const counts = new Map<string, number>();
    selectedQuestions.forEach(question => { const topic = onlineFormTopic(question); counts.set(topic, (counts.get(topic) || 0) + 1); });
    return [...counts].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [selectedQuestions]);
  const unavailableCount = draft.questionIds.length - selectedQuestions.length;
  const assignedCount = draft.selectionMode === 'all' ? draft.questionIds.length : draft.selectionMode === 'random'
    ? draft.questionCount : selectedTopics.reduce((sum, [topic]) => sum + (Number(draft.topicQuotas[topic]) || 0), 0);
  const validationError = useMemo(() => {
    try { onlineFormDraftPayload(draft, questions); return ''; }
    catch (cause) { return onlineFormError(cause); }
  }, [draft, questions]);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!academic.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [academic.dirty]);

  function setDraft(update: (value: OnlineFormDraft) => OnlineFormDraft) {
    setError('');
    academic.set(current => ({ ...current, draft: update(current.draft) }));
  }

  function patchDraft(patch: Partial<OnlineFormDraft>) {
    setDraft(current => ({ ...current, ...patch }));
  }

  const saveMutation = useMutation({
    mutationKey: ['online-form-write', auth.user?.id],
    mutationFn: async () => {
      if (!auth.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión para guardar.');
      const stored = queryClient.getQueryData<AcademicDraft<typeof academic.value> | null>(draftKey);
      const snapshot = stored?.value ?? academic.value;
      const revision = stored?.revision ?? academic.revision;
      if (snapshot.draft.id) {
        const latest = await fetchOnlineFormDetail(auth.user, snapshot.draft.id);
        if (latest.form.status !== 'draft' || (latest.form.attempt_count || 0) > 0 || latest.attempts.length > 0 || (snapshot.updatedAt && latest.form.updated_at !== snapshot.updatedAt)) {
          throw new Error('El formulario cambió desde que lo abriste. Conservamos tus cambios pendientes; vuelve al formulario para revisar la versión guardada.');
        }
      }
      const id = await saveOnlineFormDraft(auth.user, snapshot.draft);
      return { id, revision };
    },
    onSuccess: ({ id, revision }) => {
      academic.clear(revision);
      void queryClient.invalidateQueries({ queryKey: onlineFormsWorkspaceKey(auth.user?.id) });
      void queryClient.invalidateQueries({ queryKey: onlineFormDetailKey(auth.user?.id, id) });
      navigate(`/forms/${id}`);
      onCancel?.();
    },
    onError: cause => setError(onlineFormError(cause)),
  });
  const busy = saveMutation.isPending;

  function leave() { if (onCancel) onCancel(); else navigate('/forms'); }
  function cancel() { if (academic.dirty) setDiscarding(true); else leave(); }

  function changeSelection(update: (ids: string[]) => string[]) {
    setDraft(current => {
      const ids = update(current.questionIds);
      const topicQuotas = new Map(Object.entries(current.topicQuotas));
      ids.forEach(id => { const question = byId.get(id); if (question) { const topic = onlineFormTopic(question); if (!topicQuotas.has(topic)) topicQuotas.set(topic, 1); } });
      return { ...current, questionIds: ids, topicQuotas: Object.fromEntries(topicQuotas) };
    });
  }

  return (
    <div className="view-stack online-forms-page">
      <PageHeader eyebrow="EVALUAR · FORMULARIOS" title={draft.id ? 'Editar borrador' : 'Nuevo formulario'} detail="Selecciona las preguntas, define cómo se asignan y guarda el borrador para revisar antes de publicar."
        actions={<button className="button secondary" type="button" disabled={busy} onClick={cancel}>Cancelar</button>} />
      <form onSubmit={event => { event.preventDefault(); if (!busy && !validationError) saveMutation.mutate(); }} className="of-editor-layout">
        <div className="of-editor-main">
          <SectionCard>
            <span className="of-step-label">1 · INFORMACIÓN</span><h2 className="of-section-title">Datos del formulario</h2>
            <p className="of-section-intro">El título y las instrucciones se mostrarán al alumnado.</p>
            <fieldset disabled={busy} className="of-form-fields">
              <label className="of-field">Título<input value={draft.title} maxLength={200} required onChange={event => patchDraft({ title: event.currentTarget.value })} placeholder="Unidad 1 · Sesiones anatomoclínicas" /></label>
              <label className="of-field">Instrucciones<textarea value={draft.instructions} rows={3} onChange={event => patchDraft({ instructions: event.currentTarget.value })} placeholder="Explica qué debe hacer el alumno antes de iniciar." /></label>
              <label className="of-field">Grupo (opcional)<select value={draft.groupId} onChange={event => patchDraft({ groupId: event.currentTarget.value })}><option value="">Sin grupo</option>{workspace.groups.map(group => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select><small>{draft.groupId ? 'El alumno deberá ingresar una matrícula activa registrada en este grupo.' : 'Sin grupo, el alumno se identifica con su nombre y matrícula al abrir el enlace.'}</small></label>
            </fieldset>
          </SectionCard>
          <SectionCard>
            <span className="of-step-label">2 · BANCO DE PREGUNTAS</span><h2 className="of-section-title">Preguntas candidatas</h2>
            <p className="of-section-intro">Elige hasta 1,000 preguntas candidatas de opción múltiple o verdadero/falso con una respuesta correcta. Cada pregunta vale un punto.</p>
            {unavailableCount > 0 ? <div className="of-message error" role="alert"><p>{unavailableCount} preguntas de la selección ya no están disponibles en el banco.</p><button type="button" className="button secondary compact" disabled={busy} onClick={() => changeSelection(ids => ids.filter(id => byId.has(id)))}>Quitar preguntas no disponibles</button></div> : null}
            <CandidateSelector questions={questions} selectedIds={draft.questionIds} disabled={busy} onChange={changeSelection} />
          </SectionCard>
          <SectionCard>
            <span className="of-step-label">3 · ASIGNACIÓN</span><h2 className="of-section-title">Preguntas por alumno</h2>
            <p className="of-section-intro">Asigna hasta 200 preguntas por alumno. Puedes usar toda la selección, elegir al azar o distribuir las preguntas entre un máximo de 20 temas.</p>
            <fieldset disabled={busy}>
              <legend className="of-sr-only">Modo de asignación</legend>
              <div className="of-modes">
                {([
                  ['all', 'Todas las seleccionadas', 'Cada alumno responde todas las preguntas candidatas.'],
                  ['random', 'Azar global', 'Se elige una cantidad de preguntas de toda la selección.'],
                  ['topic_quotas', 'Cuotas por tema', 'Define cuántas preguntas se eligen al azar de cada tema.'],
                ] as const).map(([value, label, detail]) => (
                  <label key={value} className={`of-mode${draft.selectionMode === value ? ' is-selected' : ''}`}>
                    <input type="radio" name="online-form-selection" value={value} checked={draft.selectionMode === value} onChange={() => patchDraft({ selectionMode: value })} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
              {draft.selectionMode === 'random' ? (
                <label className="of-field">Cantidad por alumno<input type="number" min={1} max={Math.min(200, Math.max(1, selectedQuestions.length))} step={1} value={draft.questionCount || ''} required onChange={event => patchDraft({ questionCount: Number(event.currentTarget.value) })} /><small>{selectedQuestions.length} preguntas disponibles en tu selección.</small></label>
              ) : draft.selectionMode === 'topic_quotas' ? (
                <div className="of-quotas">
                  {selectedTopics.length ? selectedTopics.map(([topicName, available]) => (
                    <label className="of-quota-row" key={topicName}>
                      <span>{topicName}<small>{available} {available === 1 ? 'pregunta candidata' : 'preguntas candidatas'}</small></span>
                      <input type="number" aria-label={`Preguntas por alumno del tema ${topicName}`} aria-invalid={(draft.topicQuotas[topicName] || 0) > available} min={0} max={available} step={1} value={draft.topicQuotas[topicName] ?? 0} onChange={event => { const count = Number(event.currentTarget.value); setDraft(current => ({ ...current, topicQuotas: { ...current.topicQuotas, [topicName]: count } })); }} />
                    </label>
                  )) : <p className="of-hint">Selecciona preguntas del banco para definir los temas.</p>}
                  <p className="of-quota-total">Total: {assignedCount} preguntas por alumno</p>
                  <p className="of-hint">Una cuota de 0 excluye ese tema del formulario guardado.</p>
                </div>
              ) : <p className="of-hint">Cada alumno responderá {selectedQuestions.length} preguntas.</p>}
            </fieldset>
          </SectionCard>
          <SectionCard>
            <span className="of-step-label">4 · APLICACIÓN</span><h2 className="of-section-title">Acceso y entrega</h2>
            <p className="of-section-intro">Las fechas usan la zona horaria de este dispositivo: {timeZone}.</p>
            <fieldset disabled={busy} className="of-form-fields">
              <div className="of-grid-two">
                <label className="of-field">Intentos máximos<select value={draft.maxAttempts} onChange={event => patchDraft({ maxAttempts: Number(event.currentTarget.value) })}>{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} {count === 1 ? 'intento' : 'intentos'}</option>)}</select></label>
                <label className="of-field">Tiempo por intento (minutos)<input type="number" min={1} max={300} step={1} value={draft.timeLimitMinutes ?? ''} onChange={event => patchDraft({ timeLimitMinutes: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} placeholder="Sin límite" /><small>Déjalo vacío para no establecer un límite de tiempo.</small></label>
                <label className="of-field">Apertura<input type="datetime-local" value={draft.opensAt} onChange={event => patchDraft({ opensAt: event.currentTarget.value })} /><small>Sin fecha: disponible al publicar.</small></label>
                <label className="of-field">Cierre<input type="datetime-local" value={draft.closesAt} onChange={event => patchDraft({ closesAt: event.currentTarget.value })} /><small>Sin fecha: podrás cerrarlo manualmente.</small></label>
              </div>
              <label className="of-check"><input type="checkbox" checked={draft.shuffleOptions} onChange={event => patchDraft({ shuffleOptions: event.currentTarget.checked })} /><span>Mezclar el orden de las opciones de respuesta</span></label>
              <label className="of-field">Retroalimentación al alumno<select value={draft.feedbackMode} onChange={event => patchDraft({ feedbackMode: event.currentTarget.value as OnlineFormFeedback })}>{Object.entries(feedbackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{feedbackHints[draft.feedbackMode]}</small></label>
            </fieldset>
          </SectionCard>
        </div>
        <SectionCard className="of-editor-summary">
          <h2>Resumen del borrador</h2>
          <dl className="of-stat-list">
            <div><dt>Candidatas</dt><dd>{draft.questionIds.length}</dd></div>
            <div><dt>Por alumno</dt><dd>{assignedCount}</dd></div>
            <div><dt>Asignación</dt><dd>{selectionLabels[draft.selectionMode]}</dd></div>
            <div><dt>Tiempo</dt><dd>{draft.timeLimitMinutes ? `${draft.timeLimitMinutes} min` : 'Sin límite'}</dd></div>
            <div><dt>Intentos</dt><dd>{draft.maxAttempts}</dd></div>
          </dl>
          {validationError ? <ul className="of-validation" aria-live="polite"><li>{validationError}</li></ul> : <p className="of-message success">La configuración está lista para guardar.</p>}
          {error ? <p className="of-message error" role="alert">{error}</p> : null}
          <button className="button primary" type="submit" disabled={busy || Boolean(validationError)}>{busy ? 'Guardando…' : 'Guardar borrador'}</button>
          <p className="of-hint">Después podrás revisar la configuración y publicar el enlace para tus alumnos.</p>
          {academic.dirty ? <p className="of-hint" role="status">Hay cambios pendientes de guardar.</p> : null}
        </SectionCard>
      </form>
      {discarding ? <ActionDialog className="of-dialog" eyebrow="TEDVIO · FORMULARIOS" title="¿Descartar los cambios pendientes?" detail="Se conservará la última versión guardada del formulario." confirmLabel="Descartar cambios" danger onDismiss={() => setDiscarding(false)} onConfirm={() => { academic.clear(); setDiscarding(false); leave(); }} /> : null}
    </div>
  );
}

function OnlineFormsHome({ workspace }: { workspace: OnlineFormsWorkspace }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [params, setParams] = useSearchParams();
  const requestedGroup = params.get('group') || '';
  const groupId = workspace.groups.some(group => group.id === requestedGroup) ? requestedGroup : '';
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return workspace.forms.filter(form => {
      if (status && form.status !== status) return false;
      if (groupId && form.group_id !== groupId) return false;
      const group = workspace.groups.find(item => item.id === form.group_id);
      return !needle || [form.title, groupLabel(group)].join(' ').toLocaleLowerCase('es-MX').includes(needle);
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [workspace, query, status, groupId]);
  const createLink = groupId ? `/forms/new?group=${encodeURIComponent(groupId)}` : '/forms/new';
  const submitted = workspace.forms.reduce((sum, form) => sum + (form.submitted_count || 0), 0);

  return (
    <div className="view-stack online-forms-page">
      <PageHeader eyebrow="EVALUAR · FORMULARIOS" title="Formularios en línea" detail="Crea exámenes desde tu banco, asigna preguntas al azar y consulta los resultados de cada alumno."
        actions={<Link className="button primary" to={createLink}>＋ Nuevo formulario</Link>} />
      <p className="of-summary-line"><strong>{workspace.forms.length}</strong> formularios · <strong>{workspace.forms.filter(form => form.status === 'published').length}</strong> publicados · <strong>{submitted}</strong> intentos enviados</p>
      <SectionCard>
        <div className="of-toolbar">
          <label>Buscar formulario<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Título o grupo" /></label>
          <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos los estados</option><option value="draft">Borrador</option><option value="published">Publicado</option><option value="closed">Cerrado</option></select></label>
          <label>Grupo<select value={groupId} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('group', event.target.value); else next.delete('group'); setParams(next); }}><option value="">Todos los grupos</option>{workspace.groups.map(group => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select></label>
        </div>
      </SectionCard>
      {filtered.length ? (
        <div className="of-list">
          {filtered.map(form => (
            <article className="of-card" key={form.id}>
              <div>
                <div className="of-pills"><StatusPill tone={statusTones[form.status]}>{statusLabels[form.status]}</StatusPill><span className="of-hint">{groupLabel(workspace.groups.find(group => group.id === form.group_id))}</span></div>
                <h2><Link to={`/forms/${form.id}`}>{form.title}</Link></h2>
                <p>{form.question_count} preguntas por alumno · {form.pool_count} candidatas</p>
                <div className="of-card-meta"><span>{form.submitted_count || 0} intentos enviados</span><span>{form.time_limit_minutes ? `${form.time_limit_minutes} min por intento` : 'Sin límite de tiempo'}</span><span>{form.closes_at ? `Cierre: ${dateTime(form.closes_at)}` : 'Cierre manual'}</span></div>
              </div>
              <div className="of-card-actions"><Link className="button secondary" to={`/forms/${form.id}`}>{form.status === 'draft' ? 'Revisar borrador' : 'Ver formulario y resultados'}<Icon name="arrow" /></Link></div>
            </article>
          ))}
        </div>
      ) : <EmptyState icon="exam" title={workspace.forms.length ? 'No hay formularios con estos filtros' : 'Crea tu primer formulario'}
        detail={workspace.forms.length ? 'Prueba otro título, estado o grupo.' : 'Elige preguntas de tu banco y publica un enlace para que el alumnado responda en línea.'}
        action={workspace.forms.length ? <button type="button" className="button secondary" onClick={() => { setQuery(''); setStatus(''); const next = new URLSearchParams(params); next.delete('group'); setParams(next); }}>Limpiar filtros</button> : <Link className="button primary" to={createLink}>Crear formulario</Link>} />}
    </div>
  );
}

function FormOverview({ form, group }: { form: OnlineForm; group?: GroupRecord }) {
  const sections = form.sections || [];
  return (
    <>
      <dl className="of-overview">
        <div><dt>Grupo</dt><dd>{groupLabel(group)}</dd></div>
        <div><dt>Preguntas por alumno</dt><dd>{form.question_count} de {form.pool_count} candidatas</dd></div>
        <div><dt>Intentos máximos</dt><dd>{form.max_attempts}</dd></div>
        <div><dt>Tiempo por intento</dt><dd>{form.time_limit_minutes ? `${form.time_limit_minutes} minutos` : 'Sin límite'}</dd></div>
        <div><dt>Apertura</dt><dd>{form.opens_at ? dateTime(form.opens_at) : 'Al publicar'}</dd></div>
        <div><dt>Cierre</dt><dd>{form.closes_at ? dateTime(form.closes_at) : 'Manual'}</dd></div>
        <div><dt>Opciones de respuesta</dt><dd>{form.shuffle_options ? 'Orden mezclado' : 'Orden original'}</dd></div>
        <div><dt>Retroalimentación</dt><dd>{feedbackLabels[form.feedback_mode]}</dd></div>
        <div><dt>Valor por pregunta</dt><dd>1 punto</dd></div>
      </dl>
      {sections.length > 1 ? <div className="of-detail-quota">{sections.map(section => <StatusPill key={section.id} tone="blue">{section.title}: {section.draw_count} de {(section.items || []).length}</StatusPill>)}</div> : null}
      {form.instructions ? <div className="of-instructions"><h3>Instrucciones para el alumno</h3><p>{form.instructions}</p></div> : null}
    </>
  );
}

function AttemptDialog({ attempt, detail, onDismiss }: { attempt: OnlineFormAttempt; detail: OnlineFormDetail; onDismiss: () => void }) {
  const items = new Map(detail.results.items.map(item => [item.id, item]));
  const responses = new Map(attempt.responses.map(response => [response.item_id, response]));
  return (
    <ActionDialog className="of-dialog" eyebrow="TEDVIO · RESULTADO INDIVIDUAL" title={attempt.display_name} detail={`${attempt.enrollment || 'Sin matrícula'} · Intento ${attempt.attempt_no}`} onDismiss={onDismiss} focusStart>
      <dl className="of-overview">
        <div><dt>Estado</dt><dd>{attempt.status === 'submitted' ? (attempt.auto_submitted ? 'Enviado automáticamente' : 'Enviado') : 'En curso'}</dd></div>
        <div><dt>Calificación sobre 10</dt><dd>{resultGrade(attempt)}</dd></div>
        <div><dt>Inicio</dt><dd>{dateTime(attempt.started_at)}</dd></div>
        <div><dt>Envío</dt><dd>{attempt.submitted_at ? dateTime(attempt.submitted_at) : 'Pendiente'}</dd></div>
      </dl>
      <div className="of-result-details">
        {attempt.item_ids.length ? attempt.item_ids.map((id, index) => {
          const item = items.get(id);
          const response = responses.get(id);
          const answered = response?.answer != null && response.answer !== '';
          if (!item) return <article key={id}><h3>Pregunta {index + 1}</h3><p>El detalle de esta pregunta no está disponible.</p></article>;
          return (
            <article key={id}>
              <h3>{index + 1}. {item.prompt}</h3>
              <StatusPill tone={!answered ? 'neutral' : response?.is_correct === true ? 'green' : response?.is_correct === false ? 'red' : 'blue'}>{!answered ? 'Sin respuesta' : response?.is_correct === true ? 'Correcta' : response?.is_correct === false ? 'Incorrecta' : 'Respuesta registrada'}</StatusPill>
              <p><span className="of-answer-label">Respuesta del alumno: </span>{answered ? response?.answer : 'Sin respuesta'}</p>
              <p><span className="of-answer-label">Respuesta correcta: </span>{item.correct_answer}</p>
              {item.explanation ? <p>{item.explanation}</p> : null}
            </article>
          );
        }) : <p className="of-hint">No hay preguntas registradas para este intento.</p>}
      </div>
    </ActionDialog>
  );
}

function OnlineFormDetailView({ detail, groups, onEdit, onRefresh, refreshing }: {
  detail: OnlineFormDetail;
  groups: GroupRecord[];
  onEdit: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { form } = detail;
  const sections = form.sections || detail.results.sections || [];
  const hasAttempts = (form.attempt_count || 0) > 0 || detail.attempts.length > 0;
  const editable = form.status === 'draft' && !hasAttempts;
  const [confirmation, setConfirmation] = useState<'publish' | 'close' | null>(null);
  const [notice, setNotice] = useState('');
  const [copyError, setCopyError] = useState('');
  const [resultQuery, setResultQuery] = useState('');
  const [resultStatus, setResultStatus] = useState('');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const linkInput = useRef<HTMLInputElement>(null);
  const studentUrl = onlineFormStudentUrl(form);
  const selectedAttempt = detail.attempts.find(attempt => attempt.id === selectedAttemptId);
  const group = groups.find(item => item.id === form.group_id);
  const completed = detail.attempts.filter(attempt => attempt.status === 'submitted').length;
  const filteredAttempts = useMemo(() => {
    const needle = resultQuery.trim().toLocaleLowerCase('es-MX');
    return detail.attempts.filter(attempt => (!resultStatus || attempt.status === resultStatus)
      && (!needle || [attempt.display_name, attempt.enrollment].join(' ').toLocaleLowerCase('es-MX').includes(needle)))
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }, [detail.attempts, resultQuery, resultStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredAttempts.length / 20));
  const currentPage = Math.min(page, pageCount);
  const visibleAttempts = filteredAttempts.slice((currentPage - 1) * 20, currentPage * 20);

  const statusMutation = useMutation({
    mutationKey: ['online-form-write', auth.user?.id],
    mutationFn: async (action: 'publish' | 'close') => {
      if (!auth.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      if (action === 'publish') {
        const latest = await fetchOnlineFormDetail(auth.user, form.id);
        if (latest.form.status !== 'draft' || (latest.form.attempt_count || 0) > 0 || latest.attempts.length > 0 || latest.form.updated_at !== form.updated_at) throw new Error('El borrador cambió. Actualiza el formulario y revisa la configuración antes de publicar.');
        await publishOnlineForm(auth.user, form.id);
      } else await closeOnlineForm(auth.user, form.id);
      return action;
    },
    onSuccess: action => {
      const status: OnlineFormStatus = action === 'publish' ? 'published' : 'closed';
      queryClient.setQueryData<OnlineFormDetail>(onlineFormDetailKey(auth.user?.id, form.id), previous => previous ? {
        ...previous, form: { ...previous.form, status }, results: { ...previous.results, form: { ...previous.results.form, status } },
      } : previous);
      void queryClient.invalidateQueries({ queryKey: onlineFormsWorkspaceKey(auth.user?.id) });
      void queryClient.invalidateQueries({ queryKey: onlineFormDetailKey(auth.user?.id, form.id) });
      setConfirmation(null);
      setNotice(action === 'publish' ? 'Formulario publicado. Ya puedes copiar el enlace para tus alumnos.' : 'Formulario cerrado. Los resultados permanecen disponibles.');
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!auth.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión para descargar los resultados.');
      const fresh = await fetchOnlineFormDetail(auth.user, form.id);
      queryClient.setQueryData(onlineFormDetailKey(auth.user.id, form.id), fresh);
      await exportOnlineFormResults(fresh);
    },
    onSuccess: () => setNotice('Se preparó la descarga de los resultados en Excel.'),
  });

  async function copyLink() {
    setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(studentUrl);
      setNotice('Enlace copiado.');
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyError('No se pudo copiar automáticamente. El enlace está seleccionado para que puedas copiarlo.');
    }
  }

  function confirm(action: 'publish' | 'close') { statusMutation.reset(); setConfirmation(action); }
  const busy = statusMutation.isPending;

  return (
    <div className="view-stack online-forms-page">
      <Link className="of-back" to="/forms">← Volver a formularios</Link>
      <PageHeader eyebrow="EVALUAR · FORMULARIOS" title={form.title} detail={`${form.question_count} preguntas por alumno · ${groupLabel(group)}`}
        actions={<>
          <StatusPill tone={statusTones[form.status]}>{statusLabels[form.status]}</StatusPill>
          {editable ? <><button type="button" className="button secondary" disabled={busy} onClick={onEdit}>Editar borrador</button><button type="button" className="button primary" disabled={busy} onClick={() => confirm('publish')}>Publicar formulario</button></> : form.status === 'published' ? <button type="button" className="button secondary" disabled={busy} onClick={() => confirm('close')}>Cerrar formulario</button> : null}
        </>} />
      {notice ? <p className="of-message success" role="status">{notice}</p> : null}
      {form.status !== 'draft' ? (
        <SectionCard>
          <div className="of-share">
            <label className="of-field">Enlace para alumnos<input ref={linkInput} value={studentUrl} readOnly onFocus={event => event.target.select()} /></label>
            <div><button type="button" className="button primary" onClick={() => void copyLink()}>Copiar enlace</button><a className="button secondary" href={studentUrl} target="_blank" rel="noopener noreferrer">Abrir<Icon name="external" /></a></div>
          </div>
          {copyError ? <p className="of-hint" role="alert">{copyError}</p> : null}
          <p className="of-hint">{form.status === 'closed' ? 'El formulario está cerrado. Puedes conservar el enlace como referencia.' : 'Comparte este enlace con tus alumnos. El acceso respeta las fechas de apertura y cierre configuradas.'}</p>
        </SectionCard>
      ) : <p className="of-message neutral">{hasAttempts ? 'Este formulario ya tiene intentos registrados y su configuración está protegida.' : 'Este borrador aún no está disponible para los alumnos. Revisa la configuración antes de publicarlo.'}</p>}
      <SectionCard>
        <h2 className="of-section-title">Configuración</h2><p className="of-section-intro">{editable ? 'Podrás editar estos datos mientras el formulario sea un borrador.' : 'Las preguntas y la configuración se conservan con la versión aplicada.'}</p>
        <FormOverview form={{ ...form, sections }} group={group} />
        <details className="of-pool-preview">
          <summary>Revisar {form.pool_count} preguntas candidatas</summary>
          <ol>{sections.flatMap(section => (section.items || []).map(item => <li key={item.id}>{item.prompt}<small>{sections.length > 1 ? section.title : item.topic || 'Sin tema'}</small></li>))}</ol>
        </details>
      </SectionCard>
      <SectionCard>
        <div className="of-results-head">
          <div><h2>Resultados por intento</h2><p>{completed} enviados · {detail.attempts.length - completed} en curso. Cada fila corresponde a un intento individual.</p></div>
          <div className="of-actions"><button className="button secondary" type="button" onClick={onRefresh} disabled={refreshing || busy}><Icon name="refresh" />{refreshing ? 'Actualizando…' : 'Actualizar resultados'}</button><button type="button" className="button primary" disabled={!detail.attempts.length || exportMutation.isPending} onClick={() => { exportMutation.reset(); exportMutation.mutate(); }}>{exportMutation.isPending ? 'Preparando Excel…' : 'Descargar Excel'}</button></div>
        </div>
        {exportMutation.isError ? <p className="of-message error" role="alert">{onlineFormError(exportMutation.error)}</p> : null}
        {detail.attempts.length ? (
          <>
            <div className="of-grid-two of-results-filters">
              <label className="of-field">Buscar alumno<input type="search" value={resultQuery} onChange={event => { setResultQuery(event.target.value); setPage(1); }} placeholder="Nombre o matrícula" /></label>
              <label className="of-field">Estado del intento<select value={resultStatus} onChange={event => { setResultStatus(event.target.value); setPage(1); }}><option value="">Todos los intentos</option><option value="submitted">Enviados</option><option value="in_progress">En curso</option></select></label>
            </div>
            {visibleAttempts.length ? <div className="of-results-scroll" tabIndex={0} aria-label="Tabla de resultados con desplazamiento horizontal">
              <table className="of-results-table">
                <caption>Resultados individuales del formulario {form.title}</caption>
                <thead><tr><th scope="col">Alumno</th><th scope="col">Intento</th><th scope="col">Estado</th><th scope="col">Puntos</th><th scope="col">Calificación / 10</th><th scope="col">Inicio / envío</th><th scope="col">Detalle</th></tr></thead>
                <tbody>{visibleAttempts.map(attempt => <tr key={attempt.id}>
                  <td><strong>{attempt.display_name}</strong><small>{attempt.enrollment || 'Sin matrícula'}</small></td>
                  <td>{attempt.attempt_no}</td>
                  <td><StatusPill tone={attempt.status === 'submitted' ? 'green' : 'blue'}>{attempt.status === 'submitted' ? 'Enviado' : 'En curso'}</StatusPill>{attempt.auto_submitted ? <small>Envío automático</small> : null}</td>
                  <td>{attempt.status === 'submitted' && attempt.score != null ? `${attempt.score} / ${attempt.max_score ?? form.question_count}` : '—'}</td>
                  <td><span className="of-result-grade">{resultGrade(attempt)}</span></td>
                  <td>{dateTime(attempt.started_at)}<small>{attempt.submitted_at ? `Envío: ${dateTime(attempt.submitted_at)}` : 'Envío pendiente'}</small></td>
                  <td><button className="button ghost compact" type="button" aria-label={`Ver respuestas de ${attempt.display_name}, intento ${attempt.attempt_no}`} onClick={() => setSelectedAttemptId(attempt.id)}>Ver respuestas</button></td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="of-bank-empty">No hay intentos que coincidan con esta búsqueda.</p>}
            {pageCount > 1 ? <div className="of-pagination"><button type="button" className="button ghost compact" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage} de {pageCount}</span><button type="button" className="button ghost compact" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div> : null}
            <p className="of-hint">La descarga de Excel incluye los resultados del formulario completo, aunque haya filtros activos en esta tabla.</p>
          </>
        ) : <EmptyState icon="grades" title="Todavía no hay intentos registrados" detail={form.status === 'draft' ? 'Los resultados aparecerán después de publicar el formulario y recibir respuestas.' : 'Cuando un alumno comience, podrás consultar su avance y su resultado. Usa Actualizar resultados para revisar nuevos envíos.'} />}
      </SectionCard>
      {confirmation ? <ActionDialog className="of-dialog" eyebrow="TEDVIO · FORMULARIOS" title={confirmation === 'publish' ? '¿Publicar este formulario?' : '¿Cerrar este formulario?'}
        detail={confirmation === 'publish' ? 'Las preguntas y la configuración quedarán fijadas. El alumnado podrá responder según las fechas configuradas.' : 'Se cerrará el acceso y los intentos en curso se enviarán automáticamente con las respuestas guardadas. Los resultados se conservarán para su consulta y descarga.'}
        confirmLabel={confirmation === 'publish' ? 'Publicar y obtener enlace' : 'Cerrar formulario'} danger={confirmation === 'close'} busy={busy}
        error={statusMutation.isError ? onlineFormError(statusMutation.error) : undefined} onDismiss={() => setConfirmation(null)} onConfirm={() => statusMutation.mutate(confirmation)}>
        {confirmation === 'publish' ? <dl className="of-overview"><div><dt>Preguntas por alumno</dt><dd>{form.question_count}</dd></div><div><dt>Intentos máximos</dt><dd>{form.max_attempts}</dd></div><div><dt>Tiempo</dt><dd>{form.time_limit_minutes ? `${form.time_limit_minutes} minutos` : 'Sin límite'}</dd></div><div><dt>Acceso</dt><dd>{form.group_id ? `Matrículas de ${groupLabel(group)}` : 'Por enlace, con nombre y matrícula'}</dd></div><div><dt>Apertura</dt><dd>{form.opens_at ? dateTime(form.opens_at) : 'Al publicar'}</dd></div><div><dt>Cierre</dt><dd>{form.closes_at ? dateTime(form.closes_at) : 'Manual'}</dd></div><div><dt>Retroalimentación</dt><dd>{feedbackLabels[form.feedback_mode]}</dd></div></dl> : null}
      </ActionDialog> : null}
      {selectedAttempt ? <AttemptDialog attempt={selectedAttempt} detail={detail} onDismiss={() => setSelectedAttemptId(null)} /> : null}
    </div>
  );
}

export function OnlineFormsPage({ create = false }: { create?: boolean }) {
  const auth = useAuth();
  const { formId: routeFormId } = useParams();
  const formId = create ? 'new' : routeFormId;
  const [params] = useSearchParams();
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [formId]);

  const workspace = useQuery({
    queryKey: onlineFormsWorkspaceKey(auth.user?.id),
    queryFn: () => { if (!auth.user) throw new Error('No hay una sesión docente activa.'); return fetchOnlineFormsWorkspace(auth.user); },
    enabled: Boolean(auth.user),
  });
  const detail = useQuery({
    queryKey: onlineFormDetailKey(auth.user?.id, formId),
    queryFn: () => { if (!auth.user || !formId || formId === 'new') throw new Error('No se puede abrir el formulario.'); return fetchOnlineFormDetail(auth.user, formId); },
    enabled: Boolean(auth.user && formId && formId !== 'new'),
  });

  if (workspace.isLoading) return <LoadingScreen label="Abriendo Formularios…" />;
  if (workspace.isError && !workspace.data) return <ErrorPanel title="No se pudieron cargar los formularios" detail={onlineFormError(workspace.error)} onRetry={() => void workspace.refetch()} />;
  if (!workspace.data) return <ErrorPanel title="Formularios no disponibles" detail="Inicia sesión para abrir tu espacio docente." />;

  if (!formId) return <>{workspace.isError ? <ErrorPanel title="No se pudo actualizar la lista" detail={onlineFormError(workspace.error)} onRetry={() => void workspace.refetch()} /> : null}<OnlineFormsHome workspace={workspace.data} /></>;
  if (formId === 'new') {
    const requestedGroup = params.get('group') || '';
    const group = workspace.data.groups.find(item => item.id === requestedGroup);
    return <OnlineFormEditor key={`new-${group?.id || ''}`} workspace={workspace.data} initialDraft={emptyOnlineFormDraft(group?.id || '')} />;
  }
  if (detail.isLoading) return <LoadingScreen label="Abriendo el formulario…" />;
  if (detail.isError && !detail.data) return <ErrorPanel title="No se pudo abrir el formulario" detail={onlineFormError(detail.error)} onRetry={() => void detail.refetch()} />;
  if (!detail.data) return <ErrorPanel title="Formulario no disponible" detail="No se encontró el formulario solicitado." />;
  if (editing && detail.data.form.status === 'draft' && !(detail.data.form.attempt_count || 0) && !detail.data.attempts.length) return <OnlineFormEditor key={detail.data.form.id} workspace={{ ...workspace.data, questions: detail.data.candidates }} initialDraft={onlineFormDraftFromDetail(detail.data)} initialUpdatedAt={detail.data.form.updated_at} onCancel={() => setEditing(false)} />;

  return <>{detail.isError ? <ErrorPanel title="No se pudieron actualizar los resultados" detail={onlineFormError(detail.error)} onRetry={() => void detail.refetch()} /> : null}<OnlineFormDetailView key={formId} detail={detail.data} groups={workspace.data.groups} onEdit={() => setEditing(true)} onRefresh={() => void detail.refetch()} refreshing={detail.isFetching} /></>;
}
