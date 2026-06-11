import { PrismaService } from '../prisma/prisma.service';

type MockModel = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  upsert: jest.Mock;
  count: jest.Mock;
};

function mockModel(): MockModel {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  };
}

export type MockPrismaService = {
  [K in
    | 'user'
    | 'campaign'
    | 'campaignPlayer'
    | 'character'
    | 'note'
    | 'encounter'
    | 'spell'
    | 'monster'
    | 'item'
    | 'itemBundleEntry'
    | 'srdClass'
    | 'race'
    | 'subclass'
    | 'subrace'
    | 'background'
    | 'feat'
    | 'condition'
    | 'skill'
    | 'language'
    | 'gameRule'
    | 'auditLog'
    | 'classFeature'
    | 'subclassFeature'
    | 'raceTrait'
    | 'backgroundFeature'
    | 'npc'
    | 'npcRelation'
    | 'npcNamePool'
    | 'npcAppearanceTrait'
    | 'npcLootTemplate'
    | 'npcAlignmentPrior'
    | 'npcCustomPersonality'
    | 'trinket'
    | 'refreshToken']: MockModel;
} & {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

export function createMockPrismaService(): MockPrismaService {
  const mock = {
    user: mockModel(),
    campaign: mockModel(),
    campaignPlayer: mockModel(),
    character: mockModel(),
    note: mockModel(),
    encounter: mockModel(),
    spell: mockModel(),
    monster: mockModel(),
    item: mockModel(),
    itemBundleEntry: mockModel(),
    srdClass: mockModel(),
    race: mockModel(),
    subclass: mockModel(),
    subrace: mockModel(),
    background: mockModel(),
    feat: mockModel(),
    condition: mockModel(),
    skill: mockModel(),
    language: mockModel(),
    gameRule: mockModel(),
    auditLog: mockModel(),
    classFeature: mockModel(),
    subclassFeature: mockModel(),
    raceTrait: mockModel(),
    backgroundFeature: mockModel(),
    npc: mockModel(),
    npcRelation: mockModel(),
    npcNamePool: mockModel(),
    npcAppearanceTrait: mockModel(),
    npcLootTemplate: mockModel(),
    npcAlignmentPrior: mockModel(),
    npcCustomPersonality: mockModel(),
    trinket: mockModel(),
    refreshToken: mockModel(),
    $queryRaw: jest.fn(),
  } as unknown as MockPrismaService;
  mock.$transaction = jest.fn(
    (fnOrArray: ((tx: MockPrismaService) => unknown) | Array<unknown>): Promise<unknown> => {
      if (typeof fnOrArray === 'function') return Promise.resolve(fnOrArray(mock));
      if (Array.isArray(fnOrArray)) return Promise.all(fnOrArray);
      return Promise.resolve();
    }
  );
  return mock;
}

export function prismaMockProvider() {
  return {
    provide: PrismaService,
    useFactory: createMockPrismaService,
  };
}
