import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import EquipmentStep from '../EquipmentStep';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import type { SrdBackground, SrdClass } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const FIGHTER: SrdClass = {
  id: 'fighter',
  name: 'Fighter',
  hitDie: 'd10',
  primaryAbilities: ['Strength'],
  savingThrows: ['Strength', 'Constitution'],
  armorProficiencies: ['All armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  skillChoices: ['Athletics', 'Perception'],
  toolProficiencies: [],
  numSkillChoices: 2,
  features: [],
  subclassLevel: 3,
  source: 'SRD',
  equipmentChoices: {
    choices: [
      {
        choose: 1,
        from: [
          { items: [{ name: 'Chain mail', quantity: 1 }] },
          {
            items: [
              { name: 'Leather armor', quantity: 1 },
              { name: 'Longbow', quantity: 1 },
              { name: 'Arrow', quantity: 20 },
            ],
          },
        ],
      },
    ],
    guaranteed: [{ name: "Explorer's pack", quantity: 1 }],
    startingGold: '5d4 x 10 gp',
  },
};

// A class with a choose-2 group, to exercise the choose-count cap.
const RANGER: SrdClass = {
  ...FIGHTER,
  id: 'ranger',
  name: 'Ranger',
  equipmentChoices: {
    choices: [
      {
        choose: 2,
        from: [
          { items: [{ name: 'Shortsword', quantity: 1 }] },
          { items: [{ name: 'Handaxe', quantity: 1 }] },
          { items: [{ name: 'Dagger', quantity: 1 }] },
        ],
      },
    ],
  },
};

const ACOLYTE: SrdBackground = {
  id: 'acolyte',
  name: 'Acolyte',
  skillProficiencies: ['Insight', 'Religion'],
  contentSource: 'srd',
  toolProficiencies: [],
  languages: 2,
  equipment: 'Choose A or B: (A) Holy Symbol, Book (prayers), 8 GP; or (B) 50 GP',
  personalityTraits: [],
  ideals: [],
  bonds: [],
  flaws: [],
  source: 'SRD',
};

function routeApiFetch(classes: SrdClass[], backgrounds: SrdBackground[] = []) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/classes') return Promise.resolve(classes);
    if (path === '/srd/backgrounds') return Promise.resolve(backgrounds);
    return Promise.resolve([]);
  });
}

function Harness({ initial }: { initial?: Partial<CharacterFormValues> }) {
  const [draft, setDraft] = useState<CharacterFormValues>(() => ({
    ...emptyCharacterFormValues(),
    ...initial,
  }));
  return (
    <>
      <EquipmentStep value={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))} />
      <div data-testid="draft-inventory">
        {draft.inventory.map(i => `${i.name}:${i.quantity}`).join(',')}
      </div>
      <div data-testid="draft-gp">{draft.currency.gp}</div>
    </>
  );
}

function renderStep(initial?: Partial<CharacterFormValues>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness initial={initial} />, { wrapper });
}

