-- Enable the pg_trgm extension for trigram-based fuzzy text matching on the
-- SRD list pages (VEG-235). The extension ships with Postgres 16 and so requires
-- no infra changes for the standard postgres:16-alpine image.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes on name + description for the three SRD entities that
-- expose a search input on the frontend. Indexes use the `gin_trgm_ops` opclass
-- so the `%`, `similarity()`, and `<->` operators can use the index.

CREATE INDEX IF NOT EXISTS "spells_name_trgm_idx"
  ON "spells" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "spells_description_trgm_idx"
  ON "spells" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "monsters_name_trgm_idx"
  ON "monsters" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "monsters_description_trgm_idx"
  ON "monsters" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "items_name_trgm_idx"
  ON "items" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "items_description_trgm_idx"
  ON "items" USING GIN ("description" gin_trgm_ops);
