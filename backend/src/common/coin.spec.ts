// Tests for the shared coin/currency utilities (VEG-352). The math lives in
// @grimoire-os/shared so both the frontend (price display) and the backend
// (purchasing) derive identical numbers; the backend hosts the tests, the same
// pattern as encounter-difficulty.spec.ts and combatant-loot.spec.ts.

import {
  Currency,
  CoinInput,
  toCopper,
  fromCopper,
  parseCost,
  formatCoin,
  addCoin,
  subtractCoin,
  canAfford,
  settle,
} from '@grimoire-os/shared';

const coin = (over: Partial<Currency> = {}): Currency => ({
  cp: 0,
  sp: 0,
  ep: 0,
  gp: 0,
  pp: 0,
  ...over,
});

describe('toCopper', () => {
  it('treats an empty balance as zero copper', () => {
    expect(toCopper({})).toBe(0);
    expect(toCopper(coin())).toBe(0);
  });

  it('uses canonical ratios (1pp=10gp=20ep=100sp=1000cp)', () => {
    expect(toCopper({ cp: 1 })).toBe(1);
    expect(toCopper({ sp: 1 })).toBe(10);
    expect(toCopper({ ep: 1 })).toBe(50);
    expect(toCopper({ gp: 1 })).toBe(100);
    expect(toCopper({ pp: 1 })).toBe(1000);
  });

  it('sums a mixed balance', () => {
    expect(toCopper({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 })).toBe(1000 + 200 + 50 + 30 + 4);
  });
});

describe('fromCopper', () => {
  it('decomposes zero to an all-zero currency', () => {
    expect(fromCopper(0)).toEqual(coin());
  });

  it('decomposes into pp/gp/sp/cp and never emits electrum (EP policy)', () => {
    // 1234 cp = 1 pp, 2 gp, 3 sp, 4 cp — ep stays 0 even though 50cp would fit.
    expect(fromCopper(1234)).toEqual(coin({ pp: 1, gp: 2, sp: 3, cp: 4 }));
    expect(fromCopper(50)).toEqual(coin({ sp: 5 }));
  });

  it('round-trips with toCopper', () => {
    for (const cp of [0, 1, 7, 50, 99, 100, 555, 1000, 12345]) {
      expect(toCopper(fromCopper(cp))).toBe(cp);
    }
  });

  it('rejects a negative copper amount', () => {
    expect(() => fromCopper(-1)).toThrow(RangeError);
  });
});

describe('parseCost', () => {
  it('parses the seeded single-denomination formats, preserving the denomination', () => {
    expect(parseCost('1 CP')).toEqual(coin({ cp: 1 }));
    expect(parseCost('5 SP')).toEqual(coin({ sp: 5 }));
    expect(parseCost('500 GP')).toEqual(coin({ gp: 500 }));
  });

  it('strips thousands separators', () => {
    expect(parseCost('1,000 GP')).toEqual(coin({ gp: 1000 }));
    expect(parseCost('100,000 GP')).toEqual(coin({ gp: 100000 }));
  });

  it('is case-insensitive and tolerant of surrounding/inner whitespace', () => {
    expect(parseCost('2 gp')).toEqual(coin({ gp: 2 }));
    expect(parseCost('  10gp ')).toEqual(coin({ gp: 10 }));
  });

  it('accepts pp and ep denominations even though seed data lacks them', () => {
    expect(parseCost('3 pp')).toEqual(coin({ pp: 3 }));
    expect(parseCost('3 ep')).toEqual(coin({ ep: 3 }));
  });

  it('treats "Free" and an explicit "0 gp" as a zero price', () => {
    expect(parseCost('Free')).toEqual(coin());
    expect(parseCost('free')).toEqual(coin());
    expect(parseCost('0 gp')).toEqual(coin());
  });

  it('rejects malformed thousands grouping rather than scraping a bogus price', () => {
    expect(parseCost('1,00,0 gp')).toBeNull();
    expect(parseCost('1,2,3 gp')).toBeNull();
    expect(parseCost(',5 gp')).toBeNull();
  });

  it('returns null for rate-suffixed costs (a rate is not a fixed price)', () => {
    expect(parseCost('2 GP per Day')).toBeNull();
    expect(parseCost('1 SP per day')).toBeNull();
    expect(parseCost('2 CP per mile')).toBeNull();
  });

  it('returns null for unparseable values', () => {
    expect(parseCost('Varies')).toBeNull();
    expect(parseCost('')).toBeNull();
    expect(parseCost('   ')).toBeNull();
    expect(parseCost('5 zorkmids')).toBeNull();
    expect(parseCost('gp')).toBeNull();
    expect(parseCost('5')).toBeNull();
    expect(parseCost('5-10 gp')).toBeNull();
  });
});

