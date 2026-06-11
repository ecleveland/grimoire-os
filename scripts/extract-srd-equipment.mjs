#!/usr/bin/env node
/**
 * Extract the SRD 5.2.1 Equipment chapter into
 * docs/extracted-srd-json/equipment.json (VEG-308).
 *
 * WHY THIS EXISTS
 * ---------------
 * The items table was effectively magic-only: 257 magic items plus a 5-item
 * hand-authored stub. This extractor derives the complete basic-equipment
 * roster — weapons, armor, tools, adventuring gear, equipment packs (with
 * structured contents), mounts, tack, vehicles, lifestyle expenses,
 * food/drink/lodging, and services — from the chapter's dense multi-column
 * tables via the shared column/table-aware core (scripts/lib/srd-pdf.mjs,
 * VEG-270). Cells are reconstructed from per-word bounding boxes
 * (wordsToCellRows), the exact failure mode that produced field-bleed in the
 * naive March extractions (VEG-261).
 *
 * SCOPE NOTES
 *  - SRD 5.2.1 has no Trade Goods table (that was SRD 5.1); the chapter's only
 *    mention is one sentence in the "Selling Equipment" sidebar. Nothing to
 *    extract for that category.
 *  - Coins (the Coin Values table) are currency denominations, not equipment,
 *    and are deliberately not emitted as items.
 *  - Gaming Set and Musical Instrument are single tools with a Variants entry
 *    in SRD 5.2.1 (not per-variant line items); they are emitted as one item
 *    each, with the variants preserved in the description.
 *  - "Ammunition", "Arcane Focus", "Druidic Focus", and "Holy Symbol" are
 *    "Varies/Varies" rows pointing at variant sub-tables; the variants are
 *    emitted as concrete items (e.g. "Arcane Focus (Wand)", "Arrows (20)")
 *    and the parent rows are dropped.
 *  - "Potion of Healing" appears in the Adventuring Gear table but is a magic
 *    item; the magic-items dataset's "Potions of Healing" entry is the single
 *    canonical record (VEG-308 reconciliation decision), so the gear row is
 *    deliberately dropped here.
 *
 * Idempotent: re-running reproduces the same output byte-for-byte.
 *
 * REQUIREMENTS: `pdftotext` (poppler). macOS: `brew install poppler`.
 * USAGE:
 *   node scripts/extract-srd-equipment.mjs            # write equipment.json
 *   node scripts/extract-srd-equipment.mjs --stats    # per-category counts only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bboxLayout, extractWords, wordsToCellRows, COLUMN_SPLIT_X } from './lib/srd-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(ROOT, 'resources', 'SRD_CC_v5.2.1.pdf');
const OUT = path.join(ROOT, 'docs', 'extracted-srd-json', 'equipment.json');

const fail = msg => {
  throw new Error(`extract-srd-equipment: ${msg}`);
};

// ── Chapter row stream ─────────────────────────────────────────────────────
// The chapter is read as an ordered stream of cell rows: page → column half
// (left before right, matching the snaking reading order) → y. Full-width
// tables (Weapons, Armor, Airborne and Waterborne Vehicles) are re-read
// without the half split, anchored by their header rows.
function buildStreams() {
  const xml = bboxLayout(PDF);
  const words = extractWords(xml);

  // Chapter bounds: the big "Equipment" chapter heading and the next chapter
  // ("Spells"). Chapter headings are >25pt tall AND sit at the top of the page
  // (y < 100) — section-level uses of the same words sit lower.
  const big = t => words.filter(w => w.text === t && w.yMax - w.y > 25 && w.y < 100);
  const eq = big('Equipment');
  if (eq.length !== 1) fail(`expected 1 Equipment chapter heading, found ${eq.length}`);
  const startPage = eq[0].page;
  const sp = big('Spells').filter(w => w.page > startPage);
  if (sp.length === 0) fail('Spells chapter heading not found after Equipment');
  const endPage = Math.min(...sp.map(w => w.page)); // exclusive

  const chapterWords = words.filter(w => w.page >= startPage && w.page < endPage);
  const isFurniture = row =>
    /^(\d{1,3} )?System Reference Document 5\.2\.1$/.test(row.cells.map(c => c.text).join(' '));

  // The PDF text occasionally carries literal tabs; collapse to single spaces.
  const clean = row => {
    for (const c of row.cells) c.text = c.text.replace(/\s+/g, ' ').trim();
    return row;
  };

  const full = [];
  for (let p = startPage; p < endPage; p++) {
    const ws = chapterWords.filter(w => w.page === p);
    for (const row of wordsToCellRows(ws)) {
      if (!isFurniture(row)) full.push(clean(row));
    }
  }

  // The Airborne and Waterborne Vehicles table is full-width but sits between
  // half-parsed sections; its row fragments must not leak into the halves
  // stream (the right half would otherwise bleed into Lifestyle Expenses).
  const shipRows = new Set();
  const shipsAt = full.findIndex(r => rowText(r).startsWith('Ship Speed Crew Passengers'));
  if (shipsAt === -1) fail('ships table header not found while building streams');
  for (let i = shipsAt; i < full.length; i++) {
    const r = full[i];
    const isShipRow =
      i === shipsAt || rowText(r) === '(Tons) AC HP Damage Threshold Cost' || r.cells.length === 9;
    if (!isShipRow) break;
    shipRows.add(`${r.page}:${r.y.toFixed(1)}`);
  }

  const halves = [];
  for (let p = startPage; p < endPage; p++) {
    for (const side of ['L', 'R']) {
      const ws = chapterWords.filter(
        w => w.page === p && (side === 'L' ? w.x < COLUMN_SPLIT_X : w.x >= COLUMN_SPLIT_X)
      );
      for (const row of wordsToCellRows(ws)) {
        if (!isFurniture(row) && !shipRows.has(`${row.page}:${row.y.toFixed(1)}`))
          halves.push({ ...clean(row), side });
      }
    }
  }

  return { halves, full };
}

// ── Small parsers ──────────────────────────────────────────────────────────
const DASH = '—';

// "2 lb." → 2, "1/4 lb." → 0.25, "1½ lb." → 1.5, "—"/"Varies" → null
function parseWeight(cell) {
  if (!cell || cell === DASH || cell === 'Varies') return null;
  const t = cell.replace(/\s*lb\.?$/, '').replace(/,/g, '');
  if (/^\d+½$/.test(t)) return parseInt(t, 10) + 0.5;
  if (t === '½') return 0.5;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const n = parseFloat(t);
  if (Number.isNaN(n)) fail(`unparseable weight cell "${cell}"`);
  return n;
}

// Split a weapon Properties cell on top-level commas:
// "Thrown (Range 20/60), Versatile (1d8)" → two entries.
function splitProperties(cell) {
  if (!cell || cell === DASH) return [];
  return cell.split(/,\s+(?![^()]*\))/).map(s => s.trim());
}

// Reflow a run of prose rows into paragraphs. A row indented past the column
// base opens a new paragraph (the SRD indents paragraph-opening lines ~8pt);
// soft end-of-line hyphens are resolved.
function reflowProse(rows) {
  let out = '';
  for (const r of rows) {
    const text = r.cells.map(c => c.text).join(' ');
    const indented = r.indent >= 5;
    if (!out) {
      out = text;
      continue;
    }
    if (/[A-Za-z]-$/.test(out) && !/\d+-(foot|feet|mile)-$/i.test(out.match(/(\S+)$/)[1])) {
      out = out.slice(0, -1) + text;
    } else if (/-$/.test(out)) {
      out += text;
    } else {
      out += (indented ? '\n\n' : ' ') + text;
    }
  }
  // pdftotext renders the SRD's "1½" ligature in prose as "11/2".
  return out.replace(/\b11\/2\b/g, '1½').trim();
}

// ── Section boundary helpers ───────────────────────────────────────────────
const rowText = r => r.cells.map(c => c.text).join(' ');

function indexOfRow(rows, text, from = 0) {
  for (let i = from; i < rows.length; i++) {
    if (rows[i].cells.length === 1 && rows[i].cells[0].text === text) return i;
  }
  fail(`marker row "${text}" not found (from ${from})`);
}

// ── Weapons (full-width table) ─────────────────────────────────────────────
function parseWeapons(full) {
  const isHeader = r =>
    rowText(r) === 'Name Damage Properties Mastery Weight Cost' && r.cells.length === 6;
  const start = full.findIndex(isHeader);
  if (start === -1) fail('Weapons table header not found');
  const propsCol = { min: full[start].cells[2].x - 10, max: full[start].cells[3].x - 10 };

  const items = [];
  let category = null;
  for (let i = start + 1; i < full.length; i++) {
    const r = full[i];
    const cat = rowText(r).match(/^(Simple|Martial) (Melee|Ranged) Weapons$/);
    if (cat) {
      category = `${cat[1]} ${cat[2]} Weapon`;
      continue;
    }
    if (r.cells.length === 6) {
      const [name, dmg, props, mastery, weight, cost] = r.cells.map(c => c.text);
      const dm = dmg.match(/^(\d+(?:d\d+)?) (\w+)$/);
      if (!dm) fail(`unparseable weapon damage "${dmg}" for ${name}`);
      if (!category) fail(`weapon ${name} before any category subhead`);
      items.push({
        name,
        category,
        cost,
        weight: parseWeight(weight),
        damage: dm[1],
        damage_type: dm[2],
        properties: splitProperties(props),
        mastery,
      });
      continue;
    }
    // Wrapped Properties cell ("Two-Handed" continuation) lands alone in the
    // Properties column x-range.
    if (
      r.cells.length === 1 &&
      r.cells[0].x >= propsCol.min &&
      r.cells[0].x < propsCol.max &&
      items.length
    ) {
      const last = items[items.length - 1];
      const joined = splitProperties(r.cells[0].text);
      const tail = last.properties.pop();
      last.properties.push(
        ...splitProperties(`${tail.replace(/,?$/, ',')} ${joined.shift()}`),
        ...joined
      );
      continue;
    }
    break; // end of table
  }
  if (items.length < 30) fail(`only ${items.length} weapons parsed`);
  return items;
}

// ── Armor (full-width table) ───────────────────────────────────────────────
function parseArmor(full) {
  const isHeader = r =>
    rowText(r) === 'Armor Armor Class (AC) Strength Stealth Weight Cost' && r.cells.length === 6;
  const start = full.findIndex(isHeader);
  if (start === -1) fail('Armor table header not found');

  const items = [];
  let category = null;
  let donDoff = null;
  for (let i = start + 1; i < full.length; i++) {
    const r = full[i];
    const grp = rowText(r).match(/^(Light Armor|Medium Armor|Heavy Armor|Shield) \((.+)\)$/);
    if (grp) {
      category = grp[1];
      donDoff = grp[2];
      continue;
    }
    if (r.cells.length === 6 && category) {
      const [name, ac, str, stealth, weight, cost] = r.cells.map(c => c.text);
      const strReq = str === DASH ? null : parseInt(str.replace(/^Str\s+/, ''), 10);
      if (str !== DASH && Number.isNaN(strReq)) fail(`unparseable Strength cell "${str}"`);
      items.push({
        name,
        category,
        cost,
        weight: parseWeight(weight),
        armor_class: ac,
        stealth_disadvantage: stealth === 'Disadvantage',
        strength_requirement: strReq,
        description: `${category} (${donDoff}).`,
        properties: [],
      });
      continue;
    }
    break;
  }
  if (items.length !== 13) fail(`expected 13 armor rows, parsed ${items.length}`);
  return items;
}

// ── Tools (prose blocks with Ability/Utilize/Craft/Variants entries) ───────
const TOOL_HEADING = /^(.+?) \((\d[\d,]*\s*(?:CP|SP|GP)|Varies)\)$/;
const TOOL_FIELD = /^(Ability|Utilize|Craft|Variants):\s*/;

