import {
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
  ContactRelativeDto,
  CreateRelativeDto,
  RescheduleRelativeSlaDto,
  UpdateRelativeDto,
} from './dto/relative.dto';
import { RelativesService } from './relatives.service';

@Controller('relatives')
export class RelativesController {
  constructor(private readonly relativesService: RelativesService) {}

  @Get()
  findAll(
    @Query('deceasedId') deceasedId: string | undefined,
    @Query('caseId') caseId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.relativesService.findAll(deceasedId, caseId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.relativesService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateRelativeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.relativesService.create(dto, user, clientIp(req));
  }

  /** Registrar contacto → nota + estado CONTACTADO */
  @Post(':id/contact')
  contact(
    @Param('id') id: string,
    @Body() dto: ContactRelativeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.relativesService.registerContact(
      id,
      dto,
      user,
      clientIp(req),
    );
  }

  /** Reagendar SLA con motivo */
  @Post(':id/sla')
  rescheduleSla(
    @Param('id') id: string,
    @Body() dto: RescheduleRelativeSlaDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.relativesService.rescheduleSla(id, dto, user, clientIp(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRelativeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.relativesService.update(id, dto, user, clientIp(req));
  }
}
