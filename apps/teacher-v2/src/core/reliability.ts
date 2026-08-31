import { supabase } from './supabase';

export const RELIABILITY_VERSION = '2.1.0-reliability-core';

export type ReliabilitySeverity = 'info' | 'warning' | 'error';
export type SupportCategory = 'bug' | 'question' | 'feature' | 'billing' | 'other';

export interface ReliabilitySnapshot {
  online: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
}

export interface SupportSubmission {
  reference: string;
  queued: boolean;
}

export interface SupportReportSummary {
  id: string;
  category: SupportCategory;
  message: string;
  page: string | null;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ClientEventRow {
  id: string;
  user_id: string;
  event_type: string;
  severity: ReliabilitySeverity;
  page: string;
  app_version: string;
  user_agent: string;
  context: Record<string, unknown>;
}

interface SupportReportRow {
  id: string;
  user_id: string;
  category: SupportCategory;
  message: string;
  page: string;
  app_version: string;
  user_agent: string;
  context: Record<string, unknown>;
  status: 'new';
}

type ReliabilityQueueItem =
  | {
      id: string;
      kind: 'event';
      ownerId: string;
      queuedAt: string;
      row: ClientEventRow;
    }
  | {
      id: string;
      kind: 'support';
      ownerId: string;
      queuedAt: string;
      reference: string;
      row: SupportReportRow;
    };

interface ClientEventInput {
  eventType: string;
  severity?: ReliabilitySeverity;
  error?: unknown;
  context?: Record<string, unknown>;
}

interface SupportReportInput {
  userId: string;
  category: SupportCategory;
  message: string;
  includeDiagnostics: boolean;
  source?: string;
}

const QUEUE_KEY = 'tedvio.reliability.queue.v1';
const LAST_SYNC_KEY = 'tedvio.reliability.last_sync';
const LAST_DIAGNOSTIC_KEY = 'tedvio.reliability.last_diagnostic';
const STATE_EVENT = 'tedvio:reliability-state';
const SUPPORT_EVENT = 'tedvio:support-submitted';
const MAX_QUEUE_ITEMS = 40;
const BLOCKED_CONTEXT_KEY = /(student|alumno|enrollment|matricula|grade|score|answer|response|prompt|question_text|note|full_name|email)/i;
const recentEvents = new Map<string, { at: number; reference: string }>();

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function createIncidentReference(id = createId()): string {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  return `TV-${stamp}-${id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.hash}`.slice(0, 500);
}

function scrubText(value: unknown, maxLength = 500): string {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b\d{8,}\b/g, '[número]')
    .slice(0, maxLength);
}

function errorDetails(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: scrubText(error.name || 'Error', 80),
      message: scrubText(error.message || 'Error de aplicación', 500),
      stack: error.stack ? scrubText(error.stack, 1800) : undefined,
    };
  }
  return {
    name: 'Error',
    message: scrubText(error || 'Error de aplicación', 500),
  };
}

function sanitizeValue(value: unknown, key = '', depth = 0): unknown {
  if (BLOCKED_CONTEXT_KEY.test(key)) return '[redactado]';
  if (depth > 3) return '[profundidad limitada]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return scrubText(value, 700);
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeValue(item, key, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey, depth + 1)]),
    );
  }
  return scrubText(value, 200);
}

function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(context, '', 0) as Record<string, unknown>;
}

function connectionDetails(): Record<string, unknown> {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  }).connection;
  return {
    online: navigator.onLine,
    visibility: document.visibilityState,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    connection: connection?.effectiveType || 'unknown',
    save_data: Boolean(connection?.saveData),
  };
}

function readQueue(): ReliabilityQueueItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ReliabilityQueueItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<ReliabilityQueueItem>;
      return Boolean(candidate.id && candidate.ownerId && (candidate.kind === 'event' || candidate.kind === 'support') && candidate.row);
    });
  } catch {
    return [];
  }
}

function emitState(): void {
  try {
    window.dispatchEvent(new CustomEvent<ReliabilitySnapshot>(STATE_EVENT, { detail: getReliabilitySnapshot() }));
  } catch {
    // El estado visual es opcional.
  }
}

