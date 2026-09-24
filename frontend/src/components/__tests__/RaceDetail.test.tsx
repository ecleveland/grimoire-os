import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import RaceDetail from '../RaceDetail';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdRace } from '@/lib/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRace(over: Partial<SrdRace> = {}): SrdRace {
  return {
    id: 'race-1',
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { DEX: 2 },
    languages: ['Common', 'Elvish'],
    description: 'A graceful people of the ancient woods.',
    traits: [
      {
        id: 'trait-darkvision',
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet.',
      },
    ],
    age: 'Elves reach adulthood around 100.',
    alignment: 'Elves lean toward chaotic good.',
    sizeDescription: 'Elves stand between 5 and 6 feet tall.',
    source: 'SRD 5.2.1',
    ...over,
  };
}

// The Elven Lineage trait carries the reconstructed option table as GFM
// markdown (VEG-273), which has to reach the DOM as a real <table>.
const LINEAGE_TRAIT = {
  id: 'trait-lineage',
  name: 'Elven Lineage',
  description: [
    'Choose a lineage from the Elven Lineages table.',
    '',
    '**Elven Lineages**',
    '',
    '| Lineage | Level 1 | Level 3 |',
    '| --- | --- | --- |',
    '| Drow | Your Darkvision increases to 120 feet. | Faerie Fire |',
  ].join('\n'),
};

function renderDetail(race: SrdRace, headingLevel?: 2 | 3) {
  return render(
    <PrintTrayProvider>
      <RaceDetail race={race} headingLevel={headingLevel} />
    </PrintTrayProvider>
  );
}

/** The invariant lines only, since React logs through console.error too. */
function idlessLogs(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.filter((call: unknown[]) =>
    String(call[0]).includes('race traits rendered without an id')
  );
}

