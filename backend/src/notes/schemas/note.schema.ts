import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NoteDocument = HydratedDocument<Note>;

export enum NoteVisibility {
  PRIVATE = 'private',
  PARTY = 'party',
  DM_ONLY = 'dm_only',
}

@Schema({ timestamps: true })
export class Note {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Campaign' })
  campaignId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ required: true, enum: NoteVisibility, default: NoteVisibility.PRIVATE })
  visibility: NoteVisibility;

  @Prop()
  sessionNumber?: number;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const NoteSchema = SchemaFactory.createForClass(Note);
