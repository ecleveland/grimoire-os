import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSheet from '../CharacterSheet';
import { makeCharacter } from '@/test-utils/character';
import { renderWithQueryClient } from '@/test-utils/query';

// Renders the real sections, none mocked, so a section that ignores the
// read-only flag shows up here as a stray control.

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ id: 'char-1' }),
  usePathname: () => '/characters/char-1',
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// A caster with something in every list, so each mutating control has a row to
// render on when the sheet is editable.
const character = makeCharacter({
  campaignId: 'camp-1',
  spellcastingAbility: 'wisdom',
  spellSlots: [{ level: 1, total: 2, used: 0 }],
  spells: [{ level: 1, name: 'Bless', prepared: true }],
  inventory: [{ name: 'Rope', quantity: 1, weight: 10, equipped: false }],
  attunedItems: [{ name: 'Cloak of Protection' }],
  weapons: [{ name: 'Longsword', attackBonus: '+5', damage: '1d8+3', damageType: 'slashing' }],
  resources: [{ name: 'Second Wind', max: 1, used: 0, recharge: 'short' }],
});

function renderSheet(isOwner: boolean) {
  return renderWithQueryClient(<CharacterSheet character={character} isOwner={isOwner} />);
}

async function openSpellsTab() {
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Spells & Details' }));
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/campaigns') ? { data: [] } : [])
  );
});

describe('CharacterSheet as a read-only viewer', () => {
  it('shows every play control to the owner, so the read-only checks can fail', async () => {
    renderSheet(true);

    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save snapshot/i })).toBeInTheDocument();
    expect(screen.getByTestId('character-history')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /level up/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /roll/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Damage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /spend .*hit die/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Second Wind use 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);

    await openSpellsTab();

    expect(screen.getByRole('button', { name: 'Level 1 slot 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle prepared Bless' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Bless' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add spell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Equip Rope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Rope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rope' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove attunement Cloak of Protection' })
    ).toBeInTheDocument();
  });

  it('hides every mutating control on the Character tab when isOwner is false', () => {
    renderSheet(false);

    expect(screen.getByRole('heading', { name: 'Thorin Ironforge' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: /save snapshot/i })).toBeNull();
    expect(screen.queryByTestId('character-history')).toBeNull();
    expect(screen.queryByRole('button', { name: /level up/i })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /roll/i })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Damage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Heal' })).toBeNull();
    expect(screen.queryByRole('button', { name: /hit die/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /second wind/i })).toBeNull();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    // The attached campaign still shows, as a link only.
    expect(
      within(screen.getByTestId('campaign-membership')).getByRole('link', {
        name: /view campaign/i,
      })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/add to campaign/i)).toBeNull();
  });

  it('hides spell slot, spell and inventory edits on the Spells & Details tab', async () => {
    renderSheet(false);

    await openSpellsTab();

    // The rows still render, read only.
    expect(screen.getByText('Bless')).toBeInTheDocument();
    expect(screen.getByText('Rope')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /slot/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /prepared/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(un)?equip/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^add/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /attune/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /adjust/i })).toBeNull();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
