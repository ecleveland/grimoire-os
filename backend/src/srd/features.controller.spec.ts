import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { FeaturesController } from './features.controller';
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
const authedReq = { user: PLAYER } as OptionallyAuthenticatedRequest;
const anonReq = {} as OptionallyAuthenticatedRequest;

describe('FeaturesController', () => {
  let controller: FeaturesController;
  let srdService: { searchFeatures: jest.Mock };

  beforeEach(async () => {
    srdService = { searchFeatures: jest.fn().mockResolvedValue({ data: [], total: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeaturesController],
      imports: [CacheModule.register()],
      providers: [{ provide: SrdService, useValue: srdService }],
    }).compile();

    controller = module.get(FeaturesController);
  });

  it('passes the caller’s userId through, so their own homebrew features resolve', async () => {
    await controller.searchFeatures({ parentType: 'class' }, authedReq);

    expect(srdService.searchFeatures).toHaveBeenCalledWith({ parentType: 'class' }, 'u1');
  });

  it('passes undefined for an anonymous caller', async () => {
    await controller.searchFeatures({}, anonReq);

    expect(srdService.searchFeatures).toHaveBeenCalledWith({}, undefined);
  });
});

// Why this controller exists at all (VEG-507). Threading a userId into
// searchFeatures makes the response per-caller, and SrdController — where the
// route lived — carries a blanket URL-keyed CacheInterceptor that would serve
// one user's homebrew features to the next caller of the same URL. That is the
// same reason the monster, spell, feat, item, background and class routes were
// each split out before it.
describe('feature routes are off the shared URL-keyed cache (VEG-507)', () => {
  it('uses AnonymousCacheInterceptor, not the blanket CacheInterceptor', () => {
    const interceptors = Reflect.getMetadata('__interceptors__', FeaturesController) ?? [];
    const names = interceptors.map((i: unknown) =>
      typeof i === 'function'
        ? i.name
        : (i as { constructor?: { name: string } })?.constructor?.name
    );
    expect(names).toContain(AnonymousCacheInterceptor.name);
    expect(names).not.toContain('CacheInterceptor');
  });

  // Without the guard req.user is permanently undefined, so every caller
  // silently downgrades to the global catalog and never sees the features of a
  // class they wrote themselves. The handler spec above builds its own request
  // objects and bypasses routing, so nothing else here would catch the removal.
  it('guards the route with OptionalJwtAuthGuard, or req.user is always undefined', () => {
    const fn = (FeaturesController.prototype as unknown as Record<string, unknown>)
      .searchFeatures as object;
    const guards = Reflect.getMetadata('__guards__', fn) ?? [];
    const names = guards.map((g: unknown) =>
      typeof g === 'function' ? g.name : (g as { constructor: { name: string } })?.constructor?.name
    );
    expect(names).toContain(OptionalJwtAuthGuard.name);
  });

  it('SrdController no longer declares a features route', () => {
    const proto = SrdController.prototype as unknown as Record<string, unknown>;
    const routePaths = Object.getOwnPropertyNames(proto)
      .filter(key => key !== 'constructor' && typeof proto[key] === 'function')
      .map(key => Reflect.getMetadata('path', proto[key] as object))
      .filter((path): path is string => typeof path === 'string');

    expect(routePaths.length).toBeGreaterThan(0);
    expect(routePaths).not.toContain('features');
  });
});
