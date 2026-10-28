import type { PrintableFeatureOptionCard as PrintableFeatureOptionCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';

/**
 * 3×5" card for one option of a feature's option list (VEG-636), such as a
 * single Eldritch Invocation. The header carries the option name and the same
 * parent tag a feature card has. The body names the feature, then prints the
 * option's Prerequisite or Cost line when it has one, then its text.
 */
export default function PrintFeatureOptionCard({
  card,
}: {
  card: PrintableFeatureOptionCardModel;
}) {
  const kindLabel = card.parent.kind.charAt(0).toUpperCase() + card.parent.kind.slice(1);

  return (
    <PrintCard name={card.name} tag={`${kindLabel} · ${card.parent.name}`}>
      <div className="flex flex-col gap-1 text-[9px] leading-snug">
        <p className="text-[7px] font-semibold uppercase tracking-wide text-gray-500">
          {card.feature.name}
        </p>
        {card.meta && <p className="text-[8px] italic text-gray-600">{card.meta}</p>}
        <p className="line-clamp-[9]">{card.description}</p>
      </div>
    </PrintCard>
  );
}
