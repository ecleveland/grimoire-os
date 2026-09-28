/**
 * Text placeholder for a page or panel that is still fetching. Pages that
 * hand-type their own loading line should move to this component.
 */
export default function LoadingState({
  label = 'Loading…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`text-gray-500 dark:text-gray-400 ${className}`}
    >
      {label}
    </div>
  );
}
