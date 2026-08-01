import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';

export class SendCaseEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(3)
  subject!: string;

  @IsString()
  @MinLength(10)
  message!: string;

  /** IDs de Document del expediente */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  caseDocumentIds?: string[];

  /** IDs de RepositorioCorporativo */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  repoDocumentIds?: string[];
}
