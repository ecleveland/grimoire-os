import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateNpcDto } from './create-npc.dto';

export class UpdateNpcDto extends PartialType(OmitType(CreateNpcDto, ['campaignId'] as const)) {}
