'use client';

import type { SrdMonster } from '@/lib/types';
import { abilityModifier, formatBonuses, formatCr } from '@/lib/srd-format';

interface Action {
  name: string;
  description: string;
}

const ABILITIES: Array<{ key: keyof SrdMonster; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

/** Renders a full SRD monster stat block as a modern app-styled card (VEG-257). */
export default function MonsterStatBlock({ monster: m }: { monster: SrdMonster }) {
  const subtitle = `${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''} · ${m.alignment}`;
  const hasDefenseRow =
    m.savingThrows ||
    m.skills ||
    m.damageResistances.length > 0 ||
    m.damageImmunities.length > 0 ||
    m.damageVulnerabilities.length > 0 ||
    m.conditionImmunities.length > 0 ||
    m.senses ||
    m.languages;

  return (
    <div
      data-testid="monster-stat-block"
      className="text-sm text-gray-900 dark:text-gray-100 space-y-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{m.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {m.contentSource === 'homebrew' && (
            <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium whitespace-nowrap">
              Homebrew
            </span>
          )}
          <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 text-xs font-medium whitespace-nowrap">
            CR {formatCr(m.challengeRating)}
            {m.experiencePoints ? ` · ${m.experiencePoints} XP` : ''}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        <StatTile label="Armor Class" value={`${m.armorClass}`} sub={m.armorType ?? undefined} />
        <StatTile label="Hit Points" value={String(m.hitPoints)} sub={m.hitDice ?? undefined} />
        <StatTile label="Speed" value={m.speed} />
      </div>

      <div className="grid grid-cols-6 gap-1.5 text-center">
        {ABILITIES.map(a => {
          const score = m[a.key] as number;
          return (
            <div
              key={a.label}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 py-1"
            >
              <div className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                {a.label}
              </div>
              <div className="font-mono text-xs">
                {score} ({abilityModifier(score)})
              </div>
            </div>
          );
        })}
      </div>

      {hasDefenseRow && (
        <div className="space-y-1 text-xs border-t border-gray-100 dark:border-gray-700 pt-3">
          {m.savingThrows && Object.keys(m.savingThrows).length > 0 && (
            <InfoRow label="Saving Throws" value={formatBonuses(m.savingThrows)} />
          )}
          {m.skills && Object.keys(m.skills).length > 0 && (
            <InfoRow label="Skills" value={formatBonuses(m.skills)} />
          )}
          {m.damageResistances.length > 0 && (
            <InfoRow label="Damage Resistances" value={m.damageResistances.join(', ')} />
          )}
          {m.damageImmunities.length > 0 && (
            <InfoRow label="Damage Immunities" value={m.damageImmunities.join(', ')} />
          )}
          {m.damageVulnerabilities.length > 0 && (
            <InfoRow label="Damage Vulnerabilities" value={m.damageVulnerabilities.join(', ')} />
          )}
          {m.conditionImmunities.length > 0 && (
            <InfoRow label="Condition Immunities" value={m.conditionImmunities.join(', ')} />
          )}
          {m.senses && <InfoRow label="Senses" value={m.senses} />}
          {m.languages && <InfoRow label="Languages" value={m.languages} />}
        </div>
      )}

      {m.specialAbilities && m.specialAbilities.length > 0 && (
        <ActionList title="Traits" actions={m.specialAbilities} />
      )}
      {m.actions.length > 0 && <ActionList title="Actions" actions={m.actions} />}
      {m.reactions && m.reactions.length > 0 && (
        <ActionList title="Reactions" actions={m.reactions} />
      )}
      {m.legendaryActions && m.legendaryActions.length > 0 && (
        <ActionList title="Legendary Actions" actions={m.legendaryActions} />
      )}

      {m.description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-3">
          {m.description}
        </p>
      )}

      <p className="text-[10px] text-gray-400 dark:text-gray-500">Source: {m.source}</p>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 py-2">
      <div className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="font-medium text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold">{label}</span> {value}
    </div>
  );
}

function ActionList({ title, actions }: { title: string; actions: Action[] }) {
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h4>
      <ul className="space-y-1.5 text-xs">
        {actions.map((a, i) => (
          <li key={`${a.name}-${i}`}>
            <span className="font-semibold italic">{a.name}.</span> {a.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
