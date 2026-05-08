import { readFileSync } from 'fs';
import { join } from 'path';

describe('NPC Generator schema (VEG-243)', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf-8',
  );

  const modelBlock = (name: string): string => {
    const re = new RegExp(`model\\s+${name}\\s*{([\\s\\S]*?)\\n}`, 'm');
    const match = schema.match(re);
    if (!match) {
      throw new Error(`model ${name} not found in schema.prisma`);
    }
    return match[1];
  };

  describe('Npc model', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('Npc');
    });

    it('uses uuid string id', () => {
      expect(body).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
    });

    it('declares campaignId and createdById foreign keys', () => {
      expect(body).toMatch(/campaignId\s+String\b/);
      expect(body).toMatch(/createdById\s+String\b/);
    });

    it('declares identity fields', () => {
      expect(body).toMatch(/\bname\s+String\b/);
      expect(body).toMatch(/\brace\s+String\b/);
      expect(body).toMatch(/background\s+String\?/);
      expect(body).toMatch(/profession\s+String\?/);
      expect(body).toMatch(/alignment\s+String\?/);
      expect(body).toMatch(/size\s+String\?/);
      expect(body).toMatch(/age\s+Int\?/);
      expect(body).toMatch(/gender\s+String\?/);
    });

    it('declares description fields with default empty arrays', () => {
      expect(body).toMatch(/appearance\s+String\?/);
      expect(body).toMatch(/personalityTraits\s+String\[\]\s+@default\(\[\]\)/);
      expect(body).toMatch(/ideals\s+String\[\]\s+@default\(\[\]\)/);
      expect(body).toMatch(/bonds\s+String\[\]\s+@default\(\[\]\)/);
      expect(body).toMatch(/flaws\s+String\[\]\s+@default\(\[\]\)/);
    });

    it('uses nullable Json for statBlock (Lite mode default)', () => {
      expect(body).toMatch(/statBlock\s+Json\?/);
    });

    it('declares three coinage Int columns defaulting to 0', () => {
      expect(body).toMatch(/goldPieces\s+Int\s+@default\(0\)/);
      expect(body).toMatch(/silverPieces\s+Int\s+@default\(0\)/);
      expect(body).toMatch(/copperPieces\s+Int\s+@default\(0\)/);
    });

    it('declares loot and lootOverrides as nullable Json', () => {
      expect(body).toMatch(/\bloot\s+Json\?/);
      expect(body).toMatch(/lootOverrides\s+Json\?/);
    });

    it('declares generation metadata fields', () => {
      expect(body).toMatch(/generationParams\s+Json\?/);
      expect(body).toMatch(/lockedFields\s+String\[\]\s+@default\(\[\]\)/);
      expect(body).toMatch(/isManual\s+Boolean\s+@default\(false\)/);
    });

    it('relates to Campaign and User', () => {
      expect(body).toMatch(/campaign\s+Campaign\s+@relation\(fields: \[campaignId\], references: \[id\]\)/);
      expect(body).toMatch(/createdBy\s+User\s+@relation\(fields: \[createdById\], references: \[id\]\)/);
    });

    it('has bidirectional relation backrefs to NpcRelation', () => {
      expect(body).toMatch(/outgoingLinks\s+NpcRelation\[\]\s+@relation\("FromNpc"\)/);
      expect(body).toMatch(/incomingLinks\s+NpcRelation\[\]\s+@relation\("ToNpc"\)/);
    });

    it('declares createdAt/updatedAt timestamps', () => {
      expect(body).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
      expect(body).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    });

    it('indexes campaignId and maps to npcs table', () => {
      expect(body).toMatch(/@@index\(\[campaignId\]\)/);
      expect(body).toMatch(/@@map\("npcs"\)/);
    });
  });

  describe('NpcRelation model', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('NpcRelation');
    });

    it('uses uuid string id and required fields', () => {
      expect(body).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
      expect(body).toMatch(/fromNpcId\s+String\b/);
      expect(body).toMatch(/toNpcId\s+String\b/);
      expect(body).toMatch(/relation\s+String\b/);
      expect(body).toMatch(/notes\s+String\?/);
    });

    it('cascades on delete from both sides', () => {
      expect(body).toMatch(
        /fromNpc\s+Npc\s+@relation\("FromNpc",\s*fields: \[fromNpcId\],\s*references: \[id\],\s*onDelete: Cascade\)/,
      );
      expect(body).toMatch(
        /toNpc\s+Npc\s+@relation\("ToNpc",\s*fields: \[toNpcId\],\s*references: \[id\],\s*onDelete: Cascade\)/,
      );
    });

    it('enforces unique (fromNpcId, toNpcId, relation) tuple', () => {
      expect(body).toMatch(/@@unique\(\[fromNpcId,\s*toNpcId,\s*relation\]\)/);
    });

    it('maps to npc_relations table', () => {
      expect(body).toMatch(/@@map\("npc_relations"\)/);
    });
  });

  describe('NpcNamePool reference table', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('NpcNamePool');
    });

    it('declares race, gender, kind, value', () => {
      expect(body).toMatch(/race\s+String\b/);
      expect(body).toMatch(/gender\s+String\?/);
      expect(body).toMatch(/kind\s+String\b/);
      expect(body).toMatch(/value\s+String\b/);
    });

    it('declares source default "curated" and isActive default true', () => {
      expect(body).toMatch(/source\s+String\s+@default\("curated"\)/);
      expect(body).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    });

    it('maps to npc_name_pools table', () => {
      expect(body).toMatch(/@@map\("npc_name_pools"\)/);
    });
  });

  describe('NpcAppearanceTrait reference table', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('NpcAppearanceTrait');
    });

    it('declares race, category, trait', () => {
      expect(body).toMatch(/race\s+String\b/);
      expect(body).toMatch(/category\s+String\b/);
      expect(body).toMatch(/trait\s+String\b/);
    });

    it('declares source default "curated" and isActive default true', () => {
      expect(body).toMatch(/source\s+String\s+@default\("curated"\)/);
      expect(body).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    });

    it('maps to npc_appearance_traits table', () => {
      expect(body).toMatch(/@@map\("npc_appearance_traits"\)/);
    });
  });

  describe('NpcLootTemplate reference table', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('NpcLootTemplate');
    });

    it('declares profession, crBucket, coinage, items', () => {
      expect(body).toMatch(/profession\s+String\b/);
      expect(body).toMatch(/crBucket\s+String\b/);
      expect(body).toMatch(/coinage\s+Json\b/);
      expect(body).toMatch(/items\s+Json\b/);
    });

    it('declares source default "curated" and isActive default true', () => {
      expect(body).toMatch(/source\s+String\s+@default\("curated"\)/);
      expect(body).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    });

    it('maps to npc_loot_templates table', () => {
      expect(body).toMatch(/@@map\("npc_loot_templates"\)/);
    });
  });

  describe('NpcAlignmentPrior reference table', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('NpcAlignmentPrior');
    });

    it('declares race, background, weights as Int[]', () => {
      expect(body).toMatch(/race\s+String\b/);
      expect(body).toMatch(/background\s+String\?/);
      expect(body).toMatch(/weights\s+Int\[\]/);
    });

    it('declares source default "curated" and isActive default true', () => {
      expect(body).toMatch(/source\s+String\s+@default\("curated"\)/);
      expect(body).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    });

    it('maps to npc_alignment_priors table', () => {
      expect(body).toMatch(/@@map\("npc_alignment_priors"\)/);
    });
  });

  describe('Trinket reference table', () => {
    let body: string;
    beforeAll(() => {
      body = modelBlock('Trinket');
    });

    it('declares description', () => {
      expect(body).toMatch(/description\s+String\b/);
    });

    it('declares source default "curated" and isActive default true', () => {
      expect(body).toMatch(/source\s+String\s+@default\("curated"\)/);
      expect(body).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    });

    it('maps to trinkets table', () => {
      expect(body).toMatch(/@@map\("trinkets"\)/);
    });
  });

  describe('Cross-model backrefs', () => {
    it('User has npcs backref', () => {
      const user = modelBlock('User');
      expect(user).toMatch(/npcs\s+Npc\[\]/);
    });

    it('Campaign has npcs backref', () => {
      const campaign = modelBlock('Campaign');
      expect(campaign).toMatch(/npcs\s+Npc\[\]/);
    });
  });
});
