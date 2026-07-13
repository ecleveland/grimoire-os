import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { BackgroundsController } from './backgrounds.controller';
import { SrdService } from './srd.service';
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import type { AuthenticatedRequest, JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const DM_USER: JwtUser = { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER };
const ADMIN_USER: JwtUser = { userId: 'a1', username: 'admin', role: Role.ADMIN };

function authedReq(user: JwtUser = DM_USER): AuthenticatedRequest {
  return { user } as AuthenticatedRequest;
}

describe('BackgroundsController', () => {
  let controller: BackgroundsController;
  let srdService: { searchBackgrounds: jest.Mock; findBackground: jest.Mock };
  let homebrewService: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = { searchBackgrounds: jest.fn(), findBackground: jest.fn() };
    homebrewService = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackgroundsController],
      imports: [CacheModule.register()],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewBackgroundsService, useValue: homebrewService },
      ],
    }).compile();

    controller = module.get(BackgroundsController);
  });

  describe('searchBackgrounds', () => {
    it("passes the caller's userId so their homebrew is included", async () => {
      srdService.searchBackgrounds.mockResolvedValue([]);

      await controller.searchBackgrounds({ q: 'grave' }, authedReq());

      expect(srdService.searchBackgrounds).toHaveBeenCalledWith('grave', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.searchBackgrounds.mockResolvedValue([]);

      await controller.searchBackgrounds({}, {} as AuthenticatedRequest);

      expect(srdService.searchBackgrounds).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe('findBackground', () => {
    it("passes the caller's userId", async () => {
      srdService.findBackground.mockResolvedValue({ id: 'bg1' });

      await controller.findBackground('bg1', authedReq());

      expect(srdService.findBackground).toHaveBeenCalledWith('bg1', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.findBackground.mockResolvedValue(null);

      await controller.findBackground('bg1', {} as AuthenticatedRequest);

      expect(srdService.findBackground).toHaveBeenCalledWith('bg1', undefined);
    });
  });

  describe('createBackground', () => {
    it('delegates with a non-admin actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'bg1' });
      const dto = { name: 'Gravedigger' };

      await controller.createBackground(dto as never, authedReq());

      expect(homebrewService.create).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        isAdmin: false,
      });
    });

    it('marks admins as such in the actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'bg1' });

      await controller.createBackground({ name: 'X' } as never, authedReq(ADMIN_USER));

      expect(homebrewService.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });

  describe('updateBackground', () => {
    it('delegates id, dto, and actor', async () => {
      homebrewService.update.mockResolvedValue({ id: 'bg1' });

      await controller.updateBackground('bg1', { name: 'Y' } as never, authedReq());

      expect(homebrewService.update).toHaveBeenCalledWith(
        'bg1',
        { name: 'Y' },
        { userId: 'u1', isAdmin: false }
      );
    });
  });

  describe('removeBackground', () => {
    it('delegates id and actor', async () => {
      homebrewService.remove.mockResolvedValue(undefined);

      await controller.removeBackground('bg1', authedReq());

      expect(homebrewService.remove).toHaveBeenCalledWith('bg1', {
        userId: 'u1',
        isAdmin: false,
      });
    });
  });
});
