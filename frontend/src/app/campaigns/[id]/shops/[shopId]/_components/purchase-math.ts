import { canAfford, fromCopper, toCopper, type Currency } from '@grimoire-os/shared';

/**
 * Total cost of `quantity` units of a unit `price`, as a canonical coin amount.
 * The purse is fungible, so the result is re-denominated optimally (mirrors the
 * backend's `lineTotal`). A non-positive or fractional quantity floors to whole
 * units. There is no `multiplyCoin` in the shared coin module, so this small
 * derivation lives here and is unit-tested in isolation.
 */
export function lineTotal(price: Currency, quantity: number): Currency {
  return fromCopper(toCopper(price) * Math.max(0, Math.trunc(quantity)));
}

/** Whether `balance` covers `quantity × price`. */
export function canAffordLine(balance: Currency, price: Currency, quantity: number): boolean {
  return canAfford(balance, lineTotal(price, quantity));
}
