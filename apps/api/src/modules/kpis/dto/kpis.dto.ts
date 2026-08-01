import { IsDateString, IsOptional, IsString } from 'class-validator';

export class KpisQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Drill-down a un asesor (opcional) */
  @IsOptional()
  @IsString()
  advisorId?: string;
}
