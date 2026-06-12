import type { SrdFeat } from '@/lib/types';

/**
 * Expanded feat view shared by the feat browse modal and the unified-search
 * result card (VEG-295): description plus the optional bulleted benefits list.
 */
export default function FeatDetail({ feat }: { feat: SrdFeat }) {
  return (
    <div className="space-y-3">
      {feat.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
          {feat.description}
        </p>
      )}
      {feat.benefits && feat.benefits.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Benefits</h3>
          <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
            {feat.benefits.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
