import { useEffect, useMemo, useState } from 'react';
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
  const [params, setParams] = useSearchParams();
  const paper = params.get('paper') === 'letter' ? 'letter' : 'a4';
  const [qrState, setQrState] = useState<{ key: string; sources: string[]; failed: boolean }>({ key: '', sources: [], failed: false });
  const [attempt, setAttempt] = useState(0);
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

  const printKey = JSON.stringify([detail?.exam.id, people.map(person => [person?.id, person?.enrollment]), version, alternate, attempt]);
  const printReady = qrState.key === printKey && qrState.sources.length === people.length && people.length > 0;
  useEffect(() => {
    if (!detail) return;
    let active = true;
    const payloads = people.map((person, index) => buildOmrPayload(detail.exam.id, alternate ? detail.exam.versions[index % detail.exam.versions.length] || version : version, person?.id || '', person?.enrollment || ''));
    void Promise.all(payloads.map(payload => renderQrCode(payload)))
      .then(sources => { if (active) setQrState({ key: printKey, sources, failed: false }); })
      .catch(() => { if (active) setQrState({ key: printKey, sources: [], failed: true }); });
    return () => { active = false; };
  }, [printKey, detail]);

  if (detailQuery.isLoading) return <LoadingScreen label="Preparando hojas OMR…" />;
  if (detailQuery.isError) return <ErrorPanel title="No pude preparar las hojas" detail={detailQuery.error.message} onRetry={() => detailQuery.refetch()} />;
  if (!detail) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación solicitada." />;

  const rows = omrLayout(detail.exam.question_count, detail.exam.option_count);

  return (
    <div className="omr-print-view" data-print-ready={printReady} data-paper={paper}>
      <style>{`@page { size: ${paper === 'letter' ? 'letter' : 'A4'}; margin: 0; }`}</style>
      <p className="omr-print-warning">Espera a que las hojas y sus códigos QR estén listos antes de imprimir.</p>
      <header className="omr-print-toolbar">
        <div><span className="eyebrow">HOJAS OMR</span><h1>{detail.exam.title}</h1><p>{people.length} hoja{people.length === 1 ? '' : 's'} · {detail.exam.question_count} reactivos</p></div>
        <div><StatusPill tone="blue">{alternate ? `Alternadas ${detail.exam.versions.join('/')}` : `Versión ${version}`}</StatusPill><Link className="button ghost" to={`/omr/${detail.exam.id}`}>← OMR</Link><button className="button primary" type="button" disabled={!printReady} onClick={() => window.print()}>{printReady ? 'Imprimir / Guardar PDF' : 'Preparando códigos…'}</button></div>
      </header>

      <section className="omr-paper-controls">
        <label>Papel<select value={paper} onChange={event => { const next = new URLSearchParams(params); next.set('paper', event.target.value); setParams(next); }}><option value="a4">A4 · 210 × 297 mm</option><option value="letter">Carta · 216 × 279 mm</option></select></label>
        <div><b>{printReady ? 'Hojas listas para imprimir' : 'Preparando identificación de las hojas'}</b><p>Imprime al 100%, sin encabezados ni pies del navegador, en papel blanco. Conserva las cuatro marcas negras completas.</p></div>
        {qrState.failed && qrState.key === printKey ? <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar códigos</button> : null}
      </section>
      <main className="omr-sheet-stack">
        {people.map((person, index) => {
          const pageVersion = alternate ? detail.exam.versions[index % detail.exam.versions.length] || version : version;
          const payload = buildOmrPayload(detail.exam.id, pageVersion, person?.id || '', person?.enrollment || '');
          return (
            <section className="omr-sheet-page" key={person?.id || `generic-${index}`}>
              <i className="omr-fid top-left" /><i className="omr-fid top-right" /><i className="omr-fid bottom-right" /><i className="omr-fid bottom-left" />
              <header className="omr-sheet-head">
                <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
                <div><span className="omr-sheet-kicker">HOJA DE RESPUESTAS · {detail.exam.question_count} REACTIVOS</span><h2>{detail.exam.title}</h2><p>{detail.exam.subject || 'Evaluación'} · Versión <b>{pageVersion}</b></p></div>
              </header>
              <div className="omr-sheet-who">
                {person ? <><b>{person.full_name}</b><span>{person.enrollment}</span></> : <><b>Nombre: ____________________________________</b><span>Matrícula: __________________</span></>}
              </div>
              <p className="omr-sheet-help">Rellena completamente un solo círculo por reactivo. Usa tinta negra o azul oscuro. No dobles ni recortes la hoja.</p>
              <div className="omr-sheet-qr" data-omr-qr={payload} aria-label="Código QR de identificación">{printReady ? <img src={qrState.sources[index]} alt="Código QR de identificación" /> : <small>Preparando QR…</small>}</div>

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

              <footer><span>TEDVIO · {detail.exam.id.slice(0, 8)} · Versión {pageVersion}</span><span>{index + 1} / {people.length} · {paper === 'letter' ? 'CARTA' : 'A4'}</span></footer>
            </section>
          );
        })}
      </main>
    </div>
  );
}