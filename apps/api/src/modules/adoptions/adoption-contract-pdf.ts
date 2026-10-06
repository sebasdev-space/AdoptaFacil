import {
  type PDFDocument as PDFDocumentType,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import type {
  AdoptionContractData,
  AdoptionContractPayload,
  AdoptionContractSigner,
} from '@adoptafacil/contracts';

/**
 * Texto legal FIJO del "Contrato de Adopción de Animal" (docs/Contrato de
 * Adopción.pdf, transcrito íntegro — incluidos los puntos 1-2 de
 * "Obligaciones del Adoptante", que el PDF origen perdía en un salto de
 * página y el cliente proporcionó por texto). Las cláusulas NO son
 * editables por la organización; solo los DATOS variables lo son (ver
 * {@link AdoptionContractData}). Mantener este archivo como la ÚNICA fuente
 * de verdad del texto — cualquier cambio de redacción legal se hace aquí.
 */

const FUNDAMENTO_LEGAL =
  'Este contrato se celebra en cumplimiento del Estatuto Nacional de Protección de los ' +
  'Animales (Ley 84 de 1989) y sus modificaciones posteriores. La Ley 84/1989 dispone que ' +
  '"los animales tendrán en todo el territorio nacional especial protección contra el ' +
  'sufrimiento y el dolor, causados directa o indirectamente por el hombre". Su artículo 5 ' +
  'enumera los deberes del propietario (ahora adoptante): suministrar alimento, agua, ' +
  'condiciones de habitabilidad (espacio, ventilación, abrigo) y atención médica al animal ' +
  'para asegurar su salud y bienestar. La Ley 1774 de 2016 incorporó a los animales como ' +
  '"seres sintientes" y reforzó estas protecciones. Más recientemente, la Ley 2455 de 2025 ' +
  '("Ley Ángel") actualizó las sanciones por maltrato y prohibió que personas condenadas por ' +
  'crueldad animal puedan adoptar o tener animales por el doble de su pena. Con este marco, ' +
  'las partes acuerdan el presente contrato de adopción con efectos jurídicos.';

const OBJETO_INTRO =
  'El cedente entrega en adopción responsable al adoptante la mascota descrita a ' +
  'continuación, a título gratuito (no es un contrato de compraventa):';

const OBJETO_NOTA =
  'El adoptante manifiesta conocer la salud y comportamiento de la mascota según la ' +
  'información proporcionada por el cedente, y acepta cuidarla como miembro de su hogar. ' +
  'Ambas partes reconocen que la adopción es gratuita y que el cedente actuó sin ánimo de ' +
  'lucro; solo se puede pactar una cuota de recuperación de gastos veterinarios (no precio ' +
  'de venta).';

const OBLIGACIONES_INTRO =
  'Las partes acuerdan que el adoptante asumirá todas las obligaciones inherentes al ' +
  'cuidado y bienestar de la mascota, de conformidad con la Ley 84 de 1989 y normas ' +
  'complementarias:';

const OBLIGACIONES: Array<{ title: string; body: string }> = [
  {
    title: 'Cuidados básicos',
    body:
      'Proporcionar diariamente alimento de calidad, agua limpia, atención veterinaria ' +
      '(vacunaciones, desparasitaciones, medicamentos) y un refugio apropiado contra el ' +
      'clima. Todo ello debe hacerse con el fin de "asegurar su salud, bienestar y para ' +
      'evitarle daño, enfermedad o muerte".',
  },
  {
    title: 'Condiciones de alojamiento',
    body:
      'Mantener al animal en un entorno higiénico y seguro, con espacio suficiente. En caso ' +
      'de animales domésticos, debe evitarse mantenerlos confinados de forma extrema que los ' +
      'exponga a sufrimiento.',
  },
  {
    title: 'Identificación y control',
    body:
      'Pasear al animal con correa cuando esté fuera del hogar, colocarle placa de ' +
      'identificación o microchip y no permitir que se pierda o escape. El adoptante debe ' +
      'notificar de inmediato al cedente si la mascota se extravía, se enferma gravemente o ' +
      'fallece.',
  },
  {
    title: 'Prohibición de usos indebidos',
    body:
      'Queda expresamente prohibido vender, regalar, alquilar, intercambiar, donar o ceder ' +
      'el animal a terceros sin autorización del cedente. Tampoco podrá usarse para ' +
      'reproducción comercial, peleas, ejercicios de maltrato o espectáculos que impliquen ' +
      'violencia. Cualquier forma de maltrato o explotación es ilícita; las leyes (C.P. arts. ' +
      '339A–339C, Ley 2455/2025) sancionan penalmente infligir "lesiones que menoscaben ' +
      'gravemente la salud o integridad del animal" o causarle la muerte. El adoptante acepta ' +
      'actuar con el respeto que exige la dignidad del ser vivo.',
  },
  {
    title: 'Seguimiento post-adopción',
    // `{months}` se sustituye por `data.followUpMonths` al renderizar.
    body:
      'Durante los primeros {months} meses (plazo pactado), el adoptante permitirá visitas ' +
      'de seguimiento por parte del cedente o sus delegados, previa coordinación. El ' +
      'adoptante enviará fotos e información sobre la adaptación del animal cuando lo ' +
      'requiera el cedente.',
  },
];

const SANCIONES_INTRO =
  'Las partes acuerdan que el incumplimiento de estas obligaciones será causa de ' +
  'resolución inmediata del contrato. En particular:';

const SANCIONES: Array<{ title: string; body: string }> = [
  {
    title: 'Maltrato o abandono',
    body:
      'Se considera abandono y maltrato cualquier acto prohibido por la ley (por ejemplo, ' +
      'dejar al animal desamparado en estado de vejez o enfermedad, o simplemente ' +
      'abandonarlo bajo su custodia). Estos actos constituyen contravención o delito penal. ' +
      'En tal caso, el cedente podrá rescindir el contrato y recuperar la mascota sin ' +
      'responsabilidad alguna, enviándola de inmediato a un refugio o a otro hogar aprobado.',
  },
  {
    title: 'Ruptura de compromiso',
    body:
      'Si el adoptante decide que no puede continuar con la adopción (p. ej. por ' +
      'dificultades económicas o de salud), deberá notificar al cedente y devolver la ' +
      'mascota. El cedente acepta recibirla de regreso para reubicarla adecuadamente.',
  },
  {
    title: 'Responsabilidad civil y penal',
    body:
      'El adoptante asume cualquier responsabilidad legal derivada de sus acciones u ' +
      'omisiones en relación con la mascota. Por ejemplo, acepta que infringir las ' +
      'obligaciones aquí pactadas o las normas legales (como la Ley 84/1989 o el Código ' +
      'Penal modificado) puede implicar sanciones de multa, arresto o inhabilitación.',
  },
];

const VIGENCIA =
  'Este contrato entra en vigencia en la fecha de su firma y permanecerá vigente mientras ' +
  'dure la tenencia de la mascota por parte del adoptante.';

// "{city}" se sustituye por `data.signatureCity` al renderizar.
const JURISDICCION =
  'Para efectos legales, las partes fijan como domicilio la ciudad de {city}. Cualquier ' +
  'controversia se resolverá ante los jueces civiles de esta jurisdicción, renunciando a ' +
  'otro fuero.';

const COMPROMISO =
  'Ambas partes declaran haber leído íntegramente este documento y haber sido informadas ' +
  'de la normativa vigente aplicable (Leyes 84/1989, 1774/2016, 2455/2025, Código Penal, ' +
  'etc.), aceptando su contenido en todas sus partes.';

const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin especificar',
};
const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