function writeQueue(items: ReliabilityQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE_ITEMS)));
  } catch {
    // Si el almacenamiento local no está disponible, la aplicación sigue funcionando.
  }
  emitState();
}

function queueItem(item: ReliabilityQueueItem): void {
  const queue = readQueue().filter((current) => current.id !== item.id);
  queue.push(item);
  writeQueue(queue);
}

function markSynced(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    // El registro visual es opcional.
  }
  emitState();
}

function saveLocalDiagnostic(reference: string, input: ClientEventInput): void {
  try {
    const details = errorDetails(input.error);
    localStorage.setItem(
      LAST_DIAGNOSTIC_KEY,
      JSON.stringify({
        reference,
        at: new Date().toISOString(),
        page: currentPath(),
        event_type: scrubText(input.eventType, 100),
        error_name: details.name,
        error_message: details.message,
      }),
    );
  } catch {
    // El diagnóstico local es opcional.
  }
}

function recentDiagnostic(): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_DIAGNOSTIC_KEY) || 'null') as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    return sanitizeContext({
      reference: value.reference,
      at: value.at,
      page: value.page,
      event_type: value.event_type,
      error_name: value.error_name,
      error_message: value.error_message,
    });
  } catch {
    return null;
  }
}

async function activeUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id || null;
}

async function insertEvent(row: ClientEventRow): Promise<boolean> {
  const { error } = await supabase.from('tedvio_client_events').insert(row);
  return !error || error.code === '23505';
}

async function insertSupport(row: SupportReportRow): Promise<boolean> {
  const { error } = await supabase.from('tedvio_support_reports').insert(row);
  return !error || error.code === '23505';
}

async function deliver(item: ReliabilityQueueItem): Promise<boolean> {
  if (item.kind === 'event') return insertEvent(item.row);
  return insertSupport(item.row);
}

export function getReliabilitySnapshot(): ReliabilitySnapshot {
  let lastSyncAt: string | null = null;
  try {
    lastSyncAt = localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    lastSyncAt = null;
  }
  return {
    online: navigator.onLine,
    pendingCount: readQueue().length,
    lastSyncAt,
  };
}

