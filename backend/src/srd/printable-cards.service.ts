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
import { GLOBAL_CONTENT_SOURCES } from './content-access.service';
import { PrintCardSelectionDto } from './dto/hydrate-cards.dto';

// The public print endpoint hydrates by client-supplied id, so it must scope to
// the global catalog (SRD + admin-published shared) rather than trusting the id
// alone — otherwise an enumerated homebrew id could be printed (VEG-311).
const GLOBAL_SOURCES = [...GLOBAL_CONTENT_SOURCES];

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

// ── Markdown flattening (VEG-276) ──────────────────────────────────────────
//
// SRD descriptions legitimately carry markdown — the seed loader appends GFM
// tables and option-bullet lists to species traits (VEG-273), and the
// PDF-extracted spell/magic-item descriptions embed GFM tables directly
// (VEG-271/272). The screen UIs render them through a Markdown component, but
// the print card components are deliberately dumb plain-text renderers, and
// the shared contract (PrintableNamedEntry) makes pre-trimming the producer's
// job. So: drop tables (the prose already references them by name, and the
// full table stays available in the screen UI), strip emphasis and bullet
// markers, and collapse whitespace into the single compact line a 3×5" card
// shows.

/** A GFM table delimiter row, e.g. `| --- | --- |`. Mirrors the seed loader's detector. */
const GFM_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
/** A line that is nothing but a bold table title, e.g. `**Draconic Ancestors**`. */
const BOLD_TITLE_LINE = /^\s*\*\*[^*]+\*\*\s*$/;

/** Drop GFM table blocks (header + delimiter + body rows) and any bold title line directly above. */
function dropGfmTables(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isHeader = lines[i].includes('|');
    if (isHeader && i + 1 < lines.length && GFM_DELIMITER.test(lines[i + 1])) {
      while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
      if (kept.length > 0 && BOLD_TITLE_LINE.test(kept[kept.length - 1])) kept.pop();
      i++; // skip the delimiter row
      while (i + 1 < lines.length && lines[i + 1].includes('|')) i++; // skip body rows
      continue;
    }
    kept.push(lines[i]);
  }
  return kept.join('\n');
}

/** Flatten markdown a card would otherwise print verbatim into compact plain text. */
function flattenCardText(text: string): string {
  return dropGfmTables(text)
    .replace(/^\s*[-*•]\s+/gm, '') // bullet markers — items read as plain sentences
    .replace(/\*\*([^*\n]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*\n]+)\*/g, '$1') // *italic*
    .replace(/\b_([^_\n]+)_\b/g, '$1') // _italic_ (stray underscores stay)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Flatten the description of a name + description entry. */
function flattenEntry(entry: PrintableNamedEntry): PrintableNamedEntry {
  return { name: entry.name, description: flattenCardText(entry.description) };
}

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
    .map(flattenEntry);
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
      where: { id: { in: ids }, contentSource: { in: GLOBAL_SOURCES } },
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
      where: { id: { in: ids }, contentSource: { in: GLOBAL_SOURCES } },
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
    return rows.map(row => ({
      type: 'spell' as const,
      ...row,
      description: flattenCardText(row.description),
    }));
  }

  private async hydrateItems(ids: string[]): Promise<PrintableCard[]> {
    const rows = await this.prisma.item.findMany({
      where: { id: { in: ids }, contentSource: { in: GLOBAL_SOURCES } },
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
      ...(row.description !== null ? { description: flattenCardText(row.description) } : {}),
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
      traits: row.traits.slice(0, PRINTABLE_TRAIT_SUMMARY_CAP).map(flattenEntry),
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
      traits: row.features.slice(0, PRINTABLE_TRAIT_SUMMARY_CAP).map(flattenEntry),
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
      description: flattenCardText(feature.description),
    }));
  }
}
