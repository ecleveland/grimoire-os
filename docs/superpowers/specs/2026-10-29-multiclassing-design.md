# Multiclassing

Date: 2026-10-29. Status: approved. Milestone M25 "Multiclassing", tickets VEG-671 and VEG-673 to VEG-678; house rule VEG-672 in M20.

## Goal

A character can hold levels in more than one class, following the SRD 5.2.1 multiclassing rules, and the app applies those rules itself: prerequisites, proficiencies on entry, hit dice per class, features by class level, spell slots from the multiclass table, and spells known per class. A second class is gained at level-up, edited by hand in the classic editor, or built in from the guided builder when a character starts above level 1.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Storage | A `classes` JSON column on `Character`, not a table | Every other list on a character is JSON, and class references are soft ids because homebrew classes have no FK. |
| The old scalars | Dropped from the database, projected on read from `classes[0]`, writes rejected | Keeps the foundation PR small and leaves one source of truth. A later ticket re-points readers. |
| Where a class is added | Level-up dialog, classic editor, and the guided builder for characters starting above level 1 | The user wants multiclassing as a genuine option everywhere a class is set. |
| Starting above level 1 | Always offered in the builder; a campaign house rule pre-fills it | Keeps the builder independent of M20 while using it when present. |
| Builder above level 1 | Creates level 1, then runs the level-up flow once per remaining level | Nothing is built twice. Every step M21 and M23 add is inherited. |
| `level` | Stays a stored integer equal to the sum of class levels, enforced on write | XP maths, snapshots, proficiency bonus and the level-up transaction all want the total. |

## Data model

Shared type:

```
interface CharacterClass {
  classId: string | null;   // soft reference, same contract as the old classId
  name: string;             // display name, authoritative for free-typed classes
  level: number;            // at least 1
  subclass: string | null;
  subclassId: string | null;
}
```

- `Character.classes: CharacterClass[]`. Order matters: the first entry is the class taken at level 1, which grants starting proficiencies and saving throws and which the DTO projects onto the deprecated scalars. Duplicate `classId` or duplicate `name` is rejected. The sum of `level` must equal `Character.level`; the DTO checks it and the service checks it again on every write touching either.
- `Character.hitDice: HitDice[]`, one pool per die type, `{ dieType, total, spent }`. A single-class character has one entry. Totals per die derive from class levels on every write; `spent` is carried.
- `Feature.level` means the class level at which the feature was granted. `Feature.source` stays the class name. For existing single-class characters the two readings were equal, so nothing stored changes.
- `SpellEntry.classId?: string | null` records which class list a spell came from. Absent for existing spells, which the sheet attributes to the first caster class.
- `computed.spellSlots` gains `casterLevel: number` and `pactSlots: { slots, slotLevel } | null`.
- `computed.spellcasting` becomes per class: `byClass: Record<classId | name, ComputedSpellcasting>` with the first caster projected onto the existing fields for compatibility.
- VEG-633 adds no `subclassId` column; it lives in the array from the start.

## Migration

One Prisma migration, two statements:

1. Backfill `classes` from the scalars: `[{ classId, name: class, level, subclass, subclassId: null }]` for rows with a class, `[]` otherwise. Backfill `hitDice` by wrapping the existing object in an array; `null` stays `null`.
2. Drop `class`, `classId`, `subclass`.

Snapshots store the DTO as JSON. The snapshot read path normalizes a pre-migration snapshot in memory with the same fold, so view, copy and restore see one shape. A test feeds a pre-migration snapshot through all three.

## DTO

- `CharacterDto.classes` is the written and read shape.
- `class`, `classId`, `subclass` and `subclassId` remain on the response as a read-only projection of `classes[0]`, marked deprecated with a pointer to `classes`.
- A write carrying any of those scalars is rejected with 400 naming `classes`, so no client silently keeps the old shape.
- `spellcastingAbility` on the character becomes the projection of the first caster class's ability.

## Rules

All in the shared compute core and the pure level-up helper so the backend and the dialog run one implementation.

- **Prerequisites.** Adding a class needs 13 in its primary ability and 13 in the primary ability of every class already held. `multiclassing.prerequisites` carries the minimums; `prerequisiteLogic: 'OR'` covers Fighter. `canMulticlassInto(character, cls)` returns the unmet list; the picker greys a class out with that list as the reason. The backend validates the same on PATCH.
- **Proficiencies on entry.** The first class grants its full set. A later class grants only `multiclassing.proficienciesGained`, merged into `proficiencies` and `armorTraining`. Saving throw proficiencies never come from a later class.
- **Hit points and hit dice.** The gained level uses the die of the class gaining it, and that die's pool grows by one. The rest dialog lets the player pick the pool to spend.
- **Proficiency bonus** from total level, unchanged.
- **Features by class level.** `classFeaturesAtLevel(cls, classLevel)` takes the class's new level. Subclass level is per class. Ability Score Improvements fall at class levels 4, 8, 12, 16 and 19 of each class (plus Fighter and Rogue extras), which VEG-661 reads from the feature list.
- **Non-stacking.** Extra Attack and Unarmored Defense from a second class are granted but flagged `stacks: false` in the seed; the sheet shows one. Channel Divinity merging stays a note on the feature until the resource tracker learns about it.
- **Spell slots.** When more than one class has a caster type, slots come from the seeded `spell-slots/multiclass-table` at caster level = full-caster levels + floor(half-caster levels / 2) + floor(third-caster levels / 3), the subclass deciding the third-caster case. Pact Magic is a separate pool from Warlock levels alone. A single caster keeps its own progression; a test pins that the two paths agree for every SRD caster at every level.
- **Spells known, prepared and cantrips** are per class at that class's level. VEG-662 reads the per-class counts.
- **Out.** Variant rules, and any class with `multiclassing: null`, which cannot be multiclassed into and says so.

