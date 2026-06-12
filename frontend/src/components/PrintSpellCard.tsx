import type { PrintableSpellCard as PrintableSpellCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';
import { levelLabel } from '@/lib/spell-constants';

const CASTING_LINE = [
  { key: 'castingTime', label: 'Casting Time' },
  { key: 'range', label: 'Range' },
  { key: 'components', label: 'Components' },
  { key: 'duration', label: 'Duration' },
] as const;

/**
 * Condensed 3×5" spell card (VEG-266) rendering the curated
 * PrintableSpellCard view-model. The description is line-clamped so even a
 * long spell cannot overflow the fixed footprint.
 */
export default function PrintSpellCard({ card }: { card: PrintableSpellCardModel }) {
  return (
    <PrintCard name={card.name} tag={`${levelLabel(card.level)} · ${card.school}`}>
      <div className="flex flex-col gap-1 text-[9px] leading-snug">
        <div className="grid grid-cols-4 gap-1">
          {CASTING_LINE.map(field => (
            <div key={field.key}>
              <div className="text-[7px] font-semibold uppercase tracking-wide text-gray-500">
                {field.label}
              </div>
              <div>{card[field.key]}</div>
            </div>
          ))}
        </div>

        {(card.concentration || card.ritual) && (
          <div className="flex gap-1">
            {card.concentration && <Badge>Concentration</Badge>}
            {card.ritual && <Badge>Ritual</Badge>}
          </div>
        )}

        <p className="line-clamp-[8]">{card.description}</p>
      </div>
    </PrintCard>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded border border-gray-400 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-gray-600">
      {children}
    </span>
  );
}
