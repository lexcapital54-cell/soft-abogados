import { Module } from '@nestjs/common';
import { DeceasedController } from './deceased.controller';
import { DeceasedService } from './deceased.service';

@Module({
  controllers: [DeceasedController],
  providers: [DeceasedService],
  exports: [DeceasedService],
})
export class DeceasedModule {}
