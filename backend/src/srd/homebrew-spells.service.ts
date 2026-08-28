import { Injectable } from '@nestjs/common';
import { Spell } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService } from './content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { CreateSpellDto } from './dto/create-spell.dto';
import { UpdateSpellDto } from './dto/update-spell.dto';

/**
 * CRUD for user-authored (homebrew) spells (VEG-294). The authorization skeleton
 * (tier check, 404-vs-403 write guard, ownership stamp, write-error mapping)
 * lives in {@link ContentCrudService}; this class supplies only what is
 * spell-specific.
 */
@Injectable()
export class HomebrewSpellsService extends ContentCrudService<
  Spell,
  CreateSpellDto,
  UpdateSpellDto
> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'spell';

  constructor(prisma: PrismaService, contentAccess: ContentAccessService) {
    super(prisma, contentAccess);
  }

  protected get delegate(): ContentWriteDelegate<Spell> {
    return this.prisma.spell;
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * spell column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. `classes`, `ritual`, and
   * `concentration` are non-nullable columns, so a null clear (the client's way
   * of resetting an optional field, VEG-316) becomes their empty default.
   */
  protected toColumnData(dto: CreateSpellDto | UpdateSpellDto): ColumnData {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as ColumnData;
    if ('classes' in data && data.classes === null) data.classes = [];
    if ('ritual' in data && data.ritual === null) data.ritual = false;
    if ('concentration' in data && data.concentration === null) data.concentration = false;
    return data;
  }
}
