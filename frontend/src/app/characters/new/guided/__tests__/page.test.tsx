import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import GuidedCharacterPage from '../page';
import type { Character } from '@/lib/types';

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
  return render(<GuidedCharacterPage />, { wrapper });
}

// The shell only talks to the API on submit (POST /characters). Stub steps don't
// fetch yet; route POST to a created character and reject anything unexpected.
function routeApiFetch(created: Partial<Character> = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
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

// Advance from the Class step (index 0) all the way to the Review step, skipping
// the optional stub steps in between.
async function advanceToReview(user: ReturnType<typeof userEvent.setup>, className = 'Wizard') {
  await user.type(screen.getByRole('textbox', { name: /class/i }), className);
  // Class -> Origin -> Abilities -> Equipment -> Spells -> Review = 5 advances.
  for (let i = 0; i < 5; i++) {
    await user.click(screen.getByRole('button', { name: /^next$/i }));
  }
  await screen.findByRole('heading', { name: /review/i });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockPush.mockReset();
});

describe('GuidedCharacterPage — wizard shell', () => {
  it('renders the first (Class) step and a progress indicator listing every step', () => {
    routeApiFetch();
    renderPage();

    // Class step content is shown first.
    expect(screen.getByRole('heading', { name: /class/i })).toBeInTheDocument();
    // Progress indicator lists all six steps.
    const progress = screen.getByRole('navigation', { name: /progress/i });
    for (const title of ['Class', 'Origin', 'Abilities', 'Equipment', 'Spells', 'Review']) {
      expect(within(progress).getByText(title)).toBeInTheDocument();
    }
  });

  it('disables Back on the first step', () => {
    routeApiFetch();
    renderPage();
    expect(screen.getByRole('button', { name: /^back$/i })).toBeDisabled();
  });

  it('gates Next until the Class step minimum (a class) is chosen', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /class/i }), 'Fighter');
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();
  });

  it('allows skipping an optional step', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /class/i }), 'Fighter');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    // On Origin (optional) — Skip jumps forward without any input.
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(screen.getByRole('heading', { name: /abilities/i })).toBeInTheDocument();
  });

  it('preserves draft state when navigating back and forth', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /class/i }), 'Rogue');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    // The class typed earlier survives the round trip.
    expect(screen.getByRole('textbox', { name: /class/i })).toHaveValue('Rogue');
  });

  it('blocks submission until the Review step minimum (a name) is provided', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user);
    expect(screen.getByRole('button', { name: /create character/i })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    expect(screen.getByRole('button', { name: /create character/i })).toBeEnabled();
  });

  it('submits a minimal valid character (name + class) and redirects to the sheet', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user, 'Wizard');
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
    expect(lastPostBody()).toMatchObject({ name: 'Mialee', class: 'Wizard' });
    expect(mockToastSuccess).toHaveBeenCalledWith('Character created!');
  });

  it('toasts an error and stays on the Review step when creation fails', async () => {
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.reject(new Error('Name is required'));
      return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Name is required'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
  });
});
