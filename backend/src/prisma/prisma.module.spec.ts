import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

// The backfill script boots PrismaModule alone, with no ConfigModule.forRoot and
// often no JWT_SECRET. PrismaService must resolve from the database config only.
describe('PrismaModule', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('resolves PrismaService on its own, without JWT_SECRET', async () => {
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/standalone';

    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();

    // PrismaClient's constructor returns a proxy, so instanceof does not hold.
    const prisma = moduleRef.get(PrismaService);
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.user.findMany).toBe('function');
    await moduleRef.close();
  });
});
