import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { ClassesController, SubclassesController } from './classes.controller';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { HomebrewClassesService } from './homebrew-classes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  JwtUser,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const PLAYER: JwtUser = { userId: 'u1', username: 'player', role: Role.PLAYER };

function authedReq(user: JwtUser = PLAYER): OptionallyAuthenticatedRequest {
  return { user } as OptionallyAuthenticatedRequest;
}
const anonReq = {} as OptionallyAuthenticatedRequest;
const writeReq = { user: PLAYER } as AuthenticatedRequest;
const ACTOR = { userId: 'u1', isAdmin: false };

describe('ClassesController', () => {
  let controller: ClassesController;
  let subclasses: SubclassesController;
  let srdService: {
    findAllClasses: jest.Mock;
    findClass: jest.Mock;
    searchSubclasses: jest.Mock;
    findSubclass: jest.Mock;
  };
  let homebrewClasses: { create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    srdService = {
      findAllClasses: jest.fn().mockResolvedValue([]),
      findClass: jest.fn().mockResolvedValue(null),
      searchSubclasses: jest.fn().mockResolvedValue([]),
      findSubclass: jest.fn().mockResolvedValue(null),
    };

    homebrewClasses = {
      create: jest.fn().mockResolvedValue({ id: 'cls-1' }),
      update: jest.fn().mockResolvedValue({ id: 'cls-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController, SubclassesController],
      imports: [CacheModule.register()],
      providers: [
        { provide: SrdService, useValue: srdService },
        { provide: HomebrewClassesService, useValue: homebrewClasses },
      ],
    }).compile();

    controller = module.get(ClassesController);
    subclasses = module.get(SubclassesController);
  });

  it("passes the caller's userId to every read so their homebrew is included", async () => {
    await controller.findAllClasses(authedReq());
    await controller.findClass('cls-1', authedReq());
    await subclasses.searchSubclasses(authedReq(), 'cls-1');
    await subclasses.findSubclass('sub-1', authedReq());

    expect(srdService.findAllClasses).toHaveBeenCalledWith('u1');
    expect(srdService.findClass).toHaveBeenCalledWith('cls-1', 'u1');
    expect(srdService.searchSubclasses).toHaveBeenCalledWith('cls-1', 'u1');
    expect(srdService.findSubclass).toHaveBeenCalledWith('sub-1', 'u1');
  });

  it('passes undefined userId for anonymous callers', async () => {
    await controller.findAllClasses(anonReq);
    await subclasses.searchSubclasses(anonReq);

    expect(srdService.findAllClasses).toHaveBeenCalledWith(undefined);
    expect(srdService.searchSubclasses).toHaveBeenCalledWith(undefined, undefined);
  });

  it('keeps the classId filter optional and separate from the caller', async () => {
    await subclasses.searchSubclasses(authedReq());

    expect(srdService.searchSubclasses).toHaveBeenCalledWith(undefined, 'u1');
  });

  // The write half (VEG-506). The controller's only job is to turn the JWT user
  // into a ContentActor and delegate; every authorization decision belongs to the
  // service, which the contract suite drives.
  describe('homebrew writes', () => {
    it('creates with the caller as the actor', async () => {
      const dto = { name: 'Warden', hitDie: 'd10' };

      await controller.createClass(dto as never, writeReq);

      expect(homebrewClasses.create).toHaveBeenCalledWith(dto, ACTOR);
    });

    it('updates with the caller as the actor', async () => {
      const dto = { description: 'Rewritten.' };

      await controller.updateClass('cls-1', dto as never, writeReq);

      expect(homebrewClasses.update).toHaveBeenCalledWith('cls-1', dto, ACTOR);
    });

    it('deletes with the caller as the actor', async () => {
      await controller.removeClass('cls-1', writeReq);

      expect(homebrewClasses.remove).toHaveBeenCalledWith('cls-1', ACTOR);
    });

    it('marks an admin caller as one, since shared-tier writes turn on it', async () => {
      const adminReq = {
        user: { userId: 'a1', username: 'admin', role: Role.ADMIN },
      } as AuthenticatedRequest;

      await controller.createClass({ name: 'X', hitDie: 'd6' } as never, adminReq);

      expect(homebrewClasses.create).toHaveBeenCalledWith(expect.anything(), {
        userId: 'a1',
        isAdmin: true,
      });
    });
  });
});

