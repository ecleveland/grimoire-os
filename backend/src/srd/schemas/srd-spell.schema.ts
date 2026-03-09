import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SrdSpellDocument = HydratedDocument<SrdSpell>;

@Schema()
export class SrdSpell {
  @Prop({ required: true, unique: true }) name: string;
  @Prop({ required: true }) level: number;
  @Prop({ required: true }) school: string;
  @Prop({ required: true }) castingTime: string;
  @Prop({ required: true }) range: string;
  @Prop({ required: true }) components: string;
  @Prop() duration: string;
  @Prop({ required: true }) description: string;
  @Prop({ type: [String], default: [] }) classes: string[];
  @Prop({ default: false }) ritual: boolean;
  @Prop({ default: false }) concentration: boolean;
}

export const SrdSpellSchema = SchemaFactory.createForClass(SrdSpell);
SrdSpellSchema.index({ name: 'text', description: 'text' });
