// NestJS service that orchestrates the NPC generator pipeline:
// load reference data → run the pure pipeline → optionally persist.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignAuthService } from '../../auth/campaign-auth.service';
import { NpcPipeline } from './npc-pipeline';
import { NpcRefDataLoader } from './npc-ref-data.loader';
import { normalizeLootOverrides } from '../../loot/loot-overrides';
import { SeededRng } from '../../common/helpers/seeded-rng';
import {
  GeneratedNpc,
  NpcGenerationConstraints,
  NpcGenerationParams,
  NpcLootOverrides,
  RerollField,
} from './npc-generator.types';

@Injectable()
export class NpcGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignAuth: CampaignAuthService,
    private readonly refDataLoader: NpcRefDataLoader
  ) {}

  /**
   * Preview-only generate. Does not persist — the frontend calls POST /npcs
   * (existing CRUD) with the returned payload to save.
   */
  async generate(userId: string, constraints: NpcGenerationConstraints): Promise<GeneratedNpc> {
    await this.campaignAuth.assertCampaignOwner(constraints.campaignId, userId);
    const refData = await this.refDataLoader.load();
    const pipeline = new NpcPipeline(refData);
    const seed = constraints.seed ?? SeededRng.generateSeed();
    return pipeline.generate(constraints, seed);
  }

  /**
   * Re-runs the relevant step(s) using the persisted GenerationParams,
   * honoring lockedFields, persists the new values to the NPC, and returns
   * the updated row.
   */
  async reroll(
    npcId: string,
    userId: string,
    field: RerollField,
    lootOverrides?: NpcLootOverrides | null
  ) {
    if (lootOverrides !== undefined && field !== 'loot') {
      throw new BadRequestException('lootOverrides is only supported when field is "loot"');
    }
    const existing = await this.prisma.npc.findUnique({
      where: { id: npcId },
    });
    if (!existing) throw new NotFoundException(`Npc "${npcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(existing.campaignId, userId);

    // A locked loot field makes the reroll a no-op replay — accepting
    // overrides anyway would mutate the saved odds through an endpoint that
    // otherwise changes nothing.
    if (lootOverrides !== undefined && existing.lockedFields.includes('loot')) {
      throw new BadRequestException('Cannot change loot overrides while the loot field is locked');
    }

    const params = existing.generationParams as unknown as NpcGenerationParams | null;
    if (!params) {
      throw new NotFoundException(
        `Npc "${npcId}" was created manually and has no generationParams to reroll from`
      );
    }

    const refData = await this.refDataLoader.load();
    const pipeline = new NpcPipeline(refData);
    const next = pipeline.reroll(
      field,
      this.withEffectiveLootOverrides(params, existing.lootOverrides, lootOverrides),
      existing.lockedFields
    );

    return this.prisma.npc.update({
      where: { id: npcId },
      data: this.toUpdatePayload(next),
    });
  }

  /**
   * The PATCH-able `lootOverrides` column is the DM-facing source of truth for
   * loot odds — generation-time `constraints.lootOverrides` goes stale the
   * moment the edit page writes the column. Sync constraints from the column,
   * then layer any per-request overrides on top (an explicit null clears the
   * saved odds back to base rules). The pipeline persists the result back into
   * both the column and generationParams, so future rerolls keep it.
   */
  private withEffectiveLootOverrides(
    params: NpcGenerationParams,
    column: Prisma.JsonValue | null,
    requested: NpcLootOverrides | null | undefined
  ): NpcGenerationParams {
    const saved = column as NpcLootOverrides | null;
    // An explicit null clears the saved odds; otherwise merge per-knob over the
    // column. normalizeLootOverrides drops unknown keys (the PATCH column is
    // loosely typed) and collapses an empty result to null, so the merge path
    // and the persisted-column path agree on the override shape.
    const merged = requested === null ? null : { ...saved, ...(requested ?? {}) };
    const effective = normalizeLootOverrides(merged);
    const constraints = { ...params.constraints };
    if (effective) {
      constraints.lootOverrides = effective;
    } else {
      delete constraints.lootOverrides;
    }
    return { ...params, constraints };
  }

  private toUpdatePayload(next: GeneratedNpc): Prisma.NpcUpdateInput {
    return {
      name: next.name,
      race: next.race,
      background: next.background,
      profession: next.profession,
      alignment: next.alignment,
      size: next.size,
      age: next.age,
      gender: next.gender,
      appearance: next.appearance,
      personalityTraits: next.personalityTraits,
      ideals: next.ideals,
      bonds: next.bonds,
      flaws: next.flaws,
      statBlock:
        next.statBlock === null
          ? Prisma.JsonNull
          : (next.statBlock as unknown as Prisma.InputJsonValue),
      goldPieces: next.goldPieces,
      silverPieces: next.silverPieces,
      copperPieces: next.copperPieces,
      loot: next.loot as unknown as Prisma.InputJsonValue,
      lootOverrides:
        next.lootOverrides === null
          ? Prisma.JsonNull
          : (next.lootOverrides as unknown as Prisma.InputJsonValue),
      generationParams: next.generationParams as unknown as Prisma.InputJsonValue,
    };
  }
}
