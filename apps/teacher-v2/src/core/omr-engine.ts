export const OMR_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export type OmrAnswer = (typeof OMR_LETTERS)[number] | null;
export type OmrMarkStatus = 'ok' | 'blank' | 'ambiguous';

export interface OmrLayoutRow {
  number: number;
  column: number;
  row: number;
  y: number;
  numberX: number;
  answerXs: number[];
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
  answers: OmrAnswer[];
  quality: OmrMarkQuality[];
  corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', OmrCorner>;
  qr: string | null;
  previewDataUrl: string;
  width: number;
  height: number;
}

export interface OmrQrPayload {
  examId: string;
  version: string;
  studentId: string;
  enrollment: string;
}

interface JsQrResult {
  data?: string;
}

type JsQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
) => JsQrResult | null;

interface QrCodeConstructor {
  new (
    element: HTMLElement,
    options: {
      text: string;
      width: number;
      height: number;
      colorDark?: string;
      colorLight?: string;
      correctLevel?: number;
    },
  ): unknown;
  CorrectLevel?: { M?: number };
}

declare global {
  interface Window {
    jsQR?: JsQr;
    QRCode?: QrCodeConstructor;
  }
}

const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const existing = scriptLoads.get(src);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    const current = [...document.scripts].find((script) => script.src === src);
    const script = current || document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('La herramienta tardó demasiado en cargar.')), 12_000);

    function finish() {
      window.clearTimeout(timeout);
      if (ready()) resolve();
      else reject(new Error('La herramienta externa no quedó disponible.'));
    }

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      reject(new Error('No fue posible cargar la herramienta externa.'));
    }, { once: true });

    if (!current) {
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptLoads.delete(src);
    throw error;
  });

  scriptLoads.set(src, pending);
  return pending;
}

export async function loadQrDecoder(): Promise<boolean> {
  if (typeof window.jsQR === 'function') return true;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', () => typeof window.jsQR === 'function');
    return typeof window.jsQR === 'function';
  } catch {
    return false;
  }
}

export async function renderQrCode(container: HTMLElement, text: string): Promise<boolean> {
  container.textContent = '';
  try {
    await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
      () => typeof window.QRCode === 'function',
    );
    if (!window.QRCode) return false;
    const correctLevel = window.QRCode.CorrectLevel?.M;
    new window.QRCode(container, {
      text,
      width: 96,
      height: 96,
      colorDark: '#000000',
      colorLight: '#ffffff',
      ...(correctLevel == null ? {} : { correctLevel }),
    });
    return true;
  } catch {
    container.textContent = text;
    return false;
  }
}

export function omrLayout(questionCount: number, optionCount: number): OmrLayoutRow[] {
  const questions = Math.max(1, Math.min(60, Math.round(questionCount) || 1));
  const options = Math.max(2, Math.min(5, Math.round(optionCount) || 4));
  const rows = Math.ceil(questions / 2);
  const result: OmrLayoutRow[] = [];

  for (let index = 0; index < questions; index += 1) {
    const column = index < rows ? 0 : 1;
    const row = column ? index - rows : index;
    const y = rows === 1 ? 0.53 : 0.28 + row * (0.62 / (rows - 1));
    const base = column ? 0.64 : 0.18;
    result.push({
      number: index + 1,
      column,
      row,
      y,
      numberX: column ? 0.545 : 0.085,
      answerXs: OMR_LETTERS.slice(0, options).map((_, answerIndex) => base + answerIndex * 0.055),
    });
  }

  return result;
}

export function buildOmrPayload(
  examId: string,
  version: string,
  studentId = '',
  enrollment = '',
): string {
  return ['TEDVIO-OMR', examId, version, studentId, enrollment]
    .map((value) => String(value || '').replaceAll('|', ''))
    .join('|');
}

export function parseOmrPayload(payload?: string | null): OmrQrPayload | null {
  if (!payload?.startsWith('TEDVIO-OMR|')) return null;
  const [, examId = '', version = '', studentId = '', enrollment = ''] = payload.split('|');
  if (!examId || !/^[A-C]$/.test(version)) return null;
  return { examId, version, studentId, enrollment };
}

function darknessAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  let darkness = 0;
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
      const pixel = (y * width + x) * 4;
      const red = data[pixel] ?? 255;
      const green = data[pixel + 1] ?? 255;
      const blue = data[pixel + 2] ?? 255;
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      darkness += 1 - luminance / 255;
      samples += 1;
    }
  }

  return samples ? darkness / samples : 0;
}