function parseTools(halves) {
  const start = indexOfRow(halves, 'Artisan’s Tools');
  const otherAt = indexOfRow(halves, 'Other Tools', start);
  const end = indexOfRow(halves, 'Adventuring Gear', otherAt);

  const items = [];
  let item = null;
  let field = null;
  for (let i = start + 1; i < end; i++) {
    const r = halves[i];
    const first = r.cells[0].text;
    const head = r.cells.length === 1 && first.match(TOOL_HEADING);
    if (head && (i + 1 >= end || TOOL_FIELD.test(halves[i + 1].cells[0].text))) {
      item = {
        name: head[1],
        category: i < otherAt ? "Artisan's Tools" : 'Tool',
        cost: head[2],
        weight: null,
        fields: [],
      };
      if (item.name === 'Gaming Set') item.category = 'Gaming Set';
      if (item.name === 'Musical Instrument') item.category = 'Musical Instrument';
      items.push(item);
      field = null;
      continue;
    }
    if (!item) continue;
    // "Ability: X" with "Weight: Y" as a second cell on the same row.
    for (const cell of r.cells) {
      const wm = cell.text.match(/^Weight:\s*(.+)$/);
      if (wm) {
        item.weight = parseWeight(wm[1]);
        continue;
      }
      if (TOOL_FIELD.test(cell.text)) {
        field = { text: cell.text };
        item.fields.push(field);
      } else if (field) {
        // wrapped continuation of the current field
        if (/[A-Za-z]-$/.test(field.text)) field.text = field.text.slice(0, -1) + cell.text;
        else field.text += ` ${cell.text}`;
      }
    }
  }

  if (items.length < 20) fail(`only ${items.length} tools parsed`);
  return items.map(t => ({
    name: t.name,
    category: t.category,
    cost: t.cost,
    weight: t.weight,
    description: t.fields.map(f => f.text).join('\n'),
    properties: [],
  }));
}

