import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateCharacterDto } from '../../characters/dto/create-character.dto';
import { CreateEncounterDto } from '../../encounters/dto/create-encounter.dto';
import { UpdateEncounterDto } from '../../encounters/dto/update-encounter.dto';
import { CreateNpcDto } from '../../npcs/dto/create-npc.dto';
import { GenerateNpcDto } from '../../npcs/dto/generate-npc.dto';
import { GenerateRelatedNpcDto } from '../../npcs/dto/generate-related-npc.dto';

// VEG-323 audit guard: every @Body() boolean field that previously had no
// protection against the global pipe's enableImplicitConversion now uses
// @IsStrictBoolean. Each case runs the *real* DTO through the production pipe
// and asserts the string "false" is rejected (not silently coerced to true) and
// a real boolean false survives. Other field errors are irrelevant — we only
// assert on the target field's boolean message, which class-validator emits at
// the field's dotted path. (The SRD create-spell/feat/item and admin SetActiveDto
// boolean fields already carry their own coercion specs.)

const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

async function messages(
  metatype: new () => object,
  body: Record<string, unknown>
): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    return [];
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return (err.getResponse() as { message: string[] }).message;
  }
}

type Case = {
  name: string;
  metatype: new () => object;
  path: string;
  body: (value: unknown) => Record<string, unknown>;
};

const combatant = (over: Record<string, unknown>) => ({
  name: 'Wolf',
  initiative: 1,
  hp: 1,
  maxHp: 1,
  ac: 1,
  ...over,
});

const cases: Case[] = [
  {
    name: 'UpdateEncounterDto.isActive',
    metatype: UpdateEncounterDto,
    path: 'isActive',
    body: v => ({ isActive: v }),
  },
  {
    name: 'CreateNpcDto.isManual',
    metatype: CreateNpcDto,
    path: 'isManual',
    body: v => ({ name: 'Goblin', isManual: v }),
  },
  {
    name: 'GenerateNpcDto.combatRelevant',
    metatype: GenerateNpcDto,
    path: 'combatRelevant',
    body: v => ({ combatRelevant: v }),
  },
  {
    name: 'GenerateRelatedNpcDto.constraintsOverride.combatRelevant',
    metatype: GenerateRelatedNpcDto,
    path: 'constraintsOverride.combatRelevant',
    body: v => ({ constraintsOverride: { combatRelevant: v } }),
  },
  {
    name: 'CreateEncounterDto.combatants[].isNpc',
    metatype: CreateEncounterDto,
    path: 'combatants.0.isNpc',
    body: v => ({ campaignId: 'camp-1', name: 'Ambush', combatants: [combatant({ isNpc: v })] }),
  },
  {
    name: 'CreateCharacterDto.heroicInspiration',
    metatype: CreateCharacterDto,
    path: 'heroicInspiration',
    body: v => ({ name: 'Hero', heroicInspiration: v }),
  },
  {
    name: 'CreateCharacterDto.inventory[].equipped',
    metatype: CreateCharacterDto,
    path: 'inventory.0.equipped',
    body: v => ({ name: 'Hero', inventory: [{ name: 'Sword', equipped: v }] }),
  },
];

describe('@IsStrictBoolean wiring across body DTOs (VEG-323)', () => {
  it.each(cases)(
    '$name rejects the string "false" instead of coercing it',
    async ({ metatype, path, body }) => {
      expect(await messages(metatype, body('false'))).toContain(`${path} must be a boolean value`);
    }
  );

  it.each(cases)('$name accepts a real boolean false', async ({ metatype, path, body }) => {
    expect(await messages(metatype, body(false))).not.toContain(`${path} must be a boolean value`);
  });
});
