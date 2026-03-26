import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';

@Module({
  imports: [CampaignAuthModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
