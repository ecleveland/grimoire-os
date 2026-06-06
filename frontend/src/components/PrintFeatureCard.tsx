import type { PrintableFeatureCard as PrintableFeatureCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';

/**
 * Condensed 3×5" feature card (VEG-267): one template serving individual
 * class / subclass / race / background features, tagged with its parent
 * ("Class · Fighter") so a printed feature is attributable at a glance.
 */
export default function PrintFeatureCard({ card }: { card: PrintableFeatureCardModel }) {
  const kindLabel = card.parent.kind.charAt(0).toUpperCase() + card.parent.kind.slice(1);

  return (
    <PrintCard name={card.name} tag={`${kindLabel} · ${card.parent.name}`}>
      <div className="flex flex-col gap-1 text-[9px] leading-snug">
        {card.level !== undefined && (
          <p className="text-[7px] font-semibold uppercase tracking-wide text-gray-500">
            Level {card.level}
          </p>
        )}
        <p className="line-clamp-[10]">{card.description}</p>
      </div>
    </PrintCard>
  );
}
