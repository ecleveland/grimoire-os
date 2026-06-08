import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EncounterPicker from '@/components/EncounterPicker';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

const onSelect = vi.fn();
const onCancel = vi.fn();

function page<T>(data: T[]) {
  return { data, total: data.length, page: 1, lastPage: 1, limit: 100 };
}

const CAMPAIGNS = [
  { id: 'camp-1', name: 'Curse of Strahd' },
  { id: 'camp-2', name: 'Lost Mines' },
];
const ENCOUNTERS = [
  { id: 'enc-1', name: 'Death House' },
  { id: 'enc-2', name: 'Village Ambush' },
];

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  onSelect.mockReset();
  onCancel.mockReset();
});

function routeApi(encounters: typeof ENCOUNTERS = ENCOUNTERS, campaigns = CAMPAIGNS) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/campaigns')) return Promise.resolve(page(campaigns));
    if (path.startsWith('/encounters')) return Promise.resolve(page(encounters));
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

describe('EncounterPicker', () => {
  it('loads campaigns on mount and lists them', async () => {
    routeApi();
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/campaigns?page=1&limit=100'));
    expect(screen.getByRole('option', { name: /curse of strahd/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /lost mines/i })).toBeInTheDocument();
  });

  it('fetches encounters for the selected campaign', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await screen.findByRole('option', { name: /curse of strahd/i });

    await user.selectOptions(screen.getByLabelText(/campaign/i), 'camp-2');
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/encounters?campaignId=camp-2&page=1&limit=100')
    );
    expect(await screen.findByRole('option', { name: /death house/i })).toBeInTheDocument();
  });

  it('keeps Continue disabled until an encounter is chosen, then emits its id', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await screen.findByRole('option', { name: /curse of strahd/i });
    await user.selectOptions(screen.getByLabelText(/campaign/i), 'camp-1');
    await screen.findByRole('option', { name: /death house/i });

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/encounter/i), 'enc-2');
    expect(continueBtn).toBeEnabled();
    await user.click(continueBtn);
    expect(onSelect).toHaveBeenCalledWith('enc-2');
  });

  it('shows an empty state when the user has no campaigns', async () => {
    routeApi(ENCOUNTERS, []);
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    expect(await screen.findByText(/no campaigns/i)).toBeInTheDocument();
  });

  it('shows an empty state when the selected campaign has no encounters', async () => {
    routeApi([]);
    const user = userEvent.setup();
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await screen.findByRole('option', { name: /curse of strahd/i });
    await user.selectOptions(screen.getByLabelText(/campaign/i), 'camp-1');
    expect(await screen.findByText(/no encounters/i)).toBeInTheDocument();
  });

  it('toasts when the campaign fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load campaigns'));
  });

  it('cancels without selecting', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<EncounterPicker onSelect={onSelect} onCancel={onCancel} />);
    await screen.findByRole('option', { name: /curse of strahd/i });
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
