import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analyzeExam,
  answerLetter,
  buildExamBlueprint,
  duplicateExam,
  emptyExamDraft,
  examDetailKey,
  examDraftFromDetail,
  examWorkspaceKey,
  fetchExamDetail,
  fetchExamWorkspace,
  saveExamDraft,
  setExamStatus,
  versionLabels,
  type ExamAnalytics,
  type ExamDetail,
  type ExamDraft,
  type ExamStatus,
  type ExamWorkspace,
  type PaperExam,
  type PaperExamQuestion,
} from '../../core/exams';
import type { BankQuestion } from '../../core/bank';
import type { GroupRecord } from '../../core/types';
import {
  EmptyState,
  ErrorPanel,
  LegacyBridge,
  LoadingScreen,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusPill,
} from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const statusLabels: Record<ExamStatus, string> = {
  draft: 'Borrador',
  ready: 'Lista',
  closed: 'Cerrada',
  archived: 'Archivada',
};

const statusTones: Record<ExamStatus, string> = {
  draft: 'amber',
  ready: 'green',
  closed: 'blue',
  archived: 'neutral',
};

function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Sin grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo']
    .filter(Boolean)
    .join(' · ');
}

function shortDate(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function grade(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(1);
}

function percent(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value) * 100)}%`;
}

function questionTypeLabel(value: string): string {
  return value === 'true_false' ? 'Verdadero / Falso' : 'Opción múltiple';
}

function blueprintLetter(question: { options: string[]; correct_answer: string }): string {
  const index = question.options.indexOf(question.correct_answer);
  return index >= 0 ? String.fromCharCode(65 + index) : '—';
}

function ExamCard({
  exam,
  workspace,
}: {
  exam: PaperExam;
  workspace: ExamWorkspace;
}) {
  const group = workspace.groups.find((item) => item.id === exam.group_id) || null;
  const period = workspace.periods.find((item) => item.id === exam.period_id) || null;
  const summary = workspace.summaries[exam.id];
  return (
    <article className={`exam-card status-${exam.status}`}>
      <header>
        <div>
          <div className="exam-card-pills">
            <StatusPill tone={statusTones[exam.status]}>{statusLabels[exam.status]}</StatusPill>
            <StatusPill tone="blue">{exam.versions.join(' / ')}</StatusPill>
            {exam.source_mode === 'key_only' ? <StatusPill>Clave heredada</StatusPill> : null}
          </div>
          <h2>{exam.title}</h2>
          <p>{groupLabel(group)}</p>
        </div>
        <span className="exam-date">{shortDate(exam.exam_date)}</span>
      </header>
      <div className="exam-card-metrics">
        <span><small>Reactivos</small><b>{exam.question_count}</b></span>
        <span><small>Resultados</small><b>{summary?.results || 0}</b></span>
        <span><small>Promedio</small><b>{grade(summary?.average)}</b></span>
        <span><small>Aprobación</small><b>{percent(summary?.passRate)}</b></span>
      </div>
      <div className="exam-card-detail">
        <span>{period ? `${period.name} · ${period.status === 'closed' ? 'cerrado' : 'abierto'}` : 'Sin periodo asignado'}</span>
        <span>Actualizada {dateTime(exam.updated_at)}</span>
      </div>
      <footer>
        <Link className="button secondary compact" to={`/exams/${exam.id}`}>Abrir evaluación</Link>
      </footer>
    </article>
  );
}

function ExamsHome({ workspace }: { workspace: ExamWorkspace }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return workspace.exams.filter((exam) => {
      if (!showArchived && exam.status === 'archived') return false;
      if (status && exam.status !== status) return false;
      if (groupId && exam.group_id !== groupId) return false;
      if (!needle) return true;
      const group = workspace.groups.find((item) => item.id === exam.group_id);
      return [
        exam.title,
        exam.subject,
        group?.name,
        group?.group_name,
        group?.program,
        workspace.periods.find((item) => item.id === exam.period_id)?.name,
      ].filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(needle);
    });
  }, [groupId, query, showArchived, status, workspace]);

  const active = workspace.exams.filter((exam) => exam.status !== 'archived');
  const resultCount = active.reduce((sum, exam) => sum + (workspace.summaries[exam.id]?.results || 0), 0);
  const averages = active
    .map((exam) => workspace.summaries[exam.id]?.average)
    .filter((value): value is number => value != null);
  const overallAverage = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;

  return (
    <div className="view-stack exams-page">
      <PageHeader
        eyebrow="ETAPA 4A · EVALUACIÓN"
        title="Evaluaciones"
        detail="Construye exámenes desde Question Studio, genera versiones y conserva una fotografía estable de cada reactivo."
        actions={<Link className="button primary" to="/exams/new">＋ Nueva evaluación</Link>}
      />

      <section className="metric-grid four">
        <MetricCard label="Evaluaciones activas" value={String(active.length)} detail={`${workspace.exams.filter((exam) => exam.status === 'draft').length} en borrador`} icon="exam" tone="blue" />
        <MetricCard label="Listas para aplicar" value={String(workspace.exams.filter((exam) => exam.status === 'ready').length)} detail="Composición protegida" icon="check" tone="green" />
        <MetricCard label="Resultados" value={String(resultCount)} detail="Capturas conservadas" icon="grades" tone="violet" />
        <MetricCard label="Promedio general" value={grade(overallAverage)} detail="Solo evaluaciones con datos" icon="reports" tone="amber" />
      </section>

      <SectionCard>
        <div className="exam-toolbar">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evaluación, grupo, materia o periodo" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option><option value="draft">Borrador</option><option value="ready">Lista</option><option value="closed">Cerrada</option><option value="archived">Archivada</option></select>
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Todos los grupos</option>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select>
          <label className="toggle-field"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivadas</label>
          <StatusPill tone="blue">{filtered.length} de {workspace.exams.length}</StatusPill>
        </div>
      </SectionCard>

      {filtered.length ? (
        <section className="exam-grid">
          {filtered.map((exam) => <ExamCard key={exam.id} exam={exam} workspace={workspace} />)}
        </section>
      ) : (
        <EmptyState
          icon="exam"
          title={workspace.exams.length ? 'No hay coincidencias' : 'Aún no has creado evaluaciones'}
          detail={workspace.exams.length ? 'Ajusta los filtros para encontrarla.' : 'Selecciona reactivos revisados de tu Banco y TEDVIO generará versiones compatibles con OMR.'}
          action={<Link className="button primary" to="/exams/new">Crear primera evaluación</Link>}
        />
      )}

      <section className="exam-integration-note">
        <Icon name="bank" />
        <div><span className="eyebrow">QUESTION STUDIO → EVALUACIÓN</span><h2>El examen guarda una copia estable de cada reactivo.</h2><p>Editar después una pregunta del Banco no cambia una evaluación ya preparada. Los resultados históricos siguen apuntando a la versión exacta aplicada.</p></div>
        <Link className="button secondary" to="/bank">Abrir Banco</Link>
      </section>
    </div>
  );
}

function SelectedQuestionRow({
  question,
  position,
  points,
  first,
  last,
  onMove,
  onRemove,
  onPoints,
}: {
  question: BankQuestion;
  position: number;
  points: number;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onPoints: (value: number) => void;
}) {
  return (
    <article className="exam-selected-row">
      <b className="exam-position">{position}</b>
      <div><h3>{question.prompt}</h3><p>{[question.subject, question.topic, question.difficulty].filter(Boolean).join(' · ') || 'Sin clasificación'}</p></div>
      <label>Puntos<input type="number" min="0.001" step="0.25" value={points} onChange={(event) => onPoints(Number(event.target.value))} /></label>
      <div className="exam-row-actions">
        <button className="icon-button compact-icon" type="button" disabled={first} onClick={() => onMove(-1)} aria-label="Subir reactivo">↑</button>
        <button className="icon-button compact-icon" type="button" disabled={last} onClick={() => onMove(1)} aria-label="Bajar reactivo">↓</button>
        <button className="icon-button compact-icon" type="button" onClick={onRemove} aria-label="Quitar reactivo">×</button>
      </div>
    </article>
  );
}

function ExamEditor({
  workspace,
  initialDraft,
}: {
  workspace: ExamWorkspace;
  initialDraft: ExamDraft;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initialDraft);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [previewVersion, setPreviewVersion] = useState(initialDraft.versions[0] || 'A');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!draft.versions.includes(previewVersion)) setPreviewVersion(draft.versions[0] || 'A');
  }, [draft.versions, previewVersion]);

  const selectedMap = useMemo(() => new Map(draft.questions.map((item) => [item.bankQuestionId, item])), [draft.questions]);
  const bankMap = useMemo(() => new Map(workspace.bankQuestions.map((question) => [question.id, question])), [workspace.bankQuestions]);
  const subjects = useMemo(() => [...new Set(workspace.bankQuestions.map((question) => question.subject).filter(Boolean) as string[])].sort(), [workspace.bankQuestions]);
  const topics = useMemo(() => [...new Set(workspace.bankQuestions.map((question) => question.topic).filter(Boolean) as string[])].sort(), [workspace.bankQuestions]);
  const available = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return workspace.bankQuestions.filter((question) => {
      if (subjectFilter && question.subject !== subjectFilter) return false;
      if (topicFilter && question.topic !== topicFilter) return false;
      if (!needle) return true;
      return [question.title, question.prompt, question.subject, question.topic, question.folder, ...(question.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-MX')
        .includes(needle);
    });
  }, [query, subjectFilter, topicFilter, workspace.bankQuestions]);

  const selectedGroup = workspace.groups.find((group) => group.id === draft.groupId) || null;
  const periods = workspace.periods.filter((period) => period.group_id === draft.groupId && (period.status === 'open' || period.id === draft.periodId));
  const selectedQuestions = draft.questions
    .map((selection) => ({ selection, question: bankMap.get(selection.bankQuestionId) }))
    .filter((item): item is { selection: ExamDraft['questions'][number]; question: BankQuestion } => Boolean(item.question));

  const preview = useMemo(() => {
    try {
      return { data: buildExamBlueprint(draft, workspace.bankQuestions), error: '' };
    } catch (error) {
      return { data: {} as ReturnType<typeof buildExamBlueprint>, error: (error as Error).message };
    }
  }, [draft, workspace.bankQuestions]);

  const totalPoints = draft.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);

  const saveMutation = useMutation({
    mutationFn: async (markReady: boolean) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      const examId = await saveExamDraft(auth.user, draft, workspace.bankQuestions);
      if (markReady) await setExamStatus(auth.user, examId, 'ready');
      return examId;
    },
    onSuccess: async (examId) => {
      setNotice('Evaluación guardada.');
      await queryClient.invalidateQueries({ queryKey: examWorkspaceKey(auth.user?.id) });
      await queryClient.invalidateQueries({ queryKey: examDetailKey(auth.user?.id, examId) });
      navigate(`/exams/${examId}`);
    },
  });

  function setGroup(groupId: string) {
    const group = workspace.groups.find((item) => item.id === groupId);
    setDraft((current) => ({
      ...current,
      groupId,
      periodId: '',
      subject: current.subject || group?.subject || '',
    }));
  }

  function addQuestion(questionId: string) {
    if (selectedMap.has(questionId) || draft.questions.length >= 60) return;
    setDraft((current) => ({ ...current, questions: [...current.questions, { bankQuestionId: questionId, points: 1 }] }));
  }

  function removeQuestion(index: number) {
    setDraft((current) => ({ ...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function moveQuestion(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= draft.questions.length) return;
    setDraft((current) => {
      const questions = [...current.questions];
      const source = questions[index];
      const destination = questions[target];
      if (!source || !destination) return current;
      questions[index] = destination;
      questions[target] = source;
      return { ...current, questions };
    });
  }

  function setPoints(index: number, value: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, itemIndex) => itemIndex === index ? { ...question, points: Math.max(0.001, value || 1) } : question),
    }));
  }

  const error = saveMutation.error as Error | null;

  return (
    <div className="view-stack exams-page exam-editor-page">
      <PageHeader
        eyebrow={draft.id ? 'EDITAR EVALUACIÓN' : 'NUEVA EVALUACIÓN'}
        title={draft.id ? draft.title || 'Editar borrador' : 'Construir evaluación'}
        detail="Selecciona reactivos objetivos, organiza la versión A y deja que TEDVIO genere versiones equivalentes."
        actions={<Link className="button secondary" to={draft.id ? `/exams/${draft.id}` : '/exams'}>← Volver</Link>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error ? <ErrorPanel title="No se pudo guardar la evaluación" detail={error.message} /> : null}

      <SectionCard className="exam-config-card">
        <div className="section-heading"><div><span className="eyebrow">1 · CONFIGURACIÓN</span><h2>Datos académicos</h2><p>El periodo se vincula al grupo y respeta los cierres protegidos.</p></div><StatusPill tone="amber">Borrador editable</StatusPill></div>
        <div className="form-grid three">
          <label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Parcial 1 · Anatomía" /></label>
          <label>Materia<input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="Anatomía Humana" /></label>
          <label>Fecha<input type="date" value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} /></label>
          <label>Grupo<select value={draft.groupId} onChange={(event) => setGroup(event.target.value)}><option value="">Sin grupo / plantilla general</option>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select></label>
          <label>Periodo<select value={draft.periodId} disabled={!draft.groupId} onChange={(event) => setDraft({ ...draft, periodId: event.target.value })}><option value="">Asignación automática por fecha</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {shortDate(period.starts_on)}–{shortDate(period.ends_on)}</option>)}</select></label>
          <label>Calificación aprobatoria<input type="number" min="0" max="10" step="0.1" value={draft.passingScore} onChange={(event) => setDraft({ ...draft, passingScore: Number(event.target.value) })} /></label>
        </div>
        <label className="wide-field">Instrucciones<textarea rows={3} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Indicaciones que acompañarán la evaluación" /></label>
        {selectedGroup ? <div className="context-strip"><Icon name="groups" /><span><b>{groupLabel(selectedGroup)}</b><small>{selectedGroup.school_cycle || selectedGroup.term || 'Sin ciclo escolar'}</small></span></div> : null}
      </SectionCard>

      <section className="exam-builder-grid">
        <SectionCard className="exam-selection-panel">
          <div className="section-heading"><div><span className="eyebrow">2 · COMPOSICIÓN</span><h2>Reactivos seleccionados</h2><p>Este orden define la versión A. Cada reactivo queda congelado al guardar.</p></div><StatusPill tone="blue">{draft.questions.length} / 60</StatusPill></div>
          {selectedQuestions.length ? (
            <div className="exam-selected-list">
              {selectedQuestions.map(({ selection, question }, index) => (
                <SelectedQuestionRow
                  key={question.id}
                  question={question}
                  position={index + 1}
                  points={selection.points}
                  first={index === 0}
                  last={index === selectedQuestions.length - 1}
                  onMove={(delta) => moveQuestion(index, delta)}
                  onRemove={() => removeQuestion(index)}
                  onPoints={(value) => setPoints(index, value)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="bank" title="Selecciona reactivos del Banco" detail="La evaluación objetiva admite opción múltiple y verdadero/falso con una respuesta correcta única." />
          )}
          <div className="exam-selection-summary"><span><small>Puntaje interno</small><b>{totalPoints.toFixed(2)}</b></span><span><small>Opciones máximas</small><b>{selectedQuestions.reduce((max, item) => Math.max(max, Array.isArray(item.question.options) ? item.question.options.length : 0), 0) || '—'}</b></span><span><small>Temas</small><b>{new Set(selectedQuestions.map((item) => item.question.topic).filter(Boolean)).size}</b></span></div>
        </SectionCard>

        <SectionCard className="exam-bank-panel">
          <div className="section-heading"><div><span className="eyebrow">QUESTION STUDIO</span><h2>Banco compatible</h2><p>Solo se muestran preguntas que pueden producir una clave OMR inequívoca.</p></div><Link className="button ghost compact" to="/bank">Editar Banco</Link></div>
          <div className="exam-bank-filters">
            <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar reactivo" /></label>
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">Todas las materias</option>{subjects.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}><option value="">Todos los temas</option>{topics.map((value) => <option key={value}>{value}</option>)}</select>
          </div>
          <div className="exam-bank-list">
            {available.map((question) => {
              const selected = selectedMap.has(question.id);
              const options = Array.isArray(question.options) ? question.options.map(String) : [];
              return (
                <article className={`exam-bank-question${selected ? ' selected' : ''}`} key={question.id}>
                  <div><div className="question-chips"><StatusPill tone="blue">{questionTypeLabel(question.question_type)}</StatusPill>{question.topic ? <StatusPill>{question.topic}</StatusPill> : null}</div><h3>{question.prompt}</h3><p>{options.length} opciones · clave {String.fromCharCode(65 + Math.max(0, options.indexOf(String(question.correct_answer))))}</p></div>
                  <button className={selected ? 'button ghost compact' : 'button secondary compact'} type="button" disabled={selected || draft.questions.length >= 60} onClick={() => addQuestion(question.id)}>{selected ? 'Agregada' : '＋ Agregar'}</button>
                </article>
              );
            })}
            {!available.length ? <EmptyState icon="search" title="No hay coincidencias" detail="Ajusta los filtros o crea reactivos objetivos en Question Studio." /> : null}
          </div>
        </SectionCard>
      </section>

      <SectionCard className="exam-version-panel">
        <div className="section-heading"><div><span className="eyebrow">3 · VERSIONES</span><h2>Equivalencia y clave</h2><p>TEDVIO conserva el mismo conjunto de reactivos y cambia únicamente el orden.</p></div><StatusPill tone={preview.error ? 'red' : 'green'}>{preview.error || 'Composición válida'}</StatusPill></div>
        <div className="exam-version-config">
          <label>Número de versiones<select value={draft.versions.length} onChange={(event) => setDraft({ ...draft, versions: versionLabels(Number(event.target.value)) })}><option value="1">A</option><option value="2">A y B</option><option value="3">A, B y C</option></select></label>
          <label>Estrategia<select value={draft.versionStrategy} onChange={(event) => setDraft({ ...draft, versionStrategy: event.target.value as ExamDraft['versionStrategy'] })}><option value="balanced">Orden alternado</option><option value="same">Mismo orden</option></select></label>
          <div className="exam-version-tabs">{draft.versions.map((version) => <button type="button" className={previewVersion === version ? 'active' : ''} key={version} onClick={() => setPreviewVersion(version)}>Versión {version}</button>)}</div>
        </div>
        <div className="exam-version-preview">
          {(preview.data[previewVersion] || []).map((question, index) => (
            <article key={`${previewVersion}-${question.bank_question_id}`}>
              <b>{index + 1}</b>
              <div><h3>{question.prompt}</h3><p>Origen {question.source_position} · {question.topic || 'Sin tema'} · {question.points} punto{question.points === 1 ? '' : 's'}</p></div>
              <StatusPill tone="green">Clave {blueprintLetter(question)}</StatusPill>
            </article>
          ))}
          {!draft.questions.length ? <EmptyState icon="route" title="La vista previa aparecerá aquí" detail="Agrega reactivos para comparar el orden de cada versión." /> : null}
        </div>
      </SectionCard>

      <section className="exam-save-dock">
        <div><span className="eyebrow">BORRADOR</span><b>{draft.title || 'Evaluación sin título'}</b><small>{draft.questions.length} reactivos · {draft.versions.length} versión{draft.versions.length === 1 ? '' : 'es'} · escala 0–10</small></div>
        <Link className="button ghost" to={draft.id ? `/exams/${draft.id}` : '/exams'}>Cancelar</Link>
        <button className="button secondary" type="button" disabled={saveMutation.isPending || Boolean(preview.error)} onClick={() => saveMutation.mutate(false)}>{saveMutation.isPending ? 'Guardando…' : 'Guardar borrador'}</button>
        <button className="button primary" type="button" disabled={saveMutation.isPending || Boolean(preview.error)} onClick={() => saveMutation.mutate(true)}>{saveMutation.isPending ? 'Preparando…' : 'Guardar y marcar lista'}</button>
      </section>
    </div>
  );
}

function WorkflowActions({
  detail,
  onEdit,
}: {
  detail: ExamDetail;
  onEdit: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');

  const statusMutation = useMutation({
    mutationFn: (status: ExamStatus) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return setExamStatus(auth.user, detail.exam.id, status);
    },
    onSuccess: async (exam) => {
      setNotice(`Estado actualizado: ${statusLabels[exam.status]}.`);
      await queryClient.invalidateQueries({ queryKey: examWorkspaceKey(auth.user?.id) });
      await queryClient.invalidateQueries({ queryKey: examDetailKey(auth.user?.id, detail.exam.id) });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return duplicateExam(auth.user, detail.exam.id);
    },
    onSuccess: async (examId) => {
      await queryClient.invalidateQueries({ queryKey: examWorkspaceKey(auth.user?.id) });
      navigate(`/exams/${examId}`);
    },
  });

  const hasResults = detail.results.length > 0;
  const error = (statusMutation.error || duplicateMutation.error) as Error | null;

  return (
    <>
      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error ? <ErrorPanel title="No se pudo completar la operación" detail={error.message} /> : null}
      <section className="exam-workflow-actions">
        <div><span className="eyebrow">FLUJO DE EVALUACIÓN</span><h2>{detail.exam.status === 'draft' ? 'Completa y protege la composición' : detail.exam.status === 'ready' ? 'Lista para aplicar y capturar' : detail.exam.status === 'closed' ? 'Evaluación cerrada' : 'Evaluación archivada'}</h2><p>Los cambios de estado se validan también en la base de datos.</p></div>
        <div>
          {detail.exam.status === 'draft' && detail.exam.source_mode === 'bank' && !hasResults ? <button className="button secondary" type="button" onClick={onEdit}>Editar composición</button> : null}
          {detail.exam.status === 'draft' ? <button className="button primary" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('ready')}>Marcar lista</button> : null}
          {detail.exam.status === 'ready' && !hasResults ? <button className="button ghost" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('draft')}>Volver a borrador</button> : null}
          {detail.exam.status === 'ready' ? <button className="button secondary" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('closed')}>Cerrar evaluación</button> : null}
          {detail.exam.status === 'archived' && !hasResults ? <button className="button secondary" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('draft')}>Restaurar borrador</button> : null}
          <button className="button ghost" type="button" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate()}>{duplicateMutation.isPending ? 'Duplicando…' : 'Duplicar'}</button>
          {detail.exam.status !== 'archived' ? <button className="button danger" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('archived')}>Archivar</button> : null}
        </div>
      </section>
    </>
  );
}

function OverviewTab({ detail, analytics }: { detail: ExamDetail; analytics: ExamAnalytics }) {
  return (
    <div className="exam-detail-grid">
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">CONFIGURACIÓN</span><h2>Ficha de evaluación</h2></div></div>
        <dl className="exam-definition-list">
          <div><dt>Grupo</dt><dd>{groupLabel(detail.group)}</dd></div>
          <div><dt>Periodo</dt><dd>{detail.period?.name || 'Asignación no definida'}</dd></div>
          <div><dt>Fecha</dt><dd>{shortDate(detail.exam.exam_date)}</dd></div>
          <div><dt>Versiones</dt><dd>{detail.exam.versions.join(', ')}</dd></div>
          <div><dt>Aprobatoria</dt><dd>{grade(detail.exam.passing_score)}</dd></div>
          <div><dt>Origen</dt><dd>{detail.exam.source_mode === 'bank' ? 'Question Studio' : 'Clave heredada'}</dd></div>
        </dl>
      </SectionCard>
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">COBERTURA</span><h2>Evidencia disponible</h2></div></div>
        <div className="exam-coverage-grid">
          <span><small>Padrón</small><b>{detail.roster.length}</b></span>
          <span><small>Resultados</small><b>{analytics.results}</b></span>
          <span><small>Revisados</small><b>{percent(analytics.reviewedRate)}</b></span>
          <span><small>Promedio</small><b>{grade(analytics.average)}</b></span>
        </div>
        <p className="muted-copy">{analytics.results ? `Hay evidencia para ${analytics.results} captura${analytics.results === 1 ? '' : 's'}.` : 'Todavía no existen respuestas capturadas.'}</p>
      </SectionCard>
      <SectionCard className="exam-instructions-card">
        <div className="section-heading"><div><span className="eyebrow">INSTRUCCIONES</span><h2>Indicaciones registradas</h2></div></div>
        <p>{detail.exam.instructions || 'No se registraron instrucciones adicionales.'}</p>
      </SectionCard>
    </div>
  );
}

function QuestionsTab({ detail }: { detail: ExamDetail }) {
  const [version, setVersion] = useState(detail.exam.versions[0] || 'A');
  const questions = detail.questions.filter((question) => question.version === version).sort((a, b) => a.position - b.position);
  return (
    <SectionCard>
      <div className="section-heading"><div><span className="eyebrow">COMPOSICIÓN CONGELADA</span><h2>Reactivos por versión</h2><p>La pregunta, opciones y clave corresponden exactamente a la evaluación guardada.</p></div><div className="exam-version-tabs">{detail.exam.versions.map((item) => <button key={item} type="button" className={version === item ? 'active' : ''} onClick={() => setVersion(item)}>Versión {item}</button>)}</div></div>
      {questions.length ? <div className="exam-question-table">{questions.map((question) => <article key={question.id}><b>{question.position}</b><div><h3>{question.prompt}</h3><p>Origen {question.source_position} · {[question.topic, question.difficulty, question.bloom].filter(Boolean).join(' · ') || 'Sin clasificación'}</p></div><StatusPill tone="green">Clave {answerLetter(question)}</StatusPill></article>)}</div> : <EmptyState icon="exam" title="Evaluación de clave heredada" detail="Esta evaluación se creó antes del modelo normalizado. La clave se conserva, pero no existe una fotografía individual de los reactivos." /> }
    </SectionCard>
  );
}

function ResultsTab({ detail, analytics }: { detail: ExamDetail; analytics: ExamAnalytics }) {
  if (!detail.results.length) {
    return (
      <EmptyState
        icon="grades"
        title="Aún no hay resultados"
        detail="La captura OMR se migrará en el bloque 4B. Mientras tanto, la evaluación puede aplicarse con el módulo operativo actual."
        action={<LegacyBridge groupId={detail.exam.group_id || undefined} label="Abrir OMR operativo" />}
      />
    );
  }
  return (
    <div className="view-stack compact-stack">
      <section className="metric-grid four">
        <MetricCard label="Promedio" value={grade(analytics.average)} detail={`Mediana ${grade(analytics.median)}`} icon="grades" tone="blue" />
        <MetricCard label="Aprobación" value={percent(analytics.passRate)} detail={`Mínimo ${grade(detail.exam.passing_score)}`} icon="check" tone="green" />
        <MetricCard label="Revisión" value={percent(analytics.reviewedRate)} detail={`${analytics.reviewed} confirmados`} icon="shield" tone="violet" />
        <MetricCard label="Capturas" value={String(analytics.results)} detail={`${detail.exam.versions.length} versiones`} icon="exam" tone="amber" />
      </section>
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">RESULTADOS POR ALUMNO</span><h2>Capturas registradas</h2></div></div>
        <div className="exam-results-table" role="table">
          <div className="exam-results-head" role="row"><span>Alumno</span><span>Versión</span><span>Aciertos</span><span>Blancos</span><span>Calificación</span><span>Revisión</span></div>
          {detail.results.map((result) => <div role="row" key={result.id}><span><b>{result.student_name || 'Sin nombre'}</b><small>{result.enrollment || 'Sin matrícula'}</small></span><span>{result.version}</span><span>{result.correct_count}/{detail.exam.question_count}</span><span>{result.blank_count}</span><span><b>{grade(result.score)}</b></span><span><StatusPill tone={result.reviewed ? 'green' : 'amber'}>{result.reviewed ? 'Revisada' : 'Pendiente'}</StatusPill></span></div>)}
        </div>
      </SectionCard>
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">LECTURA POR REACTIVO</span><h2>Dificultad descriptiva</h2><p>Se agrupan las posiciones equivalentes de A, B y C mediante el reactivo de origen.</p></div></div>
        {analytics.items.length ? <div className="exam-item-analysis">{analytics.items.map((item) => <article key={item.key}><b>{item.sourcePosition}</b><div><h3>{item.prompt}</h3><p>{item.topic || 'Sin tema'} · {item.total} respuestas</p></div><span><small>Acierto</small><strong>{percent(item.correctRate)}</strong></span><span><small>Blancos</small><strong>{percent(item.blankRate)}</strong></span></article>)}</div> : <p className="muted-copy">La evaluación heredada no incluye suficiente vínculo entre reactivo y versión para consolidar esta lectura.</p>}
      </SectionCard>
      {analytics.versions.length > 1 ? <SectionCard><div className="section-heading"><div><span className="eyebrow">VERSIONES</span><h2>Comparación descriptiva</h2></div></div><div className="exam-version-stats">{analytics.versions.map((version) => <article key={version.version}><span>Versión {version.version}</span><b>{grade(version.average)}</b><small>{version.results} resultados · aprobación {percent(version.passRate)}</small></article>)}</div></SectionCard> : null}
    </div>
  );
}

function ExamDetailView({
  detail,
  onEdit,
}: {
  detail: ExamDetail;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'questions' | 'results'>('overview');
  const analytics = useMemo(() => analyzeExam(detail), [detail]);

  return (
    <div className="view-stack exams-page">
      <PageHeader
        eyebrow="EVALUACIÓN"
        title={detail.exam.title}
        detail={`${detail.exam.subject || 'Sin materia'} · ${groupLabel(detail.group)} · ${shortDate(detail.exam.exam_date)}`}
        actions={<div className="page-actions"><StatusPill tone={statusTones[detail.exam.status]}>{statusLabels[detail.exam.status]}</StatusPill><Link className="button secondary" to="/exams">← Evaluaciones</Link></div>}
      />

      <section className="metric-grid four">
        <MetricCard label="Reactivos" value={String(detail.exam.question_count)} detail={`${detail.exam.versions.length} versión${detail.exam.versions.length === 1 ? '' : 'es'}`} icon="exam" tone="blue" />
        <MetricCard label="Resultados" value={String(analytics.results)} detail={`${detail.roster.length} alumnos en padrón`} icon="groups" tone="violet" />
        <MetricCard label="Promedio" value={grade(analytics.average)} detail={`Aprobación ${percent(analytics.passRate)}`} icon="grades" tone="green" />
        <MetricCard label="Estado" value={statusLabels[detail.exam.status]} detail={`Actualizada ${dateTime(detail.exam.updated_at)}`} icon="shield" tone="amber" />
      </section>

      <WorkflowActions detail={detail} onEdit={onEdit} />

      <nav className="exam-tabs" aria-label="Secciones de la evaluación">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Resumen</button>
        <button type="button" className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Reactivos</button>
        <button type="button" className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Resultados</button>
      </nav>

      {tab === 'overview' ? <OverviewTab detail={detail} analytics={analytics} /> : null}
      {tab === 'questions' ? <QuestionsTab detail={detail} /> : null}
      {tab === 'results' ? <ResultsTab detail={detail} analytics={analytics} /> : null}

      <section className="exam-next-phase">
        <Icon name="route" />
        <div><span className="eyebrow">SIGUIENTE BLOQUE · 4B</span><h2>La composición ya está preparada para OMR.</h2><p>La próxima migración conectará impresión, lectura de cámara, revisión de marcas dudosas y publicación al Libro sin cambiar este examen.</p></div>
        <LegacyBridge groupId={detail.exam.group_id || undefined} label="OMR actual" />
      </section>
    </div>
  );
}

export function ExamsPage() {
  const auth = useAuth();
  const { examId } = useParams();
  const [searchParams] = useSearchParams();
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [examId]);

  const workspace = useQuery({
    queryKey: examWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchExamWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const detail = useQuery({
    queryKey: examDetailKey(auth.user?.id, examId),
    queryFn: () => {
      if (!auth.user || !examId || examId === 'new') throw new Error('No se puede abrir la evaluación.');
      return fetchExamDetail(auth.user, examId);
    },
    enabled: Boolean(auth.user && examId && examId !== 'new'),
  });

  if (workspace.isLoading) return <LoadingScreen label="Abriendo Evaluaciones…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar Evaluaciones" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!workspace.data) return <ErrorPanel title="Evaluaciones no disponibles" detail="No se recibió el espacio académico." />;

  if (!examId) return <ExamsHome workspace={workspace.data} />;

  if (examId === 'new') {
    const requestedGroup = searchParams.get('group') || '';
    const group = workspace.data.groups.find((item) => item.id === requestedGroup);
    return <ExamEditor key={`new-${requestedGroup}`} workspace={workspace.data} initialDraft={emptyExamDraft(requestedGroup, group?.subject || '')} />;
  }

  if (detail.isLoading) return <LoadingScreen label="Abriendo la evaluación…" />;
  if (detail.isError) return <ErrorPanel title="No pude abrir la evaluación" detail={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación solicitada." />;

  if (editing) {
    return <ExamEditor key={`${detail.data.exam.id}-${detail.data.exam.updated_at}`} workspace={workspace.data} initialDraft={examDraftFromDetail(detail.data)} />;
  }

  return <ExamDetailView detail={detail.data} onEdit={() => setEditing(true)} />;
}
