import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/audit.dto';

/**
 * Lectura forense inmutable.
 * Sin POST/PATCH/DELETE intencional — el historial no se manipula.
 * Acceso: solo SUPER_ADMIN (compliance estricto).
 */
@Controller('audit')
@Roles(UserRole.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: ListAuditQueryDto) {
    return this.auditService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const row = await this.auditService.findOne(id);
    if (!row) {
      throw new NotFoundException('Registro de auditoría no encontrado');
    }
    return row;
  }
}
