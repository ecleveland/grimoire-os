import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PRINTABLE_CARD_BATCH_MAX,
  PRINTABLE_MONSTER_ACTION_CAP,
  PRINTABLE_MONSTER_TRAIT_CAP,
  PRINTABLE_TRAIT_SUMMARY_CAP,
} from '@grimoire-os/shared';
import type {
  HydratePrintableCardsResponse,
  PrintableCard,
  PrintableCardType,
  PrintableNamedEntry,
} from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SrdService } from './srd.service';
import { PrintCardSelectionDto } from './dto/hydrate-cards.dto';

// Batch hydration for the printable SRD cards feature (VEG-263). Takes the
// grouped print selection the frontend tray holds and returns the curated
// per-type view-models from shared/printable.ts in one request.
//
// Documented behavior:
// - Unknown ids are silently dropped (a group's cards may be shorter than its
//   requested ids) — the print sheet renders what still exists.
// - Duplicate (type, id) pairs are de-duped; duplicate type groups are merged
//   in first-appearance order.
// - Within a group, cards follow the request's id order (the tray's insertion
//   order), not DB order.
// - Requests totalling more than PRINTABLE_CARD_BATCH_MAX ids are rejected.

/** Parse a JSON column expected to hold [{ name, description }] entries, dropping anything malformed. */
function toNamedEntries(value: unknown, cap: number): PrintableNamedEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is PrintableNamedEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PrintableNamedEntry).name === 'string' &&
        typeof (entry as PrintableNamedEntry).description === 'string'
    )
    .slice(0, cap)
    .map(entry => ({ name: entry.name, description: entry.description }));
}

/** Re-order hydrated cards to match the requested id order, dropping ids that produced no card. */
function inRequestOrder(ids: string[], cards: PrintableCard[]): PrintableCard[] {
  const byId = new Map(cards.map(card => [card.id, card]));
  const ordered: PrintableCard[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (card) ordered.push(card);
  }
  return ordered;
}

@Injectable()
export class PrintableCardsService {
  constructor(
    private prisma: PrismaService,
    private srdService: SrdService
  ) {}

  async hydrate(selections: PrintCardSelectionDto[]): Promise<HydratePrintableCardsResponse> {
    const totalIds = selections.reduce((sum, s) => sum + s.ids.length, 0);
    if (totalIds > PRINTABLE_CARD_BATCH_MAX) {
      throw new BadRequestException(
        `Print batch exceeds the maximum of ${PRINTABLE_CARD_BATCH_MAX} ids (got ${totalIds})`
      );
    }

    // Merge duplicate type groups (first-appearance order) and de-dupe ids.
    const idsByType = new Map<PrintableCardType, string[]>();
    for (const { type, ids } of selections) {
      const merged = idsByType.get(type) ?? [];
      for (const id of ids) {
        if (!merged.includes(id)) merged.push(id);
      }
      idsByType.set(type, merged);
    }

    const groups = await Promise.all(
      Array.from(idsByType, async ([type, ids]) => ({
        type,
        cards: inRequestOrder(ids, await this.hydrateType(type, ids)),
      }))
    );

    return { groups };
  }

  private hydrateType(type: PrintableCardType, ids: string[]): Promise<PrintableCard[]> {
    switch (type) {
      case 'monster':
        return this.hydrateMonsters(ids);
      case 'spell':
        return this.hydrateSpells(ids);
      case 'item':
        return this.hydrateItems(ids);
      // Species are seeded into the races table (loadSpeciesAsRacesFromJson),
      // so both card types hydrate from the same source, tagged differently.
      case 'race':
      case 'species':
        return this.hydrateRaces(ids, type);
      case 'background':
        return this.hydrateBackgrounds(ids);
      case 'feature':
        return this.hydrateFeatures(ids);
    }
  }

  private async hydrateMonsters(ids: string[]): Promise<PrintableCard[]> {
    const rows = await this.prisma.monster.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        size: true,
        type: true,
        alignment: true,
        challengeRating: true,
        experiencePoints: true,
        armorClass: true,
        hitPoints: true,
        speed: true,
        str: true,
        dex: true,
        con: true,
        int: true,
        wis: true,
        cha: true,
        actions: true,
        specialAbilities: true,
      },
    });
    return rows.map(row => {
      const traits = toNamedEntries(row.specialAbilities, PRINTABLE_MONSTER_TRAIT_CAP);
      return {
        type: 'monster' as const,
        id: row.id,
        name: row.name,
        size: row.size,
        creatureType: row.type,
        alignment: row.alignment ?? 'unaligned',
        challengeRating: row.challengeRating,
        ...(row.experiencePoints !== null ? { experiencePoints: row.experiencePoints } : {}),
        armorClass: row.armorClass,
        hitPoints: row.hitPoints,
        speed: row.speed,
        abilities: {
          str: row.str,
          dex: row.dex,
          con: row.con,
          int: row.int,
          wis: row.wis,
          cha: row.cha,
        },
        actions: toNamedEntries(row.actions, PRINTABLE_MONSTER_ACTION_CAP),
        ...(traits.length > 0 ? { traits } : {}),
      };
    });
  }

  private async hydrateSpells(ids: string[]): Promise<PrintableCard[]> {
    const rows = await this.prisma.spell.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        level: true,
        school: true,
        castingTime: true,
        range: true,
        components: true,
        duration: true,
        concentration: true,
        ritual: true,
        description: true,
      },
    });
    return rows.map(row => ({ type: 'spell' as const, ...row }));
  }

  private async hydrateItems(ids: string[]): Promise<PrintableCard[]> {
    const rows = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        category: true,
        rarity: true,
        requiresAttunement: true,
        properties: true,
        description: true,
      },
    });
    return rows.map(row => ({
      type: 'item' as const,
      id: row.id,
      name: row.name,
      category: row.category,
      ...(row.rarity !== null ? { rarity: row.rarity } : {}),
      requiresAttunement: row.requiresAttunement,
      properties: row.properties,
      ...(row.description !== null ? { description: row.description } : {}),
    }));
  }

  private async hydrateRaces(ids: string[], type: 'race' | 'species'): Promise<PrintableCard[]> {
    const rows = await this.prisma.race.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        traits: {
          orderBy: { name: 'asc' },
          select: { name: true, description: true },
        },
      },
    });
    return rows.map(row => ({
      type,
      id: row.id,
      name: row.name,
      traits: row.traits.slice(0, PRINTABLE_TRAIT_SUMMARY_CAP),
    }));
  }

  private async hydrateBackgrounds(ids: string[]): Promise<PrintableCard[]> {
    const rows = await this.prisma.background.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        features: {
          orderBy: { name: 'asc' },
          select: { name: true, description: true },
        },
      },
    });
    return rows.map(row => ({
      type: 'background' as const,
      id: row.id,
      name: row.name,
      traits: row.features.slice(0, PRINTABLE_TRAIT_SUMMARY_CAP),
    }));
  }

  private async hydrateFeatures(ids: string[]): Promise<PrintableCard[]> {
    const features = await this.srdService.findFeaturesByIds(ids);
    return features.map(feature => ({
      type: 'feature' as const,
      id: feature.id,
      name: feature.name,
      parent: feature.parent,
      ...(feature.level !== undefined ? { level: feature.level } : {}),
      description: feature.description,
    }));
  }
}
