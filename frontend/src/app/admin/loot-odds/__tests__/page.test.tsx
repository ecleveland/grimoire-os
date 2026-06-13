import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLootOddsPage from '../page';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/admin/loot-odds',
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const RULES = {
  trinketChance: 0.05,
  magicItemChanceByCr: { '0': 0.001, '0–1': 0.005, '2–4': 0.02, '5–10': 0.05, '11+': 0.15 },
  itemCountDie: '1d3',
  coinageMultiplier: 1,
};

// GET returns the current rules; PATCH echoes its body back as the saved rules.
function routeApi(rules: object = RULES) {
  mockApiFetch.mockImplementation((_path: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'PATCH') return Promise.resolve(JSON.parse(init.body!));
    return Promise.resolve(rules);
  });
}

function lastPatchBody() {
  const call = mockApiFetch.mock.calls.find(c => c[1]?.method === 'PATCH');
  return call ? JSON.parse(call[1].body) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('AdminLootOddsPage', () => {
  it('redirects non-admin users', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    render(<AdminLootOddsPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('loads current values as percentages', async () => {
    routeApi();
    render(<AdminLootOddsPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/loot-odds'));

    expect((await screen.findByLabelText(/Trinket Chance/)) as HTMLInputElement).toHaveValue(5);
    expect(screen.getByLabelText('Item Count Die')).toHaveValue('1d3');
    expect(screen.getByLabelText('Coinage Multiplier')).toHaveValue(1);
    // Fractions become percentages: 0.001 → 0.1%, 0.15 → 15%.
    expect(screen.getByLabelText('CR 0')).toHaveValue(0.1);
    expect(screen.getByLabelText('CR 11+')).toHaveValue(15);
  });

  it('surfaces a load failure as a toast', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValue(new Error('nope'));
    render(<AdminLootOddsPage />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
  });

  it('saves edited values back as fractions', async () => {
    routeApi();
    const { toast } = await import('sonner');
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    fireEvent.change(screen.getByLabelText(/Trinket Chance/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('CR 2–4'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Item Count Die'), { target: { value: '2d6' } });
    fireEvent.change(screen.getByLabelText('Coinage Multiplier'), { target: { value: '2' } });

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admin/loot-odds',
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    expect(lastPatchBody()).toEqual({
      trinketChance: 0.1,
      magicItemChanceByCr: { '0': 0.001, '0–1': 0.005, '2–4': 0.03, '5–10': 0.05, '11+': 0.15 },
      itemCountDie: '2d6',
      coinageMultiplier: 2,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Loot odds saved'));
  });

  it('round-trips chances through percent↔fraction without float noise', async () => {
    // 0.07 → 7% cleanly, but 7 / 100 and 0.07 * 100 both produce float noise
    // (0.0699…/7.000…1) without the round() helper.
    routeApi({ ...RULES, trinketChance: 0.07 });
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    expect(screen.getByLabelText(/Trinket Chance/)).toHaveValue(7);

    fireEvent.change(screen.getByLabelText('CR 2–4'), { target: { value: '2.9' } });
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(lastPatchBody()).toBeDefined());
    const body = lastPatchBody();
    expect(body.trinketChance).toBe(0.07);
    // Exact, not 0.028999999999999998.
    expect(body.magicItemChanceByCr['2–4']).toBe(0.029);
  });

  it('rejects an out-of-range magic chance for a specific CR bucket', async () => {
    routeApi();
    const { toast } = await import('sonner');
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    fireEvent.change(screen.getByLabelText('CR 0'), { target: { value: '150' } });
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(toast.error).toHaveBeenCalledWith(
      'Magic item chance for CR 0 must be between 0 and 100%'
    );
    expect(lastPatchBody()).toBeUndefined();
  });

  it('rejects an implausibly large coinage multiplier before calling the API', async () => {
    routeApi();
    const { toast } = await import('sonner');
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    fireEvent.change(screen.getByLabelText('Coinage Multiplier'), { target: { value: '150' } });
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(toast.error).toHaveBeenCalledWith('Coinage multiplier must be between 0 and 100');
    expect(lastPatchBody()).toBeUndefined();
  });

  it('rejects a malformed die spec before calling the API', async () => {
    routeApi();
    const { toast } = await import('sonner');
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    fireEvent.change(screen.getByLabelText('Item Count Die'), { target: { value: '1x3' } });
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(toast.error).toHaveBeenCalledWith('Item count die must be a die spec like "1d3"');
    expect(lastPatchBody()).toBeUndefined();
  });

  it('rejects an out-of-range trinket chance before calling the API', async () => {
    routeApi();
    const { toast } = await import('sonner');
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    fireEvent.change(screen.getByLabelText(/Trinket Chance/), { target: { value: '150' } });
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(toast.error).toHaveBeenCalledWith('Trinket chance must be between 0 and 100%');
    expect(lastPatchBody()).toBeUndefined();
  });

  it('surfaces a save failure as a toast', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.reject(new Error('Validation failed'));
      return Promise.resolve(RULES);
    });
    render(<AdminLootOddsPage />);
    await screen.findByDisplayValue('1d3');

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Validation failed'));
  });
});
