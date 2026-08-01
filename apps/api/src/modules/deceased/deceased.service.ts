import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateDeceasedDto, UpdateDeceasedDto } from './dto/deceased.dto';

@Injectable()
export class DeceasedService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.deceased.findMany({
      include: {
        _count: { select: { cases: true, relatives: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.deceased.findUnique({
      where: { id },
      include: {
        relatives: true,
        cases: {
          select: {
            id: true,
            internalCode: true,
            status: true,
            stage: true,
            recoverableValue: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Fallecido no encontrado');
    }
    return row;
  }

  async create(dto: CreateDeceasedDto) {
    const documentNumber = dto.documentNumber.trim();
    const exists = await this.prisma.deceased.findUnique({
      where: { documentNumber },
    });
    if (exists) {
      throw new ConflictException('Ya existe un fallecido con esa cédula');
    }
    return this.prisma.deceased.create({
      data: {
        documentNumber,
        documentType: dto.documentType ?? 'CC',
        fullName: dto.fullName.trim(),
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        deathDate: dto.deathDate ? new Date(dto.deathDate) : undefined,
        deathPlace: dto.deathPlace,
        city: dto.city,
        department: dto.department,
        maritalStatus: dto.maritalStatus,
        profession: dto.profession,
        lastAddress: dto.lastAddress,
        observations: dto.observations,
      },
    });
  }

  async update(id: string, dto: UpdateDeceasedDto) {
    await this.findOne(id);
    return this.prisma.deceased.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        deathDate: dto.deathDate ? new Date(dto.deathDate) : undefined,
        deathPlace: dto.deathPlace,
        city: dto.city,
        department: dto.department,
        maritalStatus: dto.maritalStatus,
        profession: dto.profession,
        lastAddress: dto.lastAddress,
        observations: dto.observations,
      },
    });
  }
}
