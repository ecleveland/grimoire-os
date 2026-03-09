import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { SrdSpell, SrdSpellSchema } from '../srd/schemas/srd-spell.schema';
import { SrdMonster, SrdMonsterSchema } from '../srd/schemas/srd-monster.schema';
import { SrdItem, SrdItemSchema } from '../srd/schemas/srd-item.schema';
import { SrdClass, SrdClassSchema } from '../srd/schemas/srd-class.schema';
import { SrdRace, SrdRaceSchema } from '../srd/schemas/srd-race.schema';
import configuration from '../config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: SrdSpell.name, schema: SrdSpellSchema },
      { name: SrdMonster.name, schema: SrdMonsterSchema },
      { name: SrdItem.name, schema: SrdItemSchema },
      { name: SrdClass.name, schema: SrdClassSchema },
      { name: SrdRace.name, schema: SrdRaceSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
