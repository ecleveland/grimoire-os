import { Injectable } from '@nestjs/common';
import { Monster, Prisma } from '@prisma/client';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { UpdateMonsterDto } from './dto/update-monster.dto';

/** Monster columns stored as Json — plain null must become Prisma.DbNull. */
const JSON_COLUMNS = [
  'savingThrows',
  'skills',
  'specialAbilities',
  'actions',
  'reactions',
  'legendaryActions',
] as const;

/**
 * CRUD for user-authored (homebrew) monsters — the first per-type consumer of
 * the generalized content model (VEG-292/VEG-293). The authorization skeleton
 * lives in {@link ContentCrudService}; this class supplies the Json-column
 * normalization and the non-null `actions` guarantee the read side depends on.
 */
@Injectable()
export class HomebrewMonstersService extends ContentCrudService<
  Monster,
  CreateMonsterDto,
  UpdateMonsterDto
> {
  protected readonly tier = 'homebrew' as const;
  protected readonly noun = 'monster';

  protected get delegate(): ContentWriteDelegate<Monster> {
    return this.prisma.monster;
  }

  /**
   * The frontend monster type requires `actions`, so a create must never persist
   * null or leave it unset. `toColumnData` has already turned an explicit null
   * into `[]`, which leaves "omitted entirely" as the only case to cover here.
   */
  protected override beforeCreate(data: ColumnData): void {
    data.actions ??= [];
  }

  /**
   * Normalize a DTO into Prisma column data. Json columns sent as
   * `null` (the client's way of clearing an optional field, VEG-316) become
   * `Prisma.DbNull`: Prisma rejects plain JS null on Json fields.
   */
  protected toColumnData(dto: CreateMonsterDto | UpdateMonsterDto): ColumnData {
    // Copy so the caller's DTO is never mutated. Reserved ownership/tier
    // columns are stripped by the base, not here.
    const data: ColumnData = { ...dto };
    for (const key of JSON_COLUMNS) {
      if (key in data && data[key] === null) data[key] = Prisma.DbNull;
    }
    // The read-side SrdMonster type requires `actions`; a null clear becomes [].
    if ('actions' in data && data.actions === Prisma.DbNull) data.actions = [];
    return data;
  }
}
