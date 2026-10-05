import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '20kb' });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({ origin: config.WEB_ORIGIN, methods: ['GET', 'POST'] });
  app.enableShutdownHooks();
  await app.listen(config.PORT, config.HOST);
}
void bootstrap().catch(error => { console.error('API startup failed:', error.message); process.exitCode = 1; });