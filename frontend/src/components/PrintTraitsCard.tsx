import { PRINTABLE_TRAIT_SUMMARY_CAP } from '@grimoire-os/shared';
import type {
  PrintableBackgroundCard,
  PrintableRaceCard,
  PrintableSpeciesCard,
} from '@grimoire-os/shared';
import PrintCard from './PrintCard';

type TraitsCard = PrintableRaceCard | PrintableSpeciesCard | PrintableBackgroundCard;

/**
 * Condensed 3×5" trait-summary card (VEG-267). Races, species, and
 * backgrounds share an identical view-model shape (name + capped trait
 * summary), so one body serves all three, tagged by type. The producer
 * already trims to the shared cap; the slice here is a defensive bound.
 */
export default function PrintTraitsCard({ card }: { card: TraitsCard }) {
  const tag = card.type.charAt(0).toUpperCase() + card.type.slice(1);
  const traits = card.traits.slice(0, PRINTABLE_TRAIT_SUMMARY_CAP);

  return (
    <PrintCard name={card.name} tag={tag}>
      <ul className="space-y-0.5 text-[9px] leading-snug">
        {traits.map((trait, i) => (
          <li key={`${trait.name}-${i}`}>
            <span className="font-semibold italic">{trait.name}.</span> {trait.description}
          </li>
        ))}
      </ul>
    </PrintCard>
  );
}
