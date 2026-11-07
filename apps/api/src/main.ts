import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true });
  // Security headers (hardening, P6)
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  const cfg = new DocumentBuilder()
    .setTitle('GCC-CRM API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg));
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT || 3001));
  console.log(`GCC-CRM API on http://localhost:${process.env.PORT || 3001} (OpenAPI at /api/docs)`);
}
if (process.env.NODE_ENV !== 'test') bootstrap();
