import { Test } from '@nestjs/testing';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

// The compose seed service runs the compiled seed from the server image with
// no JWT_SECRET, so SeedModule must not load the app-wide configuration.
describe('SeedModule', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('compiles without JWT_SECRET', async () => {
    delete process.env.JWT_SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [SeedModule] }).compile();

    expect(moduleRef.get(SeedService)).toBeInstanceOf(SeedService);
    await moduleRef.close();
  });
});
