import { Prisma } from '@prisma/client';
import { getMetadataStorage } from 'class-validator';
import { CreateCampaignDto } from '../campaigns/dto/create-campaign.dto';
import { CreateCharacterDto } from '../characters/dto/create-character.dto';
import { UpdateEncounterDto } from '../encounters/dto/update-encounter.dto';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { UpdateNoteDto } from '../notes/dto/update-note.dto';

/**
 * Every DTO that writes a Prisma `Int` column, paired with the model it writes.
 *
 * Prisma throws in the driver for a non-integer or out-of-int4 value, so a
 * field that reaches it carrying only `@IsNumber()` turns a 400 at the boundary
 * into a 500 from the database. `create-character.dto.ts` had that gap three
 * separate times (experiencePoints, level, initiative), each found one field at
 * a time by whichever reviewer happened to look. This walks the schema instead,
 * so the next one fails here rather than in production.
 *
 * Add a pair whenever a DTO starts writing Int columns on a new model. Nested
 * DTOs for Json columns (CombatantDto inside `Encounter.combatants`) stay out:
 * int4 never applies to them.
 *
 * Known limit, so nobody reads this as more than it is: the registry is the
 * coverage. A brand-new DTO writing a model nobody listed here is invisible to
 * this test. It closes the "someone added an Int field to a DTO we already
 * guard" hole, which is how all three prior instances happened, not the "someone
 * wrote a whole new write path" one. Enumerating every Int column in the schema
 * instead would flag the SRD and seed-only tables that have no DTO at all, and
 * a guard that cries wolf gets deleted.
 */
const GUARDED: ReadonlyArray<readonly [new () => object, string]> = [
  [CreateCharacterDto, 'Character'],
  [CreateCampaignDto, 'Campaign'],
  [CreateNoteDto, 'Note'],
  [UpdateNoteDto, 'Note'],
  [UpdateEncounterDto, 'Encounter'],
];

/** `@IsInt` alone still lets an out-of-int4 integer through, so bounds count too. */
const REQUIRED = ['isInt', 'min', 'max'] as const;

function intColumnsOf(model: string): string[] {
  const found = Prisma.dmmf.datamodel.models.find(m => m.name === model);
  if (!found) return [];
  return found.fields.filter(f => f.kind === 'scalar' && f.type === 'Int').map(f => f.name);
}

/**
 * Validation metadata for one DTO, grouped by property. `getTargetValidationMetadatas`
 * walks the prototype chain, so `PartialType`/`OmitType` inheritance is included.
 */
function decoratorsByProperty(target: new () => object): Map<string, Set<string>> {
  const byProperty = new Map<string, Set<string>>();
  for (const meta of getMetadataStorage().getTargetValidationMetadatas(target, '', false, false)) {
    const names = byProperty.get(meta.propertyName) ?? new Set<string>();
    names.add(meta.name ?? '');
    byProperty.set(meta.propertyName, names);
  }
  return byProperty;
}

describe('Int-backed DTO fields are bounded at the write boundary', () => {
  // A guard that silently checks nothing is worse than no guard: if the Prisma
  // client is stale or ungenerated the DMMF lookup returns nothing, every
  // intersection below comes out empty, and the real assertion passes vacuously.
  it.each([...new Set(GUARDED.map(([, model]) => model))])(
    'resolves %s in the generated Prisma schema',
    model => {
      expect(intColumnsOf(model).length).toBeGreaterThan(0);
    }
  );

  it('requires @IsInt with @Min and @Max on every DTO field backed by an Int column', () => {
    const violations: string[] = [];

    for (const [dto, model] of GUARDED) {
      const intColumns = new Set(intColumnsOf(model));
      for (const [property, decorators] of decoratorsByProperty(dto)) {
        if (!intColumns.has(property)) continue;
        const missing = REQUIRED.filter(name => !decorators.has(name));
        if (missing.length > 0) {
          violations.push(
            `${dto.name}.${property} (${model}.${property} Int) missing @${missing.join(', @')}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
