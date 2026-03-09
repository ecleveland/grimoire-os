import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SrdMonsterDocument = HydratedDocument<SrdMonster>;

@Schema()
export class SrdMonster {
  @Prop({ required: true, unique: true }) name: string;
  @Prop({ required: true }) size: string;
  @Prop({ required: true }) type: string;
  @Prop({ default: 'unaligned' }) alignment: string;
  @Prop({ required: true }) armorClass: number;
  @Prop({ required: true }) hitPoints: string;
  @Prop({ required: true }) speed: string;
  @Prop({ default: 10 }) strength: number;
  @Prop({ default: 10 }) dexterity: number;
  @Prop({ default: 10 }) constitution: number;
  @Prop({ default: 10 }) intelligence: number;
  @Prop({ default: 10 }) wisdom: number;
  @Prop({ default: 10 }) charisma: number;
  @Prop({ required: true }) challengeRating: string;
  @Prop({ type: [String], default: [] }) actions: string[];
  @Prop() description?: string;
}

export const SrdMonsterSchema = SchemaFactory.createForClass(SrdMonster);
SrdMonsterSchema.index({ name: 'text' });
