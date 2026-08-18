/**
 * Dice utilities for in-sheet rolls (VEG-349, slice 7). Pure and
 * `rng`-injectable — mirroring the `rng = Math.random` convention in
 * `encounter-combatants.ts` — so the UI shows results and tests stay
 * deterministic. These never mutate character state; rolls are ephemeral.
 */

/**
 * The injectable random source. Named rather than spelled structurally at each
 * site (VEG-489) so a prop or parameter reads as *the* seeded-randomness
 * injection point this convention describes, not an arbitrary callback that
 * happens to return a number. Shared by `encounter-combatants.ts` and the
 * encounter dialogs; this module is its home even though the convention
 * started there.
 */
export type Rng = () => number;
export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** Roll a single die with `sides` faces (1..sides). */
export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

export interface D20Result {
  /** The d20 face(s) rolled — one for normal, two for advantage/disadvantage. */
  rolls: number[];
  /** The kept face (highest for advantage, lowest for disadvantage). */
  natural: number;
  modifier: number;
  /** `natural + modifier`. */
  total: number;
  mode: RollMode;
}

/** Roll a d20 check/save/attack: d20 + modifier, with advantage/disadvantage. */
export function rollD20(
  modifier = 0,
  mode: RollMode = 'normal',
  rng: Rng = Math.random
): D20Result {
  const rolls = mode === 'normal' ? [rollDie(20, rng)] : [rollDie(20, rng), rollDie(20, rng)];
  const natural =
    mode === 'advantage'
      ? Math.max(...rolls)
      : mode === 'disadvantage'
        ? Math.min(...rolls)
        : rolls[0];
  return { rolls, natural, modifier, total: natural + modifier, mode };
}

export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
}

const EXPRESSION_RE = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i;

/**
 * Parse a dice expression like `2d6+3`, `1d8`, `d20`, or `1d10 - 1`. Returns
 * `null` when the string isn't a recognizable dice expression (e.g. a flat
 * bonus like `+5` or free text). `count` defaults to 1 (`d20` === `1d20`).
 */
export function parseDiceExpression(expr: string): DiceExpression | null {
  const match = EXPRESSION_RE.exec(expr);
  if (!match) return null;
  const sides = Number(match[2]);
  if (sides <= 0) return null;
  return {
    count: match[1] === '' ? 1 : Number(match[1]),
    sides,
    modifier: match[3] ? Number(match[3].replace(/\s+/g, '')) : 0,
  };
}

export interface ExpressionResult {
  rolls: number[];
  modifier: number;
  total: number;
  expression: string;
}

/** Roll a dice expression (e.g. weapon damage `1d8+3`). Returns null if unparseable. */
export function rollExpression(expr: string, rng: Rng = Math.random): ExpressionResult | null {
  const parsed = parseDiceExpression(expr);
  if (!parsed) return null;
  const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides, rng));
  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier;
  return { rolls, modifier: parsed.modifier, total, expression: expr.trim() };
}

/**
 * Extract a leading signed integer modifier from free text like `+5`, `-1`, or
 * `+7 / DC 15` (weapon attack-bonus cells). Returns null when no leading number
 * is present.
 */
export function parseModifier(text: string): number | null {
  const match = /^\s*([+-]?\d+)/.exec(text);
  return match ? Number(match[1]) : null;
}

/** Format a d20 result for a toast, e.g. `Dexterity check: 14 + 2 = 16`. */
export function formatD20Result(label: string, result: D20Result): string {
  const sign = result.modifier >= 0 ? '+' : '−';
  const mod = Math.abs(result.modifier);
  const modPart = result.modifier !== 0 ? ` ${sign} ${mod}` : '';
  const rollsPart =
    result.mode === 'normal'
      ? `${result.natural}`
      : `${result.rolls.join('/')} → ${result.natural}`;
  return `${label}: ${rollsPart}${modPart} = ${result.total}`;
}

/** Format an expression result for a toast, e.g. `Longsword damage: [5, 3] + 2 = 10`. */
export function formatExpressionResult(label: string, result: ExpressionResult): string {
  const sign = result.modifier >= 0 ? '+' : '−';
  const mod = Math.abs(result.modifier);
  const modPart = result.modifier !== 0 ? ` ${sign} ${mod}` : '';
  return `${label}: [${result.rolls.join(', ')}]${modPart} = ${result.total}`;
}
