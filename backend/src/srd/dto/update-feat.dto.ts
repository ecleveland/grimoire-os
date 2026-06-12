import { PartialType } from '@nestjs/swagger';
import { CreateFeatDto } from './create-feat.dto';

export class UpdateFeatDto extends PartialType(CreateFeatDto) {}
