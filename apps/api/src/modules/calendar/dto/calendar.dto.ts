import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CalendarEventsQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  /** CSV de IDs de asesores (solo managers) */
  @IsOptional()
  @IsString()
  advisorIds?: string;
}

export class CalendarMoveDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
