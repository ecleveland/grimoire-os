import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CampaignDocument = HydratedDocument<Campaign>;

export enum CampaignStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  ownerId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  playerIds: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'Character', default: [] })
  characterIds: Types.ObjectId[];

  @Prop({ required: true, enum: CampaignStatus, default: CampaignStatus.ACTIVE })
  status: CampaignStatus;

  @Prop({ trim: true })
  setting?: string;

  @Prop()
  currentSession?: number;

  @Prop({ unique: true, sparse: true })
  inviteCode?: string;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
