import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateShopDto } from './create-shop.dto';

// campaignId is immutable once a shop exists, so it is omitted from updates.
export class UpdateShopDto extends PartialType(OmitType(CreateShopDto, ['campaignId'] as const)) {}
