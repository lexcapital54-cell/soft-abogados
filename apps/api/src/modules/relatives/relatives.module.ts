import { Module } from '@nestjs/common';
import { RelativesController } from './relatives.controller';
import { RelativesService } from './relatives.service';

@Module({
  controllers: [RelativesController],
  providers: [RelativesService],
  exports: [RelativesService],
})
export class RelativesModule {}
