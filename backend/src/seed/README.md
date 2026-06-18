# SRD seed (`SeedService`)

Populates a database with the System Reference Document reference data — spells,
monsters, items, classes, races, backgrounds, feats, the simple lookup tables,
and the NPC-generator reference data — plus a dev-only `admin` user.

```bash
cd backend && npm run seed   # ts-node src/seed/run-seed.ts → SeedService.seed()
```

Data comes from two places: the PDF-extracted JSON under
`docs/extracted-srd-json/` (loaded + validated by `srd-json.loader.ts`) and the
hand-authored TypeScript under `src/seed/data/`.

## Idempotency — safe to re-run

`npm run seed` is **idempotent**: running it on an already-seeded database is
safe and is the intended way to pick up corrected SRD data. A re-run never
duplicates rows, and it **never touches user-owned data**. The whole seed runs
in one transaction (`SEED_TX_TIMEOUT_MS`), so a failure rolls back cleanly.

How each category stays idempotent:

| Data | Strategy | Re-run behaviour |
| --- | --- | --- |
| Spells / monsters / items / feats | `findFirst → update/create`, scoped to `contentSource: 'srd'` | Existing SRD rows are updated **in place** (ids/FKs preserved); homebrew rows in the same tables are never read or written (VEG-292). |
| Conditions, skills, languages, game rules, classes, races + child feature tables | `createMany({ skipDuplicates: true })` | Rows already present are skipped. |
| Backgrounds, subclasses, subraces, race traits | `upsert` on their unique key | Overwritten in place, never duplicated. |
| NPC name pools / appearance traits / loot templates / alignment priors, trinkets | clear-then-recreate, scoped to `source: 'curated'` (trinkets also `'srd-5.0'`) | Curated rows are rebuilt each run; **user-added rows (`source !== 'curated'`) survive untouched.** |
| Dev admin user | existence check on the `admin` username | Created once; subsequent runs log "already exists, skipping". |

Two things to keep in mind:

- **The one destructive step** is item retirement: SRD items no longer present in
  any source are removed via
  `item.deleteMany({ contentSource: 'srd', name: { notIn: … } })`. It is scoped
  to SRD content, so homebrew/shared items are safe, and the count is always
  logged (`Items retired: N` — `0` on a clean reseed).
- The seed writes to whatever `DATABASE_URL` points at and (unless
  `NODE_ENV=production`) creates the dev admin `admin` / `admin`. Safe to re-run
  against a **dev** database; don't point it at anything you don't intend to seed.

## Layout

| File | Purpose |
| --- | --- |
| `run-seed.ts` | CLI entry — bootstraps a standalone Nest context and calls `SeedService.seed()`. |
| `seed.service.ts` | Orchestrator: `loadSeedData()` then one transaction of focused per-entity `seed*` methods. |
| `srd-json.loader.ts` | Loads, validates, and transforms the extracted JSON into Prisma input shapes. |
| `seed-guards.ts` | `assertUniqueSeedNames()` — fails the seed on duplicate names within/across sources. |
| `data/` | Hand-authored TS datasets (classes, subclasses, backgrounds, NPC pools, trinkets, …). |

## Tests

```bash
npx jest src/seed          # service + loader + guard + data-integrity specs
```

`srd-data-integrity.spec.ts` / `monsters-data-integrity.spec.ts` run the
validators against the real committed JSON; `seed.service.spec.ts` exercises the
write passes against a mocked Prisma client (including the idempotency contracts
above).
