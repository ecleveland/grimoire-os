# SRD seed (`SeedService`)

Populates a database with the System Reference Document reference data — spells,
monsters, items, classes, races, backgrounds, feats, the simple lookup tables,
and the NPC-generator reference data — plus a dev-only `admin` user.

```bash
cd backend && npm run seed   # ts-node src/seed/run-seed.ts → SeedService.seed()
```

Data comes from two places: the PDF-extracted JSON under
`docs/extracted-srd-json/` (loaded + validated by `srd-json.loader.ts`) and the
hand-authored TypeScript under `src/seed/data/`. Classes draw on both. The class
rows (hit die, proficiencies, equipment, spellcasting tables) are hand-authored
in `data/classes.ts`. Their features come from `classes.json`, and the SRD 5.2.1
subclasses with their features from `subclasses.json`. Both files are written by
`scripts/extract-srd-classes.mjs`.

## Idempotency — safe to re-run

`npm run seed` is **idempotent**: running it on an already-seeded database is
safe and is the intended way to pick up corrected SRD data. A re-run never
duplicates rows, and it **never touches user-owned data** — including the admin
loot-odds settings, which live in the `game_rules` table but are excluded from
the overwrite (see the table below). It does rewrite _seed-owned_ rule content
in place, which is the point: that is how a corrected rule reaches an existing
database. The whole seed runs in one transaction (`SEED_TX_TIMEOUT_MS`), so a
failure rolls back cleanly.

How each category stays idempotent:

| Data                                                                             | Strategy                                                                       | Re-run behaviour                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spells / monsters / items / feats                                                | `findFirst → update/create`, scoped to `contentSource: 'srd'`                  | Existing SRD rows are updated **in place** (ids/FKs preserved); homebrew rows in the same tables are never read or written (VEG-292).                                                                                                                                                                                                                                         |
| Classes                                                                          | `findFirst → update/create`, scoped to `contentSource: 'srd'`                  | Same as spells. SRD rows are updated in place, and homebrew classes are never read or written.                                                                                                                                                                                                                                                                                |
| Class features                                                                   | `upsert` on `[classId, name, level]`, then retire                              | An edited description is written in place and the row id survives. SRD class rows the JSON no longer lists are deleted, one SRD class at a time. Features of homebrew classes are never touched.                                                                                                                                                                              |
| Subclasses                                                                       | `findFirst → update/create`, scoped to `contentSource: 'srd'`, then retire     | Updated in place, `source` included. SRD subclasses neither source lists are deleted via `subclass.deleteMany({ contentSource: 'srd', name: { notIn: … } })`, and their features cascade. Homebrew and shared subclasses are never touched.                                                                                                                                   |
| Subclass features                                                                | `upsert` on `[subclassId, name, level]`, then retire                           | As class features, per SRD subclass.                                                                                                                                                                                                                                                                                                                                          |
| Skills, languages, background features                                           | `createMany({ skipDuplicates: true })`                                         | Rows already present are skipped.                                                                                                                                                                                                                                                                                                                                             |
| Conditions, game rules                                                           | `upsert` on their unique key (`name`; `category + key`)                        | Overwritten in place, ids preserved (VEG-449). Insert-only seeding meant an edited rule never reached an already-seeded database — a correctness bug now that the `exhaustion/levels` rule drives the computed-stats penalty. **Exception:** the `npc-generation` game-rule rows are the admin loot-odds knobs, so they are seeded on a fresh database but never overwritten. |
| Backgrounds, races, subraces, race traits                                        | `upsert` on their unique key                                                   | Overwritten in place, never duplicated.                                                                                                                                                                                                                                                                                                                                       |
| NPC name pools / appearance traits / loot templates / alignment priors, trinkets | clear-then-recreate, scoped to `source: 'curated'` (trinkets also `'srd-5.0'`) | Curated rows are rebuilt each run; **user-added rows (`source !== 'curated'`) survive untouched.**                                                                                                                                                                                                                                                                            |
| Dev admin user                                                                   | existence check on the `admin` username                                        | Created once; subsequent runs log "already exists, skipping".                                                                                                                                                                                                                                                                                                                 |

Two things to keep in mind:

- **The destructive steps** are the retirements: SRD items, class features,
  subclasses and subclass features no longer present in their source are
  deleted. Items go via
  `item.deleteMany({ contentSource: 'srd', name: { notIn: … } })`. Every
  retirement is scoped to SRD content, so homebrew/shared rows are safe, and
  every count is logged. Items log `Items retired: N`. Class features,
  subclasses and subclass features log `N entries, M retired`. Each count
  reads `0` on a clean reseed.
- The seed writes to whatever `DATABASE_URL` points at and (unless
  `NODE_ENV=production`) creates the dev admin `admin` / `admin`. Safe to re-run
  against a **dev** database; don't point it at anything you don't intend to seed.

## Known rule-edition mix (VEG-449)

The seeded content is **not uniformly one SRD edition**, and outside two
subclasses the `source` column (`"SRD 5.2.1"` by default) does not distinguish
them:

- **Exhaustion** — game rule `exhaustion/levels` and the `Exhaustion` condition
  are **2024 (SRD 5.2)**: a flat −2 × level to D20 Tests and −5 ft × level to
  Speed. This is the one rule the app enforces mechanically, via the
  computed-stats layer.
- **The other fourteen conditions** in `data/conditions.ts` are still **2014**
  third-person text (e.g. Grappled, Restrained, Frightened). They are display-only
  — nothing derives from them — but a DM reading them is reading 2014 rules.
- **Class and subclass features** are **SRD 5.2.1**, from `classes.json` and
  `subclasses.json`. So are the Prepared Spells and half-caster slot columns in
  `data/classes.ts`. The class `description` blurbs there are still 2014 text.
- **Eldritch Knight and Arcane Trickster** are **2014** subclasses that SRD 5.2.1
  does not carry. They keep their 2014 text in `data/subclasses.ts`, and the
  seed writes their `source` as `"SRD 5.1"`. Every other SRD subclass row reads
  `"SRD 5.2.1"`.

Converting the rest is tracked separately; it is a content change that needs the
2024 text checked against the SRD rather than paraphrased. Until then, expect one
entry in the conditions list to read in a different voice.

Upgrading an existing database: migration
`20260728120000_exhaustion_2024_rules` rewrites the two exhaustion rows, so the
reference API matches what the sheets compute without requiring a re-seed.

## Layout

| File                 | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `run-seed.ts`        | CLI entry — bootstraps a standalone Nest context and calls `SeedService.seed()`.           |
| `seed.service.ts`    | Orchestrator: `loadSeedData()` then one transaction of focused per-entity `seed*` methods. |
| `srd-json.loader.ts` | Loads, validates, and transforms the extracted JSON into Prisma input shapes.              |
| `seed-guards.ts`     | `assertUniqueSeedNames()` — fails the seed on duplicate names within/across sources.       |
| `data/`              | Hand-authored TS datasets (classes, subclasses, backgrounds, NPC pools, trinkets, …).      |

## Tests

```bash
npx jest src/seed          # service + loader + guard + data-integrity specs
```

`srd-data-integrity.spec.ts` / `monsters-data-integrity.spec.ts` run the
validators against the real committed JSON; `seed.service.spec.ts` exercises the
write passes against a mocked Prisma client (including the idempotency contracts
above).
