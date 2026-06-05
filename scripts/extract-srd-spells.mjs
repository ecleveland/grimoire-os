#!/usr/bin/env node
/**
 * Repair the corrupt free-text descriptions in docs/extracted-srd-json/spells.json
 * from the SRD 5.2.1 PDF (VEG-271).
 *
 * WHY THIS EXISTS
 * ---------------
 * spells.json came from the same column-blind PDF extraction that corrupted
 * monsters.json (VEG-261). The structured fields (level, school, classes, casting
 * time, range, components, duration) audit clean; the damage is confined to the
 * free-text `description`, in three forms:
 *
 *   1. Trailing next-entry name bleed — a description ends with the alphabetically
 *      next spell's title (Arcane Sword, Project Image, Programmed Illusion).
 *   2. Whole-body substitution — Cone of Cold's description AND higher_levels were
 *      replaced with Confusion's stat block.
 *   3. Flattened embedded tables — the SRD's two-column reference tables linearized
 *      into token soup (Augury, Teleport, Confusion, Control Weather, Divine Word,
 *      Scrying, Creation).
 *
 * HOW IT WORKS
 *   - Bleed (1): strip the trailing foreign spell name from the existing JSON
 *     description — a minimal, targeted edit.
 *   - Tables (3) and substitution (2): re-derive the description from the PDF via
 *     the shared column-aware core (scripts/lib/srd-pdf.mjs), which reads these
 *     spells cleanly, and splice in the embedded tables as GFM markdown authored
 *     from that same clean read. The tables render via react-markdown + remark-gfm
 *     on the frontend, and the VEG-270 free-text guard (validateSpellData) passes.
 *
 * Only the corrupt spells' `description` (and Cone of Cold's `higher_levels`) are
 * rewritten; every other spell and field is left byte-identical.
 *
 * REQUIREMENTS: `pdftotext` (poppler).  macOS: `brew install poppler`.
 * USAGE: node scripts/extract-srd-spells.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bboxLayout, linearizeColumns } from './lib/srd-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(ROOT, 'resources', 'SRD_CC_v5.2.1.pdf');
const OUT = path.join(ROOT, 'docs', 'extracted-srd-json', 'spells.json');

const normApos = s => s.replace(/’/g, "'");

// ── Spells whose description ends with the next spell's title (bleed) ───────
const BLEED_SPELLS = ['Arcane Sword', 'Project Image', 'Programmed Illusion'];

// ── Curated GFM tables, authored from the shared extractor's clean read of the
//    SRD PDF. Each table region in the re-derived description (the contiguous run
//    of raw lines from `first` to `last`, inclusive) is replaced by `md`. ───────
const TABLES = {
  Augury: [
    {
      first: 'Omens',
      last: 'Indifference Neither good nor bad',
      md: [
        '**Omens**',
        '',
        '| Omen | For Results That Will Be … |',
        '| --- | --- |',
        '| Weal | Good |',
        '| Woe | Bad |',
        '| Weal and woe | Good and bad |',
        '| Indifference | Neither good nor bad |',
      ].join('\n'),
    },
  ],
  Teleport: [
    {
      first: 'Teleportation Outcome',
      last: 'False destination 01–50 51–00 — —',
      md: [
        '**Teleportation Outcome**',
        '',
        '| Familiarity | Mishap | Similar Area | Off Target | On Target |',
        '| --- | --- | --- | --- | --- |',
        '| Permanent circle | — | — | — | 01–00 |',
        '| Linked object | — | — | — | 01–00 |',
        '| Very familiar | 01–05 | 06–13 | 14–24 | 25–00 |',
        '| Seen casually | 01–33 | 34–43 | 44–53 | 54–00 |',
        '| Viewed once or described | 01–43 | 44–53 | 54–73 | 74–00 |',
        '| False destination | 01–50 | 51–00 | — | — |',
      ].join('\n'),
    },
  ],
  Confusion: [
    {
      first: '1d10 Behavior for the Turn',
      last: '9–10 The target chooses its behavior.',
      md: [
        '| 1d10 | Behavior for the Turn |',
        '| --- | --- |',
        '| 1 | The target doesn’t take an action, and it uses all its movement to move. Roll 1d4 for the direction: 1, north; 2, east; 3, south; or 4, west. |',
        '| 2–6 | The target doesn’t move or take actions. |',
        '| 7–8 | The target doesn’t move, and it takes the Attack action to make one melee attack against a random creature within reach. If none are within reach, the target takes no action. |',
        '| 9–10 | The target chooses its behavior. |',
      ].join('\n'),
    },
  ],
  'Control Weather': [
    {
      first: 'Precipitation',
      last: '6 Freezing',
      md: [
        '**Precipitation**',
        '',
        '| Stage | Condition |',
        '| --- | --- |',
        '| 1 | Clear |',
        '| 2 | Light clouds |',
        '| 3 | Overcast or ground fog |',
        '| 4 | Rain, hail, or snow |',
        '| 5 | Torrential rain, driving hail, or blizzard |',
        '',
        '**Temperature**',
        '',
        '| Stage | Condition |',
        '| --- | --- |',
        '| 1 | Heat wave |',
        '| 2 | Hot |',
        '| 3 | Warm |',
        '| 4 | Cool |',
        '| 5 | Cold |',
        '| 6 | Freezing |',
        '',
        '**Wind**',
        '',
        '| Stage | Condition |',
        '| --- | --- |',
        '| 1 | Calm |',
        '| 2 | Moderate wind |',
        '| 3 | Strong wind |',
        '| 4 | Gale |',
        '| 5 | Storm |',
      ].join('\n'),
    },
  ],
  'Divine Word': [
    {
      first: 'Divine Word Effects',
      last: '1 minute.',
      md: [
        '**Divine Word Effects**',
        '',
        '| Hit Points | Effect |',
        '| --- | --- |',
        '| 0–20 | The target dies. |',
        '| 21–30 | The target has the Blinded, Deafened, and Stunned conditions for 1 hour. |',
        '| 31–40 | The target has the Blinded and Deafened conditions for 10 minutes. |',
        '| 41–50 | The target has the Deafened condition for 1 minute. |',
      ].join('\n'),
    },
  ],
  Scrying: [
    {
      first: 'Your Knowledge of the Target Is … Save Modifier',
      last: 'Body part, lock of hair, or bit of nail −10',
      md: [
        '| Your Knowledge of the Target Is … | Save Modifier |',
        '| --- | --- |',
        '| Secondhand (heard of the target) | +5 |',
        '| Firsthand (met the target) | +0 |',
        '| Extensive (know the target well) | −5 |',
        '',
        '| You Have the Target’s … | Save Modifier |',
        '| --- | --- |',
        '| Picture or other likeness | −2 |',
        '| Garment or other possession | −4 |',
        '| Body part, lock of hair, or bit of nail | −10 |',
      ].join('\n'),
    },
  ],
  Creation: [
    {
      first: 'Materials',
      last: 'Adamantine or mithral 1 minute',
      md: [
        '**Materials**',
        '',
        '| Material | Duration |',
        '| --- | --- |',
        '| Vegetable matter | 24 hours |',
        '| Stone or crystal | 12 hours |',
        '| Precious metals | 1 hour |',
        '| Gems | 10 minutes |',
        '| Adamantine or mithral | 1 minute |',
      ].join('\n'),
    },
  ],
};

// Cone of Cold's description + higher_levels were overwritten with Confusion's;
// re-derive both from the PDF (it has no embedded table).
const FULL_REDERIVE = new Set([...Object.keys(TABLES), 'Cone of Cold']);

// ── PDF block location ─────────────────────────────────────────────────────
const isLevelLine = l => /^Level \d+ \w+ \(/.test(l) || /\bCantrip \(/.test(l);

function indexSpellBlocks(lines, names) {
  const starts = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (names.has(lines[i]) && isLevelLine(lines[i + 1])) starts.push(i);
  }
  return starts;
}

// Reflow PDF lines into the file's existing convention: one `\n` per source line,
// end-of-line soft hyphens resolved ("suc-"+"cessful" -> "successful").
function reflowLines(lines) {
  let out = '';
  for (let k = 0; k < lines.length; k++) {
    const piece = lines[k];
    if (k === 0) {
      out = piece;
      continue;
    }
    const lastTok = (out.match(/(\S+)$/) || ['', ''])[1];
    if (/[A-Za-z]-$/.test(out) && !/\d+-(foot|feet|mile)-$/i.test(lastTok)) {
      out = out.slice(0, -1) + piece; // soft word-break
    } else if (/-$/.test(out)) {
      out += piece; // dimension compound (e.g. "5-foot-")
    } else {
      out += '\n' + piece;
    }
  }
  return out;
}

// Split a spell block into its description lines and higher-level-slot lines.
function blockSections(blockLines) {
  const durIdx = blockLines.findIndex(l => l.startsWith('Duration:'));
  const descStart = durIdx + 1;
  let descEnd = blockLines.findIndex(
    (l, i) =>
      i >= descStart &&
      (l.startsWith('Using a Higher-Level Spell Slot') || l.startsWith('Cantrip Upgrade'))
  );
  if (descEnd === -1) descEnd = blockLines.length;
  return {
    descLines: blockLines.slice(descStart, descEnd),
    higherLines: blockLines.slice(descEnd),
  };
}

// Re-derive a description from its raw block lines, splicing curated GFM tables.
function buildDescription(name, descLines) {
  const tables = TABLES[name] ?? [];
  const findTable = line => tables.find(t => t.first === line);
  const segments = [];
  let i = 0;
  while (i < descLines.length) {
    const t = findTable(descLines[i]);
    if (t) {
      let j = i;
      while (j < descLines.length && descLines[j] !== t.last) j++;
      if (j === descLines.length) {
        throw new Error(`${name}: table end "${t.last}" not found after "${t.first}"`);
      }
      segments.push(t.md);
      i = j + 1;
    } else {
      const start = i;
      while (i < descLines.length && !findTable(descLines[i])) i++;
      const prose = reflowLines(descLines.slice(start, i));
      if (prose) segments.push(prose);
    }
  }
  return segments.join('\n\n');
}

// Collapse stray blank lines left by the column-blind extraction (clean spell
// descriptions never use `\n\n`; rendered through markdown these became spurious
// mid-sentence paragraph gaps). A single blank line is preserved only where it
// separates a reconstructed GFM table or **bold title** from adjacent text — the
// markdown block boundary those need.
function normalizeBlankLines(desc) {
  const isStructural = l => {
    const t = l.trim();
    return t.startsWith('|') || t.startsWith('**');
  };
  const lines = desc.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      out.push(lines[i]);
      continue;
    }
    let k = i + 1;
    while (k < lines.length && lines[k].trim() === '') k++;
    const prev = out.length ? out[out.length - 1] : '';
    const next = k < lines.length ? lines[k] : '';
    if (isStructural(prev) || isStructural(next)) out.push(''); // keep one block-separating blank
    i = k - 1;
  }
  return out.join('\n');
}

// Strip a trailing foreign spell title (apostrophe-insensitive) from a description.
// Idempotent: a no-op when the description has already been repaired (so the tool
// can be re-run safely). Blank-line cleanup is handled by the global sweep.
function stripTrailingForeignName(desc, names, self) {
  const lines = desc.replace(/\s+$/, '').split('\n');
  const last = lines[lines.length - 1].trim();
  const isForeign = last !== self && [...names].some(n => normApos(n) === normApos(last));
  if (!isForeign) return desc.replace(/\s+$/, '');
  lines.pop();
  return lines.join('\n').replace(/\s+$/, '');
}

function main() {
  const doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const byName = new Map(doc.spells.map(s => [s.name, s]));
  const names = new Set(byName.keys());

  const lines = linearizeColumns(bboxLayout(PDF));
  const starts = indexSpellBlocks(lines, names);
  const blockOf = name => {
    const i = starts.find(s => lines[s] === name);
    if (i === undefined) throw new Error(`Spell block not found in PDF: ${name}`);
    const j = starts.find(s => s > i);
    return lines.slice(i, j ?? lines.length);
  };

  let changed = 0;

  for (const name of BLEED_SPELLS) {
    const spell = byName.get(name);
    spell.description = stripTrailingForeignName(spell.description, names, name);
    changed++;
  }

  for (const name of FULL_REDERIVE) {
    const spell = byName.get(name);
    const { descLines, higherLines } = blockSections(blockOf(name));
    spell.description = buildDescription(name, descLines);
    if (name === 'Cone of Cold' && higherLines.length) {
      spell.higher_levels = reflowLines(higherLines);
    }
    changed++;
  }

  // Sweep stray blank-line artifacts from every spell description (the 11 above
  // are already clean; this catches the ~66 others whose mid-prose gaps only
  // became visible once descriptions render as markdown).
  let swept = 0;
  for (const spell of doc.spells) {
    const normalized = normalizeBlankLines(spell.description);
    if (normalized !== spell.description) {
      spell.description = normalized;
      swept++;
    }
  }
  console.log(`Normalized blank lines in ${swept} spell descriptions`);

  let out = JSON.stringify(doc, null, 2);
  if (!out.endsWith('\n')) out += '\n';
  fs.writeFileSync(OUT, out);
  console.log(`Repaired ${changed} spell descriptions -> ${path.relative(ROOT, OUT)}`);
}

main();
