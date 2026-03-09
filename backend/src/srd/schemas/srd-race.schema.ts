import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SrdRaceDocument = HydratedDocument<SrdRace>;

@Schema()
export class SrdRace {
  @Prop({ required: true, unique: true }) name: string;
  @Prop({ required: true }) speed: number;
  @Prop({ required: true }) size: string;
  @Prop({ type: Map, of: Number, default: {} }) abilityBonuses: Map<string, number>;
  @Prop({ type: [String], default: [] }) traits: string[];
  @Prop({ type: [String], default: [] }) languages: string[];
  @Prop() description?: string;
}

export const SrdRaceSchema = SchemaFactory.createForClass(SrdRace);
SrdRaceSchema.index({ name: 'text' });
