import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';

export interface PortalAboutSectionProps {
  aboutUs: string;
}

/** Tab pública "Nosotros" (S2-PORTAL) — texto libre (misión/historia) que el
 *  Owner escribe en la personalización. El portal solo la muestra si trae
 *  contenido real (el llamador decide si montarla). */
export function PortalAboutSection({ aboutUs }: PortalAboutSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nosotros</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{aboutUs}</p>
      </CardContent>
    </Card>
  );
}
