import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../../bootstrap-config';
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

function messages(errors: ReturnType<typeof validateSync>): string[] {
  return errors.flatMap(e => [
    ...Object.values(e.constraints ?? {}),
    ...messages(e.children ?? []),
  ]);
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
    crBucket: '2–4', // en-dash, matching LOOT_CR_BUCKETS
    coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
    items: [{ itemName: 'Dagger', weight: 60, qty: [1, 1] }],
  };

  it('accepts a valid structured row', () => {
    expect(validate(CreateLootTemplateRowDto, valid)).toEqual([]);
  });

  it('accepts a zero item weight alongside a positive one', () => {
    expect(
      validate(CreateLootTemplateRowDto, {
        ...valid,
        items: [
          { itemName: 'Dagger', weight: 0, qty: [1, 1] },
          { itemName: 'Club', weight: 50, qty: [1, 1] },
        ],
      })
    ).toEqual([]);
  });

  it('rejects items where every weight is 0 (weightedPick would throw at generation)', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [
        { itemName: 'Dagger', weight: 0, qty: [1, 1] },
        { itemName: 'Club', weight: 0, qty: [1, 1] },
      ],
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('weight > 0')])
    );
  });

  it('rejects duplicate itemName entries', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [
        { itemName: 'Dagger', weight: 60, qty: [1, 1] },
        { itemName: 'Dagger', weight: 20, qty: [1, 2] },
      ],
    });
    expect(messages(errors)).toEqual(expect.arrayContaining([expect.stringContaining('unique')]));
  });

  it('rejects the legacy string-dice coinage shape', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { gp: '2d6', sp: [2, 8], cp: [4, 20] },
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('gp must be a [min, max] pair')])
    );
  });

  it.each([[[1]], [[1, 2, 3]]])('rejects a range with wrong arity %j', range => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { ...valid.coinage, gp: range },
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('gp must be a [min, max] pair')])
    );
  });

  it('rejects a crBucket outside LOOT_CR_BUCKETS (ASCII hyphen never matches a template)', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, crBucket: '2-4' });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('crBucket must be one of')])
    );
  });

  it('rejects a non-object coinage', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, coinage: [1, 2] });
    expect(messages(errors)).toEqual(expect.arrayContaining(['coinage must be an object']));
  });

  it('rejects coinage missing a denomination', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { gp: [0, 2], sp: [2, 8] },
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('cp must be a [min, max] pair')])
    );
  });

  it('rejects an unordered coinage range', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { ...valid.coinage, gp: [5, 2] },
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('gp must be a [min, max] pair')])
    );
  });

  it('rejects negative coinage values', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { ...valid.coinage, gp: [-1, 2] },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-integer coinage values', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { ...valid.coinage, gp: [0.5, 2] },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown extra coinage denominations', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      coinage: { ...valid.coinage, pp: [0, 1] },
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('pp should not exist')])
    );
  });

  it('rejects non-array items', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, items: { name: 'ledger' } });
    expect(messages(errors)).toEqual(expect.arrayContaining(['items must be an array']));
  });

  it('rejects an empty items array', () => {
    const errors = validate(CreateLootTemplateRowDto, { ...valid, items: [] });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('at least one item')])
    );
  });

  it('rejects a blank itemName', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [{ itemName: '   ', weight: 60, qty: [1, 1] }],
    });
    expect(messages(errors)).toEqual(expect.arrayContaining(['itemName is required']));
  });

  it('rejects a negative item weight', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [{ itemName: 'Dagger', weight: -1, qty: [1, 1] }],
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('weight must not be less than 0')])
    );
  });

  it('rejects an unordered qty range', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [{ itemName: 'Dagger', weight: 60, qty: [3, 1] }],
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('qty must be a [min, max] pair')])
    );
  });

  it('rejects a qty below 1', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [{ itemName: 'Dagger', weight: 60, qty: [0, 1] }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown extra fields on an item entry', () => {
    const errors = validate(CreateLootTemplateRowDto, {
      ...valid,
      items: [{ itemName: 'Dagger', weight: 60, qty: [1, 1], chance: 0.5 }],
    });
    expect(messages(errors)).toEqual(
      expect.arrayContaining([expect.stringContaining('chance should not exist')])
    );
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

  // The unit checks above bypass the transform step; this block runs the DTO
  // through the production pipe config, where enableImplicitConversion would
  // otherwise coerce any non-empty string (including 'false') to true.
  describe('through the production ValidationPipe', () => {
    const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
    const meta = { type: 'body' as const, metatype: SetActiveDto };

    it('accepts a real boolean', async () => {
      await expect(pipe.transform({ isActive: false }, meta)).resolves.toEqual(
        expect.objectContaining({ isActive: false })
      );
    });

    it("rejects the string 'false' instead of coercing it to true", async () => {
      await expect(pipe.transform({ isActive: 'false' }, meta)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it("rejects the string 'true'", async () => {
      await expect(pipe.transform({ isActive: 'true' }, meta)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });
});
