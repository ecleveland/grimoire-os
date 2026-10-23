import { describe, it, expect } from 'vitest';
import { splitFeatureOptions } from '@/lib/feature-options';

const INTRO = "You can't pick the same invocation more than once.";

function withOptions(...entries: string[]): string {
  return [INTRO, '', '**Options**', '', ...entries].join('\n');
}

describe('splitFeatureOptions', () => {
  it('returns the description untouched when it has no marker', () => {
    const description = '**Cantrips.** You know two cantrips.\n\nSecond paragraph.\n';

    expect(splitFeatureOptions(description)).toEqual({ body: description, options: [] });
  });

  it('splits a Prerequisite option and a Cost option off the body', () => {
    const description = withOptions(
      '**Agonizing Blast**',
      '',
      'Prerequisite: Level 2+ Warlock',
      '',
      'Add your Charisma modifier to the damage.',
      '',
      '**Careful Spell**',
      '',
      'Cost: 1 Sorcery Point',
      '',
      'Protect some creatures from the spell.'
    );

    expect(splitFeatureOptions(description)).toEqual({
      body: INTRO,
      options: [
        {
          name: 'Agonizing Blast',
          meta: 'Prerequisite: Level 2+ Warlock',
          description: 'Add your Charisma modifier to the damage.',
        },
        {
          name: 'Careful Spell',
          meta: 'Cost: 1 Sorcery Point',
          description: 'Protect some creatures from the spell.',
        },
      ],
    });
  });

  it('leaves meta off an option whose first paragraph is its text', () => {
    const { options } = splitFeatureOptions(
      withOptions('**Armor of Shadows**', '', 'You can cast Mage Armor on yourself.')
    );

    expect(options).toEqual([
      { name: 'Armor of Shadows', description: 'You can cast Mage Armor on yourself.' },
    ]);
    expect(options[0]).not.toHaveProperty('meta');
  });

  it('keeps run-in heads and bullet lists inside the option they follow', () => {
    const text = [
      'Choose one of your known Warlock cantrips.',
      '',
      '**Repeatable.** You can gain this invocation more than once.',
      '',
      '- First choice',
      '- Second choice',
    ].join('\n');

    const { options } = splitFeatureOptions(
      withOptions('**Agonizing Blast**', '', 'Prerequisite: Level 2+ Warlock', '', text)
    );

    expect(options).toHaveLength(1);
    expect(options[0].description).toBe(text);
  });

  it('falls back to the full description when nothing follows the marker', () => {
    const description = `${INTRO}\n\n**Options**\n`;

    expect(splitFeatureOptions(description)).toEqual({ body: description, options: [] });
  });

  it('falls back to the full description when no name line follows the marker', () => {
    const description = `${INTRO}\n\n**Options**\n\nPick any two from the list in the rules.`;

    expect(splitFeatureOptions(description)).toEqual({ body: description, options: [] });
  });

  it('does not treat an inline bold Options run-in head as the marker', () => {
    const description = '**Options:** pick one.\n\n**Fire**\n\nBurns.';

    expect(splitFeatureOptions(description)).toEqual({ body: description, options: [] });
  });

  it('strips trailing blank lines from the body', () => {
    const { body } = splitFeatureOptions(
      `${INTRO}\n\n\n  \n**Options**\n\n**Armor of Shadows**\n\nMage Armor at will.`
    );

    expect(body).toBe(INTRO);
  });

  it('starts an option at a name line with spaces around it', () => {
    const { options } = splitFeatureOptions(
      withOptions('  **Armor of Shadows**  ', '', 'Mage Armor at will.')
    );

    expect(options).toEqual([{ name: 'Armor of Shadows', description: 'Mage Armor at will.' }]);
  });

  it('never turns the marker line itself into an option', () => {
    const { options } = splitFeatureOptions(
      withOptions('**Armor of Shadows**', '', 'Mage Armor at will.')
    );

    expect(options.map(o => o.name)).toEqual(['Armor of Shadows']);
  });

  it('keeps text between the marker and the first option in the body', () => {
    const { body, options } = splitFeatureOptions(
      withOptions('Choose from the list below.', '', '**Armor of Shadows**', '', 'Mage Armor.')
    );

    expect(body).toBe(`${INTRO}\n\nChoose from the list below.`);
    expect(options).toEqual([{ name: 'Armor of Shadows', description: 'Mage Armor.' }]);
  });

  it('keeps a later Options line as text of the option it falls in', () => {
    const { options } = splitFeatureOptions(
      withOptions(
        '**Armor of Shadows**',
        '',
        'Mage Armor at will.',
        '',
        '**Options**',
        '',
        'Pick a color.',
        '',
        '**Fiendish Vigor**',
        '',
        'False Life at will.'
      )
    );

    expect(options).toEqual([
      {
        name: 'Armor of Shadows',
        description: 'Mage Armor at will.\n\n**Options**\n\nPick a color.',
      },
      { name: 'Fiendish Vigor', description: 'False Life at will.' },
    ]);
  });

  it('gives an option with no text an empty description', () => {
    const { options } = splitFeatureOptions(
      withOptions(
        '**Armor of Shadows**',
        '',
        'Prerequisite: Level 2+ Warlock',
        '',
        '**Fiendish Vigor**'
      )
    );

    expect(options).toEqual([
      { name: 'Armor of Shadows', meta: 'Prerequisite: Level 2+ Warlock', description: '' },
      { name: 'Fiendish Vigor', description: '' },
    ]);
  });
});
