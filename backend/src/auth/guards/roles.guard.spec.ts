import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function createMockContext(user: { role: string }): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it("should allow access when no roles are required", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const context = createMockContext({ role: "player" });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should allow access when user has a required role", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const context = createMockContext({ role: "admin" });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should deny access when user does not have a required role", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue(["admin", "dungeon_master"]);
    const context = createMockContext({ role: "player" });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("should allow access when user has one of multiple required roles", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue(["admin", "dungeon_master"]);
    const context = createMockContext({ role: "dungeon_master" });

    expect(guard.canActivate(context)).toBe(true);
  });
});
