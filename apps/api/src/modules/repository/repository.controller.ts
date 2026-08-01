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
import { RepoCategoria } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { clientIp } from '../../common/utils/client-ip';
import { ListRepoQueryDto } from './dto/repository.dto';
import { RepositoryService } from './repository.service';

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
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, mimeType, filename } =
      await this.repository.fileStream(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.repository.deactivate(id, user, clientIp(req));
  }
}
