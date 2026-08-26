import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { ClassesController, SubclassesController } from './classes.controller';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  JwtUser,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

const PLAYER: JwtUser = { userId: 'u1', username: 'player', role: Role.PLAYER };

function authedReq(user: JwtUser = PLAYER): OptionallyAuthenticatedRequest {
  return { user } as OptionallyAuthenticatedRequest;
}
const anonReq = {} as OptionallyAuthenticatedRequest;

describe('ClassesController', () => {
  let controller: ClassesController;
  let subclasses: SubclassesController;
  let srdService: {
    findAllClasses: jest.Mock;
    findClass: jest.Mock;
    searchSubclasses: jest.Mock;
    findSubclass: jest.Mock;
  };

  beforeEach(async () => {
    srdService = {
      findAllClasses: jest.fn().mockResolvedValue([]),
      findClass: jest.fn().mockResolvedValue(null),
      searchSubclasses: jest.fn().mockResolvedValue([]),
      findSubclass: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController, SubclassesController],
      imports: [CacheModule.register()],
      providers: [{ provide: SrdService, useValue: srdService }],
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
