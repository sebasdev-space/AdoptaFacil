import type { AnimalSpecies } from '@adoptafacil/contracts';

/**
 * Common breed catalog (S2-04A). `AnimalBreed` stays tenant-scoped (each org's
 * row set is independent, RLS as usual) — this list is what gets INSERTed for
 * every organization, both existing ones (migration backfill) and new ones
 * (see `AuthService.register`), so every org starts with the same preloaded
 * catalog instead of an empty one, while still being free to add/remove its
 * own custom breeds afterward.
 */
export interface AnimalBreedSeed {
  species: AnimalSpecies;
  name: string;
}

export const DEFAULT_ANIMAL_BREEDS: readonly AnimalBreedSeed[] = [
  // --- Perros -----------------------------------------------------------
  { species: 'dog', name: 'Labrador Retriever' },
  { species: 'dog', name: 'Golden Retriever' },
  { species: 'dog', name: 'Pastor Alemán' },
  { species: 'dog', name: 'Bulldog Francés' },
  { species: 'dog', name: 'Bulldog Inglés' },
  { species: 'dog', name: 'Poodle' },
  { species: 'dog', name: 'Beagle' },
  { species: 'dog', name: 'Rottweiler' },
  { species: 'dog', name: 'Yorkshire Terrier' },
  { species: 'dog', name: 'Boxer' },
  { species: 'dog', name: 'Dachshund (Salchicha)' },
  { species: 'dog', name: 'Husky Siberiano' },
  { species: 'dog', name: 'Doberman' },
  { species: 'dog', name: 'Gran Danés' },
  { species: 'dog', name: 'Chihuahua' },
  { species: 'dog', name: 'Shih Tzu' },
  { species: 'dog', name: 'Schnauzer Miniatura' },
  { species: 'dog', name: 'Pomerania' },
  { species: 'dog', name: 'Border Collie' },
  { species: 'dog', name: 'Cocker Spaniel' },
  { species: 'dog', name: 'Pitbull' },
  { species: 'dog', name: 'Bichón Maltés' },
  { species: 'dog', name: 'San Bernardo' },
  { species: 'dog', name: 'Akita Inu' },
  { species: 'dog', name: 'Dálmata' },
  { species: 'dog', name: 'Pug (Carlino)' },
  { species: 'dog', name: 'Jack Russell Terrier' },
  { species: 'dog', name: 'Shar Pei' },
  { species: 'dog', name: 'Samoyedo' },
  { species: 'dog', name: 'Weimaraner' },
  { species: 'dog', name: 'Mestizo / Criollo' },
  // --- Gatos ------------------------------------------------------------
  { species: 'cat', name: 'Persa' },
  { species: 'cat', name: 'Siamés' },
  { species: 'cat', name: 'Maine Coon' },
  { species: 'cat', name: 'Bengalí' },
  { species: 'cat', name: 'Ragdoll' },
  { species: 'cat', name: 'Británico de Pelo Corto' },
  { species: 'cat', name: 'Sphynx' },
  { species: 'cat', name: 'Abisinio' },
  { species: 'cat', name: 'Scottish Fold' },
  { species: 'cat', name: 'Angora Turco' },
  { species: 'cat', name: 'Ruso Azul' },
  { species: 'cat', name: 'Birmano' },
  { species: 'cat', name: 'Bombay' },
  { species: 'cat', name: 'Exótico de Pelo Corto' },
  { species: 'cat', name: 'Mestizo / Criollo' },
];
