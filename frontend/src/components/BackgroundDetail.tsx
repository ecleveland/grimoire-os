import type { SrdBackground } from '@/lib/types';

const SECTION_HEADING = 'text-sm font-medium text-gray-700 dark:text-gray-300';
const BODY_TEXT = 'text-sm text-gray-600 dark:text-gray-400';
const SUBTITLE_TEXT = 'text-sm text-gray-500 dark:text-gray-400';

/**
 * Expanded background view shared by the background list cards and the
 * background page: description, proficiencies, languages, equipment, features,
 * and the four roleplay tables. Every section is dropped when the background
 * has nothing to put in it.
 *
 * `headingLevel` is what the caller already spent on the background's name: the
 * list card titles each row with an h2, the page with an h1, so the same
 * sections have to sit at different depths to keep both outlines whole. Feature
 * names then land one level below their section.
 */
export default function BackgroundDetail({
  background,
  headingLevel = 3,
}: {
  background: SrdBackground;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const FeatureHeading = headingLevel === 2 ? 'h3' : 'h4';
  // A background can reach here without its features array when the API breaks
  // its contract, and losing the whole card over that hides the rest of it.
  const features = background.features ?? [];

  return (
    <div className="space-y-3">
      {background.description && <p className={BODY_TEXT}>{background.description}</p>}

      {background.toolProficiencies.length > 0 && (
        <div>
          <Heading className={SECTION_HEADING}>Tool Proficiencies</Heading>
          <p className={BODY_TEXT}>{background.toolProficiencies.join(', ')}</p>
        </div>
      )}

      {background.languages > 0 && (
        <div>
          <Heading className={SECTION_HEADING}>Languages</Heading>
          <p className={BODY_TEXT}>
            {background.languages} additional language{background.languages === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {background.equipment && (
        <div>
          <Heading className={SECTION_HEADING}>Equipment</Heading>
          <p className={BODY_TEXT}>{background.equipment}</p>
        </div>
      )}

      {features.length > 0 && (
        <div>
          <Heading className={SECTION_HEADING}>Features</Heading>
          <div className="mt-1 space-y-2">
            {features.map(feature => (
              <div key={feature.name}>
                <FeatureHeading className="text-sm font-semibold text-gray-900 dark:text-white">
                  {feature.name}
                </FeatureHeading>
                <p className={BODY_TEXT}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <RoleplayList
        heading="Personality Traits"
        entries={background.personalityTraits}
        headingTag={Heading}
      />
      <RoleplayList heading="Ideals" entries={background.ideals} headingTag={Heading} />
      <RoleplayList heading="Bonds" entries={background.bonds} headingTag={Heading} />
      <RoleplayList heading="Flaws" entries={background.flaws} headingTag={Heading} />
    </div>
  );
}

/**
 * The skills-and-origin-feat line under a background's name. It owns its own
 * styling; `className` is for the spacing the caller needs around it.
 */
export function BackgroundSubtitle({
  background,
  className,
}: {
  background: SrdBackground;
  className?: string;
}) {
  return (
    <p className={`${SUBTITLE_TEXT}${className ? ` ${className}` : ''}`}>
      Skills: {background.skillProficiencies.join(', ')}
      {background.originFeat && (
        <>
          {' '}
          &middot; Feat: {background.originFeat.name}
          {background.originFeatOption && <> ({background.originFeatOption})</>}
        </>
      )}
    </p>
  );
}

/** One of the four roleplay tables. Renders nothing when the background has no entries. */
function RoleplayList({
  heading,
  entries,
  headingTag: Heading,
}: {
  heading: string;
  entries: string[];
  /** The section heading tag its parent chose, so all eight sections match. */
  headingTag: 'h2' | 'h3';
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <Heading className={SECTION_HEADING}>{heading}</Heading>
      <ul className={`${BODY_TEXT} list-disc list-inside space-y-0.5`}>
        {entries.map((entry, i) => (
          // Free text a homebrew author types, under no uniqueness constraint, so
          // the text is not a key. The list is static and never reordered in place.
          <li key={i}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
