/**
 * Shared column/table-aware extraction core for the SRD 5.2.1 PDF (VEG-270).
 *
 * WHY THIS EXISTS
 * ---------------
 * The SRD is laid out in two snaking columns with embedded option/result tables.
 * A naive `pdftotext` flattens that layout, so every entry absorbs fragments of
 * whatever sat beside or below it — the field-bleed corruption fixed for monsters
 * in VEG-261 and still present in spells.json / magic_items.json. This module
 * lifts the column-aware core out of scripts/extract-srd-monsters.mjs so the
 * spell / magic-item / species data tickets (VEG-271/272/273) build on one
 * extractor instead of re-deriving it three times. The free-text guards in
 * backend/src/seed/srd-json.loader.ts backstop the output.
 *
 * PIPELINE
 *   1. bboxLayout(pdf)         — `pdftotext -bbox-layout` → XML with per-word x/y.
 *   2. extractWords(xml)       — decode that XML into {page,x,y,xMax,yMax,text}.
 *   3. linearizeColumns(xml)   — split words into columns by x, re-order
 *                                page → column → y → x, drop page furniture.
 *   4. joinHyphenatedLines()   — re-flow wrapped lines, resolving soft hyphens.
 *   5. reconstructTable()      — turn a tabular region's lines back into a
 *                                { columns, rows } structure / markdown, instead
 *                                of the interleaved token soup the flat extract
 *                                leaves behind.
 *
 * REQUIREMENTS: `pdftotext` (poppler). macOS: `brew install poppler`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// Gutter x-coordinate splitting the SRD's two columns, and the y-tolerance for
// grouping words onto the same line. Tuned against SRD_CC_v5.2.1.pdf in VEG-261.
export const COLUMN_SPLIT_X = 297;
export const LINE_Y_TOLERANCE = 4;

// ── 1. PDF → bbox XML ──────────────────────────────────────────────────────
export function bboxLayout(pdfPath) {
  if (!fs.existsSync(pdfPath)) throw new Error(`SRD PDF not found at ${pdfPath}`);
  const tmp = path.join(os.tmpdir(), 'srd_bbox.xml');
  execFileSync('pdftotext', ['-bbox-layout', pdfPath, tmp]);
  return fs.readFileSync(tmp, 'utf8');
}

// ── 2. bbox XML → decoded words ────────────────────────────────────────────
const decodeEntities = s =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');

const WORD_RE =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;

// Returns every word in document order, tagged with its 0-based page index.
export function extractWords(xml) {
  const words = [];
  const pages = xml.split(/<page /).slice(1);
  pages.forEach((chunk, page) => {
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(chunk)) !== null) {
      words.push({
        page,
        x: +m[1],
        y: +m[2],
        xMax: +m[3],
        yMax: +m[4],
        text: decodeEntities(m[5]),
      });
    }
  });
  return words;
}

// Group words into text lines by y-proximity, ordering each line left-to-right.
function lineify(words, yTol) {
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
  return lines
    .map(l =>
      l.words
        .sort((a, b) => a.x - b.x)
        .map(w => w.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

// Default page-furniture filter: SRD running headers and bare page numbers.
export const SRD_PAGE_FURNITURE = l =>
  /^\d{1,3} System Reference Document 5\.2\.1$/.test(l) ||
  /^System Reference Document 5\.2\.1$/.test(l) ||
  /^\d{1,3}$/.test(l.trim());

// ── 3. Column-aware linearization ──────────────────────────────────────────
// Splits each page's words into left/right columns at `colSplit`, linearizes the
// snaking reading order (page → column → y → x), and drops lines matched by
// `dropLine` (page furniture by default). Pass `dropLine: () => false` to keep
// every line.
export function linearizeColumns(
  xml,
  { colSplit = COLUMN_SPLIT_X, yTol = LINE_Y_TOLERANCE, dropLine = SRD_PAGE_FURNITURE } = {}
) {
  const byPage = new Map();
  for (const w of extractWords(xml)) {
    if (!byPage.has(w.page)) byPage.set(w.page, []);
    byPage.get(w.page).push(w);
  }
  const out = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pw = byPage.get(page);
    out.push(
      ...lineify(pw.filter(w => w.x < colSplit), yTol),
      ...lineify(pw.filter(w => w.x >= colSplit), yTol)
    );
  }
  return out.filter(l => !dropLine(l));
}

// ── 4. Line re-flow ────────────────────────────────────────────────────────
// Join wrapped PDF lines, resolving end-of-line hyphenation:
//   "sur-"+"rounded" -> "surrounded"; "5-foot-"+"wide" -> "5-foot-wide".
export function joinHyphenatedLines(pieces) {
  let out = '';
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k].trim();
    if (k === 0) {
      out = piece;
      continue;
    }
    const lastTok = (out.match(/(\S+)$/) || ['', ''])[1];
    if (/-$/.test(out)) {
      if (/\d+-(foot|feet|mile)-$/i.test(lastTok)) out += piece; // dimension compound
      else if (/[A-Za-z]-$/.test(out)) out = out.slice(0, -1) + piece; // soft word-break
      else out += piece;
    } else out += ' ' + piece;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ── 5. Two-column table reconstruction ─────────────────────────────────────
// Split a single layout line into cells. `pdftotext -layout` preserves column
// gaps as runs of spaces, and some SRD tables survive as pipe-delimited rows;
// handle both. Cells are trimmed and empties dropped.
export function splitColumns(line, { minGap = 2 } = {}) {
  const trimmed = line.replace(/\s+$/, '').replace(/^\s+/, '');
  const cells = /\s\|\s/.test(trimmed)
    ? trimmed.split(/\s*\|\s*/)
    : trimmed.split(new RegExp(` {${minGap},}`));
  return cells.map(c => c.trim()).filter(Boolean);
}

