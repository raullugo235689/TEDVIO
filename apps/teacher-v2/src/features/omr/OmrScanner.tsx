import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  findExistingResult,
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
  OMR_LETTERS,
  parseOmrPayload,
  type OmrAnswer,
  type OmrAnalysis,
  type OmrMarkQuality,
} from '../../core/omr-engine';
import { ErrorPanel, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

interface OmrScannerProps {
  detail: OmrExamDetail;
  initialResult?: OmrResult | null;
  onSaved: (result: OmrResult) => void | Promise<void>;
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

export function OmrScanner({ detail, initialResult = null, onSaved, onCancel }: OmrScannerProps) {
  const auth = useAuth();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [captureMethod, setCaptureMethod] = useState<OmrCaptureMethod>(initialResult ? 'manual' : 'camera');
  const [studentId, setStudentId] = useState(initialResult?.student_id || '');
  const [enrollment, setEnrollment] = useState(initialResult?.enrollment || '');
  const [studentName, setStudentName] = useState(initialResult?.student_name || '');
  const [version, setVersion] = useState(initialResult?.version || detail.exam.versions[0] || 'A');
  const [answers, setAnswers] = useState<OmrAnswer[]>(() => normalizeAnswers(initialResult?.answers, detail.exam.question_count));
  const [originalAnswers, setOriginalAnswers] = useState<OmrAnswer[]>(() => normalizeAnswers(initialResult?.answers, detail.exam.question_count));
  const [quality, setQuality] = useState<OmrMarkQuality[]>(() => initialResult ? [] : initialQuality(detail.exam.question_count));
  const [warningIndexes, setWarningIndexes] = useState<Set<number>>(() => new Set());
  const [reviewedWarnings, setReviewedWarnings] = useState<Set<number>>(() => new Set());
  const [previewDataUrl, setPreviewDataUrl] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [sourceFingerprint, setSourceFingerprint] = useState(initialResult?.source_fingerprint || '');
  const [analysisSize, setAnalysisSize] = useState<{ width: number; height: number } | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewNote, setReviewNote] = useState(initialResult?.review_note || '');
  const [notice, setNotice] = useState(initialResult ? 'Revisa las respuestas guardadas y confirma cualquier corrección.' : '');

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
    () => initialResult || findExistingResult(detail, studentId, enrollment, version),
    [detail, enrollment, initialResult, studentId, version],
  );

  const mutation = useMutation({
    mutationFn: async (confirmed: boolean) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      if (detail.roster.length && !studentId) throw new Error('Selecciona al alumno del padrón.');
      if (!detail.roster.length && !enrollment.trim() && !studentName.trim()) {
        throw new Error('Escribe al menos el nombre o la matrícula.');
      }
      if (confirmed && unresolvedWarnings.length) {
        throw new Error(`Revisa los ${unresolvedWarnings.length} reactivos marcados en amarillo antes de confirmar.`);
      }
      return saveOmrResult(auth.user, {
        resultId: existing?.id || null,
        examId: detail.exam.id,
        studentId: studentId || null,
        enrollment,
        studentName,
        version,
        answers,
        captureMethod,
        quality: {
          schema: 1,
          qr: qrValue || null,
          image: analysisSize,
          marks: quality.map((mark, index) => ({
            question: index + 1,
            status: mark.status,
            best: Number(mark.best || 0),
            gap: Number(mark.gap || 0),
            scores: mark.scores || [],
            reviewed: reviewedWarnings.has(index),
          })),
        },
        scanWarnings: warningIndexes.size,
        manualCorrections,
        confirmed,
        reviewNote,
        sourceFingerprint,
      });
    },
    onSuccess: async (result) => {
      setNotice(result.review_status === 'confirmed'
        ? `Resultado confirmado: ${Number(result.score).toFixed(1)}.`
        : 'Lectura guardada como pendiente de revisión.');
      await onSaved(result);
    },
  });

  async function readFile(file: File, method: 'camera' | 'upload') {
    setAnalyzing(true);
    setAnalysisError('');
    setNotice('Analizando las cuatro marcas y las burbujas…');
    try {
      const [analysis, fingerprint] = await Promise.all([
        analyzeOmrFile(file, detail.exam.question_count, detail.exam.option_count),
        fingerprintFile(file),
      ]);
      applyAnalysis(analysis, fingerprint, method);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'No fue posible analizar la hoja.');
      setNotice('');
    } finally {
      setAnalyzing(false);
      if (cameraInput.current) cameraInput.current.value = '';
      if (uploadInput.current) uploadInput.current.value = '';
    }
  }

  function applyAnalysis(analysis: OmrAnalysis, fingerprint: string, method: 'camera' | 'upload') {
    const parsed = parseOmrPayload(analysis.qr);
    if (parsed && parsed.examId !== detail.exam.id) {
      throw new Error('El QR corresponde a otra evaluación. Abre el examen correcto o toma otra fotografía.');
    }
    if (parsed?.version && detail.exam.versions.includes(parsed.version)) setVersion(parsed.version);
    if (parsed?.studentId && detail.roster.some((student) => student.id === parsed.studentId)) {
      setStudentId(parsed.studentId);
    } else if (parsed?.enrollment) {
      setEnrollment(parsed.enrollment);
      const matched = detail.roster.find((student) => student.enrollment === parsed.enrollment);
      if (matched) setStudentId(matched.id);
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
    setNotice(warnings.size
      ? `${warnings.size} reactivo${warnings.size === 1 ? '' : 's'} requieren confirmación manual.`
      : 'Lectura completa sin marcas dudosas. Confirma los datos del alumno y guarda.');
  }

  function startManualCapture() {
    const blank = Array.from({ length: detail.exam.question_count }, () => null as OmrAnswer);
    const warnings = new Set(blank.map((_, index) => index));
    setCaptureMethod('manual');
    setAnswers(blank);
    setOriginalAnswers(blank);
    setQuality(initialQuality(detail.exam.question_count));
    setWarningIndexes(warnings);
    setReviewedWarnings(new Set());
    setPreviewDataUrl('');
    setQrValue('');
    setSourceFingerprint('');
    setAnalysisSize(null);
    setNotice('Captura manual activa. Marca o confirma el blanco de cada reactivo.');
  }

  function chooseAnswer(index: number, answer: OmrAnswer) {
    setAnswers((current) => current.map((value, position) => position === index ? answer : value));
    if (warningIndexes.has(index)) {
      setReviewedWarnings((current) => new Set(current).add(index));
    }
  }

  const canSave = answers.length === detail.exam.question_count && (
    detail.roster.length ? Boolean(studentId) : Boolean(enrollment.trim() || studentName.trim())
  );
  const error = (mutation.error as Error | null)?.message || analysisError;

  return (
    <div className="omr-scanner view-stack compact-stack">
      <section className="omr-scanner-head">
        <div>
          <span className="eyebrow">LECTURA Y REVISIÓN</span>
          <h2>{initialResult ? 'Corregir resultado OMR' : 'Escanear hoja de respuestas'}</h2>
          <p>La fotografía se analiza en este dispositivo; TEDVIO guarda las respuestas y la calidad, no la imagen.</p>
        </div>
        <button className="button ghost" type="button" onClick={onCancel}>Cerrar escáner</button>
      </section>

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error ? <ErrorPanel title="No se pudo completar la lectura" detail={error} /> : null}

      <section className="omr-capture-actions">
        <input
          ref={cameraInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file, 'camera');
          }}
        />
        <input
          ref={uploadInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file, 'upload');
          }}
        />
        <button className="omr-capture-card primary" type="button" disabled={analyzing} onClick={() => cameraInput.current?.click()}>
          <Icon name="exam" /><span><b>{analyzing ? 'Analizando…' : 'Tomar fotografía'}</b><small>Abre la cámara trasera del teléfono o iPad.</small></span>
        </button>
        <button className="omr-capture-card" type="button" disabled={analyzing} onClick={() => uploadInput.current?.click()}>
          <Icon name="layout" /><span><b>Elegir imagen</b><small>Utiliza una fotografía guardada previamente.</small></span>
        </button>
        <button className="omr-capture-card" type="button" disabled={analyzing} onClick={startManualCapture}>
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
        </SectionCard>

        <SectionCard className="omr-review-card">
          <div className="section-heading compact">
            <div><span className="eyebrow">IDENTIDAD Y VERSIÓN</span><h2>Datos de la captura</h2><p>Confirma al alumno antes de guardar o reemplazar un resultado.</p></div>
            <StatusPill tone={unresolvedWarnings.length ? 'amber' : 'green'}>{unresolvedWarnings.length ? `${unresolvedWarnings.length} pendientes` : 'Revisión completa'}</StatusPill>
          </div>

          <div className="form-grid two omr-meta-form">
            {detail.roster.length ? (
              <label>Alumno<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Selecciona del padrón</option>{detail.roster.map((student) => <option key={student.id} value={student.id}>{student.enrollment} · {student.full_name}</option>)}</select></label>
            ) : (
              <>
                <label>Matrícula<input value={enrollment} onChange={(event) => setEnrollment(event.target.value)} placeholder="Matrícula" /></label>
                <label>Nombre<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Nombre completo" /></label>
              </>
            )}
            <label>Versión<select value={version} onChange={(event) => setVersion(event.target.value)}>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
            <label>Método<input value={methodLabel(captureMethod)} readOnly /></label>
          </div>

          {existing ? (
            <div className="warning-strip"><Icon name="alert" /><span>Ya existe un resultado para este alumno y versión. Al confirmar, TEDVIO guardará la corrección y conservará la revisión anterior en el historial.</span></div>
          ) : null}

          <div className="omr-answer-grid" aria-label="Revisión de respuestas">
            {answers.map((answer, index) => {
              const warning = warningIndexes.has(index);
              const reviewed = reviewedWarnings.has(index);
              return (
                <article className={`omr-answer-row${warning ? ' warning' : ''}${reviewed ? ' reviewed' : ''}`} key={index}>
                  <div className="omr-answer-number"><b>{index + 1}</b><small>{warning ? reviewed ? 'Revisada' : quality[index]?.status === 'blank' ? 'Blanco' : 'Dudosa' : 'Leída'}</small></div>
                  <div className="omr-answer-options" role="group" aria-label={`Respuesta ${index + 1}`}>
                    {OMR_LETTERS.slice(0, detail.exam.option_count).map((letter) => (
                      <button type="button" className={answer === letter ? 'active' : ''} onClick={() => chooseAnswer(index, letter)} key={letter}>{letter}</button>
                    ))}
                    <button type="button" className={!answer ? 'active blank' : 'blank'} onClick={() => chooseAnswer(index, null)}>—</button>
                  </div>
                </article>
              );
            })}
          </div>

          <label className="wide-field">Nota de revisión<textarea rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Motivo de la corrección o incidencia de la hoja" /></label>
        </SectionCard>
      </section>

      <section className="omr-confirm-dock">
        <div><span className="eyebrow">RESULTADO PROVISIONAL</span><b>{grade.score.toFixed(1)}</b><small>{grade.correct}/{detail.exam.question_count} aciertos · {grade.blanks} en blanco · {manualCorrections} correcciones</small></div>
        <div className="omr-confirm-context"><StatusPill tone={unresolvedWarnings.length ? 'amber' : 'green'}>{unresolvedWarnings.length ? `${unresolvedWarnings.length} sin revisar` : 'Lista para confirmar'}</StatusPill>{existing ? <StatusPill tone="violet">Actualiza resultado</StatusPill> : null}</div>
        <button className="button ghost" type="button" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate(false)}>Guardar pendiente</button>
        <button className="button primary" type="button" disabled={!canSave || unresolvedWarnings.length > 0 || mutation.isPending} onClick={() => mutation.mutate(true)}>{mutation.isPending ? 'Guardando…' : 'Confirmar y calificar'}</button>
      </section>
    </div>
  );
}