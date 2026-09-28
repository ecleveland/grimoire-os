import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

// Liveness probe for container healthchecks and uptime monitors. It needs no
// auth, and because it is a GET without a cache interceptor it stays out of
// the response cache and the audit log.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Report whether the API can reach its database' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.warn(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}
