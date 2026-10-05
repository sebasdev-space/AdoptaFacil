import { PageContainer, PageHeader } from '../../_layout';
import { MyDonationsList } from '../components/my-donations-list';

/**
 * `/mis-donaciones` — historial de donaciones del usuario autenticado. Vive
 * DENTRO de `<RequireAuth>`/`<AppLayout>` para conservar el menú lateral (antes
 * era la rama "sin organización" de `/donaciones`, que es pública y arma su
 * propio chrome sin menú). `/donaciones` sin organización y con sesión redirige aquí.
 */
export function MyDonationsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Mis donaciones"
        description="Historial de tus donaciones. Para donar, entra al portal público de una organización."
      />
      <MyDonationsList />
    </PageContainer>
  );
}
