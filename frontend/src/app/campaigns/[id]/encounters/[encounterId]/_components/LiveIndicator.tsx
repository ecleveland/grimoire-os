interface Props {
  lastUpdatedAt: number;
  refreshFailed: boolean;
}

// Tells a read-only viewer the tracker follows the DM on its own, and when the
// state on screen arrived. A failed refresh greys the dot and keeps the time
// of the last state that did arrive. It is not a live region, because the
// time changes on every poll and a screen reader would read it out each time.
export default function LiveIndicator({ lastUpdatedAt, refreshFailed }: Props) {
  const time = new Date(lastUpdatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <span
      data-testid="live-indicator"
      title={
        refreshFailed ? 'The last refresh failed. Showing the last state received.' : undefined
      }
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400${
        refreshFailed ? ' opacity-60' : ''
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${refreshFailed ? 'bg-gray-400' : 'bg-emerald-500 animate-pulse'}`}
      />
      Live &middot; {refreshFailed ? 'last update' : 'updated'} {time}
    </span>
  );
}
