import {
  adjustedAgeForRelation,
  extractFamilyName,
  pickChildRace,
  swapFamilyName,
} from './relation-constraints';

describe('extractFamilyName', () => {
  it.each([
    ['Old Maelin', 'Maelin'],
    ['Jane Doe', 'Doe'],
    ['Jane Doe Smith', 'Smith'],
    ['  Aria   Stormwind  ', 'Stormwind'],
  ])('returns the last token of %s -> %s', (input, expected) => {
    expect(extractFamilyName(input)).toBe(expected);
  });

  it.each(['Solo', '', '   '])('returns null when no family name (%s)', input => {
    expect(extractFamilyName(input)).toBeNull();
  });
});

describe('swapFamilyName', () => {
  it('replaces the last token with the family name', () => {
    expect(swapFamilyName('Aldric the Mighty', 'Stormwind')).toBe('Aldric the Stormwind');
  });

  it('appends family name to a single-token first name', () => {
    expect(swapFamilyName('Aldric', 'Stormwind')).toBe('Aldric Stormwind');
  });

  it('returns generated name unchanged when no family name supplied', () => {
    expect(swapFamilyName('Aldric the Mighty', null)).toBe('Aldric the Mighty');
  });

  it('returns the family name alone when generated name is empty', () => {
    expect(swapFamilyName('', 'Stormwind')).toBe('Stormwind');
  });

  it('handles internal whitespace', () => {
    expect(swapFamilyName('  Aldric   the   Brave  ', 'Doe')).toBe('Aldric the Doe');
  });
});

describe('pickChildRace', () => {
  it.each([
    ['Human', 'Elf', 'Half-Elf'],
    ['Elf', 'Human', 'Half-Elf'],
    ['Human', 'Orc', 'Half-Orc'],
    ['Orc', 'Human', 'Half-Orc'],
    ['Elf', 'Orc', 'Half-Orc'],
  ])('maps mixed-race pair (%s, %s) -> %s', (a, b, expected) => {
    expect(pickChildRace(a, b)).toBe(expected);
  });

  it('returns the parent race when both parents share a race', () => {
    expect(pickChildRace('Human', 'Human')).toBe('Human');
    expect(pickChildRace('Dwarf', 'Dwarf')).toBe('Dwarf');
  });

  it('falls back to source parent when no canonical half-X exists', () => {
    expect(pickChildRace('Human', 'Dwarf')).toBe('Human');
    expect(pickChildRace('Tiefling', 'Halfling')).toBe('Tiefling');
  });

  it('returns source race when second parent is unknown', () => {
    expect(pickChildRace('Human', null)).toBe('Human');
  });
});

describe('adjustedAgeForRelation', () => {
  it('adds 25 for parent', () => {
    expect(adjustedAgeForRelation(30, 'parent')).toBe(55);
  });

  it('subtracts 25 for child (clamps to 0 minimum)', () => {
    expect(adjustedAgeForRelation(30, 'child')).toBe(5);
    expect(adjustedAgeForRelation(20, 'child')).toBe(0);
    expect(adjustedAgeForRelation(0, 'child')).toBe(0);
  });

  it('returns a deterministic ±5 offset for sibling using seed', () => {
    const first = adjustedAgeForRelation(40, 'sibling', 'seed-a');
    const second = adjustedAgeForRelation(40, 'sibling', 'seed-a');
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(35);
    expect(first).toBeLessThanOrEqual(45);
  });

  it('returns null for spouse, friend, or unknown relations', () => {
    expect(adjustedAgeForRelation(30, 'spouse')).toBeNull();
    expect(adjustedAgeForRelation(30, 'friend')).toBeNull();
    expect(adjustedAgeForRelation(30, 'rival')).toBeNull();
    expect(adjustedAgeForRelation(30, 'mentor')).toBeNull();
    expect(adjustedAgeForRelation(30, 'blood-bound')).toBeNull();
  });

  it('returns null when source age is null', () => {
    expect(adjustedAgeForRelation(null, 'parent')).toBeNull();
    expect(adjustedAgeForRelation(null, 'sibling', 'seed')).toBeNull();
  });
});
