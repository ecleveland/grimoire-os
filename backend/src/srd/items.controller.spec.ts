import { Test, TestingModule } from '@nestjs/testing';
import { ItemsController } from './items.controller';
import { SrdService } from './srd.service';
import { HomebrewItemsService } from './homebrew-items.service';
import type { AuthenticatedRequest, JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const DM_USER: JwtUser = { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER };
const ADMIN_USER: JwtUser = { userId: 'a1', username: 'admin', role: Role.ADMIN };

function authedReq(user: JwtUser = DM_USER): AuthenticatedRequest {
  return { user } as AuthenticatedRequest;
}

describe('ItemsController', () => {
  let controller: ItemsController;
  let srdService: { searchItems: jest.Mock; findItem: jest.Mock };
  let homebrewService: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = { searchItems: jest.fn(), findItem: jest.fn() };
    homebrewService = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewItemsService, useValue: homebrewService },
      ],
    }).compile();

    controller = module.get(ItemsController);
  });

  describe('searchItems', () => {
    it('passes the caller’s userId so their homebrew is included', async () => {
      srdService.searchItems.mockResolvedValue({ data: [] });

      await controller.searchItems({ q: 'cloak' }, authedReq());

      expect(srdService.searchItems).toHaveBeenCalledWith({ q: 'cloak' }, 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.searchItems.mockResolvedValue({ data: [] });

      await controller.searchItems({}, {} as AuthenticatedRequest);

      expect(srdService.searchItems).toHaveBeenCalledWith({}, undefined);
    });
  });

  describe('findItem', () => {
    it('passes the caller’s userId', async () => {
      srdService.findItem.mockResolvedValue({ id: 'i1' });

      await controller.findItem('i1', authedReq());

      expect(srdService.findItem).toHaveBeenCalledWith('i1', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.findItem.mockResolvedValue(null);

      await controller.findItem('i1', {} as AuthenticatedRequest);

      expect(srdService.findItem).toHaveBeenCalledWith('i1', undefined);
    });
  });

  describe('createItem', () => {
    it('delegates with a non-admin actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'i1' });
      const dto = { name: 'Cloak of Whispers', category: 'Wondrous Item' };

      await controller.createItem(dto as never, authedReq());

      expect(homebrewService.create).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        isAdmin: false,
      });
    });

    it('marks admins as such in the actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'i1' });

      await controller.createItem({ name: 'X', category: 'Ring' } as never, authedReq(ADMIN_USER));

      expect(homebrewService.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });

  describe('updateItem', () => {
    it('delegates id, dto, and actor', async () => {
      homebrewService.update.mockResolvedValue({ id: 'i1' });

      await controller.updateItem('i1', { name: 'Y' } as never, authedReq());

      expect(homebrewService.update).toHaveBeenCalledWith(
        'i1',
        { name: 'Y' },
        { userId: 'u1', isAdmin: false }
      );
    });
  });

  describe('removeItem', () => {
    it('delegates id and actor', async () => {
      homebrewService.remove.mockResolvedValue(undefined);

      await controller.removeItem('i1', authedReq());

      expect(homebrewService.remove).toHaveBeenCalledWith('i1', {
        userId: 'u1',
        isAdmin: false,
      });
    });
  });
});
