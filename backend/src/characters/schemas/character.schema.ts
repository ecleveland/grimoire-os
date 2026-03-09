import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CharacterDocument = HydratedDocument<Character>;

@Schema({ _id: false })
export class AbilityScores {
  @Prop({ default: 10 }) strength: number;
  @Prop({ default: 10 }) dexterity: number;
  @Prop({ default: 10 }) constitution: number;
  @Prop({ default: 10 }) intelligence: number;
  @Prop({ default: 10 }) wisdom: number;
  @Prop({ default: 10 }) charisma: number;
}
export const AbilityScoresSchema = SchemaFactory.createForClass(AbilityScores);

@Schema({ _id: false })
export class HitPoints {
  @Prop({ default: 0 }) max: number;
  @Prop({ default: 0 }) current: number;
  @Prop({ default: 0 }) temporary: number;
}
export const HitPointsSchema = SchemaFactory.createForClass(HitPoints);

@Schema({ _id: false })
export class DeathSaves {
  @Prop({ default: 0 }) successes: number;
  @Prop({ default: 0 }) failures: number;
}
export const DeathSavesSchema = SchemaFactory.createForClass(DeathSaves);

@Schema({ _id: false })
export class SpellSlot {
  @Prop({ required: true }) level: number;
  @Prop({ default: 0 }) total: number;
  @Prop({ default: 0 }) used: number;
}
export const SpellSlotSchema = SchemaFactory.createForClass(SpellSlot);

@Schema({ _id: false })
export class InventoryItem {
  @Prop({ required: true }) name: string;
  @Prop({ default: 1 }) quantity: number;
  @Prop() description?: string;
  @Prop() weight?: number;
  @Prop({ default: false }) equipped: boolean;
}
export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);

@Schema({ _id: false })
export class Currency {
  @Prop({ default: 0 }) cp: number;
  @Prop({ default: 0 }) sp: number;
  @Prop({ default: 0 }) ep: number;
  @Prop({ default: 0 }) gp: number;
  @Prop({ default: 0 }) pp: number;
}
export const CurrencySchema = SchemaFactory.createForClass(Currency);

@Schema({ _id: false })
export class Feature {
  @Prop({ required: true }) name: string;
  @Prop() source?: string;
  @Prop() description?: string;
}
export const FeatureSchema = SchemaFactory.createForClass(Feature);

@Schema({ timestamps: true })
export class Character {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign' })
  campaignId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  race?: string;

  @Prop({ trim: true })
  class?: string;

  @Prop({ default: 1 })
  level: number;

  @Prop({ trim: true })
  subclass?: string;

  @Prop({ trim: true })
  background?: string;

  @Prop({ trim: true })
  alignment?: string;

  @Prop({ default: 0 })
  experiencePoints: number;

  @Prop({ type: AbilityScoresSchema, default: () => ({}) })
  abilityScores: AbilityScores;

  @Prop({ type: HitPointsSchema, default: () => ({}) })
  hitPoints: HitPoints;

  @Prop({ type: DeathSavesSchema, default: () => ({}) })
  deathSaves: DeathSaves;

  @Prop({ default: 10 })
  armorClass: number;

  @Prop({ default: 30 })
  speed: number;

  @Prop({ default: 0 })
  initiative: number;

  @Prop({ type: [String], default: [] })
  proficiencies: string[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop({ type: [String], default: [] })
  savingThrows: string[];

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop()
  spellcastingAbility?: string;

  @Prop()
  spellSaveDC?: number;

  @Prop()
  spellAttackBonus?: number;

  @Prop({ type: [String], default: [] })
  knownSpells: string[];

  @Prop({ type: [String], default: [] })
  preparedSpells: string[];

  @Prop({ type: [SpellSlotSchema], default: [] })
  spellSlots: SpellSlot[];

  @Prop({ type: [InventoryItemSchema], default: [] })
  inventory: InventoryItem[];

  @Prop({ type: CurrencySchema, default: () => ({}) })
  currency: Currency;

  @Prop({ type: [FeatureSchema], default: [] })
  features: Feature[];

  @Prop()
  personalityTraits?: string;

  @Prop()
  ideals?: string;

  @Prop()
  bonds?: string;

  @Prop()
  flaws?: string;

  @Prop()
  backstory?: string;

  @Prop()
  appearance?: string;

  @Prop({ trim: true })
  avatarUrl?: string;
}

export const CharacterSchema = SchemaFactory.createForClass(Character);