export async function flushReliabilityQueue(): Promise<ReliabilitySnapshot> {
  if (!navigator.onLine) return getReliabilitySnapshot();
  const ownerId = await activeUserId();
  if (!ownerId) return getReliabilitySnapshot();

  const queue = readQueue();
  if (!queue.length) {
    markSynced();
    return getReliabilitySnapshot();
  }

  const remaining: ReliabilityQueueItem[] = [];
  let deliveredCount = 0;

  for (const item of queue) {
    if (item.ownerId !== ownerId) {
      remaining.push(item);
      continue;
    }
    try {
      if (await deliver(item)) {
        deliveredCount += 1;
        if (item.kind === 'support') {
          window.dispatchEvent(new CustomEvent(SUPPORT_EVENT, { detail: { reference: item.reference } }));
        }
      } else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  if (deliveredCount > 0) markSynced();
  return getReliabilitySnapshot();
}

export function recordClientEvent(input: ClientEventInput): string {
  const details = errorDetails(input.error);
  const dedupeKey = `${input.eventType}:${details.name}:${details.message}`;
  const previous = recentEvents.get(dedupeKey);
  if (previous && Date.now() - previous.at < 15_000) return previous.reference;

  const id = createId();
  const reference = createIncidentReference(id);
  recentEvents.set(dedupeKey, { at: Date.now(), reference });
  saveLocalDiagnostic(reference, input);

  void (async () => {
    const ownerId = await activeUserId();
    if (!ownerId) return;

    const row: ClientEventRow = {
      id,
      user_id: ownerId,
      event_type: scrubText(input.eventType || 'application_error', 100),
      severity: input.severity || 'error',
      page: currentPath(),
      app_version: RELIABILITY_VERSION,
      user_agent: scrubText(navigator.userAgent, 700),
      context: sanitizeContext({
        reference,
        ...connectionDetails(),
        error_name: details.name,
        error_message: details.message,
        error_stack: details.stack,
        ...(input.context || {}),
      }),
    };

    if (!navigator.onLine) {
      queueItem({ id, kind: 'event', ownerId, queuedAt: new Date().toISOString(), row });
      return;
    }

    try {
      if (await insertEvent(row)) markSynced();
      else queueItem({ id, kind: 'event', ownerId, queuedAt: new Date().toISOString(), row });
    } catch {
      queueItem({ id, kind: 'event', ownerId, queuedAt: new Date().toISOString(), row });
    }
  })();

  return reference;
}

export function recordQueryFailure(kind: 'query' | 'mutation', queryKey: readonly unknown[] | undefined, error: unknown): string {
  const key = (queryKey || []).map((part) => {
    if (typeof part === 'string' || typeof part === 'number') return String(part);
    return typeof part;
  }).join(':');
  return recordClientEvent({
    eventType: `${kind}_failure`,
    error,
    context: { operation: kind, query_key: key || 'unlabeled' },
  });
}

export async function submitSupportReport(input: SupportReportInput): Promise<SupportSubmission> {
  const message = input.message.trim();
  if (message.length < 5 || message.length > 4000) {
    throw new Error('Describe el problema con entre 5 y 4000 caracteres.');
  }

  const id = createId();
  const reference = createIncidentReference(id);
  const diagnostic = input.includeDiagnostics ? recentDiagnostic() : null;
  const context = sanitizeContext({
    reference,
    source: input.source || 'support-center',
    diagnostics_included: input.includeDiagnostics,
    ...(input.includeDiagnostics ? connectionDetails() : {}),
    ...(diagnostic ? { recent_diagnostic: diagnostic } : {}),
  });

  const row: SupportReportRow = {
    id,
    user_id: input.userId,
    category: input.category,
    message,
    page: currentPath(),
    app_version: RELIABILITY_VERSION,
    user_agent: input.includeDiagnostics ? scrubText(navigator.userAgent, 700) : '',
    context,
    status: 'new',
  };

  if (!navigator.onLine) {
    queueItem({
      id,
      kind: 'support',
      ownerId: input.userId,
      queuedAt: new Date().toISOString(),
      reference,
      row,
    });
    return { reference, queued: true };
  }

  try {
    if (await insertSupport(row)) {
      markSynced();
      window.dispatchEvent(new CustomEvent(SUPPORT_EVENT, { detail: { reference } }));
      return { reference, queued: false };
    }
  } catch {
    // El reporte se conserva localmente debajo.
  }

  queueItem({
    id,
    kind: 'support',
    ownerId: input.userId,
    queuedAt: new Date().toISOString(),
    reference,
    row,
  });
  return { reference, queued: true };
}

export async function fetchSupportReports(userId: string): Promise<SupportReportSummary[]> {
  const { data, error } = await supabase
    .from('tedvio_support_reports')
    .select('id,category,message,page,status,context,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data || []) as SupportReportSummary[];
}

export function supportReportReference(report: Pick<SupportReportSummary, 'id' | 'context'>): string {
  const stored = report.context?.reference;
  return typeof stored === 'string' && stored ? stored : createIncidentReference(report.id);
}

export function installGlobalReliability(): void {
  const runtimeWindow = window as Window & { __TEDVIO_RELIABILITY_INSTALLED__?: boolean };
  if (runtimeWindow.__TEDVIO_RELIABILITY_INSTALLED__) return;
  runtimeWindow.__TEDVIO_RELIABILITY_INSTALLED__ = true;

  window.addEventListener('error', (event) => {
    const message = String(event.message || '');
    if (/ResizeObserver loop/i.test(message)) return;
    recordClientEvent({
      eventType: 'window_error',
      error: event.error || message,
      context: {
        source_file: event.filename ? event.filename.split('/').pop() : 'unknown',
        line: event.lineno,
        column: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    recordClientEvent({
      eventType: 'unhandled_rejection',
      error: event.reason,
    });
  });

  window.addEventListener('online', () => {
    emitState();
    void flushReliabilityQueue();
  });
  window.addEventListener('offline', emitState);
}
