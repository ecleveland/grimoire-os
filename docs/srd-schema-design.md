# SRD 5.2.1 Schema Design Document

## Overview

This document captures the schema design decisions for aligning GrimoireOS SRD data with the D&D 5e SRD v5.2.1 (2024 revision), licensed under CC-BY-4.0.

## Source Material

- **PDF**: `/resources/SRD_CC_v5.2.1.pdf` (source of truth)
- **Previous data source**: dnd5eapi.co (5.0 SRD) — replaced with static data files

## Key Differences: SRD 5.0 vs 5.2.1

| Area | 5.0 SRD | 5.2.1 SRD |
|------|---------|-----------|
| Species/Races | 9 races with ability bonuses + subraces | 9 species, no ability bonuses (moved to backgrounds), no subraces |
| Backgrounds | Flavor-focused (personality traits, bonds) | Mechanical (ability scores, origin feat, skill/tool proficiencies) |
| Feats | Unstructured | 4 categories: Origin, General, Fighting Style, Epic Boon |
| Classes | Subclass levels vary (1-3) | All subclasses at level 3; new features (Weapon Mastery, Epic Boon) |
| Equipment | Basic properties | New Mastery properties on all weapons |
| Spells | ~300 | 331 (some renamed, some new) |
| Monsters | ~300 | 328 stat blocks (revised) |

## Entity Model

### Normalized Tables (queryable entities)

| Table | Count | Key Fields |
|-------|-------|------------|
| `species` | 9 | name, speed, size, traits (JSONB), description |
| `spells` | 331* | name, level, school, castingTime, range, components, duration, classes[], ritual, concentration |
| `monsters` | 328* | name, size, type, CR, ability scores, AC, HP, speed |
| `items` | 53+ | name, category, cost, weight, damage, properties[], mastery |
| `srd_classes` | 12 | name, hitDie, proficiencies, features (JSONB), subclassLevel |
| `subclasses` | 12 | name, classId (FK), features (JSONB), spellList (JSONB) |
| `backgrounds` | 4 | name, abilityScores (JSONB), skillProficiencies[], feat |
| `feats` | 17 | name, description, category, level, repeatable |
| `conditions` | 15 | name, description, bullets[] |
| `skills` | 18 | name, ability, description |
| `languages` | 16 | name, type, typicalSpeakers, script |

*Partial seed — full counts deferred to future sessions.

### JSONB vs Normalized (Hybrid Approach)

**JSONB** used for deeply nested, read-only data:
- `Species.traits` — array of `{name, description}` objects
- `SrdClass.features` — array of `{level, name, description}` objects
- `Subclass.features` — same structure as class features
- `Monster.specialAbilities/actions/reactions/legendaryActions` — array of `{name, description}`
- `Monster.savingThrows/skills` — key-value records
- `Background.abilityScores` — `{options: string[], choose: number}`
- `Feat.benefits` — array of benefit descriptions

**Rationale**: These are read-heavy, rarely queried individually, and have variable structure. JSONB avoids excessive join tables while remaining searchable via Prisma's JSON filtering.

**Normalized** for independently queryable entities:
- `Subclass` has FK to `SrdClass` (query subclasses by class)
- All top-level entities have `name` unique index for deduplication
- `Spell` has indexes on `level` and `school`
- `Monster` has indexes on `type` and `challengeRating`
- `Item` has index on `category`

### Legacy Tables (kept, not seeded)

- `races` — kept for backward compatibility; existing characters reference race names as strings
- `subraces` — kept but empty; eliminated in SRD 5.2.1

## Seed Strategy

- **All static data files** — no external API dependency
- **Clean replacement**: `deleteMany` + `createMany` in a transaction
- **Safe**: SRD tables have no FK references from user data (characters store race/class as plain strings)
- **Idempotent**: can be re-run at any time

## API Endpoints

All SRD endpoints are public (no auth required).

| Endpoint | New/Changed | Notes |
|----------|-------------|-------|
| `GET /srd/species` | NEW | List/search species |
| `GET /srd/species/:id` | NEW | Get species by ID |
| `GET /srd/feats?category=` | CHANGED | Added category filter |
| All others | Unchanged | 21 existing endpoints |

## Future Work

- Seed full 331 spells (currently 5)
- Seed full 328 monsters (currently 5)
- Seed full 225 magic items
- Drop legacy `races` and `subraces` tables
- Add spell list tables (class → spell many-to-many)
- Add equipment property and damage type reference tables
