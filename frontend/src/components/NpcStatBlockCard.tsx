'use client';

interface Action {
  name: string;
  description: string;
}

export interface NpcStatBlockShape {
  baseMonster?: string;
  name: string;
  size: string;
  type: string;
  subtype?: string | null;
  alignment?: string | null;
  armorClass: number;
  armorType?: string | null;
  hitPoints: number;
  hitDice?: string | null;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows?: Record<string, number> | null;
  skills?: Record<string, number> | null;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  senses?: string | null;
  languages?: string | null;
  challengeRating: number;
  experiencePoints?: number | null;
  specialAbilities?: Action[] | null;
  actions: Action[];
  reactions?: Action[] | null;
  legendaryActions?: Action[] | null;
  professionWeaponSwap?: {
    profession: string;
    weapon: string;
    replacedAction: string;
  } | null;
}

const ABILITIES: Array<{ key: keyof NpcStatBlockShape; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

export function NpcStatBlockCard({ statBlock }: { statBlock: NpcStatBlockShape }) {
  const sb = statBlock;
  return (
    <div
      data-testid="npc-stat-block"
      className="bg-amber-50 dark:bg-gray-900 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4 text-sm text-gray-900 dark:text-gray-100 space-y-3"
    >
      <header>
        <h3 className="text-lg font-bold">{sb.name}</h3>
        <p className="italic text-xs text-gray-600 dark:text-gray-400">
          {sb.size} {sb.type}
          {sb.subtype ? ` (${sb.subtype})` : ''}
          {sb.alignment ? `, ${sb.alignment}` : ''}
        </p>
        {sb.baseMonster && (
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Based on {sb.baseMonster}
            {sb.professionWeaponSwap && (
              <>
                {' '}
                · swapped <strong>{sb.professionWeaponSwap.replacedAction}</strong> →{' '}
                <strong>{sb.professionWeaponSwap.weapon}</strong>
              </>
            )}
          </p>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 border-y border-amber-200 dark:border-amber-900/40 py-2">
        <div>
          <span className="font-semibold">AC</span> {sb.armorClass}
          {sb.armorType ? ` (${sb.armorType})` : ''}
        </div>
        <div>
          <span className="font-semibold">HP</span> {sb.hitPoints}
          {sb.hitDice ? ` (${sb.hitDice})` : ''}
        </div>
        <div>
          <span className="font-semibold">Speed</span> {sb.speed}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1 text-center">
        {ABILITIES.map(a => {
          const v = sb[a.key] as number;
          return (
            <div key={a.label} className="border border-amber-200 dark:border-amber-900/40 rounded">
              <div className="text-[10px] font-semibold uppercase">{a.label}</div>
              <div className="font-mono">
                {v} ({modifier(v)})
              </div>
            </div>
          );
        })}
      </div>

      {(sb.savingThrows || sb.skills || sb.senses || sb.languages) && (
        <div className="space-y-0.5 text-xs">
          {sb.savingThrows && Object.keys(sb.savingThrows).length > 0 && (
            <div>
              <span className="font-semibold">Saving Throws</span>{' '}
              {Object.entries(sb.savingThrows)
                .map(([k, v]) => `${k} ${v >= 0 ? `+${v}` : v}`)
                .join(', ')}
            </div>
          )}
          {sb.skills && Object.keys(sb.skills).length > 0 && (
            <div>
              <span className="font-semibold">Skills</span>{' '}
              {Object.entries(sb.skills)
                .map(([k, v]) => `${k} ${v >= 0 ? `+${v}` : v}`)
                .join(', ')}
            </div>
          )}
          {sb.senses && (
            <div>
              <span className="font-semibold">Senses</span> {sb.senses}
            </div>
          )}
          {sb.languages && (
            <div>
              <span className="font-semibold">Languages</span> {sb.languages}
            </div>
          )}
          <div>
            <span className="font-semibold">Challenge</span> {formatCr(sb.challengeRating)}
            {sb.experiencePoints ? ` (${sb.experiencePoints} XP)` : ''}
          </div>
        </div>
      )}

      {sb.specialAbilities && sb.specialAbilities.length > 0 && (
        <ActionList title="Special Abilities" actions={sb.specialAbilities} />
      )}
      <ActionList title="Actions" actions={sb.actions} />
      {sb.reactions && sb.reactions.length > 0 && (
        <ActionList title="Reactions" actions={sb.reactions} />
      )}
      {sb.legendaryActions && sb.legendaryActions.length > 0 && (
        <ActionList title="Legendary Actions" actions={sb.legendaryActions} />
      )}
    </div>
  );
}

function ActionList({ title, actions }: { title: string; actions: Action[] }) {
  return (
    <div>
      <h4 className="font-semibold border-b border-amber-200 dark:border-amber-900/40 mb-1">
        {title}
      </h4>
      <ul className="space-y-1">
        {actions.map((a, i) => (
          <li key={`${a.name}-${i}`}>
            <span className="font-semibold italic">{a.name}.</span> {a.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
