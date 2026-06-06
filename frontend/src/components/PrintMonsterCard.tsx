import { PRINTABLE_MONSTER_ACTION_CAP, PRINTABLE_MONSTER_TRAIT_CAP } from '@grimoire-os/shared';
import type { PrintableMonsterCard as PrintableMonsterCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';
import { abilityModifier, formatCr } from '@/lib/srd-format';

const ABILITY_LABELS = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
] as const;

/**
 * Condensed 3×5" monster card (VEG-266) rendering the curated
 * PrintableMonsterCard view-model. The producer (batch hydrate endpoint)
 * already trims to the shared caps; the slices here are a defensive bound so
 * an uncapped payload still cannot overflow the card.
 */
export default function PrintMonsterCard({ card }: { card: PrintableMonsterCardModel }) {
  const tag = `CR ${formatCr(card.challengeRating)}${
    card.experiencePoints ? ` · ${card.experiencePoints} XP` : ''
  }`;
  const traits = (card.traits ?? []).slice(0, PRINTABLE_MONSTER_TRAIT_CAP);
  const actions = card.actions.slice(0, PRINTABLE_MONSTER_ACTION_CAP);

  return (
    <PrintCard name={card.name} tag={tag}>
      <div className="flex flex-col gap-1 text-[9px] leading-snug">
        <p className="italic text-gray-600">
          {card.size} {card.creatureType} &middot; {card.alignment}
        </p>

        <div className="flex gap-3 text-[10px]">
          <span>
            <span className="font-semibold">AC</span> <span>{card.armorClass}</span>
          </span>
          <span>
            <span className="font-semibold">HP</span> <span>{card.hitPoints}</span>
          </span>
          <span className="min-w-0">
            <span className="font-semibold">Speed</span> <span>{card.speed}</span>
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1 text-center">
          {ABILITY_LABELS.map(a => (
            <div key={a.label} className="rounded border border-gray-300 py-0.5">
              <div className="text-[7px] font-semibold uppercase text-gray-500">{a.label}</div>
              <div className="font-mono text-[8px]">
                {card.abilities[a.key]} ({abilityModifier(card.abilities[a.key])})
              </div>
            </div>
          ))}
        </div>

        {traits.length > 0 && <EntryList title="Traits" entries={traits} />}
        {actions.length > 0 && <EntryList title="Actions" entries={actions} />}
      </div>
    </PrintCard>
  );
}

function EntryList({
  title,
  entries,
}: {
  title: string;
  entries: { name: string; description: string }[];
}) {
  return (
    <div>
      <h4 className="text-[7px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      <ul className="space-y-0.5">
        {entries.map((entry, i) => (
          <li key={`${entry.name}-${i}`}>
            <span className="font-semibold italic">{entry.name}.</span> {entry.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
