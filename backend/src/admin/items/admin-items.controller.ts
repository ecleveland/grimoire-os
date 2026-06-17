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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../prisma/enums';
import { toActor } from '../../srd/homebrew-write.helpers';
import { QueryItemsDto } from '../../srd/dto/query-items.dto';
import { CreateItemDto } from '../../srd/dto/create-item.dto';
import { UpdateItemDto } from '../../srd/dto/update-item.dto';
import { AdminItemsService } from './admin-items.service';
import { SetBundleContentsDto } from './dto/set-bundle-contents.dto';

/**
 * Admin-only editing of the shared-tier items catalog (VEG-309): equipment
 * packs (with bundle contents) and the edge categories. Mirrors
 * {@link AdminNpcDataController}'s guard stack; all writes are `shared` and
 * therefore reseed-safe.
 */
@ApiTags('Admin / Items')
@ApiBearerAuth()
@Controller('admin/items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminItemsController {
  constructor(private readonly service: AdminItemsService) {}

  @Get()
  @ApiOperation({ summary: 'List shared-tier items (admin only)' })
  list(@Query() query: QueryItemsDto) {
    return this.service.list({
      q: query.q,
      category: query.category,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a shared item (admin only)' })
  create(@Body() dto: CreateItemDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a shared item (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto, @Req() req: AuthenticatedRequest) {
    return this.service.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a shared item (admin only)' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.service.remove(id, toActor(req.user));
  }

  @Put(':id/contents')
  @ApiOperation({ summary: "Replace an equipment pack's contents (admin only)" })
  setContents(
    @Param('id') id: string,
    @Body() dto: SetBundleContentsDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.setBundleContents(id, dto.contents, toActor(req.user));
  }
}
