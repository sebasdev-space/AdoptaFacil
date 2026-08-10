import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';

function Example() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Ver detalle</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Ana Gómez → Kira</DrawerTitle>
          <DrawerDescription>Solicitud #S-2214</DrawerDescription>
        </DrawerHeader>
        <DrawerClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

describe('Drawer', () => {
  it('is closed until the trigger is activated', () => {
    render(<Example />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens an accessible panel wired to its title and description', () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    const drawer = screen.getByRole('dialog');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAccessibleName('Ana Gómez → Kira');
    expect(drawer).toHaveAccessibleDescription('Solicitud #S-2214');
  });

  it('closes when a DrawerClose control is activated', () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
