import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import NewClassPage from '../page';

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<NewClassPage />, { wrapper }) };
}

/** Answers the one write this page makes; anything else fails loudly. */
function routeApi(post: () => Promise<unknown>) {
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/srd/classes' && init?.method === 'POST') return post();
    return Promise.reject(new Error(`unexpected ${init?.method ?? 'GET'} ${path}`));
  });
}

/** Whether the first invalidation the page issued covers a cached API path. */
function invalidates(spy: MockInstance<QueryClient['invalidateQueries']>, path: string): boolean {
  const predicate = spy.mock.calls[0]?.[0]?.predicate;
  if (!predicate) throw new Error('expected an invalidation filtered by predicate');
  return predicate({ queryKey: ['api', path] } as unknown as Query);
}

function fillName(name = 'Warden') {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
}

describe('NewClassPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { userId: 'u1' },
    });
  });

  it('renders nothing while auth is still hydrating', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true, user: null });

    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
  });

  it('prompts an anonymous visitor to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });

    renderPage();

    expect(screen.getByText('Sign in to create homebrew classes.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('POSTs the exact class payload, invalidates the class caches and returns to the list (VEG-508)', async () => {
    routeApi(() => Promise.resolve({ id: 'cls-new', name: 'Warden' }));
    const user = userEvent.setup();
    const { client } = renderPage();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    expect(screen.getByRole('heading', { name: 'Create Class' })).toBeInTheDocument();
    fillName();
    await user.selectOptions(screen.getByLabelText('Hit die'), 'd10');
    await user.click(
      within(screen.getByRole('group', { name: 'Primary abilities' })).getByRole('button', {
        name: 'Strength',
      })
    );
    const skills = within(screen.getByRole('group', { name: 'Skill choices' }));
    await user.click(skills.getByRole('button', { name: 'Athletics' }));
    await user.click(skills.getByRole('button', { name: 'Survival' }));
    fireEvent.change(screen.getByLabelText('Number of skill choices'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: /add feature/i }));
    fireEvent.change(screen.getByLabelText('Feature name'), { target: { value: 'Wardens Bond' } });
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/classes'));
    const [, init] = mockApiFetch.mock.calls.find(([path]) => path === '/srd/classes')!;
    expect(JSON.parse(init.body)).toEqual({
      name: 'Warden',
      hitDie: 'd10',
      description: null,
      primaryAbilities: ['Strength'],
      savingThrows: [],
      skillChoices: ['Athletics', 'Survival'],
      numSkillChoices: 2,
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      subclassLevel: null,
      features: [{ name: 'Wardens Bond', level: 1, description: '' }],
    });
    expect(toast.success).toHaveBeenCalledWith('Class created');
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidates(invalidate, '/srd/classes?page=1&limit=100')).toBe(true);
    expect(invalidates(invalidate, '/srd/backgrounds')).toBe(false);
  });

  it('toasts a validation failure and never calls the API', async () => {
    const user = userEvent.setup();
    renderPage();

    fillName();
    const skills = within(screen.getByRole('group', { name: 'Skill choices' }));
    await user.click(skills.getByRole('button', { name: 'Athletics' }));
    await user.click(skills.getByRole('button', { name: 'Survival' }));
    fireEvent.change(screen.getByLabelText('Number of skill choices'), { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Number of skill choices can't be more than the skills offered (2)"
      )
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('toasts the API error message and stays on the page', async () => {
    routeApi(() => Promise.reject(new Error('You already have a class with this name')));
    const user = userEvent.setup();
    renderPage();

    fillName();
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You already have a class with this name')
    );
    expect(screen.getByRole('button', { name: 'Create class' })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    routeApi(() => Promise.reject('boom'));
    const user = userEvent.setup();
    renderPage();

    fillName();
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to create class'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
