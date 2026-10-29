import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CharactersService } from '../characters.service';
import { toDto, toDtoArray } from '../../common/serialization/to-dto';
import { captureCharacterSnapshot, type SnapshotClient } from './capture-snapshot';
import {
  CharacterSnapshotDto,
  CharacterSnapshotSummaryDto,
} from './dto/character-snapshot-response.dto';

/** Reads and deletes a character's snapshots. Only the character's owner may. */
@Injectable()
export class CharacterSnapshotsService {
  constructor(
    private prisma: PrismaService,
    private characters: CharactersService
  ) {}

  /**
   * 404 for an unknown character, 403 for one owned by someone else. Returns the
   * live columns a snapshot does not store, which `get` puts back.
   */
  private async assertOwnership(characterId: string, userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true, campaignId: true, createdAt: true },
    });
    if (!character) {
      throw new NotFoundException(`Character "${characterId}" not found`);
    }
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  /**
   * Copy the character's current row into a new snapshot. Checks no ownership,
   * so callers authorise first. Pass a transaction client to make the copy part
   * of the caller's write.
   */
  capture(
    characterId: string,
    { label }: { label?: string } = {},
    tx?: SnapshotClient
  ): Promise<{ id: string }> {
    return captureCharacterSnapshot(tx ?? this.prisma, characterId, label);
  }

  /** The character's snapshots, newest first, without their stored sheets. */
  async list(characterId: string, userId: string): Promise<CharacterSnapshotSummaryDto[]> {
    await this.assertOwnership(characterId, userId);
    const rows = await this.prisma.characterSnapshot.findMany({
      where: { characterId },
      select: { id: true, level: true, label: true, takenAt: true },
      orderBy: { takenAt: 'desc' },
    });
    return toDtoArray(CharacterSnapshotSummaryDto, rows);
  }

  /**
   * One snapshot with its sheet rebuilt into a full character payload.
   *
   * The stored data lacks the omitted columns, so the rebuilt row takes its
   * identity and ownership from the live character and is spread last so stored
   * data can never override them. `version` is 0 because a snapshot is never
   * written through the optimistic lock, and `updatedAt` is when the copy was
   * taken.
   */
  async get(
    characterId: string,
    snapshotId: string,
    userId: string
  ): Promise<CharacterSnapshotDto> {
    const character = await this.assertOwnership(characterId, userId);
    const snapshot = await this.prisma.characterSnapshot.findFirst({
      where: { id: snapshotId, characterId },
    });
    if (!snapshot) {
      throw new NotFoundException(`Snapshot "${snapshotId}" not found`);
    }
    // Cast needed: the JSON column is untyped. Safe because capture stores the
    // full row minus exactly the columns set here.
    const row = {
      ...(snapshot.data as object),
      id: character.id,
      userId: character.userId,
      campaignId: character.campaignId,
      version: 0,
      createdAt: character.createdAt,
      updatedAt: snapshot.takenAt,
    } as Prisma.CharacterGetPayload<object>;
    const data = await this.characters.toCharacterDto(row);
    return toDto(CharacterSnapshotDto, {
      id: snapshot.id,
      level: snapshot.level,
      label: snapshot.label,
      takenAt: snapshot.takenAt,
      data,
    });
  }

  /** Delete one snapshot. 404 when it does not exist under this character. */
  async remove(characterId: string, snapshotId: string, userId: string): Promise<void> {
    await this.assertOwnership(characterId, userId);
    const { count } = await this.prisma.characterSnapshot.deleteMany({
      where: { id: snapshotId, characterId },
    });
    if (count === 0) {
      throw new NotFoundException(`Snapshot "${snapshotId}" not found`);
    }
  }
}
