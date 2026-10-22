#!/usr/bin/env node
/**
 * Extract every class and subclass, with full feature text, from the SRD 5.2.1
 * PDF into docs/extracted-srd-json/classes.json and subclasses.json (VEG-619).
 *
 * WHY WORD LEVEL
 * --------------
 * linearizeColumns flattens each line to a string, and the facts this chapter
 * needs are positional. A paragraph starts at an 8pt indent. A bold run-in
 * head, an italic spell name, a `Level N:` heading and a table cell differ
 * only in font, which `pdftotext -bbox` exposes as the word's box height
 * (see FONT). And the class Features table runs across both columns, so a
 * column split would cut its cells in half. So this script works on the
 * bbox words from scripts/lib/srd-pdf.mjs and groups them itself.
 *
 * PIPELINE
 *   1. Cut each class's Features table out of its page by bbox and rebuild it
 *      row by row (parseFeaturesTable).
 *   2. Cut the two boxed sidebars out by font and render them on their own.
 *   3. Group the remaining words into lines per page and column, then split
 *      the chapter into classes, their `Level N:` sections, option lists,
 *      spell lists (skipped) and subclasses.
 *   4. Flow each section's lines into markdown paragraphs, splicing the
 *      in-feature tables from the curated TABLES below.
 *   5. Emit one feature row per named cell of the Features table.
 *
 * REQUIREMENTS: `pdftotext` (poppler). macOS: `brew install poppler`.
 * USAGE: node scripts/extract-srd-classes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  bboxLayout,
  extractWords,
  wordsToCellRows,
  COLUMN_SPLIT_X,
  LINE_Y_TOLERANCE,
} from './lib/srd-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(ROOT, 'resources', 'SRD_CC_v5.2.1.pdf');
const OUT_DIR = path.join(ROOT, 'docs', 'extracted-srd-json');

export const CLASS_NAMES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

// Word box heights (yMax - y, to one decimal) for each font in the chapter.
// pdftotext reports the body font's box as 34.1 on every page, an artifact of
// the font's metrics, but the value is constant so it still tells fonts apart.
export const FONT = {
  BODY: 34.1,
  BOLD: 13.5,
  ITALIC: 13.3,
  HEADING: 14.3,
  SECTION: 16.7,
  TABLE_TITLE: 12.5,
  TABLE: 11.0,
  TABLE_SMALL: 10.8,
  CLASS: 21.5,
  CHAPTER: 31.0,
  SIDEBAR: 10.4,
  SIDEBAR_ITALIC: 10.3,
  SIDEBAR_TITLE: 11.9,
  DROP_CAP: 17.0,
  PAGE_NUMBER: 13.1,
  FOOTER: 12.7,
};

export const fontOf = w => +(w.yMax - w.y).toFixed(1);
const isFont = (w, ...fonts) => fonts.includes(fontOf(w));
const TABLE_FONTS = [FONT.TABLE, FONT.TABLE_SMALL, FONT.TABLE_TITLE];
const SIDEBAR_FONTS = [FONT.SIDEBAR, FONT.SIDEBAR_ITALIC, FONT.SIDEBAR_TITLE, FONT.DROP_CAP];

// ── Lines ──────────────────────────────────────────────────────────────────
// Group words into lines by y-proximity, keeping the words. Each line reports
// its first word's x and font height, which is what classifies it.
export function groupLines(words, { yTol = LINE_Y_TOLERANCE } = {}) {
  const sorted = words.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const w of sorted) {
    if (cur && Math.abs(w.y - cur.y) <= yTol) {
      cur.words.push(w);
      cur.y = (cur.y * (cur.words.length - 1) + w.y) / cur.words.length;
    } else {
      cur = { y: w.y, words: [w] };
      lines.push(cur);
    }
  }
  return lines.map(l => {
    const ws = l.words.sort((a, b) => a.x - b.x);
    return {
      page: ws[0].page,
      y: l.y,
      x: ws[0].x,
      h: fontOf(ws[0]),
      words: ws,
      text: ws
        .map(w => w.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    };
  });
}

const lineIsAll = (line, ...fonts) => line.words.every(w => isFont(w, ...fonts));

// ── Re-flow ────────────────────────────────────────────────────────────────
// Join a wrapped PDF line `b` onto the text so far `a`. A line-end hyphen after
// a letter is ambiguous: "ex-"+"pended" is a soft break, "higher-"+"level" is
// a real compound. `isWord` answers from the words the PDF prints mid-line,
// so the hyphen stays only when the hyphenated form is the one the SRD uses.
export function joinWrapped(a, b, isWord) {
  if (/­$/.test(a)) return a.slice(0, -1) + b;
  if (/[—–]$/.test(a)) return a + b;
  const m = a.match(/(\S+)-$/);
  if (!m) return `${a} ${b}`;
  const leftTok = m[1];
  if (/\d+-(foot|feet|mile)$/i.test(leftTok)) return a + b;
  if (!/[A-Za-z]$/.test(leftTok)) return a + b;
  const left = leftTok.split('-').pop().replace(/^[^A-Za-z]+/, '');
  const right = (b.match(/^[A-Za-z’']+/) || [''])[0];
  const solid = (left + right).toLowerCase();
  const hyphenated = `${left}-${right}`.toLowerCase();
  if (isWord(hyphenated) && !isWord(solid)) return a + b;
  if (isWord(solid)) return a.slice(0, -1) + b;
  if (/^[A-Z0-9]/.test(b)) return a + b;
  return a.slice(0, -1) + b;
}

// The set of words the PDF prints mid-line, lowercased, for joinWrapped.
export function buildCorpus(words) {
  const set = new Set();
  for (const w of words) {
    const t = w.text
      .toLowerCase()
      .replace(/^[^a-z’']+/, '')
      .replace(/[^a-z’']+$/, '');
    if (t) set.add(t);
  }
  return t => set.has(t);
}

// Flow lines into blocks. Each line carries `edge`, its column's body x. A
// paragraph starts at an indent of about 8pt, at a bullet, at a bold run-in
// head, or at a flush line that follows a bullet. A bullet's wrapped lines hang
// 11.5pt in. Anything else continues the current block.
//
// Bold also marks stat-block names inside a sentence ("Imp, Pseudodragon,
// Quasit,"), and some run-in heads sit at the column edge rather than at the
// indent (Wild Shape's "Temporary Hit Points."). So a bold run opens a head
// only when it ends in a full stop or colon, and either the line is indented
// or the paragraph before it has finished its sentence.
export function flowParagraphs(lines, { isWord }) {
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const dx = line.x - line.edge;
    const [first] = line.words;
    if (line.text.startsWith('•')) {
      cur = { kind: 'li', text: line.text.replace(/^•\s*/, '') };
      blocks.push(cur);
      continue;
    }
    if (isFont(first, FONT.BOLD)) {
      const n = line.words.findIndex(w => !isFont(w, FONT.BOLD));
      const headWords = n === -1 ? line.words : line.words.slice(0, n);
      const rest = n === -1 ? '' : line.words.slice(n).map(w => w.text).join(' ');
      const head = headWords.map(w => w.text).join(' ');
      const sentenceDone = !cur || cur.kind !== 'p' || /[.:!?”)]$/.test(cur.text);
      if (cur && cur.head !== undefined && cur.text === '' && !/[.:]$/.test(cur.head)) {
        cur.head = joinWrapped(cur.head, head, isWord); // a head that wraps
        cur.text = rest;
        continue;
      }
      if ((n === -1 || /[.:]$/.test(head)) && (dx > 4 || sentenceDone)) {
        cur = { kind: 'p', head, text: rest };
        blocks.push(cur);
        continue;
      }
    }
    if (cur && cur.kind === 'li' && dx > 10) {
      cur.text = joinWrapped(cur.text, line.text, isWord);
    } else if (!cur || cur.kind !== 'p' || dx > 4) {
      cur = { kind: 'p', text: line.text };
      blocks.push(cur);
    } else {
      cur.text = cur.text === '' ? line.text : joinWrapped(cur.text, line.text, isWord);
    }
  }
  for (const b of blocks) {
    b.text = b.text.replace(/­/g, '').replace(/\s+/g, ' ').trim();
    if (b.head === undefined) delete b.head;
  }
  return blocks;
}

