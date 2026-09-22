import type { BankQuestion, BankQuestionDraft, BloomLevel, QuestionDifficulty } from './bank';
import type { ExamDraft } from './exams';

export interface ImportIssue {
  row: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportedQuestion {
  row: number;
  draft: BankQuestionDraft;
  duplicate: boolean;
}

export interface ImportReport {
  questions: ImportedQuestion[];
  issues: ImportIssue[];
}

export interface ExamQualityReport {
  score: number;
  blockers: string[];
  warnings: string[];
  strengths: string[];
  topics: number;
  classified: number;
}

const aliases: Record<string, string[]> = {
  prompt: ['pregunta', 'reactivo', 'enunciado', 'question', 'prompt'],
  answer: ['respuesta', 'respuesta_correcta', 'clave', 'answer', 'correcta'],
  subject: ['materia', 'asignatura', 'subject'],
  topic: ['tema', 'unidad', 'topic'],
  difficulty: ['dificultad', 'difficulty'],
  bloom: ['bloom', 'nivel_bloom', 'nivel'],
  explanation: ['explicacion', 'retroalimentacion', 'justificacion', 'explanation'],
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalized(value: unknown): string {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function questionFingerprint(question: Pick<BankQuestion, 'prompt' | 'options'> | Pick<BankQuestionDraft, 'prompt' | 'options'>): string {
  const options = Array.isArray(question.options) ? question.options : [];
  return `${normalized(question.prompt)}|${options.map(normalized).sort().join('|')}`;
}

function parseLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(clean(current)); current = '';
    } else current += character;
  }
  values.push(clean(current));
  return values;
}

function fieldIndex(headers: string[], name: keyof typeof aliases): number {
  const accepted = new Set(aliases[name]);
  return headers.findIndex((header) => accepted.has(header));
}

function optionIndexes(headers: string[]): number[] {
  const indexes = ['a', 'b', 'c', 'd', 'e'].map((letter) => headers.findIndex((header) => [letter, `opcion_${letter}`, `opcion${letter}`, `option_${letter}`, `option${letter}`].includes(header)));
  while (indexes.at(-1) === -1) indexes.pop();
  return indexes;
}

function difficulty(value: string): QuestionDifficulty {
  const key = normalized(value);
  if (['baja', 'facil'].includes(key)) return 'baja';
  if (['alta', 'dificil'].includes(key)) return 'alta';
  return value ? 'media' : '';
}

function bloom(value: string): BloomLevel {
  const key = normalized(value);
  const levels: BloomLevel[] = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];
  return levels.find((level) => key.startsWith(level)) || '';
}

function makeDraft(values: Record<string, string>, options: string[], row: number, issues: ImportIssue[]): BankQuestionDraft | null {
  const prompt = clean(values.prompt);
  const answerRaw = clean(values.answer);
  const uniqueOptions = Array.from(options, clean);
  while (uniqueOptions.length && !uniqueOptions.at(-1)) uniqueOptions.pop();
  if (!prompt) { issues.push({ row, severity: 'error', message: 'Falta el enunciado.' }); return null; }
  if (uniqueOptions.length < 2 || uniqueOptions.length > 5) { issues.push({ row, severity: 'error', message: 'Debe contener entre 2 y 5 opciones distintas.' }); return null; }
  if (uniqueOptions.some((option) => !option) || new Set(uniqueOptions.map(normalized)).size !== uniqueOptions.length) { issues.push({ row, severity: 'error', message: 'Hay opciones vacías entre letras o repetidas. Corrígelas para conservar la clave.' }); return null; }
  const letter = /^[A-E]$/i.test(answerRaw) ? answerRaw.toUpperCase().charCodeAt(0) - 65 : -1;
  const correct = letter >= 0 ? uniqueOptions[letter] : uniqueOptions.find((option) => normalized(option) === normalized(answerRaw));
  if (!correct) { issues.push({ row, severity: 'error', message: 'La clave no coincide con una opción (usa A–E o el texto exacto).' }); return null; }
  return {
    title: prompt.slice(0, 110), subject: clean(values.subject), topic: clean(values.topic), questionType: 'multiple_choice',
    prompt, options: uniqueOptions, correctAnswers: [correct], explanation: clean(values.explanation),
    difficulty: difficulty(clean(values.difficulty)), folder: '', tags: [], bloom: bloom(clean(values.bloom)), mediaUrl: '', mediaType: '', favorite: false, archived: false,
  };
}

