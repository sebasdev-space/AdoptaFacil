import { cn } from '@adoptafacil/ui';

/** AdoptaFácil wordmark used in the sidebar and mobile header. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden
      >
        <span className="text-base font-bold">A</span>
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Adopta<span className="text-primary">Fácil</span>
      </span>
    </div>
  );
}
