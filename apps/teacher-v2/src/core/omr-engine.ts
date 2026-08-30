export const OMR_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export type OmrMarkStatus = 'ok' | 'blank' | 'ambiguous' | 'manual';

export interface OmrLayoutRow {
  number: number;
  column: number;
  row: number;
  y: number;
  numberX: number;
  optionX: number[];
}

export interface OmrMarkQuality {
  status: OmrMarkStatus;
  scores: number[];
  best: number;
  gap: number;
}

export interface OmrCorner {
  x: number;
  y: number;
  darkness: number;
  score: number;
  radius: number;
}

export interface OmrAnalysis {
  answers: Array<string | null>;
  quality: OmrMarkQuality[];
  previewUrl: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  cornerConfidence: number;
}

interface CandidateCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', OmrCorner>;
  cornerConfidence: number;
  score: number;
}

export function omrLayout(questionCount: number, optionCount: number): OmrLayoutRow[] {
  const safeQuestions = Math.max(1, Math.min(60, Math.round(questionCount) || 1));
  const safeOptions = Math.max(2, Math.min(5, Math.round(optionCount) || 4));
  const rows = Math.ceil(safeQuestions / 2);
  const output: OmrLayoutRow[] = [];

  for (let index = 0; index < safeQuestions; index += 1) {
    const column = index < rows ? 0 : 1;
    const row = column ? index - rows : index;
    const y = rows === 1 ? 0.53 : 0.28 + row * (0.62 / (rows - 1));
    const base = column ? 0.64 : 0.18;
    output.push({
      number: index + 1,
      column,
      row,
      y,
      numberX: column ? 0.545 : 0.085,
      optionX: OMR_LETTERS.slice(0, safeOptions).map((_, optionIndex) => base + optionIndex * 0.055),
    });
  }

  return output;
}

function darkAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  let sum = 0;
  let samples = 0;
  const x0 = Math.max(0, Math.floor(centerX - radius));
  const x1 = Math.min(width - 1, Math.ceil(centerX + radius));
  const y0 = Math.max(0, Math.floor(centerY - radius));
  const y1 = Math.min(height - 1, Math.ceil(centerY + radius));

  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;
      const offset = (y * width + x) * 4;
      const luminance = 0.299 * (data[offset] || 0) + 0.587 * (data[offset + 1] || 0) + 0.114 * (data[offset + 2] || 0);
      sum += 1 - luminance / 255;
      samples += 1;
    }
  }

  return samples ? sum / samples : 0;
}

function findCorner(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  name: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft',
): OmrCorner {
  const marginX = 0.34 * width;
  const marginY = 0.28 * height;
  let startX = 0;
  let endX = marginX;
  let startY = 0;
  let endY = marginY;
  let referenceX = 0;
  let referenceY = 0;

  if (name === 'topRight') {
    startX = width - marginX;
    endX = width;
    referenceX = width;
  } else if (name === 'bottomRight') {
    startX = width - marginX;
    endX = width;
    startY = height - marginY;
    endY = height;
    referenceX = width;
    referenceY = height;
  } else if (name === 'bottomLeft') {
    startY = height - marginY;
    endY = height;
    referenceY = height;
  }

  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.012));
  const step = Math.max(4, Math.round(radius * 0.7));
  let best: OmrCorner | null = null;

  for (let y = startY + radius; y < endY - radius; y += step) {
    for (let x = startX + radius; x < endX - radius; x += step) {
      const darkness = darkAt(data, width, height, x, y, radius);
      const distance = Math.hypot(x - referenceX, y - referenceY) / Math.hypot(width, height);
      const score = darkness - 0.12 * distance;
      if (!best || score > best.score) best = { x, y, darkness, score, radius };
    }
  }

  if (!best) throw new Error('No fue posible localizar las marcas de referencia de la hoja.');
  return best;
}

function drawOrientedCanvas(image: HTMLImageElement, rotation: 0 | 90 | 180 | 270): Omit<CandidateCanvas, 'corners' | 'cornerConfidence' | 'score'> {
  const maximumSide = 1600;
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const scale = Math.min(1, maximumSide / Math.max(sourceWidth, sourceHeight));
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const swapsAxis = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swapsAxis ? drawHeight : drawWidth;
  canvas.height = swapsAxis ? drawWidth : drawHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('El navegador no pudo preparar el análisis de imagen.');

  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    canvas,
    context,
    data: imageData.data,
    width: canvas.width,
    height: canvas.height,
    rotation,
  };
}

function evaluateCandidate(image: HTMLImageElement, rotation: 0 | 90 | 180 | 270): CandidateCanvas {
  const base = drawOrientedCanvas(image, rotation);
  const corners = {
    topLeft: findCorner(base.data, base.width, base.height, 'topLeft'),
    topRight: findCorner(base.data, base.width, base.height, 'topRight'),
    bottomRight: findCorner(base.data, base.width, base.height, 'bottomRight'),
    bottomLeft: findCorner(base.data, base.width, base.height, 'bottomLeft'),
  };
  const darknessValues = Object.values(corners).map((corner) => corner.darkness);
  const cornerConfidence = Math.min(...darknessValues);
  const portraitAdjustment = base.height >= base.width ? 0.04 : -0.05;
  const score = darknessValues.reduce((sum, value) => sum + value, 0) / darknessValues.length + portraitAdjustment;
  return { ...base, corners, cornerConfidence, score };
}

