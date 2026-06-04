import * as fs from 'fs';
import * as path from 'path';
import { validateMonsterData } from './srd-json.loader';

// Regression guard for VEG-261: runs the same validation the seed loader enforces against
// the REAL committed SRD data file (no fs mocking), so any reintroduced field-bleed
// corruption fails CI. Mirrors the JSON_DIR resolution in srd-json.loader.ts.
const MONSTERS_PATH = path.resolve(__dirname, '../../../docs/extracted-srd-json/monsters.json');

describe('SRD monsters.json data integrity', () => {
  const doc = JSON.parse(fs.readFileSync(MONSTERS_PATH, 'utf-8')) as {
    metadata: { total_count: number };
    monsters: Parameters<typeof validateMonsterData>[0];
  };

  it('contains the full SRD 5.2.1 bestiary (324 monsters)', () => {
    expect(doc.monsters).toHaveLength(324);
    expect(doc.metadata.total_count).toBe(324);
  });

  it('passes the monster data validation guard (no field-bleed corruption)', () => {
    expect(() => validateMonsterData(doc.monsters)).not.toThrow();
  });
});
