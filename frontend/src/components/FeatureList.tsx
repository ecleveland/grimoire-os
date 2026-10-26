'use client';

import { useState } from 'react';
import { classFeatureIdentity } from '@grimoire-os/shared';
import FeatureText from '@/components/FeatureText';
import PrintToggle from '@/components/PrintToggle';
import type { ClassFeature } from '@/lib/types';

interface FeatureListProps {
  features: ClassFeature[];
  /**
   * Open shows every row with no toggle, as the class page does. Closed puts the
   * rows behind a Show N features button, so a class list card stays short.
   */
  defaultOpen: boolean;
  /** Spacing for the wrapper, which differs between the class and subclass views. */
  className?: string;
}

/**
 * Class or subclass features in level order, each with its level and full text.
 * A row with an id answers to it as an anchor, because a feature search hit
 * links to /srd/classes/<classId>#<featureId>, and carries a print toggle. Rows
 * the API hasn't given an id get neither, because a card can only be addressed
 * by id.
 *
 * The collapsed rows are toggled with the `hidden` attribute instead of
 * mounting on open, as Collapsible does, so their anchors are always in the DOM.
 */
export default function FeatureList({ features, defaultOpen, className }: FeatureListProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (features.length === 0) return null;

  // Stable, so a name repeated at one level keeps the API's order.
  const sorted = [...features].sort((a, b) => a.level - b.level);
  const count = features.length;

  return (
    <div className={className}>
      {!defaultOpen && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
        >
          {open ? 'Hide features' : `Show ${count} ${count === 1 ? 'feature' : 'features'}`}
        </button>
      )}
      <div hidden={!open} className={defaultOpen ? 'space-y-2' : 'mt-2 space-y-2'}>
        {/* Keyed per row rather than by name, because a class can legally list one
            feature name at several levels, as Ability Score Improvement does at 4,
            8 and 12. */}
        {sorted.map(f => (
          <div key={f.id ?? classFeatureIdentity(f)} id={f.id}>
            <span className="inline-flex items-center gap-2">
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                {f.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Level {f.level}</span>
              {f.id && <PrintToggle type="feature" id={f.id} name={f.name} />}
            </span>
            {f.description && <FeatureText description={f.description} />}
          </div>
        ))}
      </div>
    </div>
  );
}