// The whole reason this controller exists. SrdController carries a blanket
// URL-keyed CacheInterceptor; a per-caller response served from it would hand
// one user's homebrew to the next caller of the same URL. Asserting the routes
// actually moved is what stops a future refactor quietly folding them back.
describe('class routes are off the shared URL-keyed cache (VEG-505)', () => {
  it('uses AnonymousCacheInterceptor, not the blanket CacheInterceptor', () => {
    const interceptors = Reflect.getMetadata('__interceptors__', ClassesController) ?? [];
    const names = interceptors.map((i: unknown) =>
      typeof i === 'function' ? i.name : i?.constructor?.name
    );
    expect(names).toContain(AnonymousCacheInterceptor.name);
    expect(names).not.toContain('CacheInterceptor');
  });

  // Removing OptionalJwtAuthGuard leaves req.user permanently undefined, so
  // every caller silently downgrades to the global catalog and never sees their
  // own homebrew. Nothing else here would catch that: the handler specs build
  // their own request objects and bypass routing entirely.
  it('guards every route with OptionalJwtAuthGuard, or req.user is always undefined', () => {
    const cases: [object, string[]][] = [
      [ClassesController.prototype, ['findAllClasses', 'findClass']],
      [SubclassesController.prototype, ['searchSubclasses', 'findSubclass']],
    ];

    for (const [proto, handlers] of cases) {
      for (const handler of handlers) {
        const fn = (proto as unknown as Record<string, unknown>)[handler] as object;
        const guards = Reflect.getMetadata('__guards__', fn) ?? [];
        const names = guards.map((g: unknown) =>
          typeof g === 'function'
            ? g.name
            : (g as { constructor: { name: string } })?.constructor?.name
        );
        expect(names).toContain(OptionalJwtAuthGuard.name);
      }
    }
  });

  // A write route given OptionalJwtAuthGuard still routes for an anonymous
  // caller, and `toActor(req.user)` then reads userId off undefined. The guard is
  // the only thing standing between that and a 500 (or worse, an unowned write),
  // and nothing else here would notice the swap.
  it('guards every write route with the strict JwtAuthGuard, never the optional one', () => {
    for (const handler of ['createClass', 'updateClass', 'removeClass']) {
      const fn = (ClassesController.prototype as unknown as Record<string, unknown>)[
        handler
      ] as object;
      const guards = Reflect.getMetadata('__guards__', fn) ?? [];
      const names = guards.map((g: unknown) =>
        typeof g === 'function'
          ? g.name
          : (g as { constructor: { name: string } })?.constructor?.name
      );
      expect(names).toContain(JwtAuthGuard.name);
      expect(names).not.toContain(OptionalJwtAuthGuard.name);
    }
  });

  it('SrdController no longer declares any class or subclass route', () => {
    const proto = SrdController.prototype as unknown as Record<string, unknown>;
    const routePaths = Object.getOwnPropertyNames(proto)
      .filter(key => key !== 'constructor' && typeof proto[key] === 'function')
      .map(key => Reflect.getMetadata('path', proto[key] as object))
      .filter((path): path is string => typeof path === 'string');

    expect(routePaths.length).toBeGreaterThan(0);
    for (const path of routePaths) {
      expect(path).not.toMatch(/^classes/);
      expect(path).not.toMatch(/^subclasses/);
    }
  });

  it('SrdController still owns the untiered race routes', () => {
    const proto = SrdController.prototype as unknown as Record<string, unknown>;
    const routePaths = Object.getOwnPropertyNames(proto)
      .filter(key => key !== 'constructor' && typeof proto[key] === 'function')
      .map(key => Reflect.getMetadata('path', proto[key] as object))
      .filter((path): path is string => typeof path === 'string');

    expect(routePaths).toContain('races');
  });
});
