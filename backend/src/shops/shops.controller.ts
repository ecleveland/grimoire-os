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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { ShopsService } from './shops.service';
import { ShopThemeService } from './shop-theme.service';
import { toDto } from '../common/serialization/to-dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopQueryDto } from './dto/shop-query.dto';
import { ThemeSuggestionsQueryDto } from './dto/theme-suggestions-query.dto';
import { ThemeSuggestionsDto } from './dto/theme-suggestions-response.dto';

@ApiTags('Shops')
@ApiBearerAuth()
@Controller('shops')
@UseGuards(JwtAuthGuard)
export class ShopsController {
  constructor(
    private readonly shopsService: ShopsService,
    private readonly shopThemeService: ShopThemeService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a shop (DM-only)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateShopDto) {
    return this.shopsService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List shops for a campaign (paginated, members)' })
  findAll(@Query() query: ShopQueryDto, @Req() req: AuthenticatedRequest) {
    return this.shopsService.findAllForCampaign(query.campaignId, req.user.userId, query);
  }

  // Declared before `:id` so "theme-suggestions" isn't captured as a shop id.
  // Returns only global item-catalog suggestions (no campaign-scoped data), so
  // unlike the other shop routes it needs only JwtAuthGuard — no owner/member
  // check, and no userId is threaded through.
  @Get('theme-suggestions')
  @ApiOperation({ summary: 'Suggested stock for a theme (DM builder helper)' })
  async suggestStock(@Query() query: ThemeSuggestionsQueryDto) {
    const items = await this.shopThemeService.suggestStock(query.theme);
    return toDto(ThemeSuggestionsDto, { theme: query.theme, items });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a shop by id (members)' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.shopsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a shop (DM-only)' })
  update(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: UpdateShopDto) {
    return this.shopsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a shop (DM-only)' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.shopsService.remove(id, req.user.userId);
  }
}
