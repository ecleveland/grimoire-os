interface StepPlaceholderProps {
  /** Step title, also rendered as the step heading. */
  title: string;
  /** One-line summary of what this step will collect once built. */
  summary: string;
  /** Linear ticket that fills in this step. */
  ticket: string;
}

/**
 * Shared placeholder body for the not-yet-built wizard steps. Each optional step
 * (Origin/Abilities/Equipment/Spells) renders one of these so the shell is
 * independently shippable and testable; the per-step slices replace it with real
 * content.
 */
export default function StepPlaceholder({ title, summary, ticket }: StepPlaceholderProps) {
  // Slugify so multi-word/punctuated titles still yield a valid, collision-free
  // id for the aria-labelledby association.
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const headingId = `step-${slug}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-xl font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      <p className="text-gray-600 dark:text-gray-400">{summary}</p>
      <p className="text-sm text-gray-400 dark:text-gray-500">
        This step is optional and can be skipped — it lands in {ticket}.
      </p>
    </section>
  );
}
