import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdClass } from '@/lib/types';

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

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'class-1',
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['STR'],
    savingThrows: ['STR', 'CON'],
    armorProficiencies: ['All armor'],
    weaponProficiencies: ['Simple', 'Martial'],
    skillChoices: ['Athletics', 'Intimidation'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [
      { id: 'cf-second-wind', name: 'Second Wind', level: 1, description: 'Regain hit points.' },
      { id: 'cf-action-surge', name: 'Action Surge', level: 2, description: 'Extra action.' },
    ],
    source: 'SRD 5.2.1',
    ...over,
  };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <ClassListPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClassListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
    mockToastError.mockReset();
    mockApiFetch.mockResolvedValue([makeClass()]);
  });

  describe('rendering', () => {
    it('shows a loading state before the fetch resolves', () => {
      mockApiFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('Loading classes...')).toBeInTheDocument();
    });

    it('renders classes from the API once loaded', async () => {
      renderPage();
      expect(await screen.findByText('Fighter')).toBeInTheDocument();
      expect(screen.getByText(/Hit Die: d10/)).toBeInTheDocument();
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/classes');
    });

    it('shows an error toast when the fetch rejects', async () => {
      mockApiFetch.mockRejectedValue(new Error('boom'));
      renderPage();
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to load classes', {
          id: 'load-classes',
        })
      );
    });
  });

  describe('print set selection (feature chips)', () => {
    it('toggles an individual feature chip into the tray', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fighter/ }));
      await user.click(screen.getByRole('button', { name: 'Add Action Surge to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'cf-action-surge' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Action Surge from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('removes the feature on second toggle', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fighter/ }));
      await user.click(screen.getByRole('button', { name: 'Add Second Wind to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Second Wind from print set' }));

      expect(storedTray()).toEqual([]);
    });

    it('renders a feature without an id as a plain non-interactive chip', async () => {
      mockApiFetch.mockResolvedValue([
        makeClass({ features: [{ name: 'Legacy Feature', level: 1 }] }),
      ]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fighter/ }));

      expect(screen.getByText('Legacy Feature')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Legacy Feature to print set' })
      ).not.toBeInTheDocument();
    });
  });
});
