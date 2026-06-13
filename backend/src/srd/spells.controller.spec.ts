import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { SpellsController } from './spells.controller';
import { SrdService } from './srd.service';
import { HomebrewSpellsService } from './homebrew-spells.service';
import type { AuthenticatedRequest, JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const DM_USER: JwtUser = { userId: 'u1', username: 'dm', role: Role.DUNGEON_MASTER };
const ADMIN_USER: JwtUser = { userId: 'a1', username: 'admin', role: Role.ADMIN };

function authedReq(user: JwtUser = DM_USER): AuthenticatedRequest {
  return { user } as AuthenticatedRequest;
}

describe('SpellsController', () => {
  let controller: SpellsController;
  let srdService: { searchSpells: jest.Mock; findSpell: jest.Mock };
  let homebrewService: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = { searchSpells: jest.fn(), findSpell: jest.fn() };
    homebrewService = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpellsController],
      imports: [CacheModule.register()],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewSpellsService, useValue: homebrewService },
      ],
    }).compile();

    controller = module.get(SpellsController);
  });

  describe('searchSpells', () => {
    it('passes the caller’s userId so their homebrew is included', async () => {
      srdService.searchSpells.mockResolvedValue({ data: [] });

      await controller.searchSpells({ q: 'fire' }, authedReq());

      expect(srdService.searchSpells).toHaveBeenCalledWith({ q: 'fire' }, 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.searchSpells.mockResolvedValue({ data: [] });

      await controller.searchSpells({}, {} as AuthenticatedRequest);

      expect(srdService.searchSpells).toHaveBeenCalledWith({}, undefined);
    });
  });

  describe('findSpell', () => {
    it('passes the caller’s userId', async () => {
      srdService.findSpell.mockResolvedValue({ id: 'sp1' });

      await controller.findSpell('sp1', authedReq());

      expect(srdService.findSpell).toHaveBeenCalledWith('sp1', 'u1');
    });

    it('passes undefined userId for anonymous callers', async () => {
      srdService.findSpell.mockResolvedValue(null);

      await controller.findSpell('sp1', {} as AuthenticatedRequest);

      expect(srdService.findSpell).toHaveBeenCalledWith('sp1', undefined);
    });
  });

  describe('createSpell', () => {
    it('delegates with a non-admin actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'sp1' });
      const dto = { name: 'Arcane Burst' };

      await controller.createSpell(dto as never, authedReq());

      expect(homebrewService.create).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        isAdmin: false,
      });
    });

    it('marks admins as such in the actor', async () => {
      homebrewService.create.mockResolvedValue({ id: 'sp1' });

      await controller.createSpell({ name: 'X' } as never, authedReq(ADMIN_USER));

      expect(homebrewService.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });

  describe('updateSpell', () => {
    it('delegates id, dto, and actor', async () => {
      homebrewService.update.mockResolvedValue({ id: 'sp1' });

      await controller.updateSpell('sp1', { name: 'Y' } as never, authedReq());

      expect(homebrewService.update).toHaveBeenCalledWith(
        'sp1',
        { name: 'Y' },
        { userId: 'u1', isAdmin: false }
      );
    });
  });

  describe('removeSpell', () => {
    it('delegates id and actor', async () => {
      homebrewService.remove.mockResolvedValue(undefined);

      await controller.removeSpell('sp1', authedReq());

      expect(homebrewService.remove).toHaveBeenCalledWith('sp1', {
        userId: 'u1',
        isAdmin: false,
      });
    });
  });
});
