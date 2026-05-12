import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminNpcDataPage from '../page';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  mockApiFetch.mockReset();
  mockReplace.mockReset();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('AdminNpcDataPage', () => {
  it('redirects non-admin users', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('renders all five tabs', async () => {
    mockApiFetch.mockResolvedValue([]);
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'Names' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Loot Templates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trinkets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Personality' })).toBeInTheDocument();
  });

  it('loads the names table by default', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'n1',
        race: 'Elf',
        gender: null,
        kind: 'first',
        value: 'Arannis',
        source: 'curated',
        isActive: true,
      },
    ]);
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
    expect(await screen.findByText('Arannis')).toBeInTheDocument();
  });

  it('switching tabs re-fetches for the new slug', async () => {
    mockApiFetch.mockResolvedValue([]);
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
    await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/personality'));
  });

  it('disables Delete on curated rows for tables with source', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'curated', isActive: true },
      { id: 'n2', race: 'Elf', kind: 'first', value: 'Customan', source: 'user', isActive: true },
    ]);
    render(<AdminNpcDataPage />);
    await screen.findByText('Arannis');
    const rows = screen.getAllByRole('row');
    // header + 2 data rows
    const curatedRow = within(rows[1]);
    const userRow = within(rows[2]);
    expect(curatedRow.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(userRow.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('always shows Delete on personality rows (no source filter)', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'p1', background: 'Acolyte', kind: 'ideals', value: 'Faith.', isActive: true },
    ]);
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
    await screen.findByText('Faith.');
    const row = screen.getByRole('row', { name: /Faith\./ });
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('submits a new name row and refreshes the list', async () => {
    mockApiFetch
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce({ id: 'n1' }) // POST
      .mockResolvedValueOnce([
        { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'user', isActive: true },
      ]); // reload
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText(/^Race \*/), 'Elf');
    await userEvent.selectOptions(screen.getByLabelText(/^Kind \*/), 'first');
    await userEvent.type(screen.getByLabelText(/^Value \*/), 'Arannis');
    await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admin/npc-data/names',
        expect.objectContaining({ method: 'POST' })
      )
    );
    const postCall = mockApiFetch.mock.calls.find(
      c => c[0] === '/admin/npc-data/names' && c[1]?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall![1].body)).toEqual({
      race: 'Elf',
      kind: 'first',
      value: 'Arannis',
    });
  });

  it('toggles isActive when Disable is clicked', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'user', isActive: true },
      ])
      .mockResolvedValueOnce({ id: 'n1', isActive: false });
    render(<AdminNpcDataPage />);
    await screen.findByText('Arannis');
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/admin/npc-data/names/n1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        })
      )
    );
  });

  it('filters rows by the search field', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'curated', isActive: true },
      { id: 'n2', race: 'Dwarf', kind: 'first', value: 'Brom', source: 'curated', isActive: true },
    ]);
    render(<AdminNpcDataPage />);
    await screen.findByText('Arannis');
    await userEvent.type(screen.getByLabelText(/Search rows/i), 'dwarf');
    expect(screen.queryByText('Arannis')).toBeNull();
    expect(screen.getByText('Brom')).toBeInTheDocument();
  });
});
