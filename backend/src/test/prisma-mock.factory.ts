import { PrismaService } from "../prisma/prisma.service";

type MockModel = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
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
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  };
}

export type MockPrismaService = {
  [K in
    | "user"
    | "campaign"
    | "campaignPlayer"
    | "character"
    | "note"
    | "encounter"
    | "spell"
    | "monster"
    | "item"
    | "srdClass"
    | "race"
    | "subclass"
    | "subrace"
    | "background"
    | "feat"
    | "condition"
    | "skill"
    | "language"]: MockModel;
} & {
  $transaction: jest.Mock;
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
    subclass: mockModel(),
    subrace: mockModel(),
    background: mockModel(),
    feat: mockModel(),
    condition: mockModel(),
    skill: mockModel(),
    language: mockModel(),
    $transaction: jest.fn((fn) => fn()),
  };
}

export function prismaMockProvider() {
  return {
    provide: PrismaService,
    useFactory: createMockPrismaService,
  };
}
