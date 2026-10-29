import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSnapshotPage from '../page';
import type { CharacterSnapshot, PaginatedResponse, SrdSpell } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';
import { renderWithQueryClient } from '@/test-utils/query';

// Renders the snapshot through the real CharacterSheet, so a write control
// that a future change leaves ungated on the owner flag shows up here.

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'char-1', snapshotId: 'snap-1' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const SNAPSHOT_PATH = '/characters/char-1/snapshots/snap-1';

const OPTIONS_DESCRIPTION =
  'Pick two invocations.\n\n**Options**\n\n**Agonizing Blast**\n\nAdd your Charisma modifier.\n\n**Armor of Shadows**\n\nMage Armor at will.';

// A sheet with something in every section that has an owner-only control:
// HP, conditions, concentration, resources, slots, spells, inventory,
// attunement, weapons and a campaign.
const snapshot: CharacterSnapshot = {
  id: 'snap-1',
  level: 5,
  label: 'Before the dragon fight',
  takenAt: '2026-10-12T12:00:00Z',
  data: makeCharacter({
    version: 0,
    class: 'Wizard',
    campaignId: 'camp-1',
    spellcastingAbility: 'Intelligence',
    spellSlots: [{ level: 1, total: 4, used: 1 }],
    spells: [
      { level: 0, name: 'Light' },
      { level: 3, name: 'Fireball', prepared: true, spellId: 'sp-1' },
    ],
    conditions: ['Poisoned'],
    concentration: { spell: 'Fly' },
    resources: [{ name: 'Arcane Recovery', max: 1, used: 0, recharge: 'long' }],
    inventory: [
      { name: 'Quarterstaff', quantity: 1, equipped: true },
      { name: 'Rope', quantity: 1, equipped: false, weight: 10 },
    ],
    attunedItems: [{ name: 'Ring of Protection' }],
    weapons: [{ name: 'Dagger', attackBonus: '+5', damage: '1d4+2', damageType: 'piercing' }],
    features: [
      { name: 'Eldritch Invocations', source: 'Wizard', description: OPTIONS_DESCRIPTION },
    ],
  }),
};

const fireball: SrdSpell = {
  id: 'sp-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes from your pointing finger.',
  classes: ['Wizard'],
  ritual: false,
  concentration: false,
  source: 'SRD 5.2.1',
  contentSource: 'srd',
};

const noCampaigns: PaginatedResponse<never> = { data: [], total: 0, page: 1, lastPage: 1 };

// Every request the snapshot view may make is a GET. Anything else rejects, so
// an unexpected request fails the method assertion and shows in the error.
function routeApiFetch() {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    const method = options?.method ?? 'GET';
    if (method === 'GET') {
      if (path === SNAPSHOT_PATH) return Promise.resolve(snapshot);
      if (path.startsWith('/campaigns?')) return Promise.resolve(noCampaigns);
      if (path === '/srd/classes') return Promise.resolve([]);
      if (path === '/srd/spells/sp-1') return Promise.resolve(fireball);
    }
    return Promise.reject(new Error(`unexpected apiFetch: ${method} ${path}`));
  });
}

const WRITE_BUTTON =
  /level up|edit|short rest|long rest|save|delete|award|roll|override|damage|heal|add|remove|equip|attune|prepare/i;

function buttonNames() {
  return screen
    .getAllByRole('button')
    .map(button => button.getAttribute('aria-label') ?? button.textContent);
}

function expectNoWriteControls() {
  expect(screen.queryByRole('button', { name: WRITE_BUTTON })).toBeNull();
  expect(screen.queryByRole('link', { name: /^edit$/i })).toBeNull();
  expect(screen.queryByTestId('character-history')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
}

function expectOnlyGetRequests() {
  const nonGet = mockApiFetch.mock.calls
    .filter(([, options]) => options?.method && options.method !== 'GET')
    .map(([path, options]) => `${options.method} ${path}`);
  expect(nonGet).toEqual([]);
}

async function renderSnapshot() {
  routeApiFetch();
  const user = userEvent.setup();
  renderWithQueryClient(<CharacterSnapshotPage />);
  await screen.findByTestId('snapshot-banner');
  // Let the campaign lookup settle so its link renders before the assertions.
  await screen.findByTestId('campaign-membership');
  return user;
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CharacterSnapshotPage read only (VEG-645)', () => {
  it('shows no write control on the Character tab', async () => {
    await renderSnapshot();

    expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Poisoned')).toBeInTheDocument();
    expect(screen.getByText('Arcane Recovery')).toBeInTheDocument();
    expectNoWriteControls();
    expect(buttonNames()).toEqual(['Play a copy', 'Show 2 options']);
  });

  it('shows no write control on the Spells & Details tab', async () => {
    const user = await renderSnapshot();

    await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));

    expect(screen.getByText('Ring of Protection')).toBeInTheDocument();
    expect(screen.getByText('Quarterstaff')).toBeInTheDocument();
    expectNoWriteControls();
    expect(buttonNames()).toEqual(['Play a copy', 'View Light details', 'View Fireball details']);
  });

  it('sends only GET requests when every rendered control is used', async () => {
    const user = await renderSnapshot();

    await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
    expect(screen.getByText('Agonizing Blast')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Play a copy', 'Hide options']);
    await user.click(screen.getByRole('button', { name: 'Hide options' }));

    await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));
    await user.click(screen.getByRole('button', { name: 'View Light details' }));
    const lightCard = screen.getByRole('dialog');
    expect(
      within(lightCard)
        .getAllByRole('button')
        .map(b => b.getAttribute('aria-label'))
    ).toEqual(['Close']);
    await user.click(within(lightCard).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'View Fireball details' }));
    const fireballCard = screen.getByRole('dialog');
    expect(await within(fireballCard).findByText(fireball.description)).toBeInTheDocument();
    await user.click(within(fireballCard).getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('tab', { name: 'Character' }));
    await screen.findByRole('button', { name: 'Show 2 options' });

    expect(mockApiFetch).toHaveBeenCalledWith('/srd/spells/sp-1');
    await waitFor(expectOnlyGetRequests);
    expectOnlyGetRequests();
  });
});
