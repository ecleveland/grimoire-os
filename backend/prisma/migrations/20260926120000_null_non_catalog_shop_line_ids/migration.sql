-- Null shop-line item ids that do not resolve to the catalog (VEG-564).
--
-- VEG-556 closed the write boundary on `shops.items`: a line's `itemId` must
-- name an SRD or shared item, never homebrew. It shipped no backfill, so every
-- id already stored outside the catalog became a latent write block. The shop
-- editor resends the whole stock on every save, so one stored homebrew id would
-- 400 every later edit of that shop, even a rename. VEG-556 papered over this
-- by grandfathering ids the row already held. This backfill lets the service
-- drop that exemption.
--
-- An id is nulled when it names a homebrew item or no item at all (the item
-- was deleted). Only `itemId` changes: the line keeps its name, category,
-- price, stock and notes, so it still sells as a custom line with its own name
-- and price. The id is dropped rather than kept because a purchase copies it
-- into the buyer's inventory, and only the homebrew owner can read that row.
--
-- The statement is guarded by an EXISTS check so shops with no such line
-- (catalog-only stock, custom lines only, an empty stock, a NULL column) are
-- not rewritten, which keeps their `updatedAt` and `version` as they are.

UPDATE "shops" s
SET "items" = (
  SELECT jsonb_agg(
    CASE
      WHEN line->>'itemId' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "items" i
                       WHERE i."id" = line->>'itemId'
                         AND i."contentSource" IN ('srd', 'shared'))
      THEN line || '{"itemId": null}'::jsonb
      ELSE line
    END
    ORDER BY ord)
  FROM jsonb_array_elements(s."items") WITH ORDINALITY AS t(line, ord)
)
WHERE jsonb_typeof(s."items") = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(s."items") line
              WHERE line->>'itemId' IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM "items" i
                                WHERE i."id" = line->>'itemId'
                                  AND i."contentSource" IN ('srd', 'shared')));