// Render blocks as markdown. Bullets in a run sit on consecutive lines; every
// other boundary is a blank line. `md` blocks pass through untouched.
export function blocksToMarkdown(blocks) {
  let out = '';
  let prev = null;
  for (const b of blocks) {
    let s;
    if (b.kind === 'li') s = `- ${b.text}`;
    else if (b.kind === 'md') s = b.md;
    else if (b.head !== undefined) s = b.text ? `**${b.head}** ${b.text}` : `**${b.head}**`;
    else s = b.text;
    if (prev) out += prev.kind === 'li' && b.kind === 'li' ? '\n' : '\n\n';
    out += s;
    prev = b;
  }
  return out;
}

// ── The class Features table ───────────────────────────────────────────────
// Rebuild the table from its words: title, header rows, then one row per level
// with the Class Features cell, and side columns (Rages, Spell Slots, …) to the
// right. Cells go to columns by x against the header. A row whose first cell
// isn't a level number is the Class Features cell wrapping, so it appends to
// the row before it.
export function parseFeaturesTable(words) {
  const body = words.filter(w => !isFont(w, FONT.TABLE_TITLE));
  const rows = wordsToCellRows(body, { minGap: 8 });
  const isLevelRow = r => /^\d+$/.test(r.cells[0].text);
  const firstData = rows.findIndex(isLevelRow);
  if (firstData < 1) throw new Error('Features table: no header row before the level rows');
  const headerWords = body.filter(w => w.y < rows[firstData].y - LINE_Y_TOLERANCE);
  const nextFeatures = c => headerWords.find(v => v.text === 'Features' && v.x > c.x && v.x - c.xMax < 10);
  const classWord = headerWords.find(w => w.text === 'Class' && nextFeatures(w));
  if (!classWord) throw new Error('Features table: no "Class Features" header');
  const featuresWord = nextFeatures(classWord);
  const sideStart = Math.min(
    Infinity,
    ...headerWords.filter(w => w.x > featuresWord.xMax).map(w => w.x)
  );
  const featX = classWord.x - 5;

  const featureCells = (row, from) => {
    const cells = row.cells.slice(from);
    for (const c of cells) {
      if (c.x < sideStart && c.xMax > sideStart) {
        throw new Error(`Features table: cell "${c.text}" crosses the side-column edge at x ${sideStart}`);
      }
    }
    return cells.filter(c => c.x < sideStart).map(c => c.text);
  };

  const out = [];
  for (const row of rows.slice(firstData)) {
    if (isLevelRow(row)) {
      const pb = row.cells[1] && row.cells[1].text.match(/^\+(\d+)$/);
      if (!pb) throw new Error(`Features table: level ${row.cells[0].text} has no proficiency bonus`);
      out.push({
        level: Number(row.cells[0].text),
        proficiencyBonus: Number(pb[1]),
        cell: featureCells(row, 2).join(' '),
      });
    } else {
      if (!out.length) throw new Error(`Features table: continuation "${row.cells[0].text}" before any level row`);
      if (row.cells[0].x < featX) {
        throw new Error(`Features table: stray row "${row.cells.map(c => c.text).join(' | ')}"`);
      }
      const prev = out[out.length - 1];
      prev.cell = `${prev.cell} ${featureCells(row, 0).join(' ')}`.trim();
    }
  }
  return out;
}

