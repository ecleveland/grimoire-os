import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ABILITY_NAMES, SKILL_NAMES } from '@grimoire-os/shared';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateClassDto } from './create-class.dto';
import { UpdateClassDto } from './update-class.dto';

// Through the production pipe config (whitelist + forbidNonWhitelisted +
// implicit conversion). The DTO is the input boundary for homebrew class
// writes, so its constraints — not a service backstop — are what reject a
// malformed body or an ownership-injecting one (the VEG-349 lesson).
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateClassDto };
const updateMeta = { type: 'body' as const, metatype: UpdateClassDto };

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Warden',
    hitDie: 'd10',
    ...over,
  };
}

const reject = (body: Record<string, unknown>, meta: ArgumentMetadata = createMeta) =>
  expect(pipe.transform(body, meta)).rejects.toThrow();
const accept = (body: Record<string, unknown>, meta: ArgumentMetadata = createMeta) =>
  expect(pipe.transform(body, meta)).resolves.toBeDefined();

describe('CreateClassDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Warden', hitDie: 'd10' })
    );
  });

  it('accepts a fully-populated body', async () => {
    await accept(
      validBody({
        description: 'A sworn protector of wild places.',
        primaryAbilities: ['Strength'],
        savingThrows: ['Strength', 'Constitution'],
        armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
        weaponProficiencies: ['Simple weapons', 'Martial weapons'],
        skillChoices: ['Athletics', 'Survival'],
        toolProficiencies: ['Herbalism Kit'],
        numSkillChoices: 2,
        subclassLevel: 3,
        spellcasting: {
          ability: 'Wisdom',
          spellSlotProgression: { 1: { 1: 2 } },
          cantripsKnown: { 1: 2 },
          preparedFormula: 'Wisdom modifier + half your level',
        },
        equipmentChoices: {
          choices: [{ choose: 1, from: [{ items: [{ name: 'A greataxe', quantity: 1 }] }] }],
          guaranteed: [{ name: "Explorer's Pack", quantity: 1 }],
          startingGold: '5d4 x 10 gp',
        },
        multiclassing: {
          prerequisites: [{ ability: 'Strength', minimum: 13 }],
          proficienciesGained: ['Light armor', 'Martial weapons'],
          casterType: null,
        },
      })
    );
  });

  // ── Identity and the reserved columns ─────────────────

  it('requires a name', async () => {
    const { name: _dropped, ...rest } = validBody();
    await reject(rest);
  });

  it.each(['contentSource', 'createdById', 'campaignId', 'id', 'source'])(
    'rejects the reserved column %s outright',
    async column => {
      await reject(validBody({ [column]: 'anything' }));
    }
  );

  // ── hitDie is a closed set, not a free string ─────────

  it.each(['d4', 'd6', 'd8', 'd10', 'd12'])('accepts the real die %s', async die => {
    await accept(validBody({ hitDie: die }));
  });

  it.each(['d7', 'd3', '10', 'D10', ''])('rejects the non-die %s', async die => {
    await reject(validBody({ hitDie: die }));
  });

  // ── Bounded integers (VEG-496 rule: every Int-backed field) ──

  it.each([-1, 19, 1.5])('rejects numSkillChoices %s', async value => {
    await reject(validBody({ numSkillChoices: value }));
  });

  it.each([0, 2, 18])('accepts numSkillChoices %s', async value => {
    await accept(validBody({ numSkillChoices: value }));
  });

  it.each([0, 21, 2.5])('rejects subclassLevel %s', async value => {
    await reject(validBody({ subclassLevel: value }));
  });

  // ── Closed catalogs on the ability/skill arrays ───────

  it('rejects an ability name outside the catalog', async () => {
    await reject(validBody({ primaryAbilities: ['Charm'] }));
    await reject(validBody({ savingThrows: ['Charm'] }));
  });

  it('rejects a skill name outside the catalog', async () => {
    await reject(validBody({ skillChoices: ['Basket Weaving'] }));
  });

  it('accepts every catalog member', async () => {
    await accept(validBody({ primaryAbilities: [...ABILITY_NAMES] }));
    await accept(validBody({ skillChoices: [...SKILL_NAMES] }));
  });

  // ── Array caps (VEG-334) ──────────────────────────────

  it.each([
    ['primaryAbilities', 7, 'Strength'],
    ['savingThrows', 7, 'Strength'],
    ['skillChoices', 19, 'Athletics'],
    ['armorProficiencies', 21, 'Light armor'],
    ['weaponProficiencies', 51, 'Club'],
    ['toolProficiencies', 51, 'Thieves’ Tools'],
  ])('caps %s past its limit', async (field, overBy, filler) => {
    await reject(validBody({ [field]: Array<string>(overBy).fill(filler) }));
  });

  // ── spellcasting: a shape, not arbitrary JSON ─────────

  it('requires spellcasting.ability when spellcasting is present', async () => {
    await reject(validBody({ spellcasting: { pactMagic: true } }));
  });

  it('rejects a non-object spellcasting', async () => {
    await reject(validBody({ spellcasting: 'Wisdom' }));
    await reject(validBody({ spellcasting: [] }));
  });

  it('rejects unknown keys inside spellcasting', async () => {
    await reject(validBody({ spellcasting: { ability: 'Wisdom', bogusKey: 1 } }));
  });

  it('rejects a non-numeric slot count in the progression table', async () => {
    await reject(
      validBody({ spellcasting: { ability: 'Wisdom', spellSlotProgression: { 1: { 1: 'two' } } } })
    );
  });

  // pactMagic is a boolean, and the global pipe's enableImplicitConversion turns
  // any truthy value into `true` before a validator sees it. VEG-323 is why
  // IsStrictBoolean exists; the guardrail spec only greps for @IsBoolean(, so a
  // hand-rolled boolean check slips past both.
  it.each(['false', 'no', 1, {}])('rejects the non-boolean pactMagic %s', async value => {
    await reject(validBody({ spellcasting: { ability: 'Wisdom', pactMagic: value } }));
  });

  it.each([true, false])('accepts the real boolean pactMagic %s', async value => {
    await accept(validBody({ spellcasting: { ability: 'Wisdom', pactMagic: value } }));
  });

  // ── equipmentChoices ──────────────────────────────────

  it('rejects an equipment choice missing its `choose` count', async () => {
    await reject(
      validBody({
        equipmentChoices: { choices: [{ from: [{ items: [{ name: 'Axe', quantity: 1 }] }] }] },
      })
    );
  });

  it('rejects an equipment item with a non-numeric quantity', async () => {
    await reject(
      validBody({
        equipmentChoices: {
          choices: [{ choose: 1, from: [{ items: [{ name: 'Axe', quantity: 'one' }] }] }],
        },
      })
    );
  });

  it('rejects an explicit null inside a Json blob, where there is no column to clear', async () => {
    // @IsOptional() means "null clears this column" (VEG-316), which is meaningless
    // inside a Json object and would store a null the shared type forbids.
    await reject(validBody({ spellcasting: { ability: 'Wisdom', spellSlotProgression: null } }));
    await reject(
      validBody({
        multiclassing: {
          prerequisites: [],
          proficienciesGained: [],
          casterType: null,
          prerequisiteLogic: null,
        },
      })
    );
  });

  it('still allows null to clear the Json column itself', async () => {
    await accept(validBody({ spellcasting: null, multiclassing: null }));
  });

  it('requires casterType — nullable is not the same as optional', async () => {
    await reject(validBody({ multiclassing: { prerequisites: [], proficienciesGained: [] } }));
  });

  // ── multiclassing ─────────────────────────────────────

  it.each(['full', 'half', 'pact', null])('accepts casterType %s', async casterType => {
    await accept(
      validBody({
        multiclassing: { prerequisites: [], proficienciesGained: [], casterType },
      })
    );
  });

  it('rejects a casterType outside the union', async () => {
    await reject(
      validBody({
        multiclassing: { prerequisites: [], proficienciesGained: [], casterType: 'third' },
      })
    );
  });

  it('rejects a multiclass prerequisite with a non-numeric minimum', async () => {
    await reject(
      validBody({
        multiclassing: {
          prerequisites: [{ ability: 'Strength', minimum: 'thirteen' }],
          proficienciesGained: [],
          casterType: null,
        },
      })
    );
  });

  it('rejects AND — absent already means every prerequisite must be met', async () => {
    await reject(
      validBody({
        multiclassing: {
          prerequisites: [],
          proficienciesGained: [],
          casterType: null,
          prerequisiteLogic: 'AND',
        },
      })
    );
  });
});

describe('UpdateClassDto', () => {
  it('accepts a partial body', async () => {
    await accept({ description: 'Rewritten.' }, updateMeta);
  });

  it('still enforces the create constraints on the fields it does carry', async () => {
    await reject({ hitDie: 'd7' }, updateMeta);
    await reject({ numSkillChoices: 99 }, updateMeta);
    await reject(
      { multiclassing: { prerequisites: [], proficienciesGained: [], casterType: 'x' } },
      updateMeta
    );
  });

  it('still rejects the reserved columns', async () => {
    await reject({ contentSource: 'srd' }, updateMeta);
    await reject({ createdById: 'someone-else' }, updateMeta);
  });
});