const modalWidth = widths => {
  const counts = new Map();
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = 0;
  let bestCount = -1;
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && w > best)) {
      best = w;
      bestCount = c;
    }
  }
  return best;
};

// Reconstruct a tabular region (an array of layout lines) into a structured
// table. The first row at the table's modal column-width becomes the header; the
// rest are data rows. Returns null when the lines don't form a ≥2-column,
// ≥2-row grid (i.e. it isn't actually a table). `name` labels the result.
export function reconstructTable(lines, { name = null, minGap = 2 } = {}) {
  const split = lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => splitColumns(l, { minGap }))
    .filter(cells => cells.length >= 2);
  if (split.length < 2) return null;

  const width = modalWidth(split.map(r => r.length));
  if (width < 2) return null;
  const grid = split.filter(r => r.length === width);
  if (grid.length < 2) return null;

  const [columns, ...rows] = grid;
  return { name, columns, rows };
}

// ── 6. Word-level cell rows ────────────────────────────────────────────────
// Group bbox words into lines by y-proximity, then split each line into cells
// wherever the horizontal gap between adjacent words exceeds `minGap` points.
// Unlike splitColumns (which needs `pdftotext -layout` text), this works on the
// bbox words directly, so table cells survive even where linearizeColumns
// would collapse the column gaps to single spaces (VEG-308: the Equipment
// chapter's dense cost/weight/damage tables).
// Returns [{ page, y, cells: [{ x, xMax, text }] }] ordered page → y → x.
export function wordsToCellRows(words, { yTol = LINE_Y_TOLERANCE, minGap = 8 } = {}) {
  const sorted = words.slice().sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const w of sorted) {
    if (cur && w.page === cur.page && Math.abs(w.y - cur.y) <= yTol) cur.words.push(w);
    else {
      cur = { page: w.page, y: w.y, words: [w] };
      lines.push(cur);
    }
  }
  return lines.map(line => {
    const ws = line.words.sort((a, b) => a.x - b.x);
    const cells = [];
    let cell = null;
    for (const w of ws) {
      if (cell && w.x - cell.xMax <= minGap) {
        cell.text += ` ${w.text}`;
        cell.xMax = Math.max(cell.xMax, w.xMax);
      } else {
        cell = { x: w.x, xMax: w.xMax, text: w.text };
        cells.push(cell);
      }
    }
    return { page: line.page, y: line.y, cells };
  });
}

// Render a reconstructed table as GitHub-flavored markdown.
export function tableToMarkdown({ columns, rows }) {
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return [header, sep, body].join('\n');
}
