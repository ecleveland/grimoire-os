import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { SrdSpell, SrdSpellSchema } from './schemas/srd-spell.schema';
import { SrdMonster, SrdMonsterSchema } from './schemas/srd-monster.schema';
import { SrdItem, SrdItemSchema } from './schemas/srd-item.schema';
import { SrdClass, SrdClassSchema } from './schemas/srd-class.schema';
import { SrdRace, SrdRaceSchema } from './schemas/srd-race.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SrdSpell.name, schema: SrdSpellSchema },
      { name: SrdMonster.name, schema: SrdMonsterSchema },
      { name: SrdItem.name, schema: SrdItemSchema },
      { name: SrdClass.name, schema: SrdClassSchema },
      { name: SrdRace.name, schema: SrdRaceSchema },
    ]),
  ],
  controllers: [SrdController],
  providers: [SrdService],
  exports: [SrdService],
})
export class SrdModule {}
