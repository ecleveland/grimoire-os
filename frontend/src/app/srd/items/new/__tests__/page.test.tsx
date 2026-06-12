import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NewItemPage from '../page';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Lucky Coin' } });
  fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Wondrous Item' } });
}

describe('NewItemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { userId: 'u1' } });
  });

  it('prompts unauthenticated visitors to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });

    render(<NewItemPage />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('creates the item and redirects to the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'hb-1', name: 'Lucky Coin' });

    render(<NewItemPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/items',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Lucky Coin',
        category: 'Wondrous Item',
        rarity: null,
        cost: null,
        weight: null,
        properties: null,
        description: null,
        requiresAttunement: false,
        isMagic: false,
        stealthDisadvantage: false,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Item created');
    expect(mockPush).toHaveBeenCalledWith('/srd/items');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('You already have an item with this name'));

    render(<NewItemPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have an item with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');

    render(<NewItemPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create item');
    });
  });
});
