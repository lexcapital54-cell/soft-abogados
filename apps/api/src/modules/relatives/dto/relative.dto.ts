import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ActivityType, ContactStatus, KinshipType } from '@prisma/client';

export class CreateRelativeDto {
  @IsString()
  caseId!: string;

  @IsOptional()
  @IsString()
  deceasedId?: string;

  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsEnum(KinshipType)
  kinship!: KinshipType;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  contactStatus?: ContactStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  interestLevel?: number;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsDateString()
  slaDueAt?: string;
}

export class UpdateRelativeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(KinshipType)
  kinship?: KinshipType;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  contactStatus?: ContactStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  interestLevel?: number;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsString()
  advisorId?: string;

  @IsOptional()
  @IsDateString()
  slaDueAt?: string | null;
}

export class ContactRelativeDto {
  @IsString()
  @MinLength(3)
  note!: string;

  @IsOptional()
  @IsEnum(ActivityType)
  channel?: ActivityType;
}

/** Reagendar SLA del familiar con justificación */
export class RescheduleRelativeSlaDto {
  @IsDateString()
  slaDueAt!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