// ── Adventuring gear ───────────────────────────────────────────────────────
// Three interleaved structures share the section: the summary table (Item /
// Weight / Cost, giving canonical names + weights), the alphabetical prose
// entries "Name (Cost)" (giving descriptions, incl. pack contents), and the
// variant sub-tables (Ammunition / Arcane Focuses / Druidic Focuses / Holy
// Symbols) that expand the table's Varies rows into concrete items.
const PROSE_HEADING = /^(.+?) \(((?:\d[\d,]*\s*(?:CP|SP|GP))|Varies|Free)\)$/;
const SUBTABLES = {
  Ammunition: { header: 'Type Amount Storage Weight Cost', parent: 'Ammunition' },
  'Arcane Focuses': { header: 'Focus Weight Cost', parent: 'Arcane Focus' },
  'Druidic Focuses': { header: 'Focus Weight Cost', parent: 'Druidic Focus' },
  'Holy Symbols': { header: 'Symbol Weight Cost', parent: 'Holy Symbol' },
};

function parseGearSection(halves) {
  const headingAt = indexOfRow(halves, 'Adventuring Gear');
  const end = indexOfRow(halves, 'Mounts and Vehicles', headingAt);

  const tableRows = new Map(); // canonical name → { weight, cost }
  const prose = []; // { name, cost, rows }
  const subTables = new Map(); // sub-table title → rows of cells
  let mode = null; // 'gear-table' | { sub: title } | prose entry
  let entry = null;

  for (let i = headingAt + 1; i < end; i++) {
    const r = halves[i];
    const text = rowText(r);

    if (text === 'Item Weight Cost' && r.cells.length === 3) {
      mode = 'gear-table';
      continue;
    }
    if (SUBTABLES[text] && r.cells.length === 1) {
      mode = { subTitle: text };
      subTables.set(text, []);
      continue;
    }
    // (`typeof` guard: mode can also be the 'gear-table' string, and string
    // prototype methods like .sub would make a bare property check truthy.)
    if (typeof mode === 'object' && mode !== null) {
      if (text === SUBTABLES[mode.subTitle].header) continue; // sub-table header row
      if (r.cells.length >= 3) {
        subTables.get(mode.subTitle).push(r.cells.map(c => c.text));
        continue;
      }
      mode = null; // fall through: row after the sub-table
    }
    if (mode === 'gear-table') {
      if (r.cells.length === 3 && !PROSE_HEADING.test(text)) {
        const [name, weight, cost] = r.cells.map(c => c.text);
        tableRows.set(name, { weight, cost });
        continue;
      }
      mode = null; // table ended; fall through
    }

    const head = r.cells.length === 1 && text.match(PROSE_HEADING);
    if (head) {
      entry = { name: head[1], cost: head[2], rows: [] };
      prose.push(entry);
      continue;
    }
    // A heading whose parenthetical wraps to the next line — "Spell Scroll
    // (Cantrip, 30 GP;" / "Level 1, 50 GP)". Consume both rows as one entry.
    if (
      r.cells.length === 1 &&
      /^(.+?) \([^)]*$/.test(text) &&
      /GP|SP|CP/.test(text) &&
      i + 1 < end &&
      halves[i + 1].cells.length === 1 &&
      /^[^(]*\)$/.test(halves[i + 1].cells[0].text)
    ) {
      const joined = `${text} ${halves[i + 1].cells[0].text}`;
      const wm = joined.match(/^(.+?) \((.+)\)$/);
      entry = { name: wm[1], cost: wm[2], rows: [] };
      prose.push(entry);
      i++;
      continue;
    }
    if (entry && r.cells.length === 1) {
      // 'Adventuring Gear' table title row (it precedes the header) — skip.
      if (text === 'Adventuring Gear') continue;
      const base = r.side === 'L' ? 63 : 313;
      entry.rows.push({ cells: r.cells, indent: r.cells[0].x - base });
    }
  }

  return { tableRows, prose, subTables };
}

