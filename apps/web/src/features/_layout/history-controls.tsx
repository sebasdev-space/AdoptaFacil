import { Button, Input } from '@adoptafacil/ui';

/**
 * Controles compartidos del historial de listados de gestión (M04 Adopciones,
 * M05 Donaciones recibidas): por defecto el listado muestra los últimos 30 días;
 * "Ver todo" abre filtros (fechas/estado) y paginación sobre el historial
 * completo. Las fechas del filtro son días calendario de Colombia (UTC-5, sin
 * horario de verano) y se envían al API como ISO-8601 UTC.
 */

export interface HistoryFilters {
  /** `YYYY-MM-DD` (día calendario Colombia) o vacío. */
  from: string;
  to: string;
  status: string;
  page: number;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = { from: '', to: '', status: '', page: 1 };
export const HISTORY_PAGE_SIZE = 25;

/** Inicio del día en Colombia -> ISO UTC. */
export function bogotaDayStartToUtc(day: string): string {
  return new Date(`${day}T00:00:00.000-05:00`).toISOString();
}

/** Fin del día en Colombia -> ISO UTC. */
export function bogotaDayEndToUtc(day: string): string {
  return new Date(`${day}T23:59:59.999-05:00`).toISOString();
}

/** Query string del modo "Ver todo" (siempre paginado). */
export function historyQueryString(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', bogotaDayStartToUtc(filters.from));
  if (filters.to) params.set('to', bogotaDayEndToUtc(filters.to));
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page));
  params.set('pageSize', String(HISTORY_PAGE_SIZE));
  return `?${params.toString()}`;
}

/** Normaliza el sobre paginado; defiende contra formas inesperadas. */
export function normalizeHistoryPage<T>(body: unknown): { items: T[]; total: number } {
  if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
    const b = body as { items: T[]; total?: number };
    return { items: b.items, total: typeof b.total === 'number' ? b.total : b.items.length };
  }
  if (Array.isArray(body)) return { items: body as T[], total: body.length };
  return { items: [], total: 0 };
}

export interface HistoryControlsProps {
  showAll: boolean;
  onShowAll: () => void;
  onBackToRecent: () => void;
  filters: HistoryFilters;
  onFiltersChange: (next: HistoryFilters) => void;
  statusOptions: ReadonlyArray<{ value: string; label: string }>;
  total: number;
}

export function HistoryControls({
  showAll,
  onShowAll,
  onBackToRecent,
  filters,
  onFiltersChange,
  statusOptions,
  total,
}: HistoryControlsProps) {
  if (!showAll) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="history-recent">
        <p className="text-sm text-muted-foreground">Mostrando los últimos 30 días.</p>
        <Button variant="outline" onClick={onShowAll}>
          Ver todo
        </Button>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const set = (patch: Partial<HistoryFilters>) =>
    onFiltersChange({ ...filters, page: 1, ...patch });

  return (
    <div className="space-y-3" data-testid="history-all">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block">Desde</span>
          <Input
            type="date"
            aria-label="Desde"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Hasta</span>
          <Input
            type="date"
            aria-label="Hasta"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Estado</span>
          <select
            aria-label="Estado"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={filters.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="">Todos</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={onBackToRecent}>
          Últimos 30 días
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm" data-testid="history-pager">
        <Button
          variant="outline"
          disabled={filters.page <= 1}
          onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}
        >
          Anterior
        </Button>
        <span>
          Página {filters.page} de {totalPages} · {total} en total
        </span>
        <Button
          variant="outline"
          disabled={filters.page >= totalPages}
          onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
