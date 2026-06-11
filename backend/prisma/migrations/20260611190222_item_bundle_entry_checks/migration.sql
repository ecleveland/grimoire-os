-- Hand-authored CHECKs (Prisma cannot model them — same pattern as the
-- homebrew-creator CHECK from VEG-317): bundle entries must carry a positive
-- quantity and a bundle may never contain itself. The seed-time validator
-- enforces both for SRD data; these back-stop future homebrew write paths.
ALTER TABLE "item_bundle_entries" ADD CONSTRAINT "item_bundle_entries_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "item_bundle_entries" ADD CONSTRAINT "item_bundle_entries_no_self_containment" CHECK ("bundleId" <> "componentId");
