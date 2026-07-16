import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('composes header, content and footer with an accessible heading', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Adopción</CardTitle>
          <CardDescription>Resumen de la solicitud</CardDescription>
        </CardHeader>
        <CardContent>Contenido</CardContent>
        <CardFooter>Pie</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Adopción' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de la solicitud')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });

  it('uses the card token surface', () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-card');
  });
});
