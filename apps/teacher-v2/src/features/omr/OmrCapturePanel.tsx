import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { examDetailKey, examWorkspaceKey, type ExamDetail } from '../../core/exams';
import { analyzeOmrImage, manualOmrCapture, OMR_LETTERS, scoreOmrAnswers, summarizeOmrQuality, type OmrAnalysis, type OmrMarkQuality } from '../../core/omr-engine';
import { answerKeyFor, captureSourceLabel, confirmOmrResult, type OmrCaptureSource, type OmrResultRecord } from '../../core/omr';
import { EmptyState, ErrorPanel, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';
import { loadImage } from './omr-ui';

interface CaptureDraft {
  answers: Array<string | null>;
  quality: OmrMarkQuality[];
  previewUrl: string;
  analysis: Pick<OmrAnalysis, 'width' | 'height' | 'rotation' | 'cornerConfidence'> | null;
  source: OmrCaptureSource;
}

function AnswerReview({
  answers,
  quality,
  optionCount,
  onPick,
}: {
  answers: Array<string | null>;
  quality: OmrMarkQuality[];
  optionCount: number;
  onPick: (index: number, answer: string | null) => void;
}) {
  const letters = OMR_LETTERS.slice(0, Math.max(2, Math.min(5, optionCount)));
  return (
    <div className="omr-answer-grid">
      {answers.map((answer, index) => {
        const row = quality[index];
        const status = row?.status || 'manual';
        return (
          <article className={`omr-answer-row status-${status}`} key={index}>
            <b>{index + 1}</b>
            <div className="omr-answer-choices">
              {letters.map((letter) => <button type="button" className={answer === letter ? 'active' : ''} key={letter} onClick={() => onPick(index, letter)}>{letter}</button>)}
              <button type="button" className={!answer ? 'active blank-choice' : 'blank-choice'} onClick={() => onPick(index, null)}>—</button>
            </div>
            <span>{status === 'ambiguous' ? 'Revisar' : status === 'blank' ? 'En blanco' : status === 'manual' ? 'Manual' : 'Leída'}</span>
          </article>
        );
      })}
    </div>
  );
}

export function CapturePanel({ detail }: { detail: ExamDetail }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const [studentId, setStudentId] = useState('');
  const [version, setVersion] = useState(detail.exam.versions[0] || 'A');
  const [capture, setCapture] = useState<CaptureDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setVersion(detail.exam.versions[0] || 'A');
    setStudentId('');
    setCapture(null);
    setNotice('');
  }, [detail.exam.id, detail.exam.versions]);

  const key = answerKeyFor(detail.exam, version);
  const qualitySummary = capture ? summarizeOmrQuality(capture.quality) : null;
  const previewScore = capture ? scoreOmrAnswers(capture.answers, key) : null;
  const existing = detail.results.find((result) => result.student_id === studentId && result.version === version) as OmrResultRecord | undefined;

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !capture) throw new Error('La captura no está lista.');
      return confirmOmrResult(auth.user, {
        examId: detail.exam.id,
        studentId,
        version,
        answers: capture.answers,
        quality: capture.quality,
        analysis: capture.analysis,
        captureSource: capture.source,
      });
    },
    onSuccess: async (result) => {
      const saved = result as OmrResultRecord;
      setNotice(`${saved.student_name || saved.enrollment || 'Resultado'} · ${Number(saved.score).toFixed(1)} guardado y confirmado.`);
      setCapture(null);
      setReadError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: examDetailKey(auth.user?.id, detail.exam.id) }),
        queryClient.invalidateQueries({ queryKey: examWorkspaceKey(auth.user?.id) }),
      ]);
      const completed = new Set([...detail.results.map((item) => String(item.student_id || '')), String(saved.student_id || '')]);
      const next = detail.roster.find((student) => !completed.has(student.id));
      setStudentId(next?.id || '');
    },
  });

  async function readFile(event: ChangeEvent<HTMLInputElement>, source: 'camera' | 'upload') {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setReadError('Selecciona una imagen de la hoja de respuestas.');
      return;
    }
    setReading(true);
    setReadError('');
    try {
      const image = await loadImage(file);
      const analysis = analyzeOmrImage(image, detail.exam.question_count, detail.exam.option_count);
      setCapture({
        answers: analysis.answers,
        quality: analysis.quality,
        previewUrl: analysis.previewUrl,
        analysis: {
          width: analysis.width,
          height: analysis.height,
          rotation: analysis.rotation,
          cornerConfidence: analysis.cornerConfidence,
        },
        source,
      });
      window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      setReadError((error as Error).message || 'No se pudo analizar la hoja.');
    } finally {
      setReading(false);
    }
  }

  function startManual() {
    const manual = manualOmrCapture(detail.exam.question_count);
    setCapture({ ...manual, previewUrl: '', analysis: null, source: 'manual' });
    setReadError('');
    window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function pickAnswer(index: number, answer: string | null) {
    setCapture((current) => {
      if (!current) return current;
      const answers = [...current.answers];
      const quality = [...current.quality];
      answers[index] = answer;
      const previous = quality[index] || { status: 'manual' as const, scores: [], best: 0, gap: 0 };
      quality[index] = { ...previous, status: current.source === 'manual' ? 'manual' : answer ? 'ok' : 'blank' };
      return { ...current, answers, quality };
    });
  }

  if (detail.exam.status !== 'ready') {
    return (
      <SectionCard>
        <EmptyState
          icon="shield"
          title={detail.exam.status === 'closed' ? 'La evaluación está cerrada' : 'La evaluación todavía no está lista'}
          detail={detail.exam.status === 'closed' ? 'Puedes consultar y exportar resultados, pero no registrar nuevas hojas.' : 'Marca la evaluación como lista para habilitar impresión y captura OMR.'}
          action={<Link className="button secondary" to={`/exams/${detail.exam.id}`}>Abrir evaluación</Link>}
        />
      </SectionCard>
    );
  }

  if (!detail.exam.group_id || !detail.roster.length) {
    return (
      <SectionCard>
        <EmptyState icon="groups" title="Asigna un grupo con padrón" detail="La confirmación OMR requiere vincular cada hoja con un alumno del grupo para evitar resultados huérfanos o duplicados." action={<Link className="button secondary" to={`/exams/${detail.exam.id}`}>Revisar evaluación</Link>} />
      </SectionCard>
    );
  }

  const unresolved = qualitySummary?.ambiguous || 0;
  const canConfirm = Boolean(capture && studentId && key.length === detail.exam.question_count && unresolved === 0 && !saveMutation.isPending);

  return (
    <div className="view-stack compact-stack">
      <SectionCard className="omr-capture-panel">
        <div className="section-heading"><div><span className="eyebrow">2 · CAPTURAR</span><h2>Cámara o archivo</h2><p>Procesamiento local: la fotografía no se sube ni se conserva.</p></div><StatusPill tone="green">{detail.roster.length} alumnos</StatusPill></div>
        {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
        {readError ? <ErrorPanel title="No pude leer la hoja" detail={readError} /> : null}
        {saveMutation.error ? <ErrorPanel title="No se pudo confirmar el resultado" detail={(saveMutation.error as Error).message} /> : null}
        <div className="omr-capture-grid">
          <div className="omr-student-fields">
            <label>Alumno<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Selecciona un alumno</option>{detail.roster.map((student) => <option key={student.id} value={student.id}>{student.enrollment} · {student.full_name}</option>)}</select></label>
            <label>Versión<select value={version} onChange={(event) => { setVersion(event.target.value); setCapture(null); }}><option value="">Selecciona versión</option>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
            {existing ? <div className="omr-replace-warning"><Icon name="alert" /><span><b>Ya existe un resultado para esta versión.</b><small>Al confirmar, TEDVIO conservará el resultado previo en el historial de revisiones.</small></span></div> : null}
          </div>
          <div className="omr-upload-actions">
            <label className={`omr-upload-button${reading ? ' disabled' : ''}`}><Icon name="exam" /><span><b>{reading ? 'Analizando…' : 'Usar cámara'}</b><small>Hoja completa y vertical</small></span><input type="file" accept="image/*" capture="environment" disabled={reading} onChange={(event) => readFile(event, 'camera')} /></label>
            <label className={`omr-upload-button${reading ? ' disabled' : ''}`}><Icon name="layout" /><span><b>Subir fotografía</b><small>JPG, PNG o HEIC compatible</small></span><input type="file" accept="image/*" disabled={reading} onChange={(event) => readFile(event, 'upload')} /></label>
            <button className="omr-upload-button manual" type="button" disabled={reading} onClick={startManual}><Icon name="grades" /><span><b>Captura manual</b><small>Cuando la hoja no puede leerse</small></span></button>
          </div>
        </div>
      </SectionCard>

      {capture ? (
        <div ref={reviewRef}>
        <SectionCard className="omr-review-panel">
          <div className="section-heading"><div><span className="eyebrow">3 · REVISAR Y CONFIRMAR</span><h2>Lectura de respuestas</h2><p>Corrige los reactivos amarillos antes de guardar. Los blancos pueden conservarse como respuesta omitida.</p></div><div className="omr-quality-pills"><StatusPill tone="green">{qualitySummary?.ok || 0} claras</StatusPill><StatusPill tone="amber">{qualitySummary?.ambiguous || 0} ambiguas</StatusPill><StatusPill>{qualitySummary?.blank || 0} blancas</StatusPill></div></div>
          <div className="omr-review-layout">
            <div className="omr-preview-column">
              {capture.previewUrl ? <img className="omr-preview" src={capture.previewUrl} alt="Vista previa de la hoja analizada" /> : <div className="omr-manual-placeholder"><Icon name="grades" /><h3>Captura manual</h3><p>Marca las respuestas observadas en la hoja.</p></div>}
              <dl className="omr-read-metadata">
                <div><dt>Origen</dt><dd>{captureSourceLabel(capture.source)}</dd></div>
                <div><dt>Orientación</dt><dd>{capture.analysis ? `${capture.analysis.rotation}°` : 'Manual'}</dd></div>
                <div><dt>Confianza de esquinas</dt><dd>{capture.analysis ? `${Math.round(capture.analysis.cornerConfidence * 100)}%` : '—'}</dd></div>
                <div><dt>Versión</dt><dd>{version}</dd></div>
              </dl>
            </div>
            <div className="omr-answers-column">
              <AnswerReview answers={capture.answers} quality={capture.quality} optionCount={detail.exam.option_count} onPick={pickAnswer} />
            </div>
          </div>
          <div className="omr-confirm-dock">
            <div><span className="eyebrow">RESULTADO PROVISIONAL</span><b>{previewScore ? `${previewScore.score.toFixed(1)} · ${previewScore.correct}/${detail.exam.question_count}` : '—'}</b><small>{previewScore?.blanks || 0} en blanco · el servidor recalculará antes de guardar</small></div>
            <button className="button ghost" type="button" onClick={() => setCapture(null)}>Descartar lectura</button>
            <button className="button primary" type="button" disabled={!canConfirm} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? 'Confirmando…' : unresolved ? `Revisa ${unresolved} marca${unresolved === 1 ? '' : 's'}` : existing ? 'Confirmar corrección' : 'Confirmar resultado'}</button>
          </div>
        </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
