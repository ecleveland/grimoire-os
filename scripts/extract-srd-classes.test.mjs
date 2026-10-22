/**
 * Unit tests for the SRD class extractor helpers (VEG-619).
 * Run: node --test scripts/
 *
 * Every case builds synthetic bbox words, so no PDF is needed. Word heights
 * stand in for the PDF fonts the way the real extraction reads them: 34.1 body,
 * 13.5 bold run-in head, 13.3 italic, 14.3 `Level N:` heading, 11.0 table text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT,
  groupLines,
  joinWrapped,
  flowParagraphs,
  blocksToMarkdown,
  parseFeaturesTable,
  splitFeatureCell,
  normalizeCellName,
  splitLevelSections,
} from './extract-srd-classes.mjs';

// A bbox word whose width is 5pt per character, so gaps stay predictable.
const word = (x, y, text, h = FONT.BODY, page = 0) => ({
  page,
  x,
  y,
  xMax: x + text.length * 5,
  yMax: y + h,
  text,
});

// Lay a string out as one line of words starting at x, each word in `h`.
const lineWords = (x, y, text, h = FONT.BODY) => {
  const out = [];
  let cx = x;
  for (const t of text.split(' ')) {
    out.push(word(cx, y, t, h));
    cx += t.length * 5 + 3;
  }
  return out;
};

const linesAt = (edge, specs) =>
  groupLines(specs.flatMap(([dx, y, text, h]) => lineWords(edge + dx, y, text, h))).map(l => ({
    ...l,
    edge,
  }));

const anyWord = () => false;

test('groupLines groups words by y and reports first-word x and height', () => {
  const lines = groupLines([
    word(100, 50, 'world'),
    word(63, 51, 'Hello'),
    word(63, 70, 'Level', FONT.HEADING),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map(l => ({ x: l.x, h: l.h, text: l.text })),
    [
      { x: 63, h: FONT.BODY, text: 'Hello world' },
      { x: 63, h: FONT.HEADING, text: 'Level' },
    ]
  );
});

test('flowParagraphs starts a paragraph at an 8pt indent and joins flush lines', () => {
  const lines = linesAt(63, [
    [0, 100, 'You can imbue yourself with a primal'],
    [0, 112, 'power called Rage.'],
    [8, 124, 'You can enter your Rage the number'],
    [0, 136, 'of times shown.'],
  ]);
  const blocks = flowParagraphs(lines, { isWord: anyWord });
  assert.deepEqual(
    blocks.map(b => b.text),
    ['You can imbue yourself with a primal power called Rage.', 'You can enter your Rage the number of times shown.']
  );
});

test('flowParagraphs reads bullets, their hanging indent, and a flush line after them', () => {
  const lines = linesAt(63, [
    [0, 100, 'following:'],
    [0, 112, '• Make an attack roll against'],
    [11.5, 124, 'an enemy.'],
    [0, 136, '• Take a Bonus Action.'],
    [0, 148, 'Each time the Rage is extended, it lasts.'],
  ]);
  const blocks = flowParagraphs(lines, { isWord: anyWord });
  assert.deepEqual(
    blocks.map(b => [b.kind, b.text]),
    [
      ['p', 'following:'],
      ['li', 'Make an attack roll against an enemy.'],
      ['li', 'Take a Bonus Action.'],
      ['p', 'Each time the Rage is extended, it lasts.'],
    ]
  );
});

test('flowParagraphs reads a run-in bold head from word height and skips an italic spell name', () => {
  const words = [
    ...lineWords(71, 100, 'Prepared Spells of Level 1+.', FONT.BOLD),
    ...lineWords(220, 101, 'You prepare the'),
    ...lineWords(63, 112, 'list of spells.'),
    // An italic spell name opening a continuation line is not a head.
    ...lineWords(63, 124, 'Charm Person,', FONT.ITALIC),
    ...lineWords(140, 125, 'you must spend one.'),
  ];
  const lines = groupLines(words).map(l => ({ ...l, edge: 63 }));
  const blocks = flowParagraphs(lines, { isWord: anyWord });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].head, 'Prepared Spells of Level 1+.');
  assert.equal(blocks[0].text, 'You prepare the list of spells. Charm Person, you must spend one.');
  assert.equal(
    blocksToMarkdown(blocks),
    '**Prepared Spells of Level 1+.** You prepare the list of spells. Charm Person, you must spend one.'
  );
});

test('flowParagraphs keeps bold creature names inline but reads a flush head after a full stop', () => {
  const words = [
    ...lineWords(63, 100, 'special forms: Imp, Quasit,'),
    // Bold stat-block names opening a flush continuation line, mid-sentence.
    ...lineWords(63, 112, 'Skeleton, Sprite,', FONT.BOLD),
    ...lineWords(160, 113, 'or Venomous'),
    ...lineWords(63, 124, 'Snake', FONT.BOLD),
    ...lineWords(100, 125, '(see “Monsters”).'),
    // A run-in head at the column edge, after a finished sentence.
    ...lineWords(63, 136, 'Objects.', FONT.BOLD),
    ...lineWords(110, 137, 'Your ability to handle objects.'),
  ];
  const lines = groupLines(words).map(l => ({ ...l, edge: 63 }));
  const blocks = flowParagraphs(lines, { isWord: anyWord });
  assert.deepEqual(
    blocks.map(b => [b.head, b.text]),
    [
      [undefined, 'special forms: Imp, Quasit, Skeleton, Sprite, or Venomous Snake (see “Monsters”).'],
      ['Objects.', 'Your ability to handle objects.'],
    ]
  );
});

test('blocksToMarkdown separates paragraphs with a blank line and renders bullets', () => {
  const md = blocksToMarkdown([
    { kind: 'p', text: 'Intro:' },
    { kind: 'li', text: 'one' },
    { kind: 'li', text: 'two' },
    { kind: 'p', head: 'Duration.', text: 'It lasts.' },
  ]);
  assert.equal(md, 'Intro:\n\n- one\n- two\n\n**Duration.** It lasts.');
});

test('joinWrapped resolves soft breaks against the corpus and keeps real hyphens', () => {
  const corpus = new Set(['expended', 'higher-level', 'warlock']);
  const isWord = w => corpus.has(w);
  assert.equal(joinWrapped('regain one ex-', 'pended use', isWord), 'regain one expended use');
  assert.equal(joinWrapped('a higher-', 'level slot', isWord), 'a higher-level slot');
  assert.equal(joinWrapped('additional War-', 'lock spells', isWord), 'additional Warlock spells');
  assert.equal(joinWrapped('a 5-foot-', 'wide line', isWord), 'a 5-foot-wide line');
  assert.equal(joinWrapped('at a time—', 'the most recent', isWord), 'at a time—the most recent');
  assert.equal(joinWrapped('your Meta­', 'magic feature', isWord), 'your Metamagic feature');
  assert.equal(joinWrapped('first line', 'second line', isWord), 'first line second line');
});

test('parseFeaturesTable merges a wrapped continuation row into the previous Class Features cell', () => {
  const T = FONT.TABLE;
  const words = [
    ...lineWords(63, 39, 'Sorcerer Features', FONT.TABLE_TITLE),
    ...lineWords(99, 59, 'Proficiency', T),
    word(247, 59, 'Sorcery', T),
    word(68, 70, 'Level', T),
    word(99, 70, 'Bonus', T),
    ...lineWords(152, 70, 'Class Features', T),
    word(251, 70, 'Points', T),
    word(76, 84, '1', T),
    word(117, 84, '+2', T),
    word(152, 84, 'Spellcasting,', T),
    word(258, 84, '—', T),
    ...lineWords(152, 97, 'Innate Sorcery', T),
    word(76, 112, '2', T),
    word(117, 112, '+2', T),
    ...lineWords(152, 112, 'Font of Magic,', T),
    word(261, 112, '2', T),
    word(152, 125, 'Metamagic', T),
    word(76, 140, '3', T),
    word(117, 140, '+2', T),
    word(152, 140, 'Weapon', T),
    // A cell that wraps past the column gutter stays in the Class Features column.
    word(200, 140, 'Mastery', T),
    word(261, 140, '3', T),
  ];
  assert.deepEqual(parseFeaturesTable(words), [
    { level: 1, proficiencyBonus: 2, cell: 'Spellcasting, Innate Sorcery' },
    { level: 2, proficiencyBonus: 2, cell: 'Font of Magic, Metamagic' },
    { level: 3, proficiencyBonus: 2, cell: 'Weapon Mastery' },
  ]);
});

test('splitFeatureCell splits on commas outside parentheses and drops the dash', () => {
  assert.deepEqual(splitFeatureCell('Action Surge (two uses), Indomitable (two uses)'), [
    'Action Surge (two uses)',
    'Indomitable (two uses)',
  ]);
  assert.deepEqual(splitFeatureCell('Rage, Unarmored Defense, Weapon Mastery'), [
    'Rage',
    'Unarmored Defense',
    'Weapon Mastery',
  ]);
  assert.deepEqual(splitFeatureCell('—'), []);
});

test('normalizeCellName strips a trailing parenthetical only', () => {
  assert.equal(normalizeCellName('Mystic Arcanum (level 6 spell)'), 'Mystic Arcanum');
  assert.equal(normalizeCellName('Indomitable (one use)'), 'Indomitable');
  assert.equal(normalizeCellName('Ability Score Improvement'), 'Ability Score Improvement');
});

test('splitLevelSections splits on heading-height Level lines and leaves prose mentions alone', () => {
  const lines = linesAt(63, [
    [0, 100, 'As a Warlock, you gain the following.'],
    [0, 118, 'Level 1: Pact Magic', FONT.HEADING],
    [0, 132, 'Through occult ceremony you cast spells.'],
    [0, 144, 'Level 5+ Warlock is a prerequisite here.'],
    [0, 162, 'Level 2: Magical Cunning', FONT.HEADING],
    [0, 176, 'You can perform an esoteric rite.'],
  ]);
  const { intro, sections } = splitLevelSections(lines);
  assert.deepEqual(intro.map(l => l.text), ['As a Warlock, you gain the following.']);
  assert.deepEqual(
    sections.map(s => [s.level, s.name, s.lines.map(l => l.text)]),
    [
      [1, 'Pact Magic', ['Through occult ceremony you cast spells.', 'Level 5+ Warlock is a prerequisite here.']],
      [2, 'Magical Cunning', ['You can perform an esoteric rite.']],
    ]
  );
});

test('splitLevelSections throws on a Level N: line at body height', () => {
  const lines = linesAt(63, [[0, 100, 'Level 3: Not A Heading']]);
  assert.throws(() => splitLevelSections(lines), /Level 3: Not A Heading/);
});
