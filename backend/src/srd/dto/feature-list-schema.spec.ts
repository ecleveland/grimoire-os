import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { CreateClassDto } from './create-class.dto';
import { CreateSubclassDto } from './create-subclass.dto';
import { UpdateClassDto } from './update-class.dto';
import { UpdateSubclassDto } from './update-subclass.dto';

/**
 * The `features` OpenAPI schema, which no other spec covers.
 *
 * `IsFeatureList()` composes its validators through `applyDecorators`, and the
 * Swagger CLI plugin reads only the decorators written on the property, so it
 * cannot see the `ArrayUnique` inside. The rule is therefore stated on the
 * `@ApiPropertyOptional` by hand, and this pins it there so a reader of
 * `/api/docs` or a generated client keeps being told features must be unique
 * (VEG-559).
 */
describe('the features property schema', () => {
  const schemaOf = (proto: object) =>
    Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, proto, 'features') as
      | Record<string, unknown>
      | undefined;

  // The Update DTOs are here because they carry the rule by inheritance through
  // `PartialType`, which is a claim worth pinning rather than assuming.
  it.each([
    ['CreateClassDto', CreateClassDto.prototype],
    ['CreateSubclassDto', CreateSubclassDto.prototype],
    ['UpdateClassDto', UpdateClassDto.prototype],
    ['UpdateSubclassDto', UpdateSubclassDto.prototype],
  ])('declares uniqueItems on %s', (_name, proto) => {
    expect(schemaOf(proto)).toEqual(expect.objectContaining({ uniqueItems: true }));
  });
});
