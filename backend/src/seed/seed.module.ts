import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SeedService } from "./seed.service";
import { PrismaModule } from "../prisma/prisma.module";
import configuration from "../config/configuration";

@Module({
  imports: [ConfigModule.forRoot({ load: [configuration] }), PrismaModule],
  providers: [SeedService],
})
export class SeedModule {}
