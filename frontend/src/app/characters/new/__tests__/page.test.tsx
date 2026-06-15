import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import NewCharacterPage from '../page';
import type { CampaignListItem, Character, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockPush = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function makeTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage(client: QueryClient = makeTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<NewCharacterPage />, { wrapper });
}

function makeCampaign(over: Partial<CampaignListItem> = {}): CampaignListItem {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: undefined,
    ownerId: 'user-1',
    status: 'active',
    playerIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function campaignsResponse(items: CampaignListItem[]): PaginatedResponse<CampaignListItem> {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

// The campaigns-list GET populates the picker; the POST creates the character.
// The editor also pulls SRD catalogs for its pickers — route those to [].
function routeApiFetch(campaigns: CampaignListItem[], created: Partial<Character> = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.startsWith('/srd/')) return Promise.resolve([]);
    if (path.startsWith('/campaigns?')) return Promise.resolve(campaignsResponse(campaigns));
    if (options?.method === 'POST')
      return Promise.resolve({ id: 'char-new', ...created } as Character);
    return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
  });
}

function lastPostBody(): Record<string, unknown> {
  const call = mockApiFetch.mock.calls.find(
    ([, opts]) => (opts as { method?: string } | undefined)?.method === 'POST'
  );
  return JSON.parse((call![1] as { body: string }).body);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockPush.mockReset();
});

describe('NewCharacterPage — campaign picker', () => {
  it('populates the picker with the caller’s campaigns', async () => {
    routeApiFetch([
      makeCampaign({ id: 'camp-1', name: 'The Lost Mines' }),
      makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' }),
    ]);
    renderPage();

    expect(await screen.findByRole('option', { name: 'The Lost Mines' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Curse of Strahd' })).toBeInTheDocument();
    // "None" also appears in the Spellcasting Ability select, so scope to the
    // campaign picker.
    expect(
      within(screen.getByLabelText('Campaign')).getByRole('option', { name: 'None' })
    ).toBeInTheDocument();
  });

  it('hides the picker entirely when the user has no campaigns', async () => {
    routeApiFetch([]);
    renderPage();
    // Wait for the campaigns query to settle, then assert no Campaign select.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByLabelText('Campaign')).toBeNull();
  });

  it('includes the selected campaignId in the create request', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' })]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Curse of Strahd' });
    await user.type(screen.getByLabelText(/name/i), 'Mialee');
    await user.selectOptions(screen.getByLabelText('Campaign'), 'camp-2');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
    expect(lastPostBody()).toMatchObject({ name: 'Mialee', campaignId: 'camp-2' });
  });

  it('omits campaignId when "None" is left selected', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-1', name: 'The Lost Mines' })]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'The Lost Mines' });
    await user.type(screen.getByLabelText(/name/i), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
    expect(lastPostBody()).not.toHaveProperty('campaignId');
  });

  it('includes the new slice-1 fields (size, initiative, hit dice) in the create request', async () => {
    routeApiFetch([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/name/i), 'Mialee');
    await user.selectOptions(screen.getByLabelText(/^size/i), 'Small');
    await user.selectOptions(screen.getByLabelText(/hit die$/i), 'd6');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
    expect(lastPostBody()).toMatchObject({
      name: 'Mialee',
      size: 'Small',
      initiative: 0,
      hitDice: { dieType: 'd6', total: 1, spent: 0 },
      hitPoints: { max: 10, current: 10, temporary: 0 },
    });
  });

  it('toasts an error and stays on the page when creation fails', async () => {
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/srd/')) return Promise.resolve([]);
      if (path.startsWith('/campaigns?'))
        return Promise.resolve(campaignsResponse([makeCampaign()]));
      if (options?.method === 'POST') return Promise.reject(new Error('Name is required'));
      return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'The Lost Mines' });
    await user.type(screen.getByLabelText(/name/i), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Name is required'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
