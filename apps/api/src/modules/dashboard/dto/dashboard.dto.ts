import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CaseStage, CaseStatus } from '@prisma/client';

export enum AlertLevelFilter {
  ALL = 'ALL',
  RISK = 'RISK',
  PROCESS = 'PROCESS',
  OK = 'OK',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  advisorId?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CaseStage)
  stage?: CaseStage;

  @IsOptional()
  @IsEnum(AlertLevelFilter)
  alertLevel?: AlertLevelFilter;
}
