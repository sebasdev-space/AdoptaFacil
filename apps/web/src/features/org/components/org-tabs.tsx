import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './org-tabs.module.scss';

/**
 * Barra de tabs con indicador subrayado en `--brand` (feature-local).
 *
 * `Tabs`/`TabsList`/`TabsTrigger` de `@adoptafacil/ui` (packages/ui/src/
 * components/tabs.tsx) ya existen, pero solo traen la variante "pill" con
 * fondo navy — este refactor pide un indicador subrayado, una variante que
 * todavía no está ahí. Agregarla implicaría tocar `packages/ui` (zona
 * compartida con Fabián), así que por ahora esto vive aquí, como versión
 * feature-local temporal (misma regla ya aplicada a otros iconos/labels de
 * este módulo).
 * TODO(shared-ui): si el estilo underline se reutiliza en otra vista, pedirle
 * a Fabián agregar `variant="underline"` al `Tabs` compartido en vez de
 * mantener esta copia.
 */
export interface OrgTabItem {
  value: string;
  label: string;
}

export interface OrgTabsNavProps {
  items: OrgTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
}

export function OrgTabsNav({ items, value, onValueChange, ariaLabel }: OrgTabsNavProps) {
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = (index: number) => {
    const wrapped = (index + items.length) % items.length;
    onValueChange(items[wrapped].value);
    triggerRefs.current[wrapped]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={styles['tabs-list']}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              triggerRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`org-tab-${item.value}`}
            aria-controls={`org-panel-${item.value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles['tabs-trigger']}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface OrgTabPanelProps {
  value: string;
  activeValue: string;
  children: ReactNode;
}

export function OrgTabPanel({ value, activeValue, children }: OrgTabPanelProps) {
  if (value !== activeValue) return null;
  return (
    <div
      role="tabpanel"
      id={`org-panel-${value}`}
      aria-labelledby={`org-tab-${value}`}
      tabIndex={0}
      className={styles['tabs-panel']}
    >
      {children}
    </div>
  );
}
