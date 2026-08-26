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

  // Lightweight ownership/existence guard for write paths (VEG-346). Selects
  // only `userId` so update/remove don't pay for a full computed DTO + class
  // lookup just to authorize — the detail read path (findOneForUser) still
  // returns the computed block.
  private async assertOwnership(id: string, userId: string): Promise<void> {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
  }

  // Spell-slot maxima need the class's progression table (VEG-346) and weapon
  // proficiency grants need its weapon list (VEG-463) — one lookup serves
  // both. Still resolved by name because `Character.class` is a free-text
  // column, not an FK (VEG-477 tracks making it id-keyed).
  //
  // Scoped to `ownerId`'s visible content since VEG-505 tiered SrdClass: the
  // name is no longer globally unique, so two users may each own a homebrew
  // "Fighter" alongside the SRD one. An unscoped findFirst here would let
  // whichever row Postgres returned first — possibly a stranger's homebrew —
  // drive this character's spell slots and weapon proficiencies. Unknown
  // classes resolve to nothing, in which case slots are omitted and weapon
  // grants fall back to the character's own proficiencies column.
  private async loadClassData(
    className: string | null,
    characterId: string,
    ownerId: string
  ): Promise<{ spellcasting: ClassSpellcasting | null; weaponProficiencies: string[] }> {
    const none = { spellcasting: null, weaponProficiencies: [] };
    if (!className) return none;
    // Scoping narrows the ambiguity but does not remove it: once VEG-506 lets
    // this owner create a homebrew "Fighter", it and the SRD row both match, and
    // an unordered read lets Postgres return either — so the same character's
    // spell slots and weapon proficiencies could flip between reads.
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
    const candidates = await this.prisma.srdClass.findMany({
      where: { name: className, ...this.contentAccess.visibleTo(ownerId) },
      select: { contentSource: true, spellcasting: true, weaponProficiencies: true },
    });
    const ofTier = (tier: ContentSource) => candidates.find(c => c.contentSource === tier);
    const cls = ofTier('homebrew') ?? ofTier('shared') ?? ofTier('srd');
    if (!cls) {
      // A non-null class with no matching row (typo or homebrew not in the
      // catalog) silently drops spell slots — log so it's diagnosable rather
      // than presenting as an inexplicably slot-less caster.
      this.logger.warn(
        `Character ${characterId}: class "${className}" not found in srd_classes; spell slots and class weapon proficiencies omitted`
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
    const classData = await this.loadClassData(character.class, character.id, character.userId);
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
    await this.assertOwnership(id, userId);
    const { expectedVersion, ...changes } = dto;
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
