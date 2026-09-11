import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassDetail from '../ClassDetail';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdClass } from '@/lib/types';

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'class-1',
    name: 'Fighter',
    contentSource: 'srd',
    createdById: null,
    hitDie: 'd10',
    primaryAbilities: ['STR'],
    savingThrows: ['STR', 'CON'],
    armorProficiencies: ['All armor'],
    weaponProficiencies: ['Simple', 'Martial'],
    skillChoices: ['Athletics', 'Intimidation'],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A master of martial combat.',
    features: [
      { id: 'cf-second-wind', name: 'Second Wind', level: 1, description: 'Regain hit points.' },
      { id: 'cf-action-surge', name: 'Action Surge', level: 2, description: 'Extra action.' },
    ],
    source: 'SRD 5.2.1',
    ...over,
  };
}

function renderDetail(cls: SrdClass) {
  return render(
    <PrintTrayProvider>
      <ClassDetail cls={cls} />
    </PrintTrayProvider>
  );
}

/** The element wrapping a section heading and its content. */
function section(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).parentElement!;
}

describe('ClassDetail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the description and every section', () => {
    renderDetail(makeClass());

    expect(screen.getByText('A master of martial combat.')).toBeInTheDocument();
    expect(section('Saving Throws')).toHaveTextContent('STR, CON');
    expect(section('Armor Proficiencies')).toHaveTextContent('All armor');
    expect(section('Weapon Proficiencies')).toHaveTextContent('Simple, Martial');
    expect(section('Skill Choices')).toHaveTextContent('Athletics, Intimidation');
    expect(section('Features')).toHaveTextContent('Second Wind');
  });

  it('shows None for empty armor and weapon proficiency lists', () => {
    renderDetail(makeClass({ armorProficiencies: [], weaponProficiencies: [] }));

    expect(section('Armor Proficiencies')).toHaveTextContent('None');
    expect(section('Weapon Proficiencies')).toHaveTextContent('None');
  });

  it('shows None for an empty saving throw list', () => {
    renderDetail(makeClass({ savingThrows: [] }));

    expect(section('Saving Throws')).toHaveTextContent('None');
  });

  it('shows None for an empty skill choice list', () => {
    renderDetail(makeClass({ skillChoices: [] }));

    expect(section('Skill Choices')).toHaveTextContent('None');
  });

  it('omits the description and the Features section when the class has neither', () => {
    renderDetail(makeClass({ description: undefined, features: [] }));

    expect(screen.queryByText('A master of martial combat.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Features' })).not.toBeInTheDocument();
  });

  it('renders features with an id as print toggles', async () => {
    const user = userEvent.setup();
    renderDetail(makeClass());

    expect(
      screen.getByRole('button', { name: 'Add Second Wind to print set' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Action Surge to print set' }));

    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]')).toEqual([
      { type: 'feature', id: 'cf-action-surge' },
    ]);
  });

  it('renders a feature without an id as a plain non-interactive chip', () => {
    renderDetail(makeClass({ features: [{ name: 'Legacy Feature', level: 1 }] }));

    expect(screen.getByText('Legacy Feature')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Legacy Feature to print set' })
    ).not.toBeInTheDocument();
  });

  // A class can legally list one feature name at several levels, as Ability
  // Score Improvement does at 4, 8 and 12 in every class.
  //
  // The assertion is on React's duplicate-key warning rather than on the chip
  // count. React still renders duplicate-keyed siblings on a first mount and
  // only warns, so counting chips passes with or without distinct keys. The
  // warning is the only observable difference, and what it predicts is real,
  // because the list and detail pages re-render this component when an owner
  // opens the delete dialog, and React can then attach state to the wrong chip.
  describe('a feature name recurring at several levels', () => {
    const duplicateKeyWarnings = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('same key'));

    it('gives each level its own React key', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderDetail(
        makeClass({
          features: [
            { id: 'cf-asi-4', name: 'Ability Score Improvement', level: 4 },
            { id: 'cf-asi-8', name: 'Ability Score Improvement', level: 8 },
            { id: 'cf-asi-12', name: 'Ability Score Improvement', level: 12 },
          ],
        })
      );

      expect(duplicateKeyWarnings(errorSpy)).toEqual([]);
      expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(3);
      errorSpy.mockRestore();
    });

    it('keeps the id-less fallback chips distinct too', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderDetail(
        makeClass({
          features: [
            { name: 'Ability Score Improvement', level: 4 },
            { name: 'Ability Score Improvement', level: 8 },
          ],
        })
      );

      expect(duplicateKeyWarnings(errorSpy)).toEqual([]);
      expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(2);
      errorSpy.mockRestore();
    });
  });
});
