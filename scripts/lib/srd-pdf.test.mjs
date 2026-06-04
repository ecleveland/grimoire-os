/**
 * Unit tests for the shared SRD PDF extraction core (VEG-270).
 * Run: node --test scripts/lib/srd-pdf.test.mjs
 *
 * These cover the pure, deterministic helpers. The end-to-end column
 * linearization is regression-tested by re-running scripts/extract-srd-monsters.mjs
 * and asserting byte-identical monsters.json output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWords,
  linearizeColumns,
  joinHyphenatedLines,
  splitColumns,
  reconstructTable,
  tableToMarkdown,
  SRD_PAGE_FURNITURE,
} from './srd-pdf.mjs';

const page = words =>
  `<page width="595" height="842">${words
    .map(
      w =>
        `<word xMin="${w.x}" yMin="${w.y}" xMax="${w.x + 10}" yMax="${w.y + 8}">${w.t}</word>`
    )
    .join('')}</page>`;

test('extractWords decodes entities and tags page index', () => {
  const xml = page([{ x: 10, y: 20, t: 'Tooth &amp; Claw' }]) + page([{ x: 5, y: 5, t: 'Next' }]);
  const words = extractWords(xml);
  assert.equal(words.length, 2);
  assert.deepEqual(
    { page: words[0].page, x: words[0].x, text: words[0].text },
    { page: 0, x: 10, text: 'Tooth & Claw' }
  );
  assert.equal(words[1].page, 1);
});

test('linearizeColumns reads left column fully before right column', () => {
  // Left column (x<297) has two stacked lines; right column (x>=297) has one.
  const xml = page([
    { x: 50, y: 100, t: 'Left-A' },
    { x: 50, y: 120, t: 'Left-B' },
    { x: 320, y: 100, t: 'Right-A' },
  ]);
  assert.deepEqual(linearizeColumns(xml), ['Left-A', 'Left-B', 'Right-A']);
});

test('linearizeColumns groups words within y-tolerance onto one line, left-to-right', () => {
  const xml = page([
    { x: 80, y: 100, t: 'world' },
    { x: 50, y: 102, t: 'Hello' }, // within yTol(4) of 100 → same line, sorted by x
  ]);
  assert.deepEqual(linearizeColumns(xml), ['Hello world']);
});

test('SRD_PAGE_FURNITURE drops running headers and bare page numbers', () => {
  assert.equal(SRD_PAGE_FURNITURE('System Reference Document 5.2.1'), true);
  assert.equal(SRD_PAGE_FURNITURE('42 System Reference Document 5.2.1'), true);
  assert.equal(SRD_PAGE_FURNITURE('  17  '), true);
  assert.equal(SRD_PAGE_FURNITURE('Aboleth'), false);
});

test('linearizeColumns drops page furniture by default but keeps it when disabled', () => {
  const xml = page([
    { x: 50, y: 100, t: 'Goblin' },
    { x: 50, y: 820, t: '12' }, // bare page number
  ]);
  assert.deepEqual(linearizeColumns(xml), ['Goblin']);
  assert.deepEqual(linearizeColumns(xml, { dropLine: () => false }).sort(), ['12', 'Goblin']);
});

test('joinHyphenatedLines resolves soft word-breaks and dimension compounds', () => {
  assert.equal(joinHyphenatedLines(['sur-', 'rounded']), 'surrounded');
  assert.equal(joinHyphenatedLines(['a 5-foot-', 'wide line']), 'a 5-foot-wide line');
  assert.equal(joinHyphenatedLines(['first line', 'second line']), 'first line second line');
});

test('splitColumns splits on wide whitespace gaps', () => {
  assert.deepEqual(splitColumns('1     Acid              Pearl'), ['1', 'Acid', 'Pearl']);
});

test('splitColumns splits on pipe delimiters', () => {
  assert.deepEqual(splitColumns('Stage | Condition'), ['Stage', 'Condition']);
});

test('reconstructTable rebuilds a wide-column region into header + rows', () => {
  // The exact flattened soup the guard flags on "Ring of Resistance".
  const lines = [
    '1d10   Damage Type       Gemstone',
    '1     Acid              Pearl',
    '2     Cold              Tourmaline',
    '3     Fire              Garnet',
  ];
  const table = reconstructTable(lines, { name: 'Ring of Resistance' });
  assert.equal(table.name, 'Ring of Resistance');
  assert.deepEqual(table.columns, ['1d10', 'Damage Type', 'Gemstone']);
  assert.deepEqual(table.rows[0], ['1', 'Acid', 'Pearl']);
  assert.equal(table.rows.length, 3);
});

test('reconstructTable rebuilds pipe-delimited rows', () => {
  const table = reconstructTable(['Stage | Condition', '1 | Heat wave', '2 | Hot']);
  assert.deepEqual(table.columns, ['Stage', 'Condition']);
  assert.deepEqual(table.rows, [['1', 'Heat wave'], ['2', 'Hot']]);
});

test('reconstructTable returns null for non-tabular prose', () => {
  assert.equal(reconstructTable(['Just a single sentence of prose.']), null);
  assert.equal(reconstructTable([]), null);
});

test('reconstructTable drops rows whose width differs from the modal width', () => {
  const table = reconstructTable([
    'A     B     C',
    '1     2     3',
    'a stray full-width sentence with no aligned columns at all here',
    '4     5     6',
  ]);
  assert.deepEqual(table.columns, ['A', 'B', 'C']);
  assert.equal(table.rows.length, 2);
});

test('tableToMarkdown renders GitHub-flavored markdown', () => {
  const md = tableToMarkdown({ columns: ['Dragon', 'Damage'], rows: [['Black', 'Acid']] });
  assert.equal(md, '| Dragon | Damage |\n| --- | --- |\n| Black | Acid |');
});
