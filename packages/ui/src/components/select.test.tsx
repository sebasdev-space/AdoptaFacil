import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

function Example({ disabled = false }: { disabled?: boolean }) {
  return (
    <Select disabled={disabled}>
      <SelectTrigger aria-label="Especie">
        <SelectValue placeholder="Elige una especie" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="perro">Perro</SelectItem>
        <SelectItem value="gato">Gato</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('renders an accessible, collapsed combobox trigger with a placeholder', () => {
    render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Especie' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Elige una especie')).toBeInTheDocument();
  });

  it('reflects the disabled state', () => {
    render(<Example disabled />);
    expect(screen.getByRole('combobox', { name: 'Especie' })).toBeDisabled();
  });
});
