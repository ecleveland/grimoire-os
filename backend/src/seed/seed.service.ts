import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SrdSpell, SrdSpellDocument } from '../srd/schemas/srd-spell.schema';
import { SrdMonster, SrdMonsterDocument } from '../srd/schemas/srd-monster.schema';
import { SrdItem, SrdItemDocument } from '../srd/schemas/srd-item.schema';
import { SrdClass, SrdClassDocument } from '../srd/schemas/srd-class.schema';
import { SrdRace, SrdRaceDocument } from '../srd/schemas/srd-race.schema';
import { srdSpells } from './data/spells';
import { srdMonsters } from './data/monsters';
import { srdItems } from './data/items';
import { srdClasses } from './data/classes';
import { srdRaces } from './data/races';

@Injectable()
export class SeedService {
  constructor(
    @InjectModel(SrdSpell.name) private spellModel: Model<SrdSpellDocument>,
    @InjectModel(SrdMonster.name) private monsterModel: Model<SrdMonsterDocument>,
    @InjectModel(SrdItem.name) private itemModel: Model<SrdItemDocument>,
    @InjectModel(SrdClass.name) private classModel: Model<SrdClassDocument>,
    @InjectModel(SrdRace.name) private raceModel: Model<SrdRaceDocument>,
  ) {}

  async seed(): Promise<void> {
    console.log('Seeding SRD data...');

    for (const spell of srdSpells) {
      await this.spellModel
        .updateOne({ name: spell.name }, { $set: spell }, { upsert: true })
        .exec();
    }
    console.log(`  Spells: ${srdSpells.length} upserted`);

    for (const monster of srdMonsters) {
      await this.monsterModel
        .updateOne({ name: monster.name }, { $set: monster }, { upsert: true })
        .exec();
    }
    console.log(`  Monsters: ${srdMonsters.length} upserted`);

    for (const item of srdItems) {
      await this.itemModel
        .updateOne({ name: item.name }, { $set: item }, { upsert: true })
        .exec();
    }
    console.log(`  Items: ${srdItems.length} upserted`);

    for (const cls of srdClasses) {
      await this.classModel
        .updateOne({ name: cls.name }, { $set: cls }, { upsert: true })
        .exec();
    }
    console.log(`  Classes: ${srdClasses.length} upserted`);

    for (const race of srdRaces) {
      await this.raceModel
        .updateOne({ name: race.name }, { $set: race }, { upsert: true })
        .exec();
    }
    console.log(`  Races: ${srdRaces.length} upserted`);

    console.log('SRD seed complete.');
  }
}
