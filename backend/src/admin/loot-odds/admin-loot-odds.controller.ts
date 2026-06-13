import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../prisma/enums';
import { AdminLootOddsService } from './admin-loot-odds.service';
import { UpdateLootOddsDto } from './dto/update-loot-odds.dto';

@ApiTags('Admin / Loot Odds')
@ApiBearerAuth()
@Controller('admin/loot-odds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLootOddsController {
  constructor(private readonly service: AdminLootOddsService) {}

  @Get()
  @ApiOperation({ summary: 'Read the global loot-tuning knobs (admin only)' })
  get() {
    return this.service.get();
  }

  @Patch()
  @ApiOperation({ summary: 'Update the global loot-tuning knobs (admin only)' })
  update(@Body() body: UpdateLootOddsDto) {
    return this.service.update(body);
  }
}
