import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../prisma/enums';
import { AdminNpcDataService } from './admin-npc-data.service';
import { SetActiveDto } from './dto/set-active.dto';

@ApiTags('Admin / NPC Data')
@ApiBearerAuth()
@Controller('admin/npc-data')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNpcDataController {
  constructor(private readonly service: AdminNpcDataService) {}

  @Get(':table')
  @ApiOperation({ summary: 'List rows in an NPC reference table (admin only)' })
  list(@Param('table') table: string) {
    return this.service.list(table);
  }

  @Post(':table')
  @ApiOperation({ summary: 'Add a user-contributed row (admin only)' })
  create(
    @Param('table') table: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.create(table, req.user.userId, body);
  }

  @Patch(':table/:id')
  @ApiOperation({ summary: 'Toggle isActive on a row (admin only)' })
  setActive(@Param('table') table: string, @Param('id') id: string, @Body() body: SetActiveDto) {
    return this.service.setActive(table, id, body.isActive);
  }

  @Delete(':table/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user-contributed row (admin only)' })
  async remove(@Param('table') table: string, @Param('id') id: string) {
    await this.service.remove(table, id);
  }
}
