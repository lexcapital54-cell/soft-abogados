import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { ReportsQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** Rendimiento operativo: scoped por rol (ASESOR = propia gestión) */
  @Get('performance')
  performance(
    @Query() query: ReportsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reportsService.performance(user, query);
  }
}
