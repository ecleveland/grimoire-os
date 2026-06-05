import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdBackground } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'bg-1',
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: 0,
    feat: 'Magic Initiate (Cleric)',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    source: 'SRD 5.2.1',
    ...over,
  };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <BackgroundListPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BackgroundListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
    mockToastError.mockReset();
    mockApiFetch.mockResolvedValue([makeBackground()]);
  });

  describe('rendering', () => {
    it('shows a loading state before the fetch resolves', () => {
      mockApiFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('Loading backgrounds...')).toBeInTheDocument();
    });

    it('renders backgrounds from the API once loaded', async () => {
      renderPage();
      expect(await screen.findByText('Acolyte')).toBeInTheDocument();
      expect(screen.getByText(/Skills: Insight, Religion/)).toBeInTheDocument();
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/backgrounds');
    });

    it('shows an error toast when the fetch rejects', async () => {
      mockApiFetch.mockRejectedValue(new Error('boom'));
      renderPage();
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to load backgrounds', {
          id: 'load-backgrounds',
        })
      );
    });
  });

  describe('print set selection', () => {
    it('toggles a background into the tray from its list card', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Acolyte to print set' }));

      expect(storedTray()).toEqual([{ type: 'background', id: 'bg-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Acolyte from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('toggling the affordance does not expand the card', async () => {
      mockApiFetch.mockResolvedValue([makeBackground({ description: 'Devoted servant.' })]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Acolyte to print set' }));

      expect(screen.queryByText('Devoted servant.')).not.toBeInTheDocument();
    });

    it('removes the background on second toggle', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Acolyte to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Acolyte from print set' }));

      expect(storedTray()).toEqual([]);
    });
  });
});
