import { classFeatureIdentity } from '@grimoire-os/shared';
import PrintToggle from '@/components/PrintToggle';
import type { SrdClass } from '@/lib/types';

/**
 * Expanded class view shared by the class list cards and the class page:
 * description, proficiencies, skill choices, and a chip per feature that adds it
 * to the print set.
 */
export default function ClassDetail({ cls }: { cls: SrdClass }) {
  return (
    <div className="space-y-3">
      {cls.description && (
        <p className="text-gray-600 dark:text-gray-400 text-sm">{cls.description}</p>
      )}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Saving Throws</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cls.savingThrows.length > 0 ? cls.savingThrows.join(', ') : 'None'}
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
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Skill Choices</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cls.skillChoices.length > 0 ? cls.skillChoices.join(', ') : 'None'}
        </p>
      </div>
      {cls.features.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Features</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Keyed per row rather than by name, because a class can legally list
                one feature name at several levels, as Ability Score Improvement
                does at 4, 8 and 12. */}
            {cls.features.map(f =>
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
        </div>
      )}
    </div>
  );
}
