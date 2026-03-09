import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  PLAYER = 'player',
  DUNGEON_MASTER = 'dungeon_master',
  ADMIN = 'admin',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ trim: true })
  displayName?: string;

  @Prop({ unique: true, sparse: true, trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.PLAYER })
  role: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