function blank(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '______';
  return String(value);
}

function formatCO(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);
const NAVY = rgb(0.08, 0.16, 0.3);
const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 vertical
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;
const BODY_SIZE = 10.5;
const BODY_LEADING = 14.5;

interface ContractFonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

/** Word-wraps `text` to fit within `maxWidth` at `size` — pdf-lib never wraps on its own. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Cursor de escritura: dibuja un párrafo izquierda-alineado, abriendo página
 *  nueva automáticamente si no cabe — así el contrato nunca se corta a medias
 *  como le pasó al PDF original (puntos 1-2 perdidos en un salto de página). */
class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private readonly pdf: PDFDocumentType,
    readonly font: ContractFonts,
  ) {
    this.page = pdf.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.pdf.addPage(PAGE_SIZE);
      this.y = PAGE_SIZE[1] - MARGIN;
    }
  }

  title(text: string): void {
    this.ensureSpace(30);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size: 18,
      font: this.font.serifBold,
      color: NAVY,
    });
    this.y -= 14;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 1,
      color: NAVY,
    });
    this.y -= 22;
  }

  heading(text: string): void {
    this.ensureSpace(24);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size: 12.5,
      font: this.font.sansBold,
      color: NAVY,
    });
    this.y -= 18;
  }

  paragraph(
    text: string,
    opts?: { indent?: number; bold?: boolean; color?: ReturnType<typeof rgb> },
  ): void {
    const indent = opts?.indent ?? 0;
    const font = opts?.bold ? this.font.sansBold : this.font.serif;
    const color = opts?.color ?? INK;
    const lines = wrapText(text, font, BODY_SIZE, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.ensureSpace(BODY_LEADING);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size: BODY_SIZE, font, color });
      this.y -= BODY_LEADING;
    }
  }

  /** Un ítem "**Título:** cuerpo" — título en negrita seguido del cuerpo en la misma fila de inicio. */
  numberedItem(title: string, body: string): void {
    this.ensureSpace(BODY_LEADING);
    const label = `${title}: `;
    const labelWidth = this.font.sansBold.widthOfTextAtSize(label, BODY_SIZE);
    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size: BODY_SIZE,
      font: this.font.sansBold,
      color: INK,
    });
    const firstLineMaxWidth = CONTENT_WIDTH - labelWidth;
    const words = body.split(/\s+/).filter(Boolean);
    let firstLine = '';
    let rest = '';
    for (let i = 0; i < words.length; i++) {
      const attempt = firstLine ? `${firstLine} ${words[i]}` : words[i];
      if (firstLine && this.font.serif.widthOfTextAtSize(attempt, BODY_SIZE) > firstLineMaxWidth) {
        rest = words.slice(i).join(' ');
        break;
      }
      firstLine = attempt;
    }
    this.page.drawText(firstLine, {
      x: MARGIN + labelWidth,
      y: this.y,
      size: BODY_SIZE,
      font: this.font.serif,
      color: INK,
    });
    this.y -= BODY_LEADING;
    if (rest) this.paragraph(rest);
    this.y -= 4;
  }

  gap(amount = 10): void {
    this.y -= amount;
  }
}

