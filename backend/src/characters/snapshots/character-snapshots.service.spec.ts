import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CHARACTER_SNAPSHOT_CAP, CharacterSnapshotsService } from './character-snapshots.service';
import {
  CharacterSnapshotDto,
  CharacterSnapshotSummaryDto,
} from './dto/character-snapshot-response.dto';
import { SNAPSHOT_OMITTED_COLUMNS } from './capture-snapshot';
import { CharactersService } from '../characters.service';
import { CharacterDto } from '../dto/character-response.dto';
import { CreateCharacterDto } from '../dto/create-character.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignAuthService } from '../../auth/campaign-auth.service';
import { InventoryResolverService } from '../inventory/inventory-resolver.service';
import { ContentAccessService } from '../../srd/content-access.service';
import { createMockPrismaService, MockPrismaService } from '../../test/prisma-mock.factory';
import { CHARACTER_ID, USER_ID, USER_ID_2, mockCharacter } from '../../test/fixtures';

const SNAPSHOT_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
const CAMPAIGN_ID = 'f6a7b8c9-d0e1-4234-8fab-456789012345';
const TAKEN_AT = new Date('2026-10-01T12:00:00Z');
const SUMMARY_SELECT = { id: true, level: true, label: true, takenAt: true };

// The live row the ownership read returns. Its createdAt differs from the
// fixture's so the test can tell which side a rebuilt field came from.
const liveCharacter = {
  id: CHARACTER_ID,
  userId: USER_ID,
  campaignId: null,
  createdAt: new Date('2024-06-01T00:00:00Z'),
};

// What a snapshot stores: the fixture row without the omitted columns. The
// fixture also carries the read-only class projection, which no stored row has.
const PROJECTION_KEYS = ['class', 'classId', 'subclass', 'subclassId'];
const storedData = () => {
  const omitted: readonly string[] = [...SNAPSHOT_OMITTED_COLUMNS, ...PROJECTION_KEYS];
  return Object.fromEntries(
    Object.entries(mockCharacter).filter(([key]) => !omitted.includes(key))
  );
};

// A sheet stored before characters held a list of classes.
const legacyData = () => {
  const { classes: _classes, ...rest } = storedData();
  return {
    ...rest,
    class: 'Fighter',
    classId: 'cls-srd-fighter',
    subclass: 'Champion',
    hitDice: { dieType: 'd10', total: 5, spent: 3 },
  };
};
const FOLDED_CLASSES = [
  { classId: 'cls-srd-fighter', name: 'Fighter', level: 5, subclass: 'Champion', subclassId: null },
];

const snapshotRow = (over: Record<string, unknown> = {}) => ({
  id: SNAPSHOT_ID,
  characterId: CHARACTER_ID,
  level: 5,
  label: 'Level 5',
  data: storedData(),
  takenAt: TAKEN_AT,
  ...over,
});

