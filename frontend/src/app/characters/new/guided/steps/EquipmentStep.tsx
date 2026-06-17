import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiQuery } from '@/lib/query';
import type { EquipmentChoiceItem, SrdBackground, SrdClass } from '@/lib/types';
import {
  parseBackgroundEquipment,
  parseStartingGold,
  resolveEquipment,
  type ParsedEquipmentOption,
} from './equipment-resolve';
import type { WizardStepProps } from './types';

const cardClass = 'rounded-md border border-gray-200 p-3 dark:border-gray-700';

/** "Longbow + Arrow ×20" — render a bundle's items as one human label. */
function bundleLabel(items: EquipmentChoiceItem[]): string {
  return items.map(i => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(' + ');
}

const COIN_DISPLAY_ORDER = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;

/** "Holy Symbol, Book (prayers), 8 gp" — summarize a background A/B option. */
function optionSummary(opt: ParsedEquipmentOption): string {
  const parts = opt.items.map(i => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name));
  for (const k of COIN_DISPLAY_ORDER) {
    if (opt.currency[k]) parts.push(`${opt.currency[k]} ${k}`);
  }
  return parts.join(', ') || '—';
}

/**
 * Step 4 — Starting equipment (VEG-382). Resolves the class's structured
 * `equipmentChoices` (choice groups + always-granted `guaranteed` items, with a
 * mutually-exclusive starting-gold alternative) and the background's free-text
 * `equipment` (parsed into its A/B alternative when it follows the SRD "Choose A
 * or B" shape, else surfaced verbatim) into the draft's `inventory` + `currency`.
 *
 * This step is the sole writer of `inventory`/`currency`, so it re-derives and
 * rewrites the full resolved result from its selections on every change. Like the
 * Abilities step, the selection UI state is local and resets on remount (the
 * resolved inventory survives in the draft); persisting working state across
 * remounts is part of the VEG-393 builder-state work.
 */
