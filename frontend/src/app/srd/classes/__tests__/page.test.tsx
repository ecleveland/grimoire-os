import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdClass } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The page is now a server component fetching via the server-only helper; tests
// mock that helper and render the resolved element tree.
const mockFetchSrdList = vi.fn();
vi.mock('@/lib/srd-server', () => ({
  fetchSrdList: (...args: unknown[]) => mockFetchSrdList(...args),
  SRD_REVALIDATE_SECONDS: 3600,
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

async function renderPage() {
  return render(<PrintTrayProvider>{await ClassListPage()}</PrintTrayProvider>);
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClassListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchSrdList.mockReset();
    mockFetchSrdList.mockResolvedValue([makeClass()]);
  });

  describe('rendering', () => {
    it('server-fetches /srd/classes and renders the list', async () => {
      await renderPage();
      expect(screen.getByText('Fighter')).toBeInTheDocument();
      expect(screen.getByText(/Hit Die: d10/)).toBeInTheDocument();
      expect(mockFetchSrdList).toHaveBeenCalledWith('/srd/classes');
    });

    it('renders an error state when the fetch rejects', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockRejectedValue(new Error('boom'));

      await renderPage();

      expect(screen.getByText(/Failed to load classes/)).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe('print set selection (feature chips)', () => {
    it('toggles an individual feature chip into the tray', async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: /^Fighter/ }));
      await user.click(screen.getByRole('button', { name: 'Add Action Surge to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'cf-action-surge' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Action Surge from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('removes the feature on second toggle', async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: /^Fighter/ }));
      await user.click(screen.getByRole('button', { name: 'Add Second Wind to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Second Wind from print set' }));

      expect(storedTray()).toEqual([]);
    });

    it('renders a feature without an id as a plain non-interactive chip', async () => {
      mockFetchSrdList.mockResolvedValue([
        makeClass({ features: [{ name: 'Legacy Feature', level: 1 }] }),
      ]);
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: /^Fighter/ }));

      expect(screen.getByText('Legacy Feature')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Legacy Feature to print set' })
      ).not.toBeInTheDocument();
    });
  });

  // An id-less feature can't be a print toggle. On real API data this never
  // happens (the endpoint includes feature row ids), so its appearance signals
  // a broken backend contract that would otherwise silently drop print toggles.
  describe('inert-chip invariant logging (VEG-274)', () => {
    it('logs a contract-violation error when a feature is rendered without an id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockResolvedValue([
        makeClass({
          features: [
            { id: 'cf-second-wind', name: 'Second Wind', level: 1 },
            { name: 'Legacy Feature', level: 1 },
          ],
        }),
      ]);

      await renderPage();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('class features rendered without an id'),
        ['Legacy Feature']
      );
      errorSpy.mockRestore();
    });

    it('does not log the invariant when every feature carries an id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await renderPage();

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('without an id'),
        expect.anything()
      );
      errorSpy.mockRestore();
    });
  });

  // VEG-507 widened class_features to [classId, name, level], so one name
  // recurring at several levels is a legal class — Ability Score Improvement at
  // 4, 8 and 12, in every class in the game.
  //
  // The assertion is on React's duplicate-key warning rather than on the chip
  // count, and that is the whole point: React renders duplicate-keyed siblings
  // anyway on a first mount and only complains, so counting chips passes with or
  // without the fix and proves nothing. The warning is the only observable
  // difference, and the damage it predicts — state attaching to the wrong
  // sibling on re-render — is real once VEG-508 makes this list owner-aware and
  // the chips carry print-tray state.
  describe('a feature name recurring at several levels', () => {
    const duplicateKeyWarnings = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.filter(call => String(call[0]).includes('same key'));

    it('gives each level its own React key', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockResolvedValue([
        makeClass({
          features: [
            { id: 'cf-asi-4', name: 'Ability Score Improvement', level: 4 },
            { id: 'cf-asi-8', name: 'Ability Score Improvement', level: 8 },
            { id: 'cf-asi-12', name: 'Ability Score Improvement', level: 12 },
          ],
        }),
      ]);

      await renderPage();

      expect(duplicateKeyWarnings(errorSpy)).toEqual([]);
      expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(3);
      errorSpy.mockRestore();
    });

    it('keeps the id-less fallback chips distinct too', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockResolvedValue([
        makeClass({
          features: [
            { name: 'Ability Score Improvement', level: 4 },
            { name: 'Ability Score Improvement', level: 8 },
          ],
        }),
      ]);

      await renderPage();

      expect(duplicateKeyWarnings(errorSpy)).toEqual([]);
      expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(2);
      errorSpy.mockRestore();
    });
  });
});
