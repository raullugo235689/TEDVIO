import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { buildOmrPayload, omrLayout, OMR_LETTERS, renderQrCode } from '../../core/omr-engine';
import { fetchOmrExam, omrExamKey } from '../../core/omr';
import type { StudentRecord } from '../../core/types';
import { ErrorPanel, LoadingScreen, StatusPill } from '../../shared/components';
import { useAuth } from '../auth/AuthProvider';

interface SheetPerson {
  id: string;
  enrollment: string;
  full_name: string;
}

function cleanPerson(student: StudentRecord): SheetPerson {
  return {
    id: student.id,
    enrollment: student.enrollment || '',
    full_name: student.full_name || 'Alumno',
  };
}

function boundedCopies(value: string | null): number {
  const parsed = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(200, parsed));
}

export function OmrSheetsPage() {
  const auth = useAuth();
  const { examId = '' } = useParams();
  const [params] = useSearchParams();
  const detailQuery = useQuery({
    queryKey: omrExamKey(auth.user?.id, examId),
    queryFn: () => {
      if (!auth.user || !examId) throw new Error('No hay una evaluación válida.');
      return fetchOmrExam(auth.user, examId);
    },
    enabled: Boolean(auth.user && examId),
  });

  const mode = params.get('mode') === 'roster' ? 'roster' : 'generic';
  const alternate = params.get('alternate') === '1';
  const copies = boundedCopies(params.get('copies'));
  const requestedVersion = params.get('version') || '';
  const detail = detailQuery.data;
  const version = detail?.exam.versions.includes(requestedVersion) ? requestedVersion : detail?.exam.versions[0] || 'A';
  const people = useMemo<(SheetPerson | null)[]>(() => {
    if (!detail) return [];
    if (mode === 'roster') return detail.roster.length ? detail.roster.map(cleanPerson) : [null];
    return Array.from({ length: copies }, () => null);
  }, [copies, detail, mode]);

  useEffect(() => {
    if (!detail) return;
    let active = true;
    const containers = [...document.querySelectorAll<HTMLElement>('[data-omr-qr]')];
    void Promise.all(containers.map(async (container) => {
      if (!active) return;
      await renderQrCode(container, container.dataset.omrQr || '');
    }));
    return () => {
      active = false;
    };
  }, [alternate, detail, mode, people.length, version]);

  if (detailQuery.isLoading) return <LoadingScreen label="Preparando hojas OMR…" />;
  if (detailQuery.isError) return <ErrorPanel title="No pude preparar las hojas" detail={detailQuery.error.message} onRetry={() => detailQuery.refetch()} />;
  if (!detail) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación solicitada." />;

  const rows = omrLayout(detail.exam.question_count, detail.exam.option_count);

  return (
    <div className="omr-print-view">
      <header className="omr-print-toolbar">
        <div><span className="eyebrow">HOJAS OMR</span><h1>{detail.exam.title}</h1><p>{people.length} hoja{people.length === 1 ? '' : 's'} · {detail.exam.question_count} reactivos</p></div>
        <div><StatusPill tone="blue">{alternate ? `Alternadas ${detail.exam.versions.join('/')}` : `Versión ${version}`}</StatusPill><Link className="button ghost" to={`/omr/${detail.exam.id}`}>← OMR</Link><button className="button primary" type="button" onClick={() => window.print()}>Imprimir</button></div>
      </header>

      <main className="omr-sheet-stack">
        {people.map((person, index) => {
          const pageVersion = alternate ? detail.exam.versions[index % detail.exam.versions.length] || version : version;
          const payload = buildOmrPayload(detail.exam.id, pageVersion, person?.id || '', person?.enrollment || '');
          return (
            <section className="omr-sheet-page" key={person?.id || `generic-${index}`}>
              <i className="omr-fid top-left" /><i className="omr-fid top-right" /><i className="omr-fid bottom-right" /><i className="omr-fid bottom-left" />
              <header className="omr-sheet-head">
                <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
                <div><h2>{detail.exam.title}</h2><p>{detail.exam.subject || 'Evaluación'} · Versión <b>{pageVersion}</b></p></div>
              </header>
              <div className="omr-sheet-who">
                {person ? <><b>{person.full_name}</b><span>{person.enrollment}</span></> : <><b>Nombre: ____________________________________</b><span>Matrícula: __________________</span></>}
              </div>
              <p className="omr-sheet-help">Rellena completamente un solo círculo por reactivo. Usa tinta negra o azul oscuro. No dobles ni recortes la hoja.</p>
              <div className="omr-sheet-qr" data-omr-qr={payload} aria-label="Código QR de identificación"><small>{payload}</small></div>

              {rows.map((row) => (
                <div key={row.number}>
                  <span className="omr-question-number" style={{ left: `${row.numberX * 100}%`, top: `${row.y * 100}%` }}>{row.number}</span>
                  {row.answerXs.map((answerX, answerIndex) => (
                    <span className="omr-bubble-wrap" style={{ left: `${answerX * 100}%`, top: `${row.y * 100}%` }} key={`${row.number}-${answerIndex}`}>
                      <em>{OMR_LETTERS[answerIndex]}</em><i />
                    </span>
                  ))}
                </div>
              ))}

              <footer>TEDVIO · Hoja de respuestas OMR · {detail.exam.id.slice(0, 8)} · {pageVersion}</footer>
            </section>
          );
        })}
      </main>
    </div>
  );
}