import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { JwtUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';

interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    // ConfigService is retained for future per-environment tuning of the gateway.
    private readonly _configService: ConfigService
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.rejectConnection(client, 'Missing authentication token');
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.rejectConnection(client, 'Invalid authentication token');
      return;
    }

    try {
      const user = await this.usersService.findOne(payload.sub);
      const jwtUser: JwtUser = {
        userId: user.id,
        username: user.username,
        role: user.role as Role,
      };
      client.data.user = jwtUser;
      this.logger.log(`Client connected: ${client.id} (user ${jwtUser.userId})`);
    } catch {
      this.rejectConnection(client, 'Authenticated user no longer exists');
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data?.user as JwtUser | undefined;
    if (user) {
      this.logger.log(`Client disconnected: ${client.id} (user ${user.userId})`);
    } else {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = client.handshake?.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    const cookieHeader = client.handshake?.headers?.cookie;
    if (typeof cookieHeader === 'string' && cookieHeader.length > 0) {
      const cookieToken = parseCookie(cookieHeader, 'access_token');
      if (cookieToken) {
        return cookieToken;
      }
    }
    return undefined;
  }

  private rejectConnection(client: Socket, reason: string): void {
    this.logger.warn(`Rejecting socket ${client.id}: ${reason}`);
    client.emit('error', { message: reason });
    client.disconnect(true);
  }
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.split('=');
    if (rawKey?.trim() === name) {
      return rest.join('=').trim() || undefined;
    }
  }
  return undefined;
}