function mapPoint(
  corners: CandidateCanvas['corners'],
  normalizedX: number,
  normalizedY: number,
): { x: number; y: number } {
  const left = 0.055;
  const top = 0.045;
  const right = 0.945;
  const bottom = 0.955;
  const u = (normalizedX - left) / (right - left);
  const v = (normalizedY - top) / (bottom - top);
  const topLeft = corners.topLeft;
  const topRight = corners.topRight;
  const bottomRight = corners.bottomRight;
  const bottomLeft = corners.bottomLeft;

  return {
    x:
      (1 - u) * (1 - v) * topLeft.x +
      u * (1 - v) * topRight.x +
      u * v * bottomRight.x +
      (1 - u) * v * bottomLeft.x,
    y:
      (1 - u) * (1 - v) * topLeft.y +
      u * (1 - v) * topRight.y +
      u * v * bottomRight.y +
      (1 - u) * v * bottomLeft.y,
  };
}

export function analyzeOmrImage(
  image: HTMLImageElement,
  questionCount: number,
  optionCount: number,
): OmrAnalysis {
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const candidates = rotations.map((rotation) => evaluateCandidate(image, rotation));
  const selected = [...candidates].sort((a, b) => b.score - a.score)[0];
  if (!selected || selected.cornerConfidence < 0.36) {
    throw new Error('No pude localizar con suficiente claridad las cuatro marcas negras. Fotografía la hoja completa, en vertical y con buena luz.');
  }

  const pageWidth =
    (Math.hypot(selected.corners.topRight.x - selected.corners.topLeft.x, selected.corners.topRight.y - selected.corners.topLeft.y) +
      Math.hypot(selected.corners.bottomRight.x - selected.corners.bottomLeft.x, selected.corners.bottomRight.y - selected.corners.bottomLeft.y)) /
    2;
  const bubbleRadius = Math.max(3, pageWidth * 0.006);
  const rows = omrLayout(questionCount, optionCount);
  const answers: Array<string | null> = [];
  const quality: OmrMarkQuality[] = [];

  for (const row of rows) {
    const scores = row.optionX.map((normalizedX) => {
      const point = mapPoint(selected.corners, normalizedX, row.y);
      return darkAt(selected.data, selected.width, selected.height, point.x, point.y, bubbleRadius);
    });
    const ordered = scores
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value);
    const best = ordered[0] || { value: 0, index: 0 };
    const second = ordered[1] || { value: 0, index: 0 };
    let answer: string | null = null;
    let status: OmrMarkStatus = 'blank';

    if (best.value > 0.2 && best.value - second.value > 0.055) {
      answer = OMR_LETTERS[best.index] || null;
      status = 'ok';
    } else if (best.value > 0.13) {
      status = 'ambiguous';
    }

    answers.push(answer);
    quality.push({
      status,
      scores: scores.map((value) => Number(value.toFixed(4))),
      best: Number(best.value.toFixed(4)),
      gap: Number((best.value - second.value).toFixed(4)),
    });
  }

  return {
    answers,
    quality,
    previewUrl: selected.canvas.toDataURL('image/jpeg', 0.84),
    width: selected.width,
    height: selected.height,
    rotation: selected.rotation,
    cornerConfidence: Number(selected.cornerConfidence.toFixed(4)),
  };
}

export function manualOmrCapture(questionCount: number): Pick<OmrAnalysis, 'answers' | 'quality'> {
  const count = Math.max(1, Math.min(60, Math.round(questionCount) || 1));
  return {
    answers: Array<string | null>(count).fill(null),
    quality: Array.from({ length: count }, () => ({ status: 'manual' as const, scores: [], best: 0, gap: 0 })),
  };
}

export function summarizeOmrQuality(quality: OmrMarkQuality[]) {
  return quality.reduce(
    (summary, row) => {
      summary[row.status] += 1;
      return summary;
    },
    { ok: 0, blank: 0, ambiguous: 0, manual: 0 },
  );
}

export function normalizeAnswer(value: unknown): string | null {
  const answer = String(value ?? '').trim().toUpperCase();
  return OMR_LETTERS.includes(answer as (typeof OMR_LETTERS)[number]) ? answer : null;
}

export function scoreOmrAnswers(answers: Array<string | null>, key: string[]) {
  const normalizedKey = key.map((answer) => normalizeAnswer(answer));
  const normalizedAnswers = answers.map((answer) => normalizeAnswer(answer));
  let correct = 0;
  let blanks = 0;
  normalizedAnswers.forEach((answer, index) => {
    if (!answer) blanks += 1;
    else if (answer === normalizedKey[index]) correct += 1;
  });
  const score = normalizedKey.length ? Number(((correct / normalizedKey.length) * 10).toFixed(2)) : 0;
  return { correct, blanks, score };
}
