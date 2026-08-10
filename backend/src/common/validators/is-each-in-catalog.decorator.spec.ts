import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsArray, IsOptional } from 'class-validator';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
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

// Some defects only surface under the production pipe, whose
// enableImplicitConversion rewrites the value before validation ever sees it.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

async function pipeRejectionMessages(plain: Record<string, unknown>): Promise<string[]> {
  try {
    await pipe.transform(plain, { type: 'body', metatype: Subject });
    throw new Error(`expected rejection for ${JSON.stringify(plain)}`);
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return (err.getResponse() as { message: string[] }).message;
  }
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

// ── Review findings (xhigh pass on PR #256) ────────────────────────────
//
// Each block below fails against the decorator as merged. They are grouped
// separately from the specs above so the fix can be read against the defect.
describe('IsEachInCatalog — response amplification', () => {
  // MAX_NAMED_OFFENDERS caps the offender *count*, not each offender's *length*,
  // so the ~1:1 reflection the cap's docstring claims to prevent is still
  // reachable with fewer, larger entries. create-background.dto.ts compounds it
  // by deleting the @MaxLength(100, { each: true }) that used to bound them, on
  // the grounds that catalog membership subsumes the length bound — but
  // membership only bounds *accepted* values, never the *rejected* ones echoed
  // back. Ten 100KB entries fit well under the 1MB body limit.
  it('bounds the length of each named offender, not just how many are named', async () => {
    const message = await messageFor({ skills: ['X'.repeat(50_000)] });
    expect(message!.length).toBeLessThan(400);
  });

  it('stays bounded for many large offenders (10 x 100KB is under the 1MB body limit)', async () => {
    const message = await messageFor({
      skills: Array.from({ length: 10 }, () => 'X'.repeat(100_000)),
    });
    expect(message!.length).toBeLessThan(400);
  });

  // Duplicates spend the whole 10-slot budget on one repeated value, hiding the
  // real typo behind '(+1 more)' — the message names everything except the fact
  // the caller needs.
  it('de-duplicates offenders so a repeated value cannot crowd out the real typo', async () => {
    const message = await messageFor({
      skills: [...Array.from({ length: 10 }, () => 'Bad'), 'Perceptoin'],
    });
    expect(message).toContain("'Perceptoin'");
  });
});

describe('IsEachInCatalog — caller-controlled message tokens', () => {
  // class-validator runs ValidationUtils.replaceMessageSpecialTokens over
  // whatever a custom `message` function returns, so the raw caller input this
  // wrapper embeds gets a second interpolation pass. '$constraint1' is replaced
  // with the catalog — reproducing the exact stock-@IsIn wall of text the
  // wrapper exists to eliminate, and violating the 'does not leak the valid
  // entries' invariant asserted above.
  //
  // These assert the sigil is *neutralised*, not preserved: the replacement is a
  // plain regex over the finished message and class-validator offers no escape
  // sequence, so a literal '$constraint1' cannot survive into the response. The
  // offender stays identifiable, which is what the message is for.
  it('neutralises $constraint1 instead of expanding it into the catalog', async () => {
    const message = await messageFor({ skills: ['$constraint1'] });
    expect(message).toContain('constraint1');
    expect(message).not.toContain('Athletics');
    expect(message).not.toContain('Sleight of Hand');
  });

  it('does not leak the catalog when an offender contains $constraint1', async () => {
    const message = await messageFor({ skills: ['Stealth', '$constraint1'] });
    expect(message).not.toContain('Athletics');
    expect(message).not.toContain('Sleight of Hand');
  });

  // '$target' interpolates to the DTO class name, putting an internal type name
  // into a public 400 body.
  it('does not leak the DTO class name via $target', async () => {
    const message = await messageFor({ skills: ['$target'] });
    expect(message).toContain('target');
    expect(message).not.toContain('Subject');
  });

  it('neutralises $property instead of expanding it', async () => {
    const message = await messageFor({ skills: ['$property'] });
    expect(message).toBe("skills contains unknown skill: 'property'");
  });
});

describe('IsEachInCatalog — non-string entries', () => {
  // `String(entry)` leans on JS coercion, so Array.prototype.toString flattens a
  // nested array to its contents: the 400 quotes a perfectly canonical skill
  // name and tells the caller it is unknown. Self-diagnosability is the only
  // reason this decorator exists over a bare @IsIn, and this is worse than the
  // stock message — it actively misdirects.
  it('does not name a valid catalog member as the unknown entry', async () => {
    const message = await messageFor({ skills: [['Athletics']] });
    expect(message).toBeDefined();
    expect(message).not.toBe("skills contains unknown skill: 'Athletics'");
  });

  // Must go through the production pipe: enableImplicitConversion is what
  // rewrites the object entry to [], and String([]) is '' — so the 400 reads
  // "unknown skill: ''" and names nothing at all. plainToInstance alone leaves
  // the object intact and stringifies it to '[object Object]', which hides the
  // defect.
  it('names something for an object entry rather than an empty string', async () => {
    const messages = await pipeRejectionMessages({ skills: [{ name: 'Athletics' }] });
    expect(messages.join(' ')).not.toContain("''");
  });
});

// The docstring calls the @IsArray() pairing load-bearing and the spec above
// pins it as 'not decorative' — but nothing enforces it. applyDecorators is
// already the return value, so composing IsArray() in costs nothing and makes
// the requirement impossible to forget at a fourth call site. As shipped the
// invariant lives only in prose and three hand-repeated @IsArray() lines.
describe('IsEachInCatalog — composes its own array guard', () => {
  class UnpairedSubject {
    @IsOptional()
    @IsEachInCatalog(CATALOG, 'skill')
    skills?: string[];
  }

  it('rejects a bare catalog member when the call site forgot @IsArray', async () => {
    const errors = await validate(plainToInstance(UnpairedSubject, { skills: 'Athletics' }));
    expect(errors.find(e => e.property === 'skills')).toBeDefined();
  });
});
