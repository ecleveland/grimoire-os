import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { aggregateCombatantLoot, Combatant, EncounterLootTotal } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService, campaignAuthSelect } from '../auth/campaign-auth.service';
import { ContentAccessService } from '../srd/content-access.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SeededRng } from '../common/helpers/seeded-rng';
import { MonsterLootService } from '../loot/monster-loot.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { RollEncounterLootDto } from './dto/roll-encounter-loot.dto';
import { EncounterDto, EncounterListItemDto } from './dto/encounter-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';

// Slim projection for the encounters list view (VEG-125): drops currentTurn and
// createdById, which the list does not render.
const encounterListSelect = {
  id: true,
  campaignId: true,
  name: true,
  combatants: true,
  round: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EncounterSelect;

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService,
    private monsterLoot: MonsterLootService,
    private contentAccess: ContentAccessService
  ) {}

  /**
   * Loads the monsters for a set of (already deduplicated) ids for loot rolls
   * (VEG-300). With `tolerateMissing` (roll-all), dangling references — e.g. a
   * homebrew monster its owner deleted (VEG-293) — are simply absent from the
   * result so their combatants are skipped; without it (an explicitly targeted
   * combatant), a dangling reference throws 400.
   */
  private async getReferencedMonsters(ids: string[], opts: { tolerateMissing?: boolean } = {}) {
    const monsters = await this.prisma.monster.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, challengeRating: true },
    });
    if (!opts.tolerateMissing && monsters.length !== ids.length) {
      const foundIds = new Set(monsters.map(m => m.id));
      const missing = ids.filter(id => !foundIds.has(id));
      throw new BadRequestException(`Unknown monsterId reference(s): ${missing.join(', ')}`);
    }
    return monsters;
  }

  /**
   * VEG-258/VEG-293: when combatants carry a `monsterId`, verify each one
   * references a monster the writer can see — the global catalog plus their own
   * homebrew. Without the visibility scope, an id probe could attach (and
   * loot-roll stats off) another user's private homebrew. Ids in `knownIds`
   * (already on the stored encounter) are grandfathered so deleting a homebrew
   * monster never makes encounters referencing it un-saveable. Throws 400
   * listing any unknown references.
   */
  private async assertMonsterReferences(
    combatants: CreateEncounterDto['combatants'],
    userId: string,
    knownIds: ReadonlySet<string> = new Set()
  ): Promise<void> {
    if (!combatants) return;
    const ids = [
      ...new Set(combatants.map(c => c.monsterId).filter((id): id is string => id !== undefined)),
    ].filter(id => !knownIds.has(id));
    if (ids.length === 0) return;
    const visible = await this.prisma.monster.findMany({
      where: { id: { in: ids }, ...this.contentAccess.visibleTo(userId) },
      select: { id: true },
    });
    if (visible.length !== ids.length) {
      const foundIds = new Set(visible.map(m => m.id));
      const missing = ids.filter(id => !foundIds.has(id));
      throw new BadRequestException(`Unknown monsterId reference(s): ${missing.join(', ')}`);
    }
  }

  async create(userId: string, dto: CreateEncounterDto) {
    await this.campaignAuth.assertCampaignOwner(dto.campaignId, userId);
    await this.assertMonsterReferences(dto.combatants, userId);
    const { combatants, ...rest } = dto;
    const encounter = await this.prisma.encounter.create({
      data: {
        ...rest,
        createdById: userId,
        combatants: combatants as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(EncounterDto, encounter);
  }

  async findAllForCampaign(campaignId: string, userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const where = { campaignId };

    const [data, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where,
        select: encounterListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return buildPaginatedResponse(toDtoArray(EncounterListItemDto, data), total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const result = await this.prisma.encounter.findUnique({
      where: { id },
      include: { campaign: { select: campaignAuthSelect } },
    });
    if (!result) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    const { campaign, ...encounter } = result;
    this.campaignAuth.assertMemberOnCampaign(campaign, userId);
    return toDto(EncounterDto, encounter);
  }

  async update(id: string, userId: string, dto: UpdateEncounterDto) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
      select: {
        id: true,
        combatants: true,
        campaign: { select: campaignAuthSelect },
      },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    this.campaignAuth.assertOwnerOnCampaign(encounter.campaign, userId);
    const storedCombatants = (encounter.combatants as unknown as Combatant[] | null) ?? [];
    const knownIds = new Set(
      storedCombatants.map(c => c.monsterId).filter((mid): mid is string => mid !== undefined)
    );
    await this.assertMonsterReferences(dto.combatants, userId, knownIds);
    const { combatants, expectedVersion, ...rest } = dto;
    const data = {
      ...rest,
      ...(combatants !== undefined && {
        combatants: combatants as unknown as Prisma.InputJsonValue,
      }),
    };

    const updated = await this.writeWithVersionGuard(id, data, expectedVersion);
    return toDto(EncounterDto, updated);
  }

  /**
   * Applies `data` to an encounter, honoring the optimistic-locking contract
   * (VEG-137): no `expectedVersion` → plain write; otherwise the write only
   * succeeds while the row is still at that version, incrementing it. Shared
   * by field updates and loot rolls so every encounter write conflicts the
   * same way. Note the contract's blind spot: unguarded writes do NOT bump
   * `version`, so they are invisible to later guarded writes — the 409 only
   * fires when the intervening write itself carried an `expectedVersion`.
   */
  private async writeWithVersionGuard(
    id: string,
    data: Prisma.EncounterUpdateInput,
    expectedVersion: number | undefined
  ) {
    if (expectedVersion === undefined) {
      return this.prisma.encounter.update({ where: { id }, data });
    }

    // Guarded write: only succeeds if the row is still at expectedVersion.
    // `version` is non-unique, so updateMany with a compound where + atomic
    // increment is the correct primitive (plain update can't match on version).
    const { count } = await this.prisma.encounter.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.encounter.findUnique({
        where: { id },
        select: { version: true },
      });
      if (!current) {
        throw new NotFoundException(`Encounter "${id}" not found`);
      }
      throw new ConflictException({
        message: 'Encounter was modified by another request; re-fetch and retry.',
        currentVersion: current.version,
      });
    }
    const updated = await this.prisma.encounter.findUnique({ where: { id } });
    if (!updated) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    return updated;
  }

  /**
   * Rolls loot for the encounter's monster combatants (VEG-300): every
   * combatant with a `monsterId`, or just `dto.combatantIndex` when given.
   * Each target's loot is rolled off its source monster's type × CR via the
   * shared loot engine and replaces any previous roll. Per-combatant RNG is
   * derived as `seed:index`, so a seed reproduces the whole roll and skipped
   * combatants don't shift their neighbours' results.
   */
  async rollLoot(
    id: string,
    userId: string,
    dto: RollEncounterLootDto
  ): Promise<{ encounter: EncounterDto; lootTotal: EncounterLootTotal }> {
    const result = await this.prisma.encounter.findUnique({
      where: { id },
      include: { campaign: { select: campaignAuthSelect } },
    });
    if (!result) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    this.campaignAuth.assertOwnerOnCampaign(result.campaign, userId);

    const combatants = (result.combatants as unknown as Combatant[] | null) ?? [];
    const targetIndexes = this.resolveLootTargets(combatants, dto.combatantIndex);

    const monsterIds = [...new Set(targetIndexes.map(i => combatants[i].monsterId as string))];
    // Roll-all tolerates dangling references (deleted monsters) by skipping
    // those combatants; an explicitly targeted combatant still 400s.
    const monsters = await this.getReferencedMonsters(monsterIds, {
      tolerateMissing: dto.combatantIndex === undefined,
    });
    const monstersById = new Map(monsters.map(m => [m.id, m]));

    const roller = await this.monsterLoot.loadRoller();
    const seed = dto.seed ?? SeededRng.generateSeed();
    const rolledAt = new Date().toISOString();
    const targets = new Set(targetIndexes);
    const updatedCombatants = combatants.map((combatant, index) => {
      if (!targets.has(index)) return combatant;
      const monster = monstersById.get(combatant.monsterId as string);
      if (!monster) return combatant; // dangling reference on a roll-all — skip
      const rolled = roller.rollForMonster(
        { type: monster.type, challengeRating: monster.challengeRating },
        new SeededRng(`${seed}:${index}`)
      );
      return {
        ...combatant,
        loot: { coinage: rolled.coinage, items: rolled.items, rolledAt },
      };
    });

    const updated = await this.writeWithVersionGuard(
      id,
      { combatants: updatedCombatants as unknown as Prisma.InputJsonValue },
      dto.expectedVersion
    );
    return {
      encounter: toDto(EncounterDto, updated),
      lootTotal: aggregateCombatantLoot(updatedCombatants),
    };
  }

  /** Which combatant indexes a loot roll applies to; throws 400 when none. */
  private resolveLootTargets(
    combatants: Combatant[],
    combatantIndex: number | undefined
  ): number[] {
    if (combatantIndex !== undefined) {
      const combatant = combatants[combatantIndex];
      if (!combatant) {
        throw new BadRequestException(
          `combatantIndex ${combatantIndex} is out of range (encounter has ${combatants.length} combatants)`
        );
      }
      if (!combatant.monsterId) {
        throw new BadRequestException(
          `Combatant "${combatant.name}" has no linked monster to roll loot from`
        );
      }
      return [combatantIndex];
    }

    const indexes = combatants.flatMap((c, i) => (c.monsterId ? [i] : []));
    if (indexes.length === 0) {
      throw new BadRequestException('No combatant references a monster to roll loot from');
    }
    return indexes;
  }

  async remove(id: string, userId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
      select: {
        id: true,
        campaign: { select: campaignAuthSelect },
      },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    this.campaignAuth.assertOwnerOnCampaign(encounter.campaign, userId);
    await this.prisma.encounter.delete({ where: { id } });
  }
}
