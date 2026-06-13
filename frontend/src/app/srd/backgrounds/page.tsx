import Collapsible from '@/components/Collapsible';
import PrintToggle from '@/components/PrintToggle';
import { fetchSrdList } from '@/lib/srd-server';
import type { SrdBackground } from '@/lib/types';

// Public reference content, server-rendered for SEO and a content-first first
// paint (VEG-320). See src/lib/srd-server.ts for the caching/URL rationale.
export const dynamic = 'force-dynamic';

export default async function BackgroundListPage() {
  let backgrounds: SrdBackground[];
  try {
    backgrounds = await fetchSrdList<SrdBackground[]>('/srd/backgrounds');
  } catch (err) {
    console.error('Failed to load backgrounds:', err);
    return (
      <div className="text-red-600 dark:text-red-400">
        Failed to load backgrounds. Please try again later.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Backgrounds</h1>
      <div className="space-y-4">
        {backgrounds.map(bg => (
          <Collapsible
            key={bg.id}
            summary={
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{bg.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Skills: {bg.skillProficiencies.join(', ')}
                  {bg.feat && <> &middot; Feat: {bg.feat}</>}
                </p>
              </div>
            }
            headerAside={
              <PrintToggle type="background" id={bg.id} name={bg.name} className="mr-4 shrink-0" />
            }
          >
            {bg.description && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">{bg.description}</p>
            )}
            {bg.abilityScores && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ability Scores
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose {bg.abilityScores.choose} from: {bg.abilityScores.options.join(', ')}
                </p>
              </div>
            )}
            {bg.toolProficiencies.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tool Proficiencies
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {bg.toolProficiencies.join(', ')}
                </p>
              </div>
            )}
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
