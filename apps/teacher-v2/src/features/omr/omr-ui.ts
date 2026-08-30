import type { PaperExam } from '../../core/exams';
import type { GroupRecord } from '../../core/types';

export function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Sin grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ');
}

export function shortDate(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function grade(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(1);
}

export function percent(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value) * 100)}%`;
}

export function statusTone(status: PaperExam['status']): string {
  if (status === 'ready') return 'green';
  if (status === 'closed') return 'blue';
  if (status === 'draft') return 'amber';
  return 'neutral';
}

export function statusLabel(status: PaperExam['status']): string {
  if (status === 'ready') return 'Lista para capturar';
  if (status === 'closed') return 'Cerrada';
  if (status === 'draft') return 'Borrador';
  return 'Archivada';
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo abrir la imagen seleccionada.'));
    };
    image.src = url;
  });
}