## Flows

**Level-up dialog.** VEG-660's step list gains a first step, "Class", shown whenever the character could add a class. It lists current classes with levels, then every other visible class, each selectable or greyed with unmet prerequisites. A single-class character meeting no prerequisites skips the step. Later steps read the chosen class: hit points use its die, features come from its new class level, M21 and M23 steps follow the same rule. Review lines: `Fighter 4 → 5` or `New class: Wizard 1`. `applyLevelUp` takes the chosen class and returns a patch over `classes`, `level`, `hitPoints`, `hitDice`, `features`.

**Guided builder.** The first step gains a starting level, 1 to 20, pre-filled from the campaign's `startingLevel` house rule when set. The builder creates the level 1 character as today, then runs the level-up flow once per remaining level with the class step on each pass, showing "Level 3 of 5" above the step bar. Each pass is its own PATCH and takes its own snapshot. Abandoning midway leaves the character at the level reached.

**Classic editor.** The class field becomes a list: name, level, subclass per row, an add row over every visible class, a remove per row, no prerequisite checks, and a notice that this edits the record directly. Total level is read-only and derived. Hit dice pools are rebuilt from the rows on save with spent carried. Removing a class removes features with that `source` and keeps spells with that `classId`, with a warning.

**Sheet.** Header shows `Fighter 5 / Wizard 3` with subclasses under each. Class features group by class then level. Hit dice show one pool per die. Spellcasting groups by class with its own ability, save DC and attack bonus. Print route and PDF carry the joined class string, the first hit dice pool in the box and the rest on the overflow page.

## Edge cases

- Empty `classes`: no grants, the die picker in the dialog, as today for a free-typed class.
- Legacy spells without `classId` attribute to the first caster class.
- Old-shape snapshots normalize on read.
- A homebrew class without `multiclassing` cannot be added as a second class.

## Tests

- DTO: sum rule, duplicate class, scalar writes rejected, `hitDice` as pools.
- Service: prerequisites on PATCH, proficiencies on entry, hit dice rebuild.
- Compute: caster level rounding for every combination of full, half and third casters; Pact Magic beside a full caster; single-caster path unchanged for every SRD caster at every level.
- Real-DB suite: migration round trip from the scalar shape.
- Snapshots: pre-migration shape through view, copy and restore.
- Vitest: class step, rest dialog with two pools, editor class list, builder starting level, header and feature grouping.
- Playwright: build a Fighter 1, level to Fighter 3 then Wizard 1, assert sheet, hit dice and slots. Build a level 5 character from the builder in one sitting.
- Manual: a Paladin 6 / Warlock 2 with both slot pools on screen; a legacy character opened after the migration.

## Tickets

Milestone M25 "Multiclassing":

1. VEG-671 foundation: `classes`, `hitDice` pools, migration, DTO projection and rejection, sum rule, snapshot normalization, compute reading `classes` with the single-caster path pinned.
2. VEG-673 rules: prerequisites, proficiencies on entry, multiclass slot table, Pact Magic alongside, per-class spellcasting in `computed`, non-stacking flags. Blocked by VEG-671.
3. VEG-675 level-up class step and the sheet: the step, `applyLevelUp`, backend prerequisite validation, rest dialog pools, header and feature grouping. Blocked by VEG-671, VEG-673, VEG-660.
4. VEG-674 classic editor class list. Blocked by VEG-671.
5. VEG-676 spellcasting by class: `SpellEntry.classId`, grouped section, spells and cantrips known per class. Blocked by VEG-673.
6. VEG-677 guided builder starting level and chained level-ups. Blocked by VEG-675, VEG-633, VEG-634, VEG-661, VEG-662, VEG-672.
7. VEG-678 retire the scalar projection: re-point readers, remove the deprecated fields. Blocked by VEG-675, VEG-674, VEG-676.

Milestone M20: VEG-672 house rule `startingLevel`. Blocked by VEG-629.

Blockers on existing tickets: VEG-660 and VEG-633 blocked by VEG-671. VEG-646 and VEG-647 related to VEG-671. VEG-666 carries a note to list every class on the overflow page.

## Out of scope

- Variant multiclassing rules.
- Channel Divinity and other merged resources in the resource tracker.
- Multiclass spell swapping beyond what VEG-662 defines.
