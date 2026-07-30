/**
 * Static Colombia → Departamento → Ciudad catalog for the org profile's
 * location fields (T-D05, P3). Country is fixed to Colombia (the platform's
 * scope, per the base document) so it is not stored per-department here.
 *
 * DATA CAVEAT: authored from general knowledge (no DANE/official dataset was
 * fetched — this environment has no network access), not an authoritative
 * civic registry. It covers the 32 departments + Bogotá, D.C. with their
 * capital plus a handful of well-known larger municipalities — enough for the
 * demo, NOT exhaustive (Colombia has 1,100+ municipalities). The UI always
 * keeps whatever department/city a record already has as a selectable option
 * even if it is missing here, and offers a free-text "Otro municipio" input,
 * so no existing data is ever hidden or forced to change.
 */
export interface ColombianDepartment {
  value: string;
  label: string;
  cities: string[];
}

export const COLOMBIA = 'Colombia';

export const DEPARTMENTS: ColombianDepartment[] = [
  { value: 'Amazonas', label: 'Amazonas', cities: ['Leticia', 'Puerto Nariño'] },
  {
    value: 'Antioquia',
    label: 'Antioquia',
    cities: ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Rionegro', 'Apartadó', 'Turbo'],
  },
  { value: 'Arauca', label: 'Arauca', cities: ['Arauca', 'Saravena', 'Tame'] },
  { value: 'Atlántico', label: 'Atlántico', cities: ['Barranquilla', 'Soledad', 'Malambo'] },
  { value: 'Bogotá, D.C.', label: 'Bogotá, D.C.', cities: ['Bogotá'] },
  { value: 'Bolívar', label: 'Bolívar', cities: ['Cartagena', 'Magangué', 'Turbaco'] },
  {
    value: 'Boyacá',
    label: 'Boyacá',
    cities: ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá'],
  },
  { value: 'Caldas', label: 'Caldas', cities: ['Manizales', 'Chinchiná', 'La Dorada'] },
  { value: 'Caquetá', label: 'Caquetá', cities: ['Florencia'] },
  { value: 'Casanare', label: 'Casanare', cities: ['Yopal', 'Aguazul', 'Villanueva'] },
  { value: 'Cauca', label: 'Cauca', cities: ['Popayán', 'Santander de Quilichao'] },
  { value: 'Cesar', label: 'Cesar', cities: ['Valledupar', 'Aguachica'] },
  { value: 'Chocó', label: 'Chocó', cities: ['Quibdó', 'Istmina'] },
  { value: 'Córdoba', label: 'Córdoba', cities: ['Montería', 'Cereté', 'Lorica'] },
  {
    value: 'Cundinamarca',
    label: 'Cundinamarca',
    cities: ['Soacha', 'Zipaquirá', 'Chía', 'Facatativá', 'Fusagasugá', 'Girardot'],
  },
  { value: 'Guainía', label: 'Guainía', cities: ['Inírida'] },
  { value: 'Guaviare', label: 'Guaviare', cities: ['San José del Guaviare'] },
  { value: 'Huila', label: 'Huila', cities: ['Neiva', 'Pitalito', 'Garzón'] },
  { value: 'La Guajira', label: 'La Guajira', cities: ['Riohacha', 'Maicao'] },
  { value: 'Magdalena', label: 'Magdalena', cities: ['Santa Marta', 'Ciénaga'] },
  { value: 'Meta', label: 'Meta', cities: ['Villavicencio', 'Acacías', 'Granada'] },
  { value: 'Nariño', label: 'Nariño', cities: ['Pasto', 'Tumaco', 'Ipiales'] },
  {
    value: 'Norte de Santander',
    label: 'Norte de Santander',
    cities: ['Cúcuta', 'Ocaña', 'Pamplona'],
  },
  { value: 'Putumayo', label: 'Putumayo', cities: ['Mocoa', 'Puerto Asís', 'Orito'] },
  { value: 'Quindío', label: 'Quindío', cities: ['Armenia', 'Calarcá'] },
  {
    value: 'Risaralda',
    label: 'Risaralda',
    cities: ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal'],
  },
  {
    value: 'San Andrés y Providencia',
    label: 'San Andrés y Providencia',
    cities: ['San Andrés', 'Providencia'],
  },
  {
    value: 'Santander',
    label: 'Santander',
    cities: ['Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja'],
  },
  { value: 'Sucre', label: 'Sucre', cities: ['Sincelejo', 'Corozal'] },
  { value: 'Tolima', label: 'Tolima', cities: ['Ibagué', 'Espinal'] },
  {
    value: 'Valle del Cauca',
    label: 'Valle del Cauca',
    cities: ['Cali', 'Buenaventura', 'Palmira', 'Tuluá', 'Buga', 'Cartago'],
  },
  { value: 'Vaupés', label: 'Vaupés', cities: ['Mitú'] },
  { value: 'Vichada', label: 'Vichada', cities: ['Puerto Carreño'] },
];

/** Sentinel city-select value meaning "free-text municipality not in the list". */
export const OTHER_CITY_VALUE = '__otro__';

export function citiesForDepartment(department: string): string[] {
  return DEPARTMENTS.find((d) => d.value === department)?.cities ?? [];
}
