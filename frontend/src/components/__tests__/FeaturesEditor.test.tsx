import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeaturesEditor from '../FeaturesEditor';
import type { Feature } from '@/lib/types';

const f = (over: Partial<Feature> = {}): Feature => ({
  name: 'Second Wind',
  source: 'Fighter',
  description: 'Regain HP.',
  ...over,
});

describe('FeaturesEditor', () => {
  it('renders only the add button when empty', () => {
    render(<FeaturesEditor value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add feature/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Feature name')).toBeNull();
  });

  it('appends a blank feature row on add', async () => {
    const onChange = vi.fn();
    render(<FeaturesEditor value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add feature/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: '', source: '', description: '' }]);
  });

  it('edits the source field', () => {
    const onChange = vi.fn();
    render(<FeaturesEditor value={[f()]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Feature source'), { target: { value: 'Elf' } });
    expect(onChange).toHaveBeenCalledWith([f({ source: 'Elf' })]);
  });

  it('edits the name and description fields', () => {
    const onChange = vi.fn();
    render(<FeaturesEditor value={[f()]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Feature name'), { target: { value: 'Rage' } });
    expect(onChange).toHaveBeenLastCalledWith([f({ name: 'Rage' })]);
    fireEvent.change(screen.getByLabelText('Feature description'), {
      target: { value: 'Advantage on STR.' },
    });
    expect(onChange).toHaveBeenLastCalledWith([f({ description: 'Advantage on STR.' })]);
  });

  it('removes the targeted row', async () => {
    const onChange = vi.fn();
    render(<FeaturesEditor value={[f({ name: 'A' }), f({ name: 'B' })]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove feature 2' }));
    expect(onChange).toHaveBeenCalledWith([f({ name: 'A' })]);
  });

  it('offers source suggestions via a datalist', () => {
    render(
      <FeaturesEditor value={[f()]} onChange={vi.fn()} sourceSuggestions={['Fighter', 'Elf', '']} />
    );
    const input = screen.getByLabelText('Feature source') as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    // Blank suggestions are filtered out; the two real ones are offered.
    // (useId values contain ':', invalid in a CSS selector — use getElementById.)
    const datalist = document.getElementById(listId!);
    const options = datalist?.querySelectorAll('option') ?? [];
    expect(Array.from(options).map(o => o.getAttribute('value'))).toEqual(['Fighter', 'Elf']);
  });

  // VEG-454. The editor offers no level input — a hand-entered row has no
  // granting level to record. What matters is that it doesn't *erase* one:
  // `update` spreads the existing feature, so a level written by the level-up
  // dialog survives an unrelated edit here rather than being dropped and
  // silently re-collapsing two grants of a recurring name into one.
  it('preserves a level written by the level-up dialog through an unrelated edit', () => {
    const onChange = vi.fn();
    const granted = f({ name: 'Ability Score Improvement', level: 8 });
    render(<FeaturesEditor value={[granted]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Feature description'), {
      target: { value: 'Raise an ability score by 2.' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { ...granted, description: 'Raise an ability score by 2.' },
    ]);
  });
});
