import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examDetailKey, fetchExamDetail, type PaperExam } from '../../core/exams';
import { omrLayout, OMR_LETTERS } from '../../core/omr-engine';
import type { StudentRecord } from '../../core/types';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { useAuth } from '../auth/AuthProvider';

function OmrSheet({ exam, student, version }: { exam: PaperExam; student: StudentRecord | null; version: string }) {
  const layout = omrLayout(exam.question_count, exam.option_count);
  const letters = OMR_LETTERS.slice(0, exam.option_count);
  const sheetCode = `TEDVIO-OMR · ${exam.id.slice(0, 8)} · ${version} · ${student?.id.slice(0, 8) || 'GENERICA'}`;
  return (
    <section className="omr-sheet">
      <i className="omr-fid top-left" /><i className="omr-fid top-right" /><i className="omr-fid bottom-right" /><i className="omr-fid bottom-left" />
      <header className="omr-sheet-header"><img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" /><div><h1>{exam.title}</h1><p>{exam.subject || 'Evaluación'} · Versión <b>{version}</b></p></div></header>
      <div className="omr-sheet-student">{student ? <><b>{student.full_name}</b><span>{student.enrollment}</span></> : <><b>Nombre: ____________________________________</b><span>Matrícula: __________________</span></>}</div>
      <div className="omr-sheet-help">Rellena completamente un solo círculo por reactivo. Usa tinta negra o azul oscuro. No dobles ni recortes la hoja.</div>
      {layout.map((row) => (
        <div key={row.number}>
          <span className="omr-question-number" style={{ left: `${row.numberX * 100}%`, top: `${row.y * 100}%` }}>{row.number}</span>
          {row.optionX.map((x, index) => <span className="omr-bubble-wrap" key={`${row.number}-${index}`} style={{ left: `${x * 100}%`, top: `${row.y * 100}%` }}><small>{letters[index]}</small><i /></span>)}
        </div>
      ))}
      <footer className="omr-sheet-footer"><span>{sheetCode}</span><b>TEDVIO · Hoja de respuestas OMR</b></footer>
    </section>
  );
}

export function OmrPrintPage() {
  const auth = useAuth();
  const { examId } = useParams();
  const [searchParams] = useSearchParams();
  const detail = useQuery({
    queryKey: examDetailKey(auth.user?.id, examId),
    queryFn: () => {
      if (!auth.user || !examId) throw new Error('No se puede abrir la impresión.');
      return fetchExamDetail(auth.user, examId);
    },
    enabled: Boolean(auth.user && examId),
  });

  useEffect(() => {
    const previous = document.title;
    document.title = 'TEDVIO · Hojas OMR';
    return () => { document.title = previous; };
  }, []);

  if (detail.isLoading) return <LoadingScreen label="Preparando hojas OMR…" />;
  if (detail.isError) return <ErrorPanel title="No pude preparar la impresión" detail={detail.error.message} />;
  if (!detail.data) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación." />;

  const mode = searchParams.get('mode') === 'roster' ? 'roster' : 'generic';
  const requestedVersion = String(searchParams.get('version') || detail.data.exam.versions[0] || 'A').toUpperCase();
  const version = detail.data.exam.versions.includes(requestedVersion) ? requestedVersion : detail.data.exam.versions[0] || 'A';
  const alternate = searchParams.get('alternate') === '1' && detail.data.exam.versions.length > 1;
  const people: Array<StudentRecord | null> = mode === 'roster' && detail.data.roster.length ? detail.data.roster : [null];

  return (
    <main className="omr-print-root">
      <div className="omr-print-toolbar"><div><span className="eyebrow">VISTA DE IMPRESIÓN</span><h1>{detail.data.exam.title}</h1><p>{people.length} hoja{people.length === 1 ? '' : 's'} · revisa la escala al 100%</p></div><div><Link className="button secondary" to={`/omr/${detail.data.exam.id}`}>← Volver</Link><button className="button primary" type="button" onClick={() => window.print()}>Imprimir</button></div></div>
      <div className="omr-print-pages">
        {people.map((student, index) => <OmrSheet key={student?.id || 'generic'} exam={detail.data.exam} student={student} version={alternate ? detail.data.exam.versions[index % detail.data.exam.versions.length] || version : version} />)}
      </div>
    </main>
  );
}
