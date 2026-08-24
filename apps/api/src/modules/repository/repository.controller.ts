import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { RepoCategoria, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import { ListRepoQueryDto } from './dto/repository.dto';
import { RepositoryService } from './repository.service';

const REPO_MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Controller('repository')
export class RepositoryController {
  constructor(private readonly repository: RepositoryService) {}

  @Get()
  list(@Query() query: ListRepoQueryDto) {
    return this.repository.list(query);
  }

  @Get('categories')
  categories() {
    return this.repository.categories();
  }

  @Post('upload')
  @Roles(...REPO_MANAGERS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('nombre') nombre: string,
    @Body('categoria') categoria: RepoCategoria,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.repository.upload(
      file,
      nombre,
      categoria,
      user,
      clientIp(req),
    );
  }

  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, mimeType, filename } =
      await this.repository.fileDownloadStream(id);
    const safeName = filename.replace(/[\r\n"]+/g, '_');
    const asAttachment = download === '1' || download === 'true';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `${asAttachment ? 'attachment' : 'inline'}; filename="${encodeURIComponent(safeName)}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  @Roles(...REPO_MANAGERS)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.repository.deactivate(id, user, clientIp(req));
  }
}
