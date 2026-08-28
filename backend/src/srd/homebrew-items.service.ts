import { Injectable } from '@nestjs/common';
import { Item } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService } from './content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { toItemColumnData } from './homebrew-write.helpers';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

/**
 * CRUD for user-authored (homebrew) items (VEG-296). The authorization skeleton
 * lives in {@link ContentCrudService}; the column mapping is shared with the
 * admin shared-tier writer via {@link toItemColumnData} so the same `Item`
 * entity normalizes identically whichever tier writes it.
 */
@Injectable()
export class HomebrewItemsService extends ContentCrudService<Item, CreateItemDto, UpdateItemDto> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'item';

  constructor(prisma: PrismaService, contentAccess: ContentAccessService) {
    super(prisma, contentAccess);
  }

  protected get delegate(): ContentWriteDelegate<Item> {
    return this.prisma.item;
  }

  protected toColumnData(dto: CreateItemDto | UpdateItemDto): ColumnData {
    return toItemColumnData(dto);
  }
}
