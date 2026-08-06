import { useEffect, useMemo, useRef, useState } from 'react';
import { cn, Input } from '@adoptafacil/ui';
import type { AnimalBreed } from '@adoptafacil/contracts';
import { ChevronDownIcon } from './icons';

/**
 * Searchable breed select (S2-04A §5.3). No Combobox/`cmdk` exists anywhere in
 * the repo yet (checked) — this is feature-local (same pattern as
 * `animal-form-fields.tsx`'s `SelectField`/`TextAreaField`) rather than a new
 * `packages/ui` dependency added without Fabián's cross-review.
 * TODO(fabian): promote to `packages/ui` if another feature needs a searchable
 * select — this implementation has no external dependency (no `cmdk`), just a
 * filtered list in a positioned panel with click-outside-to-close.
 */
export interface BreedComboboxProps {
  id: string;
  label: string;
  breeds: AnimalBreed[];
  /** Selected catalog breed id, or `''` for none/custom. */
  value: string;
  onSelectBreed: (breedId: string) => void;
  /** User is typing a breed not in the catalog. */
  customValue: string;
  onCustomValueChange: (value: string) => void;
}

export function BreedCombobox({
  id,
  label,
  breeds,
  value,
  onSelectBreed,
  customValue,
  onCustomValueChange,
}: BreedComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedBreed = breeds.find((b) => b.id === value);
  const isCustom = !value && customValue.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return breeds;
    return breeds.filter((b) => b.name.toLowerCase().includes(q));
  }, [breeds, query]);

  const displayValue = open ? query : isCustom ? customValue : (selectedBreed?.name ?? '');

  function choose(breedId: string): void {
    onSelectBreed(breedId);
    onCustomValueChange('');
    setQuery('');
    setOpen(false);
  }

  function chooseCustom(name: string): void {
    onSelectBreed('');
    onCustomValueChange(name);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Buscar raza…"
          value={displayValue}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          className="pr-8"
        />
        <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-md"
        >
          <li>
            <button
              type="button"
              className={cn(
                'block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                !value && !isCustom && 'font-medium text-muted-foreground',
              )}
              onClick={() => choose('')}
            >
              Sin raza
            </button>
          </li>
          {filtered.map((breed) => (
            <li key={breed.id}>
              <button
                type="button"
                role="option"
                aria-selected={breed.id === value}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                  breed.id === value && 'bg-accent/60 font-medium',
                )}
                onClick={() => choose(breed.id)}
              >
                {breed.name}
              </button>
            </li>
          ))}
          {query.trim() &&
            !filtered.some((b) => b.name.toLowerCase() === query.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                  onClick={() => chooseCustom(query.trim())}
                >
                  Otra raza: “{query.trim()}”
                </button>
              </li>
            )}
          {filtered.length === 0 && !query.trim() && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Sin razas para esta especie.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
