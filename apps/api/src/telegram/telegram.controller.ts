import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TelegramService } from './telegram.service';

@Controller('v1/telegram')
@UseGuards(AuthGuard)
export class TelegramController {
  constructor(@Inject(TelegramService) private readonly telegram: TelegramService) {}
  @Get('status') status(@CurrentUser() id: string) { return this.telegram.status(id); }
  @Get('notifications') inbox(@CurrentUser() id: string) { return this.telegram.inbox(id); }
  @Post('notifications/access') access(@CurrentUser() id: string) { return this.telegram.notificationAccess(id); }
  @Post('notifications/:notificationId/read') read(@CurrentUser() id: string, @Param('notificationId') notificationId: string) { return this.telegram.markRead(id, notificationId); }
  @Post('chats') link(@CurrentUser() id: string, @Body() body: unknown) { return this.telegram.linkChat(id, body); }
  @Get('polls/:hoodId') polls(@CurrentUser() id: string, @Param('hoodId') hoodId: string) { return this.telegram.polls(id, hoodId); }
  @Post('polls') poll(@CurrentUser() id: string, @Body() body: unknown) { return this.telegram.createPoll(id, body); }
  @Get('notes/:businessId') notes(@CurrentUser() id: string, @Param('businessId') businessId: string) { return this.telegram.notes(id, businessId); }
  @Post('notes/:businessId') saveNote(@CurrentUser() id: string, @Param('businessId') businessId: string, @Body() body: unknown) { return this.telegram.saveNote(id, businessId, body); }
  @Post('invoice') invoice(@CurrentUser() id: string, @Body() body: unknown) { return this.telegram.invoice(id, body); }
  @Post('refund') refund(@CurrentUser() id: string, @Body() body: unknown) { return this.telegram.refund(id, body); }
}

@Controller('v1/telegram')
@SkipThrottle()
export class TelegramWebhookController {
  constructor(@Inject(TelegramService) private readonly telegram: TelegramService) {}
  @Post('webhook') webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) { return this.telegram.webhook(secret, body); }
}