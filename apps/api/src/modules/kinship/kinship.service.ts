import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, KinshipType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import { KinshipEngine } from './kinship-engine';
import {
  detectColumns,
  normalizeRowsHeuristic,
} from './kinship-normalizer';
import { OpenAiNormalizerService } from './openai-normalizer.service';
import type { KinshipAnalyzeResult, Person } from './kinship.types';
import {
  AnalyzeKinshipDto,
  ValidateKinshipDto,
} from './dto/kinship.dto';

const LABEL_TO_KINSHIP: Partial<Record<string, KinshipType>> = {
  PADRE: KinshipType.PADRE,
  MADRE: KinshipType.MADRE,
  HIJO: KinshipType.HIJO,
  HIJA: KinshipType.HIJA,
  HERMANO: KinshipType.HERMANO,
  HERMANA: KinshipType.HERMANA,
  NIETO: KinshipType.NIETO,
  NIETA: KinshipType.NIETA,
  OTRO: KinshipType.OTRO,
};

@Injectable()
export class KinshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiNormalizerService,
    private readonly audit: AuditService,
  ) {}

  aiAvailable() {
    return { available: this.openai.isEnabled() };
  }

  preview(rows: Record<string, unknown>[]) {
    const sample = rows.slice(0, 8);
    const columns = detectColumns(sample);
    const normalized = normalizeRowsHeuristic(sample, 'CANDIDATO');
    return { columns, sample, normalizedPreview: normalized };
  }

  async analyze(dto: AnalyzeKinshipDto): Promise<KinshipAnalyzeResult> {
    if (!dto.titulares?.length) {
      throw new BadRequestException('La base de titulares está vacía');
    }
    if (!dto.candidatos?.length) {
      throw new BadRequestException('La base de candidatos está vacía');
    }
    if (dto.titulares.length > 2000 || dto.candidatos.length > 5000) {
      throw new BadRequestException(
        'Límite excedido: máx. 2.000 titulares y 5.000 candidatos por lote',
      );
    }

    let usedAi = false;
    let titulares: Person[] = [];
    let candidatos: Person[] = [];

    if (dto.useAi && this.openai.isEnabled()) {
      const [tAi, cAi] = await Promise.all([
        this.openai.normalizeRows(dto.titulares, 'TITULAR'),
        this.openai.normalizeRows(dto.candidatos, 'CANDIDATO'),
      ]);
      if (tAi && cAi) {
        titulares = tAi;
        candidatos = cAi;
        usedAi = true;
      }
    }

    if (!usedAi) {
      titulares = normalizeRowsHeuristic(dto.titulares, 'TITULAR');
      candidatos = normalizeRowsHeuristic(dto.candidatos, 'CANDIDATO');
    }

    if (!titulares.length || !candidatos.length) {
      throw new BadRequestException(
        'No se pudieron normalizar filas. Revise nombres de columnas (cédula, nombres, apellidos…).',
      );
    }

    const engine = new KinshipEngine(titulares, candidatos);
    const relations = engine.analyze();
    const avgConfidence = relations.length
      ? Math.round(
          relations.reduce((s, r) => s + r.confidence, 0) / relations.length,
        )
      : 0;

    return {
      titulares,
      candidatos,
      relations,
      stats: {
        titulares: titulares.length,
        candidatos: candidatos.length,
        matches: relations.length,
        avgConfidence,
        usedAi,
      },
    };
  }

  async validate(
    dto: ValidateKinshipDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const caso = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      select: { id: true, deceasedId: true, advisorId: true, internalCode: true },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');

    const created = await this.prisma.$transaction(async (tx) => {
      const relative = await tx.relative.create({
        data: {
          caseId: caso.id,
          deceasedId: caso.deceasedId,
          fullName: dto.fullName.trim(),
          kinship: dto.kinship,
          documentType: 'CC',
          documentNumber: dto.documentNumber?.trim() || null,
          city: dto.city,
          observations:
            dto.observations ??
            'Parentesco validado desde motor de cruce IA/consanguinidad',
          contactStatus: 'SIN_CONTACTAR',
          advisorId: caso.advisorId ?? user.id,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: caso.id,
          userId: user.id,
          type: ActivityType.SYSTEM,
          title: 'Parentesco validado (cruce de bases)',
          description: `${relative.fullName} · ${relative.kinship}`,
          metadata: {
            relativeId: relative.id,
            relationId: dto.relationId,
            source: 'KINSHIP_ENGINE',
          },
        },
      });

      await tx.case.update({
        where: { id: caso.id },
        data: { lastActivityAt: new Date() },
      });

      return relative;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.HEREDERO_CREADO,
      entidadAfectada: AuditEntity.HEREDERO,
      entidadId: created.id,
      caseId: caso.id,
      newData: {
        fullName: created.fullName,
        kinship: created.kinship,
        fromKinshipEngine: true,
        relationId: dto.relationId,
      },
      ipAddress: ip,
    });

    return created;
  }

  mapLabelToKinship(label: string): KinshipType {
    return LABEL_TO_KINSHIP[label] ?? KinshipType.OTRO;
  }
}