// Split a Class Features cell into feature names on commas outside parentheses.
export function splitFeatureCell(cell) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of cell) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(s => s && s !== '—');
}

// "Mystic Arcanum (level 6 spell)" -> "Mystic Arcanum".
export const normalizeCellName = name => name.replace(/\s*\([^()]*\)$/, '').trim();

// ── Level sections ─────────────────────────────────────────────────────────
const LEVEL_RE = /^Level (\d+): (.+)$/;

// Split lines on `Level N: Name` headings. A heading must be in the heading
// font: prose says "Level 5+ Warlock" mid-sentence, and a body-font line that
// reads like a heading means the font table above is wrong, so it throws.
export function splitLevelSections(lines) {
  const intro = [];
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = line.text.match(LEVEL_RE);
    const heading = isFont(line.words[0], FONT.HEADING);
    if (m) {
      if (!heading) throw new Error(`"${line.text}" reads like a heading but is in the body font (page ${line.page})`);
      cur = { level: Number(m[1]), name: m[2].trim(), lines: [] };
      sections.push(cur);
    } else if (heading && cur && cur.lines.length === 0) {
      cur.name = `${cur.name} ${line.text}`; // a heading that wraps
    } else if (cur) cur.lines.push(line);
    else intro.push(line);
  }
  return { intro, sections };
}

