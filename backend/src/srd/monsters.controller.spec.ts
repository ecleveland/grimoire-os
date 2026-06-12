import { Test, TestingModule } from '@nestjs/testing';
import { MonstersController } from './monsters.controller';
import { SrdService } from './srd.service';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import type { AuthenticatedRequest, JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const DM_USER: JwtUser = { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER };
const ADMIN_USER: JwtUser = { userId: 'a1', username: 'admin', role: Role.ADMIN };

function authedReq(user: JwtUser = DM_USER): AuthenticatedRequest {
  return { user } as AuthenticatedRequest;
}

describe('MonstersController', () => {
  let controller: MonstersController;
  let srdService: { searchMonsters: jest.Mock; findMonster: jest.Mock };
  let homebrewService: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = { searchMonsters: jest.fn(), findMonster: jest.fn() };
    homebrewService = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonstersController],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewMonstersService, useValue: homebrewService },
      ],
    }).compile();

    controller = module.get(MonstersController);
  });

  describe('searchMonsters', () => {
    it('passes the caller’s userId so their homebrew is included', async () => {
      srdService.searchMonsters.mockResolvedValue({ data: [] });

      await controller.searchMonsters({ q: 'troll' }, authedReq());

      expect(srdService.searchMonsters).toHaveBeenCalledWith({ q: 'troll' }, 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.searchMonsters.mockResolvedValue({ data: [] });

      await controller.searchMonsters({}, {} as AuthenticatedRequest);

      expect(srdService.searchMonsters).toHaveBeenCalledWith({}, undefined);
    });
  });

  describe('findMonster', () => {
    it('passes the caller’s userId', async () => {
      srdService.findMonster.mockResolvedValue({ id: 'm1' });

      await controller.findMonster('m1', authedReq());

      expect(srdService.findMonster).toHaveBeenCalledWith('m1', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.findMonster.mockResolvedValue(null);

      await controller.findMonster('m1', {} as AuthenticatedRequest);

      expect(srdService.findMonster).toHaveBeenCalledWith('m1', undefined);
    });
  });

  describe('createMonster', () => {
    it('delegates with a non-admin actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'm1' });
      const dto = { name: 'Cave Troll' };

      await controller.createMonster(dto as never, authedReq());

      expect(homebrewService.create).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        isAdmin: false,
      });
    });

    it('marks admins as such in the actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'm1' });

      await controller.createMonster({ name: 'X' } as never, authedReq(ADMIN_USER));

      expect(homebrewService.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });

  describe('updateMonster', () => {
    it('delegates id, dto, and actor', async () => {
      homebrewService.update.mockResolvedValue({ id: 'm1' });

      await controller.updateMonster('m1', { name: 'Y' } as never, authedReq());

      expect(homebrewService.update).toHaveBeenCalledWith(
        'm1',
        { name: 'Y' },
        { userId: 'u1', isAdmin: false }
      );
    });
  });

  describe('removeMonster', () => {
    it('delegates id and actor', async () => {
      homebrewService.remove.mockResolvedValue(undefined);

      await controller.removeMonster('m1', authedReq());

      expect(homebrewService.remove).toHaveBeenCalledWith('m1', {
        userId: 'u1',
        isAdmin: false,
      });
    });
  });
});
