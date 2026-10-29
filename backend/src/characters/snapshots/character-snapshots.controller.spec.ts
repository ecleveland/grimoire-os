import { Test, TestingModule } from '@nestjs/testing';
import { CharacterSnapshotsController } from './character-snapshots.controller';
import { CharacterSnapshotsService } from './character-snapshots.service';
import type { AuthenticatedRequest } from '../../auth/interfaces/jwt-payload.interface';
import { CHARACTER_ID, USER_ID } from '../../test/fixtures';
import { Role } from '../../common/enums';

const SNAPSHOT_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

describe('CharacterSnapshotsController', () => {
  let controller: CharacterSnapshotsController;
  let service: Record<'list' | 'get' | 'remove', jest.Mock>;

  const mockReq = {
    user: { userId: USER_ID, username: 'testuser', role: Role.PLAYER },
  } as AuthenticatedRequest;

  beforeEach(async () => {
    service = { list: jest.fn(), get: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CharacterSnapshotsController],
      providers: [{ provide: CharacterSnapshotsService, useValue: service }],
    }).compile();

    controller = module.get(CharacterSnapshotsController);
  });

  it('list delegates with the character id and userId (VEG-643)', async () => {
    const summaries = [{ id: SNAPSHOT_ID, level: 4, label: 'Level 4', takenAt: new Date() }];
    service.list.mockResolvedValue(summaries);

    const result = await controller.list(CHARACTER_ID, mockReq);

    expect(service.list).toHaveBeenCalledWith(CHARACTER_ID, USER_ID);
    expect(result).toBe(summaries);
  });

  it('get delegates with the character id, snapshot id and userId (VEG-643)', async () => {
    const snapshot = { id: SNAPSHOT_ID, level: 4, label: 'Level 4', data: {} };
    service.get.mockResolvedValue(snapshot);

    const result = await controller.get(CHARACTER_ID, SNAPSHOT_ID, mockReq);

    expect(service.get).toHaveBeenCalledWith(CHARACTER_ID, SNAPSHOT_ID, USER_ID);
    expect(result).toBe(snapshot);
  });

  it('remove delegates with the character id, snapshot id and userId (VEG-643)', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(CHARACTER_ID, SNAPSHOT_ID, mockReq);

    expect(service.remove).toHaveBeenCalledWith(CHARACTER_ID, SNAPSHOT_ID, USER_ID);
  });
});
