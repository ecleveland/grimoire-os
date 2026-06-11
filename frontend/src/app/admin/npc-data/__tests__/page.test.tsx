import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminNpcDataPage from '../page';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/admin/npc-data',
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

  it('renders all six tabs', async () => {
    mockApiFetch.mockResolvedValue([]);
    render(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'Names' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Loot Templates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Monster Loot' })).toBeInTheDocument();
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

  describe('loot templates tab', () => {
    const dagger = { id: 'item-1', name: 'Dagger', category: 'Weapon', isMagic: false };

    /** Routes the loot-templates list/create and the item-picker search. */
    function routeLootApi(rows: object[] = [], items: object[] = [dagger]) {
      mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
        if (path.startsWith('/srd/items')) {
          return Promise.resolve({ data: items, total: items.length, page: 1, lastPage: 1 });
        }
        if (init?.method === 'POST') return Promise.resolve({ id: 'lt-new' });
        return Promise.resolve(rows);
      });
    }

    async function openLootTab() {
      render(<AdminNpcDataPage />);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
      await userEvent.click(screen.getByRole('tab', { name: 'Loot Templates' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/loot-templates')
      );
    }

    it('renders structured editors instead of JSON textareas', async () => {
      routeLootApi();
      await openLootTab();

      expect(screen.getByLabelText('gp min')).toBeInTheDocument();
      expect(screen.getByLabelText('sp max')).toBeInTheDocument();
      expect(screen.getByLabelText(/search items/i)).toBeInTheDocument();
      // CR bucket is a select offering the en-dash bucket labels — free text
      // with an ASCII hyphen would never match a template at generation time.
      const crSelect = screen.getByLabelText(/CR bucket/);
      expect(crSelect.tagName).toBe('SELECT');
      expect(within(crSelect as HTMLElement).getByRole('option', { name: '2–4' })).toBeDefined();
      expect(document.querySelector('textarea')).toBeNull();
    });

    it('creates a loot template from the structured editors', async () => {
      routeLootApi();
      await openLootTab();

      await userEvent.type(screen.getByLabelText(/^Profession/), 'merchant');
      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '2–4');
      fireEvent.change(screen.getByLabelText('gp max'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('sp min'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('sp max'), { target: { value: '8' } });

      await userEvent.type(screen.getByLabelText(/search items/i), 'dag');
      await userEvent.click(await screen.findByRole('button', { name: /add dagger/i }));

      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/loot-templates',
          expect.objectContaining({ method: 'POST' })
        )
      );
      const postCall = mockApiFetch.mock.calls.find(
        c => c[0] === '/admin/npc-data/loot-templates' && c[1]?.method === 'POST'
      );
      expect(JSON.parse(postCall![1].body)).toEqual({
        profession: 'merchant',
        crBucket: '2–4',
        coinage: { gp: [0, 2], sp: [2, 8], cp: [0, 0] },
        items: [{ itemName: 'Dagger', weight: 1, qty: [1, 1] }],
      });
    });

    it('blocks submitting a template with no items', async () => {
      const { toast } = await import('sonner');
      routeLootApi();
      await openLootTab();

      await userEvent.type(screen.getByLabelText(/^Profession/), 'merchant');
      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '0');
      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      expect(toast.error).toHaveBeenCalledWith('Add at least one item');
      expect(
        mockApiFetch.mock.calls.find(
          c => c[0] === '/admin/npc-data/loot-templates' && c[1]?.method === 'POST'
        )
      ).toBeUndefined();
    });

    it('blocks submitting a template whose items all have weight 0', async () => {
      const { toast } = await import('sonner');
      routeLootApi();
      await openLootTab();

      await userEvent.type(screen.getByLabelText(/^Profession/), 'merchant');
      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '0');
      await userEvent.type(screen.getByLabelText(/search items/i), 'dag');
      await userEvent.click(await screen.findByRole('button', { name: /add dagger/i }));
      fireEvent.change(screen.getByLabelText('Dagger weight'), { target: { value: '0' } });

      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      expect(toast.error).toHaveBeenCalledWith('At least one item needs a weight above 0');
      expect(
        mockApiFetch.mock.calls.find(
          c => c[0] === '/admin/npc-data/loot-templates' && c[1]?.method === 'POST'
        )
      ).toBeUndefined();
    });

    it('still disables and deletes loot rows', async () => {
      routeLootApi([
        {
          id: 'lt1',
          profession: 'merchant',
          crBucket: '2–4',
          coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
          items: [{ itemName: 'Dagger', weight: 60, qty: [1, 1] }],
          source: 'user',
          isActive: true,
        },
      ]);
      await openLootTab();
      await screen.findByText('merchant');

      await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/loot-templates/lt1',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) })
        )
      );

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
      );
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/loot-templates/lt1',
          expect.objectContaining({ method: 'DELETE' })
        )
      );
    });
  });

  describe('monster loot tab', () => {
    const dagger = { id: 'item-1', name: 'Dagger', category: 'Weapon', isMagic: false };

    /** Routes the monster-loot list/create and the item-picker search. */
    function routeMonsterLootApi(rows: object[] = [], items: object[] = [dagger]) {
      mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
        if (path.startsWith('/srd/items')) {
          return Promise.resolve({ data: items, total: items.length, page: 1, lastPage: 1 });
        }
        if (init?.method === 'POST') return Promise.resolve({ id: 'mlt-new' });
        return Promise.resolve(rows);
      });
    }

    async function openMonsterLootTab() {
      render(<AdminNpcDataPage />);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
      await userEvent.click(screen.getByRole('tab', { name: 'Monster Loot' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/monster-loot')
      );
    }

    it('offers the canonical monster types in a select — free text would create unreachable rows', async () => {
      routeMonsterLootApi();
      await openMonsterLootTab();

      const typeSelect = screen.getByLabelText(/^Type \*/);
      expect(typeSelect.tagName).toBe('SELECT');
      const options = within(typeSelect as HTMLElement).getAllByRole('option');
      const values = options.map(o => (o as HTMLOptionElement).value);
      expect(values).toEqual(
        expect.arrayContaining(['aberration', 'beast', 'dragon', 'undead', '__generic__'])
      );
      // NPC professions never belong to the monster family.
      expect(values).not.toContain('merchant');
      const crSelect = screen.getByLabelText(/CR bucket/);
      expect(crSelect.tagName).toBe('SELECT');
      expect(within(crSelect as HTMLElement).getByRole('option', { name: '11+' })).toBeDefined();
    });

    it('creates a monster loot template from the structured editors', async () => {
      routeMonsterLootApi();
      await openMonsterLootTab();

      await userEvent.selectOptions(screen.getByLabelText(/^Type \*/), 'dragon');
      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '11+');
      fireEvent.change(screen.getByLabelText('gp min'), { target: { value: '100' } });
      fireEvent.change(screen.getByLabelText('gp max'), { target: { value: '600' } });

      await userEvent.type(screen.getByLabelText(/search items/i), 'dag');
      await userEvent.click(await screen.findByRole('button', { name: /add dagger/i }));

      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/monster-loot',
          expect.objectContaining({ method: 'POST' })
        )
      );
      const postCall = mockApiFetch.mock.calls.find(
        c => c[0] === '/admin/npc-data/monster-loot' && c[1]?.method === 'POST'
      );
      expect(JSON.parse(postCall![1].body)).toEqual({
        type: 'dragon',
        crBucket: '11+',
        coinage: { gp: [100, 600], sp: [0, 0], cp: [0, 0] },
        items: [{ itemName: 'Dagger', weight: 1, qty: [1, 1] }],
      });
    });

    it('blocks submitting without a type', async () => {
      const { toast } = await import('sonner');
      routeMonsterLootApi();
      await openMonsterLootTab();

      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '0');
      await userEvent.type(screen.getByLabelText(/search items/i), 'dag');
      await userEvent.click(await screen.findByRole('button', { name: /add dagger/i }));
      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      expect(toast.error).toHaveBeenCalledWith('Type is required');
      expect(
        mockApiFetch.mock.calls.find(
          c => c[0] === '/admin/npc-data/monster-loot' && c[1]?.method === 'POST'
        )
      ).toBeUndefined();
    });

    it('surfaces a create failure as a toast', async () => {
      const { toast } = await import('sonner');
      routeMonsterLootApi();
      await openMonsterLootTab();

      mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
        if (path.startsWith('/srd/items')) {
          return Promise.resolve({ data: [dagger], total: 1, page: 1, lastPage: 1 });
        }
        if (init?.method === 'POST') {
          return Promise.reject(new Error('Unknown item "Dagger"'));
        }
        return Promise.resolve([]);
      });

      await userEvent.selectOptions(screen.getByLabelText(/^Type \*/), 'beast');
      await userEvent.selectOptions(screen.getByLabelText(/CR bucket/), '0');
      await userEvent.type(screen.getByLabelText(/search items/i), 'dag');
      await userEvent.click(await screen.findByRole('button', { name: /add dagger/i }));
      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unknown item "Dagger"'));
    });

    it('lists rows by type and CR, disables and deletes like the NPC loot tab', async () => {
      routeMonsterLootApi([
        {
          id: 'mlt1',
          type: 'beast',
          crBucket: '0',
          coinage: { gp: [0, 0], sp: [0, 0], cp: [0, 2] },
          items: [{ itemName: 'Hide', weight: 1, qty: [1, 1] }],
          source: 'curated',
          isActive: true,
        },
        {
          id: 'mlt2',
          type: 'dragon',
          crBucket: '11+',
          coinage: { gp: [100, 600], sp: [0, 0], cp: [0, 0] },
          items: [{ itemName: 'Dagger', weight: 1, qty: [1, 1] }],
          source: 'user',
          isActive: true,
        },
      ]);
      await openMonsterLootTab();

      // Seeded rows can only be disabled; user rows can also be deleted.
      const curatedRow = within(await screen.findByRole('row', { name: /beast/ }));
      const userRow = within(screen.getByRole('row', { name: /dragon/ }));
      expect(curatedRow.queryByRole('button', { name: 'Delete' })).toBeNull();
      expect(userRow.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

      await userEvent.click(curatedRow.getByRole('button', { name: 'Disable' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/monster-loot/mlt1',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) })
        )
      );

      await userEvent.click(userRow.getByRole('button', { name: 'Delete' }));
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
      );
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/admin/npc-data/monster-loot/mlt2',
          expect.objectContaining({ method: 'DELETE' })
        )
      );
    });
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