function drawFieldBox(cursor: Cursor, fields: Array<{ label: string; value: string }>): void {
  const rowHeight = 18;
  const boxHeight = fields.length * rowHeight + 12;
  cursor.ensureSpace(boxHeight);
  const page = cursor.page;
  const top = cursor.y;
  page.drawRectangle({
    x: MARGIN,
    y: top - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: MUTED,
    borderWidth: 0.75,
    color: rgb(0.97, 0.97, 0.98),
  });
  let y = top - 16;
  for (const field of fields) {
    page.drawText(`${field.label}:`, {
      x: MARGIN + 10,
      y,
      size: BODY_SIZE,
      font: cursor.font.sansBold,
      color: INK,
    });
    page.drawText(field.value, {
      x: MARGIN + 170,
      y,
      size: BODY_SIZE,
      font: cursor.font.serif,
      color: INK,
    });
    y -= rowHeight;
  }
  cursor.y = top - boxHeight - 14;
}

interface SignatureRender {
  signer: AdoptionContractSigner;
  label: string;
  image: PDFImage | null;
}

/**
 * Renderiza el contrato COMPLETO (texto legal fijo + datos del payload +
 * bloque de firmas) como un PDF multi-página. `representativeSignaturePng`/
 * `adopterSignaturePng` son los bytes PNG YA decodificados (o `null` si esa
 * parte todavía no ha firmado — se dibuja una línea en blanco). Una imagen
 * que falla al embeberse (PNG corrupto) nunca rompe la generación del
 * documento — se sigue sin ella, mismo criterio que
 * `VolunteerCertificatesService.generatePdf`.
 */
