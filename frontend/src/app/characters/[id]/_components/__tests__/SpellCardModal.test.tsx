import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpellCardModal from '../SpellCardModal';
import type { SpellEntry, SrdSpell } from '@/lib/types';

// The card fetches the catalog row via useApiQuery('/srd/spells/:id') for
// catalog-linked entries. Mock the query layer so tests drive loading / error /
// success without touching the network.
const mockUseApiQuery = vi.fn();
vi.mock('@/lib/query', () => ({
  useApiQuery: (path: string) => mockUseApiQuery(path),
}));

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
    description: 'A bright streak flashes from your pointing finger to a point you choose.',
    classes: ['Sorcerer', 'Wizard'],
    ritual: false,
    concentration: false,
    source: 'SRD 5.2.1',
    contentSource: 'srd',
    ...over,
  };
}

const linkedEntry: SpellEntry = { level: 3, name: 'Fireball', prepared: true, spellId: 'sp-1' };
const freeEntry: SpellEntry = {
  level: 1,
  name: 'Homebrew Bolt',
  prepared: true,
  castingTime: '1 action',
  range: '30 feet',
  concentration: true,
  notes: 'Crackles with static.',
};

describe('SpellCardModal', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReset();
    mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('renders nothing when no entry is selected', () => {
    render(<SpellCardModal entry={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a loading state while the catalog row is fetching', () => {
    mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SpellCardModal entry={linkedEntry} onClose={() => {}} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('spell-card-loading')).toBeInTheDocument();
  });

  it('fetches the catalog row by spellId and renders the full detail on success', () => {
    mockUseApiQuery.mockReturnValue({ data: makeSpell(), isLoading: false, isError: false });
    render(<SpellCardModal entry={linkedEntry} onClose={() => {}} />);

    // Fetches the correct path.
    expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/spells/sp-1');
    // Header + reused SpellDetail content.
    expect(screen.getByRole('heading', { name: /Fireball/ })).toBeInTheDocument();
    expect(screen.getByText(/Level 3 · Evocation/)).toBeInTheDocument();
    expect(screen.getByText('Casting Time')).toBeInTheDocument();
    expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
  });

  it('shows concentration / ritual / homebrew badges from the catalog row', () => {
    mockUseApiQuery.mockReturnValue({
      data: makeSpell({ concentration: true, ritual: true, contentSource: 'homebrew' }),
      isLoading: false,
      isError: false,
    });
    render(<SpellCardModal entry={linkedEntry} onClose={() => {}} />);

    expect(screen.getByText('Concentration')).toBeInTheDocument();
    expect(screen.getByText('Ritual')).toBeInTheDocument();
    expect(screen.getByText('Homebrew')).toBeInTheDocument();
  });

  it('shows an error message with a fallback to stored fields when the fetch fails', () => {
    mockUseApiQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    });
    render(<SpellCardModal entry={linkedEntry} onClose={() => {}} />);

    expect(screen.getByTestId('spell-card-error')).toBeInTheDocument();
    // Falls back to the stored entry name so the user still sees something.
    expect(screen.getByRole('heading', { name: /Fireball/ })).toBeInTheDocument();
  });

  it('renders free-typed entries from stored metadata without fetching', () => {
    render(<SpellCardModal entry={freeEntry} onClose={() => {}} />);

    expect(mockUseApiQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /Homebrew Bolt/ })).toBeInTheDocument();
    expect(screen.getByText('1 action')).toBeInTheDocument();
    expect(screen.getByText('30 feet')).toBeInTheDocument();
    expect(screen.getByText(/Crackles with static/)).toBeInTheDocument();
    // Hint that it isn't catalog-linked.
    expect(screen.getByTestId('not-linked-hint')).toBeInTheDocument();
  });

  it('closes when the Escape key is pressed', async () => {
    const onClose = vi.fn();
    mockUseApiQuery.mockReturnValue({ data: makeSpell(), isLoading: false, isError: false });
    render(<SpellCardModal entry={linkedEntry} onClose={onClose} />);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
