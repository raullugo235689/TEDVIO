import type { GradebookDetail, GradebookExam, GradebookOmrResult } from './gradebook';

export function omrPublication(detail: GradebookDetail, exam: GradebookExam) {
  const item = detail.items.find(row => row.id === exam.grade_item_id || (row.source_type === 'omr' && row.source_id === exam.id));
  const active = detail.omrResults.filter(row => row.exam_id === exam.id && !row.archived_at && row.review_status !== 'archived');
  const confirmed = active.filter(row => row.reviewed || row.review_status === 'confirmed');
  const matches = (result: GradebookOmrResult, student: GradebookDetail['students'][number]) => result.student_id ? result.student_id === student.id : Boolean(result.enrollment?.trim() && result.enrollment.trim() === student.enrollment?.trim());
  const rows = detail.students.map(student => {
    const results = confirmed.filter(result => matches(result, student)).sort((a, b) => (Date.parse(b.reviewed_at || b.updated_at || b.created_at) || 0) - (Date.parse(a.reviewed_at || a.updated_at || a.created_at) || 0));
    const expected = results[0];
    const saved = detail.scores.find(row => row.item_id === item?.id && row.student_id === student.id);
    const current = expected ? Boolean(saved && saved.source_type === 'omr' && saved.source_id === expected.id && Number(saved.score) === Number(expected.score) && saved.score != null) : saved?.score == null && !saved?.source_id;
    return { studentId: student.id, name: student.full_name, expected, saved, current, duplicates: results.length > 1 };
  });
  const linked = Boolean(item && exam.grade_item_id === item.id);
  const metadataMatches = Boolean(item && item.title === exam.title && Number(item.max_score) === Number(exam.max_score) && (item.period_id || null) === (exam.period_id || null) && (item.item_date || null) === (exam.exam_date || null));
  const changed = rows.filter(row => !row.current);
  return {
    linked, metadata: [exam.title, exam.max_score, exam.period_id, exam.exam_date, item?.category_id], current: linked && metadataMatches && changed.length === 0,
    status: !linked ? 'Por publicar' : metadataMatches && changed.length === 0 ? 'Actualizado' : 'Cambios pendientes',
    students: rows.filter(row => row.expected).length,
    pending: active.length - confirmed.length,
    unmatched: confirmed.filter(result => !detail.students.some(student => matches(result, student))).length,
    duplicates: rows.filter(row => row.duplicates).length,
    clear: changed.filter(row => !row.expected && row.saved?.score != null).length,
    changed: changed.length, rows,
  };
}
