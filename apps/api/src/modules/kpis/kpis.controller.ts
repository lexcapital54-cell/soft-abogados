import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { KpisQueryDto } from './dto/kpis.dto';
import { KpisService } from './kpis.service';

@Controller('kpis')
@Roles(UserRole.SUPER_ADMIN)
export class KpisController {
  constructor(private readonly kpisService: KpisService) {}

  @Get('summary')
  summary(@Query() query: KpisQueryDto, @CurrentUser() user: AuthUser) {
    return this.kpisService.summary(user, query);
  }

  @Get('advisors/:id/detail')
  advisorDetail(
    @Param('id') id: string,
    @Query() query: KpisQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kpisService.advisorDetail(user, id, query);
  }
}
