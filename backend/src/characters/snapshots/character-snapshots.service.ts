import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CharactersService } from '../characters.service';
import { toDto, toDtoArray } from '../../common/serialization/to-dto';
import { GLOBAL_VALIDATION_PIPE_OPTIONS, VALIDATOR_STRICTNESS } from '../../bootstrap-config';
import { CharacterDto } from '../dto/character-response.dto';
import { CreateCharacterDto } from '../dto/create-character.dto';
import {
  captureCharacterSnapshot,
  type CapturedSnapshot,
  type SnapshotClient,
} from './capture-snapshot';
import { buildCopyInput } from './copy-snapshot';
import {
  CharacterSnapshotDto,
  CharacterSnapshotSummaryDto,
} from './dto/character-snapshot-response.dto';

/** The most snapshots one character keeps, hand-saved and level-up ones together. */
export const CHARACTER_SNAPSHOT_CAP = 50;

// Flattens nested validation errors so the 400 names the failing field instead
// of arriving empty.
function collectMessages(errors: ValidationError[]): string[] {
  return errors.flatMap(e => [
    ...Object.values(e.constraints ?? {}),
    ...collectMessages(e.children ?? []),
  ]);
}

/** Saves, reads and deletes a character's snapshots. Only the character's owner may. */
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
  ): Promise<CapturedSnapshot> {
    return captureCharacterSnapshot(tx ?? this.prisma, characterId, label);
  }

  /**
   * Save a snapshot by hand. 400 once the character holds
   * `CHARACTER_SNAPSHOT_CAP` snapshots.
   *
   * The cap guards this route only. The level-up snapshot stays unconditional,
   * because refusing a level-up over a full history would block play, but it
   * still counts toward the cap. Count and insert are two statements with no
   * transaction, so two concurrent saves can land one row over the cap, which
   * is harmless for a soft guard.
   */
  async create(
    characterId: string,
    userId: string,
    { label }: { label?: string } = {}
  ): Promise<CharacterSnapshotSummaryDto> {
    await this.assertOwnership(characterId, userId);
    const count = await this.prisma.characterSnapshot.count({ where: { characterId } });
    if (count >= CHARACTER_SNAPSHOT_CAP) {
      throw new BadRequestException(
        `A character can keep at most ${CHARACTER_SNAPSHOT_CAP} snapshots. Delete one to save another.`
      );
    }
    const row = await captureCharacterSnapshot(this.prisma, characterId, label);
    return toDto(CharacterSnapshotSummaryDto, row);
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

  /**
   * Create a new character for the caller from a snapshot's stored sheet, with
   * play state reset by `buildCopyInput`. 404 when the snapshot does not exist
   * under this character, 400 naming the field when the stored sheet no longer
   * passes `CreateCharacterDto`.
   *
   * The sheet goes through the DTO and `CharactersService.create` rather than a
   * raw insert, so the copy gets the same treatment as any other new character.
   * Unknown keys are refused, a campaign id needs the caller's membership, the
   * class id is checked or derived again, and the inventory gets fresh gear
   * snapshots. Validation mirrors the global pipe. The copy starts with no
   * snapshots of its own.
   */
  async copy(
    characterId: string,
    snapshotId: string,
    userId: string,
    { name, campaignId }: { name?: string; campaignId?: string } = {}
  ): Promise<CharacterDto> {
    await this.assertOwnership(characterId, userId);
    const snapshot = await this.prisma.characterSnapshot.findFirst({
      where: { id: snapshotId, characterId },
      select: { level: true, data: true },
    });
    if (!snapshot) {
      throw new NotFoundException(`Snapshot "${snapshotId}" not found`);
    }
    // Cast needed: the JSON column is untyped. Safe because capture always
    // stores an object.
    const input = buildCopyInput(snapshot.data as Record<string, unknown>, snapshot.level, name);
    const dto = plainToInstance(
      CreateCharacterDto,
      { ...input, ...(campaignId && { campaignId }) },
      GLOBAL_VALIDATION_PIPE_OPTIONS.transformOptions
    );
    const errors = await validate(dto, VALIDATOR_STRICTNESS);
    if (errors.length > 0) {
      throw new BadRequestException(collectMessages(errors));
    }
    return this.characters.create(userId, dto);
  }
}
