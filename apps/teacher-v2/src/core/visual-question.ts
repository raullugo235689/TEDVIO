/** Public, answer-free image coordinates for a visual ordering activity.
 * The correct order is stored only in correct_answer / question secrets.
 */
export interface ImageLabelTarget { id: string; x: number; y: number; }
export interface ImageLabelingLayout {
  kind: 'image_labeling';
  version: 1;
  targets: ImageLabelTarget[];
}

export const MAX_IMAGE_LABELS = 8;
export const MIN_IMAGE_LABELS = 2;

function coordinate(value: unknown): number | null {
  const num = Number(value);
  return typeof value !== 'boolean' && Number.isFinite(num) && num >= 3 && num <= 97
    ? Math.round(num * 100) / 100 : null;
}

/** Strictly parse data coming from the database; never interpret this JSON as HTML. */
export function normalizeImageLabelingLayout(value: unknown): ImageLabelingLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'image_labeling' || candidate.version !== 1
    || !Array.isArray(candidate.targets) || candidate.targets.length < MIN_IMAGE_LABELS
    || candidate.targets.length > MAX_IMAGE_LABELS) return null;
  const parsed = candidate.targets.map((target, index) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) return null;
    const t = target as Record<string, unknown>;
    if (t.id !== `z${index + 1}`) return null;
    const x = coordinate(t.x), y = coordinate(t.y);
    return x === null || y === null ? null : { id: `z${index + 1}`, x, y };
  });
  if (parsed.some((target) => !target)) return null;
  return { kind: 'image_labeling', version: 1, targets: parsed as ImageLabelTarget[] };
}

export function defaultImageLabelingLayout(): ImageLabelingLayout {
  return { kind: 'image_labeling', version: 1, targets: [
    { id: 'z1', x: 33, y: 35 },
    { id: 'z2', x: 67, y: 65 },
  ] };
}

export function repositionImageLabel(layout: ImageLabelingLayout, index: number, x: number, y: number): ImageLabelingLayout {
  if (index < 0 || index >= layout.targets.length) return layout;
  const normalized = normalizeImageLabelingLayout({ ...layout,
    targets: layout.targets.map((t, i) => i === index ? { ...t, x, y } : t),
  });
  return normalized || layout;
}

export function appendImageLabel(layout: ImageLabelingLayout): ImageLabelingLayout {
  if (layout.targets.length >= MAX_IMAGE_LABELS) return layout;
  const n = layout.targets.length + 1;
  const targets = [...layout.targets, { id: `z${n}`, x: 25 + (n * 11) % 50, y: 25 + (n * 17) % 50 }];
  return { ...layout, targets };
}

export function removeImageLabel(layout: ImageLabelingLayout, index: number): ImageLabelingLayout {
  if (layout.targets.length <= MIN_IMAGE_LABELS) return layout;
  return { ...layout, targets: layout.targets
    .filter((_, i) => i !== index)
    .map((target, i) => ({ ...target, id: `z${i + 1}` })) };
}

/** The teacher types labels in zone order, while students receive shuffled choices. */
export function validateImageLabelingDraft(
  layout: unknown,
  orderedLabels: unknown,
  mediaUrl: unknown,
  mediaType: unknown,
): { layout: ImageLabelingLayout; answer: string[] } {
  const parsed = normalizeImageLabelingLayout(layout);
  if (!parsed) throw new Error('Marca entre 2 y 8 zonas dentro de la imagen.');
  if (mediaType !== 'image') throw new Error('Para etiquetar estructuras debes utilizar una imagen.');
  const url = String(mediaUrl || '').trim();
  if (!/^https:\/\//i.test(url)) throw new Error('Agrega una URL HTTPS de tu imagen anatómica.');
  if (url.length > 2048) throw new Error('La URL de la imagen es demasiado larga.');
  if (!Array.isArray(orderedLabels) || orderedLabels.length !== parsed.targets.length) {
    throw new Error('Cada zona necesita exactamente una etiqueta.');
  }
  const answer = orderedLabels.map((item) => typeof item === 'string' ? item.trim() : '');
  if (answer.some((label) => label.length < 2 || label.length > 100)) {
    throw new Error('Escribe un nombre de estructura de 2 a 100 caracteres para cada zona.');
  }
  if (new Set(answer.map((label) => label.toLocaleLowerCase('es-MX'))).size !== answer.length) {
    throw new Error('Las etiquetas deben tener nombres diferentes.');
  }
  return { layout: parsed, answer };
}

/** Shuffle publicly visible labels without changing the private ordered key.
 * Prevent accidental disclosure when a saved option list matches zone order.
 */
export function shuffledImageLabels(orderedLabels: string[], random: () => number = Math.random): string[] {
  const choices = [...orderedLabels];
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const sample = random();
    const j = Math.min(i, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : .5) * (i + 1))));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  if (choices.length > 1 && choices.every((label, i) => label === orderedLabels[i])) {
    choices.push(choices.shift()!);
  }
  return choices;
}

/** A student response is an array of labels in target number order.
 * Supabase's existing ordering scorer compares it with the hidden answer key.
 */
export function buildImageLabelingAnswer(assignments: Record<string, string>, layout: ImageLabelingLayout, labels: string[]): string[] | null {
  const result = layout.targets.map((target) => assignments[target.id] || '');
  return result.every((label) => labels.includes(label))
    && new Set(result).size === layout.targets.length ? result : null;
}
