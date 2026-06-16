import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeaponsEditor from '../WeaponsEditor';
import type { Weapon } from '@/lib/types';

const w = (over: Partial<Weapon> = {}): Weapon => ({
  name: 'Longsword',
  attackBonus: '+5',
  damage: '1d8+3',
  damageType: 'slashing',
  notes: '',
  ...over,
});

describe('WeaponsEditor', () => {
  it('renders only the add button when empty', () => {
    render(<WeaponsEditor value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add weapon/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Weapon name')).toBeNull();
  });

  it('appends a blank weapon row on add', async () => {
    const onChange = vi.fn();
    render(<WeaponsEditor value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add weapon/i }));
    expect(onChange).toHaveBeenCalledWith([
      { name: '', attackBonus: '', damage: '', damageType: '', notes: '' },
    ]);
  });

  it('prefills row inputs and edits a field', () => {
    const onChange = vi.fn();
    render(<WeaponsEditor value={[w()]} onChange={onChange} />);
    expect((screen.getByLabelText('Weapon name') as HTMLInputElement).value).toBe('Longsword');
    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: '2d6' } });
    expect(onChange).toHaveBeenCalledWith([w({ damage: '2d6' })]);
  });

  it('edits the notes field and a middle row without disturbing siblings', () => {
    const onChange = vi.fn();
    const rows = [w({ name: 'A' }), w({ name: 'B' }), w({ name: 'C' })];
    render(<WeaponsEditor value={rows} onChange={onChange} />);
    // Edit the notes of the middle row (index 1).
    fireEvent.change(screen.getAllByLabelText('Weapon notes')[1], {
      target: { value: 'silvered' },
    });
    expect(onChange).toHaveBeenCalledWith([rows[0], w({ name: 'B', notes: 'silvered' }), rows[2]]);
  });

  it('removes the targeted row', async () => {
    const onChange = vi.fn();
    render(
      <WeaponsEditor value={[w({ name: 'Dagger' }), w({ name: 'Bow' })]} onChange={onChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove weapon 1' }));
    expect(onChange).toHaveBeenCalledWith([w({ name: 'Bow' })]);
  });
});
