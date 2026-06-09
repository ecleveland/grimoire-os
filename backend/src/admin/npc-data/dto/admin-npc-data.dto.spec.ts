import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateNameRowDto } from './create-name-row.dto';
import { CreateAppearanceRowDto } from './create-appearance-row.dto';
import { CreateLootTemplateRowDto } from './create-loot-template-row.dto';
import { CreateTrinketRowDto } from './create-trinket-row.dto';
import { CreatePersonalityRowDto } from './create-personality-row.dto';
import { SetActiveDto } from './set-active.dto';

function validate<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(cls, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

function messages(errors: ReturnType<typeof validateSync>) {
  return errors.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('CreateNameRowDto', () => {
  it('accepts a valid row with optional gender omitted', () => {
    expect(validate(CreateNameRowDto, { race: 'Elf', kind: 'first', value: 'Arannis' })).toEqual(
      []
    );
  });

  it('accepts a valid row with gender', () => {
    expect(
      validate(CreateNameRowDto, { race: 'Elf', gender: 'female', kind: 'first', value: 'Arannis' })
    ).toEqual([]);
  });

  it('rejects a missing required field', () => {
    const errors = validate(CreateNameRowDto, { race: 'Elf' });
    expect(messages(errors)).toEqual(expect.arrayContaining(['kind is required']));
  });

  it('rejects a whitespace-only required field', () => {
    const errors = validate(CreateNameRowDto, { race: '  ', kind: 'first', value: 'Arannis' });
    expect(messages(errors)).toEqual(expect.arrayContaining(['race is required']));
  });

  it('rejects a non-string gender', () => {
    const errors = validate(CreateNameRowDto, {
      race: 'Elf',
      gender: 42,
      kind: 'first',
      value: 'Arannis',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown extra fields', () => {
    const errors = validate(CreateNameRowDto, {
      race: 'Elf',
      kind: 'first',
      value: 'Arannis',
      source: 'curated',
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('source should not exist')])
    );
  });
});

describe('CreateAppearanceRowDto', () => {
  it('accepts a valid row', () => {
    expect(
      validate(CreateAppearanceRowDto, { race: 'Dwarf', category: 'hair', trait: 'Copper beard' })
    ).toEqual([]);
  });

  it('rejects a missing trait', () => {
    const errors = validate(CreateAppearanceRowDto, { race: 'Dwarf', category: 'hair' });
    expect(messages(errors)).toEqual(expect.arrayContaining(['trait is required']));
  });
});

describe('CreateLootTemplateRowDto', () => {
  const valid = {
    profession: 'merchant',
    crBucket: '0-4',
    coinage: { gp: '2d6' },
    items: [{ name: 'ledger' }],
  };

  it('accepts a valid row', () => {
    expect(validate(CreateLootTemplateRowDto, valid)).toEqual([]);
  });

  it('rejects a non-object coinage', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, coinage: [1, 2] });
    expect(messages(errors)).toEqual(expect.arrayContaining(['coinage must be an object']));
  });

  it('rejects non-array items', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, items: { name: 'ledger' } });
    expect(messages(errors)).toEqual(expect.arrayContaining(['items must be an array']));
  });
});

describe('CreateTrinketRowDto', () => {
  it('accepts a valid row', () => {
    expect(validate(CreateTrinketRowDto, { description: 'A glass eye.' })).toEqual([]);
  });

  it('rejects an empty description', () => {
    const errors = validate(CreateTrinketRowDto, { description: '' });
    expect(messages(errors)).toEqual(expect.arrayContaining(['description is required']));
  });
});

describe('CreatePersonalityRowDto', () => {
  const valid = { background: 'Acolyte', kind: 'ideals', value: 'Faith above all.' };

  it('accepts a valid row', () => {
    expect(validate(CreatePersonalityRowDto, valid)).toEqual([]);
  });

  it.each(['personalityTraits', 'ideals', 'bonds', 'flaws'])('accepts kind %s', kind => {
    expect(validate(CreatePersonalityRowDto, { ...valid, kind })).toEqual([]);
  });

  it('rejects an invalid kind', () => {
    const errors = validate(CreatePersonalityRowDto, { ...valid, kind: 'nonsense' });
    expect(messages(errors)).toEqual(
      expect.arrayContaining(['kind must be one of personalityTraits|ideals|bonds|flaws'])
    );
  });

  it('rejects a client-supplied addedById', () => {
    const errors = validate(CreatePersonalityRowDto, { ...valid, addedById: 'someone-else' });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('addedById should not exist')])
    );
  });
});

describe('SetActiveDto', () => {
  it('accepts a boolean isActive', () => {
    expect(validate(SetActiveDto, { isActive: false })).toEqual([]);
  });

  it('rejects a non-boolean isActive', () => {
    const errors = validate(SetActiveDto, { isActive: 'false' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing isActive', () => {
    const errors = validate(SetActiveDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });
});
