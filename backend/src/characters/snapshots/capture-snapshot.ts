import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Columns a snapshot does not store. They identify, own or version the live row
 * rather than describe the character, and reading a snapshot back takes them
 * from the live character instead.
 */
export const SNAPSHOT_OMITTED_COLUMNS = [
  'id',
  'userId',
  'campaignId',
  'version',
  'createdAt',
  'updatedAt',
] as const;

/** Accepts either the root client or a `$transaction` client. */
export type SnapshotClient =
  Pick<PrismaService, 'character' | 'characterSnapshot'> | Prisma.TransactionClient;

/**
 * Copy a character's stored row into a new snapshot.
 *
 * A plain function rather than a service method, so `CharactersService.update`
 * can call it inside its own transaction without depending on
 * `CharacterSnapshotsService`, which itself depends on `CharactersService`.
 * Pass a transaction client to make the copy part of the caller's write.
 */
export async function captureCharacterSnapshot(
  client: SnapshotClient,
  characterId: string,
  label?: string
): Promise<{ id: string }> {
  const row: Record<string, unknown> = await client.character.findUniqueOrThrow({
    where: { id: characterId },
  });
  const omitted: readonly string[] = SNAPSHOT_OMITTED_COLUMNS;
  const data = Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.includes(key)));
  return client.characterSnapshot.create({
    data: {
      characterId,
      level: row.level as number,
      label: label ?? null,
      // Cast needed: a plain record is not structurally an InputJsonValue. Safe
      // because the only DateTime columns, createdAt and updatedAt, are stripped
      // above, so every remaining value is a string, number, boolean, array or
      // JSON blob.
      data: data as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}
