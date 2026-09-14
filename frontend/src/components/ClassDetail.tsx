import FeatureChips from '@/components/FeatureChips';
import type { SrdClass } from '@/lib/types';

/**
 * Expanded class view shared by the class list cards and the class page:
 * description, proficiencies, skill choices, and a chip per feature that adds it
 * to the print set.
 */
export default function ClassDetail({ cls }: { cls: SrdClass }) {
  // A row can reach here without its features array when the API breaks its
  // contract, and losing the whole card over that hides the rest of the class.
  const features = cls.features ?? [];
  const skills = cls.skillChoices.join(', ');
  const skillLine =
    cls.skillChoices.length === 0
      ? 'None'
      : cls.numSkillChoices > 0
        ? `Choose ${cls.numSkillChoices} from: ${skills}`
        : skills;

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
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Tool Proficiencies</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cls.toolProficiencies.length > 0 ? cls.toolProficiencies.join(', ') : 'None'}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Skill Choices</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{skillLine}</p>
      </div>
      {features.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Features</h3>
          <FeatureChips features={features} className="mt-1" />
        </div>
      )}
    </div>
  );
}
