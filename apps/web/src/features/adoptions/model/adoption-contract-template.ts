import type { AdoptionContractPayload } from '@adoptafacil/contracts';

/**
 * Texto legal FIJO del "Contrato de Adopción de Animal" (docs/Contrato de
 * Adopción.pdf, transcrito íntegro — mismo contenido que
 * `apps/api/src/modules/adoptions/adoption-contract-pdf.ts` genera en el PDF
 * final). Se duplica aquí (no se comparte entre api/web) para la VISTA PREVIA
 * en pantalla antes de enviar a firmas — mismo criterio ya aceptado en este
 * proyecto para otros documentos (el certificado de voluntariado tampoco
 * comparte código de render entre su PDF y su propia pantalla). Si el texto
 * legal cambia, actualizar AMBOS archivos.
 */

export const FUNDAMENTO_LEGAL =
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

export const OBJETO_INTRO =
  'El cedente entrega en adopción responsable al adoptante la mascota descrita a ' +
  'continuación, a título gratuito (no es un contrato de compraventa):';

export const OBJETO_NOTA =
  'El adoptante manifiesta conocer la salud y comportamiento de la mascota según la ' +
  'información proporcionada por el cedente, y acepta cuidarla como miembro de su hogar. ' +
  'Ambas partes reconocen que la adopción es gratuita y que el cedente actuó sin ánimo de ' +
  'lucro; solo se puede pactar una cuota de recuperación de gastos veterinarios (no precio ' +
  'de venta).';

export const OBLIGACIONES_INTRO =
  'Las partes acuerdan que el adoptante asumirá todas las obligaciones inherentes al ' +
  'cuidado y bienestar de la mascota, de conformidad con la Ley 84 de 1989 y normas ' +
  'complementarias:';

export interface ContractClause {
  title: string;
  body: string;
}

export const OBLIGACIONES: ContractClause[] = [
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
    // `{months}` se sustituye por `data.followUpMonths` en `renderClauseBody`.
    title: 'Seguimiento post-adopción',
    body:
      'Durante los primeros {months} meses (plazo pactado), el adoptante permitirá visitas ' +
      'de seguimiento por parte del cedente o sus delegados, previa coordinación. El ' +
      'adoptante enviará fotos e información sobre la adaptación del animal cuando lo ' +
      'requiera el cedente.',
  },
];

export const SANCIONES_INTRO =
  'Las partes acuerdan que el incumplimiento de estas obligaciones será causa de ' +
  'resolución inmediata del contrato. En particular:';

export const SANCIONES: ContractClause[] = [
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

export const VIGENCIA =
  'Este contrato entra en vigencia en la fecha de su firma y permanecerá vigente mientras ' +
  'dure la tenencia de la mascota por parte del adoptante.';

// `{city}` se sustituye por `data.signatureCity` en `renderClauseBody`.
export const JURISDICCION =
  'Para efectos legales, las partes fijan como domicilio la ciudad de {city}. Cualquier ' +
  'controversia se resolverá ante los jueces civiles de esta jurisdicción, renunciando a ' +
  'otro fuero.';

export const COMPROMISO =
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

/** Reemplaza los placeholders `{months}`/`{city}` de una cláusula con los
 *  datos reales del contrato — mismo criterio que el PDF del backend. */
export function renderClauseBody(body: string, payload: AdoptionContractPayload): string {
  return body
    .replace('{months}', blank(payload.data.followUpMonths))
    .replace('{city}', blank(payload.data.signatureCity));
}

export interface ObjetoField {
  label: string;
  value: string;
}

/** Los campos de "Objeto" ya rellenados (o `______` si faltan) — la MISMA
 *  caja que se ve en el PDF, en pantalla. */
export function buildObjetoFields(payload: AdoptionContractPayload): ObjetoField[] {
  const { data, animal } = payload;
  return [
    {
      label: 'Especie y raza',
      value: `${SPECIES_LABELS[animal.species] ?? animal.species} — ${blank(data.animalBreed)}`,
    },
    { label: 'Nombre', value: blank(animal.name) },
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
  ];
}

export function buildPartesText(payload: AdoptionContractPayload): {
  cedente: string;
  adoptante: string;
} {
  const { data, applicant } = payload;
  return {
    cedente:
      `Cedente/Entregante: Adopta Fácil (organización protectora de animales), con domicilio ` +
      `en ${blank(data.organizationAddress)} y NIT ${blank(data.organizationNit)}.`,
    adoptante:
      `Adoptante: Sr./Sra. ${blank(applicant.fullName)}, identificado/a con cédula de ` +
      `ciudadanía nº ${blank(data.adopterDocumentNumber)}, con domicilio en ` +
      `${blank(data.adopterAddress)}.`,
  };
}
