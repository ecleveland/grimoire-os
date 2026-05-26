import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { UsersService } from '../users/users.service';
import { mockUser } from '../test/fixtures';
import { Role } from '../common/enums';

type FakeSocket = {
  id: string;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, string | undefined>;
  };
  data: Record<string, unknown>;
  emit: jest.Mock;
  disconnect: jest.Mock;
};

const makeClient = (
  overrides: Partial<{
    auth: Record<string, unknown>;
    headers: Record<string, string | undefined>;
  }> = {}
): FakeSocket => ({
  id: 'client-1',
  handshake: {
    auth: overrides.auth ?? {},
    headers: overrides.headers ?? {},
  },
  data: {},
  emit: jest.fn(),
  disconnect: jest.fn(),
});

describe('WebsocketGateway', () => {
  let gateway: WebsocketGateway;
  let jwtService: { verify: jest.Mock };
  let usersService: { findOne: jest.Mock };

  beforeEach(async () => {
    jwtService = { verify: jest.fn() };
    usersService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsocketGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    gateway = module.get<WebsocketGateway>(WebsocketGateway);
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('disconnects when no token is provided', async () => {
      const client = makeClient();

      await gateway.handleConnection(client as never);

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.user).toBeUndefined();
    });

    it('attaches user to client when handshake.auth.token is valid', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      usersService.findOne.mockResolvedValue(mockUser);
      const client = makeClient({ auth: { token: 'valid.jwt.token' } });

      await gateway.handleConnection(client as never);

      expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token');
      expect(usersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(client.data.user).toEqual({
        userId: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('accepts a Bearer token from the Authorization header', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        username: mockUser.username,
        role: Role.DUNGEON_MASTER,
      });
      usersService.findOne.mockResolvedValue({ ...mockUser, role: Role.DUNGEON_MASTER });
      const client = makeClient({ headers: { authorization: 'Bearer header.jwt.token' } });

      await gateway.handleConnection(client as never);

      expect(jwtService.verify).toHaveBeenCalledWith('header.jwt.token');
      expect(client.data.user).toEqual({
        userId: mockUser.id,
        username: mockUser.username,
        role: Role.DUNGEON_MASTER,
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects when JWT verification throws', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      const client = makeClient({ auth: { token: 'bad.token' } });

      await gateway.handleConnection(client as never);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.user).toBeUndefined();
    });

    it('disconnects when the user from the token cannot be found', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      usersService.findOne.mockRejectedValue(new NotFoundException('User not found'));
      const client = makeClient({ auth: { token: 'valid.but.stale' } });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.user).toBeUndefined();
    });

    it('ignores a non-Bearer Authorization header', async () => {
      const client = makeClient({ headers: { authorization: 'Basic abc' } });

      await gateway.handleConnection(client as never);

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleDisconnect', () => {
    it('completes without throwing for an authenticated client', () => {
      const client = makeClient();
      client.data.user = {
        userId: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      };

      expect(() => gateway.handleDisconnect(client as never)).not.toThrow();
    });

    it('completes without throwing for an unauthenticated client', () => {
      const client = makeClient();

      expect(() => gateway.handleDisconnect(client as never)).not.toThrow();
    });
  });
});
