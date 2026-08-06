import { useState } from 'react';
import { cn, Input } from '@adoptafacil/ui';
import { XIcon } from './icons';

/** Common personality tags suggested below the input (S2-04A §5.4). Free text
 *  — this is NOT a closed catalog, just suggestions; the user may type any
 *  value. */
export const SUGGESTED_TAGS = [
  'Juguetón',
  'Cariñoso',
  'Tímido',
  'Protector',
  'Independiente',
  'Sociable',
  'Enérgico',
  'Tranquilo',
  'Amigable',
  'Curioso',
  'Leal',
  'Obediente',
  'Travieso',
] as const;

export const MAX_TAGS = 10;

export interface TagInputProps {
  id: string;
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** No tag/chip-input component exists anywhere in the repo (checked) — this is
 *  feature-local, same reasoning as `BreedCombobox`. */
export function TagInput({ id, label, tags, onChange }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function addTag(raw: string): void {
    const value = raw.trim();
    if (
      !value ||
      tags.length >= MAX_TAGS ||
      tags.some((t) => t.toLowerCase() === value.toLowerCase())
    ) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  }

  function removeTag(value: string): void {
    onChange(tags.filter((t) => t !== value));
  }

  const available = SUGGESTED_TAGS.filter(
    (suggestion) => !tags.some((t) => t.toLowerCase() === suggestion.toLowerCase()),
  );

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Quitar etiqueta ${tag}`}
              className="rounded-full hover:text-destructive"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <Input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addTag(draft);
              }
            }}
            placeholder={tags.length === 0 ? 'Escribe y presiona Enter…' : ''}
            className="h-7 w-32 flex-1 border-none p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        )}
      </div>
      {tags.length >= MAX_TAGS && (
        <p className="text-xs text-muted-foreground">Máximo {MAX_TAGS} etiquetas.</p>
      )}
      {available.length > 0 && tags.length < MAX_TAGS && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Sugerencias:</span>
          {available.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addTag(suggestion)}
              className={cn(
                'rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground',
                'hover:border-primary hover:text-primary',
              )}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
