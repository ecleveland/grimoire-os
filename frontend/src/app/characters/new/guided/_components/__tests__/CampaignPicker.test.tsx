import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CampaignPicker from '../CampaignPicker';
import type { CampaignListItem } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

function makeCampaign(over: Partial<CampaignListItem> = {}): CampaignListItem {
  return {
    id: 'camp-1',
    name: 'Curse of Strahd',
    ownerId: 'user-1',
    status: 'active',
    playerIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function renderPicker(props: { value?: string; onChange?: (id: string) => void } = {}) {
  const onChange = props.onChange ?? vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const utils = render(<CampaignPicker value={props.value ?? ''} onChange={onChange} />, {
    wrapper,
  });
  return { onChange, ...utils };
}

beforeEach(() => mockApiFetch.mockReset());

describe('CampaignPicker', () => {
  it('renders nothing while the campaign list is still loading', async () => {
    let resolve!: (value: { data: CampaignListItem[] }) => void;
    mockApiFetch.mockReturnValue(
      new Promise<{ data: CampaignListItem[] }>(r => {
        resolve = r;
      })
    );
    renderPicker();
    // Query still pending → no data → picker absent.
    expect(screen.queryByRole('combobox', { name: /campaign/i })).toBeNull();
    // Settle the query so it doesn't dangle into the next test's hooks.
    resolve({ data: [] });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  });

  it('renders nothing when the user has no campaigns', async () => {
    mockApiFetch.mockResolvedValue({ data: [] });
    renderPicker();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: /campaign/i })).toBeNull();
  });

  it('fetches the first page of campaigns capped at the backend limit', async () => {
    mockApiFetch.mockResolvedValue({ data: [makeCampaign()] });
    renderPicker();
    await screen.findByRole('combobox', { name: /campaign/i });
    expect(mockApiFetch).toHaveBeenCalledWith('/campaigns?page=1&limit=100');
  });

  it('lists the campaigns under a "None" default and fires onChange with the chosen id', async () => {
    mockApiFetch.mockResolvedValue({
      data: [
        makeCampaign({ id: 'camp-1', name: 'Strahd' }),
        makeCampaign({ id: 'camp-2', name: 'Phandelver' }),
      ],
    });
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    const select = await screen.findByRole('combobox', { name: /campaign/i });
    expect(within(select).getByRole('option', { name: 'None' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Strahd' })).toBeInTheDocument();

    await user.selectOptions(select, 'camp-2');
    expect(onChange).toHaveBeenCalledWith('camp-2');
  });

  it('reflects the controlled value', async () => {
    mockApiFetch.mockResolvedValue({ data: [makeCampaign({ id: 'camp-1', name: 'Strahd' })] });
    renderPicker({ value: 'camp-1' });
    const select = await screen.findByRole('combobox', { name: /campaign/i });
    expect(select).toHaveValue('camp-1');
  });
});
