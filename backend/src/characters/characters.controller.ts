import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { CharacterDetailDto } from './dto/character-response.dto';

@ApiTags('Characters')
@ApiBearerAuth()
@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new character' })
  @ApiResponse({ status: 201, description: 'Character created' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCharacterDto) {
    return this.charactersService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List characters for current user' })
  findAll(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto) {
    return this.charactersService.findAllForUser(req.user.userId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get character by ID' })
  @ApiOkResponse({ type: CharacterDetailDto })
  @ApiResponse({ status: 403, description: "Not the owner or the DM of the character's campaign" })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.charactersService.findOneForUser(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update character' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCharacterDto
  ) {
    return this.charactersService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete character' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.charactersService.remove(id, req.user.userId);
  }
}
