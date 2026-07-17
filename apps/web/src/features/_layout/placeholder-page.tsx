import { EmptyState } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from './page';

export interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/**
 * Generic placeholder for portal sections whose real screens land in Ola 1. It
 * keeps the shell fully navigable now; module owners replace the route element
 * with their feature without touching the shell.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <EmptyState
        title="Sección en construcción"
        description="Este módulo se implementará en la Ola 1. El shell, la navegación y el indicador de transparencia ya están disponibles."
      />
    </PageContainer>
  );
}
