import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DocumentCategory, DocumentStatus } from '@prisma/client';

export class UploadDocumentDto {
  @IsString()
  caseId!: string;

  /** Etiqueta libre si no hay documentId de checklist */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tipoDocumento?: string;

  /** ID de fila del checklist a completar */
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsString()
  relativeId?: string;

  @IsOptional()
  @IsString()
  slaDueAt?: string;
}

export class ListDocumentsQueryDto {
  @IsString()
  caseId!: string;
}

export class UpdateDocumentStatusDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;
}
