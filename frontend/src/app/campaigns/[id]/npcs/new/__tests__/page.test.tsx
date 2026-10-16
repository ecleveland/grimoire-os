import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiQueryKey } from '@/lib/query';
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

function renderPage() {
  // Fresh QueryClient per render with retries off so error states settle
  // immediately and no cache bleeds between tests.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <NewNpcPage />
    </QueryClientProvider>
  );
  return { ...result, client };
}

function makeSavedNpc(id: string): Npc {
  return {
    id,
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
  };
}

/**
 * Seeds a cached NPC list page and records whether it was already invalidated
 * when the page navigated, so a test can check the list is refreshed first.
 */
function trackListInvalidationAtPush(client: QueryClient) {
  const listKey = apiQueryKey('/npcs?campaignId=campaign-1&limit=20&page=1');
  client.setQueryData(listKey, { data: [], total: 0, page: 1, lastPage: 1 });
  const seen: { invalidated?: boolean } = {};
  mockPush.mockImplementation(() => {
    seen.invalidated = client.getQueryState(listKey)?.isInvalidated;
  });
  return seen;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
});

describe('NewNpcPage', () => {
  it('renders the heading and constraints form', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /generate npc/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/race/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profession/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alignment/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/setting/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hostility/i)).toBeInTheDocument();
  });

  it('shows free-text profession input when "Other" is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText(/profession/i), '__other__');
    expect(screen.getByLabelText(/custom profession/i)).toBeInTheDocument();
  });

  it('calls POST /npcs/generate with constraints when "Generate Preview" clicked', async () => {
    mockApiFetch.mockResolvedValue(buildPreview());
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
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

  it('leaves zero denominations out of the preview coinage', async () => {
    mockApiFetch.mockResolvedValueOnce(
      buildPreview({ goldPieces: 0, silverPieces: 4, copperPieces: 0 })
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    expect(await screen.findByText('4 sp')).toBeInTheDocument();
  });

  it('switches to manual create mode', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /create manually/i }));
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument();
  });

  it('passes combatRelevant: true when the toggle is checked', async () => {
    mockApiFetch.mockResolvedValue(buildPreview());
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByLabelText(/combat-relevant/i));
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.combatRelevant).toBe(true);
  });

  it('renders the stat block card in the preview when one is present', async () => {
    mockApiFetch.mockResolvedValueOnce(
      buildPreview({
        name: 'Karda Steelhand',
        statBlock: {
          baseMonster: 'Guard',
          name: 'Karda Steelhand',
          size: 'Medium',
          type: 'humanoid',
          alignment: 'Lawful Neutral',
          armorClass: 16,
          hitPoints: 11,
          speed: '30 ft.',
          str: 13,
          dex: 12,
          con: 12,
          int: 10,
          wis: 11,
          cha: 10,
          challengeRating: 0.125,
          actions: [{ name: 'Spear', description: 'Hit: 4 piercing damage.' }],
        },
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
    expect(screen.getByText(/Based on Guard/i)).toBeInTheDocument();
  });

  it('invalidates the cached NPC lists before navigating to a saved preview', async () => {
    mockApiFetch.mockResolvedValueOnce(buildPreview({ name: 'Old Maelin' }));
    mockApiFetch.mockResolvedValueOnce(makeSavedNpc('new-id'));
    const user = userEvent.setup();
    const { client } = renderPage();
    const seen = trackListInvalidationAtPush(client);
    await user.click(screen.getByRole('button', { name: /generate preview/i }));
    await screen.findByText('Old Maelin');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs/new-id'));
    expect(seen.invalidated).toBe(true);
  });

  it('invalidates the cached NPC lists before navigating to a manual NPC', async () => {
    mockApiFetch.mockResolvedValueOnce(makeSavedNpc('manual-id'));
    const user = userEvent.setup();
    const { client } = renderPage();
    const seen = trackListInvalidationAtPush(client);
    await user.click(screen.getByRole('button', { name: /create manually/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Manual NPC' } });
    await user.selectOptions(screen.getByLabelText(/^race/i), 'Human');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs/manual-id')
    );
    expect(seen.invalidated).toBe(true);
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
    renderPage();
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
