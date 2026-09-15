import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateSubclassDto } from './create-subclass.dto';
import { UpdateSubclassDto } from './update-subclass.dto';

// Through the production pipe config (whitelist + forbidNonWhitelisted +
// implicit conversion). The DTO is the input boundary for homebrew subclass
// writes, so its constraints are what reject a malformed body or an
// ownership-injecting one, not a service backstop (the VEG-349 lesson).
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateSubclassDto };
const updateMeta = { type: 'body' as const, metatype: UpdateSubclassDto };

const CLASS_ID = '11111111-1111-4111-8111-111111111111';

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Path of Ash', classId: CLASS_ID, ...over };
}

const reject = (body: Record<string, unknown>, meta: ArgumentMetadata = createMeta) =>
  expect(pipe.transform(body, meta)).rejects.toThrow();
const accept = (body: Record<string, unknown>, meta: ArgumentMetadata = createMeta) =>
  expect(pipe.transform(body, meta)).resolves.toBeDefined();

describe('CreateSubclassDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Path of Ash', classId: CLASS_ID })
    );
  });

  it('accepts a description alongside the features', async () => {
    await accept(
      validBody({
        description: 'Barbarians who burn what they cannot carry.',
        features: [{ name: 'Ashen Step', level: 3, description: 'Step through cinders.' }],
      })
    );
  });

  // The parent is the whole ticket. A subclass with no class is not a thing the
  // read paths can render, and the service's visibility check has nothing to
  // look up without it.
  it('requires a classId', async () => {
    const { classId: _dropped, ...rest } = validBody();
    await reject(rest);
  });

  it('requires the classId to be a uuid', async () => {
    await reject(validBody({ classId: 'barbarian' }));
    await reject(validBody({ classId: '' }));
  });

  it('requires a name', async () => {
    const { name: _dropped, ...rest } = validBody();
    await reject(rest);
    await reject(validBody({ name: '' }));
    await reject(validBody({ name: 'x'.repeat(201) }));
  });

  it.each(['contentSource', 'createdById', 'campaignId', 'id', 'source'])(
    'rejects the reserved column %s outright',
    async column => {
      await reject(validBody({ [column]: 'anything' }));
    }
  );

  // v1 columns only. `spellList` and `spellcasting` exist on the table for the
  // SRD rows the seed writes; accepting them here would mean validating two more
  // Json shapes for a form that does not offer them.
  it.each(['spellList', 'spellcasting'])('does not accept %s yet', async column => {
    await reject(validBody({ [column]: {} }));
  });

  // @ValidateNested({ each: true }) alone lets this through, because it reads a
  // nested array as a collection and validates its (zero) members, so every constraint
  // passes vacuously and `{ name: undefined, level: undefined }` reaches the
  // insert as a 500. @IsObject({ each: true }) is what refuses it.
  it('rejects a nested array masquerading as a feature', async () => {
    await reject(validBody({ features: [[]] }));
  });

  // The DTO check and the [subclassId, name, level] unique index must reject the
  // same set. One name at several levels is the shape of a real subclass, and
  // the same name twice at one level is what the index still refuses.
  it('accepts one name recurring at different levels', async () => {
    await accept(
      validBody({
        features: [
          { name: 'Ashen Step', level: 3 },
          { name: 'Ashen Step', level: 10 },
        ],
      })
    );
  });

  it('rejects the same name twice at the same level', async () => {
    await reject(
      validBody({
        features: [
          { name: 'Ashen Step', level: 3 },
          { name: 'Ashen Step', level: 3 },
        ],
      })
    );
  });

  // The only bound on how many child rows one request writes; the service has
  // no count check of its own.
  it('caps the feature list at 100', async () => {
    const features = (length: number) =>
      Array.from({ length }, (_, i) => ({ name: `Feature ${i}`, level: 3 }));

    await reject(validBody({ features: features(101) }));
    await accept(validBody({ features: features(100) }));
  });

  it('rejects anything that is not an array of feature objects', async () => {
    await reject(validBody({ features: 'Ashen Step' }));
    await reject(validBody({ features: { name: 'Ashen Step', level: 3 } }));
    await reject(validBody({ features: [null] }));
    await reject(validBody({ features: [1] }));
  });

  it('accepts a null features list, the null-clear convention', async () => {
    await accept(validBody({ features: null }));
  });
});

describe('UpdateSubclassDto', () => {
  it('accepts a partial body', async () => {
    await accept({ description: 'Rewritten.' }, updateMeta);
  });

  // The parent is fixed at creation. Reparenting a subclass would move it across
  // a visibility boundary the create-time check already decided, so the field is
  // omitted from the update DTO and forbidNonWhitelisted refuses it.
  it('refuses to reparent a subclass', async () => {
    await reject({ classId: CLASS_ID }, updateMeta);
  });

  it('still rejects the reserved columns', async () => {
    await reject({ contentSource: 'srd' }, updateMeta);
    await reject({ createdById: 'someone-else' }, updateMeta);
  });

  it('carries the features array, empty array and null clear', async () => {
    await accept({ features: [{ name: 'Ashen Step', level: 3 }] }, updateMeta);
    await accept({ features: [] }, updateMeta);
    await accept({ features: null }, updateMeta);
  });

  // The difference between "leave the features alone" and "delete every one of
  // them" is the value of `features`, so a pipe that materialized the key as
  // undefined would change what an unrelated PATCH means.
  it('omits the features key entirely when the body does not mention it', async () => {
    const dto = (await pipe.transform({ description: 'Rewritten.' }, updateMeta)) as object;

    expect('features' in dto).toBe(false);
  });
});
