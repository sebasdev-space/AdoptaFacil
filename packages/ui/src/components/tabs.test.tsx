import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function Example() {
  return (
    <Tabs defaultValue="perros">
      <TabsList aria-label="Tipo de mascota">
        <TabsTrigger value="perros">Perros</TabsTrigger>
        <TabsTrigger value="gatos">Gatos</TabsTrigger>
      </TabsList>
      <TabsContent value="perros">Lista de perros</TabsContent>
      <TabsContent value="gatos">Lista de gatos</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes tablist/tab/tabpanel roles and shows the default panel', () => {
    render(<Example />);
    expect(screen.getByRole('tablist', { name: 'Tipo de mascota' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Perros' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Lista de perros');
  });

  it('switches panels when another tab is activated', () => {
    render(<Example />);
    // Radix Tabs selects on pointer-down / focus (not a synthetic click).
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gatos' }));
    expect(screen.getByRole('tab', { name: 'Gatos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Lista de gatos');
  });
});
