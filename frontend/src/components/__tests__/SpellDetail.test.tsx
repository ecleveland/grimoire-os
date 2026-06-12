import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpellDetail from '../SpellDetail';
import type { SrdSpell } from '@/lib/types';

function makeSpell(over: Partial<SrdSpell> = {}): SrdSpell {
  return {
    id: 'sp-1',
    name: 'Fireball',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    components: 'V, S, M',
    duration: 'Instantaneous',
    description: 'A bright streak flashes from your pointing finger.',
    classes: ['Sorcerer', 'Wizard'],
    ritual: false,
    concentration: false,
    source: 'SRD 5.2.1',
    contentSource: 'srd',
    ...over,
  };
}

describe('SpellDetail', () => {
  it('renders the casting stats grid including Casting Time', () => {
    render(<SpellDetail spell={makeSpell()} />);

    expect(screen.getByText('Casting Time')).toBeInTheDocument();
    expect(screen.getByText('1 action')).toBeInTheDocument();
    expect(screen.getByText('Range')).toBeInTheDocument();
    expect(screen.getByText('150 feet')).toBeInTheDocument();
    expect(screen.getByText('Components')).toBeInTheDocument();
    expect(screen.getByText('V, S, M')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Instantaneous')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<SpellDetail spell={makeSpell()} />);

    expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
  });

  it('renders Material and At Higher Levels when present', () => {
    render(
      <SpellDetail
        spell={makeSpell({
          material: 'A tiny ball of bat guano and sulfur',
          higherLevels: 'Damage increases by 1d6 per slot above 3rd.',
        })}
      />
    );

    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByText(/A tiny ball of bat guano/)).toBeInTheDocument();
    expect(screen.getByText('At Higher Levels')).toBeInTheDocument();
    expect(screen.getByText(/Damage increases by 1d6/)).toBeInTheDocument();
  });

  it('omits Material and At Higher Levels when absent', () => {
    render(<SpellDetail spell={makeSpell()} />);

    expect(screen.queryByText('Material')).not.toBeInTheDocument();
    expect(screen.queryByText('At Higher Levels')).not.toBeInTheDocument();
  });

  it('renders a chip per class', () => {
    render(<SpellDetail spell={makeSpell()} />);

    const heading = screen.getByText('Classes');
    const section = heading.closest('div')!;
    expect(section.textContent).toContain('Sorcerer');
    expect(section.textContent).toContain('Wizard');
  });

  it('omits the Classes section when the list is empty', () => {
    render(<SpellDetail spell={makeSpell({ classes: [] })} />);

    expect(screen.queryByText('Classes')).not.toBeInTheDocument();
  });
});
