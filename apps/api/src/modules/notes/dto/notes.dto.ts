import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  contenido?: string;

  @IsOptional()
  @IsString()
  colorFondo?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  contenido?: string;

  @IsOptional()
  @IsString()
  colorFondo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}
