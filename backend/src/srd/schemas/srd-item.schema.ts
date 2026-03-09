import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SrdItemDocument = HydratedDocument<SrdItem>;

@Schema()
export class SrdItem {
  @Prop({ required: true, unique: true }) name: string;
  @Prop({ required: true }) category: string;
  @Prop() cost?: string;
  @Prop() weight?: string;
  @Prop() description?: string;
  @Prop() damage?: string;
  @Prop({ type: [String], default: [] }) properties: string[];
}

export const SrdItemSchema = SchemaFactory.createForClass(SrdItem);
SrdItemSchema.index({ name: 'text', description: 'text' });
