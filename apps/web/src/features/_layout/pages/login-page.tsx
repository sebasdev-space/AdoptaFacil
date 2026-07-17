import { useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@adoptafacil/ui';
import { Brand } from '../../../shell/layout';
import { useSession } from '../../../shell/auth';

interface FromState {
  from?: Location;
}

/**
 * Public login route. In Ola 0 it uses the demo sign-in (mock auth service) and
 * returns the visitor to wherever the guard sent them from. When the real
 * credential form lands it will pass credentials to `signIn`; the redirect
 * contract (reading `location.state.from`) stays the same.
 */
export function LoginPage() {
  const { signIn, isAuthenticated } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from?.pathname ?? '/';
  const [pending, setPending] = useState(false);

  const handleSignIn = async () => {
    setPending(true);
    try {
      await signIn();
      navigate(from, { replace: true });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Brand className="mb-2" />
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Acceso al portal AdoptaFácil. La autenticación real se conecta en T-022.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={handleSignIn} disabled={pending}>
            {pending ? 'Entrando…' : isAuthenticated ? 'Continuar' : 'Entrar (demo)'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Sesión simulada — sin credenciales por ahora.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