function findCorner(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corner: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft',
): OmrCorner | null {
  const marginX = 0.34 * width;
  const marginY = 0.28 * height;
  let startX = 0;
  let endX = marginX;
  let startY = 0;
  let endY = marginY;
  let cornerX = 0;
  let cornerY = 0;

  if (corner === 'topRight' || corner === 'bottomRight') {
    startX = width - marginX;
    endX = width;
    cornerX = width;
  }
  if (corner === 'bottomRight' || corner === 'bottomLeft') {
    startY = height - marginY;
    endY = height;
    cornerY = height;
  }

  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.012));
  const step = Math.max(4, Math.round(radius * 0.7));
  let best: OmrCorner | null = null;

  for (let y = startY + radius; y < endY - radius; y += step) {
    for (let x = startX + radius; x < endX - radius; x += step) {
      const darkness = darknessAt(data, width, height, x, y, radius);
      const distance = Math.hypot(x - cornerX, y - cornerY) / Math.hypot(width, height);
      const score = darkness - 0.12 * distance;
      if (!best || score > best.score) best = { x, y, darkness, score, radius };
    }
  }

  return best;
}

function mapPoint(
  corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', OmrCorner>,
  x: number,
  y: number,
): { x: number; y: number } {
  const pageLeft = 0.055;
  const pageTop = 0.045;
  const pageRight = 0.945;
  const pageBottom = 0.955;
  const u = (x - pageLeft) / (pageRight - pageLeft);
  const v = (y - pageTop) / (pageBottom - pageTop);
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;

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

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No fue posible abrir la fotografía.'));
    };
    image.src = url;
  });
}

function drawDetectionOverlay(
  context: CanvasRenderingContext2D,
  corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', OmrCorner>,
  rows: OmrLayoutRow[],
  quality: OmrMarkQuality[],
): void {
  context.save();
  context.lineWidth = Math.max(2, context.canvas.width * 0.002);
  context.strokeStyle = 'rgba(47,105,219,.82)';
  context.beginPath();
  context.moveTo(corners.topLeft.x, corners.topLeft.y);
  context.lineTo(corners.topRight.x, corners.topRight.y);
  context.lineTo(corners.bottomRight.x, corners.bottomRight.y);
  context.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
  context.closePath();
  context.stroke();

  const radius = Math.max(3, context.canvas.width * 0.0045);
  rows.forEach((row, index) => {
    const mark = quality[index];
    row.answerXs.forEach((answerX) => {
      const point = mapPoint(corners, answerX, row.y);
      context.beginPath();
      context.strokeStyle = mark?.status === 'ok' ? 'rgba(19,139,105,.55)' : 'rgba(189,114,16,.72)';
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.stroke();
    });
  });
  context.restore();
}

export async function analyzeOmrFile(
  file: File,
  questionCount: number,
  optionCount: number,
): Promise<OmrAnalysis> {
  const image = await loadImage(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (width > height * 0.92) {
    throw new Error('Coloca la hoja en vertical y toma la fotografía completa.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('El navegador no pudo preparar el lector OMR.');
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  const cornerCandidates = {
    topLeft: findCorner(data, width, height, 'topLeft'),
    topRight: findCorner(data, width, height, 'topRight'),
    bottomRight: findCorner(data, width, height, 'bottomRight'),
    bottomLeft: findCorner(data, width, height, 'bottomLeft'),
  };
  if (Object.values(cornerCandidates).some((corner) => !corner || corner.darkness < 0.38)) {
    throw new Error('No pude localizar las cuatro marcas negras. Toma la hoja completa, en vertical y con luz uniforme.');
  }

  const corners = cornerCandidates as Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', OmrCorner>;
  const pageWidth = (
    Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) +
    Math.hypot(corners.bottomRight.x - corners.bottomLeft.x, corners.bottomRight.y - corners.bottomLeft.y)
  ) / 2;
  const bubbleRadius = Math.max(3, pageWidth * 0.006);
  const rows = omrLayout(questionCount, optionCount);
  const answers: OmrAnswer[] = [];
  const quality: OmrMarkQuality[] = [];

  for (const row of rows) {
    const scores = row.answerXs.map((answerX) => {
      const point = mapPoint(corners, answerX, row.y);
      return darknessAt(data, width, height, point.x, point.y, bubbleRadius);
    });
    const ranked = scores
      .map((score, index) => ({ score, index }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0] || { score: 0, index: -1 };
    const second = ranked[1] || { score: 0, index: -1 };
    const gap = best.score - second.score;
    let answer: OmrAnswer = null;
    let status: OmrMarkStatus = 'blank';

    if (best.score > 0.2 && gap > 0.055 && best.index >= 0) {
      answer = OMR_LETTERS[best.index] || null;
      status = 'ok';
    } else if (best.score > 0.13) {
      status = 'ambiguous';
    }

    answers.push(answer);
    quality.push({ status, scores, best: best.score, gap });
  }

  let qr: string | null = null;
  if (await loadQrDecoder()) {
    try {
      qr = window.jsQR?.(data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null;
    } catch {
      qr = null;
    }
  }

  drawDetectionOverlay(context, corners, rows, quality);
  return {
    answers,
    quality,
    corners,
    qr,
    previewDataUrl: canvas.toDataURL('image/jpeg', 0.84),
    width,
    height,
  };
}

export async function fingerprintFile(file: File): Promise<string> {
  try {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${file.name}:${file.size}:${file.lastModified}`.slice(0, 128);
  }
}