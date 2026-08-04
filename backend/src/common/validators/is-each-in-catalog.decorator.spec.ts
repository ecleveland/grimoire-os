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

  // The case above uses a catalog *member*, so @IsIn passes and the message is
  // never built — it exercises the @IsArray pairing but not the message's own
  // non-array branch. This one does: a bare non-member makes @IsIn fail, which
  // runs the message builder against a string. Without the Array.isArray guard
  // `value.filter` throws a raw TypeError from inside class-validator, which
  // surfaces as a 500 instead of this 400.
  it('builds a message for a bare non-member without throwing', async () => {
    const errors = await validate(plainToInstance(Subject, { skills: 'Bogus' }));
    const skills = errors.find(e => e.property === 'skills');
    expect(skills?.constraints?.isIn).toBe("skills contains unknown skill: 'Bogus'");
    expect(skills?.constraints?.isArray).toBeDefined();
  });

  // The message recomputes catalog membership independently of @IsIn's own
  // check, so the two can drift. If the message's predicate were ever looser
  // than the constraint's, a value would be rejected and then named nowhere —
  // the exact silent-ish failure this decorator exists to prevent. A case
  // variant is the cheapest probe: @IsIn is case-sensitive, so it must be
  // rejected AND named.
  it('agrees with @IsIn on case — a case variant is rejected and named', async () => {
    const message = await messageFor({ skills: ['athletics'] });
    expect(message).toBe("skills contains unknown skill: 'athletics'");
  });

  it('never reports an empty offender list when it rejects', async () => {
    for (const value of ['Bogus', ['athletics'], [42], [' Stealth']]) {
      const message = await messageFor({ skills: value });
      expect(message).toBeDefined();
      expect(message).not.toMatch(/unknown skill: $/);
    }
  });

  // Enumerating offenders is unbounded by construction: the old
  // @IsString({ each: true }) message was fixed-size, so a large bogus array
  // would newly reflect its own contents back at ~1:1. Cap the enumeration.
  it('caps the offender list instead of reflecting the whole array', async () => {
    const message = await messageFor({ skills: Array.from({ length: 500 }, (_, i) => `Bad${i}`) });
    expect(message!.length).toBeLessThan(400);
    expect(message).toContain("'Bad0'");
    expect(message).toMatch(/\(\+\d+ more\)$/);
  });
});
