import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import {
  AssignCaseDto,
  CreateCaseActivityDto,
  CreateCaseDto,
  ListCasesQueryDto,
  UpdateCaseDto,
} from './dto/case.dto';
import { CasesService } from './cases.service';

const CASE_MANAGERS = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
] as const;

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  findAll(@Query() query: ListCasesQueryDto, @CurrentUser() user: AuthUser) {
    return this.casesService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.casesService.findOne(id, user);
  }

  @Post()
  @Roles(...CASE_MANAGERS)
  create(
    @Body() dto: CreateCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.casesService.create(dto, user.id, clientIp(req));
  }

  /** Asesor asignado o managers pueden alimentar el caso */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.casesService.update(id, dto, user, clientIp(req));
  }

  @Post(':id/activities')
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateCaseActivityDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.casesService.addActivity(id, dto, user, clientIp(req));
  }

  @Patch(':id/assign')
  @Roles(...CASE_MANAGERS)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.casesService.assign(id, dto, user, clientIp(req));
  }

  @Delete(':id')
  @Roles(...CASE_MANAGERS)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.casesService.remove(id, user, clientIp(req));
  }
}
