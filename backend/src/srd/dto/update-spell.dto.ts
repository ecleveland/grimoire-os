import { PartialType } from '@nestjs/swagger';
import { CreateSpellDto } from './create-spell.dto';

export class UpdateSpellDto extends PartialType(CreateSpellDto) {}
