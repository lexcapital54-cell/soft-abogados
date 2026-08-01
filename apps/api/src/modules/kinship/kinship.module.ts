import { Module } from '@nestjs/common';
import { KinshipController } from './kinship.controller';
import { KinshipService } from './kinship.service';
import { OpenAiNormalizerService } from './openai-normalizer.service';

@Module({
  controllers: [KinshipController],
  providers: [KinshipService, OpenAiNormalizerService],
  exports: [KinshipService],
})
export class KinshipModule {}
