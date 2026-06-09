-- Partial unique indexes for the 'shared' (admin-published) content partition (VEG-310).
-- Mirrors the per-partition uniqueness from VEG-292: shared content names are unique
-- within the shared catalog (two admins can't publish the same-named monster); a shared
-- name may still coexist with an SRD name. This lives in a SEPARATE migration from the
-- `ALTER TYPE ... ADD VALUE 'shared'` because Postgres forbids using a freshly-added enum
-- value in the same transaction that added it.
--
-- NOTE: Prisma cannot model partial/filtered unique indexes in schema.prisma, so they are
-- hand-authored here. A future `prisma migrate dev` will report them as drift and offer to
-- DROP them — do NOT accept that; re-add them in the new migration. `prisma migrate deploy`
-- (CI/prod) is unaffected.
CREATE UNIQUE INDEX "spells_shared_name_key" ON "spells"("name") WHERE "contentSource" = 'shared';
CREATE UNIQUE INDEX "monsters_shared_name_key" ON "monsters"("name") WHERE "contentSource" = 'shared';
CREATE UNIQUE INDEX "items_shared_name_key" ON "items"("name") WHERE "contentSource" = 'shared';
CREATE UNIQUE INDEX "feats_shared_name_key" ON "feats"("name") WHERE "contentSource" = 'shared';
