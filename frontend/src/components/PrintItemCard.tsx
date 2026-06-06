import type { PrintableItemCard as PrintableItemCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';

/**
 * Condensed 3×5" item card (VEG-267) rendering the curated PrintableItemCard
 * view-model: category tag, rarity/attunement line, properties, and a
 * line-clamped description so long items cannot overflow.
 */
export default function PrintItemCard({ card }: { card: PrintableItemCardModel }) {
  return (
    <PrintCard name={card.name} tag={card.category}>
      <div className="flex flex-col gap-1 text-[9px] leading-snug">
        {(card.rarity || card.requiresAttunement) && (
          <p className="italic text-gray-600">
            {card.rarity && <span>{card.rarity}</span>}
            {card.rarity && card.requiresAttunement && <span> &middot; </span>}
            {card.requiresAttunement && <span>Requires Attunement</span>}
          </p>
        )}

        {card.properties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.properties.map(property => (
              <span
                key={property}
                className="rounded border border-gray-400 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-gray-600"
              >
                {property}
              </span>
            ))}
          </div>
        )}

        {card.description && <p className="line-clamp-[9]">{card.description}</p>}
      </div>
    </PrintCard>
  );
}
