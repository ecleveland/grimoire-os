import { classFeatureIdentity } from '@grimoire-os/shared';
import PrintToggle from '@/components/PrintToggle';
import type { ClassFeature } from '@/lib/types';

interface FeatureChipsProps {
  features: ClassFeature[];
  /** Spacing for the wrapper, which differs between the class and subclass views. */
  className?: string;
}

/**
 * A chip per class or subclass feature, each adding it to the print set. Rows
 * the API hasn't given an id fall back to a plain chip, because a card can only
 * be addressed by id.
 */
export default function FeatureChips({ features, className }: FeatureChipsProps) {
  if (features.length === 0) return null;

  return (
    <div className={['flex flex-wrap gap-1', className].filter(Boolean).join(' ')}>
      {/* Keyed per row rather than by name, because a class can legally list one
          feature name at several levels, as Ability Score Improvement does at 4,
          8 and 12. */}
      {features.map(f =>
        f.id ? (
          <PrintToggle key={f.id} type="feature" id={f.id} name={f.name} variant="chip" />
        ) : (
          <span
            key={classFeatureIdentity(f)}
            className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
          >
            {f.name}
          </span>
        )
      )}
    </div>
  );
}