export async function renderAdoptionContractPdf(input: {
  payload: AdoptionContractPayload;
  signers: AdoptionContractSigner[];
  representativeSignaturePng: Buffer | null;
  adopterSignaturePng: Buffer | null;
}): Promise<Buffer> {
  const { payload, signers } = input;
  const data: AdoptionContractData = payload.data;
  const pdf = await PDFDocument.create();
  const font: ContractFonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  // Embebido ANTES de dibujar (pdf-lib es async aquí) — nunca dentro del
  // dibujo del bloque de firmas, que debe quedar síncrono.
  const representativeImage = input.representativeSignaturePng
    ? await pdf.embedPng(input.representativeSignaturePng).catch(() => null)
    : null;
  const adopterImage = input.adopterSignaturePng
    ? await pdf.embedPng(input.adopterSignaturePng).catch(() => null)
    : null;

  const cursor = new Cursor(pdf, font);
  cursor.title('CONTRATO DE ADOPCIÓN DE ANIMAL');

  cursor.heading('FUNDAMENTO LEGAL');
  cursor.paragraph(FUNDAMENTO_LEGAL);
  cursor.gap();

  cursor.heading('PARTES');
  cursor.paragraph(
    `Cedente/Entregante: Adopta Fácil (organización protectora de animales), con domicilio ` +
      `en ${blank(data.organizationAddress)} y NIT ${blank(data.organizationNit)}.`,
  );
  cursor.paragraph(
    `Adoptante: Sr./Sra. ${blank(payload.applicant.fullName)}, identificado/a con cédula de ` +
      `ciudadanía nº ${blank(data.adopterDocumentNumber)}, con domicilio en ` +
      `${blank(data.adopterAddress)}.`,
  );
  cursor.gap();

  cursor.heading('OBJETO');
  cursor.paragraph(OBJETO_INTRO);
  cursor.gap(4);
  drawFieldBox(cursor, [
    {
      label: 'Especie y raza',
      value: `${SPECIES_LABELS[payload.animal.species] ?? payload.animal.species} — ${blank(data.animalBreed)}`,
    },
    { label: 'Nombre', value: blank(payload.animal.name) },
    {
      label: 'Sexo',
      value: data.animalSex ? (SEX_LABELS[data.animalSex] ?? data.animalSex) : '______',
    },
    {
      label: 'Edad aproximada',
      value: data.animalAgeYears !== undefined ? `${data.animalAgeYears} años` : '______',
    },
    { label: 'Peso', value: data.weightKg !== undefined ? `${data.weightKg} kg` : '______' },
    {
      label: 'Estado de salud al momento de la entrega',
      value: blank(data.healthStatusAtDelivery),
    },
  ]);
  cursor.paragraph(OBJETO_NOTA);
  cursor.gap();

  cursor.heading('OBLIGACIONES DEL ADOPTANTE');
  cursor.paragraph(OBLIGACIONES_INTRO);
  cursor.gap(4);
  for (const item of OBLIGACIONES) {
    const body = item.body.replace('{months}', blank(data.followUpMonths));
    cursor.numberedItem(item.title, body);
  }
  cursor.gap();

  cursor.heading('SANCIONES POR INCUMPLIMIENTO Y DEVOLUCIÓN');
  cursor.paragraph(SANCIONES_INTRO);
  cursor.gap(4);
  for (const item of SANCIONES) {
    cursor.numberedItem(item.title, item.body);
  }
  cursor.gap();

  cursor.heading('DISPOSICIONES FINALES');
  cursor.numberedItem('Vigencia', VIGENCIA);
  cursor.numberedItem('Jurisdicción', JURISDICCION.replace('{city}', blank(data.signatureCity)));
  cursor.numberedItem('Compromiso', COMPROMISO);
  if (payload.terms.trim()) {
    cursor.numberedItem('Notas adicionales', payload.terms.trim());
  }
  cursor.gap(6);

  const signedDate = signers.find((s) => s.signedAt)?.signedAt;
  cursor.paragraph(
    `Firmado en ${blank(data.signatureCity)}, el ${signedDate ? formatCO(signedDate) : '______'}.`,
  );
  cursor.gap(20);

  const signatures: SignatureRender[] = [
    {
      signer: signers.find(
        (s) => s.role === 'organization_representative',
      ) as AdoptionContractSigner,
      label: 'Por el Cedente (Adopta Fácil)',
      image: representativeImage,
    },
    {
      signer: signers.find((s) => s.role === 'adopter') as AdoptionContractSigner,
      label: 'Por el Adoptante',
      image: adopterImage,
    },
  ];

  const blockWidth = (CONTENT_WIDTH - 30) / 2;
  for (let i = 0; i < signatures.length; i++) {
    const { signer, label, image } = signatures[i];
    if (!signer) continue;
    const x = MARGIN + i * (blockWidth + 30);
    cursor.ensureSpace(90);
    const page = cursor.page;
    const topY = cursor.y;
    if (image) {
      const naturalWidth = image.width || 300;
      const naturalHeight = image.height || 120;
      const drawWidth = Math.min(140, naturalWidth);
      const drawHeight = (drawWidth / naturalWidth) * naturalHeight;
      page.drawImage(image, { x, y: topY - drawHeight, width: drawWidth, height: drawHeight });
    }
    page.drawLine({
      start: { x, y: topY - 46 },
      end: { x: x + blockWidth, y: topY - 46 },
      thickness: 0.75,
      color: INK,
    });
    page.drawText(label, { x, y: topY - 60, size: 9.5, font: font.sans, color: MUTED });
    page.drawText(signer.fullName, { x, y: topY - 74, size: 10, font: font.sansBold, color: INK });
    if (signer.signedAt) {
      page.drawText(`Firmado el ${formatCO(signer.signedAt)}`, {
        x,
        y: topY - 88,
        size: 8.5,
        font: font.sans,
        color: MUTED,
      });
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
