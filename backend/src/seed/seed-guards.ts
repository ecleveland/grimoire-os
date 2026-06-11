/**
 * Pre-seed data guards (VEG-308).
 *
 * SRD content tables are upserted by name within the contentSource='srd'
 * partition, so a duplicate name — inside one source file or across the files
 * feeding the same table — would silently last-write-wins clobber a row.
 * Seeding runs this guard over every name from every source first and fails
 * loudly instead.
 */
export function assertUniqueSeedNames(
  kind: string,
  sources: Record<string, readonly string[]>
): void {
  const seenIn = new Map<string, string[]>();
  for (const [source, names] of Object.entries(sources)) {
    for (const name of names) {
      const entry = seenIn.get(name);
      if (entry) entry.push(source);
      else seenIn.set(name, [source]);
    }
  }

  const duplicates = [...seenIn.entries()].filter(([, srcs]) => srcs.length > 1);
  if (duplicates.length === 0) return;

  const lines = duplicates.map(([name, srcs]) => `  "${name}" (${srcs.join(', ')})`);
  throw new Error(
    `Seed aborted: duplicate ${kind} name${duplicates.length === 1 ? '' : 's'} across sources:\n` +
      lines.join('\n')
  );
}