function parseTable(text: string, existing: BankQuestion[]): ImportReport | null {
  const lines: string[] = [];
  let record = '', quoted = false;
  const source = text.replace(/\r/g, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { record += '""'; index += 1; continue; }
      quoted = !quoted;
    }
    if (character === '\n' && !quoted) { if (record.trim()) lines.push(record); record = ''; }
    else record += character;
  }
  if (record.trim()) lines.push(record);
  if (lines.length < 2) return null;
  const headerLine = lines[0] || '';
  const delimiter = headerLine.includes('\t') ? '\t' : (headerLine.split(';').length > headerLine.split(',').length ? ';' : ',');
  const headers = parseLine(lines[0] || '', delimiter).map(normalized);
  const promptIndex = fieldIndex(headers, 'prompt');
  const answerIndex = fieldIndex(headers, 'answer');
  const optionsAt = optionIndexes(headers);
  if (promptIndex < 0 || answerIndex < 0 || optionsAt.length < 2) return null;
  if (quoted) return { questions: [], issues: [{ row: lines.length, severity: 'error', message: 'Hay comillas sin cerrar en el CSV.' }] };
  const issues: ImportIssue[] = [];
  const known = new Set(existing.map(questionFingerprint));
  const seen = new Set<string>();
  const questions: ImportedQuestion[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseLine(lines[index] || '', delimiter);
    const values: Record<string, string> = {};
    for (const name of Object.keys(aliases)) {
      const at = fieldIndex(headers, name as keyof typeof aliases);
      values[name] = at >= 0 ? cells[at] || '' : '';
    }
    const draft = makeDraft(values, optionsAt.map((at) => cells[at] || ''), index + 1, issues);
    if (!draft) continue;
    const fingerprint = questionFingerprint(draft);
    const duplicate = known.has(fingerprint) || seen.has(fingerprint);
    if (duplicate) issues.push({ row: index + 1, severity: 'warning', message: 'Posible duplicado; no se importará automáticamente.' });
    seen.add(fingerprint);
    questions.push({ row: index + 1, draft, duplicate });
  }
  return { questions, issues };
}

function parseBlocks(text: string, existing: BankQuestion[]): ImportReport {
  const issues: ImportIssue[] = [];
  const known = new Set(existing.map(questionFingerprint));
  const seen = new Set<string>();
  const chunks = text.replace(/\r/g, '').trim().split(/\n\s*\n|(?=^\s*\d+[.)]\s+)/m).filter((chunk) => chunk.trim());
  const questions: ImportedQuestion[] = [];
  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n').map(clean).filter(Boolean);
    const promptLines: string[] = [];
    const options: string[] = [];
    const values: Record<string, string> = { prompt: '', answer: '', subject: '', topic: '', difficulty: '', bloom: '', explanation: '' };
    for (const line of lines) {
      const option = line.match(/^([A-E])[).:-]\s*(.+)$/i);
      const meta = line.match(/^(RESPUESTA|CLAVE|TEMA|MATERIA|ASIGNATURA|DIFICULTAD|BLOOM|EXPLICACI[ÓO]N)\s*:\s*(.+)$/i);
      if (option) options[(option[1] || 'A').toUpperCase().charCodeAt(0) - 65] = option[2] || '';
      else if (meta) {
        const key = normalized(meta[1]);
        if (['respuesta', 'clave'].includes(key)) values.answer = meta[2] || '';
        else if (['materia', 'asignatura'].includes(key)) values.subject = meta[2] || '';
        else if (key === 'tema') values.topic = meta[2] || '';
        else if (key === 'dificultad') values.difficulty = meta[2] || '';
        else if (key === 'bloom') values.bloom = meta[2] || '';
        else values.explanation = meta[2] || '';
      } else promptLines.push(line.replace(/^\d+[.)]\s*/, ''));
    }
    values.prompt = promptLines.join(' ');
    const draft = makeDraft(values, options, index + 1, issues);
    if (!draft) return;
    const fingerprint = questionFingerprint(draft);
    const duplicate = known.has(fingerprint) || seen.has(fingerprint);
    if (duplicate) issues.push({ row: index + 1, severity: 'warning', message: 'Posible duplicado; no se importará automáticamente.' });
    seen.add(fingerprint);
    questions.push({ row: index + 1, draft, duplicate });
  });
  return { questions, issues };
}

