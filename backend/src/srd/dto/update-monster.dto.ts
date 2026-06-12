import { PartialType } from '@nestjs/swagger';
import { CreateMonsterDto } from './create-monster.dto';

export class UpdateMonsterDto extends PartialType(CreateMonsterDto) {}
