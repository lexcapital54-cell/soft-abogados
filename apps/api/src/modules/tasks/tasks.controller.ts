import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('meta')
  meta() {
    return this.tasksService.meta();
  }

  /** Combobox dinámico de asignación según rol + caso */
  @Get('assignable')
  assignable(
    @Query('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!caseId?.trim()) {
      throw new BadRequestException('caseId es obligatorio');
    }
    return this.tasksService.assignableUsers(caseId, user);
  }

  @Get()
  list(@Query() query: ListTasksQueryDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.list(query, user);
  }

  @Post()
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.tasksService.create(dto, user, clientIp(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.tasksService.update(id, dto, user, clientIp(req));
  }
}
