import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RepoCategoria } from '@prisma/client';

export class ListRepoQueryDto {
  @IsOptional()
  @IsEnum(RepoCategoria)
  categoria?: RepoCategoria;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateRepoMetaDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsEnum(RepoCategoria)
  categoria!: RepoCategoria;
}
