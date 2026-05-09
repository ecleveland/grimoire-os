import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditNpcPage from '../page';
import type { Npc } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
const mockPush = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'campaign-1', npcId: 'npc-1' }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc-1',
    campaignId: 'campaign-1',
    createdById: 'user-1',
    name: 'Old Maelin',
    race: 'Human',
    background: 'Folk Hero',
    profession: 'Peasant',
    alignment: 'Neutral Good',
    size: null,
    age: 42,
    gender: 'male',
    appearance: 'Worn boots',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    statBlock: null,
    goldPieces: 1,
    silverPieces: 5,
    copperPieces: 12,
    loot: null,
    lootOverrides: { trinketChance: 25 },
    generationParams: null,
    lockedFields: [],
    isManual: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
});

describe('EditNpcPage', () => {
  it('loads existing NPC and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(makeNpc());
    render(<EditNpcPage />);
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Old Maelin');
    });
    const raceInput = screen.getByLabelText(/^race/i) as HTMLSelectElement;
    expect(raceInput.value).toBe('Human');
    const bgInput = screen.getByLabelText(/^background/i) as HTMLInputElement;
    expect(bgInput.value).toBe('Folk Hero');
  });

  it('PATCHes the NPC with edited values on Save', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc());
    mockApiFetch.mockResolvedValueOnce(makeNpc({ name: 'New Name' }));
    render(<EditNpcPage />);
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Old Maelin');
    });
    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse((mockApiFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body.name).toBe('New Name');
    expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs/npc-1');
  });

  it('reads and persists existing lootOverrides', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lootOverrides: { trinketChance: 25 } }));
    mockApiFetch.mockResolvedValueOnce(makeNpc());
    render(<EditNpcPage />);
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Old Maelin');
    });
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    const slider = screen.getByLabelText('Trinket Chance (%)') as HTMLInputElement;
    expect(slider.value).toBe('25');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse((mockApiFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body.lootOverrides).toEqual({ trinketChance: 25 });
  });
});
