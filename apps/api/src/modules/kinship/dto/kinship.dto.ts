import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KinshipType } from '@prisma/client';

export class AnalyzeKinshipDto {
  @IsArray()
  titulares!: Record<string, unknown>[];

  @IsArray()
  candidatos!: Record<string, unknown>[];

  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}

export class GraphForRelationDto {
  @IsObject()
  relation!: {
    titularId: string;
    familiarId: string;
    edgePath?: string[];
    degree: number;
    labelDisplay: string;
    titular: Record<string, unknown>;
    familiar: Record<string, unknown>;
  };

  @IsArray()
  titulares!: Record<string, unknown>[];

  @IsArray()
  candidatos!: Record<string, unknown>[];
}

export class ValidateKinshipDto {
  @IsString()
  caseId!: string;

  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsEnum(KinshipType)
  kinship!: KinshipType;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  relationId?: string;
}

export class PreviewNormalizeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  rows!: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  source?: 'TITULAR' | 'CANDIDATO';
}
