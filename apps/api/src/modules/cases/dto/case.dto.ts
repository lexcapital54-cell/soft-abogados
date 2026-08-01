import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CasePriority,
  CaseRiskLevel,
  CaseStage,
  CaseStatus,
  ActivityType,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateCaseDto {
  @IsString()
  deceasedId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  internalCode?: string;

  @IsOptional()
  @IsString()
  fileNumber?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CaseStage)
  stage?: CaseStage;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsEnum(CaseRiskLevel)
  riskLevel?: CaseRiskLevel;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recoverableValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  feesPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedFees?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  advisorId?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;
}

export class UpdateCaseDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CaseStage)
  stage?: CaseStage;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsEnum(CaseRiskLevel)
  riskLevel?: CaseRiskLevel;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recoverableValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  feesPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedFees?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectedFees?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  strategicNotes?: string;

  /** null = quitar asesor asignado */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  advisorId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  coordinatorId?: string | null;
}

export class AssignCaseDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  advisorId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  coordinatorId?: string | null;
}

export class ListCasesQueryDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CaseStage)
  stage?: CaseStage;

  @IsOptional()
  @IsString()
  advisorId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** Bitácora / compromiso */
export class CreateCaseActivityDto {
  @IsString()
  @MinLength(3)
  description!: string;

  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsOptional()
  @IsBoolean()
  createCommitment?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  commitmentTitle?: string;

  @IsOptional()
  @IsDateString()
  commitmentDueAt?: string;
}
