import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gradeAnswers, type OmrExamDetail } from '../../core/omr';
import {
  analyzeOmrFile,
  OmrPhotoQualityError,
  parseOmrPayload,
} from '../../core/omr-engine';
import {
  summarizeOmrValidation,
  type OmrValidationAttempt,
} from '../../core/omr-premium';
import { MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';

interface OmrValidationCenterProps {
  detail: OmrExamDetail;
  onClose: () => void;
}

function percentage(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(value >= 0.99 ? 1 : 0)}%`;
}

function seconds(value: number | null): string {
  return value == null ? '—' : `${(value / 1000).toFixed(1)} s`;
}

function targetTone(value: number | null, target: number, lowerIsBetter = false, sampleSize = 5): 'neutral' | 'green' | 'amber' {
  if (value == null) return 'neutral';
  if (sampleSize < 5) return 'amber';
  return lowerIsBetter ? value <= target ? 'green' : 'amber' : value >= target ? 'green' : 'amber';
}

export function OmrValidationCenter({ detail, onClose }: OmrValidationCenterProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(detail.exam.versions[0] || 'A');
  const [attempts, setAttempts] = useState<OmrValidationAttempt[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const summary = useMemo(() => summarizeOmrValidation(attempts), [attempts]);

  async function validate(files: FileList | File[]) {
    const queue = Array.from(files);
    if (!queue.length || processing) return;
    setProcessing(true);
    setProgress({ current: 0, total: queue.length });

    for (let index = 0; index < queue.length; index += 1) {
      const file = queue[index];
      if (!file) continue;
      const startedAt = performance.now();
      let attempt: OmrValidationAttempt;
      try {
        const analysis = await analyzeOmrFile(file, detail.exam.question_count, detail.exam.option_count);
        const qr = parseOmrPayload(analysis.qr);
        if (qr && qr.examId !== detail.exam.id) throw new Error('El QR pertenece a otra evaluación.');
        const detectedVersion = qr?.version || version;
        if (!detail.exam.versions.includes(detectedVersion)) throw new Error('La versión detectada no pertenece a esta evaluación.');
        const result = gradeAnswers(detail.exam, detectedVersion, analysis.answers);
        attempt = {
          id: crypto.randomUUID(),
          accepted: true,
          qrRead: Boolean(qr),
          correct: result.correct,
          questions: detail.exam.question_count,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          issues: [],
          quality: analysis.photoQuality,
          message: result.correct === detail.exam.question_count
            ? `Versión ${detectedVersion} · lectura exacta`
            : `Versión ${detectedVersion} · ${result.correct} de ${detail.exam.question_count} coincidencias`,
        };
      } catch (error) {
        const quality = error instanceof OmrPhotoQualityError ? error.quality : null;
        attempt = {
          id: crypto.randomUUID(),
          accepted: false,
          qrRead: false,
          correct: 0,
          questions: 0,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          issues: quality?.issues || [],
          quality,
          message: error instanceof Error ? error.message : 'No fue posible validar esta hoja.',
        };
      }
      setAttempts((current) => [...current, attempt]);
      setProgress({ current: index + 1, total: queue.length });
    }

    setProcessing(false);
    if (cameraInput.current) cameraInput.current.value = '';
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="view-stack omr-page omr-validation-page">
      <PageHeader
        eyebrow="OMR PREMIUM · VALIDACIÓN"
        title="Centro de calidad"
        detail={`${detail.exam.title} · prueba el lector con hojas conocidas antes de calificar al grupo`}
        actions={<button className="button secondary" type="button" disabled={processing} onClick={onClose}>← Evaluación</button>}
      />

      <section className="metric-grid four">
        <MetricCard label="Fotos aceptadas" value={percentage(summary.photoAcceptance)} detail={`${summary.acceptedSheets}/${summary.sheets || 0} hojas`} icon="exam" tone={targetTone(summary.photoAcceptance, 0.95, false, summary.sheets)} />
        <MetricCard label="Exactitud" value={percentage(summary.bubbleAccuracy)} detail="Meta ≥ 99%" icon="grades" tone={targetTone(summary.bubbleAccuracy, 0.99, false, summary.sheets)} />
        <MetricCard label="QR reconocido" value={percentage(summary.qrRecognition)} detail="Meta 100%" icon="shield" tone={targetTone(summary.qrRecognition, 1, false, summary.sheets)} />
        <MetricCard label="Tiempo por hoja" value={seconds(summary.medianDurationMs)} detail="Meta ≤ 10 s" icon="reports" tone={targetTone(summary.medianDurationMs, 10_000, true, summary.sheets)} />
      </section>

      <section className="omr-validation-grid">
        <SectionCard>
          <div className="section-heading">
            <div><span className="eyebrow">PRUEBA CONTROLADA</span><h2>Valida antes del primer grupo</h2><p>Usa cinco hojas personalizadas, rellénalas de acuerdo con la clave docente y fotografía cada una en condiciones reales.</p></div>
            <StatusPill tone={processing || (attempts.length > 0 && attempts.length < 5) ? 'amber' : 'blue'}>{processing ? `${progress.current}/${progress.total}` : `${Math.min(attempts.length, 5)}/5 mínimas`}</StatusPill>
          </div>
          <ol className="omr-validation-steps">
            <li><b>Imprime</b><span>Usa el mismo papel y la misma impresora del examen real.</span></li>
            <li><b>Llena</b><span>Marca las respuestas correctas con el bolígrafo que usarán los alumnos.</span></li>
            <li><b>Prueba</b><span>Toma fotos con el dispositivo y la iluminación del salón.</span></li>
          </ol>
          <div className="form-grid two omr-validation-controls">
            <label>Versión de referencia<select aria-label="Versión de referencia" value={version} disabled={processing} onChange={(event) => setVersion(event.target.value)}>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
            <div className="omr-validation-links"><Link className="button ghost" target="_blank" rel="noreferrer" to={`/exams/${detail.exam.id}/print?document=key&version=${version}`}>Abrir clave</Link><Link className="button ghost" target="_blank" rel="noreferrer" to={`/omr/${detail.exam.id}/sheets?mode=roster&version=${version}`}>Abrir hojas</Link></div>
          </div>
          <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => { if (event.target.files) void validate(event.target.files); }} />
          <input ref={fileInput} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) void validate(event.target.files); }} />
          <div className="omr-validation-actions">
            <button className="button primary" type="button" disabled={processing} onClick={() => cameraInput.current?.click()}><Icon name="exam" />{processing ? 'Analizando…' : 'Tomar foto de prueba'}</button>
            <button className="button secondary" type="button" disabled={processing} onClick={() => fileInput.current?.click()}>Analizar varias imágenes</button>
            <button className="button ghost" type="button" disabled={processing || !attempts.length} onClick={() => setAttempts([])}>Borrar prueba</button>
          </div>
          <div className="omr-local-only"><Icon name="shield" /><span><b>Prueba privada y local</b><small>Las fotografías de validación no se guardan ni se envían al servidor.</small></span></div>
        </SectionCard>

        <SectionCard>
          <div className="section-heading compact">
            <div><span className="eyebrow">CRITERIOS DE SALIDA</span><h2>Listo para producción</h2><p>TEDVIO compara cada muestra con objetivos verificables.</p></div>
          </div>
          <div className="omr-target-list">
            <div><span><b>Exactitud de burbujas</b><small>Respuestas contra la clave</small></span><StatusPill tone={targetTone(summary.bubbleAccuracy, 0.99, false, summary.sheets)}>{percentage(summary.bubbleAccuracy)} / 99%</StatusPill></div>
            <div><span><b>Identidad por QR</b><small>Sin asociación silenciosa</small></span><StatusPill tone={targetTone(summary.qrRecognition, 1, false, summary.sheets)}>{percentage(summary.qrRecognition)} / 100%</StatusPill></div>
            <div><span><b>Velocidad mediana</b><small>Desde archivo hasta resultado</small></span><StatusPill tone={targetTone(summary.medianDurationMs, 10_000, true, summary.sheets)}>{seconds(summary.medianDurationMs)} / 10 s</StatusPill></div>
            <div><span><b>Encuadre utilizable</b><small>Fotos que pasan control preventivo</small></span><StatusPill tone={targetTone(summary.photoAcceptance, 0.95, false, summary.sheets)}>{percentage(summary.photoAcceptance)} / 95%</StatusPill></div>
          </div>
          {!attempts.length ? <div className="omr-validation-empty"><Icon name="reports" /><b>Aún no hay una muestra</b><span>Haz al menos cinco capturas para evaluar el dispositivo y la iluminación.</span></div> : null}
        </SectionCard>
      </section>

      {attempts.length ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">MUESTRAS</span><h2>Resultados de la prueba</h2><p>Cada fila representa una foto; ninguna se convirtió en calificación.</p></div></div>
          <div className="omr-validation-results" role="table">
            <div role="row"><span>Hoja</span><span>Foto</span><span>Coincidencias</span><span>QR</span><span>Tiempo</span><span>Diagnóstico</span></div>
            {attempts.map((attempt, index) => <div role="row" key={attempt.id}><span><b>Prueba {index + 1}</b></span><span><StatusPill tone={attempt.accepted ? 'green' : 'amber'}>{attempt.accepted ? 'Aceptada' : 'Repetir'}</StatusPill></span><span>{attempt.questions ? `${attempt.correct}/${attempt.questions}` : '—'}</span><span>{attempt.qrRead ? 'Sí' : 'No'}</span><span>{seconds(attempt.durationMs)}</span><span><b>{attempt.message}</b>{attempt.quality ? <small>{attempt.quality.metrics.shortEdge}px · luz {Math.round(attempt.quality.metrics.brightness * 100)}% · nitidez {Math.round(attempt.quality.metrics.sharpness * 1000) / 10}</small> : null}</span></div>)}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
