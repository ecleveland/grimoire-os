import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SrdSpell, SrdSpellDocument } from './schemas/srd-spell.schema';
import { SrdMonster, SrdMonsterDocument } from './schemas/srd-monster.schema';
import { SrdItem, SrdItemDocument } from './schemas/srd-item.schema';
import { SrdClass, SrdClassDocument } from './schemas/srd-class.schema';
import { SrdRace, SrdRaceDocument } from './schemas/srd-race.schema';

@Injectable()
export class SrdService {
  constructor(
    @InjectModel(SrdSpell.name) private spellModel: Model<SrdSpellDocument>,
    @InjectModel(SrdMonster.name) private monsterModel: Model<SrdMonsterDocument>,
    @InjectModel(SrdItem.name) private itemModel: Model<SrdItemDocument>,
    @InjectModel(SrdClass.name) private classModel: Model<SrdClassDocument>,
    @InjectModel(SrdRace.name) private raceModel: Model<SrdRaceDocument>,
  ) {}

  async searchSpells(query?: string, classFilter?: string, level?: number) {
    const filter: Record<string, unknown> = {};
    if (query) filter.$text = { $search: query };
    if (classFilter) filter.classes = classFilter;
    if (level !== undefined) filter.level = level;
    return this.spellModel.find(filter).sort({ name: 1 }).exec();
  }

  async findSpell(id: string) {
    return this.spellModel.findById(id).exec();
  }

  async searchMonsters(query?: string, type?: string, cr?: string) {
    const filter: Record<string, unknown> = {};
    if (query) filter.$text = { $search: query };
    if (type) filter.type = type;
    if (cr) filter.challengeRating = cr;
    return this.monsterModel.find(filter).sort({ name: 1 }).exec();
  }

  async findMonster(id: string) {
    return this.monsterModel.findById(id).exec();
  }

  async searchItems(query?: string, category?: string) {
    const filter: Record<string, unknown> = {};
    if (query) filter.$text = { $search: query };
    if (category) filter.category = category;
    return this.itemModel.find(filter).sort({ name: 1 }).exec();
  }

  async findItem(id: string) {
    return this.itemModel.findById(id).exec();
  }

  async findAllClasses() {
    return this.classModel.find().sort({ name: 1 }).exec();
  }

  async findClass(id: string) {
    return this.classModel.findById(id).exec();
  }

  async findAllRaces() {
    return this.raceModel.find().sort({ name: 1 }).exec();
  }

  async findRace(id: string) {
    return this.raceModel.findById(id).exec();
  }
}
