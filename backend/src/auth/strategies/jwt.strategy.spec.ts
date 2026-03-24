import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  describe("constructor", () => {
    it("should throw if JWT_SECRET is not set", () => {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(configService)).toThrow(
        "JWT_SECRET environment variable is not set",
      );
    });

    it("should create successfully when JWT_SECRET is set", () => {
      const configService = {
        get: jest.fn().mockReturnValue("test-secret"),
      } as unknown as ConfigService;

      const strategy = new JwtStrategy(configService);
      expect(strategy).toBeDefined();
    });
  });

  describe("validate", () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      const configService = {
        get: jest.fn().mockReturnValue("test-secret"),
      } as unknown as ConfigService;
      strategy = new JwtStrategy(configService);
    });

    it("should transform JWT payload into JwtUser object", () => {
      const payload = {
        sub: "user-123",
        username: "testuser",
        role: "player",
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        userId: "user-123",
        username: "testuser",
        role: "player",
      });
    });

    it("should map sub to userId", () => {
      const payload = {
        sub: "abc-def",
        username: "admin",
        role: "admin",
      };

      const result = strategy.validate(payload);

      expect(result.userId).toBe("abc-def");
      expect(result).not.toHaveProperty("sub");
    });
  });
});
