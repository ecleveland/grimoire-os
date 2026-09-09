import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AbilityScores, ClassSpellcasting, ContentSource, Weapon } from '@grimoire-os/shared';
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
  // to tell a real class change from a re-save of the same one.
  private async assertOwnership(
    id: string,
    userId: string
  ): Promise<{ userId: string; class: string | null }> {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: { userId: true, class: true },
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
  // "Fighter" alongside the SRD one. An unscoped findFirst here would let
  // whichever row Postgres returned first — possibly a stranger's homebrew —
  // drive this character's spell slots and weapon proficiencies. The scoping
  // wraps the id lookup too: the id is client-supplied with no FK behind it, so
  // an unscoped read would hand a guessed id a stranger's homebrew class.
  // Unknown classes resolve to nothing, in which case slots are omitted and
  // weapon grants fall back to the character's own proficiencies column.
  private async loadClassData(
    className: string | null,
    classId: string | null,
    characterId: string,
    ownerId: string
  ): Promise<{ spellcasting: ClassSpellcasting | null; weaponProficiencies: string[] }> {
    const none = { spellcasting: null, weaponProficiencies: [] };
    if (!className && !classId) return none;
    // One round trip fetches both keys' candidates. The disjunction sits under
    // an explicit AND with the visibility fragment rather than being spread
    // beside it: `visibleTo` is itself a bare `{ OR: [...] }`, so two OR keys in
    // one object would have the later silently overwrite the former and drop the
    // scoping — the exact leak the scoping exists to prevent.
    const candidates = await this.prisma.srdClass.findMany({
      where: {
        AND: [
          {
            OR: [
              ...(classId ? [{ id: classId }] : []),
              ...(className ? [{ name: className }] : []),
            ],
          },
          this.contentAccess.visibleTo(ownerId),
        ],
      },
      select: { id: true, contentSource: true, spellcasting: true, weaponProficiencies: true },
    });

    // A stored id is authoritative — it records which row the picker actually
    // resolved, so it outranks the name heuristic below (same contract as the
    // frontend's resolveClass and VEG-476's resolveBackground).
    const byId = classId ? candidates.find(c => c.id === classId) : undefined;

    // Name fallback, for a character with no stored id (pre-VEG-524, or a
    // free-typed name) and for one whose id went stale when its homebrew row was
    // deleted. Scoping narrows the name ambiguity but does not remove it: once
    // this owner has a homebrew "Fighter", it and the SRD row both match, and an
    // unordered read lets Postgres return either.
    //
    // Resolved by tier, in code. An earlier attempt sorted by `createdById` on
    // the theory that only homebrew rows carry a creator; shared rows carry one
    // too (AdminItemsService.create writes `contentSource: 'shared'` alongside
    // `createdById`, and this table's SET NULL FK exists precisely so a shared
    // row survives its author), so that sort collapsed into comparing two uuids.
    //
    // The partial unique indexes make this total: at most one srd row and one
    // shared row per name, and the `where` admits only this owner's homebrew,
    // of which there is at most one. So the fetch is bounded at three rows and
    // the preference below picks the same one every time.
    //
    // Consequence worth knowing, and the reason VEG-524 added the id: for a
    // character with no id recorded, creating a homebrew class named "Fighter"
    // retroactively repoints every one of this owner's existing Fighters at it,
    // and deleting it flips them back. Preferring the SRD row instead would be
    // equally surprising in the other direction. This stays a documented
    // heuristic for id-less characters, not a rule.
    //
    // Scanning every candidate is safe rather than sloppy: reaching here means
    // `byId` found nothing, so no fetched row carries `classId` and every row
    // present came from the name clause. Re-filtering on name would be dead.
    const ofTier = (tier: ContentSource) => candidates.find(c => c.contentSource === tier);
    const cls = byId ?? ofTier('homebrew') ?? ofTier('shared') ?? ofTier('srd');
    if (!cls) {
      // A non-null class with no matching row (typo or homebrew not in the
      // catalog) silently drops spell slots — log so it's diagnosable rather
      // than presenting as an inexplicably slot-less caster.
      this.logger.warn(
        `Character ${characterId}: class "${className}"${classId ? ` (id ${classId})` : ''} not found in srd_classes; spell slots and class weapon proficiencies omitted`
      );
      return none;
    }
    return {
      spellcasting: (cls.spellcasting as ClassSpellcasting | null) ?? null,
      weaponProficiencies: cls.weaponProficiencies ?? [],
    };
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

    const character = await this.prisma.character.create({
      // Cast needed: class-validator DTOs aren't structurally compatible with
      // Prisma's InputJsonValue for JSON fields (abilityScores, hitPoints, etc.).
      // Safe because CreateCharacterDto only declares whitelisted fields.
      data: {
        ...(persisted as unknown as Prisma.CharacterUncheckedCreateInput),
        ...(inventory && { inventory: inventory as unknown as Prisma.InputJsonValue }),
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
    if (
      changes.class !== undefined &&
      changes.classId === undefined &&
      changes.class !== existing.class
    ) {
      changes.classId = null;
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
