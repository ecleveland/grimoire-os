// NestJS service that orchestrates the NPC generator pipeline:
// load reference data → run the pure pipeline → optionally persist.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignAuthService } from '../../auth/campaign-auth.service';
import { NpcPipeline } from './npc-pipeline';
import { NpcRefDataLoader } from './npc-ref-data.loader';
import { SeededRng } from './seeded-rng';
import {
  GeneratedNpc,
  NpcGenerationConstraints,
  NpcGenerationParams,
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
  async reroll(npcId: string, userId: string, field: RerollField) {
    const existing = await this.prisma.npc.findUnique({
      where: { id: npcId },
    });
    if (!existing) throw new NotFoundException(`Npc "${npcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(existing.campaignId, userId);

    const params = existing.generationParams as unknown as NpcGenerationParams | null;
    if (!params) {
      throw new NotFoundException(
        `Npc "${npcId}" was created manually and has no generationParams to reroll from`
      );
    }

    const refData = await this.refDataLoader.load();
    const pipeline = new NpcPipeline(refData);
    const next = pipeline.reroll(field, params, existing.lockedFields);

    return this.prisma.npc.update({
      where: { id: npcId },
      data: this.toUpdatePayload(next),
    });
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
