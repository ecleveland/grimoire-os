import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BackgroundDetail, { BackgroundSubtitle } from '../BackgroundDetail';
import type { SrdBackground } from '@/lib/types';

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'bg-1',
    name: 'Gravedigger',
    description: 'You turned the earth over the parish dead.',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: ["Mason's tools"],
    languages: 2,
    equipment: 'Shovel, holy symbol, 10 GP',
    features: [
      { name: 'Grave Knowledge', description: 'You know who is buried where.' },
      { name: 'Quiet Company', description: 'The night shift never questions you.' },
    ],
    originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
    originFeatOption: 'Cleric',
    personalityTraits: ['I speak softly around strangers.'],
    ideals: ['Rest. Everyone has earned it.'],
    bonds: ['The parish I served.'],
    flaws: ['I answer the dead out loud.'],
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

/** A background with every optional section left out. */
const BARE = makeBackground({
  description: undefined,
  toolProficiencies: [],
  languages: 0,
  equipment: undefined,
  features: [],
  personalityTraits: [],
  ideals: [],
  bonds: [],
  flaws: [],
});

/** Every section the component can render, none of which a bare background has. */
const SECTION_HEADINGS = [
  'Tool Proficiencies',
  'Languages',
  'Equipment',
  'Features',
  'Personality Traits',
  'Ideals',
  'Bonds',
  'Flaws',
];

/** The element wrapping a section heading and its content. */
function section(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).parentElement!;
}

describe('BackgroundDetail', () => {
  it('renders the description and every section a populated background has', () => {
    render(<BackgroundDetail background={makeBackground()} />);

    expect(screen.getByText('You turned the earth over the parish dead.')).toBeInTheDocument();
    expect(section('Tool Proficiencies')).toHaveTextContent("Mason's tools");
    expect(section('Languages')).toHaveTextContent('2 additional languages');
    expect(section('Equipment')).toHaveTextContent('Shovel, holy symbol, 10 GP');

    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grave Knowledge' })).toBeInTheDocument();
    expect(screen.getByText('You know who is buried where.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quiet Company' })).toBeInTheDocument();
    expect(screen.getByText('The night shift never questions you.')).toBeInTheDocument();

    expect(section('Personality Traits')).toHaveTextContent('I speak softly around strangers.');
    expect(section('Ideals')).toHaveTextContent('Rest. Everyone has earned it.');
    expect(section('Bonds')).toHaveTextContent('The parish I served.');
    expect(section('Flaws')).toHaveTextContent('I answer the dead out loud.');
  });

  // The list card nests this under its own h2, so h3 sections keep that outline
  // whole. The background page has only an h1 above it, and h3 there would skip
  // a level, so the caller picks.
  it('renders every section heading at level 3 by default', () => {
    render(<BackgroundDetail background={makeBackground()} />);

    for (const heading of SECTION_HEADINGS) {
      expect(screen.getByRole('heading', { level: 3, name: heading })).toBeInTheDocument();
    }
  });

  it('renders every section heading at level 2 when the caller asks for it', () => {
    render(<BackgroundDetail background={makeBackground()} headingLevel={2} />);

    for (const heading of SECTION_HEADINGS) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  // Feature names are headings, not bold text, so a screen reader can jump
  // between them instead of reading the whole section to find one.
  it('renders each feature name one level below the section heading', () => {
    render(<BackgroundDetail background={makeBackground()} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Grave Knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Quiet Company' })).toBeInTheDocument();
  });

  it('keeps feature names one level below a level-2 section heading', () => {
    render(<BackgroundDetail background={makeBackground()} headingLevel={2} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Grave Knowledge' })).toBeInTheDocument();
  });

  it('omits every optional section when the background has none of them', () => {
    render(<BackgroundDetail background={BARE} />);

    for (const heading of SECTION_HEADINGS) {
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText('You turned the earth over the parish dead.')
    ).not.toBeInTheDocument();
  });

  it('drops the features section when the feature list is empty', () => {
    render(<BackgroundDetail background={makeBackground({ features: [] })} />);

    expect(screen.queryByRole('heading', { name: 'Features' })).not.toBeInTheDocument();
    expect(screen.queryByText('Grave Knowledge')).not.toBeInTheDocument();
  });

  // A payload without a features array breaks the API contract. The rest of the
  // background still has to render, because dropping it loses the whole card.
  it('renders the other sections when the payload carries no features at all', () => {
    render(<BackgroundDetail background={makeBackground({ features: undefined })} />);

    expect(screen.queryByRole('heading', { name: 'Features' })).not.toBeInTheDocument();
    expect(section('Tool Proficiencies')).toHaveTextContent("Mason's tools");
  });

  it('writes a single extra language in the singular', () => {
    render(<BackgroundDetail background={makeBackground({ languages: 1 })} />);

    expect(section('Languages')).toHaveTextContent('1 additional language');
    expect(section('Languages')).not.toHaveTextContent('languages');
  });

  it('writes several extra languages in the plural', () => {
    render(<BackgroundDetail background={makeBackground({ languages: 3 })} />);

    expect(section('Languages')).toHaveTextContent('3 additional languages');
  });

  it('gives every roleplay entry its own list item', () => {
    render(<BackgroundDetail background={makeBackground({ ideals: ['Rest.', 'Dignity.'] })} />);

    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'I speak softly around strangers.',
      'Rest.',
      'Dignity.',
      'The parish I served.',
      'I answer the dead out loud.',
    ]);
  });

  // Roleplay entries are free text a homebrew author types, under no uniqueness
  // constraint, so keying a row by its text collapses a repeat into one row.
  it('renders a repeated roleplay entry as two rows', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<BackgroundDetail background={makeBackground({ ideals: ['Rest.', 'Rest.'] })} />);

    expect(screen.getAllByText('Rest.')).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('BackgroundSubtitle', () => {
  it('lists the skills, the origin feat and its chosen option in its own styling', () => {
    render(<BackgroundSubtitle background={makeBackground()} />);

    expect(
      screen.getByText('Skills: Insight, Religion · Feat: Magic Initiate (Cleric)')
    ).toHaveClass('text-sm', 'text-gray-500', 'dark:text-gray-400');
  });

  it('appends a caller class to its own', () => {
    render(<BackgroundSubtitle background={makeBackground()} className="mt-1" />);

    expect(
      screen.getByText('Skills: Insight, Religion · Feat: Magic Initiate (Cleric)')
    ).toHaveClass('text-sm', 'text-gray-500', 'dark:text-gray-400', 'mt-1');
  });

  it('drops the option when the origin feat takes none', () => {
    render(<BackgroundSubtitle background={makeBackground({ originFeatOption: null })} />);

    expect(
      screen.getByText('Skills: Insight, Religion · Feat: Magic Initiate')
    ).toBeInTheDocument();
  });

  it('shows the skills alone when the background has no origin feat', () => {
    render(
      <BackgroundSubtitle
        background={makeBackground({ originFeat: null, originFeatOption: null })}
      />
    );

    expect(screen.getByText('Skills: Insight, Religion')).toBeInTheDocument();
    expect(screen.queryByText(/Feat:/)).not.toBeInTheDocument();
  });
});
