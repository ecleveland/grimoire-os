import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { FeatsController } from './feats.controller';
import { SrdService } from './srd.service';
import { HomebrewFeatsService } from './homebrew-feats.service';
import type { AuthenticatedRequest, JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const DM_USER: JwtUser = { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER };
const ADMIN_USER: JwtUser = { userId: 'a1', username: 'admin', role: Role.ADMIN };

function authedReq(user: JwtUser = DM_USER): AuthenticatedRequest {
  return { user } as AuthenticatedRequest;
}

describe('FeatsController', () => {
  let controller: FeatsController;
  let srdService: { searchFeats: jest.Mock; findFeat: jest.Mock };
  let homebrewService: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = { searchFeats: jest.fn(), findFeat: jest.fn() };
    homebrewService = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatsController],
      imports: [CacheModule.register()],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewFeatsService, useValue: homebrewService },
      ],
    }).compile();

    controller = module.get(FeatsController);
  });

  describe('searchFeats', () => {
    it('passes the caller’s userId so their homebrew is included', async () => {
      srdService.searchFeats.mockResolvedValue({ data: [] });

      await controller.searchFeats({ q: 'tough' }, authedReq());

      expect(srdService.searchFeats).toHaveBeenCalledWith({ q: 'tough' }, 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.searchFeats.mockResolvedValue({ data: [] });

      await controller.searchFeats({}, {} as AuthenticatedRequest);

      expect(srdService.searchFeats).toHaveBeenCalledWith({}, undefined);
    });
  });

  describe('findFeat', () => {
    it('passes the caller’s userId', async () => {
      srdService.findFeat.mockResolvedValue({ id: 'f1' });

      await controller.findFeat('f1', authedReq());

      expect(srdService.findFeat).toHaveBeenCalledWith('f1', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.findFeat.mockResolvedValue(null);

      await controller.findFeat('f1', {} as AuthenticatedRequest);

      expect(srdService.findFeat).toHaveBeenCalledWith('f1', undefined);
    });
  });

  describe('createFeat', () => {
    it('delegates with a non-admin actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'f1' });
      const dto = { name: 'Shield Master' };

      await controller.createFeat(dto as never, authedReq());

      expect(homebrewService.create).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        isAdmin: false,
      });
    });

    it('marks admins as such in the actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'f1' });

      await controller.createFeat({ name: 'X' } as never, authedReq(ADMIN_USER));

      expect(homebrewService.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });

  describe('updateFeat', () => {
    it('delegates id, dto, and actor', async () => {
      homebrewService.update.mockResolvedValue({ id: 'f1' });

      await controller.updateFeat('f1', { name: 'Y' } as never, authedReq());

      expect(homebrewService.update).toHaveBeenCalledWith(
        'f1',
        { name: 'Y' },
        { userId: 'u1', isAdmin: false }
      );
    });
  });

  describe('removeFeat', () => {
    it('delegates id and actor', async () => {
      homebrewService.remove.mockResolvedValue(undefined);

      await controller.removeFeat('f1', authedReq());

      expect(homebrewService.remove).toHaveBeenCalledWith('f1', {
        userId: 'u1',
        isAdmin: false,
      });
    });
  });
});
