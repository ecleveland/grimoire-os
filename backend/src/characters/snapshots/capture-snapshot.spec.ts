import { captureCharacterSnapshot, SNAPSHOT_OMITTED_COLUMNS } from './capture-snapshot';
import { CHARACTER_ID, mockCharacter } from '../../test/fixtures';

// A hand-built client with only the two models capture touches. Passing it in,
// rather than a full Prisma mock, proves capture uses the client it is handed:
// a transaction client must carry both the read and the insert.
const makeClient = (row: object = mockCharacter) => ({
  character: { findUniqueOrThrow: jest.fn().mockResolvedValue(row) },
  characterSnapshot: { create: jest.fn().mockResolvedValue({ id: 'snap-1' }) },
});

describe('captureCharacterSnapshot (VEG-643)', () => {
  it('reads the character row through the client it is handed', async () => {
    const client = makeClient();

    await captureCharacterSnapshot(client as never, CHARACTER_ID, 'Level 5');

    expect(client.character.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: CHARACTER_ID },
    });
  });

  it('strips exactly the omitted columns from the stored data', async () => {
    const client = makeClient();

    await captureCharacterSnapshot(client as never, CHARACTER_ID, 'Level 5');

    const { data } = client.characterSnapshot.create.mock.calls[0][0].data;
    const omitted: readonly string[] = SNAPSHOT_OMITTED_COLUMNS;
    const expectedKeys = Object.keys(mockCharacter).filter(key => !omitted.includes(key));
    expect(Object.keys(data).sort()).toEqual(expectedKeys.sort());
  });

  it('omits the identity, ownership and bookkeeping columns', () => {
    expect([...SNAPSHOT_OMITTED_COLUMNS].sort()).toEqual(
      ['campaignId', 'createdAt', 'id', 'updatedAt', 'userId', 'version'].sort()
    );
  });

  it('keeps the play state the snapshot exists to preserve', async () => {
    const client = makeClient();

    await captureCharacterSnapshot(client as never, CHARACTER_ID, 'Level 5');

    const { data } = client.characterSnapshot.create.mock.calls[0][0].data;
    expect(data.hitPoints).toEqual(mockCharacter.hitPoints);
    expect(data.features).toEqual(mockCharacter.features);
    expect(data.inventory).toEqual(mockCharacter.inventory);
  });

  it('writes the level from the row and the given label, and returns the new id', async () => {
    const client = makeClient({ ...mockCharacter, level: 4 });

    const result = await captureCharacterSnapshot(client as never, CHARACTER_ID, 'Level 4');

    expect(client.characterSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ characterId: CHARACTER_ID, level: 4, label: 'Level 4' }),
      select: { id: true, level: true, label: true, takenAt: true },
    });
    expect(result).toEqual({ id: 'snap-1' });
  });

  it('leaves the label null when none is given', async () => {
    const client = makeClient();

    await captureCharacterSnapshot(client as never, CHARACTER_ID);

    expect(client.characterSnapshot.create.mock.calls[0][0].data.label).toBeNull();
  });

  it('rejects without inserting when the character row is missing', async () => {
    const client = makeClient();
    client.character.findUniqueOrThrow.mockRejectedValue(new Error('No record found'));

    await expect(captureCharacterSnapshot(client as never, CHARACTER_ID)).rejects.toThrow(
      'No record found'
    );
    expect(client.characterSnapshot.create).not.toHaveBeenCalled();
  });
});
