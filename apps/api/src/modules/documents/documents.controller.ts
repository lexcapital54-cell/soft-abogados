import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DocumentsService } from './documents.service';
import {
  ListDocumentsQueryDto,
  UpdateDocumentStatusDto,
  UploadDocumentDto,
} from './dto/document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  /** Lista plana (compat) */
  @Get()
  list(
    @Query() query: ListDocumentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentsService.listByCase(query.caseId, user);
  }

  /** Checklist agrupado + progreso */
  @Get('checklist')
  checklist(
    @Query() query: ListDocumentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentsService.listByCaseGrouped(query.caseId, user);
  }

  /** Precarga automática de documentos PENDIENTE */
  @Post('checklist/ensure')
  ensure(
    @Body() body: { caseId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentsService.ensureChecklist(body.caseId, user);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentsService.upload(file, dto, user, clientIp(req));
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentStatusDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentsService.updateStatus(
      id,
      dto.status,
      user,
      clientIp(req),
    );
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentsService.remove(id, user, clientIp(req));
  }

  @Get('file')
  file(@Query('key') key: string, @Res({ passthrough: true }) res: Response) {
    if (!key || key.includes('..')) {
      throw new NotFoundException('Archivo no encontrado');
    }
    const absolute = this.storage.resolveAbsolute(key);
    if (!existsSync(absolute)) {
      throw new NotFoundException('Archivo no encontrado');
    }
    const stream = createReadStream(absolute);
    const name = key.split('/').pop() ?? 'documento';
    const lower = name.toLowerCase();
    const mime =
      lower.endsWith('.pdf')
        ? 'application/pdf'
        : lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
              ? 'image/jpeg'
              : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${name.replace(/"/g, '')}"`,
    );
    return new StreamableFile(stream);
  }
}
