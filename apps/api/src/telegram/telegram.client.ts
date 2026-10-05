import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Api } from 'grammy';
import { APP_CONFIG, type AppConfig } from '../config';

@Injectable()
export class TelegramClient {
  private readonly client: Api | undefined;
  constructor(@Inject(APP_CONFIG) config: AppConfig) { if (config.TELEGRAM_ENABLED === 'true') this.client = new Api(config.BOT_TOKEN, { timeoutSeconds: 8 }); }
  get api() { if (!this.client) throw new ServiceUnavailableException('Telegram is not connected yet.'); return this.client; }
}