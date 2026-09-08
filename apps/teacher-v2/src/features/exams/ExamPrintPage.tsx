import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { answerLetter, examDetailKey, fetchExamDetail } from '../../core/exams';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { useAuth } from '../auth/AuthProvider';

export function ExamPrintPage() {
  const auth = useAuth(), { examId = '' } = useParams(), [params, setParams] = useSearchParams();
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set()), [broken, setBroken] = useState(false);
  const detail = useQuery({ queryKey: examDetailKey(auth.user?.id, examId), queryFn: () => { if (!auth.user) throw new Error('Tu sesión expiró.'); return fetchExamDetail(auth.user, examId); }, enabled: Boolean(auth.user && examId) });
  if (detail.isLoading) return <LoadingScreen label="Preparando el cuadernillo…" />;
  if (!detail.data || detail.isError) return <ErrorPanel title="No pude preparar el examen" detail={detail.error?.message || 'Vuelve a abrir la evaluación.'} onRetry={() => detail.refetch()} />;
  const { exam, questions, group } = detail.data;
  const version = params.get('version') || exam.versions[0] || 'A';
  const versions = version === 'all' ? exam.versions : [exam.versions.includes(version) ? version : exam.versions[0] || 'A'];
  const teacher = params.get('document') === 'key', letter = params.get('paper') === 'letter';
  const selected = questions.filter(row => versions.includes(row.version));
  const media = teacher ? [] : selected.filter(row => row.media_url);
  const unsupported = media.some(row => row.media_type !== 'image');
  const keyFor = (label: string) => { const raw = exam.answer_keys[label]; return (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value) : []).map(value => String(value || '').toUpperCase()); };
  const complete = versions.every(label => { const rows = questions.filter(row => row.version === label).sort((a, b) => a.position - b.position); const key = keyFor(label); return key.length === exam.question_count && key.every(letter => /^[A-E]$/.test(letter) && letter.charCodeAt(0) - 65 < exam.option_count) && (teacher || (rows.length === exam.question_count && rows.every((row, index) => row.position === index + 1 && answerLetter(row) === key[index]))); });
  const ready = complete && !unsupported && (teacher || !broken) && media.every(row => loaded.has(row.media_url!));
  function change(key: string, value: string) { setBroken(false); const next = new URLSearchParams(params); next.set(key, value); setParams(next); }
  return <div className="exam-print-view" data-print-ready={ready}>
    <style>{`@page { size: ${letter ? 'letter' : 'A4'}; margin: 16mm; }`}</style>
    <header className="exam-print-toolbar"><div><span className="eyebrow">PREPARAR IMPRESIÓN</span><h1>{exam.title}</h1><p>El cuadernillo del alumno y la clave docente se imprimen por separado.</p></div><div><Link className="button ghost" to={`/exams/${examId}`}>← Evaluación</Link><button className="button primary" disabled={!ready} onClick={() => window.print()}>Imprimir / Guardar PDF</button></div></header>
    <section className="exam-print-controls">
      <label>Documento<select value={teacher ? 'key' : 'student'} onChange={event => change('document', event.target.value)}><option value="student">Cuadernillo del alumno</option><option value="key">Clave docente</option></select></label>
      <label>Versión<select value={version} onChange={event => change('version', event.target.value)}>{exam.versions.map(label => <option key={label} value={label}>Versión {label}</option>)}<option value="all">Todas las versiones</option></select></label>
      <label>Papel<select value={letter ? 'letter' : 'a4'} onChange={event => change('paper', event.target.value)}><option value="a4">A4</option><option value="letter">Carta</option></select></label>
      <Link className="button secondary" to={`/omr/${examId}/sheets?version=${versions[0]}&paper=${letter ? 'letter' : 'a4'}`}>Hojas de respuesta</Link>
    </section>
    {!ready ? <p className="exam-print-notice" role="alert">{!complete ? 'Faltan reactivos o claves en alguna versión. Completa la evaluación antes de imprimir.' : unsupported ? 'Hay recursos que no son imágenes. Adapta esos reactivos para la versión impresa.' : broken ? 'No se pudo cargar una imagen. Reabre la vista cuando tengas conexión.' : 'Cargando las imágenes del examen…'}</p> : null}
    <p className="exam-print-notice">{teacher ? 'USO DOCENTE: este documento contiene las respuestas correctas.' : 'Selecciona el tamaño de papel correcto y desactiva encabezados y pies del navegador.'}</p>
    <p className="exam-print-blocked">La evaluación todavía no está lista para imprimir. Regresa a la vista previa y revisa los avisos.</p>
    <main className="exam-document-stack">{versions.map(label => <article className="exam-document" key={label}>
      <header className="exam-document-head"><div className="exam-document-brand">TEDVIO <span>{teacher ? 'CLAVE DOCENTE' : 'EVALUACIÓN ESCRITA'}</span></div><b className="exam-paper-version">{label}</b><h1>{exam.title}</h1><p>{exam.subject || 'Evaluación'}{group ? ` · ${group.group_name || group.name}` : ''}</p><small>{exam.question_count} reactivos · {exam.exam_date} · Versión {label}{exam.status === 'draft' ? ' · BORRADOR' : ''}</small></header>
      {teacher ? <><p className="exam-key-warning">CONFIDENCIAL · No entregar al alumno.</p><div className="exam-answer-key">{keyFor(label).map((answer, index) => <div key={index}><span>{index + 1}</span><b>{answer}</b></div>)}</div></> : <>
        <div className="exam-student-fields"><span>Nombre: __________________________________________________</span><span>Matrícula: ____________________ Fecha: ____________________</span></div>
        <section className="exam-paper-instructions"><b>INSTRUCCIONES</b><p>{exam.instructions || 'Lee cada reactivo y selecciona una respuesta. Registra tus respuestas en la hoja correspondiente a esta versión.'}</p></section>
        <ol className="exam-paper-questions">{questions.filter(row => row.version === label).sort((a, b) => a.position - b.position).map(row => <li key={row.id} value={row.position}><div className="exam-paper-prompt">{row.prompt}</div>{row.media_url && row.media_type === 'image' ? <img src={row.media_url} alt={`Imagen del reactivo ${row.position}`} onLoad={() => setLoaded(current => new Set(current).add(row.media_url!))} onError={() => setBroken(true)} /> : null}<ol type="A">{(Array.isArray(row.options) ? row.options : []).map((option, index) => <li key={index}>{String(option)}</li>)}</ol></li>)}</ol>
      </>}
      <footer className="exam-document-footer">TEDVIO · {exam.id.slice(0, 8)} · Versión {label} · {teacher ? 'Clave docente' : 'Cuadernillo del alumno'}</footer>
    </article>)}</main>
  </div>;
}
