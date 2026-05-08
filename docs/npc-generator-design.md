# NPC Generator — Design Document

## Status

**Approved for v1.** Linear epic [VEG-242](https://linear.app/vega-apps/issue/VEG-242) tracks the work, with sub-issues [VEG-243](https://linear.app/vega-apps/issue/VEG-243) through [VEG-251](https://linear.app/vega-apps/issue/VEG-251) covering schema → seed → backend → frontend → stat blocks → relations → admin UI. One [open question](#open-questions) remains — Q6 (relation directionality) — which only blocks [VEG-250](https://linear.app/vega-apps/issue/VEG-250).

## Overview

A system for generating, storing, and managing non-player characters (NPCs) inside a campaign. NPCs sit alongside encounters and notes as a first-class campaign sub-feature, accessible from `/campaigns/[id]/npcs`.

The generator produces lore-friendly characters: race/species, name, appearance, personality, alignment, loot, and (optionally) a full stat block. The DM can constrain generation ("dwarf, in a mine, hostile"), reroll any field, and edit freely. It can also create new NPCs from the NPC page that links the new NPC to the current one with a relationship (relatives, rivals, mentors).

## Goals

- Reduce DM prep time during sessions: an NPC ready in one click, fully fleshed out
- Keep generated content lore-consistent (alignment matches background, name matches race, loot matches CR)
- Make every randomized field reroll-able and overridable — randomness is a starting point, not a constraint
- Persist NPCs in the campaign so they can be referenced across sessions
- Build on existing SRD data (species, backgrounds, monsters, items) — no parallel content store
- Stay self-hostable and offline-capable by default

## Non-Goals

- Generating PCs (player characters use the existing `Character` model and creation flow)
- Replacing the encounter combatant builder (NPCs *can* be added to an encounter; they're not the encounter itself)
- AI-generated portraits or images (out of scope for v1)
- Multi-language name generation beyond what SRD supports

## User Stories

Translated from the requesting message:

| # | Story | Acceptance hint |
|---|-------|-----------------|
| 1 | As a DM, I open the NPCs tab in my campaign and click **Generate** to get a complete NPC | Single button → full NPC saved to campaign |
| 2 | As a DM, I set constraints (race=dwarf, hostility=neutral, location=mine) before generating | Constraint form → seeds the random pipeline |
| 3 | As a DM, I view an NPC's profile and reroll their name, ideal, appearance, etc. independently | Per-field reroll button |
| 4 | As a DM, I edit any field manually and save | Standard edit form |
| 5 | As a DM, I create an NPC fully manually (no randomization) | "Create NPC" page mirrors the generator output schema |
| 6 | As a DM, I generate a relative or associate of an existing NPC | "Generate Related NPC" inherits race/region/family-name |
| 7 | As a DM, I optionally generate a stat block for an NPC if combat is plausible | Toggle: lite NPC vs. full stat block |
| 8 | As a DM, I add my own names/traits to the seed pool over time | Admin or DM-scoped custom tables |

## Architecture at a Glance

```
┌───────────────────────────┐     ┌────────────────────────┐
│  Frontend (Next.js)       │     │  Backend (NestJS)      │
│  /campaigns/[id]/npcs     │ ──► │  /npcs (CRUD)          │
│  /campaigns/[id]/npcs/new │     │  /npcs/generate (POST) │
│  /campaigns/[id]/npcs/[id]│ ──► │  /npcs/:id/reroll      │
└───────────────────────────┘     └────────┬───────────────┘
                                           │
                                           ▼
                                  ┌────────────────────────┐
                                  │  NpcGeneratorService   │
                                  │  • PickRace            │
                                  │  • PickBackground      │
                                  │  • PickAlignment       │
                                  │  • PickName            │
                                  │  • PickPersonality     │
                                  │  • PickAppearance      │
                                  │  • PickLoot            │
                                  │  • (opt) PickStatBlock │
                                  └────────┬───────────────┘
                                           │
                                           ▼
                                  ┌────────────────────────┐
                                  │  Reference data        │
                                  │  • SRD: species,       │
                                  │    backgrounds, items, │
                                  │    monsters            │
                                  │  • New: name_pools,    │
                                  │    appearance_traits,  │
                                  │    npc_loot_templates  │
                                  └────────────────────────┘
```

## Data Model

### New Prisma Models

```prisma
model Npc {
  id             String   @id @default(uuid())
  campaignId     String
  createdById    String
  name           String
  race           String   // species name (matches SRD species.name)
  background     String?  // SRD background name
  profession     String?  // free-form (e.g. "blacksmith", "mercenary")
  alignment      String?  // e.g. "Neutral Good"
  size           String?  // SRD size (Small, Medium, etc.)
  age            Int?
  gender         String?
  appearance     String?  // composed paragraph
  personalityTraits String[] @default([])
  ideals         String[] @default([])
  bonds          String[] @default([])
  flaws          String[] @default([])

  // Optional combat stats — null for non-combatant NPCs
  statBlock      Json?    // { ac, hp, str, dex, ..., actions, abilities }

  // Coinage — scaled to profession/background, not a flat gp value
  goldPieces     Int       @default(0)
  silverPieces   Int       @default(0)
  copperPieces   Int       @default(0)

  // Loot — profession items, plus rare trinket and very-rare magic-item rolls
  loot           Json?     // [{ itemId, name, quantity, notes, source }]
                            // source ∈ "profession" | "trinket" | "magic-item"

  // Per-NPC overrides for loot probabilities (null keys → use game_rules defaults)
  lootOverrides  Json?     // { trinketChance?, magicItemChance?, itemCountDie?, coinageMultiplier? }

  // Generation metadata — lets us reroll fields cleanly
  generationParams Json?     // constraints used, seed, source decisions
  lockedFields     String[]  @default([])  // fields exempt from "reroll all"
  isManual         Boolean   @default(false)

  // Relations
  campaign       Campaign  @relation(fields: [campaignId], references: [id])
  createdBy      User      @relation(fields: [createdById], references: [id])
  outgoingLinks  NpcRelation[] @relation("FromNpc")
  incomingLinks  NpcRelation[] @relation("ToNpc")

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([campaignId])
  @@map("npcs")
}

model NpcRelation {
  id          String  @id @default(uuid())
  fromNpcId   String
  toNpcId     String
  relation    String  // "parent", "sibling", "rival", "mentor", "spouse", etc.
  notes       String?

  fromNpc     Npc     @relation("FromNpc", fields: [fromNpcId], references: [id], onDelete: Cascade)
  toNpc       Npc     @relation("ToNpc",   fields: [toNpcId],   references: [id], onDelete: Cascade)

  @@unique([fromNpcId, toNpcId, relation])
  @@map("npc_relations")
}
```

### New Reference Tables (seeded, extensible)

| Table | Purpose | Initial Source |
|-------|---------|----------------|
| `npc_name_pools` | First/last names keyed by `(race, gender, kind)` where `kind ∈ {first, family, epithet}` | Curated CC-BY lists per race; SRD 5.0 sample names; user contributions over time |
| `npc_appearance_traits` | Hair, eyes, skin, build, distinguishing marks — keyed by `(race, sometimes size)` | Curated; seed with sensible defaults |
| `npc_loot_templates` | Weighted loot + per-denomination coinage rules keyed by `(profession, challengeRating?)`. A peasant pulls coppers, a noble pulls gold | Curated |
| `npc_alignment_priors` | Probability weights `P(alignment | race, background)` | Curated; see [Lore-Friendly Constraints](#lore-friendly-constraints) |
| `trinkets` | The d100 trinket table — flavor items with no mechanical effect (e.g. "a cracked crystal lens", "a rabbit's foot") | Curated from SRD 5.0 / PHB-style entries; CC-BY where SRD-sourced |

Personality traits, ideals, bonds, and flaws are **not** stored in new tables. They're backfilled into the existing `Background.personalityTraits[]`, `ideals[]`, `bonds[]`, `flaws[]` columns — see [Sourcing the Personality Tables](#sourcing-the-personality-tables).

Each new reference table follows the same shape:

```prisma
// example
model NpcAppearanceTrait {
  id         String  @id @default(uuid())
  race       String
  category   String  // hair | eyes | skin | build | distinguishing-mark
  trait      String
  source     String  @default("curated") // srd-5.0 | curated | user
  isActive   Boolean @default(true)

  @@index([race, category])
  @@map("npc_appearance_traits")
}
```

`source` lets the user (or admin) suppress official entries and add their own without losing the seed data on reseed.

## Generation Pipeline

The generator runs as a deterministic sequence. Each step takes the running NPC + remaining constraints and returns a chosen value plus a "decision record" (so reroll can replay just that step).

```
constraints  ┐
             │  ┌─────────────────────────┐
             ├─►│ 1. Race/Species          │ → SRD species row
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 2. Background            │ → SRD background row
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 3. Profession            │ → text (curated by background)
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 4. Alignment             │ → uses npc_alignment_priors
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 5. Name                  │ → npc_name_pools (see naming)
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 6. Appearance            │ → npc_appearance_traits, age, size
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 7. Personality           │ → traits/ideals/bonds/flaws by bg
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             ├─►│ 8. Coinage & loot        │ → npc_loot_templates + trinket/magic rolls
             │  └─────────────────────────┘
             │  ┌─────────────────────────┐
             └─►│ 9. (Optional) Stat block │ → CR-scaled monsters, see below
                └─────────────────────────┘
```

### Constraints

The DM can pin any subset before clicking generate:

| Constraint | Effect |
|-----------|--------|
| `race` | Skip step 1, force species |
| `region` / `setting` | Re-weights step 1 (e.g. "dwarven mine" → P(dwarf) ≈ 0.7) |
| `background` | Skip step 2 |
| `profession` | Skip step 3. Profession input is hybrid: curated dropdown (e.g. blacksmith, mercenary, sage) plus an "Other (custom)" free-text field |
| `alignment` | Skip step 4 |
| `name` | Skip step 5 |
| `hostility` | `friendly` / `neutral` / `hostile` — biases alignment + loot lethality |
| `combatRelevant` | Boolean — gates step 9 |
| `lootOverrides` | Optional `{ trinketChance?, magicItemChance?, itemCountDie?, coinageMultiplier? }` — bumps loot odds for *this* NPC only; persists on the NPC for future rerolls. See [Per-NPC loot overrides](#per-npc-loot-overrides) |

Constraints are persisted in `Npc.generationParams` so reroll-all reproduces context.

### Reroll

Each rerollable field on the NPC detail/edit page shows two icons next to it: 🎲 (reroll just this field) and 🔒 / 🔓 (lock toggle).

`POST /npcs/:id/reroll` with body `{ field: "name" | "alignment" | "loot" | ... | "all" }`:
- Re-runs the relevant step using the persisted `generationParams`
- Other fields untouched
- `field: "all"` regenerates every field **except those marked locked** on the NPC

Locks are persisted on the NPC itself: `Npc.lockedFields: String[]` (e.g. `["name", "alignment"]`). Toggling the lock icon adds/removes the field from this array. Lock state survives page reloads and is cleared only by explicit user action.

## Lore-Friendly Constraints

The user explicitly called out: a tiefling shouldn't usually be lawful good, but it should be *possible* with the right background.

### Approach: Weighted Priors, Not Hard Rules

`npc_alignment_priors` is a small joint distribution table:

| race | background | weights (Lawful Good → Chaotic Evil, 9-vector) |
|------|-----------|------------------------------------------------|
| Tiefling | * (default) | `[1, 1, 1, 2, 3, 4, 4, 6, 8]` (skewed evil/chaotic) |
| Tiefling | Acolyte | `[6, 5, 3, 4, 4, 2, 2, 2, 2]` (faith pulls toward law/good) |
| Dwarf | * | `[6, 6, 4, 4, 4, 2, 2, 1, 1]` |
| ... | ... | ... |

Sample with weighted random. A devout tiefling acolyte *can* roll Lawful Good (~10%), but a generic tiefling almost never will.

A simple fallback rule: if no row exists for `(race, background)`, fall back to `(race, *)`, then to a uniform distribution.

### Region/Setting Bias

Setting is a free-text constraint (e.g. "dwarven mine", "nine hells"). For v1, ship a small mapping table:

```ts
const SETTING_RACE_BIAS: Record<string, Record<string, number>> = {
  'dwarven mine':    { Dwarf: 0.7, Human: 0.15, Goblin: 0.1, /* ... */ },
  'nine hells':      { Tiefling: 0.5, Devil: 0.3, Human: 0.05, /* ... */ },
  'elven forest':    { Elf: 0.7, Human: 0.1, Halfling: 0.1, /* ... */ },
};
```

Future enhancement: allow the DM to define their own setting biases per-campaign.

## Naming Strategy

This was a direct ask. Three options were considered:

| Option | Pros | Cons |
|--------|------|------|
| **A. Seeded local DB** | Free, offline, predictable, fully under DM control, no external dependency | Requires curating data; limited variety until grown |
| **B. External name-generator API** | Decent variety with no curation | Network dependency; rate limits / outages; usually no clean licensing for redistribution; no per-race/profession alignment |
| **C. LLM (cloud or local)** | Highest coherence — name *fits* race + background + profession; near-infinite variety | Cost per call; latency; requires API key (or running a local model); harder for self-hosters |

### Decision: **Seeded local pools (A) only. LLM is not in scope for v1.**

1. **Curate ~30–50 names per (race × kind) tuple** from CC-BY sources (D&D 5.0 SRD sample names; open name-list datasets).
2. **"Combine first + family from the pool"** yields thousands of unique combinations from a small seed.
3. **Stays true to the project's offline-first, self-hostable ethos** — works with no API key, no network, no cost.

Skip B (external name APIs) — too fragile for self-hosters. Skip C (LLM) — adding an external dependency for naming alone isn't worth the cost / latency / key-management burden, and it would split the install story for self-hosters into "with key" vs "without key" experiences. If demand emerges later, the `NpcGeneratorService.pickName()` step is a clean seam for a future provider plug-in.

The same applies to other free-form text fields (appearance prose, distinguishing marks): seeded composition only.

## Sourcing the Personality Tables

The 2024 SRD 5.2.1 backgrounds are **mechanical only** — they don't ship personality traits, ideals, bonds, or flaws. (Confirmed: [backgrounds.ts:17-20](backend/src/seed/data/backgrounds.ts) seeds these as empty arrays.)

**Decision (Q1):** backfill the existing empty `Background.personalityTraits[]`, `ideals[]`, `bonds[]`, `flaws[]` columns directly rather than introducing parallel `npc_personality_*` tables. Trade-off: we mix 5.0 and 5.2.1 data in one place and lose per-row `source` / `isActive` tracking. Worth it for the simpler model.

Source: **SRD 5.0 (CC-BY-4.0)** — has `d8` personality traits, `d6` ideals, `d6` bonds, `d6` flaws per background. Legal to redistribute under attribution. Where SRD 5.2.1 introduces a background not present in 5.0, curate originals.

Implementation: extend [backgrounds.ts](backend/src/seed/data/backgrounds.ts) by populating the empty arrays with SRD 5.0 entries; add a license-attribution header at the top of that file. The seed runs `deleteMany` + `createMany`, so it overwrites on each run — user-added entries via the admin UI must be persisted in a separate "custom traits" table and merged at read time (deferred to [VEG-251](https://linear.app/vega-apps/issue/VEG-251)).

## Loot

### Coinage

NPCs hold coin in three denominations — **gold (gp), silver (sp), copper (cp)** — scaled to their profession and background. A peasant farmer holds mostly coppers; a merchant holds silver; a noble holds gold. Each denomination is rolled independently from a dice range defined in `npc_loot_templates`.

(Electrum and platinum are intentionally omitted — they add denominations most tables ignore in play. If demand emerges later, the schema can be extended without migrating data.)

### Item sources

Loot rolls combine three independent sources, each with its own probability:

| Source | Origin | Probability | Notes |
|--------|--------|-------------|-------|
| **Profession items** | `npc_loot_templates` weighted item list | Always — sample `1d3` items | Tools, weapons, supplies fitting their job |
| **Trinket** | `trinkets` table | ~5% per NPC (configurable) | Pure flavor; one trinket if rolled |
| **Magic item** | existing `Item` table filtered to magic items | ~0.5% base, scaled up by CR bucket | Very rare. Higher-CR NPCs roll on a bumped table |

The probabilities are stored as `game_rules` rows (category `npc-generation`, keys `trinket-chance`, `magic-item-chance-by-cr`) so a DM can tune them without code changes.

### Loot template shape

`npc_loot_templates` is keyed by `(profession, crBucket)` where `crBucket ∈ {0, 0–1, 2–4, 5–10, 11+}`:

```ts
{
  profession: 'blacksmith',
  crBucket:   '0–1',
  coinage: {
    gp: [0, 2],   // dice range, inclusive
    sp: [2, 8],
    cp: [4, 20],
  },
  items: [
    { itemId: '<smith-tools>', weight: 100, qty: [1, 1] },
    { itemId: '<dagger>',      weight: 60,  qty: [1, 1] },
    { itemId: '<hammer>',      weight: 80,  qty: [1, 1] },
    // ...
  ],
}
```

Coinage scaling examples:

| Profession | gp | sp | cp |
|-----------|----|----|----|
| Peasant | `[0, 0]` | `[0, 1]` | `[2, 12]` |
| Blacksmith | `[0, 2]` | `[2, 8]` | `[4, 20]` |
| Merchant | `[2, 12]` | `[5, 20]` | `[0, 10]` |
| Noble | `[20, 100]` | `[0, 20]` | `[0, 0]` |
| Bandit (CR ≤ 1) | `[0, 5]` | `[2, 12]` | `[2, 12]` |

If no template matches `(profession, crBucket)` — e.g. user-supplied "Other" profession — the generator falls back to a generic-by-CR template.

### Per-NPC loot overrides

The `game_rules` probabilities are *global* defaults. A DM may want to bump them on a specific NPC — a treasure-hoarding hag, a slain dragon's lieutenant, a noble's bodyguard, an extra-pickpocketable mark. `Npc.lootOverrides` (JSONB) holds optional knobs that win over the globals:

```ts
{
  trinketChance?: number,         // e.g. 0.25 → 25% trinket roll for this NPC
  magicItemChance?: number,       // e.g. 0.50 → bypass CR bucketing, force 50%
  itemCountDie?: string,          // e.g. "2d4" instead of the default 1d3
  coinageMultiplier?: number,     // e.g. 2 → double rolled coinage in every denomination
}
```

Resolution rule: for each knob, the generator uses `lootOverrides.X ?? gameRule(...)`. Missing keys fall through to the global default. The override persists on the NPC, so per-field reroll of `loot` reuses the same odds.

**UI.** The generator form (constraints) and the NPC edit page each expose a collapsible **Loot Odds (Advanced)** section. Each knob defaults to *"use global"* and writes to `lootOverrides` only when changed. A reset button clears a single knob (or all of them).

**Audit.** Because overrides live on the NPC, they survive reseed and re-tuning of `game_rules` — a campaign-defining override doesn't get silently flattened by a future global tweak.

### Generation algorithm

```
effective(key) → npc.lootOverrides?.[key]
                ?? gameRule('npc-generation', key)

itemCount  = roll(effective('item-count-die')      ?? '1d3')
coinMult   =      effective('coinage-multiplier')  ?? 1
pTrinket   =      effective('trinket-chance')
pMagic     =      effective('magic-item-chance')   ?? gameRule('magic-item-chance-by-cr')[crBucket]

for each denomination d in (gp, sp, cp):
    coinage[d] = rollUniform(template.coinage[d]) * coinMult

itemsRolled = sampleWeighted(template.items, N = itemCount)  // source = 'profession'

if rand() < pTrinket:
    itemsRolled.push(pickRandom(trinkets))                   // source = 'trinket'

if rand() < pMagic:
    itemsRolled.push(pickWeighted(magicItems))               // source = 'magic-item'
```

Items reference the existing `Item` and new `Trinket` tables — no parallel item store. New magic items or trinkets are added by extending the SRD seed, not the NPC system.

## Stat Blocks

Two modes:

1. **Lite (default).** No stat block stored. The NPC has personality, loot, and prose — enough for roleplay. `statBlock = null`.
2. **Full.** A monster-shaped stat block stored in `Npc.statBlock` (JSONB), matching the existing `Monster` schema's shape so the encounter combatant builder can consume both interchangeably.

Generation strategy for Full mode:

- Pick a base monster from SRD `monsters` filtered by CR target (default: `Commoner` for civilians, `Bandit` / `Guard` / `Cult Fanatic` / etc. for combatants)
- Override `name`, `alignment`, and a few cosmetic fields with the NPC's
- Optionally swap one weapon to match the chosen profession (e.g. a "blacksmith" gets a `warhammer` instead of a `scimitar`)

This avoids generating mathematically-broken stat blocks from scratch — we always start from a valid SRD monster and skin it.

## Manual Creation & Editing

- **Create page (`/campaigns/[id]/npcs/new`)**: full form with every field exposed. Each field has an inline 🎲 reroll button that calls the same backend pipeline for that single field. Save when ready.
- **Detail page (`/campaigns/[id]/npcs/[npcId]`)**: read view + Edit toggle. Edit mode = same form as Create, prefilled.
- **Manual mode flag**: `Npc.isManual = true` skips generation entirely on save. A manually-created NPC can still use per-field reroll later — manual is per-NPC, not per-field.

## Relations

From an NPC's detail page, two affordances:

1. **Add Existing NPC as Relation** — pick from campaign's NPC list, choose relation type, save.
2. **Generate Related NPC** — opens generator pre-seeded with:
   - Same race — *except* for spousal relationships, which are race-independent. A `child` of a mixed-race couple inherits race from either parent or rolls a thematic combination (e.g. half-elf for human + elf parents)
   - Same family name (when relation ∈ {parent, child, sibling}); spouses keep their own family name unless the DM overrides
   - Adjacent age (parent ≈ +25, child ≈ -25)
   - Optional: aligned background bias

Relation types are a free string in v1 (`relation` column), with a small autocomplete list. Promote to enum if usage stabilizes.

## Frontend Routes

Following the existing campaign sub-feature pattern (cf. [encounters](frontend/src/app/campaigns/[id]/encounters/)):

| Route | Purpose |
|-------|---------|
| `/campaigns/[id]/npcs` | List page (paginated, filter by race/profession) |
| `/campaigns/[id]/npcs/new` | Generator form (constraints) + manual create toggle |
| `/campaigns/[id]/npcs/[npcId]` | Detail view: profile, loot, stat block, relations |
| `/campaigns/[id]/npcs/[npcId]/edit` | Edit form |

The campaign overview page should add an **NPCs** card showing count + recently-created.

## Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/npcs?campaignId=&page=&limit=&race=&profession=` | List |
| `GET` | `/npcs/:id` | Detail |
| `POST` | `/npcs/generate` | Generate without saving (preview) |
| `POST` | `/npcs` | Create (saves a generated or manual NPC) |
| `PATCH` | `/npcs/:id` | Update fields |
| `POST` | `/npcs/:id/reroll` | `{ field: "name" | "all" | ... }` |
| `DELETE` | `/npcs/:id` | Delete |
| `POST` | `/npcs/:id/relations` | Add relation |
| `DELETE` | `/npcs/:id/relations/:relationId` | Remove relation |
| `POST` | `/npcs/:id/relations/generate` | Generate-and-link a related NPC |

Auth: campaign membership via the existing `CampaignAuthService`. DMs can write; players can read NPCs marked visible (future scope — v1 keeps NPCs DM-only).

## Phasing & Linear Tickets (proposed)

**Epic: [VEG-242](https://linear.app/vega-apps/issue/VEG-242) — NPC Generator v1**

1. **[VEG-243](https://linear.app/vega-apps/issue/VEG-243)** — Schema + migrations: `Npc` (with `lockedFields` and three coinage columns: `goldPieces`, `silverPieces`, `copperPieces`), `NpcRelation`, and five new reference tables (`npc_name_pools`, `npc_appearance_traits`, `npc_loot_templates`, `npc_alignment_priors`, `trinkets`). No generation logic yet. (TDD: schema-shape unit tests.)
2. **[VEG-244](https://linear.app/vega-apps/issue/VEG-244)** — Backfill `Background.personalityTraits[]`, `ideals[]`, `bonds[]`, `flaws[]` from SRD 5.0 directly in [backgrounds.ts](backend/src/seed/data/backgrounds.ts). Add a license-attribution header for SRD 5.0 (CC-BY-4.0).
3. **[VEG-245](https://linear.app/vega-apps/issue/VEG-245)** — Seed name pools, appearance traits, alignment priors, loot templates (with per-denomination coinage), and trinkets (curated initial data). Add `game_rules` rows for `trinket-chance` and `magic-item-chance-by-cr`. Include the small fixed setting/region → race-bias mapping.
4. **[VEG-246](https://linear.app/vega-apps/issue/VEG-246)** — Backend `NpcsModule`: CRUD endpoints + `CampaignAuthService` integration (DM-only writes and reads in v1). No generator yet.
5. **[VEG-247](https://linear.app/vega-apps/issue/VEG-247)** — `NpcGeneratorService`: race → background → profession → alignment → name → personality → appearance → loot pipeline. Per-field reroll honoring `lockedFields`. Hybrid profession input (curated dropdown + free text). Loot generation honors `Npc.lootOverrides` (per-NPC) before falling back to `game_rules` (global). Unit-tested step-by-step.
6. **[VEG-248](https://linear.app/vega-apps/issue/VEG-248)** — Frontend: list, generate, detail, edit pages. Each rerollable field gets 🎲 + 🔒 controls. Generate and edit pages include a collapsible **Loot Odds (Advanced)** section that writes to `Npc.lootOverrides`.
7. **[VEG-249](https://linear.app/vega-apps/issue/VEG-249)** — Stat block (Full mode): monster-skinning logic + UI toggle. Lite is the default.
8. **[VEG-250](https://linear.app/vega-apps/issue/VEG-250)** — Relations: schema is in #1; this ticket is the UI + generate-related flow (with spousal race-independence).
9. **[VEG-251](https://linear.app/vega-apps/issue/VEG-251)** — Custom user contributions: admin UI to add/disable rows in the new reference tables and append to `Background` personality arrays via a side table merged at read time.

## Decisions

Resolved during design review. Numbers preserved from the original open-question list for traceability.

1. **Personality table location.** Backfill the existing empty `Background.personalityTraits[]`, `ideals[]`, `bonds[]`, `flaws[]` columns directly from SRD 5.0 — no parallel `npc_personality_*` tables. Trade-off: mixes 5.0 and 5.2.1 data; loses `source` / `isActive` tracking. Custom user-added entries handled separately in [VEG-251](https://linear.app/vega-apps/issue/VEG-251).
2. **NPC visibility to players.** v1 is **DM-only**. Per-NPC `visibleToPlayers` flag deferred.
3. **Stat block default.** **Lite** (no stat block) by default. UI exposes a toggle to generate a Full stat block when the DM expects combat.
4. **Profession list.** **Hybrid** — curated dropdown (blacksmith, mercenary, sage, …) plus an "Other (custom)" free-text option. Loot templates key off curated values; custom professions fall back to a generic loot table.
5. **Setting/region constraint.** Ship a **small fixed mapping** in v1 (dwarven mine, nine hells, elven forest, etc.). Per-campaign DM-defined biases deferred.
7. **LLM / external naming providers.** **Out of scope.** Local seeded pools only. Provider seam preserved in `NpcGeneratorService.pickName()` for future contributors.
8. **Reroll cost.** Replaced with **field locking**: each rerollable field has a 🎲 reroll button and a 🔒 lock toggle. `Npc.lockedFields: String[]` persists which fields are exempt from "reroll all". No "manual override" state — locks are the single mechanism.

## Open Questions

6. **Relation directionality.** "Parent of" vs. "Child of" — store one direction and infer the other on read, or store both rows? Storing one is simpler and prevents drift; the UI labels appropriately based on which NPC the user is viewing. Storing both is more queryable but requires keeping the pair in sync. Default proposal: **store one**, infer the inverse. Confirm or override.

## Appendix: Why Not Just Reuse `Character`?

The `Character` model is built around player-character workflows (XP, level, hitpoints over time, inventory management). NPCs are throw-away in 90% of cases — they need a much lighter shape and a different lifecycle. Putting both behind one table would force lots of nullable PC-specific fields and complicate queries. Keeping them separate is cheap (NestJS modules are small) and aligns with how encounters already model NPC combatants as inline JSON rather than `Character` rows.
