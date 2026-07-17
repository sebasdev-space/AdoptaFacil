import { Button } from '@adoptafacil/ui';
import { AlertTriangleIcon } from '../icons';

/**
 * Layout-level loading and error states, rendered when the shell cannot yet (or
 * cannot at all) show a page's content — e.g. the session is resolving, or the
 * content boundary caught an error. Page-scoped states live in features/_layout.
 */

/** Full-viewport centered loading state. */
export function FullPageLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export interface FullPageErrorProps {
  title?: string;
  message?: string;
  /** Optional recovery action (e.g. reset the error boundary or reload). */
  onRetry?: () => void;
  retryLabel?: string;
}

/** Full-viewport centered error state with an optional retry action. */
export function FullPageError({
  title = 'Algo salió mal',
  message = 'Ocurrió un error al mostrar esta sección. Intenta nuevamente.',
  onRetry,
  retryLabel = 'Reintentar',
}: FullPageErrorProps) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground"
      role="alert"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Inline (within-layout) error state, sized to the content region. */
export function ContentError({
  title = 'No se pudo cargar el contenido',
  message = 'Ocurrió un error en esta sección. Intenta nuevamente.',
  onRetry,
  retryLabel = 'Reintentar',
}: FullPageErrorProps) {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center"
      role="alert"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