describe('formatCoin', () => {
  it('shows only non-zero denominations, high to low', () => {
    expect(formatCoin({ pp: 1, gp: 5, cp: 3 })).toBe('1 pp · 5 gp · 3 cp');
  });

  it('includes electrum when a balance holds it', () => {
    expect(formatCoin({ ep: 2, sp: 4 })).toBe('2 ep · 4 sp');
  });

  it('renders an all-zero balance as "0 gp"', () => {
    expect(formatCoin({})).toBe('0 gp');
    expect(formatCoin(coin())).toBe('0 gp');
  });

  it('orders pp, gp, ep, sp, cp', () => {
    expect(formatCoin({ cp: 1, sp: 1, ep: 1, gp: 1, pp: 1 })).toBe(
      '1 pp · 1 gp · 1 ep · 1 sp · 1 cp'
    );
  });
});

describe('addCoin', () => {
  it('adds two balances and returns the canonical decomposition', () => {
    // 5sp + 7sp = 12sp = 1gp 2sp
    expect(addCoin({ sp: 5 }, { sp: 7 })).toEqual(coin({ gp: 1, sp: 2 }));
  });

  it('carries across denominations', () => {
    // 999cp + 111cp = 1110cp = 1pp 1gp 1sp
    expect(addCoin({ gp: 9, sp: 9, cp: 9 }, { gp: 1, sp: 1, cp: 1 })).toEqual(
      coin({ pp: 1, gp: 1, sp: 1 })
    );
  });

  it('folds electrum into the canonical output', () => {
    expect(addCoin({ ep: 1 }, { ep: 1 })).toEqual(coin({ gp: 1 })); // 100cp
  });
});

describe('subtractCoin', () => {
  it('subtracts and returns the canonical remainder', () => {
    expect(subtractCoin({ gp: 1 }, { sp: 3 })).toEqual(coin({ sp: 7 })); // 100-30=70cp
  });

  it('returns zero when the two are equal', () => {
    expect(subtractCoin({ gp: 1 }, { sp: 10 })).toEqual(coin());
  });

  it('throws when the result would be negative', () => {
    expect(() => subtractCoin({ sp: 1 }, { gp: 1 })).toThrow(RangeError);
  });
});

describe('canAfford', () => {
  it('compares balance to price by total copper', () => {
    expect(canAfford({ gp: 1 }, { sp: 10 })).toBe(true); // exactly enough
    expect(canAfford({ gp: 1 }, { sp: 9 })).toBe(true);
    expect(canAfford({ gp: 1 }, { sp: 11 })).toBe(false);
  });

  it('affords a free price from an empty purse', () => {
    expect(canAfford({}, {})).toBe(true);
    expect(canAfford({}, parseCost('Free') as CoinInput)).toBe(true);
  });

  it('handles mixed denominations on both sides', () => {
    // pay 15 gp from 1pp 5gp (= 15gp) — exactly enough
    expect(canAfford({ pp: 1, gp: 5 }, { gp: 15 })).toBe(true);
    expect(canAfford({ pp: 1, gp: 5 }, { gp: 16 })).toBe(false);
  });
});

describe('settle', () => {
  it('deducts the price and returns the re-denominated balance (make change)', () => {
    // pay 15 gp from a mixed purse of 2pp (= 2000cp); change = 500cp = 5gp
    expect(settle({ pp: 2 }, { gp: 15 })).toEqual(coin({ gp: 5 }));
  });

  it('returns an all-zero balance on an exact payment', () => {
    expect(settle({ gp: 15 }, { pp: 1, gp: 5 })).toEqual(coin());
  });

  it('pulls change across denominations from a mixed purse', () => {
    // 3gp 2sp (= 320cp) minus 1gp 5sp (= 150cp) = 170cp = 1gp 7sp
    expect(settle({ gp: 3, sp: 2 }, { gp: 1, sp: 5 })).toEqual(coin({ gp: 1, sp: 7 }));
  });

  it('returns null when the balance cannot cover the price', () => {
    expect(settle({ sp: 5 }, { gp: 1 })).toBeNull();
  });
});
