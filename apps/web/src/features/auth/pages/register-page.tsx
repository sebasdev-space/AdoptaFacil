import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@adoptafacil/ui';
import type { AccountType } from '../../../shell/api';
import { AuthLayout } from '../components/auth-layout';
import { RegisterOrganizationForm } from './register-organization-form';
import { RegisterPersonForm } from './register-person-form';

/**
 * Registration screen. A clear account-type selector (§13) keeps the two flows
 * separate: each tab renders its own distinct form — Organization and Person
 * fields are never mixed. Tab state is in memory only (no browser storage).
 */
export function RegisterPage() {
  const [accountType, setAccountType] = useState<AccountType>('organization');

  return (
    <AuthLayout
      wide
      title="Crear cuenta"
      description="Elige el tipo de cuenta y completa tus datos."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      }
    >
      <Tabs value={accountType} onValueChange={(value) => setAccountType(value as AccountType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="organization">Organización</TabsTrigger>
          <TabsTrigger value="person">Persona</TabsTrigger>
        </TabsList>
        <TabsContent value="organization" className="mt-4">
          <RegisterOrganizationForm />
        </TabsContent>
        <TabsContent value="person" className="mt-4">
          <RegisterPersonForm />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
}
