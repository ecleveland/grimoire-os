import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayCopyDialog from '../PlayCopyDialog';
import { takeCopiedFrom } from '../copied-from';
import { apiQueryKey } from '@/lib/query';
import type { CampaignListItem, Character, PaginatedResponse } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';
import { renderWithQueryClient } from '@/test-utils/query';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockPush = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const CAMPAIGNS_PATH = '/campaigns?page=1&limit=100';
const COPY_PATH = '/characters/char-1/snapshots/snap-1/copy';

function makeCampaign(id: string, name: string): CampaignListItem {
  return {
    id,
    name,
    ownerId: 'user-1',
    status: 'active',
    playerIds: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}

const campaigns: PaginatedResponse<CampaignListItem> = {
  data: [makeCampaign('camp-1', 'Curse of the Crimson Moon'), makeCampaign('camp-2', 'Saltmarsh')],
  total: 2,
  page: 1,
  lastPage: 1,
};

const created: Character = makeCharacter({ id: 'char-9', name: 'Vex (level 5)', level: 5 });

interface Routes {
  campaigns?: () => Promise<PaginatedResponse<CampaignListItem>>;
  copy?: () => Promise<Character>;
}

// Route the shared apiFetch mock: the campaign list GET and the copy POST.
// Anything else rejects so a stray request shows up in the failure.
function routeApiFetch({ campaigns: list = () => Promise.resolve(campaigns), copy }: Routes = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    const method = options?.method ?? 'GET';
    if (path === CAMPAIGNS_PATH && method === 'GET') return list();
    if (path === COPY_PATH && method === 'POST' && copy) return copy();
    return Promise.reject(new Error(`unexpected apiFetch: ${method} ${path}`));
  });
}

const onClose = vi.fn();

function renderDialog() {
  return renderWithQueryClient(
    <PlayCopyDialog
      characterId="char-1"
      characterName="Vex"
      snapshot={{ id: 'snap-1', level: 5 }}
      onClose={onClose}
    />
  );
}

function dialog() {
  return screen.getByTestId('play-copy-dialog');
}

async function campaignsLoaded() {
  await waitFor(() => expect(within(dialog()).getByLabelText('Campaign')).toBeEnabled());
}

function postCalls() {
  return mockApiFetch.mock.calls.filter(([, options]) => options?.method === 'POST');
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockPush.mockReset();
  onClose.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('PlayCopyDialog (VEG-646)', () => {
  it('prefills the name with the character and level and explains the copy', async () => {
    routeApiFetch();
    renderDialog();

    expect(within(dialog()).getByRole('heading', { name: 'Play a copy' })).toBeVisible();
    expect(
      within(dialog()).getByText(
        'A fresh character at level 5. Hit points, slots and resources start full. The original is untouched.'
      )
    ).toBeVisible();
    const name = within(dialog()).getByLabelText('Name');
    expect(name).toHaveValue('Vex (level 5)');
    expect(name).toHaveAttribute('maxLength', '100');
    await campaignsLoaded();
  });

  it('lists the caller campaigns after No campaign', async () => {
    routeApiFetch();
    renderDialog();
    await campaignsLoaded();

    const options = within(within(dialog()).getByLabelText('Campaign')).getAllByRole('option');
    expect(options.map(option => [option.getAttribute('value'), option.textContent])).toEqual([
      ['', 'No campaign'],
      ['camp-1', 'Curse of the Crimson Moon'],
      ['camp-2', 'Saltmarsh'],
    ]);
    expect(within(dialog()).getByLabelText('Campaign')).toHaveValue('');
    expect(mockApiFetch).toHaveBeenCalledWith(CAMPAIGNS_PATH);
  });

  it('disables the campaign select while the list is loading', () => {
    routeApiFetch({ campaigns: () => new Promise(() => {}) });
    renderDialog();

    const select = within(dialog()).getByLabelText('Campaign');
    expect(select).toBeDisabled();
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['No campaign']);
  });

  it('toasts and keeps No campaign when the campaign list fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch({ campaigns: () => Promise.reject(new Error('boom')) });
    renderDialog();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to load your campaigns')
    );
    expect(
      within(within(dialog()).getByLabelText('Campaign'))
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['No campaign']);
  });

  it('posts an empty body when the name is blank and no campaign is picked', async () => {
    routeApiFetch({ copy: () => Promise.resolve(created) });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: '   ' } });
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(COPY_PATH, { method: 'POST', body: '{}' })
    );
  });

  it('posts the trimmed name and the picked campaign', async () => {
    routeApiFetch({ copy: () => Promise.resolve(created) });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    fireEvent.change(within(dialog()).getByLabelText('Name'), {
      target: { value: '  Vex the second  ' },
    });
    await user.selectOptions(within(dialog()).getByLabelText('Campaign'), 'camp-2');
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(COPY_PATH, {
        method: 'POST',
        body: JSON.stringify({ name: 'Vex the second', campaignId: 'camp-2' }),
      })
    );
  });

  it('posts the prefilled name when the owner submits it unchanged', async () => {
    routeApiFetch({ copy: () => Promise.resolve(created) });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(COPY_PATH, {
        method: 'POST',
        body: JSON.stringify({ name: 'Vex (level 5)' }),
      })
    );
  });

  it('toasts, notes the origin, refreshes the character list, closes and opens the copy', async () => {
    routeApiFetch({ copy: () => Promise.resolve(created) });
    const user = userEvent.setup();
    const { client } = renderDialog();
    client.setQueryData(apiQueryKey('/characters?page=1'), { data: [] });
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-9'));
    expect(mockToastSuccess).toHaveBeenCalledWith('Created Vex (level 5)');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(apiQueryKey('/characters?page=1'))?.isInvalidated).toBe(true);
    expect(takeCopiedFrom('char-9')).toEqual({ name: 'Vex', level: 5 });
  });

  it('disables Create while the copy is in flight', async () => {
    routeApiFetch({ copy: () => new Promise(() => {}) });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(within(dialog()).getByRole('button', { name: 'Create' })).toBeDisabled()
    );
    expect(postCalls()).toHaveLength(1);
  });

  it('toasts the backend message on an Error rejection and stays open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch({ copy: () => Promise.reject(new Error('Campaign not found')) });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Campaign not found'));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('falls back to a generic toast on a non-Error rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch({ copy: () => Promise.reject('boom') });
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to create the copy'));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls onClose on Cancel without posting', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderDialog();
    await campaignsLoaded();

    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(postCalls()).toEqual([]);
  });
});
