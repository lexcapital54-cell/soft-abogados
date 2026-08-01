import {
  Controller,
  Get,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

const GLOBAL_VIEWERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!GLOBAL_VIEWERS.includes(user.role)) {
      // Asesores: resumen filtrado a su cartera
      return this.dashboardService.getSummary(user, {
        ...query,
        advisorId: user.id,
      });
    }
    return this.dashboardService.getSummary(user, query);
  }
}
