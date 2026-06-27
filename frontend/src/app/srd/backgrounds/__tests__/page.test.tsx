import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdBackground } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The page is now a server component fetching via the server-only helper; tests
// mock that helper and render the resolved element tree.
const mockFetchSrdList = vi.fn();
vi.mock('@/lib/srd-server', () => ({
  fetchSrdList: (...args: unknown[]) => mockFetchSrdList(...args),
  SRD_REVALIDATE_SECONDS: 3600,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'bg-1',
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: 0,
    originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
    originFeatOption: 'Cleric',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    source: 'SRD 5.2.1',
    ...over,
  };
}

async function renderPage() {
  return render(<PrintTrayProvider>{await BackgroundListPage()}</PrintTrayProvider>);
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BackgroundListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchSrdList.mockReset();
    mockFetchSrdList.mockResolvedValue([makeBackground()]);
  });

  describe('rendering', () => {
    it('server-fetches /srd/backgrounds and renders the list', async () => {
      await renderPage();
      expect(screen.getByText('Acolyte')).toBeInTheDocument();
      expect(screen.getByText(/Skills: Insight, Religion/)).toBeInTheDocument();
      expect(screen.getByText(/Feat: Magic Initiate \(Cleric\)/)).toBeInTheDocument();
      expect(mockFetchSrdList).toHaveBeenCalledWith('/srd/backgrounds');
    });

    it('renders the feat name without an option suffix when originFeatOption is null', async () => {
      mockFetchSrdList.mockResolvedValue([
        makeBackground({
          name: 'Criminal',
          originFeat: { id: 'feat-alert', name: 'Alert' },
          originFeatOption: null,
        }),
      ]);

      await renderPage();

      expect(screen.getByText(/Feat: Alert/)).toBeInTheDocument();
      expect(screen.queryByText(/Alert \(/)).not.toBeInTheDocument();
    });

    it('omits the feat line when a background has no origin feat', async () => {
      mockFetchSrdList.mockResolvedValue([
        makeBackground({ originFeat: null, originFeatOption: null }),
      ]);

      await renderPage();

      expect(screen.queryByText(/Feat:/)).not.toBeInTheDocument();
    });

    it('renders an error state when the fetch rejects', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockRejectedValue(new Error('boom'));

      await renderPage();

      expect(screen.getByText(/Failed to load backgrounds/)).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe('print set selection', () => {
    it('toggles a background into the tray from its list card', async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Acolyte to print set' }));

      expect(storedTray()).toEqual([{ type: 'background', id: 'bg-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Acolyte from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('toggling the affordance does not expand the card', async () => {
      mockFetchSrdList.mockResolvedValue([makeBackground({ description: 'Devoted servant.' })]);
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Acolyte to print set' }));

      // The detail ships in the SSR HTML but stays hidden until the card is expanded.
      expect(screen.getByText('Devoted servant.')).not.toBeVisible();
    });

    it('removes the background on second toggle', async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Acolyte to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Acolyte from print set' }));

      expect(storedTray()).toEqual([]);
    });
  });
});
