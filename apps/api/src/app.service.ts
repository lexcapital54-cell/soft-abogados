import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { name: string; phase: string; status: string } {
    return {
      name: 'LexCapital Group API',
      phase: '3-auth-crud',
      status: 'ok',
    };
  }
}
