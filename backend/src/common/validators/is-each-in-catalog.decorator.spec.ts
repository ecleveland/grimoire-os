import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsArray, IsOptional } from 'class-validator';
import { IsEachInCatalog } from './is-each-in-catalog.decorator';

const CATALOG = ['Athletics', 'Stealth', 'Sleight of Hand'] as const;

class Subject {
  @IsOptional()
  @IsArray()
  @IsEachInCatalog(CATALOG, 'skill')
  skills?: string[];
}

async function messageFor(plain: Record<string, unknown>): Promise<string | undefined> {
  const errors = await validate(plainToInstance(Subject, plain));
  const skillsError = errors.find(e => e.property === 'skills');
  return skillsError?.constraints?.isIn;
}

describe('IsEachInCatalog', () => {
  it('accepts an array whose entries are all in the catalog', async () => {
    const errors = await validate(plainToInstance(Subject, { skills: ['Athletics', 'Stealth'] }));
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty array', async () => {
    const errors = await validate(plainToInstance(Subject, { skills: [] }));
    expect(errors).toHaveLength(0);
  });

  it('rejects an entry outside the catalog', async () => {
    const errors = await validate(plainToInstance(Subject, { skills: ['Perceptoin'] }));
    expect(errors.find(e => e.property === 'skills')).toBeDefined();
  });

  // The whole reason this decorator exists rather than a bare
  // `@IsIn(catalog, { each: true })`: class-validator builds the message once
  // from the entire array (ValidationExecutor sets validationArguments.value
  // before branching into per-item validation), so the stock message can only
  // recite the legal values and never the one the caller actually sent.
  // These assertions fail against plain @IsIn — that's what makes them worth
  // having.
  it('names the offending entry in the message', async () => {
    const message = await messageFor({ skills: ['Perceptoin', 'Stealth'] });
    expect(message).toBe("skills contains unknown skill: 'Perceptoin'");
  });

  it('names every offending entry when there are several', async () => {
    const message = await messageFor({ skills: ['Perceptoin', 'Stealth', 'Athletcs'] });
    expect(message).toBe("skills contains unknown skill: 'Perceptoin', 'Athletcs'");
  });

  it('does not leak the valid entries into the message', async () => {
    const message = await messageFor({ skills: ['Perceptoin', 'Stealth'] });
    expect(message).not.toContain('Stealth');
  });

  it('uses the supplied noun', async () => {
    class AbilitySubject {
      @IsOptional()
      @IsArray()
      @IsEachInCatalog(['Strength', 'Dexterity'], 'saving throw')
      savingThrows?: string[];
    }

    const errors = await validate(plainToInstance(AbilitySubject, { savingThrows: ['Strngth'] }));
    expect(errors[0]?.constraints?.isIn).toBe(
      "savingThrows contains unknown saving throw: 'Strngth'"
    );
  });

  it('stringifies non-string entries in the message rather than dropping them', async () => {
    const message = await messageFor({ skills: [42] });
    expect(message).toBe("skills contains unknown skill: '42'");
  });

  // A bare string skips class-validator's `each` branch entirely, so @IsIn
  // would validate the whole string against the catalog and let a catalog
  // member through as a non-array. @IsArray is what catches it — this pins
  // that the pairing is load-bearing, not decorative.
  it('leaves the non-array case to @IsArray (a bare catalog member is still rejected)', async () => {
    const errors = await validate(plainToInstance(Subject, { skills: 'Athletics' }));
    expect(errors.find(e => e.property === 'skills')?.constraints?.isArray).toBeDefined();
  });
});