export default function EquipmentStep({ value, onChange }: WizardStepProps) {
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes');
  const backgroundsQuery = useApiQuery<SrdBackground[]>('/srd/backgrounds');
  const classes = classesQuery.data;
  const backgrounds = backgroundsQuery.data;

  const selectedClass = useMemo(
    () => classes?.find(c => c.name === value.class),
    [classes, value.class]
  );
  const selectedBackground = useMemo(
    () => backgrounds?.find(b => b.name === value.background),
    [backgrounds, value.background]
  );
  const classEquip = selectedClass?.equipmentChoices ?? null;
  const parsedBackground = useMemo(
    () =>
      selectedBackground?.equipment ? parseBackgroundEquipment(selectedBackground.equipment) : null,
    [selectedBackground]
  );

  const [classMode, setClassMode] = useState<'equipment' | 'gold'>('equipment');
  const [choiceSelections, setChoiceSelections] = useState<number[][]>([]);
  const [bgMode, setBgMode] = useState<'a' | 'b'>('a');

  // This step owns the draft's inventory + currency outright, so it rewrites the
  // fully-resolved result whenever a selection or the SRD data changes. The ref
  // dedups: re-running the effect (e.g. an unrelated re-render) only calls
  // onChange when the resolved result actually differs, so there's no loop.
  const lastWritten = useRef('');
  useEffect(() => {
    const resolved = resolveEquipment({
      classEquip,
      background: parsedBackground,
      selections: { classMode, choiceSelections, bgMode },
    });
    const key = JSON.stringify(resolved);
    if (key !== lastWritten.current) {
      lastWritten.current = key;
      onChange(resolved);
    }
  }, [classEquip, parsedBackground, classMode, choiceSelections, bgMode, onChange]);

  const pickBundle = (groupIndex: number, bundleIndex: number, choose: number) => {
    setChoiceSelections(prev => {
      const next = prev.map(g => [...g]);
      while (next.length <= groupIndex) next.push([]);
      const current = next[groupIndex];
      if (choose <= 1) {
        next[groupIndex] = [bundleIndex];
      } else if (current.includes(bundleIndex)) {
        next[groupIndex] = current.filter(i => i !== bundleIndex);
      } else if (current.length < choose) {
        next[groupIndex] = [...current, bundleIndex];
      }
      // else: at the cap and not already picked — ignore.
      return next;
    });
  };
  const isPicked = (groupIndex: number, bundleIndex: number) =>
    (choiceSelections[groupIndex] ?? []).includes(bundleIndex);

  const goldAmount = classEquip?.startingGold ? parseStartingGold(classEquip.startingGold) : null;

  return (
    <section aria-labelledby="step-equipment-heading" className="space-y-4">
      <h2
        id="step-equipment-heading"
        className="text-xl font-semibold text-gray-900 dark:text-white"
      >
        Equipment
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Take the starting equipment from your class and background, or trade it for starting gold to
        shop later.
      </p>

      {classEquip ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Class equipment
          </legend>
          <div
            role="radiogroup"
            aria-label="Class equipment source"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={classMode === 'equipment'}
              onClick={() => setClassMode('equipment')}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                classMode === 'equipment'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Take starting equipment
            </button>
            {goldAmount != null && (
              <button
                type="button"
                role="radio"
                aria-checked={classMode === 'gold'}
                onClick={() => setClassMode('gold')}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  classMode === 'gold'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                Take starting gold ({goldAmount} gp)
              </button>
            )}
          </div>

          {classMode === 'equipment' ? (
            <>
              {classEquip.choices.map((choice, gi) => (
                <fieldset key={gi} className={cardClass} aria-label={`Equipment choice ${gi + 1}`}>
                  <legend className="px-1 text-sm text-gray-500 dark:text-gray-400">
                    Choose {choice.choose}
                  </legend>
                  <div className="space-y-1">
                    {choice.from.map((bundle, bi) => (
                      <label
                        key={bi}
                        className="flex items-center gap-2 text-sm text-gray-900 dark:text-white"
                      >
                        <input
                          type={choice.choose <= 1 ? 'radio' : 'checkbox'}
                          name={`equip-group-${gi}`}
                          checked={isPicked(gi, bi)}
                          onChange={() => pickBundle(gi, bi, choice.choose)}
                          className="accent-indigo-600"
                        />
                        <span>{bundleLabel(bundle.items)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {classEquip.guaranteed && classEquip.guaranteed.length > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Always included:{' '}
                  <span className="text-gray-900 dark:text-white">
                    {classEquip.guaranteed
                      .map(g => (g.quantity > 1 ? `${g.name} ×${g.quantity}` : g.name))
                      .join(', ')}
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className={`${cardClass} text-sm text-gray-700 dark:text-gray-200`}>
              You’ll start with <span className="font-medium">{goldAmount} gp</span> from your class
              and buy equipment later.
            </p>
          )}
        </fieldset>
      ) : selectedClass ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No starting-equipment data for this class.
        </p>
      ) : null}

      {parsedBackground ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Background equipment
          </legend>
          <div role="radiogroup" aria-label="Background equipment option" className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
              <input
                type="radio"
                name="bg-equip"
                checked={bgMode === 'a'}
                onChange={() => setBgMode('a')}
                className="accent-indigo-600"
              />
              <span>{optionSummary(parsedBackground.a)}</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
              <input
                type="radio"
                name="bg-equip"
                checked={bgMode === 'b'}
                onChange={() => setBgMode('b')}
                className="accent-indigo-600"
              />
              <span>{optionSummary(parsedBackground.b)}</span>
            </label>
          </div>
        </fieldset>
      ) : selectedBackground?.equipment ? (
        <div className={`${cardClass} space-y-1`}>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Background equipment
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{selectedBackground.equipment}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Add these to your inventory on the character sheet after creating.
          </p>
        </div>
      ) : null}

      <section aria-label="Resolved equipment" className={`${cardClass} space-y-2`}>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Starting inventory</p>
        {value.inventory.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-gray-900 dark:text-white">
            {value.inventory.map(item => (
              <li key={item.name}>
                {item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No items yet.</p>
        )}
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Starting gold: <span data-testid="starting-gp">{value.currency?.gp ?? 0}</span> gp
        </p>
      </section>
    </section>
  );
}
