import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SrdClassDocument = HydratedDocument<SrdClass>;

@Schema()
export class SrdClass {
  @Prop({ required: true, unique: true }) name: string;
  @Prop({ required: true }) hitDie: string;
  @Prop({ type: [String], default: [] }) primaryAbilities: string[];
  @Prop({ type: [String], default: [] }) savingThrows: string[];
  @Prop({ type: [String], default: [] }) armorProficiencies: string[];
  @Prop({ type: [String], default: [] }) weaponProficiencies: string[];
  @Prop({ type: [String], default: [] }) skillChoices: string[];
  @Prop() description?: string;
  @Prop({ type: [String], default: [] }) features: string[];
}

export const SrdClassSchema = SchemaFactory.createForClass(SrdClass);
SrdClassSchema.index({ name: 'text' });
