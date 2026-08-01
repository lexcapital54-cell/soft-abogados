import {
  Body,
  Controller,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import {
  AnalyzeKinshipDto,
  PreviewNormalizeDto,
  ValidateKinshipDto,
} from './dto/kinship.dto';
import { KinshipService } from './kinship.service';
import { KinshipEngine } from './kinship-engine';
import type { KinshipRelation, Person } from './kinship.types';

const MANAGERS = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
  UserRole.ASESOR,
] as const;

@Controller('kinship')
@Roles(...MANAGERS)
export class KinshipController {
  constructor(private readonly kinshipService: KinshipService) {}

  @Get('ai-status')
  aiStatus() {
    return this.kinshipService.aiAvailable();
  }

  @Post('preview')
  preview(@Body() dto: PreviewNormalizeDto) {
    return this.kinshipService.preview(dto.rows ?? []);
  }

  @Post('analyze')
  analyze(@Body() dto: AnalyzeKinshipDto) {
    return this.kinshipService.analyze(dto);
  }

  /** Reconstruye grafo del hallazgo seleccionado (personas ya normalizadas) */
  @Post('graph')
  graph(
    @Body()
    body: {
      titulares: Person[];
      candidatos: Person[];
      relation: KinshipRelation;
    },
  ) {
    const engine = new KinshipEngine(
      body.titulares ?? [],
      body.candidatos ?? [],
    );
    engine.analyze();
    return engine.buildGraphForRelation(body.relation);
  }

  @Post('validate')
  validate(
    @Body() dto: ValidateKinshipDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.kinshipService.validate(dto, user, clientIp(req));
  }
}
