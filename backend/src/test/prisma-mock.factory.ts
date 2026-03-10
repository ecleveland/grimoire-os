import { PrismaService } from '../prisma/prisma.service';

type MockModel = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  upsert: jest.Mock;
};

function mockModel(): MockModel {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
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
    | 'srdClass'
    | 'race']: MockModel;
};

export function createMockPrismaService(): MockPrismaService {
  return {
    user: mockModel(),
    campaign: mockModel(),
    campaignPlayer: mockModel(),
    character: mockModel(),
    note: mockModel(),
    encounter: mockModel(),
    spell: mockModel(),
    monster: mockModel(),
    item: mockModel(),
    srdClass: mockModel(),
    race: mockModel(),
  };
}

export function prismaMockProvider() {
  return {
    provide: PrismaService,
    useFactory: createMockPrismaService,
  };
}
