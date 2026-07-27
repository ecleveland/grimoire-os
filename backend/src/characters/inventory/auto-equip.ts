/**
 * The subset of an inventory line this helper reads. Deliberately structural and
 * looser than `InventoryItem`/`GearMeta`: it runs on lines already resolved by
 * `InventoryResolverService` (whose gear field is the request DTO's `GearMetaDto`
 * *or* the shared `GearMeta`), and it only ever presence-tests the discriminants,
 * never narrows to a branch.
 */
type EquippableLine = {
  equipped?: boolean;
  gear?: {
    type?: string;
    armorType?: string;
    baseArmorClass?: number;
  };
};

/** A body-armor line whose base AC can drive derived AC (shields excluded). */
function isBodyArmor(line: EquippableLine): boolean {
  const gear = line.gear;
  return (
    !!gear &&
    gear.type === 'armor' &&
    gear.armorType !== 'shield' &&
    typeof gear.baseArmorClass === 'number' &&
    Number.isFinite(gear.baseArmorClass)
  );
}

/** A shield line — `armorType: 'shield'`, carrying an additive AC bonus. */
function isShield(line: EquippableLine): boolean {
  return line.gear?.type === 'armor' && line.gear.armorType === 'shield';
}

/**
 * Auto-equip a freshly-built character's starting armor so derived AC fires
 * immediately, without a manual equip toggle on the sheet (VEG-483).
 *
 * Applied after `InventoryResolverService` has attached gear snapshots at create
 * time, and only when the caller opts in (the guided builder sets the flag; the
 * classic editor and API clients don't). Auto-equip is a rules decision, not a
 * data one — a Cleric wants mail + shield equipped, but a Fighter who picked two
 * martial weapons does not want both equipped — so this stays deliberately
 * conservative:
 *
 * - equips **at most one** body armor: the highest `baseArmorClass`, keeping the
 *   first on a tie (so a class offering two body armors across choice groups
 *   gets the better one, not both);
 * - equips **at most one** shield: the first one present;
 * - leaves weapons and everything else exactly as sent.
 *
 * Pure: returns a new array with new objects for the equipped lines, so the
 * caller's input is never mutated.
 */
export function autoEquipStartingArmor<T extends EquippableLine>(items: T[]): T[] {
  let bestArmorIndex = -1;
  let bestArmorAc = -Infinity;
  let shieldIndex = -1;

  items.forEach((line, index) => {
    if (isBodyArmor(line)) {
      // Strict `>` keeps the first line on an AC tie.
      const ac = line.gear!.baseArmorClass as number;
      if (ac > bestArmorAc) {
        bestArmorAc = ac;
        bestArmorIndex = index;
      }
    } else if (shieldIndex === -1 && isShield(line)) {
      shieldIndex = index;
    }
  });

  if (bestArmorIndex === -1 && shieldIndex === -1) return items;

  return items.map((line, index) =>
    index === bestArmorIndex || index === shieldIndex ? { ...line, equipped: true } : line
  );
}
