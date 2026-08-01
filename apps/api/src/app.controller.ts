import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/auth.decorators';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): { name: string; phase: string; status: string } {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  health(): { ok: boolean; service: string } {
    return { ok: true, service: 'lexcapital-api' };
  }
}
