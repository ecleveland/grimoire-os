import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdSpellSearch from '../SrdSpellSearch';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const fireball = { id: 'spell-1', name: 'Fireball', level: 3, school: 'Evocation' };
const fireBolt = { id: 'spell-2', name: 'Fire Bolt', level: 0, school: 'Evocation' };

function makeResponse(items: object[]) {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

function setup() {
  const onSelect = vi.fn();
  render(<SrdSpellSearch onSelect={onSelect} />);
  return { onSelect };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('SrdSpellSearch', () => {
  it('does not fetch while the input is empty', () => {
    setup();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('debounces the input into a single GET /srd/spells request carrying the query', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([fireball]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the spell catalog/i), 'fire');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/spells?')
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain('q=fire');
    });
    expect(
      mockApiFetch.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/spells?')
      )
    ).toHaveLength(1);
  });

  it('fires onSelect with the chosen spell and shows level/school, then clears', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([fireball, fireBolt]));
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.type(screen.getByLabelText(/search the spell catalog/i), 'fire');
    const fireballBtn = await screen.findByRole('button', { name: /add fireball/i });
    expect(fireballBtn).toHaveTextContent('Evocation');
    await user.click(fireballBtn);

    expect(onSelect).toHaveBeenCalledWith(fireball);
    expect(screen.getByLabelText(/search the spell catalog/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: /add fire bolt/i })).toBeNull();
  });

  it('labels a level-0 result as a cantrip', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([fireBolt]));
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/search the spell catalog/i), 'fire');
    const btn = await screen.findByRole('button', { name: /add fire bolt/i });
    expect(btn).toHaveTextContent(/cantrip/i);
  });

  it('shows a no-matches message when the search returns nothing', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/search the spell catalog/i), 'zzz');
    expect(await screen.findByText(/no matching spells/i)).toBeInTheDocument();
  });

  it('surfaces the server error message and clears stale results on failure', async () => {
    const { toast } = await import('sonner');
    mockApiFetch
      .mockResolvedValueOnce(makeResponse([fireball]))
      .mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the spell catalog/i), 'fire');
    await screen.findByRole('button', { name: /add fireball/i });
    await user.type(screen.getByLabelText(/search the spell catalog/i), 'ball');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    expect(screen.queryByRole('button', { name: /add fireball/i })).toBeNull();
  });

  it('disables the input when disabled', () => {
    render(<SrdSpellSearch onSelect={vi.fn()} disabled />);
    expect(screen.getByLabelText(/search the spell catalog/i)).toBeDisabled();
  });
});
