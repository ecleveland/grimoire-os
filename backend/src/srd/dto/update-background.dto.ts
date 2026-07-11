import { PartialType } from '@nestjs/swagger';
import { CreateBackgroundDto } from './create-background.dto';

export class UpdateBackgroundDto extends PartialType(CreateBackgroundDto) {}