const inventory = () => screen.getByTestId('draft-inventory').textContent;
const gp = () => screen.getByTestId('draft-gp').textContent;

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('EquipmentStep — starting equipment vs gold', () => {
  it('always writes the guaranteed items into the draft once class data loads', async () => {
    routeApiFetch([FIGHTER]);
    renderStep({ class: 'Fighter' });
    await waitFor(() => expect(inventory()).toBe("Explorer's pack:1"));
    expect(gp()).toBe('0');
  });

  it('resolving a choice group adds the picked bundle to inventory', async () => {
    routeApiFetch([FIGHTER]);
    const user = userEvent.setup();
    renderStep({ class: 'Fighter' });
    await screen.findByRole('radio', { name: /chain mail/i });

    await user.click(screen.getByRole('radio', { name: /leather armor/i }));
    await waitFor(() =>
      expect(inventory()).toBe("Explorer's pack:1,Leather armor:1,Longbow:1,Arrow:20")
    );

    // Choose-1 group: switching the pick replaces the previous bundle.
    await user.click(screen.getByRole('radio', { name: /chain mail/i }));
    await waitFor(() => expect(inventory()).toBe("Explorer's pack:1,Chain mail:1"));
  });

  it('enforces the choose count for a multi-pick group', async () => {
    routeApiFetch([RANGER]);
    const user = userEvent.setup();
    renderStep({ class: 'Ranger' });
    await screen.findByRole('checkbox', { name: /shortsword/i });

    // Ranger has no startingGold, so the gold alternative isn't offered.
    expect(screen.queryByRole('radio', { name: /take starting gold/i })).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /shortsword/i }));
    await user.click(screen.getByRole('checkbox', { name: /handaxe/i }));
    await waitFor(() => expect(inventory()).toBe('Shortsword:1,Handaxe:1'));

    // A third pick is rejected — the group only allows two.
    const dagger = screen.getByRole('checkbox', { name: /dagger/i });
    await user.click(dagger);
    expect(dagger).not.toBeChecked();
    expect(inventory()).toBe('Shortsword:1,Handaxe:1');

    // Un-checking a pick frees a slot and drops the item.
    await user.click(screen.getByRole('checkbox', { name: /handaxe/i }));
    await waitFor(() => expect(inventory()).toBe('Shortsword:1'));
    await user.click(dagger);
    expect(dagger).toBeChecked();
    await waitFor(() => expect(inventory()).toBe('Shortsword:1,Dagger:1'));
  });

  it('shows a fallback and writes nothing when the class has no equipment data', async () => {
    const noEquip: SrdClass = { ...FIGHTER, id: 'monk', name: 'Monk', equipmentChoices: undefined };
    routeApiFetch([noEquip]);
    renderStep({ class: 'Monk' });
    await waitFor(() =>
      expect(screen.getByText(/no starting-equipment data/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('radio', { name: /take starting equipment/i })).toBeNull();
    expect(inventory()).toBe('');
    expect(gp()).toBe('0');
  });

  it('switching to the gold alternative clears class items and fills currency', async () => {
    routeApiFetch([FIGHTER]);
    const user = userEvent.setup();
    renderStep({ class: 'Fighter' });
    await screen.findByRole('radio', { name: /chain mail/i });
    await user.click(screen.getByRole('radio', { name: /chain mail/i }));
    await waitFor(() => expect(inventory()).toBe("Explorer's pack:1,Chain mail:1"));

    await user.click(screen.getByRole('radio', { name: /take starting gold/i }));
    await waitFor(() => expect(gp()).toBe('125')); // 5d4 x 10 average
    expect(inventory()).toBe('');
  });

  it('background option A adds its items + gold; option B adds only gold', async () => {
    routeApiFetch([FIGHTER], [ACOLYTE]);
    const user = userEvent.setup();
    renderStep({ class: 'Fighter', background: 'Acolyte' });
    // Default background option is A.
    await waitFor(() =>
      expect(inventory()).toBe("Explorer's pack:1,Holy Symbol:1,Book (prayers):1")
    );
    expect(gp()).toBe('8');

    await user.click(screen.getByRole('radio', { name: /50 gp/i }));
    await waitFor(() => expect(gp()).toBe('50'));
    expect(inventory()).toBe("Explorer's pack:1");
  });

  it('resolves a duplicate-named background by id, using the picked equipment (VEG-473)', async () => {
    // A homebrew "Acolyte" shares the SRD name but grants different equipment, and
    // sorts first — the ordering that made name-based resolution pick the wrong one.
    const homebrew: SrdBackground = {
      ...ACOLYTE,
      id: 'bg-hb',
      contentSource: 'homebrew',
      equipment: 'Choose A or B: (A) Grave Shovel, 3 GP; or (B) 100 GP',
    };
    routeApiFetch([FIGHTER], [homebrew, ACOLYTE]);
    // The Origin step wrote the homebrew id into the draft; equipment must follow it.
    renderStep({ class: 'Fighter', background: 'Acolyte', backgroundId: 'bg-hb' });

    await waitFor(() => expect(inventory()).toBe("Explorer's pack:1,Grave Shovel:1"));
    expect(gp()).toBe('3');
    // The SRD Acolyte's equipment (Holy Symbol / 8 gp) is not what resolved.
    expect(inventory()).not.toContain('Holy Symbol');
  });

  it('falls back to name resolution when no background id is set (VEG-473)', async () => {
    // A character loaded from the API carries the name but no id; a single match
    // still resolves so equipment keeps working.
    routeApiFetch([FIGHTER], [ACOLYTE]);
    renderStep({ class: 'Fighter', background: 'Acolyte', backgroundId: '' });
    await waitFor(() =>
      expect(inventory()).toBe("Explorer's pack:1,Holy Symbol:1,Book (prayers):1")
    );
    expect(gp()).toBe('8');
  });

  it('shows the background equipment verbatim when it is not a parseable A/B choice', async () => {
    const freeform: SrdBackground = {
      ...ACOLYTE,
      name: 'Hermit',
      equipment: 'A scroll case stuffed full of notes, a winter blanket, and 5 gp',
    };
    routeApiFetch([FIGHTER], [freeform]);
    renderStep({ class: 'Fighter', background: 'Hermit' });
    await waitFor(() =>
      expect(screen.getByText(/scroll case stuffed full of notes/i)).toBeInTheDocument()
    );
    // No background coin is auto-added; only class guaranteed items resolve.
    expect(gp()).toBe('0');
    expect(inventory()).toBe("Explorer's pack:1");
  });
});
