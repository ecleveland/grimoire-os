import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { mockUser } from "../test/fixtures";

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from "bcryptjs";

describe("AuthService", () => {
  let service: AuthService;
  let usersService: { findByUsername: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    usersService = { findByUsername: jest.fn() };
    jwtService = { sign: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe("login", () => {
    it("should return an access_token on valid credentials", async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue("signed.jwt.token");

      const result = await service.login("testuser", "correctpassword");

      expect(usersService.findByUsername).toHaveBeenCalledWith("testuser");
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpassword",
        mockUser.passwordHash,
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      expect(result).toEqual({ access_token: "signed.jwt.token" });
    });

    it("should throw UnauthorizedException when user is not found", async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(service.login("nonexistent", "password")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException when password is wrong", async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login("testuser", "wrongpassword")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should include sub, username, and role in JWT payload", async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue("token");

      await service.login("testuser", "password");

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload).toEqual({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
    });
  });
});
