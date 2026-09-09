import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AbilityScores, ClassSpellcasting, Weapon } from '@grimoire-os/shared';
import { inventoryFromJson } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { CharacterDto, CharacterListItemDto } from './dto/character-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';
import { computeCharacterStats, isKnownAbilityName } from './compute/compute-stats';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { autoEquipStartingArmor } from './inventory/auto-equip';
import { ContentAccessService } from '../srd/content-access.service';
import { catalogNameWhere, resolveByUniqueName } from '../srd/resolve-catalog-ref';

// Slim projection for the characters list view (VEG-125). Characters carry
// 40+ columns; the list only renders name/race/class/level.
const characterListSelect = {
  id: true,
  userId: true,
  name: true,
  race: true,
  class: true,
  level: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CharacterSelect;

/** Project a resolved class row onto the two grants loadClassData returns. */
const classDataFrom = (row: { spellcasting: unknown; weaponProficiencies: string[] | null }) => ({
  spellcasting: (row.spellcasting as ClassSpellcasting | null) ?? null,
  weaponProficiencies: row.weaponProficiencies ?? [],
});

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
  // the computed block. `class` rides along because `update` needs the stored name
  // to tell a real class change from a re-save of the same one, and `classId`
  // because a re-save can only safely heal a key that is currently absent.
  private async assertOwnership(
    id: string,
    userId: string
  ): Promise<{ userId: string; class: string | null; classId: string | null }> {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: { userId: true, class: true, classId: true },
    });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  // Spell-slot maxima need the class's progression table (VEG-346) and weapon
  // proficiency grants need its weapon list (VEG-463) — one lookup serves both.
  //
  // Resolved id-first since VEG-524. `Character.classId` is a soft ref, not an
  // FK, written whenever the picker resolved a catalog row; `Character.class`
  // (free text) remains the display value and the only key a pre-VEG-524
  // character or a free-typed name has.
  //
  // Scoped to `ownerId`'s visible content since VEG-505 tiered SrdClass: the
  // name is no longer globally unique, so two users may each own a homebrew
  // "Fighter" alongside the SRD one. An unscoped read would let whichever row
  // Postgres returned first — possibly a stranger's homebrew — drive this
  // character's spell slots and weapon proficiencies. Unknown classes resolve to
  // nothing, in which case slots are omitted and weapon grants fall back to the
  // character's own proficiencies column.
  //
  // VEG-528 settled the two questions VEG-524 left answered differently here and
  // on the client. Both resolvers now fold case, and both refuse a name matching
  // zero or many visible rows. See `deriveClassId` for the write half.
  private async loadClassData(
    className: string | null,
    classId: string | null,
    characterId: string,
    ownerId: string
  ): Promise<{ spellcasting: ClassSpellcasting | null; weaponProficiencies: string[] }> {
    const none = { spellcasting: null, weaponProficiencies: [] };
    if (!className && !classId) return none;
    const select = { id: true, name: true, spellcasting: true, weaponProficiencies: true };

    // The id is looked up on its own, BEFORE the name, and that split is a
    // performance property rather than a stylistic one. The previous shape put
    // both keys in one `OR`, which Postgres cannot serve from two indexes when
    // one branch is not indexable: measured on a 5,000-row srd_classes, the
    // `(id = $1 OR name ILIKE $2)` form planned as a sequential scan at 0.836 ms
    // and never touched the primary key, against 0.026 ms for a BitmapOr of both
    // indexes. Since the backfill most characters carry an id, so the common read
    // is now a primary-key hit that never evaluates the name predicate at all,
    // and only an id-less or stale-id character pays for the scan.
    //
    // Scoped to `ownerId`'s visible content in both branches. The id is
    // client-supplied with no FK behind it, so an unscoped read would hand a
    // guessed id a stranger's homebrew class.
    if (classId) {
      const byId = await this.prisma.srdClass.findFirst({
        where: { AND: [{ id: classId }, this.contentAccess.visibleTo(ownerId)] },
        select,
      });
      // A resolved id is authoritative — it records the row the picker actually
      // landed on, so it outranks any name reasoning. A stale or unknown id falls
      // through to the name path rather than clearing the class, so a character
      // keeps its grants for as long as the name stays unique.
      if (byId) return classDataFrom(byId);
    }
    if (!className) return this.warnUnresolvedClass(characterId, className, classId, 0);

    // Name fallback, for a character with no stored id (pre-VEG-524, or a
    // free-typed name) and for one whose id went stale when its homebrew row was
    // deleted. Scoping narrows the ambiguity but does not remove it: once this
    // owner has a homebrew "Fighter", it and the SRD row both match.
    //
    // It resolves only when the name matches exactly one visible row. VEG-524
    // shipped a tier preference here (homebrew ?? shared ?? srd), which meant
    // authoring a homebrew "Wizard" retroactively repointed every one of this
    // owner's id-less Wizards at it and deleting it flipped them back, with
    // nothing on the sheet saying so. It also disagreed with the client, which
    // has always refused. VEG-528 chose refusal for both: a wrong spell-slot
    // progression is worse than an absent one, and the accompanying backfill
    // pinned an id on every character whose name resolves cleanly today.
    const candidates = await this.prisma.srdClass.findMany({
      where: { AND: [catalogNameWhere(className), this.contentAccess.visibleTo(ownerId)] },
      select,
    });
    const cls = resolveByUniqueName(candidates, className);
    if (!cls) {
      return this.warnUnresolvedClass(characterId, className, classId, candidates.length);
    }
    return classDataFrom(cls);
  }

  /**
   * Log why a class resolved to nothing, and return the empty grant.
   *
   * Both reasons drop spell slots, so the message says which one: an unknown name
   * is a typo to fix, a collision is a class the owner can re-pick in the editor.
   * The colliding ids are listed because they are the one fact that makes the
   * warning actionable — an operator otherwise cannot tell the owner which two
   * rows to choose between. Without any of this the sheet simply presents as an
   * inexplicably slot-less caster.
   */
  private warnUnresolvedClass(
    characterId: string,
    className: string | null,
    classId: string | null,
    matchCount: number
  ): { spellcasting: null; weaponProficiencies: string[] } {
    const reason =
      matchCount > 1 ? `matches ${matchCount} visible classes` : 'not found in srd_classes';
    this.logger.warn(
      `Character ${characterId}: class "${className}"${classId ? ` (id ${classId})` : ''} ${reason}; spell slots and class weapon proficiencies omitted`
    );
    return { spellcasting: null, weaponProficiencies: [] };
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
   */
  private async deriveClassId(className: string, ownerId: string): Promise<string | null> {
    const candidates = await this.prisma.srdClass.findMany({
      where: { AND: [catalogNameWhere(className), this.contentAccess.visibleTo(ownerId)] },
      select: { id: true, name: true },
    });
    return resolveByUniqueName(candidates, className)?.id ?? null;
  }

  // Single place every detail read/write funnels through so the authoritative
  // `computed` block is always attached (VEG-346).
  private async toCharacterDto(
    character: Prisma.CharacterGetPayload<object>
  ): Promise<CharacterDto> {
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
    const classData = await this.loadClassData(
      character.class,
      character.classId,
      character.id,
      character.userId
    );
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
      },
      classData.spellcasting,
      classData.weaponProficiencies
    );
    return toDto(CharacterDto, { ...character, computed });
  }

  async create(userId: string, dto: CreateCharacterDto) {
    // campaignId is attacker-controlled input: without this check any
    // authenticated user could inject a character into an arbitrary campaign,
    // bypassing the POST /campaigns/:id/characters/:characterId guard (VEG-317).
    if (dto.campaignId) {
      await this.campaignAuth.assertCampaignMember(dto.campaignId, userId);
    }
    // autoEquipStartingGear is a transient control flag, not a column — pull it
    // off before the DTO is spread into Prisma (VEG-483).
    const { autoEquipStartingGear, ...persisted } = dto;

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

    // Pin the resolution key when the client sent only a display name (VEG-528).
    // Every API create used to land here with a null classId and never acquire
    // one. A supplied id is left alone: the picker already said which row it
    // meant, and overriding it would break picking a duplicate-named class.
    // `||` rather than `??` on purpose: `''` is legal under `@IsOptional()
    // @IsString()` and means "no row", not "this row", so it falls through to
    // derivation and is normalised away instead of being stored as a key that
    // fails every id lookup while looking like one.
    // A classless character carries no key. `classId` is the resolution key FOR
    // `class`, so an id with no name to resolve is not a stricter reference, it
    // is an incoherent one: loadClassData would grant that class's spell slots
    // and weapon proficiencies to a sheet showing no class at all. update()
    // already nulls the id when the name is cleared; this is the create half.
    const classId = persisted.class
      ? persisted.classId || (await this.deriveClassId(persisted.class, userId))
      : null;

    const character = await this.prisma.character.create({
      // Cast needed: class-validator DTOs aren't structurally compatible with
      // Prisma's InputJsonValue for JSON fields (abilityScores, hitPoints, etc.).
      // Safe because CreateCharacterDto only declares whitelisted fields.
      data: {
        ...(persisted as unknown as Prisma.CharacterUncheckedCreateInput),
        ...(inventory && { inventory: inventory as unknown as Prisma.InputJsonValue }),
        classId,
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

    return buildPaginatedResponse(toDtoArray(CharacterListItemDto, data), total, page, limit);
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

    // `class` and `classId` are a pair — the id is the resolution key FOR that
    // name (VEG-524), not an independent pointer. Both are optional fields on the
    // DTO, so a PATCH can legally move one and not the other, and this is the
    // only place they can drift apart.
    //
    // It has to be fixed here rather than on read, because once they disagree the
    // read path has no way to tell which side went stale: a class renamed out from
    // under a character produces exactly the same disagreement as a name PATCHed
    // without a new id, and preferring either one silently corrupts the other
    // case. Preferring the id made a character PATCHed to "Wizard" keep computing
    // as a Fighter; preferring the name made a renamed homebrew class resolve to
    // the SRD row that still carries its old name. Neither warned.
    //
    // So: changing the name without supplying a new key drops the key. The class
    // then resolves by name — ambiguously if it collides, which the resolvers
    // handle — instead of confidently resolving to the wrong row. A re-save of the
    // same name is not a change and keeps its key.
    //
    // VEG-528 turns the drop into a re-derivation. Dropping alone was half a fix:
    // it stopped the id naming the wrong row but left the character on the name
    // heuristic forever. Re-deriving does both, and still yields null when the
    // new name collides — the case with no answer.
    //
    // The explicit-null branch matters more than it looks. The editor sends
    // `classId: null` for anything the picker did not land on, which since
    // VEG-527 includes a name the user merely typed, so honouring the null
    // literally would make every keystroke-then-save decay the column.
    //
    // Both branches are gated on the payload actually concerning the class, so a
    // level-up or hit-point PATCH pays for no extra query — and, critically, a
    // PATCH that omits `classId` entirely never overwrites a stored id this
    // method cannot see (assertOwnership does not select it).
    const renamedWithoutKey =
      changes.class !== undefined &&
      changes.classId === undefined &&
      changes.class !== existing.class;
    // `''` groups with `null`, not with a real id: both mean "the picker landed
    // on no row", and `create` normalises them the same way. Storing the empty
    // string leaves a value that fails every id lookup, that the backfill's
    // `classId IS NULL` skips, and that no repair path can reach.
    const clearedKey = changes.classId !== undefined && !changes.classId;
    // A re-save of the SAME name heals a key that is currently absent. Without
    // this the schema comment's claim that "an edit heals the column" held only
    // for the browser editor, which happens to send `classId: null` on every
    // save; an API client re-sending the same name never healed, and that is
    // precisely the population the ticket exists for.
    //
    // Gated on the STORED key being empty, which is why `assertOwnership` selects
    // it. Re-deriving unconditionally would be destructive, not merely wasteful:
    // for an owner whose homebrew "Wizard" collides with the SRD one, derivation
    // returns null, so a plain `PATCH {"class":"Wizard"}` would erase the very id
    // that was pinning their character to the right row.
    const healsAbsentKey =
      changes.class !== undefined && changes.classId === undefined && !existing.classId;
    if (renamedWithoutKey || clearedKey || healsAbsentKey) {
      // `!== undefined`, not `??`. @IsOptional() skips validation for null as
      // well as undefined, so `class: null` arrives as a real value meaning
      // "this character has no class" — and `??` would have read straight past
      // it to the OLD name, pinning that row's id onto a now-classless sheet.
      // loadClassData resolves a present id first, so the character would have
      // gone on computing its old class's spell slots forever.
      const name = changes.class !== undefined ? changes.class : existing.class;
      changes.classId = name ? await this.deriveClassId(name, userId) : null;
    }
    // Cast needed for JSON field compatibility (see create method comment).
    // Safe because UpdateCharacterDto uses OmitType to exclude campaignId.
    const data = changes as unknown as Prisma.CharacterUncheckedUpdateInput;

    // No expectedVersion → caller opts out of optimistic locking (VEG-137).
    if (expectedVersion === undefined) {
      const character = await this.prisma.character.update({ where: { id }, data });
      return this.toCharacterDto(character);
    }

    // Guarded write: only succeeds if the row is still at expectedVersion.
    // `version` is non-unique, so updateMany with a compound where + atomic
    // increment is the correct primitive (plain update can't match on version).
    const { count } = await this.prisma.character.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.character.findUnique({
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
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    return this.toCharacterDto(character);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.assertOwnership(id, userId);
    await this.prisma.character.delete({ where: { id } });
  }
}