describe('CharacterSnapshotsService', () => {
  let service: CharacterSnapshotsService;
  let prisma: MockPrismaService;
  let createCharacter: jest.SpyInstance;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    // The real CharactersService, so `get` proves the snapshot runs through the
    // same DTO builder, computed block included, as a live character read.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterSnapshotsService,
        CharactersService,
        ContentAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignAuthService, useValue: { assertCampaignMember: jest.fn() } },
        { provide: InventoryResolverService, useValue: { resolveInventory: jest.fn() } },
      ],
    }).compile();

    service = module.get(CharacterSnapshotsService);
    createCharacter = jest.spyOn(module.get(CharactersService), 'create');

    prisma.character.findUnique.mockResolvedValue(liveCharacter);
    // The fixture's class as a non-caster catalog row, for the computed block.
    prisma.srdClass.findFirst.mockResolvedValue(null);
    prisma.srdClass.findMany.mockResolvedValue([
      { id: 'cls-srd-fighter', name: 'Fighter', hitDie: 'd10', spellcasting: null },
    ]);
  });

  describe('ownership', () => {
    it('reads only the live columns a snapshot read needs (VEG-643)', async () => {
      prisma.characterSnapshot.findMany.mockResolvedValue([]);

      await service.list(CHARACTER_ID, USER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        select: { id: true, userId: true, campaignId: true, createdAt: true },
      });
    });

    it.each([
      ['list', (s: CharacterSnapshotsService) => s.list(CHARACTER_ID, USER_ID)],
      ['get', (s: CharacterSnapshotsService) => s.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID)],
      ['remove', (s: CharacterSnapshotsService) => s.remove(CHARACTER_ID, SNAPSHOT_ID, USER_ID)],
      ['create', (s: CharacterSnapshotsService) => s.create(CHARACTER_ID, USER_ID)],
      ['copy', (s: CharacterSnapshotsService) => s.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID)],
    ])('%s answers 404 for an unknown character (VEG-643)', async (_name, call) => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(call(service)).rejects.toThrow(NotFoundException);
      expect(prisma.characterSnapshot.findMany).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.findFirst).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.deleteMany).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.count).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      expect(createCharacter).not.toHaveBeenCalled();
    });

    it.each([
      ['list', (s: CharacterSnapshotsService) => s.list(CHARACTER_ID, USER_ID_2)],
      ['get', (s: CharacterSnapshotsService) => s.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID_2)],
      ['remove', (s: CharacterSnapshotsService) => s.remove(CHARACTER_ID, SNAPSHOT_ID, USER_ID_2)],
      ['create', (s: CharacterSnapshotsService) => s.create(CHARACTER_ID, USER_ID_2)],
      ['copy', (s: CharacterSnapshotsService) => s.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID_2)],
    ])('%s answers 403 for another user (VEG-643)', async (_name, call) => {
      await expect(call(service)).rejects.toThrow(ForbiddenException);
      expect(prisma.characterSnapshot.findMany).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.findFirst).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.deleteMany).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.count).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      expect(createCharacter).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('asks for the summary projection newest first and returns summary DTOs (VEG-643)', async () => {
      const newer = { id: 'snap-2', level: 5, label: 'Level 5', takenAt: TAKEN_AT };
      const older = { id: 'snap-1', level: 4, label: 'Level 4', takenAt: new Date('2026-09-01') };
      prisma.characterSnapshot.findMany.mockResolvedValue([newer, older]);

      const result = await service.list(CHARACTER_ID, USER_ID);

      expect(prisma.characterSnapshot.findMany).toHaveBeenCalledWith({
        where: { characterId: CHARACTER_ID },
        select: { id: true, level: true, label: true, takenAt: true },
        orderBy: { takenAt: 'desc' },
      });
      expect(result.map(row => row.id)).toEqual(['snap-2', 'snap-1']);
      expect(result[0]).toBeInstanceOf(CharacterSnapshotSummaryDto);
      expect({ ...result[1] }).toEqual(older);
    });
  });

  describe('get', () => {
    it('looks the snapshot up under the character it belongs to (VEG-643)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(snapshotRow());

      await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(prisma.characterSnapshot.findFirst).toHaveBeenCalledWith({
        where: { id: SNAPSHOT_ID, characterId: CHARACTER_ID },
      });
    });

    it('returns the metadata and the stored sheet as a computed character DTO (VEG-643)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(snapshotRow());

      const result = await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(result).toBeInstanceOf(CharacterSnapshotDto);
      expect(result).toMatchObject({
        id: SNAPSHOT_ID,
        level: 5,
        label: 'Level 5',
        takenAt: TAKEN_AT,
      });
      expect(result.data).toBeInstanceOf(CharacterDto);
      expect(result.data.name).toBe(mockCharacter.name);
      expect(result.data.hitPoints).toEqual(mockCharacter.hitPoints);
      expect(result.data.computed.proficiencyBonus).toBe(3);
    });

    it('fills the omitted columns from the live character and the snapshot time (VEG-643)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(snapshotRow());

      const { data } = await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(data).toMatchObject({
        id: CHARACTER_ID,
        userId: USER_ID,
        campaignId: null,
        version: 0,
        createdAt: liveCharacter.createdAt,
        updatedAt: TAKEN_AT,
      });
    });

    it('lets the live identity win over anything the stored data carries (VEG-643)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(
        snapshotRow({ data: { ...storedData(), id: 'other', userId: USER_ID_2, version: 9 } })
      );

      const { data } = await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(data.id).toBe(CHARACTER_ID);
      expect(data.userId).toBe(USER_ID);
      expect(data.version).toBe(0);
    });

    it('folds a pre-migration sheet into classes and hit-dice pools', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(snapshotRow({ data: legacyData() }));

      const { data } = await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(data.classes).toEqual(FOLDED_CLASSES);
      expect(data.hitDice).toEqual([{ dieType: 'd10', total: 5, spent: 3 }]);
      expect(data).toMatchObject({
        class: 'Fighter',
        classId: 'cls-srd-fighter',
        subclass: 'Champion',
        subclassId: null,
      });
    });

    it('reads a sheet already in the new shape as stored', async () => {
      const hitDice = [
        { dieType: 'd10', total: 3, spent: 1 },
        { dieType: 'd8', total: 2, spent: 0 },
      ];
      const classes = [
        { classId: null, name: 'Fighter', level: 3, subclass: null, subclassId: null },
        { classId: null, name: 'Rogue', level: 2, subclass: null, subclassId: null },
      ];
      prisma.characterSnapshot.findFirst.mockResolvedValue(
        snapshotRow({ data: { ...storedData(), classes, hitDice } })
      );

      const { data } = await service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(data.classes).toEqual(classes);
      expect(data.hitDice).toEqual(hitDice);
    });

    it('answers 404 for an unknown snapshot or one under another character (VEG-643)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(null);

      await expect(service.get(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('remove', () => {
    it('deletes the snapshot scoped to its character (VEG-643)', async () => {
      prisma.characterSnapshot.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).resolves.toBeUndefined();

      expect(prisma.characterSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { id: SNAPSHOT_ID, characterId: CHARACTER_ID },
      });
    });

    it('answers 404 when nothing was deleted (VEG-643)', async () => {
      prisma.characterSnapshot.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    const summaryRow = (label: string | null) => ({
      id: SNAPSHOT_ID,
      level: 5,
      label,
      takenAt: TAKEN_AT,
    });

    beforeEach(() => {
      prisma.character.findUniqueOrThrow.mockResolvedValue(mockCharacter);
    });

    it('captures through the root client below the cap and returns the summary (VEG-644)', async () => {
      prisma.characterSnapshot.count.mockResolvedValue(CHARACTER_SNAPSHOT_CAP - 1);
      prisma.characterSnapshot.create.mockResolvedValue(summaryRow('Before the dragon'));

      const result = await service.create(CHARACTER_ID, USER_ID, { label: 'Before the dragon' });

      expect(prisma.characterSnapshot.count).toHaveBeenCalledWith({
        where: { characterId: CHARACTER_ID },
      });
      expect(prisma.character.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
      expect(prisma.characterSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          characterId: CHARACTER_ID,
          level: 5,
          label: 'Before the dragon',
        }),
        select: SUMMARY_SELECT,
      });
      expect(result).toBeInstanceOf(CharacterSnapshotSummaryDto);
      expect({ ...result }).toEqual(summaryRow('Before the dragon'));
    });

    it('saves a null label when none is given (VEG-644)', async () => {
      prisma.characterSnapshot.count.mockResolvedValue(0);
      prisma.characterSnapshot.create.mockResolvedValue(summaryRow(null));

      const result = await service.create(CHARACTER_ID, USER_ID);

      expect(prisma.characterSnapshot.create.mock.calls[0][0].data.label).toBeNull();
      expect(result.label).toBeNull();
    });

    it('caps a character at 50 snapshots (VEG-644)', () => {
      expect(CHARACTER_SNAPSHOT_CAP).toBe(50);
    });

    it('answers 400 naming the cap once the character has 50 snapshots (VEG-644)', async () => {
      prisma.characterSnapshot.count.mockResolvedValue(50);

      const attempt = service.create(CHARACTER_ID, USER_ID, { label: 'One too many' });

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toThrow(/50/);
      expect(prisma.character.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('copy', () => {
    // The stored sheet mid-fight, so the test can see the resets land.
    const midFightData = () => ({
      ...storedData(),
      hitPoints: { max: 44, current: 9, temporary: 5 },
      conditions: ['Poisoned'],
      concentration: { spell: 'Bless' },
      exhaustion: 2,
    });
    const created = { id: 'new-character' };

    beforeEach(() => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({ level: 4, data: midFightData() });
      createCharacter.mockResolvedValue(created);
    });

    it('answers 404 for an unknown snapshot without creating anything (VEG-646)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue(null);

      await expect(service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.characterSnapshot.findFirst).toHaveBeenCalledWith({
        where: { id: SNAPSHOT_ID, characterId: CHARACTER_ID },
        select: { level: true, data: true },
      });
      expect(createCharacter).not.toHaveBeenCalled();
    });

    it('creates the reset sheet through CharactersService.create for the caller (VEG-646)', async () => {
      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID, { campaignId: CAMPAIGN_ID });

      expect(createCharacter).toHaveBeenCalledTimes(1);
      const [userId, dto] = createCharacter.mock.calls[0];
      expect(userId).toBe(USER_ID);
      expect(dto).toBeInstanceOf(CreateCharacterDto);
      expect(dto).toMatchObject({
        name: `${mockCharacter.name} (level 4)`,
        classes: mockCharacter.classes,
        hitPoints: { max: 44, current: 44, temporary: 0 },
        conditions: [],
        concentration: null,
        exhaustion: null,
        campaignId: CAMPAIGN_ID,
      });
    });

    it('leaves the campaign unset when none is given (VEG-646)', async () => {
      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(createCharacter.mock.calls[0][1].campaignId).toBeUndefined();
    });

    it('uses a supplied name (VEG-646)', async () => {
      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID, { name: 'Thorn the Second' });

      expect(createCharacter.mock.calls[0][1].name).toBe('Thorn the Second');
    });

    it('answers 400 naming the field when the stored sheet no longer validates (VEG-646)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({
        level: 4,
        data: { ...midFightData(), bogus: true },
      });

      const attempt = service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toMatchObject({
        response: { message: expect.arrayContaining([expect.stringContaining('bogus')]) },
      });
      expect(createCharacter).not.toHaveBeenCalled();
    });

    it('names a failing nested field in the 400 (VEG-646)', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({
        level: 4,
        data: { ...midFightData(), hitDice: [{ dieType: 'd7', total: 5, spent: 2 }] },
      });

      await expect(service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).rejects.toMatchObject({
        response: { message: expect.arrayContaining([expect.stringContaining('dieType')]) },
      });
      expect(createCharacter).not.toHaveBeenCalled();
    });

    it('folds a pre-migration sheet before validating it', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({ level: 5, data: legacyData() });

      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      const [, dto] = createCharacter.mock.calls[0];
      expect(dto.classes).toEqual(FOLDED_CLASSES);
      expect(dto.hitDice).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
      for (const key of ['class', 'classId', 'subclass']) {
        expect(dto[key]).toBeUndefined();
      }
    });

    it('restores spent dice in every pool of a new-shape sheet', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({
        level: 5,
        data: {
          ...midFightData(),
          classes: [
            { classId: null, name: 'Fighter', level: 3, subclass: null, subclassId: null },
            { classId: null, name: 'Rogue', level: 2, subclass: null, subclassId: null },
          ],
          hitDice: [
            { dieType: 'd10', total: 3, spent: 2 },
            { dieType: 'd8', total: 2, spent: 2 },
          ],
        },
      });

      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(createCharacter.mock.calls[0][1].hitDice).toEqual([
        { dieType: 'd10', total: 3, spent: 0 },
        { dieType: 'd8', total: 2, spent: 0 },
      ]);
    });

    it('keeps a null pool null on a pre-migration sheet', async () => {
      prisma.characterSnapshot.findFirst.mockResolvedValue({
        level: 5,
        data: { ...legacyData(), hitDice: null },
      });

      await service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID);

      expect(createCharacter.mock.calls[0][1].hitDice).toBeNull();
    });

    it('returns what CharactersService.create returns (VEG-646)', async () => {
      await expect(service.copy(CHARACTER_ID, SNAPSHOT_ID, USER_ID)).resolves.toBe(created);
    });
  });

  describe('capture', () => {
    it('writes through the transaction client it is handed (VEG-643)', async () => {
      const tx = createMockPrismaService();
      tx.character.findUniqueOrThrow.mockResolvedValue(mockCharacter);
      tx.characterSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID });

      const result = await service.capture(
        CHARACTER_ID,
        { label: 'Before the dragon' },
        tx as never
      );

      expect(result).toEqual({ id: SNAPSHOT_ID });
      expect(tx.characterSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ level: 5, label: 'Before the dragon' }),
        select: SUMMARY_SELECT,
      });
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
    });

    it('writes through the root client with no label by default (VEG-643)', async () => {
      prisma.character.findUniqueOrThrow.mockResolvedValue(mockCharacter);
      prisma.characterSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID });

      await service.capture(CHARACTER_ID);

      expect(prisma.characterSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ characterId: CHARACTER_ID, label: null }),
        select: SUMMARY_SELECT,
      });
    });
  });
});
