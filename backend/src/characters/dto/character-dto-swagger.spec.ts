import { Body, Controller, Patch, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CreateCharacterDto } from './create-character.dto';
import { UpdateCharacterDto } from './update-character.dto';

// A property typed `never` has no design-time type for Swagger to read, and
// Swagger reports that as a circular dependency while the app boots. The
// deprecated class projections are typed `never` on purpose, so this pins
// that they declare an explicit schema type and the document still builds.
@Controller('swagger-probe')
class ProbeController {
  @Post()
  create(@Body() dto: CreateCharacterDto) {
    return dto;
  }

  @Patch()
  update(@Body() dto: UpdateCharacterDto) {
    return dto;
  }
}

describe('character DTO Swagger schema', () => {
  it('builds the document with the deprecated class projections as strings', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    const app = moduleRef.createNestApplication();

    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());

    for (const name of ['CreateCharacterDto', 'UpdateCharacterDto']) {
      const schema = document.components?.schemas?.[name];
      expect(schema).toBeDefined();
      const properties = (schema as { properties: Record<string, Record<string, unknown>> })
        .properties;
      for (const field of ['class', 'classId', 'subclass', 'subclassId']) {
        expect(properties[field]).toMatchObject({ type: 'string', deprecated: true });
      }
    }
    await app.close();
  });
});
