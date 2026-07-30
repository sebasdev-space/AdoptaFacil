import { EmptyState } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from './page';

export interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/**
 * Generic placeholder for a section whose real screen doesn't exist yet. It
 * keeps the shell fully navigable now; module owners replace the route element
 * with their feature without touching the shell.
 *
 * T-065 (pre-demo): text kept NEUTRAL on purpose — no "Ola X"/wave references,
 * so this never surfaces internal roadmap language to a client watching a demo.
 * Currently unused (routes without a real screen are simply unrouted instead),
 * kept for module owners who want a lightweight stand-in while building one.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <EmptyState
        title="Sección no disponible"
        description="Esta sección aún no está disponible."
      />
    </PageContainer>
  );
}
