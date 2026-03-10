import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { srdSpells } from './data/spells';
import { srdMonsters } from './data/monsters';
import { srdItems } from './data/items';
import { srdClasses } from './data/classes';
import { srdRaces } from './data/races';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) {}

  async seed(): Promise<void> {
    console.log('Seeding SRD data...');

    for (const spell of srdSpells) {
      await this.prisma.spell.upsert({
        where: { name: spell.name },
        create: spell,
        update: spell,
      });
    }
    console.log(`  Spells: ${srdSpells.length} upserted`);

    for (const monster of srdMonsters) {
      await this.prisma.monster.upsert({
        where: { name: monster.name },
        create: monster,
        update: monster,
      });
    }
    console.log(`  Monsters: ${srdMonsters.length} upserted`);

    for (const item of srdItems) {
      await this.prisma.item.upsert({
        where: { name: item.name },
        create: item,
        update: item,
      });
    }
    console.log(`  Items: ${srdItems.length} upserted`);

    for (const cls of srdClasses) {
      await this.prisma.srdClass.upsert({
        where: { name: cls.name },
        create: cls,
        update: cls,
      });
    }
    console.log(`  Classes: ${srdClasses.length} upserted`);

    for (const race of srdRaces) {
      await this.prisma.race.upsert({
        where: { name: race.name },
        create: race,
        update: race,
      });
    }
    console.log(`  Races: ${srdRaces.length} upserted`);

    console.log('SRD seed complete.');
  }
}
