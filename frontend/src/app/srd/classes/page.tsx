import Collapsible from '@/components/Collapsible';
import PrintToggle from '@/components/PrintToggle';
import { fetchSrdList } from '@/lib/srd-server';
import type { SrdClass } from '@/lib/types';

// Public reference content, server-rendered for SEO and a content-first first
// paint (VEG-320). Rendered per request (the build runs without a backend) while
// the upstream fetch is revalidate-cached — see src/lib/srd-server.ts.
export const dynamic = 'force-dynamic';

export default async function ClassListPage() {
  let classes: SrdClass[];
  try {
    classes = await fetchSrdList<SrdClass[]>('/srd/classes');
  } catch (err) {
    console.error('Failed to load classes:', err);
    return (
      <div className="text-red-600 dark:text-red-400">
        Failed to load classes. Please try again later.
      </div>
    );
  }

  // Invariant: every feature from the API carries a row id (the classes endpoint
  // includes feature rows), so each renders as a print toggle below. An id-less
  // feature silently degrades to an inert chip — surface it loudly, since a
  // backend contract regression here would otherwise drop toggles unnoticed.
  const idless = classes.flatMap(cls => cls.features).filter(f => !f.id);
  if (idless.length > 0) {
    console.error(
      'srd/classes: class features rendered without an id — print toggle unavailable (backend contract regression):',
      idless.map(f => f.name)
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Classes</h1>
      <div className="space-y-4">
        {classes.map(cls => (
          <Collapsible
            key={cls.id}
            summary={
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{cls.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Hit Die: {cls.hitDie} &middot; {cls.primaryAbilities.join(', ')}
                </p>
              </div>
            }
          >
            {cls.description && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">{cls.description}</p>
            )}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Saving Throws
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cls.savingThrows.join(', ')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Armor Proficiencies
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cls.armorProficiencies.length > 0 ? cls.armorProficiencies.join(', ') : 'None'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Weapon Proficiencies
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cls.weaponProficiencies.length > 0 ? cls.weaponProficiencies.join(', ') : 'None'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Skill Choices
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cls.skillChoices.join(', ')}
              </p>
            </div>
            {cls.features.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Features</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {cls.features.map(f =>
                    f.id ? (
                      <PrintToggle
                        key={f.name}
                        type="feature"
                        id={f.id}
                        name={f.name}
                        variant="chip"
                      />
                    ) : (
                      <span
                        key={f.name}
                        className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
                      >
                        {f.name}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
