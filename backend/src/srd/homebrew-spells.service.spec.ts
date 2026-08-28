import { Test, TestingModule } from '@nestjs/testing';
import { HomebrewSpellsService } from './homebrew-spells.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateSpellDto } from './dto/create-spell.dto';

/**
 * Spell-specific write behavior only. The authorization skeleton this service
 * inherits from {@link ContentCrudService} (tier checks, the 404-vs-403 write
 * guard, the ownership stamp, write-error mapping) is asserted for every tiered
 * service in `content-write.contract.spec.ts`, so it is deliberately not
 * repeated here.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateSpellDto> = {}): CreateSpellDto {
  return {
    name: 'Mending Word',
    level: 1,
    school: 'Evocation',
    ...over,
  } as CreateSpellDto;
}

describe('HomebrewSpellsService', () => {
  let service: HomebrewSpellsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewSpellsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewSpellsService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
  });

  it('passes spell columns through to the create', async () => {
    prisma.spell.create.mockResolvedValue({ id: 'sp1' });

    await service.create(makeCreateDto({ castingTime: '1 action' }), OWNER);

    expect(prisma.spell.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Mending Word',
        level: 1,
        school: 'Evocation',
        castingTime: '1 action',
      }),
    });
  });

  it('coerces null classes/ritual/concentration to their non-null defaults', async () => {
    const homebrewRow = { id: 'sp1', contentSource: 'homebrew', createdById: 'owner-1' };
    prisma.spell.findUnique.mockResolvedValue(homebrewRow);
    prisma.spell.update.mockResolvedValue(homebrewRow);

    // Null is how the client clears an optional field (VEG-316), but these
    // three columns are non-nullable, so they must land on their defaults.
    await service.update(
      'sp1',
      { classes: null, ritual: null, concentration: null } as never,
      OWNER
    );

    const data = prisma.spell.update.mock.calls[0][0].data;
    expect(data.classes).toEqual([]);
    expect(data.ritual).toBe(false);
    expect(data.concentration).toBe(false);
  });
});
