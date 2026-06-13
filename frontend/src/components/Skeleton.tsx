/**
 * Presentational placeholder for content that hasn't resolved yet. Reserves
 * layout space — sized via `className` (width/height/margins) — with a subtle
 * pulse, so the real content slots in without shifting surrounding elements
 * (VEG-339). Decorative by default (`aria-hidden`): the real content announces
 * itself once it arrives, so the placeholder stays out of the a11y tree.
 */
export default function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="skeleton"
      aria-hidden="true"
      className={`inline-block animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}
