-- Shared content must survive its authoring admin (VEG-317).
--
-- `createdById -> users` was ON DELETE CASCADE, which is correct for homebrew
-- but silently destroyed globally-visible `shared` catalog content when the
-- publishing admin was deleted. Switch the FK to SET NULL; homebrew rows are
-- instead deleted explicitly by the service layer (UsersService.remove) in the
-- same transaction as the user delete.
--
-- The CHECK constraints backstop that contract at the DB level: a homebrew row
-- may never lose its creator (a SET NULL firing on homebrew would violate the
-- CHECK and abort the delete, surfacing a service-layer cleanup bug instead of
-- silently orphaning rows).
--
-- NOTE: Prisma cannot model CHECK constraints in schema.prisma, so they are
-- hand-authored here (same convention as the partial unique indexes from
-- VEG-292/310). A future `prisma migrate dev` will report them as drift and
-- offer to DROP them — do NOT accept that; re-add them in the new migration.
-- `prisma migrate deploy` (CI/prod) is unaffected.

ALTER TABLE "spells" DROP CONSTRAINT "spells_createdById_fkey";
ALTER TABLE "spells" ADD CONSTRAINT "spells_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "spells" ADD CONSTRAINT "spells_homebrew_has_creator_check" CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

ALTER TABLE "monsters" DROP CONSTRAINT "monsters_createdById_fkey";
ALTER TABLE "monsters" ADD CONSTRAINT "monsters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monsters" ADD CONSTRAINT "monsters_homebrew_has_creator_check" CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

ALTER TABLE "items" DROP CONSTRAINT "items_createdById_fkey";
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_homebrew_has_creator_check" CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

ALTER TABLE "feats" DROP CONSTRAINT "feats_createdById_fkey";
ALTER TABLE "feats" ADD CONSTRAINT "feats_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feats" ADD CONSTRAINT "feats_homebrew_has_creator_check" CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));
