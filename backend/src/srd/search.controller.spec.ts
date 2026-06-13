import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { SearchController } from './search.controller';
import { SrdService } from './srd.service';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

describe('SearchController', () => {
  let controller: SearchController;
  let srdService: { search: jest.Mock };

  beforeEach(async () => {
    srdService = { search: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      imports: [CacheModule.register()],
      providers: [{ provide: SrdService, useValue: srdService }],
    }).compile();

    controller = module.get(SearchController);
  });

  it('passes the caller’s userId so their homebrew spells are included', async () => {
    srdService.search.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });
    const query = { q: 'fire', types: ['spell'] as 'spell'[] };

    await controller.search(
      query as never,
      {
        user: { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER },
      } as AuthenticatedRequest
    );

    expect(srdService.search).toHaveBeenCalledWith(query, 'u1');
  });

  it('passes undefined userId for anonymous callers', async () => {
    srdService.search.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });

    await controller.search({} as never, {} as AuthenticatedRequest);

    expect(srdService.search).toHaveBeenCalledWith({}, undefined);
  });
});
