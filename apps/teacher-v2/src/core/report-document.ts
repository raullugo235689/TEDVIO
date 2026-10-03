import type { AcademicReportSpec, ReportCell } from './reports';

const printAccents: Record<string, string> = {
  teal: '#087f80', blue: '#2859c5', violet: '#7650b2', amber: '#956009', rose: '#a63864', indigo: '#515bb1',
};

function escapeHtml(value: ReportCell): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
}

function csvCell(value: ReportCell): string {
  let text = String(value ?? '');
  // Names and enrollments are text even when they resemble spreadsheet formulas.
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function academicReportCsv(spec: AcademicReportSpec): string {
  const metadata = [
    ['Institución', spec.institution], ['Docente', spec.teacherName], ['Programa', spec.program],
    ['Asignatura', spec.subject], ['Grupo', spec.group], ['Ciclo escolar', spec.academicYear],
    ['Periodo', spec.period], ['Reporte', spec.title], ['Corte', spec.subtitle],
    ['Generado', new Date(spec.generatedAt).toLocaleString('es-MX')],
  ];
  return `\ufeff${[
    ...metadata.map((row) => row.map(csvCell).join(',')), '', spec.columns.map(csvCell).join(','),
    ...spec.rows.map((row) => row.map(csvCell).join(',')), '',
    ...spec.summary.map((row) => [row.label, row.value].map(csvCell).join(',')),
  ].join('\r\n')}`;
}

/** Split wide matrices horizontally while retaining the student's identity in every block. */
export function reportColumnBlocks(spec: AcademicReportSpec): number[][] {
  const all = spec.columns.map((_, index) => index);
  if (all.length <= 10) return [all];
  const attendance = spec.type === 'attendance';
  const remaining = all.slice(2, attendance ? -1 : undefined);
  const blocks: number[][] = [];
  const width = attendance ? 7 : 8;
  for (let index = 0; index < remaining.length; index += width) {
    blocks.push([0, 1, ...remaining.slice(index, index + width), ...(attendance ? [all.length - 1] : [])]);
  }
  return blocks;
}

function safeLogo(url: string): string {
  try { return ['https:', 'http:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
}

export function buildReportHtml(spec: AcademicReportSpec): string {
  const portrait = spec.type === 'roster';
  const accent = printAccents[spec.groupColor] || printAccents.teal;
  const logoUrl = safeLogo(spec.logoUrl);
  const logo = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logotipo institucional">` : '<span class="logo-fallback">TEDVIO</span>';
  const generated = new Date(spec.generatedAt).toLocaleString('es-MX');
  const blocks = reportColumnBlocks(spec);
  const head = `<header class="document-head"><div class="logo">${logo}</div><div><p class="institution">${escapeHtml(spec.institution)}</p><h1>${escapeHtml(spec.title)}</h1><p>${escapeHtml(spec.subtitle)}</p></div></header>
    <section class="document-context"><div><span>Docente</span><b>${escapeHtml(spec.teacherName)}</b></div><div><span>Asignatura · Grupo</span><b>${escapeHtml(spec.subject)} · ${escapeHtml(spec.group)}</b></div><div><span>Programa</span><b>${escapeHtml(spec.program)}</b></div><div><span>Periodo${spec.academicYear ? ' · Ciclo escolar' : ''}</span><b>${escapeHtml(spec.period)}${spec.academicYear ? ` · ${escapeHtml(spec.academicYear)}` : ''}</b></div></section>`;
  const summary = `<section class="summary">${spec.summary.map((item) => `<div><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`).join('')}</section>`;
  const tables = blocks.map((indices, block) => `<section class="document-block">${head}${block === 0 ? summary : ''}
    ${blocks.length > 1 ? `<p class="block-label">Columnas · Bloque ${block + 1} de ${blocks.length}. La matrícula y el alumno se repiten para facilitar la lectura.</p>` : ''}
    <table><caption>${escapeHtml(spec.title)} · ${spec.rows.length} registros</caption><thead><tr>${indices.map((index) => `<th scope="col">${escapeHtml(spec.columns[index] || '')}</th>`).join('')}</tr></thead><tbody>${spec.rows.length
      ? spec.rows.map((row) => `<tr>${indices.map((index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${indices.length}" class="empty">No hay registros para el periodo seleccionado.</td></tr>`}</tbody></table>
    ${spec.note ? `<p class="note">${escapeHtml(spec.note)}</p>` : ''}
    ${block === blocks.length - 1 && spec.approverName ? `<section class="approval"><span>${escapeHtml(spec.approvalLabel)}</span><b>${escapeHtml(spec.approverName)}</b><small>${escapeHtml(spec.approverTitle)}</small></section>` : ''}
    <footer>TEDVIO · ${escapeHtml(generated)}${spec.documentCode ? ` · ${escapeHtml(spec.documentCode)}` : ''}</footer></section>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(spec.title)} · ${escapeHtml(spec.group)}</title><style>
    @page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:13mm 12mm}
    *{box-sizing:border-box}body{margin:0;color:#14243d;background:white;font:10px/1.5 Arial,sans-serif;--accent:${accent}}
    .print-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 24px;padding:16px;background:#eff3f8;font-size:13px}.print-toolbar button{border:0;border-radius:8px;padding:12px 18px;background:#14243d;color:white;cursor:pointer;font:inherit}
    .document-block+.document-block{break-before:page;page-break-before:always}.document-head{display:flex;gap:18px;align-items:center;border-bottom:3px solid var(--accent);padding-bottom:14px;break-inside:avoid}.document-head>div:last-child{flex:1;min-width:0}
    .logo{width:68px;height:68px;display:flex;align-items:center;justify-content:center;flex:none}.logo img{width:100%;height:100%;object-fit:contain}.logo-fallback{font-size:13px;font-weight:bold;color:var(--accent)}
    h1{font-size:18px;line-height:1.3;margin:5px 0}p{margin:0}.institution{color:var(--accent);font-size:10px;font-weight:bold;letter-spacing:.07em}.document-head p:last-child{color:#526079}
    .document-context{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;padding:14px 0;break-inside:avoid}.document-context span,.summary span{display:block;font-size:9px;color:#526079}.document-context b{font-size:11px;overflow-wrap:anywhere}
    .summary{display:flex;gap:8px;margin-bottom:18px;break-inside:avoid}.summary>div{flex:1;border:1px solid #d6dfea;border-radius:6px;padding:8px}.summary b{display:block;font-size:15px;margin-top:3px}
    table{border-collapse:collapse;width:100%;font-size:${portrait ? '10' : '9'}px;table-layout:fixed}caption{text-align:left;color:#526079;padding:0 0 7px;font-size:9px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{padding:7px 6px;border-bottom:1px solid #d6dfea;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf2f7;color:#14243d;font-weight:bold;border-top:1px solid #cbd6e4}tbody tr:nth-child(even){background:#f7f9fc}
    ${portrait ? 'th:first-child{width:8%}th:nth-child(2){width:22%}' : 'th:first-child{width:12%}th:nth-child(2){width:23%}'}
    .empty{text-align:center;padding:24px;color:#526079}.block-label,.note{font-size:9px;color:#526079;margin:10px 0}.approval{margin:35px 0 0 auto;width:250px;max-width:100%;border-top:1px solid #14243d;text-align:center;padding-top:8px;break-inside:avoid}.approval span,.approval b,.approval small{display:block}footer{border-top:1px solid #d6dfea;margin-top:18px;padding-top:7px;color:#526079;font-size:8px;break-inside:avoid}
    @media screen{body{padding:24px;max-width:${portrait ? '850' : '1200'}px;margin:auto}.document-block+.document-block{margin-top:48px}}
    @media print{.print-toolbar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><aside class="print-toolbar"><span>Documento completo · Puedes imprimirlo o guardarlo como PDF.</span><button type="button" data-print-report>Imprimir / Guardar PDF</button></aside>${tables}</body></html>`;
}
