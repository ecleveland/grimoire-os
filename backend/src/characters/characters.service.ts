import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type {
  AbilityScores,
  CharacterClass,
  ClassSpellcasting,
  HitDice,
  Weapon,
} from '@grimoire-os/shared';
import {
  classesFrom,
  duplicateClassEntry,
  firstClassName,
  hitDicePoolsFor,
  inventoryFromJson,
  projectClassScalars,
  sumClassLevels,
} from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { CharacterDto, CharacterListItemDto } from './dto/character-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';
import {
  computeCharacterStats,
  isKnownAbilityName,
  type ResolvedClassData,
} from './compute/compute-stats';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { autoEquipStartingArmor } from './inventory/auto-equip';
import { ContentAccessService } from '../srd/content-access.service';
import {
  catalogNameWhere,
  resolveByUniqueName,
  resolveCatalogRef,
} from '../srd/resolve-catalog-ref';
import { captureCharacterSnapshot } from './snapshots/capture-snapshot';
import { classLevelMismatch } from '../common/validators/classes-sum-to-level.decorator';
import { MAX_CHARACTER_LEVEL } from '../common/validators/level-keyed-map.decorator';

// Slim projection for the characters list view (VEG-125). Characters carry
// 40+ columns; the list only renders name/race/class/level.
const characterListSelect = {
  id: true,
  userId: true,
  name: true,
  race: true,
  classes: true,
  level: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CharacterSelect;

/** The class row fields loadClassData reads. */
type ClassGrantRow = {
  id: string;
  name: string;
  spellcasting: unknown;
  weaponProficiencies: string[] | null;
};

/** A class entry with the visible catalog row its name and id resolved to, if any. */
type ResolvedEntry = { entry: CharacterClass; row: { id: string; hitDie: string } | null };

/** The stored pools, or null for none and for anything that is not an array. */
const poolsFrom = (value: Prisma.JsonValue | null | undefined): HitDice[] | null =>
  Array.isArray(value) ? (value as unknown as HitDice[]) : null;

/** 400 when non-empty class levels do not add up to the character level. */
function assertClassesSumToLevel(classes: readonly CharacterClass[], level: number): void {
  const mismatch = classLevelMismatch(classes, level);
  if (mismatch) throw new BadRequestException(mismatch);
}

/**
 * The entries as stored: each `classId` pinned to its resolved row, absent
 * fields null. `subclassId` is always null until the subclass step writes it;
 * the DTO refuses any other value. 400 when two entries pin the same row: the
 * DTO's duplicate check only sees the ids the client sent, so a free-typed name
 * and an id that resolve to one row pass it.
 */
function pinnedClasses(resolved: readonly ResolvedEntry[]): CharacterClass[] {
  const pinned = resolved.map(({ entry, row }) => ({
    classId: row?.id ?? null,
    name: entry.name,
    level: entry.level,
    subclass: entry.subclass ?? null,
    subclassId: null,
  }));
  const duplicate = duplicateClassEntry(pinned);
  if (duplicate) throw new BadRequestException(`classes has a duplicate class "${duplicate}"`);
  return pinned;
}

/** The pools the resolved classes produce, with spent dice carried from `carried`. */
const poolsForClasses = (resolved: readonly ResolvedEntry[], carried: HitDice[] | null) =>
  hitDicePoolsFor(
    resolved.flatMap(({ entry, row }) => (row ? [{ hitDie: row.hitDie, level: entry.level }] : [])),
    carried
  );

@Injectable()
export class CharactersService {
  private readonly logger = new Logger(CharactersService.name);

  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService,
    private inventoryResolver: InventoryResolverService,
    private contentAccess: ContentAccessService
  ) {}

  // Lightweight ownership/existence guard for write paths (VEG-346). Deliberately
  // still a narrow projection — update/remove don't pay for a full computed DTO +
  // class lookup just to authorize; the detail read path (findOneForUser) returns
  // the computed block. `classes` and `level` ride along because `update` checks
  // the sum rule against the stored value of whichever one a PATCH leaves out,
  // and `level` also tells it whether the PATCH is a one-level bump that takes a
  // snapshot. `hitDice` carries the spent dice into a rebuilt pool.
  private async assertOwnership(
    id: string,
    userId: string
  ): Promise<{
    userId: string;
    classes: Prisma.JsonValue;
    level: number;
    hitDice: Prisma.JsonValue | null;
  }> {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: { userId: true, classes: true, level: true, hitDice: true },
    });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  // Spell-slot maxima need a class's progression table and weapon proficiency
  // grants need its weapon list; one lookup per class entry serves both.
  //
  // Each entry resolves id-first. Its `classId` is a soft ref, not an FK, pinned
  // on every write that carries `classes`; its `name` is the display value and
  // the only key a free-typed class has.
  //
  // Scoped to `ownerId`'s visible content, because a class name is not globally
  // unique: two users may each own a homebrew "Fighter" alongside the SRD one,
  // and an unscoped read would let a stranger's homebrew drive this character's
  // spell slots and weapon proficiencies. A name resolves only when it matches
  // exactly one visible row, compared case-insensitively, the same rule the
  // client applies. An entry that resolves to nothing contributes nothing.
  //
  // Spellcasting comes from the first entry whose row has any, with the slots
  // read at that class's own level. Weapon proficiencies are the union over
  // every resolved entry.
  private async loadClassData(
    classes: readonly CharacterClass[],
    characterId: string,
    ownerId: string
  ): Promise<ResolvedClassData> {
    const rows = await Promise.all(
      classes.map(entry => this.resolveClassRow(entry, characterId, ownerId))
    );
    const casterIndex = rows.findIndex(row => row?.spellcasting);
    const caster = casterIndex >= 0 ? rows[casterIndex] : null;
    return {
      spellcasting: (caster?.spellcasting as ClassSpellcasting | undefined) ?? null,
      spellcastingLevel: caster ? classes[casterIndex].level : null,
      weaponProficiencies: [...new Set(rows.flatMap(row => row?.weaponProficiencies ?? []))],
    };
  }

  /** The visible class row one entry names, or null with a warning when there is none. */
  private async resolveClassRow(
    entry: CharacterClass,
    characterId: string,
    ownerId: string
  ): Promise<ClassGrantRow | null> {
    const select = { id: true, name: true, spellcasting: true, weaponProficiencies: true };

    // The id is looked up on its own, BEFORE the name, and that split is a
    // performance property rather than a stylistic one. The previous shape put
    // both keys in one `OR`, which Postgres cannot serve from two indexes when
    // one branch is not indexable: measured on a 5,000-row srd_classes, the
    // `(id = $1 OR name ILIKE $2)` form planned as a sequential scan at 0.836 ms
    // and never touched the primary key, against 0.026 ms for a BitmapOr of both
    // indexes. Most entries carry an id, so the common read is a primary-key hit
    // that never evaluates the name predicate at all, and only an id-less or
    // stale-id entry pays for the scan.
    //
    // Scoped to `ownerId`'s visible content in both branches. The id is
    // client-supplied with no FK behind it, so an unscoped read would hand a
    // guessed id a stranger's homebrew class.
    if (entry.classId) {
      const byId = await this.prisma.srdClass.findFirst({
        where: { AND: [{ id: entry.classId }, this.contentAccess.visibleTo(ownerId)] },
        select,
      });
      // A resolved id is authoritative: it records the row the picker actually
      // landed on, so it outranks any name reasoning. A stale or unknown id falls
      // through to the name path rather than clearing the class, so a character
      // keeps its grants for as long as the name stays unique.
      if (byId) return byId;
    }
    if (!entry.name) return this.warnUnresolvedClass(characterId, entry, 0);

    // Name fallback, for an entry with no stored id (a free-typed name) and for
    // one whose id went stale when its homebrew row was deleted. Scoping narrows
    // the ambiguity but does not remove it: once this owner has a homebrew
    // "Fighter", it and the SRD row both match, and the entry resolves to
    // nothing. A wrong spell-slot progression is worse than an absent one.
    const candidates = await this.prisma.srdClass.findMany({
      where: { AND: [catalogNameWhere(entry.name), this.contentAccess.visibleTo(ownerId)] },
      select,
    });
    const cls = resolveByUniqueName(candidates, entry.name);
    if (!cls) return this.warnUnresolvedClass(characterId, entry, candidates.length);
    return cls;
  }

  /**
   * Log why a class entry resolved to nothing, and return null.
   *
   * Both reasons drop spell slots, so the message says which one: an unknown name
   * is a typo to fix, a collision is a class the owner can re-pick in the editor.
   * Without this the sheet simply presents as an inexplicably slot-less caster.
   */
  private warnUnresolvedClass(
    characterId: string,
    entry: CharacterClass,
    matchCount: number
  ): null {
    const reason =
      matchCount > 1 ? `matches ${matchCount} visible classes` : 'not found in srd_classes';
    this.logger.warn(
      `Character ${characterId}: class "${entry.name}"${entry.classId ? ` (id ${entry.classId})` : ''} ${reason}; spell slots and class weapon proficiencies omitted`
    );
    return null;
  }

  /**
   * The write half of VEG-528: resolve a class name to the id of the single
   * visible row it names, or null when it names none or several.
   *
   * VEG-524 added `classId` but populated it from exactly one place — a user
   * clicking a dropdown row — so every character created through the API, and
   * every one predating the column, stayed on the name heuristic indefinitely.
   * Deriving here closes that: the resolution is frozen while the name is still
   * unambiguous, before a later homebrew class of the same name can make it
   * unanswerable.
   *
   * Same name rule and same visibility scoping as `loadClassData`, and the same
   * `resolveCatalogRef` decides, so a name that resolves on read resolves
   * identically on write.
   *
   * No `take`, and `name` is selected: the SQL predicate narrows but does not
   * decide, so the rows are counted by the same case-folded equality the read
   * path uses. An earlier version trusted `take: 2` plus the ILIKE predicate,
   * which is what let a class named "Wizar_" derive and permanently persist the
   * SRD Wizard's id. The fetch is bounded by the visibility scope anyway.
   *
   * Returns the row rather than the bare id: the hit-dice pools are built from
   * `hitDie`, and that column is free in a query that was already running and
   * already discarding everything but the id.
   *
   * VEG-531 adds the verify half. A client-supplied id joins the same query as
   * an `OR` branch, under the same visibility fragment, and `resolveCatalogRef`
   * decides: an id naming a visible row wins, and anything else (junk, a deleted
   * row, a stranger's homebrew) degrades to the unambiguous-name path, the same
   * rule the read path applies. A stranger's id is filtered out by the scope
   * before it can match, so it produces the same rows as a junk id and the
   * caller learns nothing about whether it exists.
   *
   * The merged `OR` is fine here, unlike on the read path: the name branch is an
   * ILIKE that already forces a sequential scan, so adding the id branch costs
   * no index this query was using.
   */
  private async deriveClass(
    className: string,
    ownerId: string,
    suppliedId: string | null = null
  ): Promise<{ id: string; hitDie: string } | null> {
    const nameWhere = catalogNameWhere(className);
    const candidates = await this.prisma.srdClass.findMany({
      where: {
        AND: [
          suppliedId ? { OR: [{ id: suppliedId }, nameWhere] } : nameWhere,
          this.contentAccess.visibleTo(ownerId),
        ],
      },
      select: { id: true, name: true, hitDie: true },
    });
    return resolveCatalogRef(candidates, { id: suppliedId, name: className }) ?? null;
  }

  /**
   * Resolve every class entry to the visible row its name and id name, one
   * `deriveClass` query per entry. The stored `classId` of each entry is that
   * row's id, or null when it names none or several.
   *
   * `||` rather than `??` on the supplied id on purpose: `''` passes
   * `@IsOptional() @IsString()` and means "no row", not "this row", so it falls
   * through to derivation and is normalised away instead of being stored as a
   * key that fails every id lookup while looking like one.
   */
  private resolveClassEntries(
    classes: readonly CharacterClass[],
    ownerId: string
  ): Promise<ResolvedEntry[]> {
    return Promise.all(
      classes.map(async entry => ({
        entry,
        row: await this.deriveClass(entry.name, ownerId, entry.classId || null),
      }))
    );
  }

  // Single place every detail read/write funnels through so the authoritative
  // `computed` block is always attached (VEG-346). Public because a snapshot read
  // runs its rebuilt row through the same builder.
  async toCharacterDto(character: Prisma.CharacterGetPayload<object>): Promise<CharacterDto> {
    // An unrecognized value (typo / bad import) would compute a confidently-wrong
    // save DC. Surface it. Still needed after VEG-493/494 closed the API write
    // boundary (@IsIn(ABILITY_NAMES) on the create + update DTOs): the column
    // itself stays free-form `String?`, so a seed, a migration, a restored
    // backup, or a direct DB write can still land a value the DTO would reject.
    if (character.spellcastingAbility && !isKnownAbilityName(character.spellcastingAbility)) {
      this.logger.warn(
        `Character ${character.id}: unrecognized spellcastingAbility "${character.spellcastingAbility}"; spell stats computed with modifier 0`
      );
    }
    const classes = classesFrom(character.classes);
    const classData = await this.loadClassData(classes, character.id, character.userId);
    const computed = computeCharacterStats(
      {
        level: character.level,
        experiencePoints: character.experiencePoints,
        abilityScores: character.abilityScores as AbilityScores | null,
        savingThrows: character.savingThrows,
        skills: character.skills,
        spellcastingAbility: character.spellcastingAbility,
        armorClass: character.armorClass,
        initiative: character.initiative,
        proficiencies: character.proficiencies,
        inventory: inventoryFromJson(character.inventory),
        weapons: Array.isArray(character.weapons) ? (character.weapons as unknown as Weapon[]) : [],
        exhaustion: character.exhaustion,
        speed: character.speed,
        // Scales the carry thresholds (VEG-490); free text, so an unrecognized
        // value falls back to the ×1 multiplier rather than being trusted.
        size: character.size,
        classes,
      },
      classData
    );
    // The deprecated scalar class fields are read from the first entry.
    return toDto(CharacterDto, { ...character, ...projectClassScalars(classes), computed });
  }

  async create(userId: string, dto: CreateCharacterDto) {
    // A character with no level sent takes the sum of its class levels, or 1
    // when it has no class, which is the column default. A sum past the cap is
    // refused, because every later save would send that level and fail the
    // DTO's @Max, leaving the character impossible to edit.
    const classes = dto.classes ?? [];
    const level = dto.level ?? (sumClassLevels(classes) || 1);
    if (dto.level === undefined && level > MAX_CHARACTER_LEVEL) {
      throw new BadRequestException(
        `classes levels sum to ${level} but the maximum level is ${MAX_CHARACTER_LEVEL}`
      );
    }
    assertClassesSumToLevel(classes, level);

    // campaignId is attacker-controlled input: without this check any
    // authenticated user could inject a character into an arbitrary campaign,
    // bypassing the POST /campaigns/:id/characters/:characterId guard (VEG-317).
    if (dto.campaignId) {
      await this.campaignAuth.assertCampaignMember(dto.campaignId, userId);
    }
    // autoEquipStartingGear is a transient control flag, not a column — pull it
    // off before the DTO is spread into Prisma (VEG-483). `classes` and
    // `hitDice` are written from what the service resolves below.
    const {
      autoEquipStartingGear,
      classes: _classes,
      hitDice: suppliedPools,
      level: _level,
      ...persisted
    } = dto;

    // Backfill catalog links + gear snapshots on starting equipment (VEG-462).
    // Applies to every create path, not just the guided builder: no
    // client-supplied "this came from the builder" flag would be trustworthy.
    let inventory = dto.inventory
      ? await this.inventoryResolver.resolveInventory(dto.inventory)
      : undefined;

    // Auto-equip is opt-in (VEG-483): only the guided builder sets the flag, so
    // a classic-editor or API create that deliberately left armor unequipped is
    // untouched. Runs after resolution, where the gear snapshot (and its
    // baseArmorClass) is present to rank body armor by.
    if (autoEquipStartingGear && inventory) {
      inventory = autoEquipStartingArmor(inventory);
    }

    // Pin each entry's resolution key. A supplied id that names a row the
    // creator can see is kept: the picker already said which row it meant, and
    // overriding it would break picking a duplicate-named class. Any other
    // supplied id is discarded and the name derives instead, so junk never
    // persists as a key. A name matching zero or several visible rows pins null.
    const resolved = await this.resolveClassEntries(classes, userId);
    const pinned = pinnedClasses(resolved);

    // A level-N class owns N hit dice of its die, all unspent unless the DTO
    // sent a pool of that die to carry the spent count from. The die comes from
    // the row resolved above, so the pools cost no query of their own. A class
    // with no visible row, or with a die that is not a real hit die, adds no
    // pool, and the level-up picker asks the player instead. When no class adds
    // a pool, the supplied pools are kept as sent. Otherwise a supplied pool of
    // a die no class produces is replaced, and its spent dice move to a derived
    // pool.
    const pools = poolsForClasses(resolved, suppliedPools ?? null);

    const character = await this.prisma.character.create({
      // Cast needed: class-validator DTOs aren't structurally compatible with
      // Prisma's InputJsonValue for JSON fields (abilityScores, hitPoints, etc.).
      // Safe because CreateCharacterDto only declares whitelisted fields.
      data: {
        ...(persisted as unknown as Prisma.CharacterUncheckedCreateInput),
        ...(inventory && { inventory: inventory as unknown as Prisma.InputJsonValue }),
        // Omitted when empty, which leaves the column at its SQL NULL default.
        ...(pools.length > 0 && { hitDice: pools as unknown as Prisma.InputJsonValue }),
        classes: pinned as unknown as Prisma.InputJsonValue,
        level,
        userId,
      },
    });
    return this.toCharacterDto(character);
  }

  async findAllForUser(userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.character.findMany({
        where,
        select: characterListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.character.count({ where }),
    ]);

    // The list shows the first class as the class.
    const rows = data.map(({ classes, ...row }) => ({
      ...row,
      class: firstClassName(classesFrom(classes)),
    }));
    return buildPaginatedResponse(toDtoArray(CharacterListItemDto, rows), total, page, limit);
  }

  async findOne(id: string) {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    return this.toCharacterDto(character);
  }

  async findOneForUser(id: string, userId: string) {
    const character = await this.findOne(id);
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  async update(id: string, userId: string, dto: UpdateCharacterDto) {
    const existing = await this.assertOwnership(id, userId);
    const { expectedVersion, ...changes } = dto;

    // A PATCH carrying `classes` or `level` is checked against the stored value
    // of whichever one it leaves out, and rebuilds the hit-dice pools from the
    // effective classes. One carrying neither, a rest or a spend that sends only
    // `hitDice` included, is stored as sent and pays for no class query.
    if (changes.classes !== undefined || changes.level !== undefined) {
      const classes = changes.classes ?? classesFrom(existing.classes);
      const level = changes.level ?? existing.level;
      assertClassesSumToLevel(classes, level);

      // Every entry is re-pinned whenever `classes` is sent, so a key can never
      // outlive the name it was resolved for. A visible id that resolves is
      // kept whatever the name says, so a re-save does not lose a key that
      // disambiguates a colliding name. An unknown id, a stranger's homebrew id
      // or an absent id derives from the name. The editor clears the id when
      // the player retypes the name, so a rename arrives with no id.
      const resolved = await this.resolveClassEntries(classes, userId);
      if (changes.classes !== undefined) {
        changes.classes = pinnedClasses(resolved);
      }
      // Spent dice carry from the pools this PATCH sends, else the stored ones.
      // No pool at all is SQL NULL. A plain null would store a jsonb null.
      const pools = poolsForClasses(resolved, changes.hitDice ?? poolsFrom(existing.hitDice));
      changes.hitDice = pools.length > 0 ? pools : (Prisma.DbNull as unknown as undefined);
    }
    // Cast needed for JSON field compatibility (see create method comment).
    // Safe because UpdateCharacterDto uses OmitType to exclude campaignId.
    const data = changes as unknown as Prisma.CharacterUncheckedUpdateInput;

    // A bump of exactly one level keeps a copy of the sheet as it stood at the
    // old level. The copy and the write share a transaction, so a write that
    // fails, including a stale-version 409, leaves no snapshot behind. A jump of
    // several levels, a level going down, or any other PATCH takes none.
    const levelsUp = changes.level !== undefined && changes.level === existing.level + 1;
    const character = levelsUp
      ? await this.prisma.$transaction(async tx => {
          await captureCharacterSnapshot(tx, id, `Level ${existing.level}`);
          return this.writeCharacter(tx, id, data, expectedVersion);
        })
      : await this.writeCharacter(this.prisma, id, data, expectedVersion);
    return this.toCharacterDto(character);
  }

  /**
   * Apply an update, guarded by `expectedVersion` when the caller sent one, and
   * return the updated row. Pass a transaction client to make the write part of
   * the caller's transaction; the 409 and 404 throw inside it.
   */
  private async writeCharacter(
    client: Pick<PrismaService, 'character'> | Prisma.TransactionClient,
    id: string,
    data: Prisma.CharacterUncheckedUpdateInput,
    expectedVersion: number | undefined
  ): Promise<Prisma.CharacterGetPayload<object>> {
    // No expectedVersion → caller opts out of optimistic locking (VEG-137).
    if (expectedVersion === undefined) {
      return client.character.update({ where: { id }, data });
    }

    // Guarded write: only succeeds if the row is still at expectedVersion.
    // `version` is non-unique, so updateMany with a compound where + atomic
    // increment is the correct primitive (plain update can't match on version).
    const { count } = await client.character.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await client.character.findUnique({
        where: { id },
        select: { version: true },
      });
      if (!current) {
        throw new NotFoundException(`Character "${id}" not found`);
      }
      throw new ConflictException({
        message: 'Character was modified by another request; re-fetch and retry.',
        currentVersion: current.version,
      });
    }
    const character = await client.character.findUnique({ where: { id } });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    return character;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.assertOwnership(id, userId);
    await this.prisma.character.delete({ where: { id } });
  }
}
