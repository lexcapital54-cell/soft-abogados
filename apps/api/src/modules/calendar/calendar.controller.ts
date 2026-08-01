import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import {
  CalendarEventsQueryDto,
  CalendarMoveDto,
} from './dto/calendar.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('resources')
  resources(@CurrentUser() user: AuthUser) {
    return this.calendarService.resources(user);
  }

  @Get('events')
  events(
    @Query() query: CalendarEventsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calendarService.events(user, query);
  }

  @Patch('events/:id/move')
  move(
    @Param('id') id: string,
    @Body() dto: CalendarMoveDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.calendarService.move(id, dto, user, clientIp(req));
  }
}
