import type { Currency } from './embedded';

/**
 * Coin/currency utilities (VEG-352), kept in @grimoire-os/shared so price
 * display (frontend) and purchasing (backend) derive identical numbers.
 *
 * All arithmetic goes through copper-normalization so it is exact: every
 * denomination has an integer copper value and we only ever add/subtract those
 * integers. The canonical ratios are the 5e standard:
 *
 *   1 pp = 10 gp = 20 ep = 100 sp = 1000 cp
 *
 * EP policy: electrum is a real denomination a purse may hold, so it is honored
 * on *input* (`toCopper` counts it, `parseCost`/`formatCoin` accept it). But it
 * is vestigial in play, so `fromCopper` never *emits* it — canonical change is
 * decomposed into pp/gp/sp/cp only. Any function returning a fresh balance
 * (`addCoin`, `subtractCoin`, `settle`) therefore returns `ep: 0`.
 */

/** Copper value of one unit of each denomination. */
const COPPER_PER: Readonly<Record<keyof Currency, number>> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

/** Display order, highest to lowest value (electrum included — a purse can hold it). */
const DENOMS_DESC: ReadonlyArray<keyof Currency> = ['pp', 'gp', 'ep', 'sp', 'cp'];

/**
 * Decomposition order for `fromCopper`: electrum is omitted so canonical change
 * is never minted in electrum (EP policy). Keeping it a separate list — rather
 * than skipping `ep` mid-loop — encodes the exclusion as data.
 */
const DECOMPOSE_DESC: ReadonlyArray<keyof Currency> = ['pp', 'gp', 'sp', 'cp'];

/**
 * A partial coin amount. Callers may pass only the denominations they care
 * about (e.g. `{ gp: 5 }`); missing denominations are treated as zero.
 */
export type CoinInput = Partial<Currency>;

const ZERO: Readonly<Currency> = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

/** Total copper value of a (possibly partial) coin amount. */
export function toCopper(coin: CoinInput): number {
  let total = 0;
  for (const denom of DENOMS_DESC) total += (coin[denom] ?? 0) * COPPER_PER[denom];
  return total;
}

/**
 * Decompose a copper amount into the canonical pp/gp/sp/cp breakdown (never
 * electrum — see EP policy). Throws on a negative amount; currency cannot be
 * negative.
 */
export function fromCopper(cp: number): Currency {
  if (!Number.isFinite(cp) || cp < 0) {
    throw new RangeError(`fromCopper: copper must be a non-negative number, got ${cp}`);
  }
  let remaining = Math.trunc(cp);
  const out: Currency = { ...ZERO };
  for (const denom of DECOMPOSE_DESC) {
    const value = COPPER_PER[denom];
    out[denom] = Math.floor(remaining / value);
    remaining %= value;
  }
  return out;
}

// Amount is either properly grouped thousands (1,000 / 100,000) or a bare digit
// run (1000) — malformed grouping like "1,00,0" or a stray ",5" must not match,
// so a typo'd catalog cost falls back to null rather than a bogus price.
const COST_RE = /^(\d{1,3}(?:,\d{3})*|\d+)\s*(cp|sp|ep|gp|pp)$/i;

/**
 * Parse a free-text catalog `cost` string (e.g. `"500 gp"`, `"1,000 GP"`,
 * `"Free"`) into a structured single-denomination `Currency`, preserving the
 * denomination it was written in (so a 500 gp item displays as 500 gp, not
 * 50 pp). Returns `null` for anything that is not a fixed coin price — `Varies`,
 * rate suffixes (`"2 GP per Day"`, `"2 CP per mile"`), ranges, or garbage — so
 * a shop line can fall back to a DM-entered price.
 */
export function parseCost(input: string): Currency | null {
  const trimmed = input.trim();
  if (/^free$/i.test(trimmed)) return { ...ZERO };
  const match = COST_RE.exec(trimmed);
  if (!match) return null;
  // The regex guarantees a digit run, so parseInt is always a finite integer.
  const amount = Number.parseInt(match[1].replace(/,/g, ''), 10);
  const denom = match[2].toLowerCase() as keyof Currency;
  return { ...ZERO, [denom]: amount };
}

/**
 * Default a sale/line price from a free-text catalog `cost` string. Returns a
 * full `Currency` with the parsed denomination filled in; non-fixed costs
 * (`"Varies"`, rate suffixes, garbage, or `null`/`undefined`) fall back to
 * all-zero (free) for a price to be entered by hand. Shared so the backend
 * suggestion resolver and the frontend stock editor derive identical defaults.
 */
export function priceFromCost(cost: string | null | undefined): Currency {
  return { ...ZERO, ...(parseCost(cost ?? '') ?? {}) };
}

/**
 * Format a coin amount as `"1 pp · 5 gp · 3 cp"`, showing only non-zero
 * denominations from highest to lowest. An all-zero balance renders as `"0 gp"`.
 */
export function formatCoin(coin: CoinInput): string {
  const parts = DENOMS_DESC.filter(denom => (coin[denom] ?? 0) !== 0).map(
    denom => `${coin[denom]} ${denom}`
  );
  return parts.length > 0 ? parts.join(' · ') : '0 gp';
}

/** Sum two coin amounts, returned as a canonical breakdown. */
export function addCoin(a: CoinInput, b: CoinInput): Currency {
  return fromCopper(toCopper(a) + toCopper(b));
}

/**
 * Subtract `b` from `a`, returned as a canonical breakdown. Throws if the
 * result would be negative — use `settle` for affordability-aware purchasing.
 */
export function subtractCoin(a: CoinInput, b: CoinInput): Currency {
  return fromCopper(toCopper(a) - toCopper(b));
}

/** Whether `balance` covers `price` (compared by total copper). */
export function canAfford(balance: CoinInput, price: CoinInput): boolean {
  return toCopper(balance) >= toCopper(price);
}

/**
 * Deduct `price` from `balance` and return the new balance as a canonical
 * breakdown (the purse is treated as fungible, so change is re-denominated
 * optimally). Returns `null` if the balance cannot cover the price.
 */
export function settle(balance: CoinInput, price: CoinInput): Currency | null {
  if (!canAfford(balance, price)) return null;
  return fromCopper(toCopper(balance) - toCopper(price));
}
