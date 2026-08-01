import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import { SendCaseEmailDto } from './dto/communications.dto';
import { CommunicationsService } from './communications.service';

@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('meta')
  meta(@CurrentUser() user: AuthUser) {
    return this.communications.meta(user);
  }

  @Get('cases/:caseId/recipients')
  recipients(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.recipients(caseId, user);
  }

  @Get('cases/:caseId/attachments')
  attachments(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.caseAttachments(caseId, user);
  }

  @Post('cases/:caseId/send')
  send(
    @Param('caseId') caseId: string,
    @Body() dto: SendCaseEmailDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.communications.sendCaseEmail(
      caseId,
      dto,
      user,
      clientIp(req),
    );
  }
}
