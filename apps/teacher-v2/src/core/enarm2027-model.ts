import { ENARM_AREAS, type EnarmArea } from './enarm2027-areas.ts';
import type { EnarmAttempt, EnarmCase, EnarmReview } from './enarm2027';

export interface AreaPerformance {
  area: EnarmArea;
  label: string;
  total: number;
  correct: number;
  accuracy: number | null;
  uniqueCases: number;
}

export interface EnarmPerformance {
  attempts: number;
  correct: number;
  accuracy: number | null;
  studied: number;
  due: number;
  wrongCases: number;
  lastStudiedAt: string | null;
  byArea: AreaPerformance[];
}

export function calculateEnarmPerformance(cases: EnarmCase[], attempts: EnarmAttempt[], reviews: EnarmReview[], now = Date.now()): EnarmPerformance {
  const caseIds = new Set(cases.map(q => q.id));
  const validAttempts = attempts.filter(a => caseIds.has(a.question_id));
  const byArea = ENARM_AREAS.map(({ key, label }) => {
    const ids = new Set(cases.filter(c => c.area === key).map(c => c.id));
    const rows = validAttempts.filter(a => ids.has(a.question_id));
    const correct = rows.filter(a => a.is_correct).length;
    return {
      area: key, label, total: rows.length, correct,
      accuracy: rows.length ? Math.round(correct * 100 / rows.length) : null,
      uniqueCases: new Set(rows.map(a => a.question_id)).size,
    };
  });
  const marked = reviews.filter(r => caseIds.has(r.question_id));
  const correct = validAttempts.filter(a => a.is_correct).length;
  return {
    attempts: validAttempts.length,
    correct,
    accuracy: validAttempts.length ? Math.round(correct * 100 / validAttempts.length) : null,
    studied: new Set(validAttempts.map(a => a.question_id)).size,
    due: marked.filter(r => r.tries > 0 && new Date(r.due_at).getTime() <= now).length,
    wrongCases: marked.filter(r => r.tries > r.successes).length,
    lastStudiedAt: validAttempts.map(a=>a.answered_at).sort().at(-1) || null,
    byArea,
  };
}

/** One learning task at a time: prioritize new cases, then due reviews. */
export function orderPracticeCases(cases: EnarmCase[], attempts: EnarmAttempt[], reviews: EnarmReview[], now = Date.now()): EnarmCase[] {
  const lastSeen = new Map<string, number>();
  for (const attempt of attempts) {
    const when = new Date(attempt.answered_at).getTime();
    if (when > (lastSeen.get(attempt.question_id) ?? -Infinity)) lastSeen.set(attempt.question_id, when);
  }
  const reviewById = new Map(reviews.map(r => [r.question_id, r]));
  return [...cases].sort((a,b) => {
    const aSeen = lastSeen.has(a.id), bSeen = lastSeen.has(b.id);
    if (aSeen !== bSeen) return aSeen ? 1 : -1;
    const aDue = aSeen && (new Date(reviewById.get(a.id)?.due_at || '').getTime() || Infinity) <= now;
    const bDue = bSeen && (new Date(reviewById.get(b.id)?.due_at || '').getTime() || Infinity) <= now;
    if (aDue !== bDue) return aDue ? -1 : 1;
    return (lastSeen.get(a.id) || 0) - (lastSeen.get(b.id) || 0) || a.slug.localeCompare(b.slug);
  });
}

export function dueReviewCases(cases: EnarmCase[], reviews: EnarmReview[], now = Date.now()): EnarmCase[] {
  const dueMap = new Map(reviews.filter(r => r.tries > 0 && new Date(r.due_at).getTime() <= now).map(r => [r.question_id, r.due_at]));
  return cases.filter(c => dueMap.has(c.id)).sort((a,b) => (dueMap.get(a.id)||'').localeCompare(dueMap.get(b.id)||''));
}

export function needsReinforcement(cases: EnarmCase[], attempts: EnarmAttempt[]): EnarmCase[] {
  const last = new Map<string,EnarmAttempt>();
  for (const row of attempts) {
    const previous = last.get(row.question_id);
    if (!previous || new Date(row.answered_at).getTime() > new Date(previous.answered_at).getTime()) {
      last.set(row.question_id, row);
    }
  }
  return cases.filter(c => last.has(c.id) && last.get(c.id)?.is_correct === false);
}

/** A 10-case mini-sim is a pilot activity, not an ENARM-length simulation. */
export function balancedEnarmSimulation(cases: EnarmCase[], size = 10, random: () => number = Math.random): EnarmCase[] {
  const buckets = ENARM_AREAS.map(area => cases.filter(c => c.area === area.key));
  for (const bucket of buckets) {
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
      const prev = bucket[i]!;
      bucket[i] = bucket[j]!;
      bucket[j] = prev;
    }
  }
  const out: EnarmCase[] = [];
  while (out.length < Math.min(size, cases.length) && buckets.some(b => b.length)) {
    for (const bucket of buckets) {
      if (out.length >= size) break;
      const next = bucket.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export const WEEKLY_ALLOCATIONS = [
  { key:'cases', label:'Casos nuevos', weight:0.35, description:'Razonamiento clínico y guías' },
  { key:'review', label:'Repaso de errores', weight:0.30, description:'Repetición espaciada' },
  { key:'sim', label:'Práctica cronometrada', weight:0.20, description:'Velocidad y decisiones' },
  { key:'read', label:'Lectura y notas', weight:0.15, description:'Temas de menor dominio' },
] as const;

export function weeklyPlan(weeklyHours: number) {
  const total = Math.max(1, Math.min(40, Number.isFinite(weeklyHours) ? Math.round(weeklyHours) : 6)) * 60;
  let distributed = 0;
  return WEEKLY_ALLOCATIONS.map((task, i) => {
    const minutes = i === WEEKLY_ALLOCATIONS.length - 1 ? total - distributed : Math.round(total * task.weight);
    distributed += minutes;
    return { ...task, minutes };
  });
}

export function enarmPercent(count: number, total: number): number {
  return total ? Math.round(100 * count / total) : 0;
}
