import { formatSigned } from '@grimoire-os/shared';

/** Format a numeric challenge rating the way 5e prints it (fractions for < 1). */
export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** Derive the signed 5e ability modifier from a raw score, e.g. 30 → "+10", 8 → "-1". */
export function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Render a bonus with an explicit sign, e.g. 7 → "+7", -1 → "-1". */
export function signed(n: number): string {
  return formatSigned(n);
}

/** Format a bonus map the way 5e stat blocks print it, e.g. "str +7, con +9". */
export function formatBonuses(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k} ${signed(v)}`)
    .join(', ');
}