// ── Curated in-feature tables ──────────────────────────────────────────────
// Each run of table-font lines inside a section is replaced, in order, by the
// next entry for that section, keyed `<Class or Subclass>/<Feature>`. `first`
// must equal the run's first line, so a layout change fails loudly. `md: null`
// drops a run that only continues the previous table (a table split across
// columns). Authored from the PDF text.
const md = (title, columns, rows) =>
  [
    `**${title}**`,
    '',
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.join(' | ')} |`),
  ].join('\n');

const landTable = (land, rows) => md(land, ['Druid Level', 'Circle Spells'], rows);

export const TABLES = {
  'Druid/Wild Shape': [
    {
      first: 'Beast Shapes',
      md: md(
        'Beast Shapes',
        ['Druid Level', 'Known Forms', 'Max CR', 'Fly Speed'],
        [
          ['2', '4', '1/4', 'No'],
          ['4', '6', '1/2', 'No'],
          ['8', '8', '1', 'Yes'],
        ]
      ),
    },
  ],
  'Sorcerer/Font of Magic': [
    {
      first: 'Creating Spell Slots',
      md: md(
        'Creating Spell Slots',
        ['Spell Slot Level', 'Sorcery Point Cost', 'Min. Sorcerer Level'],
        [
          ['1', '2', '2'],
          ['2', '3', '3'],
          ['3', '5', '5'],
          ['4', '6', '7'],
          ['5', '7', '9'],
        ]
      ),
    },
  ],
  'Life Domain/Life Domain Spells': [
    {
      first: 'Life Domain Spells',
      md: md(
        'Life Domain Spells',
        ['Cleric Level', 'Prepared Spells'],
        [
          ['3', 'Aid, Bless, Cure Wounds, Lesser Restoration'],
          ['5', 'Mass Healing Word, Revivify'],
          ['7', 'Aura of Life, Death Ward'],
          ['9', 'Greater Restoration, Mass Cure Wounds'],
        ]
      ),
    },
  ],
  'Circle of the Land/Circle of the Land Spells': [
    {
      first: 'Arid Land',
      md: [
        landTable('Arid Land', [
          ['3', 'Blur, Burning Hands, Fire Bolt'],
          ['5', 'Fireball'],
          ['7', 'Blight'],
          ['9', 'Wall of Stone'],
        ]),
        landTable('Polar Land', [
          ['3', 'Fog Cloud, Hold Person, Ray of Frost'],
          ['5', 'Sleet Storm'],
          ['7', 'Ice Storm'],
          ['9', 'Cone of Cold'],
        ]),
        landTable('Temperate Land', [
          ['3', 'Misty Step, Shocking Grasp, Sleep'],
          ['5', 'Lightning Bolt'],
          ['7', 'Freedom of Movement'],
          ['9', 'Tree Stride'],
        ]),
        landTable('Tropical Land', [
          ['3', 'Acid Splash, Ray of Sickness, Web'],
          ['5', 'Stinking Cloud'],
          ['7', 'Polymorph'],
          ['9', 'Insect Plague'],
        ]),
      ].join('\n\n'),
    },
  ],
  // The PDF prints this two-column table twice side by side; one column pair
  // reads the same in markdown.
  'Circle of the Land/Nature’s Ward': [
    {
      first: 'Nature’s Ward',
      md: md(
        'Nature’s Ward',
        ['Land Type', 'Resistance'],
        [
          ['Arid', 'Fire'],
          ['Polar', 'Cold'],
          ['Temperate', 'Lightning'],
          ['Tropical', 'Poison'],
        ]
      ),
    },
  ],
  'Oath of Devotion/Oath of Devotion Spells': [
    {
      first: 'Oath of Devotion Spells',
      md: md(
        'Oath of Devotion Spells',
        ['Paladin Level', 'Spells'],
        [
          ['3', 'Protection from Evil and Good, Shield of Faith'],
          ['5', 'Aid, Zone of Truth'],
          ['9', 'Beacon of Hope, Dispel Magic'],
          ['13', 'Freedom of Movement, Guardian of Faith'],
          ['17', 'Commune, Flame Strike'],
        ]
      ),
    },
  ],
  'Draconic Sorcery/Draconic Spells': [
    {
      first: 'Draconic Spells',
      md: md(
        'Draconic Spells',
        ['Sorcerer Level', 'Spells'],
        [
          ['3', 'Alter Self, Chromatic Orb, Command, Dragon’s Breath'],
          ['5', 'Fear, Fly'],
          ['7', 'Arcane Eye, Charm Monster'],
          ['9', 'Legend Lore, Summon Dragon'],
        ]
      ),
    },
  ],
  'Fiend Patron/Fiend Spells': [
    {
      first: 'Fiend Spells',
      md: md(
        'Fiend Spells',
        ['Warlock Level', 'Spells'],
        [
          ['3', 'Burning Hands, Command, Scorching Ray, Suggestion'],
          ['5', 'Fireball, Stinking Cloud'],
          ['7', 'Fire Shield, Wall of Fire'],
          ['9', 'Geas, Insect Plague'],
        ]
      ),
    },
  ],
};

// ── Sidebars ───────────────────────────────────────────────────────────────
// The two boxed sidebars use one small font for prose and run-in heads alike,
// so their heads are listed here. Each sidebar is appended to the feature named.
const SIDEBARS = {
  'Breaking Your Oath': { owner: 'Paladin', feature: 'Paladin Subclass', heads: [] },
  'Expanding and Replacing a Spellbook': {
    owner: 'Wizard',
    feature: 'Spellcasting',
    heads: ['Copying a Spell into the Book.', 'Copying the Book.'],
  },
};

function renderSidebar(words, isWord) {
  const lines = groupLines(words);
  const [titleLine, ...rest] = lines;
  // A drop cap is its own word: "E" + "xpanding" -> "Expanding".
  let title = '';
  titleLine.words.forEach((w, i) => {
    const prev = titleLine.words[i - 1];
    title += prev && isFont(prev, FONT.DROP_CAP) && w.x - prev.xMax < 3 ? w.text : (title ? ' ' : '') + w.text;
  });
  const spec = SIDEBARS[title];
  if (!spec) throw new Error(`Unknown sidebar "${title}"`);
  const edge = modalX(rest);
  const blocks = flowParagraphs(
    rest.map(l => ({ ...l, edge })),
    { isWord }
  );
  for (const b of blocks) {
    const head = spec.heads.find(h => b.text.startsWith(`${h} `));
    if (head) {
      b.head = head;
      b.text = b.text.slice(head.length + 1);
    }
  }
  return { title, ...spec, md: `**${title}**\n\n${blocksToMarkdown(blocks)}` };
}

// ── Page layout ────────────────────────────────────────────────────────────
function modalX(lines) {
  const counts = new Map();
  for (const l of lines) {
    const x = Math.round(l.x * 2) / 2;
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [x, c] of counts) {
    if (c > bestCount || (c === bestCount && x < best)) {
      best = x;
      bestCount = c;
    }
  }
  return best;
}

// Find each class's Features table by its title, take every word on that page
// from the title down to the level-20 row (plus any wrapped line under it),
// check they are all table text, and return them grouped by class.
function cutFeaturesTables(words) {
  const tables = new Map();
  const cut = new Set();
  for (const name of CLASS_NAMES) {
    const title = words.find(
      (w, i) =>
        w.text === name &&
        isFont(w, FONT.TABLE_TITLE) &&
        words[i + 1]?.text === 'Features' &&
        Math.abs(words[i + 1].y - w.y) < 1
    );
    if (!title) throw new Error(`${name}: Features table title not found`);
    const pageWords = words.filter(w => w.page === title.page && w.y >= title.y - 1);
    const rows = wordsToCellRows(pageWords.filter(w => isFont(w, ...TABLE_FONTS)), { minGap: 8 });
    const r20 = rows.findIndex(r => r.cells[0].text === '20' && /^\+\d$/.test(r.cells[1]?.text ?? ''));
    if (r20 === -1) throw new Error(`${name}: Features table has no level 20 row on page ${title.page}`);
    let bottom = rows[r20].y;
    for (const r of rows.slice(r20 + 1)) {
      if (r.y - bottom > 16 || /^\d+$/.test(r.cells[0].text)) break;
      bottom = r.y;
    }
    const region = pageWords.filter(w => w.y <= bottom + LINE_Y_TOLERANCE);
    const stray = region.filter(w => !isFont(w, ...TABLE_FONTS));
    if (stray.length) {
      throw new Error(`${name}: non-table words inside the Features table: ${stray.map(w => w.text).join(' ')}`);
    }
    region.forEach(w => cut.add(w));
    tables.set(name, parseFeaturesTable(region));
  }
  return { tables, rest: words.filter(w => !cut.has(w)) };
}

// Group the chapter's words into lines per page and column, each tagged with
// its column's body edge, measured as the modal x of that column's body lines.
function chapterLines(words) {
  const byPage = new Map();
  for (const w of words) {
    if (!byPage.has(w.page)) byPage.set(w.page, []);
    byPage.get(w.page).push(w);
  }
  const out = [];
  const defaultEdge = [63, 313.5];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pw = byPage.get(page);
    for (const [col, inCol] of [
      [0, w => w.x < COLUMN_SPLIT_X],
      [1, w => w.x >= COLUMN_SPLIT_X],
    ]) {
      const lines = groupLines(pw.filter(inCol));
      const body = lines.filter(l => l.h === FONT.BODY);
      const edge = body.length >= 5 ? modalX(body) : defaultEdge[col];
      for (const l of lines) out.push({ ...l, col, edge });
    }
  }
  return out;
}

// ── Section rendering ──────────────────────────────────────────────────────
// Render a section's lines as markdown, splicing curated tables over each run
// of table-font lines. Unknown runs are collected in `problems` so one run of
// the script reports every table that still needs curating.
function renderLines(key, lines, ctx) {
  const tables = (TABLES[key] ?? []).slice();
  const blocks = [];
  let i = 0;
  let prose = [];
  const flush = () => {
    if (prose.length) blocks.push(...flowParagraphs(prose, ctx));
    prose = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (lineIsAll(line, ...TABLE_FONTS)) {
      let j = i;
      while (j < lines.length && lineIsAll(lines[j], ...TABLE_FONTS)) j++;
      const run = lines.slice(i, j);
      const entry = tables.shift();
      if (!entry || entry.first !== run[0].text) {
        ctx.problems.push(
          `${key}: uncurated table run (expected ${entry ? `"${entry.first}"` : 'none'}):\n    ${run
            .map(l => l.text)
            .join('\n    ')}`
        );
      } else if (entry.md !== null) {
        flush();
        blocks.push({ kind: 'md', md: entry.md });
      }
      i = j;
      continue;
    }
    if (![FONT.BODY, FONT.BOLD, FONT.ITALIC].includes(line.h)) {
      ctx.problems.push(`${key}: unexpected line in font ${line.h}: "${line.text}"`);
    }
    prose.push(line);
    i++;
  }
  flush();
  if (tables.length) ctx.problems.push(`${key}: curated tables never matched: ${tables.map(t => t.first).join(', ')}`);
  return blocksToMarkdown(blocks);
}

// An options section (Metamagic Options, Eldritch Invocation Options): an
// intro, then entries headed by a name in the heading font, an optional italic
// Prerequisite or Cost line that may wrap, and the entry's text.
function renderOptions(ownerKey, lines, ctx) {
  const entries = [];
  let cur = null;
  for (const line of lines) {
    if (line.h === FONT.HEADING) {
      cur = { name: line.text, meta: [], lines: [] };
      entries.push(cur);
    } else if (!cur) continue; // the section's intro sentence
    else if (
      cur.lines.length === 0 &&
      lineIsAll(line, FONT.ITALIC) &&
      (cur.meta.length > 0 || /^(Prerequisite|Cost):/.test(line.text))
    ) {
      cur.meta.push(line.text);
    } else cur.lines.push(line);
  }
  return entries.map(e => {
    const meta = e.meta.reduce((acc, t) => (acc ? joinWrapped(acc, t, ctx.isWord) : t), '');
    const body = renderLines(`${ownerKey}/${e.name}`, e.lines, ctx);
    return [`**${e.name}**`, meta, body].filter(Boolean).join('\n\n');
  });
}

// ── Chapter structure ──────────────────────────────────────────────────────
const OPTIONS_FEATURE = {
  'Metamagic Options': 'Metamagic',
  'Eldritch Invocation Options': 'Eldritch Invocations',
};

function parseChapter(lines, ctx) {
  const start = lines.findIndex(l => l.h === FONT.CHAPTER && l.text === 'Classes');
  const end = lines.findIndex(l => l.h === FONT.CHAPTER && l.text === 'Character Origins');
  if (start === -1 || end === -1) throw new Error('Classes chapter bounds not found');
  const chapter = lines.slice(start + 1, end);

  const starts = [];
  chapter.forEach((l, i) => {
    if (l.h === FONT.CLASS && CLASS_NAMES.includes(l.text)) {
      if (chapter[i + 1]?.text !== `Core ${l.text} Traits`) {
        throw new Error(`Class title "${l.text}" is not followed by its Core Traits table`);
      }
      starts.push(i);
    }
  });
  const names = starts.map(i => chapter[i].text);
  if (names.join() !== CLASS_NAMES.join()) throw new Error(`Classes out of order: ${names.join(', ')}`);

  return starts.map((s, k) => {
    const name = chapter[s].text;
    const block = chapter.slice(s, starts[k + 1] ?? chapter.length);
    // Merge wrapped section titles ("Barbarian Subclass:" / "Path of the Berserker").
    const sections = [];
    block.forEach((l, i) => {
      if (l.h !== FONT.SECTION) return;
      const prev = sections[sections.length - 1];
      if (prev && prev.end === i) {
        prev.text = `${prev.text} ${l.text}`;
        prev.end = i + 1;
      } else sections.push({ text: l.text, start: i, end: i + 1 });
    });
    const sectionLines = sec => {
      const next = sections[sections.indexOf(sec) + 1];
      return block.slice(sec.end, next ? next.start : block.length);
    };
    const find = pred => sections.find(sec => pred(sec.text));
    const featuresSec = find(t => t === `${name} Class Features`);
    const subclassSec = find(t => t.startsWith(`${name} Subclass: `));
    if (!featuresSec || !subclassSec) throw new Error(`${name}: Class Features or Subclass section missing`);
    const known = sec =>
      sec === featuresSec ||
      sec === subclassSec ||
      sec.text === `${name} Spell List` ||
      sec.text in OPTIONS_FEATURE ||
      sections.indexOf(sec) < sections.indexOf(featuresSec);
    for (const sec of sections) {
      if (!known(sec)) throw new Error(`${name}: unexpected section "${sec.text}"`);
    }
    const options = sections.filter(sec => sec.text in OPTIONS_FEATURE);
    return {
      name,
      features: splitLevelSections(sectionLines(featuresSec)),
      options: options.map(sec => ({ title: sec.text, lines: sectionLines(sec) })),
      subclass: { name: subclassSec.text.slice(`${name} Subclass: `.length), ...splitLevelSections(sectionLines(subclassSec)) },
    };
  });
}

// Subclass description: the italic tagline, then the flavor paragraphs that
// precede the first `Level N:` heading.
function subclassDescription(sub, ctx) {
  const [tag, ...rest] = sub.intro;
  if (!tag || !lineIsAll(tag, FONT.ITALIC)) throw new Error(`${sub.name}: no italic tagline`);
  let tagline = tag.text;
  let i = 0;
  while (rest[i] && lineIsAll(rest[i], FONT.ITALIC) && rest[i].x - rest[i].edge < 4) {
    tagline = joinWrapped(tagline, rest[i].text, ctx.isWord);
    i++;
  }
  return `${tagline}\n\n${renderLines(`${sub.name}/`, rest.slice(i), ctx)}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const allWords = extractWords(bboxLayout(PDF));
  const isWord = buildCorpus(allWords);
  const ctx = { isWord, problems: [] };

  // The chapter opens on the page with the Barbarian class title and ends on
  // the page with the "Character Origins" chapter title. parseChapter trims
  // the line stream to the two chapter titles.
  const firstPage = allWords.find(w => w.text === 'Barbarian' && isFont(w, FONT.CLASS))?.page;
  const lastPage = allWords.find(w => w.text === 'Character' && isFont(w, FONT.CHAPTER) && w.page > firstPage)?.page;
  if (firstPage === undefined || lastPage === undefined) throw new Error('Classes chapter pages not found');
  const words = allWords.filter(
    w => w.page >= firstPage && w.page <= lastPage && !isFont(w, FONT.PAGE_NUMBER, FONT.FOOTER)
  );

  const { tables, rest } = cutFeaturesTables(words);

  // A sidebar opens with a drop cap. Page 83 (Character Origins) reuses the
  // sidebar title font for its own tables, so only drop-cap pages count.
  const sidebarPages = new Set(rest.filter(w => isFont(w, FONT.DROP_CAP)).map(w => w.page));
  const sidebarWords = rest.filter(w => sidebarPages.has(w.page) && isFont(w, ...SIDEBAR_FONTS));
  const sidebars = [...sidebarPages].map(p =>
    renderSidebar(
      sidebarWords.filter(w => w.page === p),
      isWord
    )
  );
  const flowWords = rest.filter(w => !sidebarWords.includes(w));

  const parsed = parseChapter(chapterLines(flowWords), ctx);

  const classes = [];
  const subclasses = [];
  let headingCount = 0;
  for (const cls of parsed) {
    headingCount += cls.features.sections.length + cls.subclass.sections.length;
    const described = cls.features.sections.map(sec => ({
      level: sec.level,
      name: sec.name,
      description: renderLines(`${cls.name}/${sec.name}`, sec.lines, ctx),
    }));
    for (const opt of cls.options) {
      const target = described.find(d => d.name === OPTIONS_FEATURE[opt.title]);
      if (!target) throw new Error(`${cls.name}: no feature for ${opt.title}`);
      target.description += `\n\n**Options**\n\n${renderOptions(cls.name, opt.lines, ctx).join('\n\n')}`;
    }
    for (const sb of sidebars.filter(s => s.owner === cls.name)) {
      const target = described.find(d => d.name === sb.feature);
      if (!target) throw new Error(`${cls.name}: no feature ${sb.feature} for sidebar ${sb.title}`);
      target.description += `\n\n${sb.md}`;
    }
    if (!described.some(d => d.level === 3 && d.name === `${cls.name} Subclass`)) {
      throw new Error(`${cls.name}: no Level 3: ${cls.name} Subclass heading`);
    }

    const rows = tables.get(cls.name);
    if (rows.map(r => r.level).join() !== Array.from({ length: 20 }, (_, i) => i + 1).join()) {
      throw new Error(`${cls.name}: Features table levels are ${rows.map(r => r.level).join(',')}`);
    }
    const features = [];
    const used = new Set();
    for (const row of rows) {
      for (const cellName of splitFeatureCell(row.cell)) {
        if (cellName === 'Subclass feature') continue;
        const name = normalizeCellName(cellName);
        const same = d => d.name.toLowerCase() === name.toLowerCase();
        const match = described.find(d => same(d) && d.level === row.level) ?? described.find(same);
        if (!match) {
          throw new Error(`${cls.name}: level ${row.level} cell "${cellName}" has no Level heading`);
        }
        used.add(match);
        features.push({ name: match.name, level: row.level, description: match.description });
      }
    }
    for (const d of described) {
      if (!used.has(d)) ctx.problems.push(`${cls.name}: heading Level ${d.level}: ${d.name} is not in the Features table`);
    }
    classes.push({
      name: cls.name,
      subclassLevel: 3,
      table: rows.map(r => ({ level: r.level, proficiencyBonus: r.proficiencyBonus, features: splitFeatureCell(r.cell) })),
      features,
    });

    const sub = cls.subclass;
    subclasses.push({
      name: sub.name,
      className: cls.name,
      description: subclassDescription(sub, ctx),
      features: sub.sections.map(sec => ({
        name: sec.name,
        level: sec.level,
        description: renderLines(`${sub.name}/${sec.name}`, sec.lines, ctx),
      })),
    });
  }

  if (ctx.problems.length) {
    throw new Error(`${ctx.problems.length} problems:\n  ${ctx.problems.join('\n  ')}`);
  }
  if (headingCount !== 232) throw new Error(`Expected 232 Level headings, found ${headingCount}`);

  const write = (file, data) => {
    const out = path.join(OUT_DIR, file);
    fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, out)}`);
  };
  write('classes.json', { classes });
  write('subclasses.json', { subclasses });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