// Pack contents: "A Burglar’s Pack contains the following items: Backpack,
// Ball Bearings, …, and Waterskin." → [{ name, quantity }], resolved against
// the extracted item names (loud failure on any unresolved component).
function parsePackContents(packName, description) {
  const m = description.match(/contains the following items:\s*([\s\S]+?)\.(\s|$)/);
  if (!m) fail(`pack ${packName}: contents sentence not found`);
  const pieces = m[1]
    .replace(/\s+and\s+/g, ', ')
    .split(/,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
  return pieces.map(piece => {
    const qm = piece.match(/^(\d+)\s+(.+)$/);
    let quantity = 1;
    let name = piece;
    if (qm) {
      quantity = +qm[1];
      name = qm[2];
    }
    name = name
      .replace(/^flasks? of /, '')
      .replace(/^days? of /, '')
      .replace(/^sheets? of /, '');
    return { name, quantity };
  });
}

// Singular/plural + "Storage, Form" mismatches between pack-contents prose and
// the canonical gear-table names.
const COMPONENT_ALIASES = {
  Candles: 'Candle',
  Torches: 'Torch',
  Costumes: 'Costume',
  'Hooded Lantern': 'Lantern, Hooded',
  'Bullseye Lantern': 'Lantern, Bullseye',
  Books: 'Book',
  'Fine Clothes': 'Clothes, Fine',
};

// ── Mounts, tack, vehicles ─────────────────────────────────────────────────
function parseMountsSection(halves, full) {
  const start = indexOfRow(halves, 'Mounts and Vehicles');
  const end = indexOfRow(halves, 'Lifestyle Expenses', start);
  const items = [];

  // Mounts and Other Animals: Item / Carrying Capacity / Cost
  const mountsAt = indexOfRow(halves, 'Mounts and Other Animals', start);
  for (let i = mountsAt + 1; i < end; i++) {
    const r = halves[i];
    const text = rowText(r);
    if (text === 'Item Carrying Capacity Cost') continue;
    if (r.cells.length !== 3) break;
    const [name, capacity, cost] = r.cells.map(c => c.text);
    items.push({
      name,
      category: 'Mount',
      cost,
      weight: null,
      description: `Carrying capacity ${capacity}`.replace(/\.?$/, '.'),
      properties: [],
    });
  }
  if (!items.some(i => i.name === 'Warhorse')) fail('Warhorse missing from mounts table');

  // The "Saddles" prose paragraph describes the saddle variants.
  const saddlesAt = indexOfRow(halves, 'Saddles', start);
  const saddleProseRows = [];
  for (let i = saddlesAt + 1; i < mountsAt; i++) {
    const r = halves[i];
    if (r.cells.length !== 1) break;
    const base = r.side === 'L' ? 63 : 313;
    saddleProseRows.push({ cells: r.cells, indent: r.cells[0].x - base });
  }
  const saddleProse = reflowProse(saddleProseRows);
  if (!saddleProse.includes('bit')) fail('Saddles prose not captured');

  // Tack, Harness, and Drawn Vehicles: Item / Weight / Cost, with an indented
  // "Saddle" variant group.
  const tackAt = indexOfRow(halves, 'Tack, Harness, and Drawn Vehicles', start);
  let group = null;
  for (let i = tackAt + 1; i < end; i++) {
    const r = halves[i];
    const text = rowText(r);
    if (text === 'Item Weight Cost') continue;
    if (r.cells.length === 1 && halves[i + 1] && halves[i + 1].cells[0].x > r.cells[0].x + 4) {
      group = text; // "Saddle"
      continue;
    }
    if (r.cells.length !== 3) break;
    const [rawName, weight, cost] = r.cells.map(c => c.text);
    const grouped = group && r.cells[0].x > halves[tackAt + 1].cells[0].x + 4;
    if (!grouped) group = null;
    items.push({
      name: grouped ? `${group}, ${rawName}` : rawName,
      category: 'Tack, Harness, or Drawn Vehicle',
      cost,
      weight: parseWeight(weight),
      description: grouped && group === 'Saddle' ? saddleProse : null,
      properties: [],
    });
  }
  if (!items.some(i => i.name === 'Saddle, Military')) fail('Saddle variants missing from tack');

  // Airborne and Waterborne Vehicles — full width: Ship / Speed / Crew /
  // Passengers / Cargo (Tons) / AC / HP / Damage Threshold / Cost.
  const shipsHeaderAt = full.findIndex(r => rowText(r).startsWith('Ship Speed Crew Passengers'));
  if (shipsHeaderAt === -1) fail('ships table header not found');
  for (let i = shipsHeaderAt + 1; i < full.length; i++) {
    const r = full[i];
    if (rowText(r) === '(Tons) AC HP Damage Threshold Cost') continue; // wrapped header line
    if (r.cells.length !== 9) break;
    const [name, speed, crew, passengers, cargo, ac, hp, dt, cost] = r.cells.map(c => c.text);
    items.push({
      name,
      category: 'Airborne or Waterborne Vehicle',
      cost,
      weight: null,
      description:
        `Speed ${speed}; Crew ${crew}; Passengers ${passengers}; ` +
        `Cargo ${cargo} tons; AC ${ac}; HP ${hp}; Damage Threshold ${dt}.`,
      properties: [],
    });
  }
  if (!items.some(i => i.name === 'Galley')) fail('Galley missing from ships table');
  return items;
}

// ── Lifestyle expenses (prose blocks) ──────────────────────────────────────
function parseLifestyles(halves) {
  const start = indexOfRow(halves, 'Lifestyle Expenses');
  const end = indexOfRow(halves, 'Food, Drink, and Lodging', start);
  const items = [];
  let entry = null;
  for (let i = start + 1; i < end; i++) {
    const r = halves[i];
    const head = r.cells.length === 1 && rowText(r).match(/^(\w+) \((Free|[\d,]+ [CSG]P per Day)\)$/);
    if (head) {
      entry = { tier: head[1], cost: head[2], rows: [] };
      items.push(entry);
      continue;
    }
    if (entry) {
      const base = r.side === 'L' ? 63 : 313;
      entry.rows.push({ cells: r.cells, indent: r.cells[0].x - base });
    }
  }
  if (items.length !== 7) fail(`expected 7 lifestyles, parsed ${items.length}`);
  return items.map(e => ({
    name: `${e.tier} Lifestyle`,
    category: 'Lifestyle Expense',
    cost: e.cost,
    weight: null,
    description: reflowProse(e.rows),
    properties: [],
  }));
}

// ── Food, drink, and lodging (two-up paired table with variant groups) ─────
function parseFoodDrinkLodging(halves) {
  const titleAt = indexOfRow(halves, 'Food, Drink, and Lodging', indexOfRow(halves, 'Lifestyle Expenses'));
  const tableAt = indexOfRow(halves, 'Food, Drink, and Lodging', titleAt + 1);
  const end = indexOfRow(halves, 'Hirelings', tableAt);

  // Each row carries up to two (Item, Cost) pairs; flatten them in reading
  // order: per page-half, the left pair column top-to-bottom, then the right.
  // Variant-group membership (Inn Stay per Day / Meal / Wine) is detected by
  // indentation relative to each pair column's own "Item" header x.
  const pairs = [];
  for (let i = tableAt + 1; i < end; i++) {
    const r = halves[i];
    if (rowText(r) === 'Item Cost Item Cost') {
      pairs.push({
        split: (r.cells[2].x + r.cells[1].xMax) / 2,
        leftBase: r.cells[0].x,
        rightBase: r.cells[2].x,
        left: [],
        right: [],
      });
      continue;
    }
    const cur = pairs[pairs.length - 1];
    if (!cur) fail('food table row before its header');
    const left = r.cells.filter(c => c.x < cur.split);
    const right = r.cells.filter(c => c.x >= cur.split);
    if (left.length) cur.left.push({ cells: left, base: cur.leftBase });
    if (right.length) cur.right.push({ cells: right, base: cur.rightBase });
  }

  const flat = pairs.flatMap(p => [...p.left, ...p.right]);
  const items = [];
  let group = null;
  for (const { cells, base } of flat) {
    const [a, b] = cells;
    if (!b) {
      group = a.text; // "Inn Stay per Day" / "Meal" / "Wine (bottle)"
      continue;
    }
    const inGroup = group !== null && a.x > base + 4;
    if (!inGroup) group = null;
    const name = inGroup
      ? group === 'Wine (bottle)'
        ? `Wine, ${a.text} (bottle)`
        : `${group} (${a.text})`
      : a.text;
    items.push({
      name,
      category: 'Food, Drink, or Lodging',
      cost: b.text,
      weight: null,
      description: null,
      properties: [],
    });
  }
  if (!items.some(i => i.name === 'Inn Stay per Day (Squalid)') || !items.some(i => i.name === 'Wine, Fine (bottle)'))
    fail('food/drink/lodging groups not resolved');
  return items;
}

// ── Services: hirelings + spellcasting ─────────────────────────────────────
function parseServices(halves) {
  const items = [];

  const hirelingsAt = indexOfRow(halves, 'Hirelings', indexOfRow(halves, 'Food, Drink, and Lodging'));
  const tableAt = indexOfRow(halves, 'Hirelings', hirelingsAt + 1); // table title after section heading
  for (let i = tableAt + 1; i < halves.length; i++) {
    const r = halves[i];
    if (rowText(r) === 'Service Cost') continue;
    if (r.cells.length !== 2) break;
    items.push({
      name: r.cells[0].text.replace(/\b\w/g, ch => ch.toUpperCase()),
      category: 'Service',
      cost: r.cells[1].text,
      weight: null,
      description: null,
      properties: [],
    });
  }

  const spellAt = indexOfRow(halves, 'Spellcasting Services', hirelingsAt);
  const end = indexOfRow(halves, 'Magic Items', spellAt);
  for (let i = spellAt + 1; i < end; i++) {
    const r = halves[i];
    if (rowText(r) === 'Spell Level Availability Cost') continue;
    if (r.cells.length !== 3) break;
    const [level, availability, cost] = r.cells.map(c => c.text);
    items.push({
      name: level === 'Cantrip' ? 'Spellcasting (Cantrip)' : `Spellcasting (Level ${level})`,
      category: 'Service',
      cost,
      weight: null,
      description: `Availability: ${availability}.`,
      properties: [],
    });
  }

  if (items.length !== 10) fail(`expected 10 service rows, parsed ${items.length}`);
  return items;
}

// ── Assemble ───────────────────────────────────────────────────────────────
function main() {
  const { halves, full } = buildStreams();

  const weapons = parseWeapons(full);
  const armor = parseArmor(full);
  const tools = parseTools(halves);
  const { tableRows, prose, subTables } = parseGearSection(halves);
  const mounts = parseMountsSection(halves, full);
  const lifestyles = parseLifestyles(halves);
  const food = parseFoodDrinkLodging(halves);
  const services = parseServices(halves);

  // Gear items: canonical names from the summary table; descriptions from the
  // prose entries; Varies rows expanded from the variant sub-tables.
  const proseByName = new Map(prose.map(p => [p.name, p]));
  // Prose headings use natural order ("Ram, Portable" is "Ram, Portable" in
  // the table but some entries differ in comma form); the table is canonical.
  const proseFor = tableName => {
    if (proseByName.has(tableName)) return proseByName.get(tableName);
    // Comma-inverted table names ("Lantern, Bullseye") are described under
    // their natural form ("Bullseye Lantern").
    const m = tableName.match(/^(.+), (.+)$/);
    if (m && proseByName.has(`${m[2]} ${m[1]}`)) return proseByName.get(`${m[2]} ${m[1]}`);
    // Parenthetical variants ("Spell Scroll (Cantrip)") share the base entry.
    const base = tableName.replace(/ \(.+\)$/, '');
    if (base !== tableName && proseByName.has(base)) return proseByName.get(base);
    return null;
  };

  const gear = [];
  const packs = [];
  const VARIES_PARENTS = new Set(Object.values(SUBTABLES).map(s => s.parent));
  // A magic item listed in the gear table; canonical entry lives in
  // magic_items.json ("Potions of Healing") — see SCOPE NOTES.
  const DROPPED = new Set(['Potion of Healing']);
  for (const [name, { weight, cost }] of tableRows) {
    if (VARIES_PARENTS.has(name) || DROPPED.has(name)) continue; // expanded / reconciled
    const p = proseFor(name);
    const description = p && p.rows.length ? reflowProse(p.rows) : null;
    const item = {
      name,
      category: /Pack$/.test(name) ? 'Equipment Pack' : 'Adventuring Gear',
      cost,
      weight: parseWeight(weight),
      description,
      properties: [],
    };
    if (item.category === 'Equipment Pack') {
      if (!description) fail(`pack ${name} has no contents prose`);
      item.contents = parsePackContents(name, description);
      packs.push(item);
    } else {
      gear.push(item);
    }
  }
  if (tableRows.size < 50) fail(`only ${tableRows.size} gear table rows parsed`);

  // Variant sub-tables → concrete items.
  for (const [title, rows] of subTables) {
    const { parent } = SUBTABLES[title];
    const parentProse = proseByName.get(parent);
    const parentDesc = parentProse && parentProse.rows.length ? reflowProse(parentProse.rows) : null;
    for (const cells of rows) {
      if (title === 'Ammunition') {
        const [type, amount, storage, weight, cost] = cells;
        gear.push({
          name: `${type} (${amount})`,
          category: 'Ammunition',
          cost,
          weight: parseWeight(weight),
          description: `Sold in groups of ${amount}, typically stored in a ${storage.toLowerCase()}.`,
          properties: [],
        });
      } else {
        const [form, weight, cost] = cells;
        gear.push({
          name: `${parent} (${form.replace(/\s*\(also a Quarterstaff\)/, '')})`,
          category: parent,
          cost,
          weight: parseWeight(weight),
          description: parentDesc,
          properties: [],
        });
      }
    }
  }

  // Resolve pack contents against the full extracted name set.
  const equipment = [
    ...weapons,
    ...armor,
    ...tools,
    ...gear,
    ...packs,
    ...mounts,
    ...lifestyles,
    ...food,
    ...services,
  ];
  // Index canonical names, plus the comma-swapped natural form the prose uses
  // ("Case, Map or Scroll" is referenced as "Map or Scroll Case").
  const lower = new Map();
  for (const i of equipment) {
    lower.set(i.name.toLowerCase(), i.name);
    const m = i.name.match(/^(.+), (.+)$/);
    if (m) lower.set(`${m[2]} ${m[1]}`.toLowerCase(), i.name);
  }
  for (const pack of packs) {
    pack.contents = pack.contents.map(({ name, quantity }) => {
      const aliased = COMPONENT_ALIASES[name] ?? name;
      const singular = aliased.replace(/s$/, '');
      const resolved =
        lower.get(aliased.toLowerCase()) ?? lower.get(singular.toLowerCase());
      if (!resolved) fail(`pack ${pack.name}: component "${name}" does not resolve to an item`);
      return { name: resolved, quantity };
    });
  }

  // No duplicate names within the file.
  const seen = new Set();
  for (const i of equipment) {
    if (seen.has(i.name)) fail(`duplicate item name "${i.name}"`);
    seen.add(i.name);
  }

  const counts = {};
  for (const i of equipment) counts[i.category] = (counts[i.category] ?? 0) + 1;
  console.log(`Extracted ${equipment.length} equipment items:`);
  for (const [cat, n] of Object.entries(counts)) console.log(`  ${cat}: ${n}`);

  if (process.argv.includes('--stats')) return;

  let out = JSON.stringify({ equipment }, null, 2);
  if (!out.endsWith('\n')) out += '\n';
  fs.writeFileSync(OUT, out);
  console.log(`-> ${path.relative(ROOT, OUT)}`);
}

main();
