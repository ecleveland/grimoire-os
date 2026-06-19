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
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopQueryDto } from './dto/shop-query.dto';

@ApiTags('Shops')
@ApiBearerAuth()
@Controller('shops')
@UseGuards(JwtAuthGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

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
