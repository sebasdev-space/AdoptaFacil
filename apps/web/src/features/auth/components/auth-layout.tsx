import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Logo,
} from '@adoptafacil/ui';
import styles from './auth-layout.module.scss';

export interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Footer content (navigation links between auth screens). */
  footer?: ReactNode;
  /** Widen the card for the multi-field registration forms. */
  wide?: boolean;
}

/**
 * Centered, responsive shell for the public auth screens. Carries the brand and
 * a consistent card frame so login/register/forgot/reset look like one flow.
 *
 * F-LANDING-02: a "Volver al inicio" exit to the general portal (`/`, F-LANDING-01)
 * lives here once, so every screen that uses this layout (login, register,
 * forgot, reset) gets it for free instead of duplicating it per page. It is a
 * plain navigation link to an EXISTING public route — it does not touch the
 * returnTo mechanism (RequireAuth/LoginPage's `state.from`), which keeps working
 * unchanged: this is an additional way OUT, not a replacement for it.
 *
 * F1-03+: styled as a SECONDARY (outline) button — visible as a button, but it
 * never competes with the screen's actual primary action (the sólido submit
 * button inside `children`), same hierarchy as the other return-to-home links.
 */
export function AuthLayout({ title, description, children, footer, wide }: AuthLayoutProps) {
  return (
    <div className={styles.shell}>
      <Link
        to="/"
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          wide ? 'w-full max-w-lg' : 'w-full max-w-sm',
        )}
      >
        ← Volver al inicio
      </Link>
      <Card className={wide ? 'w-full max-w-lg' : 'w-full max-w-sm'}>
        <CardHeader className={cn(styles.header, 'text-center')}>
          <Logo variant="full" size="sm" />
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
        {footer && (
          <CardFooter className="justify-center border-t pt-4 text-center text-sm text-muted-foreground">
            <div className="w-full space-y-1">{footer}</div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
