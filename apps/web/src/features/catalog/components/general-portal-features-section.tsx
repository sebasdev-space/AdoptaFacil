import type { SVGProps } from 'react';
import { Card, CardContent } from '@adoptafacil/ui';

type FeatureIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element;

interface Feature {
  title: string;
  description: string;
  Icon: FeatureIcon;
}

/**
 * Íconos inline (mismo trazo que el mockup: viewBox 24x24, stroke-based,
 * cap/join redondeados) — sin depender de un paquete de iconos nuevo.
 */
const SearchIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 17a4 4 0 100-8 4 4 0 000 8z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
  </svg>
);

const HeartIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21s-7-4.35-9.5-8.8C.7 8.7 2.2 5 5.8 5c2 0 3.3 1.1 4.2 2.4C10.9 6.1 12.2 5 14.2 5c3.6 0 5.1 3.7 3.3 7.2C19 16.65 12 21 12 21z"
    />
  </svg>
);

const LedgerIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4M7.8 4.2A9 9 0 0121 12c0 4.97-4.03 9-9 9a9 9 0 01-8.94-10"
    />
  </svg>
);

const GiftIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16v4H4V8z" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 12h14v8H5v-8zM12 8v12M8 8a2 2 0 110-4c1.5 0 2.5 1.5 4 4M16 8a2 2 0 100-4c-1.5 0-2.5 1.5-4 4"
    />
  </svg>
);

const MegaphoneIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 11v2a2 2 0 002 2h1l3 5V6L6 11H5a2 2 0 00-2 0zM14 8a5 5 0 010 8M18 5a9 9 0 010 14"
    />
  </svg>
);

const OrgIcon: FeatureIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V8l8-5 8 5v13M9 21v-6h6v6" />
  </svg>
);

/**
 * Contenido REAL de cada tarjeta — capacidades ya implementadas en la app hoy
 * (catálogo consolidado, apadrinamiento, donaciones con dispersión T+1,
 * campañas públicas con rendición de cuentas, portal por organización). El
 * mockup de referencia solo incluye 3 tarjetas para esta sección; las 3
 * adicionales describen funcionalidad real de la plataforma en el mismo tono
 * (nunca un módulo "PRONTO" presentado como disponible).
 */
const FEATURES: Feature[] = [
  {
    title: 'Catálogo verificado',
    description:
      'Filtra por ciudad, especie y tamaño entre organizaciones con verificación real, no solo publicaciones sueltas.',
    Icon: SearchIcon,
  },
  {
    title: 'Apadrinamiento mensual',
    description:
      'Sostén a un animal en tratamiento o larga estancia con un aporte fijo mensual, con seguimiento real.',
    Icon: HeartIcon,
  },
  {
    title: 'Donaciones con trazabilidad',
    description:
      'Cada aporte se dispersa a la organización con el desglose de comisión a la vista — sin letra pequeña.',
    Icon: GiftIcon,
  },
  {
    title: 'Campañas de recaudación',
    description:
      'Apoya campañas activas de causas puntuales — cirugías, alimento, emergencias — de organizaciones verificadas.',
    Icon: MegaphoneIcon,
  },
  {
    title: 'Portal por organización',
    description:
      'Cada refugio tiene su propio portal público con su historia, sus animales y sus campañas activas.',
    Icon: OrgIcon,
  },
  {
    title: 'Libro público de transparencia',
    description:
      'Cada donación y cada gasto ejecutado, con fecha y evidencia. Nada se borra, todo se puede revisar.',
    Icon: LedgerIcon,
  },
];

/**
 * "Todo lo que necesitas para adoptar bien" — sección de features de la
 * landing pública (LANDING-MOCKUP), ajustada al layout del mockup de
 * referencia: título centrado, grid de tarjetas con ícono en caja
 * `brand-teal-light`, título y descripción.
 */
export function GeneralPortalFeaturesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Todo lo que necesitas para adoptar bien
        </h2>
        <p className="mt-2 text-brand-navy-soft">
          Del primer clic hasta la trazabilidad de cada peso.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {FEATURES.map(({ title, description, Icon }) => (
          <Card key={title}>
            <CardContent className="p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal-light">
                <Icon className="h-[1.15rem] w-[1.15rem] text-brand-teal-dark" />
              </div>
              <h3 className="mb-1.5 font-semibold">{title}</h3>
              <p className="text-sm text-brand-navy-soft">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
