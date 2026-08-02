import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');

  // Con credentials:true no se puede usar Origin "*". Reflectamos el origen
  // si CORS_ORIGIN=* o listamos orígenes separados por coma.
  const corsRaw = process.env.CORS_ORIGIN ?? 'http://localhost:4200';
  const corsList = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigin =
    corsList.includes('*') || corsList.length === 0 ? true : corsList;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`LexCapital API → http://localhost:${port}/api/v1`);
}
bootstrap();
