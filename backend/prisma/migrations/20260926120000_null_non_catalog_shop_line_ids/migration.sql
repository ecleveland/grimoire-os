-- Null shop-line item ids that do not resolve to the catalog (VEG-564).
--
-- VEG-556 closed the write boundary on `shops.items`. A line's `itemId` must
-- name an SRD or shared item, never homebrew. It shipped no backfill, so the
-- service exempts ids a row already holds, and that exemption could carry a
-- stored homebrew id forward on every save and onto new lines of the shop.
-- After this backfill a stored id is a catalog id or a dangling one, never
-- another user's homebrew. The exemption stays, because an item can still be
-- deleted after a shop stocked it, but it no longer carries a leak.
--
-- An id is nulled when it names a homebrew item or no item at all (the item
-- was deleted). Only `itemId` changes: the line keeps its name, category,
-- price, stock and notes, so it still sells as a custom line with its own name
-- and price. The id is dropped rather than kept because a purchase copies it
-- into the buyer's inventory, and only the homebrew owner can read that row.
--
-- The statement is guarded so shops with no such line (catalog-only stock,
-- custom lines only, an empty stock, a NULL or non-array column) are not
-- rewritten. The array check is wrapped in CASE because Postgres does not
-- promise an evaluation order for AND, and jsonb_array_elements aborts on a
-- scalar.

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
WHERE CASE
  WHEN jsonb_typeof(s."items") = 'array' THEN
    EXISTS (SELECT 1 FROM jsonb_array_elements(s."items") line
            WHERE line->>'itemId' IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "items" i
                              WHERE i."id" = line->>'itemId'
                                AND i."contentSource" IN ('srd', 'shared')))
  ELSE false
END;
