import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ComingSoon,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';

const HEADING_ID = 'portal-section-public-ledger';

/**
 * "Transparencia — libro público" (pulido visual, imagen de referencia usada
 * solo como guía). El libro público real (RF14) es trabajo post-pitch: aquí
 * solo se agrega la sección + un botón que abre el `<ComingSoon/>` ya
 * existente en `packages/ui` — sin maquetar tabla de movimientos ni conectar
 * ningún dato, tal como pide el Prompt Spec.
 */
export function PortalPublicLedgerSection() {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby={HEADING_ID} data-testid="portal-public-ledger-section">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle id={HEADING_ID}>Transparencia — libro público</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada donación y gasto ejecutado, con fecha y responsable.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Ver libro completo →
          </Button>
        </CardHeader>
        <CardContent />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transparencia — libro público</DialogTitle>
          </DialogHeader>
          <ComingSoon
            title="Libro público"
            description="El registro público de movimientos de esta organización estará disponible próximamente."
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
