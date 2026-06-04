# SRD PDF extraction core (`srd-pdf.mjs`)

Shared, column/table-aware primitives for re-deriving the PDF-extracted SRD
datasets from `resources/SRD_CC_v5.2.1.pdf`. Built in VEG-270 by lifting the
column-aware core out of `extract-srd-monsters.mjs` so the spell / magic-item /
species data tickets (VEG-271/272/273) build on one extractor instead of
re-deriving it three times.

The companion free-text guards in
`backend/src/seed/srd-json.loader.ts` (`validateSpellData`,
`validateMagicItemData`, `validateSpeciesData`) backstop the output: they fail
the seed/CI if a re-extraction reintroduces foreign-title bleed, a dangling word
fragment, or a flattened embedded table.

## Why

A naive `pdftotext` flattens the SRD's two snaking columns and its embedded
option/result tables, so every entry absorbs fragments of whatever sat beside or
below it — the field-bleed corruption fixed for monsters in VEG-261 and still
present in `spells.json` / `magic_items.json`.

## API

| Export | Purpose |
| --- | --- |
| `bboxLayout(pdfPath)` | Run `pdftotext -bbox-layout`, return the XML (per-word x/y). |
| `extractWords(xml)` | Decode XML → `{ page, x, y, xMax, yMax, text }[]` in reading order. |
| `linearizeColumns(xml, opts?)` | Split words into columns by x, linearize page → column → y → x, drop page furniture. Returns `string[]`. |
| `joinHyphenatedLines(pieces)` | Re-flow wrapped lines, resolving soft hyphens and dimension compounds. |
| `splitColumns(line, opts?)` | Split one layout line into cells on wide-space gaps or ` \| ` pipes. |
| `reconstructTable(lines, opts?)` | Rebuild a tabular region into `{ name, columns, rows }`, or `null` if it isn't a ≥2×2 grid. |
| `tableToMarkdown(table)` | Render a reconstructed table as GitHub-flavored markdown. |

`linearizeColumns` options: `{ colSplit = 297, yTol = 4, dropLine = SRD_PAGE_FURNITURE }`.
Pass `dropLine: () => false` to keep every line.

## Typical data-ticket flow

```js
import {
  bboxLayout, linearizeColumns, joinHyphenatedLines, reconstructTable,
} from './lib/srd-pdf.mjs';

const lines = linearizeColumns(bboxLayout(PDF));
// …locate each entry's region by its boundary headers…
// …re-flow prose with joinHyphenatedLines(region)…
// …turn the entry's table region back into structure:
const table = reconstructTable(tableRegionLines, { name: 'Elven Lineages' });
```

## Tests

```bash
node --test scripts/lib/          # unit tests (no PDF needed — synthetic XML)
node scripts/extract-srd-monsters.mjs && git diff --quiet docs/extracted-srd-json/monsters.json
                                  # regression: byte-identical monster output
```

Requires `pdftotext` (poppler) only for `bboxLayout` / the monster script.
macOS: `brew install poppler`.
