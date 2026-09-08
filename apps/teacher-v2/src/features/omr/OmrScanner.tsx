import { useAcademicDraft } from '../../core/useAcademicDraft';
import { createOmrReview, omrExamSignature, omrResultSignature, type OmrReviewDraft } from '../../core/omr-review';
import { omrBatchProgress } from '../../core/omr-premium';
import { ActionDialog } from '../../shared/ActionDialog';
import { useReliability } from '../reliability/ReliabilityProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  findExistingResult,
  fetchOmrExam,
  omrExamKey,
  gradeAnswers,
  normalizeAnswers,
  saveOmrResult,
  type OmrCaptureMethod,
  type OmrExamDetail,
  type OmrResult,
} from '../../core/omr';
import {
  analyzeOmrFile,
  fingerprintFile,
  OmrPhotoQualityError,
  OMR_LETTERS,
  parseOmrPayload,
  type OmrAnswer,
  type OmrAnalysis,
  type OmrMarkQuality,
  type OmrPhotoQuality,
} from '../../core/omr-engine';
import { ErrorPanel, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

interface OmrScannerProps {
  detail: OmrExamDetail;
  initialResult?: OmrResult | null;
  batchMode?: boolean;
  batchNotice?: string;
  onSaved: (result: OmrResult, continueBatch: boolean) => void | Promise<void>;
  onCancel: () => void;
}

function initialQuality(questionCount: number): OmrMarkQuality[] {
  return Array.from({ length: questionCount }, () => ({ status: 'ambiguous', scores: [], best: 0, gap: 0 }));
}

function methodLabel(method: OmrCaptureMethod): string {
  if (method === 'camera') return 'Cámara';
  if (method === 'upload') return 'Archivo';
  if (method === 'manual') return 'Corrección manual';
  return 'Lectura heredada';
}

function studentLabelForResult(result: OmrResult): string {
  return result.student_name || result.enrollment || 'un alumno anterior';
}

function omrDraftForSession(value: OmrReviewDraft): OmrReviewDraft {
  return { ...value, previewDataUrl: '', processing: false };
}

export function OmrScanner({ detail, initialResult = null, batchMode = false, batchNotice = '', onSaved, onCancel }: OmrScannerProps) {
  const auth = useAuth();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient(), { online } = useReliability();
  const currentResult = detail.results.find(row => row.id === initialResult?.id) || initialResult;
  const review = useAcademicDraft(
    ['omr-draft', auth.user?.id, detail.exam.id, initialResult?.id || 'new'],
    createOmrReview(detail, currentResult),
    { persistInSession: true, prepareForStorage: omrDraftForSession },
  );
  const { captureMethod, studentId, enrollment, studentName, version, identitySource, identityConfirmed, answers, originalAnswers, quality, previewDataUrl, qrValue, sourceFingerprint, analysisSize, photoQuality, analysisDurationMs, reviewNote } = review.value;
  const warningIndexes = useMemo(() => new Set(review.value.warningIndexes), [review.value.warningIndexes]);
  const reviewedWarnings = useMemo(() => new Set(review.value.reviewedWarnings), [review.value.reviewedWarnings]);
  const [analyzing, setAnalyzing] = useState(false);
  const saving = useIsMutating({ mutationKey: ['omr-write', auth.user?.id, detail.exam.id] }) > 0;
  const busy = saving || analyzing;
  const [dialog, setDialog] = useState<{ title: string; detail: string; label: string; action: () => void; danger?: boolean } | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  function field<K extends keyof OmrReviewDraft>(key: K) { return (update: OmrReviewDraft[K] | ((value: OmrReviewDraft[K]) => OmrReviewDraft[K])) => review.set(current => { const value = typeof update === 'function' ? (update as (value: OmrReviewDraft[K]) => OmrReviewDraft[K])(current[key]) : update; return Object.is(current[key], value) ? current : { ...current, [key]: value }; }); }
  const setCaptureMethod = field('captureMethod'), setStudentId = field('studentId'), setEnrollment = field('enrollment'), setStudentName = field('studentName'), setVersion = field('version'), setIdentitySource = field('identitySource'), setIdentityConfirmed = field('identityConfirmed');
  const setAnswers = field('answers'), setOriginalAnswers = field('originalAnswers'), setQuality = field('quality'), setPreviewDataUrl = field('previewDataUrl'), setQrValue = field('qrValue'), setSourceFingerprint = field('sourceFingerprint'), setAnalysisSize = field('analysisSize'), setPhotoQuality = field('photoQuality'), setAnalysisDurationMs = field('analysisDurationMs'), setReviewNote = field('reviewNote');
  function setWarningIndexes(value: Set<number>) { field('warningIndexes')([...value]); }
  function setReviewedWarnings(update: Set<number> | ((value: Set<number>) => Set<number>)) { field('reviewedWarnings')(current => [...(typeof update === 'function' ? update(new Set(current)) : update)]); }

  const [notice, setNotice] = useState(batchNotice || (initialResult ? 'Revisa las respuestas guardadas y confirma cualquier corrección.' : ''));
  const [rejectedQuality, setRejectedQuality] = useState<OmrPhotoQuality | null>(null);
  const progress = useMemo(() => omrBatchProgress(detail), [detail]);

  useEffect(() => {
    if (!studentId) return;
    const student = detail.roster.find((row) => row.id === studentId);
    if (!student) return;
    setEnrollment(student.enrollment || '');
    setStudentName(student.full_name || '');
  }, [detail.roster, studentId]);

  const grade = useMemo(() => gradeAnswers(detail.exam, version, answers), [answers, detail.exam, version]);
  const unresolvedWarnings = useMemo(
    () => [...warningIndexes].filter((index) => !reviewedWarnings.has(index)),
    [reviewedWarnings, warningIndexes],
  );
  const manualCorrections = useMemo(() => answers.reduce((count, answer, index) => (
    answer !== originalAnswers[index] ? count + 1 : count
  ), 0), [answers, originalAnswers]);
  const existing = useMemo(
    () => currentResult || findExistingResult(detail, studentId, enrollment, version),
    [detail, enrollment, currentResult, studentId, version],
  );

  const mutation = useMutation({
    mutationKey: ['omr-write', auth.user?.id, detail.exam.id],
    mutationFn: async ({ confirmed, value, revision, continueBatch }: { confirmed: boolean; value: OmrReviewDraft; revision: number; continueBatch: boolean }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      if (detail.roster.length && !value.studentId) throw new Error('Selecciona al alumno del padrón.');
      if (!detail.roster.length && !value.enrollment.trim() && !value.studentName.trim()) throw new Error('Escribe el nombre o la matrícula.');
      if (confirmed && value.warningIndexes.some(index => !value.reviewedWarnings.includes(index))) throw new Error('Revisa todas las respuestas señaladas antes de confirmar.');
      if (confirmed && !value.identityConfirmed) throw new Error('Confirma explícitamente el alumno y la versión antes de calificar.');
      const latest = await fetchOmrExam(auth.user, detail.exam.id);
      const key = omrExamKey(auth.user.id, detail.exam.id);
      if (client.getQueryState(key)) client.setQueryData(key, latest);
      const target = initialResult ? latest.results.find(row => row.id === initialResult.id) : findExistingResult(latest, value.studentId, value.enrollment, value.version);
      const reusedSource = value.sourceFingerprint && latest.results.find((row) => row.source_fingerprint === value.sourceFingerprint && row.id !== target?.id);
      if (reusedSource) throw new Error(`Esta fotografía ya fue guardada para ${studentLabelForResult(reusedSource)}. Tu revisión se conserva sin crear un duplicado.`);
      if (omrExamSignature(latest) !== value.baseExam || (target && value.baseResults[target.id] !== omrResultSignature(target)) || (initialResult && !target)) throw new Error('La evaluación o el resultado cambiaron. Tu revisión se conserva; descarta para cargar la versión actual antes de continuar.');
      const result = await saveOmrResult(auth.user, {
        resultId: target?.id || null, examId: detail.exam.id, studentId: value.studentId || null, enrollment: value.enrollment, studentName: value.studentName, version: value.version, answers: value.answers, captureMethod: value.captureMethod,
        quality: { schema: 2, qr: value.qrValue || null, identity: { source: value.identitySource, confirmed: value.identityConfirmed }, image: value.analysisSize, photo: value.photoQuality, duration_ms: value.analysisDurationMs, marks: value.quality.map((mark, index) => ({ question: index + 1, status: mark.status, best: mark.best, gap: mark.gap, scores: mark.scores, reviewed: value.reviewedWarnings.includes(index) })) },
        scanWarnings: value.warningIndexes.length, manualCorrections: value.answers.filter((answer, index) => answer !== value.originalAnswers[index]).length, confirmed, reviewNote: value.reviewNote, sourceFingerprint: value.sourceFingerprint,
      });
      if (JSON.stringify(normalizeAnswers(result.answers, value.answers.length)) !== JSON.stringify(value.answers) || result.version !== value.version || (result.student_id || '') !== value.studentId || (confirmed && !result.reviewed && result.review_status !== 'confirmed')) throw new Error('No se pudo confirmar la captura completa. Tu revisión sigue disponible.');
      return { result, revision, continueBatch };
    },
    onSuccess: async ({ result, revision, continueBatch }) => { review.clear(revision); setDialog(null); await onSaved(result, continueBatch); },
  });
  function save(confirmed: boolean, continueBatch = false) {
    if (busy || !online) return;
    const submission = { confirmed, value: review.value, revision: review.revision, continueBatch };
    mutation.reset();
    setDialog({
      title: confirmed ? '¿Confirmar este resultado?' : '¿Guardar para revisar después?',
      detail: `${studentName || enrollment} · Versión ${version} · ${grade.correct} de ${detail.exam.question_count} aciertos.${existing ? ' Se actualizará el resultado existente y se conservará su historial.' : ''}${continueBatch ? ' Después se abrirá una captura limpia para la siguiente hoja.' : ''}`,
      label: confirmed ? continueBatch ? 'Confirmar y siguiente' : 'Confirmar resultado' : continueBatch ? 'Guardar y siguiente' : 'Guardar pendiente',
      action: () => mutation.mutate(submission),
    });
  }
  function replace(action: () => void) {
    if (busy) return;
    if (!review.dirty) { action(); return; }
    setDialog({ title: '¿Reemplazar esta captura pendiente?', detail: 'La nueva lectura sustituirá las respuestas y la fotografía que estás revisando.', label: 'Reemplazar captura', danger: true, action: () => { setDialog(null); action(); } });
  }

  async function readFile(file: File, method: 'camera' | 'upload') {
    const startedAt = performance.now();
    setAnalyzing(true);
    setAnalysisError('');
    setRejectedQuality(null);
    setNotice('Analizando las cuatro marcas y las burbujas…');
    try {
      const [analysis, fingerprint] = await Promise.all([
        analyzeOmrFile(file, detail.exam.question_count, detail.exam.option_count),
        fingerprintFile(file),
      ]);
      applyAnalysis(analysis, fingerprint, method, performance.now() - startedAt);
    } catch (error) {
      if (error instanceof OmrPhotoQualityError) setRejectedQuality(error.quality);
      setAnalysisError(error instanceof Error ? error.message : 'No fue posible analizar la hoja.');
      setNotice('');
    } finally {
      setAnalyzing(false);
      if (cameraInput.current) cameraInput.current.value = '';
      if (uploadInput.current) uploadInput.current.value = '';
    }
  }

  function applyAnalysis(analysis: OmrAnalysis, fingerprint: string, method: 'camera' | 'upload', durationMs: number) {
    const reusedCapture = detail.results.find((result) => result.source_fingerprint && result.source_fingerprint === fingerprint && result.id !== initialResult?.id);
    if (reusedCapture) {
      throw new Error(`Esta misma fotografía ya fue guardada para ${studentLabelForResult(reusedCapture)}. Abre ese resultado en lugar de asignarla a otro alumno.`);
    }
    const parsed = parseOmrPayload(analysis.qr);
    if (parsed && parsed.examId !== detail.exam.id) {
      throw new Error('El QR corresponde a otra evaluación. Abre el examen correcto o toma otra fotografía.');
    }
    if (parsed && !detail.exam.versions.includes(parsed.version)) throw new Error('La versión del QR no pertenece a esta evaluación.');
    if (parsed?.studentId && detail.roster.length && !detail.roster.some(student => student.id === parsed.studentId)) throw new Error('El alumno del QR no pertenece al padrón activo de esta evaluación.');
    if (parsed && initialResult && parsed.studentId && parsed.studentId !== initialResult.student_id) throw new Error('La hoja pertenece a otro alumno. Abre su resultado antes de corregirla.');
    if (!initialResult) { setStudentId(''); setEnrollment(''); setStudentName(''); setIdentitySource('none'); setIdentityConfirmed(false); }
    if (parsed?.version) setVersion(parsed.version);
    if (parsed?.studentId && detail.roster.some((student) => student.id === parsed.studentId)) {
      setStudentId(parsed.studentId);
      setIdentitySource('qr');
      setIdentityConfirmed(true);
    } else if (parsed?.enrollment) {
      setEnrollment(parsed.enrollment);
      const matched = detail.roster.find((student) => student.enrollment === parsed.enrollment);
      if (matched) setStudentId(matched.id);
      setIdentitySource('qr');
      setIdentityConfirmed(true);
    } else if (initialResult) {
      setIdentitySource('saved');
      setIdentityConfirmed(true);
    }

    setCaptureMethod(method);
    setAnswers(analysis.answers);
    setOriginalAnswers(analysis.answers);
    setQuality(analysis.quality);
    const warnings = new Set<number>();
    analysis.quality.forEach((mark, index) => {
      if (mark.status !== 'ok') warnings.add(index);
    });
    setWarningIndexes(warnings);
    setReviewedWarnings(new Set());
    setPreviewDataUrl(analysis.previewDataUrl);
    setQrValue(analysis.qr || '');
    setSourceFingerprint(fingerprint);
    setAnalysisSize({ width: analysis.width, height: analysis.height });
    setPhotoQuality(analysis.photoQuality);
    setAnalysisDurationMs(Math.max(0, Math.round(durationMs)));
    setNotice((parsed ? '' : 'QR no reconocido. Selecciona al alumno y verifica la versión. ') + (warnings.size
      ? `${warnings.size} reactivo${warnings.size === 1 ? '' : 's'} requieren confirmación manual.`
      : 'Lectura completa sin marcas dudosas. Confirma los datos del alumno y guarda.'));
  }

  function startManualCapture() {
    const blank = Array.from({ length: detail.exam.question_count }, () => null as OmrAnswer);
    const warnings = new Set(blank.map((_, index) => index));
    setCaptureMethod('manual');
    setIdentitySource(initialResult ? 'saved' : 'manual');
    setIdentityConfirmed(Boolean(initialResult));
    setAnswers(blank);
    setOriginalAnswers(blank);
    setQuality(initialQuality(detail.exam.question_count));
    setWarningIndexes(warnings);
    setReviewedWarnings(new Set());
    setPreviewDataUrl('');
    setQrValue('');
    setSourceFingerprint('');
    setAnalysisSize(null);
    setPhotoQuality(null);
    setAnalysisDurationMs(null);
    setNotice('Captura manual activa. Marca o confirma el blanco de cada reactivo.');
  }

  function changeStudent(value: string) {
    setStudentId(value);
    if (!value) {
      setEnrollment('');
      setStudentName('');
    }
    setIdentitySource(value ? 'manual' : 'none');
    setIdentityConfirmed(false);
  }

  function changeEnrollment(value: string) {
    setEnrollment(value);
    setIdentitySource(value.trim() ? 'manual' : 'none');
    setIdentityConfirmed(false);
  }

  function changeStudentName(value: string) {
    setStudentName(value);
    setIdentitySource(value.trim() ? 'manual' : 'none');
    setIdentityConfirmed(false);
  }

  function changeVersion(value: string) {
    setVersion(value);
    setIdentitySource('manual');
    setIdentityConfirmed(false);
  }

  function chooseAnswer(index: number, answer: OmrAnswer) {
    setAnswers((current) => current.map((value, position) => position === index ? answer : value));
    if (warningIndexes.has(index)) {
      setReviewedWarnings((current) => new Set(current).add(index));
    }
  }

  const locked = detail.period?.status === 'closed' || !['ready', 'closed'].includes(detail.exam.status);
  const canSave = !locked && answers.length === detail.exam.question_count && (
    detail.roster.length ? Boolean(studentId) : Boolean(enrollment.trim() || studentName.trim())
  );
  const canConfirm = canSave && identityConfirmed;
  const error = (mutation.error as Error | null)?.message || analysisError;

  return (
    <div className="omr-scanner view-stack compact-stack">
      <section className="omr-scanner-head">
        <div>
          <span className="eyebrow">{batchMode ? 'CAPTURA POR LOTE' : 'LECTURA Y REVISIÓN'}</span>
          <h2>{initialResult ? 'Corregir resultado OMR' : batchMode ? 'Escanear grupo completo' : 'Escanear hoja de respuestas'}</h2>
          <p>La fotografía y el QR se analizan en este dispositivo; TEDVIO guarda las respuestas y las métricas, no la imagen.</p>
        </div>
        <button className="button ghost" type="button" disabled={busy} onClick={() => review.dirty ? setDialog({ title: batchMode ? '¿Finalizar el lote con una revisión pendiente?' : '¿Cerrar con revisión pendiente?', detail: 'Podrás recuperar esta revisión al volver o incluso al recargar esta pestaña. Se eliminará al cerrar sesión.', label: 'Conservar y cerrar', action: onCancel }) : onCancel()}>{batchMode ? 'Finalizar lote' : 'Cerrar escáner'}</button>
      </section>

      {batchMode && !initialResult ? (
        <section className="omr-batch-progress" aria-label="Progreso del lote">
          <div className="omr-batch-progress-copy">
            <span className="eyebrow">LOTE ACTIVO</span>
            <b>{progress.total ? `${progress.captured} de ${progress.total} alumnos capturados` : `${progress.captured} capturas guardadas`}</b>
            <small>{progress.nextStudentId ? `Siguiente sin captura: ${detail.roster.find((student) => student.id === progress.nextStudentId)?.full_name || 'alumno pendiente'}` : progress.total ? 'El padrón ya tiene una captura por alumno.' : 'La identidad se comprobará hoja por hoja.'}</small>
          </div>
          {progress.total ? <div className="omr-batch-track" aria-label={`${Math.round(progress.percent * 100)}% completado`}><span style={{ width: `${Math.round(progress.percent * 100)}%` }} /></div> : null}
          <div className="omr-batch-counts"><StatusPill tone="green">{progress.confirmed} confirmadas</StatusPill><StatusPill tone={progress.pending ? 'amber' : 'neutral'}>{progress.pending} pendientes</StatusPill><StatusPill tone="blue">{progress.remaining} faltantes</StatusPill></div>
          {progress.duplicates ? <div className="warning-strip"><Icon name="alert" /><span>{progress.duplicates} captura{progress.duplicates === 1 ? '' : 's'} duplicada{progress.duplicates === 1 ? '' : 's'}; revisa el historial antes de publicar.</span></div> : null}
        </section>
      ) : null}

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error ? <ErrorPanel title="No se pudo completar la lectura" detail={error} /> : null}
      {rejectedQuality ? (
        <section className="omr-quality-rejected" role="status">
          <div><Icon name="alert" /><span><b>Necesitamos otra fotografía</b><small>La hoja no se calificó ni se vinculó con un alumno.</small></span></div>
          <ul>{rejectedQuality.guidance.map((guidance) => <li key={guidance}>{guidance}</li>)}</ul>
          <div className="omr-quality-metrics"><span><small>Resolución</small><b>{rejectedQuality.metrics.shortEdge}px</b></span><span><small>Luz</small><b>{Math.round(rejectedQuality.metrics.brightness * 100)}%</b></span><span><small>Contraste</small><b>{Math.round(rejectedQuality.metrics.contrast * 100)}%</b></span><span><small>Nitidez</small><b>{Math.round(rejectedQuality.metrics.sharpness * 1000) / 10}</b></span></div>
        </section>
      ) : null}

      {review.dirty ? <div className="omr-work-status" role="status"><span>{online ? 'Revisión pendiente de guardar' : 'Sin conexión · revisión conservada en esta pestaña'}</span><button className="button ghost" disabled={busy} onClick={() => setDialog({ title: '¿Descartar esta revisión?', detail: 'Se recuperará la captura guardada. Las correcciones y la fotografía pendientes se perderán.', label: 'Descartar revisión', danger: true, action: () => { review.clear(); mutation.reset(); setDialog(null); setAnalysisError(''); } })}>Descartar revisión</button></div> : null}
      <fieldset className="omr-review-fields" disabled={busy || locked}>
      <section className="omr-capture-actions">
        <input
          ref={cameraInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) replace(() => { void readFile(file, 'camera'); });
          }}
        />
        <input
          ref={uploadInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) replace(() => { void readFile(file, 'upload'); });
          }}
        />
        <button className="omr-capture-card primary" type="button" disabled={analyzing} onClick={() => cameraInput.current?.click()}>
          <Icon name="exam" /><span><b>{analyzing ? 'Analizando…' : 'Tomar fotografía'}</b><small>Abre la cámara trasera del teléfono o iPad.</small></span>
        </button>
        <button className="omr-capture-card" type="button" disabled={analyzing} onClick={() => uploadInput.current?.click()}>
          <Icon name="layout" /><span><b>Elegir imagen</b><small>Utiliza una fotografía guardada previamente.</small></span>
        </button>
        <button className="omr-capture-card" type="button" disabled={analyzing} onClick={() => replace(startManualCapture)}>
          <Icon name="grades" /><span><b>Captura manual</b><small>Registra respuestas sin utilizar la cámara.</small></span>
        </button>
      </section>

      <section className="omr-review-layout">
        <SectionCard className="omr-preview-card">
          <div className="section-heading compact">
            <div><span className="eyebrow">HOJA</span><h2>Vista de detección</h2><p>El contorno azul confirma las cuatro marcas; los círculos amarillos requieren revisión.</p></div>
            <StatusPill tone={previewDataUrl ? 'green' : 'neutral'}>{previewDataUrl ? methodLabel(captureMethod) : 'Sin imagen'}</StatusPill>
          </div>
          {previewDataUrl ? <img className="omr-scan-preview" src={previewDataUrl} alt="Vista de la hoja OMR analizada" /> : (
            <div className="omr-preview-empty"><Icon name="exam" /><b>Fotografía la hoja completa</b><span>Evita sombras, reflejos, dobleces y recortes de las marcas negras.</span></div>
          )}
          {qrValue ? <div className="omr-qr-read"><Icon name="check" /><span>QR reconocido</span></div> : null}
          {photoQuality?.accepted ? (
            <div className="omr-photo-quality" aria-label="Calidad de fotografía aceptada">
              <div><Icon name="check" /><span><b>Fotografía aceptada</b><small>{analysisDurationMs == null ? 'Procesada localmente' : `Procesada localmente en ${(analysisDurationMs / 1000).toFixed(1)} s`}</small></span></div>
              <div className="omr-quality-metrics"><span><small>Resolución</small><b>{photoQuality.metrics.shortEdge}px</b></span><span><small>Luz</small><b>{Math.round(photoQuality.metrics.brightness * 100)}%</b></span><span><small>Contraste</small><b>{Math.round(photoQuality.metrics.contrast * 100)}%</b></span><span><small>Encuadre</small><b>{photoQuality.metrics.pageCoverage == null ? '—' : `${Math.round(photoQuality.metrics.pageCoverage * 100)}%`}</b></span></div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard className="omr-review-card">
          <div className="section-heading compact">
            <div><span className="eyebrow">IDENTIDAD Y VERSIÓN</span><h2>Datos de la captura</h2><p>Confirma al alumno antes de guardar o reemplazar un resultado.</p></div>
            <StatusPill tone={unresolvedWarnings.length ? 'amber' : 'green'}>{unresolvedWarnings.length ? `${unresolvedWarnings.length} pendientes` : 'Revisión completa'}</StatusPill>
          </div>

          <div className="form-grid two omr-meta-form">
            {detail.roster.length ? (
              <label>Alumno<select aria-label="Alumno" value={studentId} onChange={(event) => changeStudent(event.target.value)}><option value="">Selecciona del padrón</option>{detail.roster.map((student) => <option key={student.id} value={student.id}>{student.enrollment} · {student.full_name}</option>)}</select></label>
            ) : (
              <>
                <label>Matrícula<input value={enrollment} onChange={(event) => changeEnrollment(event.target.value)} placeholder="Matrícula" /></label>
                <label>Nombre<input value={studentName} onChange={(event) => changeStudentName(event.target.value)} placeholder="Nombre completo" /></label>
              </>
            )}
            <label>Versión<select aria-label="Versión" value={version} onChange={(event) => changeVersion(event.target.value)}>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
            <label>Método<input value={methodLabel(captureMethod)} readOnly /></label>
          </div>

          <div className={`omr-identity-proof ${identityConfirmed ? 'verified' : ''}`}>
            <div><Icon name={identityConfirmed ? 'check' : 'shield'} /><span><b>{identitySource === 'qr' && identityConfirmed ? 'Alumno y versión verificados por QR' : identityConfirmed ? 'Alumno y versión verificados por el docente' : 'Verificación de identidad obligatoria'}</b><small>{identitySource === 'qr' && identityConfirmed ? 'TEDVIO comparó el código con esta evaluación y su padrón.' : 'Evita que una hoja se guarde silenciosamente en el expediente equivocado.'}</small></span></div>
            {!identityConfirmed && (studentId || enrollment.trim() || studentName.trim()) ? <label><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} /> Verifiqué que la hoja pertenece a {studentName || enrollment} y que usa la versión {version}.</label> : null}
          </div>

          {existing ? (
            <div className="warning-strip"><Icon name="alert" /><span>Ya existe un resultado para este alumno y versión. Al confirmar, TEDVIO guardará la corrección y conservará la revisión anterior en el historial.</span></div>
          ) : null}

          <div className="omr-review-tools"><label className="toggle-field"><input type="checkbox" checked={onlyWarnings} onChange={event => setOnlyWarnings(event.target.checked)} /> Solo respuestas por revisar</label><button className="button secondary compact" type="button" disabled={!unresolvedWarnings.length} onClick={() => { setOnlyWarnings(true); window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.omr-answer-row:not(.reviewed) button')?.focus()); }}>Ir a la siguiente duda</button></div>
          <div className="omr-answer-grid" aria-label="Revisión de respuestas">
            {answers.map((answer, index) => {
              if (onlyWarnings && (!warningIndexes.has(index) || reviewedWarnings.has(index))) return null;
              const warning = warningIndexes.has(index);
              const reviewed = reviewedWarnings.has(index);
              return (
                <article className={`omr-answer-row${warning ? ' warning' : ''}${reviewed ? ' reviewed' : ''}`} key={index}>
                  <div className="omr-answer-number"><b>{index + 1}</b><small>{warning ? reviewed ? 'Revisada' : quality[index]?.status === 'blank' ? 'Blanco' : 'Dudosa' : 'Leída'}</small></div>
                  <div className="omr-answer-options" role="group" aria-label={`Respuesta ${index + 1}`}>
                    {OMR_LETTERS.slice(0, detail.exam.option_count).map((letter) => (
                      <button type="button" aria-pressed={answer === letter} className={answer === letter ? 'active' : ''} onClick={() => chooseAnswer(index, letter)} key={letter}>{letter}</button>
                    ))}
                    <button type="button" aria-label="En blanco" aria-pressed={!answer} className={!answer ? 'active blank' : 'blank'} onClick={() => chooseAnswer(index, null)}>—</button>
                  </div>
                </article>
              );
            })}
          </div>

          <label className="wide-field">Nota de revisión<textarea maxLength={1000} rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Motivo de la corrección o incidencia de la hoja" /></label>
        </SectionCard>
      </section>

      </fieldset>
      <section className="omr-confirm-dock">
        <div><span className="eyebrow">RESULTADO PROVISIONAL</span><b>{grade.score.toFixed(1)}</b><small>{grade.correct}/{detail.exam.question_count} aciertos · {grade.blanks} en blanco · {manualCorrections} correcciones</small></div>
        <div className="omr-confirm-context"><StatusPill tone={unresolvedWarnings.length || !identityConfirmed ? 'amber' : 'green'}>{unresolvedWarnings.length ? `${unresolvedWarnings.length} sin revisar` : !identityConfirmed ? 'Verifica identidad' : 'Lista para confirmar'}</StatusPill>{existing ? <StatusPill tone="violet">Actualiza resultado</StatusPill> : null}</div>
        <button className="button ghost" type="button" disabled={!canSave || busy || !online} onClick={() => save(false, batchMode)}>{batchMode ? 'Pendiente y siguiente' : 'Guardar pendiente'}</button>
        {batchMode ? <button className="button secondary" type="button" disabled={!canConfirm || unresolvedWarnings.length > 0 || busy || !online} onClick={() => save(true, false)}>Confirmar y terminar</button> : null}
        <button className="button primary" type="button" disabled={!canConfirm || unresolvedWarnings.length > 0 || busy || !online} onClick={() => save(true, batchMode)}>{mutation.isPending ? 'Guardando…' : batchMode ? 'Confirmar y siguiente' : 'Confirmar y calificar'}</button>
      </section>
      {dialog ? <ActionDialog eyebrow="TEDVIO · REVISIÓN OMR" title={dialog.title} detail={dialog.detail} confirmLabel={dialog.label} danger={dialog.danger} busy={saving} error={mutation.error?.message} onDismiss={() => setDialog(null)} onConfirm={dialog.action} /> : null}
    </div>
  );
}
