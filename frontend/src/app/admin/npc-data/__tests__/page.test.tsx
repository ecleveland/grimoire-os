import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils/query';
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
    renderWithQueryClient(<AdminNpcDataPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('does not redirect or load data while auth is still hydrating', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, isLoading: true });
    renderWithQueryClient(<AdminNpcDataPage />);
    await Promise.resolve();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('renders all six tabs', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<AdminNpcDataPage />);
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
    renderWithQueryClient(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
    expect(await screen.findByText('Arannis')).toBeInTheDocument();
  });

  it('switching tabs re-fetches for the new slug', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
    await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/personality'));
  });

  it('clears the previous tab’s rows when a load fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/admin/npc-data/monster-loot') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve([
        {
          id: 'n1',
          race: 'Elf',
          kind: 'first',
          value: 'Arannis',
          source: 'curated',
          isActive: true,
        },
      ]);
    });
    renderWithQueryClient(<AdminNpcDataPage />);
    await screen.findByText('Arannis');

    await userEvent.click(screen.getByRole('tab', { name: 'Monster Loot' }));

    // The names rows must not keep rendering under the Monster Loot columns.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load rows'));
    expect(screen.queryByText('Arannis')).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load rows.');
  });

  it('shows a retryable error row when the load fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([
      {
        id: 'n1',
        race: 'Elf',
        kind: 'first',
        value: 'Arannis',
        source: 'curated',
        isActive: true,
      },
    ]);
    renderWithQueryClient(<AdminNpcDataPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load rows.');
    expect(alert.closest('tbody')).not.toBeNull();
    expect(screen.queryByText('No rows.')).toBeNull();

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Arannis')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    consoleError.mockRestore();
  });

  it('returning to a visited tab shows its rows without a loading row', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/admin/npc-data/personality') {
        return Promise.resolve([
          { id: 'p1', background: 'Acolyte', kind: 'ideals', value: 'Faith.', isActive: true },
        ]);
      }
      // Later names loads never settle, so only the cache can fill the table.
      if (mockApiFetch.mock.calls.filter(c => c[0] === path).length > 1) {
        return new Promise(() => {});
      }
      return Promise.resolve([
        {
          id: 'n1',
          race: 'Elf',
          kind: 'first',
          value: 'Arannis',
          source: 'curated',
          isActive: true,
        },
      ]);
    });
    renderWithQueryClient(<AdminNpcDataPage />);
    await screen.findByText('Arannis');
    await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
    await screen.findByText('Faith.');

    await userEvent.click(screen.getByRole('tab', { name: 'Names' }));
    expect(screen.getByText('Arannis')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('a write that lands after a tab switch', () => {
    const arannis = {
      id: 'n1',
      race: 'Elf',
      kind: 'first',
      value: 'Arannis',
      source: 'user',
      isActive: true,
    };
    const faith = {
      id: 'p1',
      background: 'Acolyte',
      kind: 'ideals',
      value: 'Faith.',
      isActive: true,
    };

    // The first GET per tab answers; later GETs never settle, so the table
    // shows only what the cache holds. `held` keeps the write pending until
    // the test releases it.
    function routeWithHeldWrite(method: string) {
      let release: (value?: unknown) => void = () => {};
      mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
        if (init?.method === method) {
          return new Promise(resolve => {
            release = resolve;
          });
        }
        const gets = mockApiFetch.mock.calls.filter(c => c[0] === path && !c[1]?.method);
        if (gets.length > 1) return new Promise(() => {});
        if (path === '/admin/npc-data/personality') return Promise.resolve([faith]);
        return Promise.resolve([arannis]);
      });
      return () => release(undefined);
    }

    async function switchToPersonality() {
      await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
      await screen.findByText('Faith.');
    }

    it('a Disable patches the tab it was clicked on', async () => {
      const release = routeWithHeldWrite('PATCH');
      renderWithQueryClient(<AdminNpcDataPage />);
      await screen.findByText('Arannis');
      await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
      await switchToPersonality();

      release();
      await waitFor(() =>
        expect(mockApiFetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(true)
      );
      const faithRow = screen.getByRole('row', { name: /Faith\./ });
      await waitFor(() => expect(within(faithRow).getByText('Active')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Names' }));
      const row = screen.getByRole('row', { name: /Arannis/ });
      expect(within(row).getByText('Disabled')).toBeInTheDocument();
    });

    it('a Delete removes the row from the tab it was clicked on', async () => {
      const release = routeWithHeldWrite('DELETE');
      renderWithQueryClient(<AdminNpcDataPage />);
      await screen.findByText('Arannis');
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
      );
      await switchToPersonality();

      release();
      const { toast } = await import('sonner');
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Row deleted'));
      expect(screen.getByText('Faith.')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Names' }));
      expect(screen.queryByText('Arannis')).toBeNull();
    });

    it("an Add row refreshes its own tab and leaves the new tab's form alone", async () => {
      const release = routeWithHeldWrite('POST');
      renderWithQueryClient(<AdminNpcDataPage />);
      await screen.findByText('Arannis');
      fireEvent.change(screen.getByLabelText(/^Race \*/), { target: { value: 'Dwarf' } });
      fireEvent.change(screen.getByLabelText(/^Kind \*/), { target: { value: 'first' } });
      fireEvent.change(screen.getByLabelText(/^Value \*/), { target: { value: 'Bruenor' } });
      await userEvent.click(screen.getByRole('button', { name: /Add row/i }));
      await switchToPersonality();
      fireEvent.change(screen.getByLabelText(/^Background \*/), { target: { value: 'Sage' } });

      const personalityGets = () =>
        mockApiFetch.mock.calls.filter(c => c[0] === '/admin/npc-data/personality').length;
      const namesGets = () =>
        mockApiFetch.mock.calls.filter(c => c[0] === '/admin/npc-data/names' && !c[1]?.method)
          .length;
      expect(personalityGets()).toBe(1);
      expect(namesGets()).toBe(1);

      release();
      const { toast } = await import('sonner');
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Row added'));
      // The names list is marked stale, so returning to it refetches; the
      // personality list on screen is not refetched.
      expect(personalityGets()).toBe(1);
      expect(screen.getByLabelText(/^Background \*/)).toHaveValue('Sage');
      await userEvent.click(screen.getByRole('tab', { name: 'Names' }));
      await waitFor(() => expect(namesGets()).toBe(2));
    });
  });

  it('ignores an out-of-order response from a previously selected tab', async () => {
    let resolveNames!: (rows: object[]) => void;
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/admin/npc-data/names') {
        return new Promise(resolve => {
          resolveNames = resolve;
        });
      }
      return Promise.resolve([
        { id: 'p1', background: 'Acolyte', kind: 'ideals', value: 'Faith.', isActive: true },
      ]);
    });
    renderWithQueryClient(<AdminNpcDataPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));

    // Switch tabs while the names request is still in flight, then let the
    // stale names response land after the personality rows rendered.
    await userEvent.click(screen.getByRole('tab', { name: 'Personality' }));
    await screen.findByText('Faith.');
    resolveNames([
      { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'curated', isActive: true },
    ]);

    await waitFor(() => expect(screen.queryByText('Arannis')).toBeNull());
    expect(screen.getByText('Faith.')).toBeInTheDocument();
  });

  it('disables Delete on curated rows for tables with source', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'n1', race: 'Elf', kind: 'first', value: 'Arannis', source: 'curated', isActive: true },
      { id: 'n2', race: 'Elf', kind: 'first', value: 'Customan', source: 'user', isActive: true },
    ]);
    renderWithQueryClient(<AdminNpcDataPage />);
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
    renderWithQueryClient(<AdminNpcDataPage />);
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
    renderWithQueryClient(<AdminNpcDataPage />);
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
    renderWithQueryClient(<AdminNpcDataPage />);
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

  // Shared by both loot tabs: routes the tab's list/create and the
  // item-picker search.
  const dagger = { id: 'item-1', name: 'Dagger', category: 'Weapon', isMagic: false };

  function routeLootApi(rows: object[] = [], items: object[] = [dagger]) {
    mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path.startsWith('/srd/items')) {
        return Promise.resolve({ data: items, total: items.length, page: 1, lastPage: 1 });
      }
      if (init?.method === 'POST') return Promise.resolve({ id: 'new-row' });
      return Promise.resolve(rows);
    });
  }

  describe('loot templates tab', () => {
    async function openLootTab() {
      renderWithQueryClient(<AdminNpcDataPage />);
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
    async function openMonsterLootTab() {
      renderWithQueryClient(<AdminNpcDataPage />);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/names'));
      await userEvent.click(screen.getByRole('tab', { name: 'Monster Loot' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith('/admin/npc-data/monster-loot')
      );
    }

    it('offers the canonical monster types in a select — free text would create unreachable rows', async () => {
      routeLootApi();
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
      routeLootApi();
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
      routeLootApi();
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
      routeLootApi();
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
      routeLootApi([
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
    renderWithQueryClient(<AdminNpcDataPage />);
    await screen.findByText('Arannis');
    await userEvent.type(screen.getByLabelText(/Search rows/i), 'dwarf');
    expect(screen.queryByText('Arannis')).toBeNull();
    expect(screen.getByText('Brom')).toBeInTheDocument();
  });
});