/** The element wrapping a section heading and its content. */
function section(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).parentElement!;
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RaceDetail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the description and every section', () => {
    renderDetail(makeRace());

    expect(screen.getByText('A graceful people of the ancient woods.')).toBeInTheDocument();
    expect(section('Ability Bonuses')).toHaveTextContent('DEX +2');
    expect(section('Traits')).toHaveTextContent('Darkvision.');
    expect(section('Languages')).toHaveTextContent('Common, Elvish');
  });

  it('omits the description when the race has none', () => {
    renderDetail(makeRace({ description: undefined }));

    expect(screen.queryByText('A graceful people of the ancient woods.')).not.toBeInTheDocument();
  });

  describe('ability bonuses', () => {
    it('renders a chip per granted bonus', () => {
      renderDetail(makeRace({ abilityBonuses: { DEX: 2, CON: 1 } }));

      expect(screen.getByText('DEX +2')).toBeInTheDocument();
      expect(screen.getByText('CON +1')).toBeInTheDocument();
    });

    it('omits the section when the race grants none', () => {
      renderDetail(makeRace({ abilityBonuses: {} }));

      expect(screen.queryByRole('heading', { name: 'Ability Bonuses' })).not.toBeInTheDocument();
    });

    it('omits the section when bonuses are null', () => {
      // Seeded SRD 5.2.1 species persist abilityBonuses as a SQL NULL, so the
      // component must not throw on Object.keys(null).
      renderDetail(makeRace({ abilityBonuses: null as unknown as SrdRace['abilityBonuses'] }));

      expect(screen.queryByRole('heading', { name: 'Ability Bonuses' })).not.toBeInTheDocument();
      expect(screen.getByText('Common, Elvish')).toBeInTheDocument();
    });
  });

  describe('traits', () => {
    it('omits the section when the race has none', () => {
      renderDetail(makeRace({ traits: [] }));

      expect(screen.queryByRole('heading', { name: 'Traits' })).not.toBeInTheDocument();
    });

    // A row without a traits array breaks the API contract. The list page renders
    // on the server, where throwing here would take down every other race too.
    it('renders the rest of the race when the payload has no traits array', () => {
      renderDetail(makeRace({ traits: undefined as unknown as SrdRace['traits'] }));

      expect(screen.queryByRole('heading', { name: 'Traits' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Languages' })).toBeInTheDocument();
      expect(screen.getByText('Common, Elvish')).toBeInTheDocument();
    });

    it('offers a print toggle for a trait that carries an id', async () => {
      const user = userEvent.setup();
      renderDetail(makeRace());

      await user.click(screen.getByRole('button', { name: 'Add Darkvision to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'trait-darkvision' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Darkvision from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders a trait without an id as plain text, with no toggle', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Each id-less fixture needs its own race id: the invariant log fires once
      // per race for the life of the module.
      renderDetail(
        makeRace({
          id: 'race-inert-chip',
          traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }],
        })
      );

      expect(screen.getByText('Keen Senses.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Keen Senses to print set' })
      ).not.toBeInTheDocument();
      errorSpy.mockRestore();
    });

    it('renders a trait with no description', () => {
      renderDetail(makeRace({ traits: [{ id: 'trait-bare', name: 'Trance' }] }));

      expect(screen.getByText('Trance.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Trance to print set' })).toBeInTheDocument();
    });

    it('renders a trait description as markdown, tables included', () => {
      renderDetail(makeRace({ traits: [LINEAGE_TRAIT] }));

      expect(
        screen.getByText(/Choose a lineage from the Elven Lineages table\./)
      ).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Level 3' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Faerie Fire' })).toBeInTheDocument();
    });
  });

  // An id-less trait can't become a print toggle, and it degrades to an inert
  // chip without any visible sign. Real API rows always carry the trait row id,
  // so one turning up means the backend contract regressed.
  describe('inert-chip invariant logging', () => {
    it('logs the offending trait names when a trait arrives without an id', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderDetail(
        makeRace({
          id: 'race-idless-names',
          traits: [
            {
              id: 'trait-darkvision',
              name: 'Darkvision',
              description: 'You can see in dim light.',
            },
            { name: 'Keen Senses', description: 'Proficiency in Perception.' },
          ],
        })
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('race traits rendered without an id'),
        ['Keen Senses']
      );
      errorSpy.mockRestore();
    });

    it('stays quiet when every trait carries an id', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderDetail(makeRace({ traits: [LINEAGE_TRAIT] }));

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('without an id'),
        expect.anything()
      );
      errorSpy.mockRestore();
    });

    // The race page renders this component inside a client component, where a
    // query resolving or a refetch on focus re-renders it repeatedly.
    it('logs once per race however often it re-renders', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const race = makeRace({
        id: 'race-idless-repeat',
        traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }],
      });

      const { rerender } = renderDetail(race);
      rerender(
        <PrintTrayProvider>
          <RaceDetail race={race} />
        </PrintTrayProvider>
      );
      renderDetail(race);

      expect(idlessLogs(errorSpy)).toHaveLength(1);
      errorSpy.mockRestore();
    });

    it('logs again for a race it has not reported yet', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderDetail(makeRace({ id: 'race-idless-first', traits: [{ name: 'Keen Senses' }] }));
      renderDetail(makeRace({ id: 'race-idless-second', traits: [{ name: 'Stonecunning' }] }));

      expect(idlessLogs(errorSpy)).toHaveLength(2);
      errorSpy.mockRestore();
    });

    // The races list is a force-dynamic server component, so module state there
    // outlives the request. Deduping on the server would silence every request
    // after the first, which is how the list page used to report this.
    it('logs on every server render, where the dedupe would outlive the request', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const race = makeRace({
        id: 'race-idless-server',
        traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }],
      });

      // An id-less trait renders no print toggle, so this tree needs no provider.
      vi.stubGlobal('window', undefined);
      try {
        renderToStaticMarkup(<RaceDetail race={race} />);
        renderToStaticMarkup(<RaceDetail race={race} />);
      } finally {
        vi.unstubAllGlobals();
      }

      expect(idlessLogs(errorSpy)).toHaveLength(2);
      errorSpy.mockRestore();
    });
  });

  describe('heading levels', () => {
    it('puts the sections at level 3, under a list card name', () => {
      renderDetail(makeRace());

      expect(screen.getByRole('heading', { level: 3, name: 'Traits' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Languages' })).toBeInTheDocument();
    });

    it('puts them at level 2 when the caller asks', () => {
      renderDetail(makeRace(), 2);

      expect(
        screen.getByRole('heading', { level: 2, name: 'Ability Bonuses' })
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Languages' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Age' })).toBeInTheDocument();
    });
  });

  describe('flavour paragraphs', () => {
    it('renders Age, Alignment and Size under their own headings', () => {
      renderDetail(makeRace());

      expect(section('Age')).toHaveTextContent('Elves reach adulthood around 100.');
      expect(section('Alignment')).toHaveTextContent('Elves lean toward chaotic good.');
      expect(section('Size')).toHaveTextContent('Elves stand between 5 and 6 feet tall.');
    });

    it('omits each heading when its field is absent', () => {
      renderDetail(makeRace({ age: undefined, alignment: undefined, sizeDescription: undefined }));

      expect(screen.queryByRole('heading', { name: 'Age' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Alignment' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Size' })).not.toBeInTheDocument();
    });
  });

  it('renders the Languages section even when the race speaks none', () => {
    renderDetail(makeRace({ languages: [] }));

    expect(screen.getByRole('heading', { name: 'Languages' })).toBeInTheDocument();
  });

  it('does not render subraces, which the list payload never carries', () => {
    renderDetail(
      makeRace({
        subraces: [{ id: 'subrace-high', name: 'High Elf', raceId: 'race-1', source: 'SRD 5.2.1' }],
      })
    );

    expect(screen.queryByText('High Elf')).not.toBeInTheDocument();
  });
});
