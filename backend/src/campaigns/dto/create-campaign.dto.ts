import { IsString, IsOptional, IsEnum, IsNumber } from "class-validator";
import { CampaignStatus } from "../../prisma/enums";

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsString()
  setting?: string;

  @IsOptional()
  @IsNumber()
  currentSession?: number;
}
