import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewNpcPage from '../page';
import type { GeneratedNpcPreview, Npc } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
const mockPush = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'campaign-1' }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function buildPreview(over: Partial<GeneratedNpcPreview> = {}): GeneratedNpcPreview {
  return {
    campaignId: 'campaign-1',
    name: 'Old Maelin',
    race: 'Human',
    background: 'Folk Hero',
    profession: 'Peasant',
    alignment: 'Neutral Good',
    size: 'Medium',
    age: 42,
    gender: 'male',
    appearance: 'Worn boots, kind eyes.',
    personalityTraits: ['Friendly'],
    ideals: ['Honesty'],
    bonds: ['Loves the village'],
    flaws: ['Stubborn'],
    statBlock: null,
    goldPieces: 1,
    silverPieces: 5,
    copperPieces: 12,
    loot: [],
    lootOverrides: null,
    generationParams: { version: 1, seed: 'abc', constraints: {}, decisions: {} },
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
});

describe('NewNpcPage', () => {
  it('renders the heading and constraints form', () => {
    render(<NewNpcPage />);
    expect(screen.getByRole('heading', { name: /generate npc/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/race/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profession/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alignment/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/setting/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hostility/i)).toBeInTheDocument();
  });

  it('shows free-text profession input when "Other" is selected', async () => {
    const user = userEvent.setup();
    render(<NewNpcPage />);
    await user.selectOptions(screen.getByLabelText(/profession/i), '__other__');
    expect(screen.getByLabelText(/custom profession/i)).toBeInTheDocument();
  });

  it('calls POST /npcs/generate with constraints when "Generate Preview" clicked', async () => {
    mockApiFetch.mockResolvedValue(buildPreview());
    const user = userEvent.setup();
    render(<NewNpcPage />);
    await user.selectOptions(screen.getByLabelText(/race/i), 'Human');
    await user.selectOptions(screen.getByLabelText(/profession/i), 'Peasant');
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/npcs/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"campaignId":"campaign-1"'),
      })
    );
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.race).toBe('Human');
    expect(body.profession).toBe('Peasant');
  });

  it('renders preview after generation, then saves on Save', async () => {
    mockApiFetch.mockResolvedValueOnce(buildPreview({ name: 'Old Maelin' }));
    mockApiFetch.mockResolvedValueOnce({
      id: 'new-id',
      campaignId: 'campaign-1',
      createdById: 'u',
      name: 'Old Maelin',
      race: 'Human',
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      goldPieces: 0,
      silverPieces: 0,
      copperPieces: 0,
      lockedFields: [],
      isManual: false,
      createdAt: '',
      updatedAt: '',
    } as Npc);
    const user = userEvent.setup();
    render(<NewNpcPage />);
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs/new-id');
  });

  it('switches to manual create mode', async () => {
    const user = userEvent.setup();
    render(<NewNpcPage />);
    await user.click(screen.getByRole('button', { name: /create manually/i }));
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  it('manual create posts to /npcs with isManual:true', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'manual-id',
      campaignId: 'campaign-1',
      createdById: 'u',
      name: 'Manual NPC',
      race: 'Human',
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      goldPieces: 0,
      silverPieces: 0,
      copperPieces: 0,
      lockedFields: [],
      isManual: true,
      createdAt: '',
      updatedAt: '',
    } as Npc);
    const user = userEvent.setup();
    render(<NewNpcPage />);
    await user.click(screen.getByRole('button', { name: /create manually/i }));
    await user.type(screen.getByLabelText(/^name/i), 'Manual NPC');
    await user.selectOptions(screen.getByLabelText(/^race/i), 'Human');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.name).toBe('Manual NPC');
    expect(body.race).toBe('Human');
    expect(body.isManual).toBe(true);
  });
});
