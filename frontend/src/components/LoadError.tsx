/**
 * Inline failure state for a page or panel whose query errored. Pass the
 * query's `refetch` as `onRetry`; it is called with no arguments.
 */
export default function LoadError({
  message = 'Failed to load.',
  onRetry,
  className = '',
}: {
  message?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 text-sm text-red-600 dark:text-red-400 ${className}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => onRetry()}
        className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
