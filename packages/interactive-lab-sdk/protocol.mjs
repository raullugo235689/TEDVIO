/** TEDVIO Interactive Lab protocol v1. No authentication or grading inside HTML. */
export const PROTOCOL = 'tedvio.lab/1';
export const MAX_MESSAGE_BYTES = 65536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const contextKeys = ['activityId', 'versionId', 'assignmentId', 'attemptId', 'version'];
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function validateContext(value) {
  if (!exact(value, contextKeys) || !contextKeys.slice(0, 4).every(key => typeof value[key] === 'string' && UUID.test(value[key]))
    || !Number.isSafeInteger(value.version) || value.version < 1) throw new Error('Contexto de actividad inválido.');
  return Object.freeze(Object.fromEntries(contextKeys.map(key => [key, value[key]])));
}
export function sameContext(a, b) {
  try { validateContext(a); validateContext(b); return contextKeys.every(key => a[key] === b[key]); } catch { return false; }
}
function jsonValue(value, depth = 0) {
  if (depth > 6) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4000;
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => jsonValue(item, depth + 1));
  return plain(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) =>
    ID.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key) && jsonValue(item, depth + 1));
}
export function validateAnswers(answers) {
  if (!plain(answers) || Object.keys(answers).length > 100 || !jsonValue(answers)
    || new TextEncoder().encode(JSON.stringify(answers)).byteLength > MAX_MESSAGE_BYTES) throw new Error('Respuestas inválidas o demasiado grandes.');
  // Own copy: later caller mutations cannot change an in-flight submission.
  return JSON.parse(JSON.stringify(answers));
}
export function submission(context, requestId, answers) {
  if (typeof requestId !== 'string' || !UUID.test(requestId)) throw new Error('Identificador de entrega inválido.');
  return { protocol: PROTOCOL, type: 'complete', context: validateContext(context), requestId, answers: validateAnswers(answers) };
}
export function parseSubmission(value, expected) {
  if (!exact(value, ['protocol', 'type', 'context', 'requestId', 'answers']) || value.protocol !== PROTOCOL
    || value.type !== 'complete' || !sameContext(value.context, expected)) throw new Error('Mensaje fuera del intento.');
  return submission(value.context, value.requestId, value.answers);
}
export function validateReceipt(receipt, context, requestId) {
  if (!plain(receipt) || receipt.attempt_id !== context.attemptId || receipt.assignment_id !== context.assignmentId
    || receipt.version_id !== context.versionId || receipt.receipt_id !== requestId
    || !['verified', 'provisional'].includes(receipt.status) || receipt.official_grade !== false
    || (receipt.status === 'provisional' && receipt.score_percent !== null)
    || typeof receipt.submitted_at !== 'string' || !Number.isFinite(Date.parse(receipt.submitted_at))
    || (receipt.score_percent !== null && (typeof receipt.score_percent !== 'number' || !Number.isFinite(receipt.score_percent)
       || receipt.score_percent < 0 || receipt.score_percent > 100))) throw new Error('El servidor no confirmó esta entrega.');
  return { attempt_id: receipt.attempt_id, assignment_id: receipt.assignment_id, version_id: receipt.version_id,
    receipt_id: receipt.receipt_id, submitted_at: receipt.submitted_at, status: receipt.status,
    score_percent: receipt.score_percent, official_grade: false };
}
export function contextFromAttempt(attempt) {
  return validateContext({ activityId: attempt.activity_id, versionId: attempt.version_id,
    assignmentId: attempt.assignment_id, attemptId: attempt.attempt_id, version: attempt.version });
}
export function safeCsvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