export function parseQuestionImport(text: string, existing: BankQuestion[] = []): ImportReport {
  if (!text.trim()) return { questions: [], issues: [{ row: 0, severity: 'error', message: 'Pega preguntas o carga un archivo CSV/TXT.' }] };
  if (/^[\s\uFEFF]*[\[{]/.test(text)) return parseBankJson(text, existing);
  return parseTable(text, existing) || parseBlocks(text, existing);
}

export function bankBackup(questions: BankQuestion[]): string {
  return JSON.stringify({ format: 'tedvio-question-bank', version: 1, questions: questions.map(({ title, subject, topic, question_type, prompt, options, correct_answer, explanation, difficulty, folder, tags, bloom, media_url, media_type, favorite, archived }) => ({ title, subject, topic, question_type, prompt, options, correct_answer, explanation, difficulty, folder, tags, bloom, media_url, media_type, favorite, archived })) }, null, 2);
}

function parseBankJson(source: string, existing: BankQuestion[]): ImportReport {
  const report: ImportReport = { questions: [], issues: [] };
  try {
    const parsed = JSON.parse(source.replace(/^\uFEFF/, ''));
    if (!Array.isArray(parsed) && (parsed?.format !== 'tedvio-question-bank' || parsed?.version !== 1)) throw new Error('Usa un respaldo TEDVIO versión 1 o una lista JSON de preguntas.');
    const rows = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(rows) || !rows.length) throw new Error('El archivo debe contener una lista de preguntas.');
    const known = new Set(existing.map(questionFingerprint));
    rows.forEach((row: unknown, index: number) => {
      try {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('La pregunta debe ser un objeto.');
        const value = row as Record<string, unknown>;
        const string = (key: string, fallback = '') => {
          const item = value[key];
          if (item == null) return fallback;
          if (typeof item !== 'string') throw new Error(`${key} debe ser texto.`);
          return item.trim();
        };
        const list = (item: unknown, field: string): string[] => {
          if (item == null) return [];
          if (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string')) throw new Error(`${field} debe contener textos.`);
          return item.map((entry: string) => entry.trim());
        };
        const questionType = string('questionType', string('question_type', 'multiple_choice')) as BankQuestionDraft['questionType'];
        if (!['multiple_choice','multiple_select','true_false','open_text','numeric','poll','scale_5','ordering','hotspot'].includes(questionType)) throw new Error('Tipo de pregunta desconocido.');
        const rawAnswer = value.correctAnswers ?? value.correct_answer;
        const correctAnswers = typeof rawAnswer === 'string' || (questionType === 'numeric' && typeof rawAnswer === 'number') ? [String(rawAnswer)] : list(rawAnswer, 'Respuesta');
        const options = list(value.options, 'Opciones');
        const prompt = string('prompt');
        if (!prompt) throw new Error('Falta el enunciado.');
        if (['multiple_choice','multiple_select','true_false','poll','scale_5','ordering'].includes(questionType)) {
          if (options.length < 2 || options.some((option) => !option) || new Set(options).size !== options.length) throw new Error('Revisa las opciones vacías o repetidas.');
          if (['multiple_choice','multiple_select','true_false'].includes(questionType) && (!correctAnswers.length || correctAnswers.some((answer) => !options.includes(answer)))) throw new Error('La clave no coincide con las opciones.');
          if (['multiple_choice','true_false'].includes(questionType) && correctAnswers.length !== 1) throw new Error('Este tipo requiere una sola clave.');
          if (questionType === 'true_false' && JSON.stringify(options) !== JSON.stringify(['Verdadero','Falso'])) throw new Error('Usa Verdadero y Falso, en ese orden.');
          if (questionType === 'scale_5' && options.join('|') !== '1|2|3|4|5') throw new Error('La escala debe contener 1, 2, 3, 4 y 5.');
        }
        const level = string('difficulty') as QuestionDifficulty;
        const cognitive = string('bloom') as BloomLevel;
        const mediaType = string('mediaType', string('media_type')) as BankQuestionDraft['mediaType'];
        const mediaUrl = string('mediaUrl', string('media_url'));
        if (!['','baja','media','alta'].includes(level) || !['','recordar','comprender','aplicar','analizar','evaluar','crear'].includes(cognitive)) throw new Error('Dificultad o nivel Bloom no válido.');
        if (!['','image','audio','video'].includes(mediaType) || (mediaType && !mediaUrl)) throw new Error('Revisa el recurso multimedia.');
        for (const flag of ['favorite','archived']) if (value[flag] != null && typeof value[flag] !== 'boolean') throw new Error(`${flag} debe ser true o false.`);
        const draft: BankQuestionDraft = { title: string('title', prompt.slice(0,110)), prompt, questionType, subject: string('subject'), topic: string('topic'), options, correctAnswers, explanation: string('explanation'), difficulty: level, bloom: cognitive, folder: string('folder'), tags: list(value.tags, 'Etiquetas'), mediaType, mediaUrl, favorite: value.favorite === true, archived: value.archived === true };
        const fingerprint = questionFingerprint(draft);
        const duplicate = known.has(fingerprint);
        known.add(fingerprint);
        if (duplicate) report.issues.push({ row: index + 1, severity: 'warning', message: 'Posible duplicado; no se importará automáticamente.' });
        report.questions.push({ row: index + 1, draft, duplicate });
      } catch (error) { report.issues.push({ row: index + 1, severity: 'error', message: (error as Error).message }); }
    });
  } catch (error) { report.issues.push({ row: 0, severity: 'error', message: `JSON no válido: ${(error as Error).message}` }); }
  return report;
}

export function selectBalancedQuestions(questions: BankQuestion[], count: number): BankQuestion[] {
  if (count <= 0 || !questions.length) return [];
  const wanted = Math.max(1, Math.min(60, Math.round(count)));
  const buckets = new Map<string, BankQuestion[]>();
  questions.forEach((question) => {
    const key = `${question.topic || 'Sin tema'}|${question.difficulty || 'sin dificultad'}`;
    buckets.set(key, [...(buckets.get(key) || []), question]);
  });
  const groups = [...buckets.values()];
  const selected: BankQuestion[] = [];
  while (selected.length < wanted && groups.some((group) => group.length)) {
    for (const group of groups) {
      const next = group.shift();
      if (next) selected.push(next);
      if (selected.length === wanted) break;
    }
  }
  return selected;
}

export function reorderExamOptions(options: string[], sourcePosition: number, versionIndex: number): string[] {
  if (versionIndex <= 0 || options.length < 2) return [...options];
  const shift = (sourcePosition + versionIndex) % options.length || 1;
  const reordered = [...options.slice(shift), ...options.slice(0, shift)];
  return versionIndex > 1 && reordered.length > 2 ? reordered.reverse() : reordered;
}

export function assessExamQuality(draft: ExamDraft, bankQuestions: BankQuestion[]): ExamQualityReport {
  const bank = new Map(bankQuestions.map((question) => [question.id, question]));
  const questions = draft.questions.map((item) => bank.get(item.bankQuestionId)).filter((item): item is BankQuestion => Boolean(item));
  const blockers: string[] = [], warnings: string[] = [], strengths: string[] = [];
  if (!draft.title.trim()) blockers.push('Agrega un título.');
  if (!questions.length) blockers.push('Agrega al menos un reactivo.');
  if (questions.length > 60) blockers.push('Reduce la evaluación a 60 reactivos.');
  const fingerprints = questions.map(questionFingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) blockers.push('Hay reactivos duplicados en la composición.');
  const topics = new Set(questions.map((question) => clean(question.topic)).filter(Boolean)).size;
  const classified = questions.filter((question) => question.topic && question.difficulty && question.bloom).length;
  if (questions.length >= 5 && topics < 2) warnings.push('La evaluación cubre un solo tema.');
  if (questions.length && classified / questions.length < 0.6) warnings.push('Clasifica tema, dificultad y Bloom en más reactivos.');
  const answerCounts = new Map<string, number>();
  questions.forEach((question) => {
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const letter = String.fromCharCode(65 + options.indexOf(String(question.correct_answer)));
    answerCounts.set(letter, (answerCounts.get(letter) || 0) + 1);
  });
  if (questions.length >= 8 && Math.max(0, ...answerCounts.values()) / questions.length > 0.5) warnings.push('Más de la mitad de las claves usan la misma letra en la versión A.');
  if (topics >= 2) strengths.push(`${topics} temas representados.`);
  if (questions.length && classified === questions.length) strengths.push('Todos los reactivos están clasificados.');
  if (draft.versions.length > 1) strengths.push(`${draft.versions.length} versiones equivalentes configuradas.`);
  const score = Math.max(0, Math.min(100, 100 - blockers.length * 35 - warnings.length * 12));
  return { score, blockers, warnings, strengths, topics, classified };
}
