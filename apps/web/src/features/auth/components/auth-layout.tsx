import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@adoptafacil/ui';
import { Brand } from '../../../shell/layout';

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
 * a consistent card frame so login/register/forgot look like one flow.
 */
export function AuthLayout({ title, description, children, footer, wide }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className={wide ? 'w-full max-w-lg' : 'w-full max-w-sm'}>
        <CardHeader className="items-center text-center">
          <Brand className="mb-2" />
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
