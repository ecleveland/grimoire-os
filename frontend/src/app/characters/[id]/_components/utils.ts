// Ability-score math + ability/skill maps moved to a neutral, route-agnostic
// home (@/lib/ability-math) so the guided builder can share them with the sheet.
// Re-exported here so existing sheet-component imports stay valid.
export * from '@/lib/ability-math';

const SNAPSHOT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A snapshot's `takenAt` as a short date such as `12 Oct 2026`, in the viewer's time zone. */
export function formatSnapshotDate(iso: string): string {
  return SNAPSHOT_DATE_FORMAT.format(new Date(iso));
}
