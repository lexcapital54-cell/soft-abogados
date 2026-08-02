import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RepoCategoria } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { OpenedObject } from '../../infrastructure/storage/storage.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import { ListRepoQueryDto } from './dto/repository.dto';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListRepoQueryDto) {
    return this.prisma.repositorioCorporativo.findMany({
      where: {
        activo: true,
        ...(query.categoria ? { categoria: query.categoria } : {}),
        ...(query.search?.trim()
          ? {
              nombre: {
                contains: query.search.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
      },
      include: {
        subidoPor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    });
  }

  categories() {
    return Object.values(RepoCategoria);
  }

  async upload(
    file: Express.Multer.File | undefined,
    nombre: string,
    categoria: RepoCategoria,
    user: AuthUser,
    ip?: string | null,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo PDF requerido');
    }
    if (!nombre?.trim()) {
      throw new BadRequestException('Nombre requerido');
    }
    const safeName = file.originalname.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/gi, '_');
    const stored = await this.storage.save(
      'repositorio-corporativo',
      `${Date.now()}_${safeName}`,
      file.buffer,
    );

    const doc = await this.prisma.repositorioCorporativo.create({
      data: {
        nombre: nombre.trim(),
        categoria,
        urlAcceso: stored.storageUrl,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        fileSize: file.size,
        subidoPorId: user.id,
        activo: true,
      },
      include: {
        subidoPor: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.REPO_DOCUMENTO_SUBIDO,
      entidadAfectada: 'RepositorioCorporativo',
      entidadId: doc.id,
      newData: {
        nombre: doc.nombre,
        categoria: doc.categoria,
        storageKey: doc.storageKey,
      },
      ipAddress: ip,
    });

    return doc;
  }

  async deactivate(id: string, user: AuthUser, ip?: string | null) {
    const doc = await this.prisma.repositorioCorporativo.findUnique({
      where: { id },
    });
    if (!doc || !doc.activo) throw new NotFoundException('Documento no encontrado');

    const updated = await this.prisma.repositorioCorporativo.update({
      where: { id },
      data: { activo: false },
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.REPO_DOCUMENTO_SUBIDO,
      entidadAfectada: 'RepositorioCorporativo',
      entidadId: id,
      prevData: { activo: true },
      newData: { activo: false, nombre: doc.nombre },
      ipAddress: ip,
    });

    return updated;
  }

  async fileStream(id: string): Promise<{
    opened: OpenedObject;
    mimeType: string;
    filename: string;
  }> {
    const doc = await this.prisma.repositorioCorporativo.findUnique({
      where: { id },
    });
    if (!doc?.storageKey || !doc.activo) {
      throw new NotFoundException('Documento no encontrado');
    }
    const opened = await this.storage.open(doc.storageKey);
    return {
      opened,
      mimeType: doc.mimeType ?? 'application/pdf',
      filename: doc.nombre,
    };
  }
}
