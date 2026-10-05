import {
  type PDFFont,
  type PDFOperator,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { AnimalSex } from '@adoptafacil/contracts';

/**
 * Carnet de identificación del animal (RF07/RF08) — diseño de tarjeta de dos
 * caras (frente: foto, nombre, sexo/raza, estado y código de barras; reverso: QR
 * al perfil público + datos). Dibujado en VECTOR con pdf-lib (sin imágenes
 * rasterizadas salvo la foto del animal): el QR y el código de barras son
 * cuadrados/barras reales, por lo que escanean nítidos a cualquier tamaño.
 *
 * Todo lo que se muestra sale de datos REALES del animal; lo que no existe se
 * omite (nunca se inventa). El "N°" es un código DERIVADO del id del animal.
 */

// --- Paleta de marca ---------------------------------------------------------
const NAVY = rgb(0.078, 0.145, 0.247);
const TEAL = rgb(0.055, 0.639, 0.592);
const TEAL_MID = rgb(0.31, 0.79, 0.733);
const TEAL_LIGHT = rgb(0.847, 0.953, 0.937);
const GRAY = rgb(0.4, 0.44, 0.52);
const WHITE = rgb(1, 1, 1);
const PAGE_BG = rgb(0.953, 0.973, 0.973);

export const CARD_PAGE_SIZE: [number, number] = [841.89, 595.28]; // A4 apaisado
const CARD_W = 270;
const CARD_H = 430;
const CARD_RADIUS = 22;
const KAPPA = 0.5523;

export interface AnimalIdCardData {
  name: string;
  sex: AnimalSex;
  breed?: string;
  /** "En adopción", "Adoptado"… (ya en español). */
  statusLabel: string;
  /** "3 años 2 meses", "~5 meses"… o `undefined` si la edad no se conoce. */
  ageLabel?: string;
  /** Rasgos de carácter (tags), vacío si no hay. */
  traits: string[];
  /** Código "A1B2C3D4" derivado del id. */
  code: string;
  /** URL que codifica el QR (perfil público del animal en AdoptaFácil). */
  profileUrl: string;
  /** Nombre de la organización (rótulo superior de la hoja). */
  organizationName?: string;
  /** Bytes de la foto principal (JPEG/PNG) o `null` si no hay/no se puede leer. */
  photo: { data: Buffer; contentType?: string } | null;
}

/** Código corto y estable derivado del id (no se persiste). */
export function animalCardCode(animalId: string): string {
  return `A${animalId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Quita lo que la fuente estándar (WinAnsi) no puede dibujar, para no romper el PDF. */
export function safe(text: string): string {
  return text.replace(/[^ -~¡-ÿ]/g, '?');
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Lienzo con coordenadas LOCALES de la tarjeta (x→derecha, y→abajo, origen arriba-izquierda). */
class CardCanvas {
  constructor(
    readonly page: PDFPage,
    private readonly ox: number,
    private readonly oyTop: number,
    private readonly fonts: Fonts,
  ) {}

  x(x: number): number {
    return this.ox + x;
  }
  y(y: number): number {
    return this.oyTop - y;
  }

  path(d: string, color: ReturnType<typeof rgb>, opacity = 1): void {
    this.page.drawSvgPath(d, { x: this.ox, y: this.oyTop, color, opacity, borderWidth: 0 });
  }

  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>): void {
    this.page.drawRectangle({ x: this.x(x), y: this.y(y + h), width: w, height: h, color });
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    color: ReturnType<typeof rgb>,
    opacity = 1,
  ): void {
    this.page.drawSvgPath(roundedRectPath(0, 0, w, h, radius), {
      x: this.x(x),
      y: this.y(y),
      color,
      opacity,
      borderWidth: 0,
    });
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    options: {
      color?: ReturnType<typeof rgb>;
      border?: ReturnType<typeof rgb>;
      borderWidth?: number;
      opacity?: number;
    },
  ): void {
    this.page.drawCircle({
      x: this.x(cx),
      y: this.y(cy),
      size: r,
      color: options.color,
      borderColor: options.border,
      borderWidth: options.borderWidth ?? 0,
      opacity: options.opacity,
      borderOpacity: options.opacity,
    });
  }

  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: ReturnType<typeof rgb>,
    opacity = 1,
  ): void {
    this.page.drawEllipse({
      x: this.x(cx),
      y: this.y(cy),
      xScale: rx,
      yScale: ry,
      color,
      opacity,
    });
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: ReturnType<typeof rgb>,
    thickness = 1,
    opacity = 1,
  ): void {
    this.page.drawLine({
      start: { x: this.x(x1), y: this.y(y1) },
      end: { x: this.x(x2), y: this.y(y2) },
      color,
      thickness,
      opacity,
    });
  }

  width(text: string, size: number, bold = false): number {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(safe(text), size);
  }

  /** Texto con la línea base en `y` local; `align` respecto a `x`. */
  text(
    text: string,
    x: number,
    y: number,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: 'left' | 'center' | 'right';
    } = {},
  ): void {
    const size = options.size ?? 10;
    const content = safe(text);
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const w = font.widthOfTextAtSize(content, size);
    const left = options.align === 'center' ? x - w / 2 : options.align === 'right' ? x - w : x;
    this.page.drawText(content, {
      x: this.x(left),
      y: this.y(y),
      size,
      font,
      color: options.color ?? NAVY,
    });
  }

  /** Ajusta el tamaño de la fuente hacia abajo hasta que quepa en `maxWidth`. */
  fitSize(text: string, maxWidth: number, size: number, min: number, bold = false): number {
    let s = size;
    while (s > min && this.width(text, s, bold) > maxWidth) s -= 0.5;
    return s;
  }

  /** Recorta con "…" si aun al tamaño mínimo no cabe. */
  ellipsize(text: string, maxWidth: number, size: number, bold = false): string {
    if (this.width(text, size, bold) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && this.width(`${t}…`, size, bold) > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  /** Parte `text` en líneas de ancho ≤ `maxWidth` (máx. `maxLines`, la última con "…"). */
  wrap(text: string, maxWidth: number, size: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.width(candidate, size) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines.map((l) => this.ellipsize(l, maxWidth, size));
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = this.ellipsize(
      `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`,
      maxWidth,
      size,
    );
    return kept;
  }

  /** Huella: almohadilla + 4 dedos. `cx,cy` = centro de la almohadilla. */
  paw(cx: number, cy: number, scale: number, color: ReturnType<typeof rgb>, opacity = 1): void {
    const s = scale;
    this.ellipse(cx, cy + 4 * s, 11 * s, 9 * s, color, opacity);
    this.ellipse(cx - 14 * s, cy - 6 * s, 4.6 * s, 6 * s, color, opacity);
    this.ellipse(cx - 5 * s, cy - 14 * s, 4.6 * s, 6.4 * s, color, opacity);
    this.ellipse(cx + 5 * s, cy - 14 * s, 4.6 * s, 6.4 * s, color, opacity);
    this.ellipse(cx + 14 * s, cy - 6 * s, 4.6 * s, 6 * s, color, opacity);
  }

  heart(cx: number, cy: number, size: number, color: ReturnType<typeof rgb>): void {
    // Corazón en una caja de 24x24 centrada en (cx,cy).
    const k = size / 24;
    this.page.drawSvgPath(
      'M12 21 C 4 14.5 2 11 2 7.8 C 2 5.2 4 3.5 6.4 3.5 C 8.6 3.5 10.8 4.8 12 7 C 13.2 4.8 15.4 3.5 17.6 3.5 C 20 3.5 22 5.2 22 7.8 C 22 11 20 14.5 12 21 Z',
      {
        x: this.x(cx - size / 2),
        y: this.y(cy - size / 2),
        scale: k,
        color,
        borderWidth: 0,
      },
    );
  }

  /** Aplica un recorte (clip) con `build` mientras se ejecuta `draw`. */
  clipped(build: () => PDFOperator[], draw: () => void): void {
    this.page.pushOperators(pushGraphicsState(), ...build(), clip(), endPath());
    draw();
    this.page.pushOperators(popGraphicsState());
  }

  roundedRectClip(x: number, y: number, w: number, h: number, r: number): PDFOperator[] {
    const X = this.x(x);
    const Y = this.y(y); // arriba
    const k = r * KAPPA;
    const bottom = Y - h;
    return [
      moveTo(X + r, Y),
      lineTo(X + w - r, Y),
      appendBezierCurve(X + w - r + k, Y, X + w, Y - r + k, X + w, Y - r),
      lineTo(X + w, bottom + r),
      appendBezierCurve(X + w, bottom + r - k, X + w - r + k, bottom, X + w - r, bottom),
      lineTo(X + r, bottom),
      appendBezierCurve(X + r - k, bottom, X, bottom + r - k, X, bottom + r),
      lineTo(X, Y - r),
      appendBezierCurve(X, Y - r + k, X + r - k, Y, X + r, Y),
      closePath(),
    ];
  }

  circleClip(cx: number, cy: number, r: number): PDFOperator[] {
    const X = this.x(cx);
    const Y = this.y(cy);
    const k = r * KAPPA;
    return [
      moveTo(X + r, Y),
      appendBezierCurve(X + r, Y + k, X + k, Y + r, X, Y + r),
      appendBezierCurve(X - k, Y + r, X - r, Y + k, X - r, Y),
      appendBezierCurve(X - r, Y - k, X - k, Y - r, X, Y - r),
      appendBezierCurve(X + k, Y - r, X + r, Y - k, X + r, Y),
      closePath(),
    ];
  }

  image(image: PDFImage, x: number, y: number, w: number, h: number): void {
    this.page.drawImage(image, { x: this.x(x), y: this.y(y + h), width: w, height: h });
  }
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

/** Marca "AdoptaFácil" (corazón + wordmark) centrada en `cx`. */
function drawLogo(
  c: CardCanvas,
  cx: number,
  cy: number,
  size: number,
  tone: 'light' | 'dark',
): void {
  const adopta = tone === 'light' ? NAVY : WHITE;
  const facil = tone === 'light' ? TEAL : TEAL_MID;
  const wA = c.width('Adopta', size, true);
  const wF = c.width('Fácil', size, true);
  const markR = size * 0.62;
  const gap = size * 0.4;
  const total = markR * 2 + gap + wA + wF;
  let x = cx - total / 2;
  c.circle(x + markR, cy, markR, { color: tone === 'light' ? NAVY : WHITE });
  c.heart(x + markR, cy + markR * 0.04, markR * 1.15, tone === 'light' ? TEAL_MID : TEAL);
  x += markR * 2 + gap;
  c.text('Adopta', x, cy + size * 0.35, { size, bold: true, color: adopta });
  c.text('Fácil', x + wA, cy + size * 0.35, { size, bold: true, color: facil });
}

function drawSexSymbol(c: CardCanvas, cx: number, cy: number, sex: AnimalSex): void {
  if (sex === 'male') {
    c.circle(cx - 1.5, cy + 1.5, 4.2, { border: TEAL, borderWidth: 1.4 });
    c.line(cx + 1.6, cy - 1.6, cx + 6, cy - 6, TEAL, 1.4);
    c.line(cx + 2.5, cy - 6, cx + 6, cy - 6, TEAL, 1.4);
    c.line(cx + 6, cy - 6, cx + 6, cy - 2.5, TEAL, 1.4);
  } else if (sex === 'female') {
    c.circle(cx, cy - 1.5, 4.2, { border: TEAL, borderWidth: 1.4 });
    c.line(cx, cy + 2.7, cx, cy + 8, TEAL, 1.4);
    c.line(cx - 2.6, cy + 5.5, cx + 2.6, cy + 5.5, TEAL, 1.4);
  } else {
    c.circle(cx, cy, 4.2, { border: TEAL, borderWidth: 1.4 });
  }
}

const SEX_TEXT: Record<AnimalSex, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sexo desconocido',
};

function drawFront(c: CardCanvas, data: AnimalIdCardData, photo: PDFImage | null): void {
  const cx = CARD_W / 2;

  c.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS, WHITE);

  c.clipped(
    () => c.roundedRectClip(0, 0, CARD_W, CARD_H, CARD_RADIUS),
    () => {
      // Decoración suave de fondo.
      c.ellipse(8, 118, 92, 78, TEAL_LIGHT, 0.75);
      c.ellipse(CARD_W + 6, 232, 74, 96, TEAL_LIGHT, 0.55);
      c.paw(238, 38, 1.15, TEAL_LIGHT, 0.95);
      c.paw(40, 100, 1.5, TEAL_MID, 0.35);
      c.paw(236, 188, 1.2, TEAL_MID, 0.35);

      // Franja inferior (navy) con borde diagonal + acento teal.
      c.path(`M 0 ${338} L ${CARD_W} 313 L ${CARD_W} ${CARD_H} L 0 ${CARD_H} Z`, NAVY);
      c.path(`M 0 322 Q 38 318 70 340 L 0 340 Z`, TEAL);
      c.paw(236, 372, 1.5, WHITE, 0.07);
    },
  );

  drawLogo(c, cx, 44, 20, 'light');

  // Foto circular con anillo.
  const pcy = 146;
  c.circle(cx, pcy, 82, { color: WHITE, border: TEAL_LIGHT, borderWidth: 3 });
  c.circle(cx, pcy, 77, { border: TEAL_MID, borderWidth: 1.4 });
  if (photo) {
    const r = 72;
    const scale = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    c.clipped(
      () => c.circleClip(cx, pcy, r),
      () => c.image(photo, cx - w / 2, pcy - h / 2, w, h),
    );
  } else {
    c.circle(cx, pcy, 72, { color: TEAL_LIGHT });
    c.paw(cx, pcy + 4, 3.2, TEAL, 0.55);
  }
  // Insignia de huella.
  c.circle(cx + 59, pcy + 52, 22, { color: TEAL, border: WHITE, borderWidth: 3 });
  c.paw(cx + 59, pcy + 55, 0.78, WHITE);

  // Nombre.
  const nameSize = c.fitSize(data.name, CARD_W - 40, 28, 14, true);
  c.text(c.ellipsize(data.name, CARD_W - 40, nameSize, true), cx, 258, {
    size: nameSize,
    bold: true,
    align: 'center',
  });

  // Píldora "♂ Macho | Raza".
  const pillX = 26;
  const pillW = CARD_W - 52;
  c.roundRect(pillX, 267, pillW, 26, 13, TEAL_LIGHT);
  const sexText = SEX_TEXT[data.sex];
  drawSexSymbol(c, pillX + 20, 280, data.sex);
  c.text(sexText, pillX + 32, 284, { size: 11.5, color: NAVY });
  if (data.breed) {
    c.line(cx + 4, 273, cx + 4, 287, TEAL_MID, 1);
    const maxBreed = pillW / 2 - 16;
    const breedSize = c.fitSize(data.breed, maxBreed, 11.5, 8);
    c.text(
      c.ellipsize(data.breed, maxBreed, breedSize),
      cx + 4 + (pillX + pillW - cx - 4) / 2,
      284,
      {
        size: breedSize,
        align: 'center',
      },
    );
  }

  // Estado.
  c.text(data.statusLabel, cx, 311, { size: 12, color: GRAY, align: 'center' });

  // ID + código de barras.
  c.text('ID Animal', cx, 348, { size: 10, color: WHITE, align: 'center' });
  c.roundRect(cx - 78, 356, 156, 38, 5, WHITE);
  drawBarcode(c, data.code, cx - 70, 361, 140, 28);
  c.text(`N° ${data.code}`, cx, 413, { size: 14, bold: true, color: WHITE, align: 'center' });
}

function drawBarcode(
  c: CardCanvas,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const target: { encodings?: Array<{ data: string }> } = {};
  try {
    JsBarcode(target, text, { format: 'CODE128', displayValue: false });
  } catch {
    return; // texto no codificable: la tarjeta sigue mostrando el N° en texto.
  }
  const bits = target.encodings?.map((e) => e.data).join('') ?? '';
  if (!bits) return;
  const module = w / bits.length;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      c.page.drawRectangle({
        x: c.x(x + i * module),
        y: c.y(y + h),
        width: (j - i) * module,
        height: h,
        color: rgb(0.06, 0.06, 0.08),
      });
      i = j;
    } else {
      i++;
    }
  }
}

function drawQr(c: CardCanvas, text: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(row, col)) {
        c.page.drawRectangle({
          x: c.x(x + col * cell),
          y: c.y(y + (row + 1) * cell),
          // +0.15 evita costuras visibles entre módulos al rasterizar.
          width: cell + 0.15,
          height: cell + 0.15,
          color: rgb(0.04, 0.04, 0.06),
        });
      }
    }
  }
}

type InfoIcon = 'calendar' | 'paw' | 'heart' | 'house';

function drawInfoIcon(c: CardCanvas, kind: InfoIcon, cx: number, cy: number): void {
  c.circle(cx, cy, 14, { color: TEAL_LIGHT });
  switch (kind) {
    case 'calendar':
      c.roundRect(cx - 7, cy - 6, 14, 13, 2.4, TEAL);
      c.rect(cx - 5.2, cy - 2, 10.4, 7.6, WHITE);
      c.rect(cx - 4, cy - 0.5, 2, 2, TEAL);
      c.rect(cx - 1, cy - 0.5, 2, 2, TEAL);
      c.rect(cx + 2, cy - 0.5, 2, 2, TEAL);
      c.rect(cx - 4, cy + 2.6, 2, 2, TEAL);
      c.rect(cx - 1, cy + 2.6, 2, 2, TEAL);
      c.line(cx - 3.5, cy - 8, cx - 3.5, cy - 5, TEAL, 1.4);
      c.line(cx + 3.5, cy - 8, cx + 3.5, cy - 5, TEAL, 1.4);
      break;
    case 'paw':
      c.paw(cx, cy + 1.5, 0.62, TEAL);
      break;
    case 'heart':
      c.heart(cx, cy, 16, TEAL);
      break;
    case 'house':
      c.path(
        `M ${cx - 9} ${cy + 0.5} L ${cx} ${cy - 8} L ${cx + 9} ${cy + 0.5} L ${cx + 6.5} ${cy + 0.5} L ${cx + 6.5} ${cy + 8} L ${cx - 6.5} ${cy + 8} L ${cx - 6.5} ${cy + 0.5} Z`,
        TEAL,
      );
      c.rect(cx - 2, cy + 2.5, 4, 5.5, WHITE);
      break;
  }
}

function drawBack(c: CardCanvas, data: AnimalIdCardData): void {
  const cx = CARD_W / 2;

  c.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS, WHITE);

  c.clipped(
    () => c.roundedRectClip(0, 0, CARD_W, CARD_H, CARD_RADIUS),
    () => {
      // Cabecera teal con borde curvo.
      c.path(`M 0 0 H ${CARD_W} V 214 C 215 232, 150 196, 0 202 Z`, TEAL);
      c.ellipse(26, 78, 78, 60, TEAL_MID, 0.35);
      c.ellipse(CARD_W + 4, 190, 44, 38, TEAL_MID, 0.3);
      c.paw(238, 40, 1.25, WHITE, 0.95);

      // Franja inferior navy con borde ondulado.
      c.path(
        `M 0 372 C 70 360, 150 384, ${CARD_W} 366 L ${CARD_W} ${CARD_H} L 0 ${CARD_H} Z`,
        NAVY,
      );
      c.paw(244, 404, 1.2, WHITE, 0.08);
    },
  );

  // QR en una placa blanca.
  c.roundRect(cx - 62, 30, 124, 124, 12, WHITE);
  drawQr(c, data.profileUrl, cx - 54, 38, 108);

  c.text('Conoce su historia', cx, 172, { size: 13.5, bold: true, color: WHITE, align: 'center' });
  c.text('Escanea este código para ver', cx, 186, { size: 8.5, color: WHITE, align: 'center' });
  c.text('su perfil en AdoptaFácil', cx, 197, { size: 8.5, color: WHITE, align: 'center' });

  // Datos.
  const rows: Array<{ icon: InfoIcon; label: string; value: string }> = [];
  if (data.ageLabel) rows.push({ icon: 'calendar', label: 'Edad', value: data.ageLabel });
  if (data.breed) rows.push({ icon: 'paw', label: 'Raza', value: data.breed });
  rows.push({ icon: 'heart', label: 'Estado', value: data.statusLabel });
  if (data.traits.length > 0) {
    rows.push({ icon: 'house', label: 'Carácter', value: data.traits.join(', ') });
  }

  const textX = 62;
  const maxW = CARD_W - textX - 22;
  rows.forEach((row, index) => {
    const top = 226 + index * 34;
    drawInfoIcon(c, row.icon, 38, top + 8);
    c.text(row.label, textX, top + 4, { size: 10.5, bold: true });
    const lines = c.wrap(row.value, maxW, 9, row.label === 'Carácter' ? 2 : 1);
    lines.forEach((line, i) => c.text(line, textX, top + 16 + i * 10, { size: 9, color: GRAY }));
    if (index < rows.length - 1) c.line(textX, top + 26, CARD_W - 22, top + 26, TEAL_LIGHT, 0.8);
  });

  // Pie.
  drawLogo(c, 86, 404, 15, 'dark');
  c.line(150, 392, 150, 418, GRAY, 0.8, 0.8);
  c.text('Adopta', 160, 399, { size: 7.5, color: WHITE });
  c.text('Dona', 160, 408, { size: 7.5, color: WHITE });
  c.text('Sé parte del cambio', 160, 417, { size: 7.5, color: WHITE });
}

async function embedPhoto(
  pdf: PDFDocument,
  photo: AnimalIdCardData['photo'],
): Promise<PDFImage | null> {
  if (!photo) return null;
  const bytes = photo.data;
  try {
    const isPng = bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isPng) return await pdf.embedPng(bytes);
    if (isJpg) return await pdf.embedJpg(bytes);
  } catch {
    // Imagen corrupta: el carnet se genera con el marcador de huella.
  }
  return null; // WebP/otros formatos que pdf-lib no soporta.
}

/**
 * Agrega al `pdf` la hoja del carnet (frente y reverso, A4 apaisado). El resto
 * del documento (expediente clínico) lo agrega quien llama a continuación.
 */
export async function addAnimalIdCardPage(
  pdf: PDFDocument,
  fonts: Fonts,
  data: AnimalIdCardData,
): Promise<void> {
  const page = pdf.addPage(CARD_PAGE_SIZE);
  const [pageW, pageH] = CARD_PAGE_SIZE;
  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: PAGE_BG });

  const photo = await embedPhoto(pdf, data.photo);

  const gap = 50;
  const left = (pageW - (CARD_W * 2 + gap)) / 2;
  const top = pageH - (pageH - CARD_H) / 2 - 8;

  // Sombra suave bajo cada tarjeta.
  for (const x of [left, left + CARD_W + gap]) {
    page.drawSvgPath(roundedRectPath(0, 0, CARD_W, CARD_H, CARD_RADIUS), {
      x: x + 3,
      y: top - 4,
      color: rgb(0.1, 0.2, 0.25),
      opacity: 0.1,
      borderWidth: 0,
    });
  }

  drawFront(new CardCanvas(page, left, top, fonts), data, photo);
  drawBack(new CardCanvas(page, left + CARD_W + gap, top, fonts), data);

  const caption = data.organizationName
    ? `Carnet de ${data.name} · ${data.organizationName}`
    : `Carnet de ${data.name}`;
  const font = fonts.regular;
  const size = 9;
  const text = safe(caption);
  page.drawText(text, {
    x: (pageW - font.widthOfTextAtSize(text, size)) / 2,
    y: 28,
    size,
    font,
    color: GRAY,
  });
}
