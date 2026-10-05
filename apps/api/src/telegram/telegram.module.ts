import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelegramClient } from './telegram.client';
import { TelegramController, TelegramWebhookController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Global()
@Module({ imports: [AuthModule], providers: [TelegramClient, TelegramService], controllers: [TelegramController, TelegramWebhookController], exports: [TelegramService] })
export class TelegramModule {}