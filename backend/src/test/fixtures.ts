export const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
export const USER_ID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
export const CHARACTER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
export const CAMPAIGN_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

export const mockUser = {
  id: USER_ID,
  username: 'testuser',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: null,
  role: 'player' as const,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const mockUserPublic = {
  id: mockUser.id,
  username: mockUser.username,
  displayName: mockUser.displayName,
  email: mockUser.email,
  avatarUrl: mockUser.avatarUrl,
  role: mockUser.role,
  createdAt: mockUser.createdAt,
  updatedAt: mockUser.updatedAt,
};

export const mockCharacter = {
  id: CHARACTER_ID,
  name: 'Thorn Ironforge',
  userId: USER_ID,
  campaignId: null,
  race: 'Dwarf',
  class: 'Fighter',
  level: 5,
  subclass: 'Champion',
  background: 'Soldier',
  alignment: 'Lawful Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 13,
    charisma: 8,
  },
  hitPoints: { max: 44, current: 44, temporary: 0 },
  deathSaves: null,
  armorClass: 18,
  speed: 25,
  initiative: 1,
  proficiencies: ['All armor', 'Shields', 'Simple weapons', 'Martial weapons'],
  languages: ['Common', 'Dwarvish'],
  savingThrows: ['Strength', 'Constitution'],
  skills: ['Athletics', 'Intimidation'],
  spellcastingAbility: null,
  spellSaveDC: null,
  spellAttackBonus: null,
  knownSpells: [],
  preparedSpells: [],
  spellSlots: null,
  inventory: [{ name: 'Longsword', quantity: 1, equipped: true }],
  currency: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
  features: [
    {
      name: 'Second Wind',
      source: 'Fighter',
      description: 'Regain HP as bonus action',
    },
  ],
  personalityTraits: 'Stoic and reliable',
  ideals: 'Honor above all',
  bonds: 'Protects the clan',
  flaws: 'Stubborn to a fault',
  backstory: 'A veteran of many battles.',
  appearance: 'Stocky dwarf with braided beard',
  avatarUrl: null,
  createdAt: new Date('2025-01-15T00:00:00Z'),
  updatedAt: new Date('2025-01-15T00:00:00Z'),
};

export const createUserDto = {
  username: 'newuser',
  password: 'securepassword123',
  displayName: 'New User',
  email: 'new@example.com',
};

export const createCharacterDto = {
  name: 'Thorn Ironforge',
  race: 'Dwarf',
  class: 'Fighter',
  level: 5,
};
