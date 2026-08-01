import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';

const PASTEL = ['amber', 'rose', 'sky', 'lime', 'violet', 'orange'] as const;

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.notaPersonal.findMany({
      where: { usuarioId: user.id },
      orderBy: [{ orden: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async create(dto: CreateNoteDto, user: AuthUser) {
    const count = await this.prisma.notaPersonal.count({
      where: { usuarioId: user.id },
    });
    const color =
      dto.colorFondo && PASTEL.includes(dto.colorFondo as (typeof PASTEL)[number])
        ? dto.colorFondo
        : PASTEL[count % PASTEL.length];

    return this.prisma.notaPersonal.create({
      data: {
        usuarioId: user.id,
        contenido: dto.contenido?.trim() || '',
        colorFondo: color,
        orden: count,
      },
    });
  }

  async update(id: string, dto: UpdateNoteDto, user: AuthUser) {
    const note = await this.prisma.notaPersonal.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.usuarioId !== user.id) {
      throw new ForbiddenException('Las notas personales son privadas');
    }
    return this.prisma.notaPersonal.update({
      where: { id },
      data: {
        ...(dto.contenido !== undefined
          ? { contenido: dto.contenido }
          : {}),
        ...(dto.colorFondo !== undefined
          ? { colorFondo: dto.colorFondo }
          : {}),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    const note = await this.prisma.notaPersonal.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.usuarioId !== user.id) {
      throw new ForbiddenException('Las notas personales son privadas');
    }
    await this.prisma.notaPersonal.delete({ where: { id } });
    return { ok: true };
  }
}
