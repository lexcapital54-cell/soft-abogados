import {
  IsOptional,
  IsString,
} from 'class-validator';

export class ReportsQueryDto {
  /** Solo aplicable para managers; asesores lo ignoran en servicio */
  @IsOptional()
  @IsString()
  advisorId?: string;
}
