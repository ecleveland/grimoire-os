import { Test, TestingModule } from '@nestjs/testing';
import { HomebrewItemsService } from './homebrew-items.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateItemDto } from './dto/create-item.dto';

/**
 * Item-specific write behavior only. The authorization skeleton is asserted for
 * every tiered service in `content-write.contract.spec.ts`; the column mapping
 * itself is shared with the admin shared-tier writer via `toItemColumnData`.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateItemDto> = {}): CreateItemDto {
  return { name: 'Sunblade', category: 'Weapon', ...over } as CreateItemDto;
}

describe('HomebrewItemsService', () => {
  let service: HomebrewItemsService;
  let prisma: MockPrismaService;
  const homebrewRow = { id: 'i1', contentSource: 'homebrew', createdById: 'owner-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewItemsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewItemsService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
  });

  it('passes item columns through to the create', async () => {
    prisma.item.create.mockResolvedValue({ id: 'i1' });

    await service.create(makeCreateDto({ rarity: 'Rare' }), OWNER);

    expect(prisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Sunblade', category: 'Weapon', rarity: 'Rare' }),
    });
  });

  it('coerces null properties to an empty array — the column is non-nullable', async () => {
    prisma.item.findUnique.mockResolvedValue(homebrewRow);
    prisma.item.update.mockResolvedValue(homebrewRow);

    await service.update('i1', { properties: null } as never, OWNER);

    expect(prisma.item.update.mock.calls[0][0].data.properties).toEqual([]);
  });

  it('normalizes empty-string rarity to null so the rarity filter cannot mis-bucket it', async () => {
    prisma.item.findUnique.mockResolvedValue(homebrewRow);
    prisma.item.update.mockResolvedValue(homebrewRow);

    await service.update('i1', { rarity: '   ' } as never, OWNER);

    expect(prisma.item.update.mock.calls[0][0].data.rarity).toBeNull();
  });
});
