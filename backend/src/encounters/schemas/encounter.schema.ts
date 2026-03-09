import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EncounterDocument = HydratedDocument<Encounter>;

@Schema({ _id: false })
export class Combatant {
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) initiative: number;
  @Prop({ default: 0 }) hp: number;
  @Prop({ default: 0 }) maxHp: number;
  @Prop({ default: 10 }) ac: number;
  @Prop({ default: false }) isNpc: boolean;
  @Prop() notes?: string;
}
export const CombatantSchema = SchemaFactory.createForClass(Combatant);

@Schema({ timestamps: true })
export class Encounter {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Campaign' })
  campaignId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [CombatantSchema], default: [] })
  combatants: Combatant[];

  @Prop({ default: 0 })
  currentTurn: number;

  @Prop({ default: 1 })
  round: number;

  @Prop({ default: false })
  isActive: boolean;
}

export const EncounterSchema = SchemaFactory.createForClass(Encounter);
